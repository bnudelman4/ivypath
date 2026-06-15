// Returns amount + currency for a completed Stripe Checkout session so
// success.html can report real purchase value to Google Ads / Meta.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({
      amount_total: session.amount_total,
      currency: (session.currency || 'usd').toUpperCase(),
      payment_status: session.payment_status,
      transaction_id: session.id
    });
  } catch (err) {
    console.error('Stripe session lookup failed:', err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
};
