import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  if (req.body?.type !== 'avatar') return res.status(400).json({ error: 'Tipe tidak valid' });

  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    await supabase.storage.from('avatars').remove([`avatar/${user.id}.${ext}`]);
  }
  await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);

  return res.status(200).json({ message: 'Foto dihapus' });
}
