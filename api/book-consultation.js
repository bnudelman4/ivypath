const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

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

    // --- Google Calendar with domain-wide delegation ---
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      return res.status(500).json({ error: 'Google Calendar not configured. Please contact support.' });
    }

    let serviceAccountKey;
    try {
      serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } catch (parseErr) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', parseErr.message);
      return res.status(500).json({ error: 'Google Calendar configuration error.' });
    }

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
      summary: `IvyPath Academy - Free Consultation`,
      description: `Free 15-minute consultation with IvyPath Academy.\n\nStudent/Parent: ${name}\nEmail: ${email}`,
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

    let createdEvent;
    try {
      const result = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
      });
      createdEvent = result.data;
    } catch (calErr) {
      console.error('Google Calendar insert error:', calErr.message, calErr.response?.data);
      return res.status(500).json({
        error: 'Failed to create calendar event.',
        detail: calErr.message,
      });
    }

    const meetLink = createdEvent.hangoutLink || '';

    // Format date for response
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const formattedDate = `${dayNames[dateObj.getDay()]}, ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;

    res.json({
      success: true,
      date: formattedDate,
      time: time,
      email: email,
      meetLink: meetLink,
      eventLink: createdEvent.htmlLink || '',
    });
  } catch (err) {
    console.error('Booking error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to create booking: ' + err.message });
  }
};
