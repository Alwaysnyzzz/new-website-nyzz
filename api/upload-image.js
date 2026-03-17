import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  const { image, type } = req.body || {};
  if (!image || type !== 'avatar') return res.status(400).json({ error: 'Data tidak valid' });

  const matches = image.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Format gambar tidak valid' });

  const mimeType = matches[1];
  const buffer   = Buffer.from(matches[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'Ukuran maksimal 2 MB' });

  const ext      = mimeType.split('/')[1] || 'jpg';
  const filePath = `avatar/${user.id}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from('avatars')
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });
  if (uploadErr) return res.status(500).json({ error: 'Gagal upload: ' + uploadErr.message });

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
  await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', user.id);

  return res.status(200).json({ url: urlData.publicUrl });
}
