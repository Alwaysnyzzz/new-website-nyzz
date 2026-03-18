// pay.js

(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

function run() {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get('order_id');

  console.log('[pay.js] START — orderId:', orderId);

  if (!orderId) { window.location.href = '/isisaldo'; return; }
  if (typeof Auth === 'undefined') { window.location.href = '/login'; return; }
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }

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

  function showLoading(t) { if (loadingText) loadingText.textContent = t; loadingOverlay?.classList.add('active'); }
  function hideLoading()  { loadingOverlay?.classList.remove('active'); }
  function showModal(id)  { document.getElementById(id)?.classList.add('show'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }

  document.getElementById('pendingOk')?.addEventListener('click',   () => closeModal('pendingModal'));
  document.getElementById('confirmTidak')?.addEventListener('click', () => closeModal('confirmModal'));

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
        if (cekStatusBtn) cekStatusBtn.disabled = true;
        return;
      }
      const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000);
      if (timerTextEl) timerTextEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
  }

  function generateQR(qrString) {
    console.log('[pay.js] generateQR, length:', qrString?.length);
    if (!qrString) return;
    const el = document.getElementById('qrcode');
    if (!el) { console.error('[pay.js] #qrcode not found'); return; }
    el.innerHTML = '';
    function tryRender(n) {
      if (typeof QRCode !== 'undefined') {
        try {
          new QRCode(el, { text: qrString, width: 190, height: 190, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M });
          console.log('[pay.js] QR rendered OK');
        } catch(e) { console.error('[pay.js] QR render error:', e.message); }
      } else if (n < 20) {
        setTimeout(() => tryRender(n+1), 200);
      } else { console.error('[pay.js] QRCode lib not available'); }
    }
    tryRender(0);
  }

  downloadBtn?.addEventListener('click', () => {
    const c = document.querySelector('#qrcode canvas');
    if (!c) return;
    const a = document.createElement('a'); a.download = `qr-${orderId}.png`; a.href = c.toDataURL(); a.click();
  });

  async function checkStatus(manual = false) {
    if (isChecking) return;
    isChecking = true;
    if (manual) showLoading('Mengecek pembayaran...');
    try {
      const r = await fetch(`/api/check-payment?order_id=${orderId}`, { headers: { Authorization: 'Bearer ' + Auth.getToken() } });
      const d = await r.json();
      if (d.status === 'completed') { clearInterval(timerInterval); clearInterval(autoCheckInt); hideLoading(); window.location.href = `/struk?order_id=${orderId}`; return; }
      if (d.status === 'cancelled') { clearInterval(timerInterval); clearInterval(autoCheckInt); hideLoading(); window.location.href = '/isisaldo'; return; }
      if (manual) { hideLoading(); showModal('pendingModal'); }
    } catch(e) { if (manual) hideLoading(); }
    finally { isChecking = false; }
  }

  cekStatusBtn?.addEventListener('click', () => checkStatus(true));
  batalkanBtn?.addEventListener('click', () => showModal('confirmModal'));
  document.getElementById('confirmYa')?.addEventListener('click', async () => {
    closeModal('confirmModal'); showLoading('Membatalkan...');
    try { await fetch('/api/cancel-payment', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Auth.getToken() }, body: JSON.stringify({ order_id: orderId }) }); } catch(e) {}
    clearInterval(timerInterval); clearInterval(autoCheckInt); hideLoading(); window.location.href = '/isisaldo';
  });

  async function loadTransaction() {
    showLoading('Memuat halaman pembayaran...');
    try {
      console.log('[pay.js] fetching get-transaction:', orderId);
      const r = await fetch(`/api/get-transaction?order_id=${orderId}`);
      console.log('[pay.js] status:', r.status);
      if (!r.ok) { console.error('[pay.js] HTTP error', r.status); hideLoading(); window.location.href = '/isisaldo'; return; }
      const d = await r.json();
      console.log('[pay.js] data:', JSON.stringify(d));
      if (!d?.order_id)           { hideLoading(); window.location.href = '/isisaldo'; return; }
      if (d.status==='completed') { window.location.href = `/struk?order_id=${orderId}`; return; }
      if (d.status==='cancelled') { window.location.href = '/isisaldo'; return; }
      const amEl = document.getElementById('payAmount');
      const orEl = document.getElementById('payOrder');
      if (amEl) amEl.textContent = 'Rp ' + Number(d.total_payment||d.amount).toLocaleString('id-ID');
      if (orEl) orEl.textContent = 'Order ID: ' + orderId;
      generateQR(d.qr_string);
      if (d.expired_at) startTimer(d.expired_at);
      autoCheckInt = setInterval(() => checkStatus(false), 5000);
      hideLoading();
      console.log('[pay.js] DONE');
    } catch(e) {
      console.error('[pay.js] ERROR:', e.message);
      hideLoading();
      window.location.href = '/isisaldo';
    }
  }

  loadTransaction();
}
