import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { amount, order_id, status, payment_method, completed_at } = req.body || {};
  if (!order_id || !amount || status !== 'completed') return res.status(200).json({ ok: false });

  const { data: trx } = await supabase.from('transactions').select('*').eq('order_id', order_id).maybeSingle();
  if (!trx) return res.status(200).json({ ok: false, reason: 'not found' });
  if (Number(trx.amount) !== Number(amount)) return res.status(200).json({ ok: false, reason: 'amount mismatch' });
  if (trx.status === 'completed') return res.status(200).json({ ok: true, reason: 'already completed' });

  await supabase.from('transactions').update({
    status: 'completed',
    payment_method: payment_method || 'qris',
    completed_at: completed_at || new Date().toISOString()
  }).eq('order_id', order_id);

  await supabase.rpc('add_coins', { p_user_id: trx.user_id, p_amount: trx.amount });

  return res.status(200).json({ ok: true });
}
