// api/panel.js — SEMUA PANEL API DALAM SATU FILE
// Router berdasarkan query param: ?action=...
//
// GET  /api/panel?action=get-panel-users     → list user panel
// GET  /api/panel?action=get-panel-order     → detail order panel
// GET  /api/panel?action=get-server-status   → status realtime server
// POST /api/panel?action=order-panel         → buat order + QRIS
// POST /api/panel?action=create-panel        → buat server Pterodactyl
// POST /api/panel?action=create-panel-user   → buat user email panel

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ===== ENV =====
const PTERO_URL         = process.env.PTERO_URL;
const PTERO_APP_KEY     = process.env.PTERO_APP_KEY;
const PTERO_CLIENT_KEY  = process.env.PTERO_CLIENT_KEY;
const PTERO_LOCATION_ID = parseInt(process.env.PTERO_LOCATION_ID) || 1;
const PTERO_NEST_ID     = process.env.PTERO_NEST_ID;
const PTERO_EGG_ID      = process.env.PTERO_EGG_ID;
const GH_TOKEN          = process.env.GITHUB_TOKEN;
const GH_OWNER          = process.env.GITHUB_OWNER;
const GH_REPO           = process.env.GITHUB_REPO;
const GH_BRANCH         = process.env.GITHUB_BRANCH || 'main';

// ===== HELPERS GITHUB =====
async function ghGet(path) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!res.ok) return null;
  const d = await res.json();
  return { data: JSON.parse(Buffer.from(d.content, 'base64').toString()), sha: d.sha };
}

async function ghPut(path, data, sha = null) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ message: `panel: ${path}`, content, branch: GH_BRANCH, ...(sha ? { sha } : {}) })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ===== HELPER AUTH =====
async function getProfile(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await supabase.from('profiles').select('username, coins').eq('id', user.id).single();
  return profile || null;
}

function gbToMb(gb) { return Math.round(parseFloat(gb) * 1024); }

// ===== MAIN ROUTER =====
export default async function handler(req, res) {
  const action = req.query.action;

  // ─────────────────────────────────────────────
  // GET: get-panel-users
  // ─────────────────────────────────────────────
  if (action === 'get-panel-users') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const profile = await getProfile(req);
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });
    const listFile = await ghGet(`user_email_panel/${profile.username}/_list.json`);
    return res.status(200).json(listFile?.data || []);
  }

  // ─────────────────────────────────────────────
  // GET: get-panel-order
  // ─────────────────────────────────────────────
  if (action === 'get-panel-order') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'order_id wajib' });
    const username = order_id.split('-')[1];
    if (!username) return res.status(400).json({ error: 'Format order_id tidak valid' });
    const orderFile = await ghGet(`orders_panel/${username}/${order_id}.json`);
    if (!orderFile) return res.status(404).json({ error: 'Order tidak ditemukan' });
    const order = orderFile.data;
    return res.status(200).json({
      order_id:       order.order_id,
      nama_panel:     order.nama_panel,
      ram_gb:         order.ram_gb,
      cpu_pct:        order.cpu_pct,
      mem_mb:         order.mem_mb,
      disk_mb:        order.disk_mb,
      durasi_hari:    order.durasi_hari,
      tier:           order.tier,
      harga:          order.harga,
      status:         order.status,
      server_id:      order.server_id,
      server_uuid:    order.server_uuid,
      ptero_email:    order.ptero_email,
      panel_password: order.panel_password,
      expired_at:     order.expired_at,
      activated_at:   order.activated_at,
      created_at:     order.created_at,
      deskripsi:      order.deskripsi
    });
  }

  // ─────────────────────────────────────────────
  // GET: get-server-status
  // ─────────────────────────────────────────────
  if (action === 'get-server-status') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const profile = await getProfile(req);
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });
    const { server_uuid } = req.query;
    if (!server_uuid) return res.status(400).json({ error: 'server_uuid wajib' });
    try {
      const r = await fetch(`${PTERO_URL}/api/client/servers/${server_uuid}/resources`, {
        headers: { Authorization: `Bearer ${PTERO_CLIENT_KEY}`, Accept: 'application/json' }
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: 'Gagal ambil status: ' + (err.errors?.[0]?.detail || r.status) });
      }
      const data = await r.json();
      const attr = data.attributes;
      const rs   = attr.resources;
      return res.status(200).json({
        status:    attr.current_state,
        is_online: attr.current_state === 'running',
        ram_used:  Math.round(rs.memory_bytes / 1024 / 1024),
        ram_limit: Math.round(rs.memory_limit_bytes / 1024 / 1024),
        cpu_used:  Math.round(rs.cpu_absolute * 10) / 10,
        disk_used: Math.round(rs.disk_bytes / 1024 / 1024),
        uptime:    rs.uptime_milliseconds
      });
    } catch (e) {
      return res.status(502).json({ error: 'Gagal menghubungi panel: ' + e.message });
    }
  }

  // ─────────────────────────────────────────────
  // POST: order-panel
  // ─────────────────────────────────────────────
  if (action === 'order-panel') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const profile = await getProfile(req);
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });

    const { nama_panel, panel_user, panel_password, deskripsi, spek } = req.body || {};
    if (!nama_panel || !panel_user || !spek) return res.status(400).json({ error: 'Data tidak lengkap' });
    const { ram_gb, cpu_pct, mem_mb, disk_mb, durasi_hari, tier, harga } = spek;
    if (!durasi_hari || !harga) return res.status(400).json({ error: 'Spek tidak lengkap' });

    const rand    = Math.random().toString(36).substr(2, 5).toUpperCase();
    const orderId = `PANEL-${profile.username}-${Date.now()}-${rand}`;

    let qrString, expiredAt;
    try {
      const pakRes  = await fetch('https://app.pakasir.com/api/transactioncreate/qris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: process.env.PAKASIR_PROJECT, order_id: orderId, amount: harga, api_key: process.env.PAKASIR_API_KEY })
      });
      const pakData = await pakRes.json();
      qrString  = pakData?.payment?.payment_number || pakData?.payment?.qr_string;
      expiredAt = pakData?.payment?.expired_at;
      if (!qrString) return res.status(502).json({ error: 'QR tidak tersedia', detail: pakData });
    } catch (e) {
      return res.status(502).json({ error: 'Gagal menghubungi payment gateway' });
    }

    const orderData = {
      order_id: orderId, owner: profile.username, nama_panel, panel_user,
      panel_password: panel_password || null, deskripsi: deskripsi || '',
      ram_gb, cpu_pct: cpu_pct || 100,
      mem_mb:  mem_mb  || (ram_gb ? Math.round(parseFloat(ram_gb) * 1024) : 0),
      disk_mb: disk_mb || (ram_gb ? Math.round(parseFloat(ram_gb) * 1024) : 0),
      durasi_hari: parseInt(durasi_hari), tier: tier || 'low', harga: parseInt(harga),
      status: 'pending', server_id: null, qr_string: qrString,
      payment_expired: expiredAt, created_at: new Date().toISOString()
    };

    await ghPut(`orders_panel/${profile.username}/${orderId}.json`, orderData);
    const listFile = await ghGet(`orders_panel/${profile.username}/_list.json`);
    const list = listFile?.data || [];
    list.unshift({ order_id: orderId, nama_panel, tier, durasi_hari: parseInt(durasi_hari), harga: parseInt(harga), status: 'pending', created_at: orderData.created_at });
    await ghPut(`orders_panel/${profile.username}/_list.json`, list, listFile?.sha);

    return res.status(200).json({ order_id: orderId, qr_string: qrString, expired_at: expiredAt, amount: harga });
  }

  // ─────────────────────────────────────────────
  // POST: create-panel (dipanggil dari webhook)
  // ─────────────────────────────────────────────
  if (action === 'create-panel') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { order_id } = req.body || {};
    if (!order_id) return res.status(400).json({ error: 'order_id wajib' });

    const ownerName = order_id.split('-')[1];
    if (!ownerName) return res.status(400).json({ error: 'Format order_id tidak valid' });

    const orderFile = await ghGet(`orders_panel/${ownerName}/${order_id}.json`);
    if (!orderFile) return res.status(404).json({ error: 'Order tidak ditemukan' });
    const order = orderFile.data;
    if (order.status !== 'paid') return res.status(400).json({ error: 'Order belum dibayar atau sudah diproses' });
    if (order.server_id) return res.status(400).json({ error: 'Panel sudah dibuat' });

    const userFile = await ghGet(`user_email_panel/${ownerName}/${order.panel_user}.json`);
    if (!userFile) return res.status(404).json({ error: 'User panel tidak ditemukan' });
    const panelUser = userFile.data;

    const serverPassword = order.panel_password || crypto.randomBytes(8).toString('hex');
    const ramMb  = order.tier === 'unlimited' ? 0 : gbToMb(order.ram_gb);
    const diskMb = order.tier === 'unlimited' ? 0 : gbToMb(order.ram_gb);
    const cpuPct = order.cpu_pct || 100;

    const expiredAt = new Date();
    expiredAt.setDate(expiredAt.getDate() + parseInt(order.durasi_hari));

    let eggEnv = {};
    try {
      const eggRes  = await fetch(`${PTERO_URL}/api/application/nests/${PTERO_NEST_ID}/eggs/${PTERO_EGG_ID}?include=variables`, {
        headers: { Authorization: `Bearer ${PTERO_APP_KEY}`, Accept: 'application/json' }
      });
      const eggData = await eggRes.json();
      (eggData.attributes?.relationships?.variables?.data || []).forEach(v => {
        eggEnv[v.attributes.env_variable] = v.attributes.default_value;
      });
    } catch (e) { /* pakai env kosong */ }

    let server;
    try {
      const pteroRes = await fetch(`${PTERO_URL}/api/application/servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PTERO_APP_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: order.nama_panel, user: panelUser.ptero_user_id, egg: parseInt(PTERO_EGG_ID),
          environment: eggEnv,
          limits: { memory: ramMb, swap: 0, disk: diskMb, io: 500, cpu: cpuPct },
          feature_limits: { databases: 1, backups: 1, allocations: 1 },
          deploy: { locations: [PTERO_LOCATION_ID], dedicated_ip: false, port_range: [] },
          description: order.deskripsi || `Panel ${ownerName} - ${order_id}`
        })
      });
      const pteroData = await pteroRes.json();
      if (!pteroRes.ok) return res.status(502).json({ error: 'Gagal buat server: ' + JSON.stringify(pteroData.errors || pteroData) });
      server = pteroData.attributes;
    } catch (e) {
      return res.status(502).json({ error: 'Gagal menghubungi Pterodactyl: ' + e.message });
    }

    const updatedOrder = {
      ...order, status: 'active', server_id: server.id, server_uuid: server.uuid,
      server_name: server.name, panel_password: serverPassword,
      ptero_email: panelUser.ptero_email, expired_at: expiredAt.toISOString(),
      suspended: false, activated_at: new Date().toISOString()
    };
    await ghPut(`orders_panel/${ownerName}/${order_id}.json`, updatedOrder, orderFile.sha);

    const listFile = await ghGet(`orders_panel/${ownerName}/_list.json`);
    const list = listFile?.data || [];
    const idx  = list.findIndex(o => o.order_id === order_id);
    if (idx >= 0) list[idx] = { ...list[idx], status: 'active', server_id: server.id, expired_at: expiredAt.toISOString() };
    await ghPut(`orders_panel/${ownerName}/_list.json`, list, listFile?.sha);

    return res.status(200).json({ success: true, server_id: server.id, expired_at: expiredAt.toISOString() });
  }

  // ─────────────────────────────────────────────
  // POST: create-panel-user
  // ─────────────────────────────────────────────
  if (action === 'create-panel-user') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const profile = await getProfile(req);
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });

    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Username 3-20 karakter, huruf kecil/angka/underscore' });

    const listPath = `user_email_panel/${profile.username}/_list.json`;
    const listFile = await ghGet(listPath);
    const userList = listFile?.data || [];
    if (userList.length >= 50) return res.status(400).json({ error: 'Maksimal 50 user panel per akun' });
    if (userList.find(u => u.username === username)) return res.status(400).json({ error: 'Username sudah ada' });

    const pteroEmail    = `${profile.username}_${username}@nyzz.panel`;
    const pteroPassword = crypto.randomBytes(12).toString('hex');

    let pteroUser;
    try {
      const pteroRes = await fetch(`${PTERO_URL}/api/application/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PTERO_APP_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pteroEmail, username: `${profile.username}_${username}`,
          first_name: username, last_name: profile.username, password: pteroPassword
        })
      });
      const pteroData = await pteroRes.json();
      if (!pteroRes.ok) return res.status(502).json({ error: 'Gagal buat user di panel: ' + (pteroData.errors?.[0]?.detail || 'unknown') });
      pteroUser = pteroData.attributes;
    } catch (e) {
      return res.status(502).json({ error: 'Gagal menghubungi Pterodactyl: ' + e.message });
    }

    const userData = {
      username, ptero_user_id: pteroUser.id, ptero_email: pteroEmail,
      ptero_username: pteroUser.username, owner_account: profile.username,
      created_at: new Date().toISOString()
    };
    await ghPut(`user_email_panel/${profile.username}/${username}.json`, userData);
    const newList = [...userList, { username, ptero_user_id: pteroUser.id, created_at: userData.created_at }];
    await ghPut(listPath, newList, listFile?.sha || null);

    return res.status(200).json({ success: true, username, ptero_email: pteroEmail, ptero_user_id: pteroUser.id });
  }

  // ─────────────────────────────────────────────
  // Action tidak dikenal
  // ─────────────────────────────────────────────
  return res.status(400).json({ error: 'Action tidak valid. Gunakan ?action=nama-action' });
}
