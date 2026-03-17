// api/cancel-payment.js
// POST /api/cancel-payment
// Headers: Authorization: Bearer <token>
// Body: { order_id }

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PAKASIR_PROJECT = process.env.PAKASIR_PROJECT;
const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  const { order_id } = req.body || {};
  if (!order_id) return res.status(400).json({ error: 'order_id wajib diisi' });

  // Ambil transaksi
  const { data: trx } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('order_id', order_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!trx)                    return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  if (trx.status !== 'pending') return res.status(400).json({ error: 'Transaksi sudah ' + trx.status });

  // Cancel di Pakasir
  try {
    await fetch('https://app.pakasir.com/api/transactioncancel', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project:  PAKASIR_PROJECT,
        order_id: order_id,
        amount:   trx.amount,
        api_key:  PAKASIR_API_KEY
      })
    });
  } catch (e) {
    // Tetap lanjut update DB walau Pakasir timeout
  }

  // Update status di DB
  await supabaseAdmin
    .from('transactions')
    .update({ status: 'cancelled' })
    .eq('order_id', order_id);

  return res.status(200).json({ message: 'Transaksi dibatalkan' });
}
