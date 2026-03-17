import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { username, password } = req.body || {};
  if (!username || !password)          return res.status(400).json({ error: 'Username dan password wajib diisi' });
  if (username.length < 3)             return res.status(400).json({ error: 'Username minimal 3 karakter' });
  if (!/^[a-z0-9_]+$/.test(username))  return res.status(400).json({ error: 'Username hanya huruf kecil, angka, underscore' });
  if (password.length < 6)             return res.status(400).json({ error: 'Password minimal 6 karakter' });

  const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
  if (existing) return res.status(400).json({ error: 'Username sudah dipakai' });

  const fakeEmail = `${username}@nyzz.internal`;
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: fakeEmail, password, email_confirm: true
  });
  if (authErr) return res.status(400).json({ error: authErr.message });

  const { error: profileErr } = await supabase.from('profiles').insert({
    id: authData.user.id, username, coins: 0
  });
  if (profileErr) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: 'Gagal membuat profil' });
  }

  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: fakeEmail, password
  });
  if (signInErr) return res.status(500).json({ error: 'Akun dibuat tapi gagal login otomatis' });

  return res.status(200).json({ session: signInData.session });
}
