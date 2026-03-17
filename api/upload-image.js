// api/upload-image.js
// POST /api/upload-image
// Headers: Authorization: Bearer <token>
// Body: { image: "data:image/...;base64,...", type: "avatar", filename: "foto.jpg" }

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

  const { image, type, filename } = req.body || {};
  if (!image || !type) return res.status(400).json({ error: 'Data tidak lengkap' });
  if (!['avatar'].includes(type)) return res.status(400).json({ error: 'Tipe tidak valid' });

  // Decode base64
  const matches = image.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Format gambar tidak valid' });

  const mimeType   = matches[1];
  const base64Data = matches[2];
  const buffer     = Buffer.from(base64Data, 'base64');

  // Batasi ukuran 2MB
  if (buffer.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'Ukuran maksimal 2 MB' });

  const ext      = mimeType.split('/')[1] || 'jpg';
  const filePath = `${type}/${user.id}.${ext}`;

  // Upload ke Supabase Storage bucket "avatars"
  const { error: uploadErr } = await supabaseAdmin.storage
    .from('avatars')
    .upload(filePath, buffer, {
      contentType:  mimeType,
      upsert:       true // overwrite kalau sudah ada
    });

  if (uploadErr) return res.status(500).json({ error: 'Gagal upload: ' + uploadErr.message });

  // Ambil public URL
  const { data: urlData } = supabaseAdmin.storage
    .from('avatars')
    .getPublicUrl(filePath);

  const publicUrl = urlData.publicUrl;

  // Simpan URL ke profile
  await supabaseAdmin
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);

  return res.status(200).json({ url: publicUrl });
}
