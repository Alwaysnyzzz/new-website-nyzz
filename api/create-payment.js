// api/create-payment.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  const amount = parseInt(req.body?.amount);
  if (!amount || amount < 500)   return res.status(400).json({ error: 'Minimal top up Rp 500' });
  if (amount > 10000000)         return res.status(400).json({ error: 'Maksimal top up Rp 10.000.000' });

  const orderId = `NYZZ-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  // Buat transaksi ke Pakasir
  let pakasirData;
  try {
    const pakasirRes = await fetch('https://app.pakasir.com/api/transactioncreate/qris', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project:  process.env.PAKASIR_PROJECT,
        order_id: orderId,
        amount:   amount,
        api_key:  process.env.PAKASIR_API_KEY
      })
    });
    pakasirData = await pakasirRes.json();
    console.log('Pakasir response:', JSON.stringify(pakasirData));
  } catch (e) {
    console.error('Pakasir fetch error:', e.message);
    return res.status(502).json({ error: 'Gagal menghubungi payment gateway' });
  }

  // Ambil qr_string — coba beberapa kemungkinan field nama
  const qrString = pakasirData?.payment?.payment_number
    || pakasirData?.payment?.qr_string
    || pakasirData?.payment?.qris_string
    || pakasirData?.data?.payment_number
    || pakasirData?.qr_string
    || null;

  if (!qrString) {
    console.error('No qr_string found. Pakasir response:', JSON.stringify(pakasirData));
    return res.status(502).json({
      error: 'QR tidak tersedia dari payment gateway',
      debug: pakasirData // tampilkan di log Vercel
    });
  }

  const p          = pakasirData.payment || pakasirData.data || {};
  const expiredAt  = p.expired_at || p.expiry || null;

  // Simpan ke DB — fee = 0 (gratis)
  const { error: insertErr } = await supabase.from('transactions').insert({
    user_id:        user.id,
    order_id:       orderId,
    amount:         amount,
    fee:            0,
    total_payment:  amount,
    status:         'pending',
    payment_method: 'qris',
    qr_string:      qrString,
    expired_at:     expiredAt,
    type:           'isisaldo'
  });

  if (insertErr) {
    console.error('DB insert error:', insertErr.message);
    return res.status(500).json({ error: 'Gagal menyimpan transaksi: ' + insertErr.message });
  }

  return res.status(200).json({
    order_id:      orderId,
    amount:        amount,
    fee:           0,
    total_payment: amount,
    qr_string:     qrString,
    expired_at:    expiredAt
  });
}
