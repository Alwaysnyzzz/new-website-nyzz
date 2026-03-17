// api/auth/login.js
// POST /api/auth/login
// Body: { username, password }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });

  // Cari user berdasarkan username
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', username.toLowerCase().trim())
    .maybeSingle();

  if (!profile) return res.status(401).json({ error: 'Username atau password salah' });

  // Login dengan email dummy
  const fakeEmail = `${profile.username}@nyzz.internal`;
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email:    fakeEmail,
    password: password
  });

  if (signInErr) return res.status(401).json({ error: 'Username atau password salah' });

  return res.status(200).json({ session: signInData.session });
}
