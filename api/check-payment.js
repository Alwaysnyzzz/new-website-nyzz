// api/check-payment.js
// GET /api/check-payment?order_id=xxx
// Headers: Authorization: Bearer <token>

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PAKASIR_PROJECT = process.env.PAKASIR_PROJECT;
const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  const orderId = req.query.order_id;
  if (!orderId) return res.status(400).json({ error: 'order_id wajib diisi' });

  // Ambil transaksi dari DB
  const { data: trx } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('order_id', orderId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!trx) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

  // Kalau sudah completed/cancelled, return langsung dari DB
  if (trx.status !== 'pending') {
    return res.status(200).json({ status: trx.status, order_id: orderId });
  }

  // Cek ke Pakasir
  let pakasirData;
  try {
    const r = await fetch(
      `https://app.pakasir.com/api/transactiondetail?project=${PAKASIR_PROJECT}&amount=${trx.amount}&order_id=${orderId}&api_key=${PAKASIR_API_KEY}`
    );
    pakasirData = await r.json();
  } catch (e) {
    return res.status(502).json({ error: 'Gagal cek ke payment gateway' });
  }

  const status = pakasirData?.transaction?.status;

  // Kalau completed, update DB dan tambah coins ke user
  if (status === 'completed') {
    await supabaseAdmin.from('transactions').update({
      status:       'completed',
      completed_at: pakasirData.transaction.completed_at || new Date().toISOString()
    }).eq('order_id', orderId);

    // Tambah coins
    await supabaseAdmin.rpc('add_coins', {
      p_user_id: user.id,
      p_amount:  trx.amount
    });
  }

  return res.status(200).json({ status: status || 'pending', order_id: orderId });
}
