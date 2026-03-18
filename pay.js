// pay.js — Logika halaman pembayaran QRIS

(function init() {
  // Tunggu DOM ready tanpa DOMContentLoaded (karena script dipanggil di akhir body)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

function run() {
  'use strict';

  // ===== Ambil order_id dari URL =====
  const pathParts = window.location.pathname.split('/');
  const orderId   = pathParts[pathParts.length - 1];

  if (!orderId || orderId === 'isisaldo') {
    window.location.href = '/isisaldo';
    return;
  }

  if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  // ===== Elemen UI =====
  const payAmountEl    = document.getElementById('payAmount');
  const payOrderEl     = document.getElementById('payOrder');
  const timerEl        = document.getElementById('timer');
  const timerTextEl    = document.getElementById('timerText');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText    = document.getElementById('loadingText');
  const cekStatusBtn   = document.getElementById('cekStatusBtn');
  const batalkanBtn    = document.getElementById('batalkanBtn');
  const downloadBtn    = document.getElementById('downloadBtn');

  let timerInterval = null;
  let autoCheckInt  = null;
  let isChecking    = false;

  // ===== Loading helpers =====
  function showLoading(text = 'Memproses...') {
    if (loadingText)    loadingText.textContent = text;
    if (loadingOverlay) loadingOverlay.classList.add('active');
  }
  function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove('active');
  }

  // ===== Modal helpers =====
  function showModal(id)  { document.getElementById(id)?.classList.add('show'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }

  document.getElementById('pendingOk')?.addEventListener('click',   () => closeModal('pendingModal'));
  document.getElementById('confirmTidak')?.addEventListener('click', () => closeModal('confirmModal'));

  // ===== Timer hitung mundur =====
  function startTimer(expiredAtStr) {
    if (!expiredAtStr) return;
    const expiredAt = new Date(expiredAtStr).getTime();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const diff = expiredAt - Date.now();
      if (diff <= 0) {
        clearInterval(timerInterval);
        clearInterval(autoCheckInt);
        timerEl?.classList.add('expired');
        if (timerTextEl) timerTextEl.textContent = 'EXPIRED';
        if (cekStatusBtn) cekStatusBtn.disabled = true;
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (timerTextEl) timerTextEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
  }

  // ===== Generate QR Code =====
  function generateQR(qrString) {
    const qrEl = document.getElementById('qrcode');
    if (!qrEl || !qrString) return;
    qrEl.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrEl, {
        text:         qrString,
        width:        190,
        height:       190,
        colorDark:    '#000000',
        colorLight:   '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }

  // ===== Download QR =====
  downloadBtn?.addEventListener('click', function () {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) return;
    const link    = document.createElement('a');
    link.download = `qr-${orderId}.png`;
    link.href     = canvas.toDataURL();
    link.click();
  });

  // ===== Cek status pembayaran =====
  async function checkStatus(isManual = false) {
    if (isChecking) return;
    isChecking = true;
    if (isManual) showLoading('Mengecek pembayaran...');

    try {
      const res  = await fetch(`/api/check-payment?order_id=${orderId}`, {
        headers: { Authorization: 'Bearer ' + Auth.getToken() }
      });
      const data = await res.json();

      if (data.status === 'completed') {
        clearInterval(timerInterval);
        clearInterval(autoCheckInt);
        hideLoading();
        window.location.href = `/struk?order_id=${orderId}`;
        return;
      }
      if (data.status === 'cancelled') {
        clearInterval(timerInterval);
        clearInterval(autoCheckInt);
        hideLoading();
        window.location.href = '/isisaldo';
        return;
      }
      if (isManual) { hideLoading(); showModal('pendingModal'); }
    } catch (e) {
      if (isManual) hideLoading();
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
    clearInterval(timerInterval);
    clearInterval(autoCheckInt);
    hideLoading();
    window.location.href = '/isisaldo';
  });

  // ===== Load data transaksi =====
  async function loadTransaction() {
    showLoading('Memuat halaman pembayaran...');
    try {
      const res  = await fetch(`/api/get-transaction?order_id=${orderId}`);
      const data = await res.json();

      if (data.error || !data.order_id) { window.location.href = '/isisaldo'; return; }
      if (data.status === 'completed')  { window.location.href = `/struk?order_id=${orderId}`; return; }
      if (data.status === 'cancelled')  { window.location.href = '/isisaldo'; return; }

      // Isi UI
      if (payAmountEl) payAmountEl.textContent = 'Rp ' + Number(data.total_payment || data.amount).toLocaleString('id-ID');
      if (payOrderEl)  payOrderEl.textContent  = 'Order ID: ' + orderId;

      generateQR(data.qr_string);
      if (data.expired_at) startTimer(data.expired_at);

      // Auto-check setiap 5 detik
      autoCheckInt = setInterval(() => checkStatus(false), 5000);

      hideLoading();
    } catch (e) {
      console.error('loadTransaction error:', e);
      hideLoading();
      window.location.href = '/isisaldo';
    }
  }

  loadTransaction();
}
