// netlify/functions/topup.js — QRIS top up via Skirk
// Env: SKIRK_KEY (wajib), FIREBASE_API_KEY (opsional)
const BASE = 'https://skirkshop.com/api/v1';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBTxQROsHI1X2t5HoMrWYAsrKSYByhptjQ';

const json = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

async function skirk(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.SKIRK_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { http: r.status, ...j };
}

async function verifyUser(event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.users && j.users[0]) || null;
}

exports.handler = async (event) => {
  try {
    if (!process.env.SKIRK_KEY) return json(500, { success: false, message: 'SKIRK_KEY belum diset di server' });
    const user = await verifyUser(event);
    if (!user) return json(401, { success: false, message: 'Silakan login ulang' });
    const uid = user.localId;
    const q = event.queryStringParameters || {};

    if (q.action === 'create') {
      const b = JSON.parse(event.body || '{}');
      const amount = parseInt(b.amount, 10);
      if (!amount || amount < 1000 || amount > 10000000) return json(400, { success: false, message: 'Nominal tidak valid (min Rp 1.000)' });
      const r = await skirk('POST', '/qris', {
        amount, order_id: `DEP_${uid}_${Date.now()}`, name: (user.displayName || 'User').slice(0, 40), message: 'Top up VannStore',
      });
      if (![200, 201].includes(r.http)) return json(502, { success: false, message: r.message || 'Gagal membuat QRIS' });
      const d = r.data;
      return json(200, { success: true, data: { code: d.code, payment_number: d.qris, total_payment: d.amount, expired_at: d.expires_at } });
    }

    if (q.action === 'status') {
      const code = String(q.code || '').replace(/[^a-zA-Z0-9]/g, '');
      if (!code) return json(400, { success: false, message: 'Kode tidak valid' });
      const r = await skirk('GET', '/qris/' + code);
      const d = r.data;
      if (!d || !String(d.order_id || '').startsWith(`DEP_${uid}_`)) return json(404, { success: false, message: 'Tagihan tidak ditemukan' });
      return json(200, { success: true, data: { status: d.status === 'paid' ? 'completed' : d.status, amount: d.base_amount } });
    }

    return json(400, { success: false, message: 'Action tidak dikenal' });
  } catch (e) {
    console.error(e);
    return json(500, { success: false, message: e.message });
  }
};
