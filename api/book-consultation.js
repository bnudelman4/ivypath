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
    let endMins = mins + 15;
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
        summary: `IvyPath Academy - Free Consultation${ref ? ' [ref: ' + ref + ']' : ''}`,
        description: `Free 15-minute consultation with IvyPath Academy.\n\nStudent/Parent: ${name}\nEmail: ${email}\nPhone: ${phone}`,
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
