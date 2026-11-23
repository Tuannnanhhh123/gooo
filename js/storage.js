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
const DB = { fs: null, last: { gonow_orders: {}, gonow_foods: {} }, unsub: null };
const DB_COLL = { gonow_orders: "orders", gonow_foods: "foods" };
const dbWarn = e => console.warn("Firestore:", e.code || e);
const dbPing = key => window.dispatchEvent(new CustomEvent("gn-remote", { detail: { key } }));

function dbMirror(key, value) {
  if (!DB.fs) return;
  if (DB_COLL[key]) {
    const next = {}, last = DB.last[key], col = DB.fs.collection(DB_COLL[key]);
    value.forEach(x => { next[x.id] = JSON.stringify(x); });
    Object.keys(next).forEach(id => { if (next[id] !== last[id]) col.doc(String(id)).set(JSON.parse(next[id])).catch(dbWarn); });
    Object.keys(last).forEach(id => { if (!(id in next)) col.doc(String(id)).delete().catch(dbWarn); });
    DB.last[key] = next;
  } else if (key === "gonow_vouchers" || key === "gonow_settings") {
    DB.fs.doc("config/" + key.slice(6)).set({ json: JSON.stringify(value) }).catch(dbWarn);
  }
}
function dbRemote(key, docs) {         // dữ liệu từ Firestore về → ghi đệm + báo cho trang vẽ lại (không ghi ngược lên)
  DB.last[key] = {}; docs.forEach(x => { DB.last[key][x.id] = JSON.stringify(x); });
  localStorage.setItem(key, JSON.stringify(docs));
  if (key === "gonow_foods") applyFoods(docs);
  dbPing(key);
}
function dbWatchOrders(uid) {          // khách: chỉ nghe đơn của chính mình
  if (!DB.fs || !uid) return;
  if (DB.unsub) DB.unsub();
  DB.unsub = DB.fs.collection("orders").where("uid", "==", uid).onSnapshot(
    s => dbRemote("gonow_orders", s.docs.map(d => d.data()).sort((a, b) => (b.ts || 0) - (a.ts || 0))), dbWarn);
}
function dbStart(app, isAdmin) {
  if (DB.fs || !app || !app.firestore) return;
  DB.fs = app.firestore();
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
  if (isAdmin) DB.fs.collection("orders").onSnapshot(
    s => dbRemote("gonow_orders", s.docs.map(d => d.data()).sort((a, b) => (b.ts || 0) - (a.ts || 0))), dbWarn);
}
