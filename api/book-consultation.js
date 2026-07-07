const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Build a date label once so every response (success OR calendar-failure) is consistent.
  const formatDateLabel = (dateStr) => {
    const parts = String(dateStr).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
    const [year, month, day] = parts;
    const dateObj = new Date(year, month - 1, day);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${dayNames[dateObj.getDay()]}, ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
  };

  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const time = typeof body.time === 'string' ? body.time.trim() : '';
    const ref = typeof body.ref === 'string' ? body.ref.trim().slice(0,64) : '';
    // Booking variants: default 15-min consult (book.html) vs the 30-min
    // college-consulting strategy call (/consulting).
    const isConsulting = body.type === 'consulting-strategy';
    const eventId = typeof body.eventId === 'string' && body.eventId.length > 0 && body.eventId.length <= 64
      ? body.eventId : '';
    const grade = typeof body.grade === 'string' ? body.grade.trim().slice(0, 20) : '';

    // --- Validate inputs ---
    if (!name || !email || !phone || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields: name, email, phone, date, time' });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const phoneDigits = (phone.match(/\d/g) || []).length;
    if (phoneDigits < 7) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (!dateOk) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // --- Parse date and time ---
    const timeParts = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!timeParts) return res.status(400).json({ error: 'Invalid time format' });

    let hours = parseInt(timeParts[1]);
    const mins = parseInt(timeParts[2]);
    const ampm = timeParts[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const startDT = `${date}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;

    let endHours = hours;
    let endMins = mins + (isConsulting ? 30 : 15);
    if (endMins >= 60) {
      endMins -= 60;
      endHours += 1;
    }
    const endDT = `${date}T${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00`;

    const formattedDate = formatDateLabel(date);

    // A real lead has arrived. From here on we NEVER 500 just because the
    // calendar write fails — we acknowledge the lead and flag calendar status.
    let calendarOk = false;
    let meetLink = '';
    let eventLink = '';

    try {
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not configured');
      }

      const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

      // Impersonate info@ivypathacademy.com via domain-wide delegation
      const subject = process.env.GOOGLE_CALENDAR_SUBJECT || 'info@ivypathacademy.com';
      const auth = new google.auth.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
        ],
        subject: subject,
      });

      const calendar = google.calendar({ version: 'v3', auth });

      const event = {
        summary: isConsulting
          ? `IvyPath Academy - College Consulting Strategy Call${ref ? ' [ref: ' + ref + ']' : ''}`
          : `IvyPath Academy - Free Consultation${ref ? ' [ref: ' + ref + ']' : ''}`,
        description: isConsulting
          ? `Free 30-minute college consulting strategy call.\n\nParent: ${name}\nEmail: ${email}\nPhone: ${phone}${grade ? '\nStudent grade: ' + grade : ''}\n\nConsultants: Alp / Edison. Review profile, honest read, roadmap sketch.`
          : `Free 15-minute consultation with IvyPath Academy.\n\nStudent/Parent: ${name}\nEmail: ${email}\nPhone: ${phone}`,
        start: {
          dateTime: startDT,
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: endDT,
          timeZone: 'America/New_York',
        },
        attendees: [
          { email: email },
        ],
        conferenceData: {
          createRequest: {
            requestId: uuidv4(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 30 },
            { method: 'popup', minutes: 10 },
          ],
        },
      };

      const result = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
      });

      const createdEvent = result.data || {};
      meetLink = createdEvent.hangoutLink || '';
      eventLink = createdEvent.htmlLink || '';
      calendarOk = true;
    } catch (calErr) {
      // Calendar failed (missing key, parse error, API error, etc.).
      // Log it for follow-up, but DO NOT lose the lead — return success.
      console.error(
        'Calendar write failed (lead preserved):',
        calErr && calErr.message,
        calErr && calErr.response && calErr.response.data
      );
      calendarOk = false;
    }

    // Branded confirmation email via Resend (matches the platform's email brand
    // system: forest #1B4D3E / gold #C5A55A, Playfair/Inter stacks, same from-
    // address). Google Calendar's generic invite still goes out via sendUpdates;
    // this is the on-brand touch. No-ops without RESEND_API_KEY; never blocks.
    if (process.env.RESEND_API_KEY) {
      try {
        const label = isConsulting ? 'strategy call' : 'consultation';
        const duration = isConsulting ? '30 minutes' : '15 minutes';
        const firstName = (name.split(/\s+/)[0] || name);
        const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const meetRow = meetLink
          ? `<tr><td align="center" style="padding:8px 0 20px;"><a href="${esc(meetLink)}" style="display:inline-block;background:#C5A55A;color:#0F1C2E;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:8px;">Join on Google Meet</a></td></tr>`
          : '';
        const consultingSteps = isConsulting
          ? `<tr><td style="padding:0 32px 8px;"><p style="margin:0 0 8px;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#C5A55A;">What happens on the call</p><p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.7;color:#636E72;">A consultant reviews where your student is today, gives you an honest read on what&rsquo;s strong and what&rsquo;s missing, and sketches the roadmap we&rsquo;d build. If it&rsquo;s not a fit, you keep the roadmap.</p></td></tr>`
          : '';
        const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#F7FAF8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAF8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid #E8EDEB;border-radius:12px;overflow:hidden;">
<tr><td style="background:#1B4D3E;padding:22px 32px;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:700;color:#FFFFFF;">IvyPath Academy</span></td></tr>
<tr><td style="padding:32px 32px 8px;"><h1 style="margin:0 0 6px;font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:#1B4D3E;">Your ${label} is booked, ${esc(firstName)}.</h1>
<p style="margin:0 0 18px;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#2D3436;">We&rsquo;re looking forward to speaking with you.</p></td></tr>
<tr><td style="padding:0 32px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAF8;border:1px solid #E8EDEB;border-radius:8px;"><tr><td style="padding:16px 20px;">
<p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#1B4D3E;">${esc(formattedDate)} at ${esc(time)} ET</p>
<p style="margin:4px 0 0;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:13px;color:#636E72;">${duration} &middot; Google Meet${calendarOk ? ' &middot; calendar invite sent to ' + esc(email) : ''}</p>
</td></tr></table></td></tr>
${meetRow}
${consultingSteps}
<tr><td style="padding:16px 32px 28px;"><p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:13px;line-height:1.7;color:#636E72;">Need to reschedule? Reply to this email or call/text <a href="tel:+19293940349" style="color:#1B4D3E;font-weight:600;text-decoration:none;">(929) 394-0349</a> &middot; English &amp; <span lang="zh">中文</span></p></td></tr>
<tr><td style="background:#0B1D14;padding:18px 32px;"><p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:12px;line-height:1.6;color:#7A9E8F;">IvyPath Academy &middot; operated by Perevalis Tutoring LLC<br>You received this email because you booked a free ${label} at ivypathacademy.com.</p></td></tr>
</table></td></tr></table></body></html>`;
        await Promise.race([
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
            body: JSON.stringify({
              from: 'IvyPath Academy <noreply@ivypathacademy.com>',
              to: email,
              subject: `Your ${label} is booked — ${formattedDate} at ${time} ET`,
              html: html,
            }),
          }).catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      } catch (mailErr) {
        // Never fail a booking over a confirmation email.
      }
    }

    // Consulting bookings: relay the StrategyCallBooked conversion server-side
    // (browser fires the pixel with the SAME eventId — Meta dedups on event_id).
    // Adblock-proof and never blocks the booking response for long.
    if (isConsulting && eventId) {
      try {
        await Promise.race([
          fetch('https://app.ivypathacademy.com/api/track/strategy-call-booked', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: eventId, sourceUrl: 'https://www.ivypathacademy.com/consulting' }),
          }).catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (relayErr) {
        // Never fail a booking over conversion tracking.
      }
    }

    // Always acknowledge the lead with 200 so the client never sees a failure.
    return res.status(200).json({
      ok: true,
      calendar: calendarOk,
      // Legacy fields kept for the existing client redirect + thank-you.html.
      success: true,
      date: formattedDate,
      time: time,
      email: email,
      meetLink: meetLink,
      eventLink: eventLink,
    });
  } catch (err) {
    // Unexpected error BEFORE we could capture a usable lead.
    console.error('Booking error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to create booking: ' + err.message });
  }
};
