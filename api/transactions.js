// api/transactions.js
// GET /api/transactions
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

  const { data, error: trxErr } = await supabaseAdmin
    .from('transactions')
    .select('id, order_id, amount, fee, total_payment, status, payment_method, type, created_at, completed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (trxErr) return res.status(500).json({ error: 'Gagal mengambil data transaksi' });

  return res.status(200).json(data || []);
}
