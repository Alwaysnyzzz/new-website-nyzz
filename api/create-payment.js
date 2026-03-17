import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  const amount = parseInt(req.body?.amount);
  if (!amount || amount < 10000)  return res.status(400).json({ error: 'Minimal top up Rp 10.000' });
  if (amount > 10000000)          return res.status(400).json({ error: 'Maksimal top up Rp 10.000.000' });

  const orderId = `NYZZ-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  let pakasirData;
  try {
    const pakasirRes = await fetch('https://app.pakasir.com/api/transactioncreate/qris', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project:  process.env.PAKASIR_PROJECT,
        order_id: orderId,
        amount:   amount,
        api_key:  process.env.PAKASIR_API_KEY
      })
    });
    pakasirData = await pakasirRes.json();
  } catch (e) {
    return res.status(502).json({ error: 'Gagal menghubungi payment gateway' });
  }

  if (!pakasirData?.payment?.payment_number) {
    return res.status(502).json({ error: pakasirData?.message || 'Respons payment gateway tidak valid' });
  }

  const p = pakasirData.payment;
  const { error: insertErr } = await supabase.from('transactions').insert({
    user_id: user.id, order_id: orderId, amount,
    fee: p.fee || 0, total_payment: p.total_payment || amount,
    status: 'pending', payment_method: 'qris',
    qr_string: p.payment_number, expired_at: p.expired_at, type: 'isisaldo'
  });
  if (insertErr) return res.status(500).json({ error: 'Gagal menyimpan transaksi' });

  return res.status(200).json({
    order_id: orderId, amount, fee: p.fee || 0,
    total_payment: p.total_payment || amount,
    qr_string: p.payment_number, expired_at: p.expired_at
  });
}
