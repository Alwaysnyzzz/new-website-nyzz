// pay.js

(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

function run() {
  const parts   = window.location.pathname.split('/').filter(Boolean);
  const orderId = parts[parts.length - 1];

  if (!orderId || orderId === 'isisaldo') { window.location.href = '/isisaldo'; return; }
  if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) { window.location.href = '/login'; return; }

  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText    = document.getElementById('loadingText');
  const timerEl        = document.getElementById('timer');
  const timerTextEl    = document.getElementById('timerText');
  const cekStatusBtn   = document.getElementById('cekStatusBtn');
  const batalkanBtn    = document.getElementById('batalkanBtn');
  const downloadBtn    = document.getElementById('downloadBtn');

  let timerInterval = null;
  let autoCheckInt  = null;
  let isChecking    = false;

  function showLoading(t) {
    if (loadingText) loadingText.textContent = t;
    loadingOverlay?.classList.add('active');
  }
  function hideLoading() { loadingOverlay?.classList.remove('active'); }
  function showModal(id)  { document.getElementById(id)?.classList.add('show'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }

  document.getElementById('pendingOk')?.addEventListener('click',    () => closeModal('pendingModal'));
  document.getElementById('confirmTidak')?.addEventListener('click',  () => closeModal('confirmModal'));

  // ===== Timer =====
  function startTimer(str) {
    if (!str) return;
    const exp = new Date(str).getTime();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const diff = exp - Date.now();
      if (diff <= 0) {
        clearInterval(timerInterval); clearInterval(autoCheckInt);
        timerEl?.classList.add('expired');
        if (timerTextEl) timerTextEl.textContent = 'EXPIRED';
        if (cekStatusBtn) cekStatusBtn.disabled  = true;
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (timerTextEl) timerTextEl.textContent =
        `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
  }

  // ===== Generate QR — tunggu library siap =====
  function generateQR(qrString) {
    if (!qrString) return;
    const el = document.getElementById('qrcode');
    if (!el) return;
    el.innerHTML = '';

    // Kalau QRCode belum load, tunggu sampai siap
    function tryRender(attempt) {
      if (typeof QRCode !== 'undefined') {
        new QRCode(el, {
          text:         qrString,
          width:        190,
          height:       190,
          colorDark:    '#000000',
          colorLight:   '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } else if (attempt < 20) {
        // Coba lagi tiap 200ms, max 4 detik
        setTimeout(() => tryRender(attempt + 1), 200);
      } else {
        // Fallback: tampilkan teks QR string kalau library gagal load
        el.innerHTML = `<div style="color:#ff5555;font-size:11px;word-break:break-all;padding:10px">QR gagal load library. String: ${qrString.substring(0,40)}...</div>`;
      }
    }
    tryRender(0);
  }

  // ===== Download QR =====
  downloadBtn?.addEventListener('click', () => {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `qr-${orderId}.png`;
    a.href     = canvas.toDataURL();
    a.click();
  });

  // ===== Cek status =====
  async function checkStatus(manual = false) {
    if (isChecking) return;
    isChecking = true;
    if (manual) showLoading('Mengecek pembayaran...');
    try {
      const r = await fetch(`/api/check-payment?order_id=${orderId}`, {
        headers: { Authorization: 'Bearer ' + Auth.getToken() }
      });
      const d = await r.json();
      if (d.status === 'completed') {
        clearInterval(timerInterval); clearInterval(autoCheckInt);
        hideLoading();
        window.location.href = `/struk?order_id=${orderId}`;
        return;
      }
      if (d.status === 'cancelled') {
        clearInterval(timerInterval); clearInterval(autoCheckInt);
        hideLoading();
        window.location.href = '/isisaldo';
        return;
      }
      if (manual) { hideLoading(); showModal('pendingModal'); }
    } catch (e) {
      if (manual) hideLoading();
    } finally {
      isChecking = false;
    }
  }

  cekStatusBtn?.addEventListener('click', () => checkStatus(true));

  // ===== Batalkan =====
  batalkanBtn?.addEventListener('click', () => showModal('confirmModal'));
  document.getElementById('confirmYa')?.addEventListener('click', async () => {
    closeModal('confirmModal');
    showLoading('Membatalkan transaksi...');
    try {
      await fetch('/api/cancel-payment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Auth.getToken() },
        body:    JSON.stringify({ order_id: orderId })
      });
    } catch (e) {}
    clearInterval(timerInterval); clearInterval(autoCheckInt);
    hideLoading();
    window.location.href = '/isisaldo';
  });

  // ===== Load transaksi =====
  async function loadTransaction() {
    showLoading('Memuat halaman pembayaran...');
    try {
      const r = await fetch(`/api/get-transaction?order_id=${orderId}`);

      if (!r.ok) {
        console.error('get-transaction HTTP error:', r.status);
        window.location.href = '/isisaldo';
        return;
      }

      const d = await r.json();
      console.log('[pay.js] transaction data:', d);

      if (!d || !d.order_id)          { window.location.href = '/isisaldo'; return; }
      if (d.status === 'completed')   { window.location.href = `/struk?order_id=${orderId}`; return; }
      if (d.status === 'cancelled')   { window.location.href = '/isisaldo'; return; }

      // Isi UI
      const amountEl = document.getElementById('payAmount');
      const orderEl  = document.getElementById('payOrder');
      if (amountEl) amountEl.textContent = 'Rp ' + Number(d.total_payment || d.amount).toLocaleString('id-ID');
      if (orderEl)  orderEl.textContent  = 'Order ID: ' + orderId;

      // Generate QR
      console.log('[pay.js] qr_string:', d.qr_string ? d.qr_string.substring(0,30)+'...' : 'KOSONG');
      generateQR(d.qr_string);

      // Timer
      if (d.expired_at) startTimer(d.expired_at);

      // Auto-check tiap 5 detik
      autoCheckInt = setInterval(() => checkStatus(false), 5000);

      hideLoading();

    } catch (e) {
      console.error('[pay.js] loadTransaction error:', e.message);
      hideLoading();
      window.location.href = '/isisaldo';
    }
  }

  loadTransaction();
}
