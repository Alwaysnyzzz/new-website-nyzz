// api/delete-photo.js
// POST /api/delete-photo
// Headers: Authorization: Bearer <token>
// Body: { type: "avatar" }

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  const { type } = req.body || {};
  if (type !== 'avatar') return res.status(400).json({ error: 'Tipe tidak valid' });

  // Hapus semua ekstensi yang mungkin
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    await supabaseAdmin.storage.from('avatars').remove([`avatar/${user.id}.${ext}`]);
  }

  // Set null di profile
  await supabaseAdmin.from('profiles').update({ avatar_url: null }).eq('id', user.id);

  return res.status(200).json({ message: 'Foto dihapus' });
}
