// api/get-transaction.js
// GET /api/get-transaction?order_id=xxx
// Public endpoint (tidak perlu auth) — hanya return data yg aman

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: 'order_id wajib' });

  const { data: trx } = await supabaseAdmin
    .from('transactions')
    .select('order_id, amount, total_payment, status, payment_method, qr_string, expired_at, completed_at, created_at')
    .eq('order_id', order_id)
    .maybeSingle();

  if (!trx) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

  return res.status(200).json(trx);
}
