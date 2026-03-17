// api/user.js
// GET /api/user
// Headers: Authorization: Bearer <token>

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Session tidak valid' });

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('id, username, coins, avatar_url, created_at')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) return res.status(404).json({ error: 'Profil tidak ditemukan' });

  return res.status(200).json(profile);
}
