const { google } = require('googleapis');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email, date, time } = req.body;

    if (!name || !email || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields: name, email, date, time' });
    }

    // --- Parse date and time ---
    // date = "2026-04-14", time = "5:30 PM"
    const timeParts = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!timeParts) return res.status(400).json({ error: 'Invalid time format' });

    let hours = parseInt(timeParts[1]);
    const mins = parseInt(timeParts[2]);
    const ampm = timeParts[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    // Build ISO datetime strings in ET
    const startDT = `${date}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
    const endDate = new Date(`${startDT}-05:00`); // approximate ET offset for parsing
    endDate.setMinutes(endDate.getMinutes() + 15);
    const endHours = endDate.getHours();
    const endMins = endDate.getMinutes();
    const endDT = `${date}T${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00`;

    // --- Create Zoom meeting ---
    let zoomLink = '';
    try {
      zoomLink = await createZoomMeeting(name, startDT, date);
    } catch (zoomErr) {
      console.error('Zoom API error:', zoomErr.message);
      // Continue without Zoom link — still create the calendar event
      zoomLink = 'Zoom link will be sent separately';
    }

    // --- Create Google Calendar event ---
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: 'IvyPath Academy - Free Consultation',
      description: `Free 15-minute consultation with IvyPath Academy.\n\nStudent/Parent: ${name}\nEmail: ${email}\n\nZoom Link: ${zoomLink}`,
      location: zoomLink,
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
        { email: 'ivypathacademy@gmail.com' },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'popup', minutes: 10 },
        ],
      },
      conferenceData: zoomLink.startsWith('http') ? undefined : undefined,
    };

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    await calendar.events.insert({
      calendarId,
      resource: event,
      sendUpdates: 'all', // sends email invites to attendees
    });

    // Format date for response
    const dateObj = new Date(`${date}T12:00:00`);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const formattedDate = `${dayNames[dateObj.getDay()]}, ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;

    res.json({
      success: true,
      date: formattedDate,
      time: time,
      email: email,
      zoomLink: zoomLink,
    });
  } catch (err) {
    console.error('Booking error:', err.message);
    res.status(500).json({ error: 'Failed to create booking. Please try again.' });
  }
};

// --- Zoom Server-to-Server OAuth ---
async function createZoomMeeting(name, startDT, dateStr) {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom credentials not configured');
  }

  // Get access token
  const tokenRes = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=account_credentials&account_id=${accountId}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Zoom token error: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Create meeting
  const meetingRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: `IvyPath Academy - Consultation with ${name}`,
      type: 2, // scheduled meeting
      start_time: `${startDT}`,
      duration: 15,
      timezone: 'America/New_York',
      settings: {
        join_before_host: true,
        waiting_room: false,
        auto_recording: 'none',
      },
    }),
  });

  if (!meetingRes.ok) {
    const errText = await meetingRes.text();
    throw new Error(`Zoom meeting error: ${errText}`);
  }

  const meetingData = await meetingRes.json();
  return meetingData.join_url;
}
