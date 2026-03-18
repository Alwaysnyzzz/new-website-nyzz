// api/upload-image.js
// POST /api/upload-image
// Simpan foto  → GitHub: user_profile/namauser.jpg
// Buat/update  → GitHub: data_profile/namauser.json
// Env yang dibutuhkan di Vercel:
//   GITHUB_TOKEN   = Personal Access Token (scope: repo)
//   GITHUB_OWNER   = username GitHub kamu
//   GITHUB_REPO    = nama repo website
//   GITHUB_BRANCH  = branch (default: main)

import { createClient } from '@supabase/supabase-js';

// Helper: ambil SHA file yang sudah ada di GitHub (untuk update/overwrite)
async function getFileSha(apiUrl, token) {
  try {
    const r = await fetch(apiUrl, {
      headers: {
        Authorization:          `Bearer ${token}`,
        Accept:                 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.sha || null;
  } catch { return null; }
}

// Helper: push file ke GitHub (create atau update)
async function pushToGitHub({ token, owner, repo, branch, path, content, message, sha }) {
  const url  = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = { message, content, branch, ...(sha ? { sha } : {}) };
  const res  = await fetch(url, {
    method:  'PUT',
    headers: {
      Authorization:          `Bearer ${token}`,
      Accept:                 'application/vnd.github+json',
      'Content-Type':         'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub error ${res.status}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Verifikasi token user
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Session tidak valid' });

  // Ambil profile user
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, coins, created_at')
    .eq('id', user.id)
    .single();
  if (!profile) return res.status(404).json({ error: 'Profil tidak ditemukan' });

  const { image, type } = req.body || {};
  if (!image || type !== 'avatar') return res.status(400).json({ error: 'Data tidak valid' });

  // Validasi format base64
  const matches = image.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Format gambar tidak valid' });

  const mimeType   = matches[1];
  const base64Data = matches[2];
  const buffer     = Buffer.from(base64Data, 'base64');

  if (buffer.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'Ukuran maksimal 2 MB' });

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(mimeType)) return res.status(400).json({ error: 'Hanya JPG, PNG, WebP' });

  const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER  = process.env.GITHUB_OWNER;
  const GITHUB_REPO   = process.env.GITHUB_REPO;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return res.status(500).json({ error: 'Konfigurasi GitHub belum diset di environment variables' });
  }

  // ===== 1. Upload foto ke user_profile/namauser.jpg =====
  const imgPath  = `user_profile/${profile.username}.jpg`;
  const imgApiUrl= `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${imgPath}`;
  const imgSha   = await getFileSha(imgApiUrl, GITHUB_TOKEN);

  try {
    await pushToGitHub({
      token:   GITHUB_TOKEN,
      owner:   GITHUB_OWNER,
      repo:    GITHUB_REPO,
      branch:  GITHUB_BRANCH,
      path:    imgPath,
      content: base64Data,
      message: `avatar: update profile photo for ${profile.username}`,
      sha:     imgSha
    });
  } catch (e) {
    return res.status(502).json({ error: 'Gagal upload foto: ' + e.message });
  }

  // URL raw GitHub (cache buster agar browser tidak pakai cache lama)
  const cacheBuster = Date.now();
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${imgPath}?v=${cacheBuster}`;

  // ===== 2. Buat/update data_profile/namauser.json =====
  const jsonPath   = `data_profile/${profile.username}.json`;
  const jsonApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${jsonPath}`;
  const jsonSha    = await getFileSha(jsonApiUrl, GITHUB_TOKEN);

  const profileData = {
    username:   profile.username,
    avatar_url: rawUrl,
    coins:      profile.coins || 0,
    created_at: profile.created_at,
    updated_at: new Date().toISOString()
  };

  const jsonBase64 = Buffer.from(JSON.stringify(profileData, null, 2)).toString('base64');

  try {
    await pushToGitHub({
      token:   GITHUB_TOKEN,
      owner:   GITHUB_OWNER,
      repo:    GITHUB_REPO,
      branch:  GITHUB_BRANCH,
      path:    jsonPath,
      content: jsonBase64,
      message: `profile: update data for ${profile.username}`,
      sha:     jsonSha
    });
  } catch (e) {
    // JSON gagal tidak fatal — foto sudah terupload
    console.error('JSON push failed:', e.message);
  }

  // ===== 3. Update avatar_url di Supabase =====
  await supabase
    .from('profiles')
    .update({ avatar_url: rawUrl })
    .eq('id', user.id);

  return res.status(200).json({
    url:        rawUrl,
    username:   profile.username,
    json_path:  jsonPath,
    img_path:   imgPath
  });
}
