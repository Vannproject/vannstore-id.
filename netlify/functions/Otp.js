// netlify/functions/otp.js — katalog + pesanan Nomor OTP dari Skirk
// Env: SKIRK_KEY (wajib), MARKUP_PERCENT (default 30), MARKUP_MIN (default 500), FIREBASE_API_KEY (opsional)
const BASE = 'https://skirkshop.com/api/v1';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBTxQROsHI1X2t5HoMrWYAsrKSYByhptjQ';
const MARKUP_PERCENT = Number(process.env.MARKUP_PERCENT ?? 30);
const MARKUP_MIN = Number(process.env.MARKUP_MIN ?? 500);
const POPULAR = ['whatsapp', 'shopee', 'dana', 'telegram', 'gopay', 'ovo', 'tiktok', 'instagram', 'facebook', 'google', 'gojek', 'grab', 'tokopedia'];

const json = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const cache = {};
const getCache = (k, ttl) => { const c = cache[k]; return c && Date.now() - c.t < ttl ? c.v : null; };
const setCache = (k, v) => { cache[k] = { t: Date.now(), v }; return v; };

// Harga jual = modal + untung (persen, minimal), dibulatkan ke atas per Rp100
function sellPrice(cost) {
  const margin = Math.max(Math.ceil(cost * MARKUP_PERCENT / 100), MARKUP_MIN);
  return Math.ceil((cost + margin) / 100) * 100;
}

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

async function getCountryId() {
  const c = getCache('country', 24 * 3600 * 1000);
  if (c) return c;
  const r = await skirk('GET', '/otp/countries');
  const found = (r.data || []).find(x => /indonesia/i.test(x.name));
  if (!found) throw new Error('Negara Indonesia tidak ditemukan di Skirk');
  return setCache('country', found.id);
}

exports.handler = async (event) => {
  try {
    if (!process.env.SKIRK_KEY) return json(500, { success: false, error: 'SKIRK_KEY belum diset di server' });
    const user = await verifyUser(event);
    if (!user) return json(401, { success: false, error: 'Silakan login ulang' });
    const uid = user.localId;
    const q = event.queryStringParameters || {};
    const action = q.action;

    // ---------- KATALOG: daftar aplikasi ----------
    if (action === 'catalog') {
      let list = getCache('catalog', 10 * 60 * 1000);
      if (!list) {
        const cid = await getCountryId();
        const r = await skirk('GET', '/otp/services?country_id=' + cid);
        if (r.http !== 200) return json(502, { success: false, error: r.message || 'Gagal memuat katalog' });
        list = (r.data || [])
          .map(x => ({ id: x.id ?? x.service_id, name: String(x.name || '').trim() }))
          .filter(x => x.id != null && x.name);
        const rank = n => { const i = POPULAR.findIndex(p => n.toLowerCase().includes(p)); return i === -1 ? 999 : i; };
        list.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
        setCache('catalog', list);
      }
      return json(200, { success: true, data: list });
    }

    // ---------- PRODUK: opsi operator + stok + harga jual ----------
    if (action === 'products') {
      const sid = parseInt(q.service_id, 10);
      if (!sid) return json(400, { success: false, error: 'service_id tidak valid' });
      let rows = getCache('prod_' + sid, 45 * 1000);
      if (!rows) {
        const cid = await getCountryId();
        const r = await skirk('GET', `/otp/products?country_id=${cid}&service_id=${sid}`);
        if (r.http === 429) return json(429, { success: false, error: 'Server sibuk, coba lagi sebentar.' });
        if (r.http !== 200) return json(502, { success: false, error: r.message || 'Gagal memuat produk' });
        rows = (r.data || []).filter(x => x.available > 0).slice(0, 8).map(x => ({
          catalog_product_id: x.catalog_product_id, operator_id: x.operator_id ?? null,
          operator: x.operator, available: x.available, price: sellPrice(x.price),
        }));
        setCache('prod_' + sid, rows);
      }
      return json(200, { success: true, data: rows });
    }

    // ---------- ORDER ----------
    if (action === 'order') {
      const b = JSON.parse(event.body || '{}');
      const sid = parseInt(b.service_id, 10);
      const cpid = parseInt(b.catalog_product_id, 10);
      const opid = (b.operator_id === null || b.operator_id === undefined || b.operator_id === '') ? null : parseInt(b.operator_id, 10);
      const expected = parseInt(b.expected_price, 10);
      if (!sid || !cpid || !expected) return json(400, { success: false, error: 'Data pesanan tidak lengkap' });

      const cid = await getCountryId();
      const p = await skirk('GET', `/otp/products?country_id=${cid}&service_id=${sid}`); // selalu ambil data segar
      const row = (p.data || []).find(x => x.catalog_product_id === cpid && (x.operator_id ?? null) === opid);
      if (!row || !(row.available > 0)) return json(409, { success: false, refresh: true, error: 'Stok habis, muat ulang daftar.' });
      if (sellPrice(row.price) !== expected) return json(409, { success: false, refresh: true, error: 'Harga berubah, muat ulang daftar.' });

      const o = await skirk('POST', '/otp/orders', {
        country_id: cid, service_id: sid, catalog_product_id: cpid, operator_id: opid,
        price: row.price, ref: `VS_${uid}_${Date.now()}`,
      });
      if (![200, 201, 202].includes(o.http)) {
        console.error('Skirk order gagal:', o.http, o.code, o.message);
        if (o.code === 'price_changed' || o.code === 'no_number') return json(409, { success: false, refresh: true, error: 'Stok/harga berubah, muat ulang daftar.' });
        if (o.http === 429) return json(429, { success: false, error: 'Server sibuk, coba lagi sebentar.' });
        return json(502, { success: false, error: 'Layanan sedang tidak tersedia, coba lagi nanti.' });
      }
      return json(200, { success: true, data: { id: o.data.id, number: o.data.phone, price: expected } });
    }

    // ---------- STATUS / CANCEL ----------
    if (action === 'status' || action === 'cancel') {
      const oid = parseInt(q.id, 10);
      if (!oid) return json(400, { success: false, error: 'ID tidak valid' });
      const cur = await skirk('GET', '/otp/orders/' + oid);
      const d = cur.data;
      if (!d || !String(d.ref || '').startsWith(`VS_${uid}_`)) return json(404, { success: false, error: 'Pesanan tidak ditemukan' });
      if (action === 'cancel') {
        const c = await skirk('POST', `/otp/orders/${oid}/cancel`);
        return json(200, { success: c.http === 200 || c.http === 201, error: c.message });
      }
      const code = d.otp_code || d.otp_message || null;
      if (d.status === 'otp_received' && code) await skirk('POST', `/otp/orders/${oid}/finish`);
      const got = (d.status === 'otp_received' || d.status === 'completed') && code;
      return json(200, { success: true, data: { sms: got ? code : null, status: d.status } });
    }

    return json(400, { success: false, error: 'Action tidak dikenal' });
  } catch (e) {
    console.error(e);
    return json(500, { success: false, error: e.message });
  }
};
