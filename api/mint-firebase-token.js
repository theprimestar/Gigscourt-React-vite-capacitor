const admin = require('firebase-admin');

// Parse the service account from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the Supabase JWT from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Supabase token' });
    }

    const supabaseToken = authHeader.split('Bearer ')[1];

    // Verify the Supabase JWT
    const supabaseUrl = process.env.SUPABASE_URL || 'https://jyvkbhbkziyitfzehoxi.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MA8q_7DYgqliOz-HKZofYg_CzGnE6Ol';

    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${supabaseToken}`,
        'apikey': supabaseKey,
      },
    });

    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid Supabase token' });
    }

    const userData = await verifyRes.json();
    const supabaseUserId = userData.id;

    // Create Firebase custom token with the Supabase user ID as the UID
    const firebaseToken = await admin.auth().createCustomToken(supabaseUserId);

    return res.status(200).json({ token: firebaseToken });
  } catch (error) {
    console.error('Error minting Firebase token:', error);
    return res.status(500).json({ error: error.message });
  }
};
