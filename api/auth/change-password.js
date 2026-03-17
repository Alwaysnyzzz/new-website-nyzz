// api/auth/change-password.js
// POST /api/auth/change-password
// Headers: Authorization: Bearer <token>
// Body: { old_password, new_password }

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ error: 'Semua field wajib diisi' });
  if (new_password.length < 6)        return res.status(400).json({ error: 'Password baru minimal 6 karakter' });

  // Verifikasi token
  const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  // Verifikasi old password dengan mencoba sign in
  const { error: verifyErr } = await supabaseAdmin.auth.signInWithPassword({
    email:    user.email,
    password: old_password
  });
  if (verifyErr) return res.status(401).json({ error: 'Password lama salah' });

  // Update password
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: new_password
  });
  if (updateErr) return res.status(500).json({ error: 'Gagal mengubah password' });

  return res.status(200).json({ message: 'Password berhasil diubah' });
}
