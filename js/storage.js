// [AI] Đọc/ghi LocalStorage an toàn. Chưa có dữ liệu hoặc JSON lỗi thì trả về giá trị mặc định.
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn("Dữ liệu lỗi, dùng mặc định:", key);
    return fallback;
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); dbMirror(key, value); }
  catch (err) { console.error("Không lưu được:", key); alert("Bộ nhớ trình duyệt đã đầy. Hãy dùng ảnh nhỏ hơn hoặc xóa bớt dữ liệu."); }
}

// Xóa dữ liệu demo (chỉ các key của GoNow)
function clearDemoData() {
  ["gonow_cart", "gonow_cartstore", "gonow_contact", "gonow_favs", "gonow_orders"].forEach(k => localStorage.removeItem(k));
}

// ---- Dữ liệu do trang ADMIN chỉnh sửa (admin.html) ----
// Bản gốc trong data.js được giữ lại để admin có thể "đặt lại mặc định".
const DEFAULT_FOODS = FOODS.map(f => ({ ...f }));
const DEFAULT_VOUCHERS = JSON.parse(JSON.stringify(VOUCHERS));
const DEFAULT_SHIP = SHIP_FEE;

// ALL_FOODS = toàn bộ món (kể cả món đang ẩn). FOODS = chỉ món đang hiển thị → cửa hàng dùng FOODS.
const ALL_FOODS = load("gonow_foods", null) || FOODS.map(f => ({ ...f }));
function applyFoods(list) {            // cập nhật ALL_FOODS (mọi món) và FOODS (món đang hiển thị) tại chỗ
  ALL_FOODS.length = 0; ALL_FOODS.push(...list);
  FOODS.length = 0; FOODS.push(...ALL_FOODS.filter(f => f.active !== false));
}
applyFoods(ALL_FOODS.slice());
function nextFoodId() {                // id tăng dần, không bao giờ dùng lại id món đã xóa
  const n = Math.max(load("gonow_nextid", 0), ALL_FOODS.reduce((m, f) => Math.max(m, f.id), 0)) + 1;
  save("gonow_nextid", n); return n;
}

const savedVouchers = load("gonow_vouchers", null);
if (savedVouchers) {
  Object.keys(VOUCHERS).forEach(k => delete VOUCHERS[k]);
  Object.assign(VOUCHERS, savedVouchers);
}
const savedSettings = load("gonow_settings", null);
if (savedSettings && savedSettings.ship >= 0) SHIP_FEE = savedSettings.ship;

// ---- Đồng bộ Firestore (bản sao của LocalStorage; chạy khi đã bật Firebase) ----
// orders/{id}, foods/{id}: mỗi đơn/món là một tài liệu riêng (không ghi đè nhau). config/vouchers, config/settings: một tài liệu.
// LocalStorage vẫn là bộ nhớ đệm: mất mạng hoặc chưa cấu hình Firestore thì trang vẫn chạy như cũ.
const DB = { fs: null, admin: false, ordersReady: false, last: { gonow_orders: {}, gonow_foods: {}, gonow_driverapps: {}, gonow_partnerapps: {} }, unsub: null };
const DB_COLL = { gonow_orders: "orders", gonow_foods: "foods", gonow_driverapps: "driverApps", gonow_partnerapps: "partnerApps" };   // driverApps: chỉ admin đọc/ghi (xem firestore.rules.txt)
const dbWarn = e => console.warn("Firestore:", e.code || e);
const dbPing = key => window.dispatchEvent(new CustomEvent("gn-remote", { detail: { key } }));


// [FIX] KHÁCH chỉ được: (1) tạo đơn mới, (2) sửa đúng 2 trường của mình: cancelled, rating.
// Trạng thái đơn (status) do admin quyết định, máy khách TUYỆT ĐỐI không ghi đè (trước đây bản sao cũ trên máy khách ghi đè lại status = 0).
// Chưa nhận được ảnh chụp đầu tiên từ Firestore thì chưa đẩy gì (tránh đẩy dữ liệu cũ lên); sẽ đẩy sau khi dbRemote chạy.
const CUSTOMER_FIELDS = ["cancelled", "rating", "upd"];
// Đơn bị máy chủ từ chối (vượt giới hạn / luật Firestore) → báo cho app.js xử lý (xóa bản nháp cục bộ + thông báo).
function dbReject(o, e) {
  console.warn("Firestore từ chối đơn", o.id, e.code || e);
  window.dispatchEvent(new CustomEvent("gn-order-rejected", { detail: { id: o.id, code: e.code || "" } }));
}
// [Chống spam] Tạo đơn = 1 BATCH gồm: đơn (có sts = serverTimestamp) + trust/{uid} (lastOrderAt, dayCount) + devices/{deviceId} (lastOrderAt).
// firestore.rules dùng getAfter() để kiểm tra cả 3 cùng lúc: cách 45 giây, tối đa 10 đơn/ngày, hạn mức giá trị theo điểm uy tín.
function dbCreateOrder(o) {
  const fs = DB.fs;
  if (!fs) return;
  const ts = firebase.firestore.FieldValue.serverTimestamp();
  const uid = (typeof myUid === "function" && myUid()) || o.uid;
  const orderData = {
    ...o,
    uid,
    total: Number(o.total) || 0,
    status: 0,
    cancelled: false,
    sts: ts
  };

  fs.collection("orders").doc(String(o.id)).set(orderData)
    .then(() => {
      const tf = typeof guardBatchFields === "function" ? guardBatchFields(ts) : null;
      if (tf && uid) fs.doc("trust/" + uid).set(tf, { merge: true }).catch(() => {});
      if (o.deviceId) fs.doc("devices/" + o.deviceId).set({ lastOrderAt: ts }, { merge: true }).catch(() => {});
    })
    .catch(e => dbReject(o, e));
}
// KHÁCH chỉ được: (1) tạo đơn mới, (2) sửa đúng 3 trường của mình: cancelled, rating, upd. Trạng thái đơn (status) do admin quyết định.
// Hủy đơn muộn (sau 2 phút) phải kèm trừ điểm uy tín trong cùng batch, nếu không luật Firestore từ chối.
function dbMirrorCustomerOrders(list) {
  if (!DB.ordersReady) return;
  const col = DB.fs.collection("orders"), last = DB.last.gonow_orders, uid = (typeof myUid === "function") ? myUid() : "";
  list.forEach(o => {
    if (uid && o.uid !== uid) return;                         // không đụng tới đơn của uid khác
    const id = String(o.id), old = last[o.id] ? JSON.parse(last[o.id]) : null;
    if (!old) { last[o.id] = JSON.stringify(o); dbCreateOrder(o); return; }
    const patch = {};
    CUSTOMER_FIELDS.forEach(k => { if (JSON.stringify(o[k]) !== JSON.stringify(old[k])) patch[k] = o[k] === undefined ? firebase.firestore.FieldValue.delete() : o[k]; });
    if (Object.keys(patch).length) {
      last[o.id] = JSON.stringify({ ...old, ...o, status: old.status });
      const b = DB.fs.batch(); b.update(col.doc(id), patch);
      if (patch.cancelled === true && typeof guardTakePenalty === "function") { const p = guardTakePenalty(); if (p) b.set(DB.fs.doc("trust/" + o.uid), p, { merge: true }); }
      b.commit().catch(dbWarn);
    }
  });
}

function dbMirror(key, value) {
  if (!DB.fs) return;
  if (key === "gonow_orders" && !DB.admin) { dbMirrorCustomerOrders(value); return; }
  if (DB_COLL[key]) {
    const next = {}, last = DB.last[key], col = DB.fs.collection(DB_COLL[key]);
    value.forEach(x => { next[x.id] = JSON.stringify(x); });
    Object.keys(next).forEach(id => { if (next[id] !== last[id]) col.doc(String(id)).set(JSON.parse(next[id])).catch(dbWarn); });
    // [FIX] Chỉ admin mới được xóa tài liệu trên Firestore. Máy khách chỉ có bản sao cục bộ (có thể thiếu đơn cũ) nên KHÔNG được xóa gì.
    if (DB.admin) Object.keys(last).forEach(id => { if (!(id in next)) col.doc(String(id)).delete().catch(dbWarn); });
    DB.last[key] = next;
  } else if (key === "gonow_vouchers" || key === "gonow_settings") {
    DB.fs.doc("config/" + key.slice(6)).set({ json: JSON.stringify(value) }).catch(dbWarn);
  }
}
function dbRemote(key, docs) {         // dữ liệu từ Firestore về → ghi đệm + báo cho trang vẽ lại (không ghi ngược lên)
  DB.last[key] = {}; docs.forEach(x => { DB.last[key][x.id] = JSON.stringify(x); });
  if (key === "gonow_orders" && !DB.admin) {   // [FIX] khách: GỘP với đơn trên máy (không ghi đè). Bản nào mới hơn (upd) thắng; bằng nhau thì bản có trạng thái cao hơn thắng → đơn đã hoàn thành không bao giờ bị kéo lùi.
    const local = load(key, []), lById = new Map(local.map(x => [x.id, x])), rIds = new Set(docs.map(x => x.id));
    const pick = (r, l) => { const rv = r.upd || 0, lv = l.upd || 0; if (lv !== rv) return lv > rv ? l : r; return (l.status || 0) > (r.status || 0) ? l : r; };
    const localOnly = local.filter(x => !rIds.has(x.id));
    docs = [...docs.map(r => (lById.has(r.id) ? pick(r, lById.get(r.id)) : r)), ...localOnly].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    DB.ordersReady = true;
    if (localOnly.length) setTimeout(() => dbMirrorCustomerOrders(localOnly), 0);   // đơn đặt lúc chưa kịp đồng bộ → đẩy lên bây giờ
  }
  localStorage.setItem(key, JSON.stringify(docs));
  if (key === "gonow_foods") applyFoods(docs);
  dbPing(key);
}
let trustUnsub = null;
function dbWatchTrust(uid) {           // điểm uy tín của tài khoản (trust/{uid}); chưa có thì tạo bản ghi mặc định 100 điểm
  if (!DB.fs || !uid) return;
  if (trustUnsub) trustUnsub();
  const ref = DB.fs.doc("trust/" + uid);
  trustUnsub = ref.onSnapshot(d => {
    if (!d.exists) { ref.set({ score: 100, cancels: [], blocks: [], dayCount: 0, firstSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(dbWarn); return; }
    if (typeof guardApplyRemote === "function") guardApplyRemote(uid, d.data());
  }, dbWarn);
}
function dbWatchOrders(uid) {          // khách: chỉ nghe đơn của chính mình
  if (!DB.fs || !uid) return;
  if (DB.unsub) DB.unsub();
  DB.ordersReady = false;
  DB.unsub = DB.fs.collection("orders").where("uid", "==", uid).onSnapshot(
    s => dbRemote("gonow_orders", s.docs.map(d => d.data()).sort((a, b) => (b.ts || 0) - (a.ts || 0))), dbWarn);
}
function dbStart(app, isAdmin) {
  if (DB.fs || !app || !app.firestore) return;
  DB.fs = app.firestore();
  DB.admin = !!isAdmin;
  DB.fs.collection("foods").onSnapshot(s => {
    const l = s.docs.map(d => d.data()).sort((a, b) => a.id - b.id);
    if (l.length) dbRemote("gonow_foods", l); else if (isAdmin) save("gonow_foods", ALL_FOODS);   // lần đầu: admin đẩy thực đơn lên
  }, dbWarn);
  ["vouchers", "settings"].forEach(n => DB.fs.doc("config/" + n).onSnapshot(d => {
    if (d.exists) {
      const v = JSON.parse(d.data().json); localStorage.setItem("gonow_" + n, d.data().json);
      if (n === "vouchers") { Object.keys(VOUCHERS).forEach(k => delete VOUCHERS[k]); Object.assign(VOUCHERS, v); }
      else if (v.ship >= 0) SHIP_FEE = v.ship;
      dbPing("gonow_" + n);
    } else if (isAdmin) save("gonow_" + n, n === "vouchers" ? VOUCHERS : { ship: SHIP_FEE });
  }, dbWarn));
  if (isAdmin) DB.fs.collection("driverApps").onSnapshot(
    s => dbRemote("gonow_driverapps", s.docs.map(d => d.data()).sort((a, b) => (b.ts || 0) - (a.ts || 0))), dbWarn);
  if (isAdmin) DB.fs.collection("partnerApps").onSnapshot(
    s => dbRemote("gonow_partnerapps", s.docs.map(d => d.data()).sort((a, b) => (b.ts || 0) - (a.ts || 0))), dbWarn);
  if (isAdmin) DB.fs.collection("orders").onSnapshot(
    s => dbRemote("gonow_orders", s.docs.map(d => d.data()).sort((a, b) => (b.ts || 0) - (a.ts || 0))), dbWarn);
}