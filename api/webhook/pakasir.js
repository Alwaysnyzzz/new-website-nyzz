// api/webhook/pakasir.js
// POST /api/webhook/pakasir
// Dipanggil otomatis oleh Pakasir saat pembayaran berhasil
// Set URL ini di dashboard Pakasir → Edit Proyek → Webhook URL:
//   https://yourdomain.vercel.app/api/webhook/pakasir

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { amount, order_id, project, status, payment_method, completed_at } = req.body || {};

  // Validasi basic
  if (!order_id || !amount || status !== 'completed') {
    return res.status(200).json({ ok: false, reason: 'ignored' });
  }

  // Cari transaksi di DB
  const { data: trx } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('order_id', order_id)
    .maybeSingle();

  if (!trx) return res.status(200).json({ ok: false, reason: 'not found' });

  // Validasi amount cocok (keamanan)
  if (Number(trx.amount) !== Number(amount)) {
    return res.status(200).json({ ok: false, reason: 'amount mismatch' });
  }

  // Kalau sudah completed, skip (idempotent)
  if (trx.status === 'completed') return res.status(200).json({ ok: true, reason: 'already completed' });

  // Update status transaksi
  await supabaseAdmin
    .from('transactions')
    .update({
      status:         'completed',
      payment_method: payment_method || 'qris',
      completed_at:   completed_at || new Date().toISOString()
    })
    .eq('order_id', order_id);

  // Tambah coins ke user
  await supabaseAdmin.rpc('add_coins', {
    p_user_id: trx.user_id,
    p_amount:  trx.amount
  });

  return res.status(200).json({ ok: true });
}
