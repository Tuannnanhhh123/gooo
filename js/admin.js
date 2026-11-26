// [AI] Kiểm tra các file bắt buộc. Nếu thiếu/ còn bản cũ thì báo lỗi ngay trên màn hình đăng nhập (thay vì trắng trang).
(function () {
  const need = {
    "js/config.js": typeof FIREBASE_CONFIG !== "undefined",
    "js/admin-config.js": typeof ADMIN_PASSCODE !== "undefined" && typeof ADMIN_EMAILS !== "undefined",
    "js/data.js": typeof FOODS !== "undefined" && typeof VOUCHERS !== "undefined" && typeof DISTRICTS !== "undefined",
    "js/storage.js": typeof load === "function" && typeof ALL_FOODS !== "undefined"
  };
  const bad = Object.keys(need).filter(k => !need[k]);
  if (bad.length) {
    document.getElementById("gate").hidden = false;
    document.getElementById("gMsg").textContent = "Không tải được hoặc còn là bản cũ: " + bad.join(", ") + ". Hãy thay bằng file mới nhất rồi tải lại trang (Ctrl+F5).";
    throw new Error("Thiếu file: " + bad.join(", "));
  }
})();
window.addEventListener("error", e => {   // lỗi bất ngờ khi chưa vào được → hiện ngay trên cổng đăng nhập
  const g = document.getElementById("gMsg"), gate = document.getElementById("gate");
  if (g && gate && !gate.hidden && !g.textContent) g.textContent = "Lỗi: " + e.message;
});

// [AI] Logic trang quản trị GoNow. Chia theo khu vực:
// tiện ích → dữ liệu → ngăn kéo/hộp thoại → đăng nhập → điều hướng → Tổng quan → Đơn hàng → Sản phẩm → Mã giảm giá → Cài đặt → sự kiện → khởi tạo.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = s => String(s || "").replace(/[<>]/g, "").trim();       // bỏ ký tự HTML khỏi tên/mô tả do admin nhập
const money = n => Math.round(n).toLocaleString("vi-VN") + "đ";
const fmtNum = n => Math.round(n).toLocaleString("vi-VN");
const short = n => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(".", ",") + "tr" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(Math.round(n));
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
const rnd = n => Math.floor(Math.random() * n);
const pick = arr => arr[rnd(arr.length)];

const DAY = 864e5;
const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };   // 00:00 của ngày chứa t
// Thời điểm đặt đơn: đơn mới có ts, đơn cũ chỉ có chuỗi createdAt ("14:30:05 10/11/2026")
function ots(o) {
  if (o.ts) return o.ts;
  const m = (o.createdAt || "").match(/(\d{1,2}):(\d{2}):(\d{2})\D+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(+m[6], +m[5] - 1, +m[4], +m[1], +m[2], +m[3]).getTime() : 0;
}
const fmtShort = t => new Date(t).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtFull = t => t ? new Date(t).toLocaleString("vi-VN") : "—";
const dm = t => { const d = new Date(t); return d.getDate() + "/" + (d.getMonth() + 1); };

const X_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5l14 14M19 5L5 19"/></svg>';
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  orders: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  products: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  drivers: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.400 3.600-7 8-7s8 2.600 8 7"/>',
  vouchers: '<path d="M3 7h18v4a2 2 0 000 2v4H3v-4a2 2 0 000-2z"/><path d="M14 7v10" stroke-dasharray="2 2"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
};

// ---- Dữ liệu (dùng chung LocalStorage với cửa hàng) ----
let orders = load("gonow_orders", []);
let driverApps = load("gonow_driverapps", []);   // hồ sơ tài xế gửi từ driver.html
const saveApps = () => { save("gonow_driverapps", driverApps); renderNav(); };
const saveOrders = () => { save("gonow_orders", orders); renderNav(); };
const saveFoods = () => save("gonow_foods", ALL_FOODS);       // ALL_FOODS đến từ storage.js (gồm cả món đang ẩn)
const saveVouchers = () => save("gonow_vouchers", VOUCHERS);
const ui = { range: 7, incPending: false, o: { q: "", type: "all", status: "all", page: 1 }, p: { q: "", cat: "all", vis: "all" }, d: { q: "", status: "all" } };
let curPage = "dashboard", curOrder = null, curDriver = null, editingId = 0, editingCode = "", formImg = "", formActive = true;

const imgSrc = f => f.img || `images/food/${f.id}.jpg`;
const th = src => `<span class="th"><img src="${esc(src)}" alt="" onerror="this.remove()"></span>`;
const stepsOf = o => (o.type === "food" ? FOOD_STEPS : RIDE_STEPS);
const isActive = o => !o.cancelled && o.status < 4;
function statusOf(o) {
  if (o.cancelled) return { label: "Đã hủy", cls: "p-bad" };
  if (o.status === 4) return { label: o.type === "food" ? "Đã giao" : "Hoàn thành", cls: "p-done" };
  return { label: stepsOf(o)[o.status], cls: "p-wait" };
}
const pill = o => { const s = statusOf(o); return `<span class="pill ${s.cls}">${s.label}</span>`; };
const itemName = i => i.name || (ALL_FOODS.find(f => f.id === i.id) || {}).name || "Món đã xóa";
const itemPrice = i => i.price ?? (ALL_FOODS.find(f => f.id === i.id) || {}).price ?? 0;
const summary = o => (o.items ? o.items.map(i => `${itemName(i)} ×${i.qty}`).join(", ") : o.detail.join(" • "));
const pendingCount = () => orders.filter(isActive).length;

// ---- Thông báo, ngăn kéo, hộp xác nhận ----
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400);
}
const pnHead = (title, sub = "") => `<div class="pnHead"><div><h2>${title}</h2>${sub}</div><button class="pnX" data-act="closePanel" aria-label="Đóng">${X_SVG}</button></div>`;
function openPanel(html) { $("#panel").innerHTML = html; $("#panelWrap").hidden = false; }
function closePanel() { $("#panelWrap").hidden = true; curOrder = null; }

let dlgRes = null;
function ask(title, msg, ok = "Xác nhận", danger = false) {
  return new Promise(res => {
    dlgRes = res;
    const d = $("#dialog"); d.className = danger ? "danger" : "";
    d.innerHTML = `<h3>${title}</h3><p>${msg}</p><div class="row"><button class="btn line" data-act="dlgNo">Hủy</button>
      <button class="btn ${danger ? "" : "brand"}" ${danger ? 'style="background:#c9302c"' : ""} data-act="dlgYes">${ok}</button></div>`;
    $("#dialogWrap").hidden = false;
  });
}
function dlgClose(v) { $("#dialogWrap").hidden = true; if (dlgRes) { dlgRes(v); dlgRes = null; } }

// ---- Đăng nhập quản trị ----
// Hai cách vào: (1) Mã quản trị ADMIN_PASSCODE – luôn dùng được; (2) Tài khoản Firebase có email trong ADMIN_EMAILS – chỉ khi đã điền Firebase.
// Admin dùng một "app" Firebase riêng tên "admin" nên không làm khách ở cửa hàng bị đăng xuất.
let auth = null, fbApp = null;
if (typeof firebase !== "undefined" && !!FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("DIEN")) {
  try { fbApp = firebase.initializeApp(FIREBASE_CONFIG, "admin"); auth = fbApp.auth(); } catch (err) { console.error(err); }
}
const fbMode = !!auth;
let gMode = "code";   // "code" | "fb"
const isAdminEmail = e => ADMIN_EMAILS.map(x => x.toLowerCase()).includes((e || "").toLowerCase());
const gMsg = t => { $("#gMsg").textContent = t; };

function renderGate() {
  $("#gTabs").hidden = !fbMode;
  $("#gTabs").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.id === gMode));
  $("#gEmailRow").hidden = $("#gPassRow").hidden = gMode !== "fb";
  $("#gCodeRow").hidden = gMode !== "code";
  $("#gNote").textContent = gMode === "fb" ? "Chỉ email có trong ADMIN_EMAILS (js/admin-config.js) mới vào được. Chế độ này đồng bộ dữ liệu lên Firestore."
    : "Mã DEMO (js/admin-config.js): chỉ xem thử trên máy này, KHÔNG đồng bộ Firestore và không phải bảo mật thật.";
}
function showGate() { $("#gate").hidden = false; $("#app").hidden = true; renderGate(); }
function enter(name) { $("#who").textContent = name; $("#gate").hidden = true; $("#app").hidden = false; route(); }
async function gateSubmit(e) {
  e.preventDefault(); gMsg("");
  if (gMode === "fb") {
    try { await auth.signInWithEmailAndPassword($("#gEmail").value.trim(), $("#gPass").value); }
    catch (err) { gMsg(err.code === "auth/network-request-failed" ? "Lỗi mạng. Kiểm tra kết nối internet." : "Sai email hoặc mật khẩu."); }
  } else if ($("#gCode").value.trim() === String(ADMIN_PASSCODE)) {
    sessionStorage.setItem("gonow_admin", "1"); enter("Quản trị viên (demo cục bộ)");
  } else gMsg("Mã quản trị không đúng.");
}
function logout() {
  sessionStorage.removeItem("gonow_admin");
  if (fbMode && auth.currentUser) auth.signOut();
  showGate();
}

// ---- Điều hướng ----
const NAV = [["dashboard", "Tổng quan"], ["orders", "Đơn hàng"], ["drivers", "Tài xế"], ["products", "Sản phẩm"], ["vouchers", "Mã giảm giá"], ["settings", "Cài đặt"]];
function renderNav() {
  const n = pendingCount();
  $("#nav").innerHTML = NAV.map(([k, label]) => `<a href="#${k}" class="${curPage === k ? "on" : ""}">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${ICONS[k]}</svg>${label}
    ${k === "orders" && n ? `<span class="cnt">${n}</span>` : ""}${k === "drivers" && pendingApps() ? `<span class="cnt">${pendingApps()}</span>` : ""}</a>`).join("");
}
const PAGES = {
  dashboard: ["Tổng quan", viewDashboard],
  orders: ["Đơn hàng", viewOrders, renderOrdersTable],
  drivers: ["Hồ sơ tài xế", viewDrivers, renderDriversTable],
  products: ["Sản phẩm", viewProducts, renderProductsTable],
  vouchers: ["Mã giảm giá", viewVouchers],
  settings: ["Cài đặt", viewSettings]
};
function route() {
  const key = location.hash.slice(1);
  curPage = PAGES[key] ? key : "dashboard";
  const [title, view, after] = PAGES[curPage];
  renderNav();
  $("#pageTitle").textContent = title;
  $("#crumb").textContent = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" });
  $("#headActions").innerHTML = curPage === "dashboard" ? rangeControls() : "";
  document.title = `${title} – GoNow Admin`;
  $("#view").innerHTML = view();
  if (after) after();
}
function refresh() { route(); if (curOrder && !$("#panelWrap").hidden) openOrder(curOrder); }


// =====================================================================
// HỒ SƠ TÀI XẾ (đăng ký từ driver.html)
const APP_ST = { pending: ["Chờ duyệt", "p-wait"], approved: ["Đã duyệt", "p-done"], rejected: ["Chưa đạt", "p-bad"] };
const appPill = a => { const s = APP_ST[a.status] || APP_ST.pending; return `<span class="pill ${s[1]}">${s[0]}</span>`; };
const pendingApps = () => driverApps.filter(a => a.status === "pending").length;
const DAYS_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"], SHIFTS_VN = ["Sáng", "Chiều", "Tối"];
const schedText = a => DAYS_VN.map((d, di) => { const s = SHIFTS_VN.filter((_, si) => (a.schedule || []).includes(di + "-" + si)); return s.length ? `${d}: ${s.join(", ")}` : ""; }).filter(Boolean).join(" • ") || "—";
const svcText = a => (a.services || []).map(k => k === "ride" ? "Đặt xe" : "Giao đồ ăn").join(", ") || "—";
function viewDrivers() {
  const c = s => driverApps.filter(a => a.status === s).length;
  return `<section class="panel"><div class="toolbar">
      <input class="in" id="dQ" placeholder="Tìm tên, SĐT, biển số, mã hồ sơ…" value="${esc(ui.d.q)}" style="min-width:260px">
      <select class="in" id="dStatus"><option value="all">Mọi trạng thái</option><option value="pending" ${ui.d.status === "pending" ? "selected" : ""}>Chờ duyệt (${c("pending")})</option><option value="approved" ${ui.d.status === "approved" ? "selected" : ""}>Đã duyệt (${c("approved")})</option><option value="rejected" ${ui.d.status === "rejected" ? "selected" : ""}>Chưa đạt (${c("rejected")})</option></select>
      <span class="sp"></span><span class="mut" style="font-size:14px">${driverApps.length} hồ sơ • <a href="driver.html" target="_blank" rel="noopener">Mở trang đăng ký ↗</a></span></div>
    <div id="drvTable"></div></section>`;
}
function renderDriversTable() {
  const q = norm(ui.d.q.trim());
  const list = driverApps.filter(a => (ui.d.status === "all" || a.status === ui.d.status) && (!q || norm([a.id, a.name, a.phone, a.plate, a.email, a.area].join(" ")).includes(q)));
  $("#drvTable").innerHTML = list.length ? `<div class="tblWrap"><table class="tbl"><thead><tr><th>Mã hồ sơ</th><th>Ứng viên</th><th>Khu vực</th><th>Phương tiện</th><th>Dịch vụ</th><th>Ngày gửi</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${list.map(a => `<tr><td class="id">${esc(a.id)}</td><td><b>${esc(a.name)}</b><br><small>${esc(a.phone)}</small></td><td>${esc(a.area)}</td>
      <td>${esc(a.vehicleName)}<br><small>${esc(a.brand)} • ${esc(a.plate)}</small></td><td>${esc(svcText(a))}</td><td>${fmtShort(a.ts)}</td><td>${appPill(a)}</td>
      <td class="acts"><button class="btn line sm" data-act="drvView" data-id="${esc(a.id)}">Xem hồ sơ</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><b>${driverApps.length ? "Không có hồ sơ phù hợp" : "Chưa có hồ sơ nào"}</b>${driverApps.length ? "Thử đổi từ khóa hoặc bộ lọc." : "Hồ sơ gửi từ trang driver.html sẽ hiện ở đây."}</div>`;
}
const DOC_LBL = { cccd: "CCCD (mặt trước)", cccdBack: "CCCD (mặt sau)", selfie: "Ảnh quét khuôn mặt", license: "Giấy phép lái xe", reg: "Giấy đăng ký xe", portrait: "Ảnh chân dung" };
// Kết quả sàng lọc tự động của trang đăng ký (chỉ để tham khảo – admin quyết định cuối cùng)
function kycHTML(a) {
  const k = a.kyc; if (!k) return `<div><p class="sub">SÀNG LỌC TỰ ĐỘNG</p><p class="mut" style="font-size:14px">Hồ sơ cũ, không có dữ liệu sàng lọc. Hãy tự đối chiếu ảnh.</p></div>`;
  const row = (ok, t) => `<li style="display:flex;gap:8px;font-size:14px;line-height:1.5"><b style="color:${ok === true ? "#007a3b" : ok === false ? "#d93025" : "#b7791f"}">${ok === true ? "✓" : ok === false ? "✕" : "!"}</b><span>${esc(t)}</span></li>`;
  const c = k.cccd || {}, l = k.lic || {}, lv = { pass: ["#007a3b", "ĐẠT sàng lọc tự động"], review: ["#b7791f", "CẦN XEM KỸ"], fail: ["#d93025", "KHÔNG ĐẠT sàng lọc"] }[k.level] || ["#566070", "—"];
  return `<div><p class="sub">SÀNG LỌC TỰ ĐỘNG (tham khảo)</p>
    <p style="margin:0 0 8px;font-weight:700;color:${lv[0]}">${lv[1]}</p>
    <ul style="list-style:none;margin:0;padding:0;display:grid;gap:4px">
      ${row(k.faceFound, "Ảnh chân dung trên CCCD: " + (k.faceFound ? "có" : k.faceFound === false ? "KHÔNG thấy" : "chưa kiểm tra"))}
      ${row(k.live && k.live.ok, "Thử thách người thật: " + (k.live ? (k.live.ok ? "đạt" : "không đạt") + " (" + (k.live.challenges || []).join(", ") + "), độ lệch khuôn mặt đầu–cuối " + k.live.sameDist : "chưa làm"))}
      ${row(k.faceLevel === "pass" ? true : k.faceLevel === "fail" ? false : null, "Khuôn mặt so với CCCD: khoảng cách " + (k.faceDist != null ? k.faceDist : "—") + " (≤ 0.50 khớp, > 0.65 không khớp)")}
      ${row(c.noOk, "Số CCCD OCR " + (c.noOk ? "khớp số đã khai" : "không khớp/không đọc được") + (c.readNo ? " (đọc: " + c.readNo + ")" : ""))}
      ${row(c.nameOk, "Họ tên trên CCCD: " + (c.nameOk ? "khớp" : c.nameOk === false ? "không khớp" : "—"))}
      ${row(c.dobOk, "Ngày sinh trên CCCD: " + (c.dobOk ? "khớp" : c.dobOk === false ? "không khớp" : "—"))}
      ${row(l.classOk, "Hạng bằng lái đọc được: " + (l.cls || "—") + (l.classOk === false ? " (KHÔNG hợp loại xe)" : ""))}
      ${row(l.expired === null || l.expired === undefined ? null : !l.expired, "Hạn bằng lái đọc được: " + (l.expiry || "—"))}
      ${Object.entries(k.src || {}).filter(([, v]) => v === "file").map(([n]) => row(false, "Ảnh “" + (DOC_LBL[n] || n) + "” tải từ thư viện, không chụp trực tiếp")).join("")}
    </ul>
    ${(k.hard || []).concat(k.flags || []).length ? `<p class="mut" style="font-size:13px;margin-top:6px">Cảnh báo: ${esc((k.hard || []).concat(k.flags || []).join("; "))}</p>` : ""}
    <p class="mut" style="font-size:12.5px;margin-top:6px">Chỉ là sàng lọc tự động chạy trên máy ứng viên. Hãy tự nhìn ảnh selfie so với ảnh trên CCCD, kiểm tra hình bằng lái có dấu hiệu chỉnh sửa, và đối chiếu số CCCD/biển số trước khi duyệt.</p></div>`;
}
function openDriver(id) {
  const a = driverApps.find(x => x.id === id); if (!a) return;
  curDriver = id;
  const age = a.dob ? Math.floor((Date.now() - new Date(a.dob)) / 31557600000) : "";
  const docs = Object.keys(DOC_LBL).filter(k => a.docs && a.docs[k]).map(k => `<figure class="dImg"><button type="button" data-act="drvImg" data-id="${esc(a.id)}:${k}" title="Bấm để mở ảnh lớn"><img src="${esc(a.docs[k])}" alt="${DOC_LBL[k]}"></button><figcaption>${DOC_LBL[k]}</figcaption></figure>`).join("");
  openPanel(`${pnHead("Hồ sơ " + esc(a.id), `<div style="margin-top:6px">${appPill(a)}</div>`)}
    <div class="pnBody">
      <div class="kv"><div><p>Họ tên</p><b>${esc(a.name)}</b></div><div><p>Gửi lúc</p>${fmtFull(a.ts)}</div>
        <div><p>Số CCCD khai</p>${esc(a.cccdNo || "—")}</div><div><p>Điện thoại</p>${esc(a.phone)}</div><div><p>Email</p>${esc(a.email)}</div>
        <div><p>Ngày sinh</p>${esc((a.dob || "").split("-").reverse().join("/"))}${age ? ` (${age} tuổi)` : ""}</div><div><p>Khu vực</p>${esc(a.area)}</div>
        <div><p>Phương tiện</p>${esc(a.vehicleName)} • ${esc(a.brand)}</div><div><p>Biển số • Năm • Màu</p>${esc(a.plate)} • ${esc(a.year)} • ${esc(a.color)}</div>
        <div><p>Loại chuyến</p>${esc(svcText(a))}</div><div><p>Giờ chạy / tuần</p>${esc(a.hours || "—")}</div></div>
      <div><p class="sub">LỊCH RẢNH</p><p style="font-size:14px;line-height:1.6">${esc(schedText(a))}</p></div>
      ${a.heard ? `<div><p class="sub">BIẾT GONOW QUA</p><p style="font-size:14px">${esc(a.heard)}</p></div>` : ""}
      ${kycHTML(a)}
      <div><p class="sub">GIẤY TỜ ĐÃ TẢI LÊN</p>${docs ? `<div class="dImgs">${docs}</div>` : `<p class="mut" style="font-size:14px">Không có ảnh (hồ sơ chỉ lưu bản rút gọn).</p>`}</div>
      <div><p class="sub">GHI CHÚ GỬI CHO ỨNG VIÊN</p>
        <label class="field"><textarea class="in" id="drvNote" maxlength="300" placeholder="Ví dụ: Ảnh bằng lái bị mờ, vui lòng chụp lại.">${esc(a.note || "")}</textarea><small>Ứng viên thấy ghi chú này ở trang đăng ký. Nên điền khi từ chối.</small></label></div>
      ${a.reviewedAt ? `<p class="mut" style="font-size:13px">Xử lý lần cuối: ${fmtFull(a.reviewedAt)}</p>` : ""}
    </div>
    <div class="pnFoot"><button class="btn danger" data-act="drvDelete" data-id="${esc(a.id)}">Xóa hồ sơ</button><span class="sp"></span>
      ${a.status !== "pending" ? `<button class="btn line" data-act="drvReopen" data-id="${esc(a.id)}">Đưa về chờ duyệt</button>` : ""}
      ${a.status !== "rejected" ? `<button class="btn danger" data-act="drvReject" data-id="${esc(a.id)}">Từ chối</button>` : ""}
      ${a.status !== "approved" ? `<button class="btn brand" data-act="drvApprove" data-id="${esc(a.id)}">Duyệt hồ sơ</button>` : ""}</div>`);
}
function setApp(id, status) {
  const a = driverApps.find(x => x.id === id); if (!a) return;
  const note = $("#drvNote") ? clean($("#drvNote").value).slice(0, 300) : a.note;
  if (status === "rejected" && !note) { toast("Hãy ghi lý do từ chối để ứng viên biết cách bổ sung."); const n = $("#drvNote"); if (n) n.focus(); return; }
  a.status = status; a.note = note; a.reviewedAt = Date.now();
  saveApps(); closePanel(); route();
  toast(status === "approved" ? "Đã duyệt hồ sơ " + id : status === "rejected" ? "Đã từ chối hồ sơ " + id : "Đã đưa hồ sơ " + id + " về chờ duyệt");
}
async function openDocImg(ref) {
  const [id, k] = ref.split(":"), a = driverApps.find(x => x.id === id); if (!a || !a.docs || !a.docs[k]) return;
  try { const b = await (await fetch(a.docs[k])).blob(); window.open(URL.createObjectURL(b), "_blank", "noopener"); } catch (e) { toast("Không mở được ảnh này."); }
}
// =====================================================================
// TỔNG QUAN
// =====================================================================
const rangeControls = () => `<div class="segc">${[7, 14, 30].map(n => `<button class="${ui.range === n ? "on" : ""}" data-act="range" data-id="${n}">${n} ngày</button>`).join("")}</div>
  <button class="tog" data-act="togglePending"><span class="sw ${ui.incPending ? "on" : ""}"></span>Gồm đơn đang xử lý</button>`;

// Doanh thu chỉ tính đơn đã hoàn thành (hoặc cả đơn đang xử lý nếu bật công tắc). Đơn hủy không bao giờ tính.
const counted = o => !o.cancelled && o.paid !== false && (o.status === 4 || ui.incPending);   // đơn chuyển khoản chưa nhận tiền không tính doanh thu
function stats(from, to) {
  const list = orders.filter(o => { const t = ots(o); return t >= from && t < to; });
  const ok = list.filter(counted), rev = ok.reduce((s, o) => s + o.total, 0), cancelled = list.filter(o => o.cancelled).length;
  return { list, ok, rev, n: ok.length, avg: ok.length ? rev / ok.length : 0, pending: list.filter(isActive).length, rate: list.length ? cancelled / list.length : 0 };
}
function dlt(c, p, goodUp = true) {
  if (!p) return '<span class="mut">Chưa có kỳ trước để so sánh</span>';
  const d = (c - p) / p * 100, up = d >= 0;
  return `<span class="${up === goodUp ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}%</span> <span class="mut">so với ${ui.range} ngày trước</span>`;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
function stack(parts) {
  const tot = parts.reduce((s, p) => s + p.val, 0);
  if (!tot) return '<p class="mut" style="font-size:14px">Chưa có dữ liệu</p>';
  return `<div class="stack">${parts.map(p => p.val ? `<i style="width:${p.val / tot * 100}%;background:${p.color}" title="${esc(p.label)}"></i>` : "").join("")}</div>
    <ul class="legend">${parts.map(p => `<li><span class="dot" style="background:${p.color}"></span><span>${esc(p.label)}</span><b>${money(p.val)}</b><em>${Math.round(p.val / tot * 100)}%</em></li>`).join("")}</ul>`;
}

function viewDashboard() {
  if (!orders.length) return `<div class="panel"><div class="empty"><b>Chưa có đơn hàng nào</b>Đơn đặt trên cửa hàng sẽ xuất hiện ở đây. Muốn xem thử biểu đồ ngay, hãy tạo dữ liệu mẫu.
    <br><button class="btn brand" data-act="genSample">Tạo 48 đơn mẫu</button></div></div>`;
  const n = ui.range, today = sod(Date.now()), from = today - (n - 1) * DAY, to = today + DAY;
  const cur = stats(from, to), prev = stats(from - n * DAY, from);

  // Biểu đồ cột: doanh thu theo ngày
  const vals = Array.from({ length: n }, (_, i) => {
    const d0 = from + i * DAY;
    return cur.ok.filter(o => { const t = ots(o); return t >= d0 && t < d0 + DAY; }).reduce((s, o) => s + o.total, 0);
  });
  const peak = Math.max(...vals), max = niceMax(peak), peakI = peak > 0 ? vals.indexOf(peak) : -1;
  const step = n <= 7 ? 1 : n <= 14 ? 2 : 5;
  const chart = `<div class="chartBox"><div class="chart">
      ${[0, .25, .5, .75, 1].map(p => `<div class="gl" style="top:${(1 - p) * 100}%"><span>${short(max * p)}</span></div>`).join("")}
      <div class="bars">${vals.map((v, i) => `<div class="bar ${i === peakI ? "peak" : ""}" style="height:${v / max * 100}%" data-tip="${dm(from + i * DAY)}: ${money(v)}"></div>`).join("")}</div></div>
      <div class="xl">${vals.map((_, i) => `<span>${(n - 1 - i) % step === 0 ? dm(from + i * DAY) : ""}</span>`).join("")}</div></div>
    <p class="chartNote">${peakI >= 0 ? `Ngày cao nhất: <b>${dm(from + peakI * DAY)}</b> với <b>${money(peak)}</b>.` : "Chưa có doanh thu trong khoảng này."}
      ${ui.incPending ? "" : " Chỉ tính đơn đã hoàn thành."}</p>`;

  // Tổng hợp theo loại đơn, thanh toán, món, danh mục
  const byType = { food: 0, ride: 0 }, byPay = {}, prod = new Map(), cat = new Map();
  cur.ok.forEach(o => {
    byType[o.type] += o.total; byPay[o.pay] = (byPay[o.pay] || 0) + o.total;
    (o.items || []).forEach(i => {
      const f = ALL_FOODS.find(x => x.id === i.id), rev = itemPrice(i) * i.qty;
      const p = prod.get(i.id) || { id: i.id, name: itemName(i), qty: 0, rev: 0, img: f ? imgSrc(f) : `images/food/${i.id}.jpg` };
      p.qty += i.qty; p.rev += rev; prod.set(i.id, p);
      const c = i.cat || (f && f.cat) || "Khác"; cat.set(c, (cat.get(c) || 0) + rev);
    });
  });
  const top = [...prod.values()].sort((a, b) => b.rev - a.rev).slice(0, 6), topMax = top.length ? top[0].rev : 1;
  const cats = [...cat.entries()].sort((a, b) => b[1] - a[1]), catMax = cats.length ? cats[0][1] : 1;
  const recent = [...orders].sort((a, b) => ots(b) - ots(a)).slice(0, 6);
  const payColors = ["#00b14f", "#14181c", "#9aa4ad", "#c9a227"];

  return `<div class="kpis">
      <div class="kpi"><p>Doanh thu</p><strong>${money(cur.rev)}</strong><small>${dlt(cur.rev, prev.rev)}</small></div>
      <div class="kpi"><p>${ui.incPending ? "Số đơn" : "Đơn hoàn thành"}</p><strong>${cur.n}</strong><small>${dlt(cur.n, prev.n)}</small></div>
      <div class="kpi"><p>Giá trị trung bình / đơn</p><strong>${money(cur.avg)}</strong><small>${dlt(cur.avg, prev.avg)}</small></div>
      <div class="kpi"><p>Tỷ lệ hủy</p><strong>${(cur.rate * 100).toFixed(0)}%</strong><small>${dlt(cur.rate, prev.rate, false)}</small></div>
    </div>
    <div class="dgrid">
      <section class="panel"><div class="ph"><h3>Doanh thu ${n} ngày gần nhất</h3><span class="mut" style="font-size:13px">${cur.pending} đơn đang xử lý</span></div>${chart}</section>
      <div class="stackCol">
        <section class="panel"><div class="ph"><h3>Cơ cấu doanh thu</h3></div><div class="pb">
          <p class="sub" style="margin-top:0">THEO LOẠI ĐƠN</p>${stack([{ label: "Đồ ăn", val: byType.food, color: "#00b14f" }, { label: "Chuyến xe", val: byType.ride, color: "#14181c" }])}
          <p class="sub">THEO THANH TOÁN</p>${stack(Object.entries(byPay).map(([label, val], i) => ({ label, val, color: payColors[i % 4] })))}
        </div></section>
      </div>
    </div>
    <div class="dgrid three">
      <section class="panel"><div class="ph"><h3>Món bán chạy</h3></div><div class="pb">
        ${top.length ? `<ul class="rank">${top.map(p => `<li>${th(p.img)}<div style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="meter"><i style="width:${p.rev / topMax * 100}%"></i></div></div><div class="v">${money(p.rev)}<small>${p.qty} phần</small></div></li>`).join("")}</ul>` : '<p class="mut" style="font-size:14px">Chưa có đơn đồ ăn trong khoảng này.</p>'}
      </div></section>
      <section class="panel"><div class="ph"><h3>Doanh số theo danh mục</h3></div><div class="pb">
        ${cats.length ? `<ul class="cat">${cats.map(([c, v]) => `<li><div class="top"><span>${esc(c)}</span><b>${money(v)}</b></div><div class="meter"><i style="width:${v / catMax * 100}%"></i></div></li>`).join("")}</ul>` : '<p class="mut" style="font-size:14px">Chưa có dữ liệu.</p>'}
      </div></section>
      <section class="panel"><div class="ph"><h3>Đơn gần đây</h3><a href="#orders">Xem tất cả</a></div><div class="pb">
        <ul class="recent">${recent.map(o => `<li><div><b>${esc(o.id)}</b><small>${esc(o.customer || "Khách vãng lai")} • ${fmtShort(ots(o))}</small></div><div style="text-align:right"><b>${money(o.total)}</b><br>${pill(o)}</div></li>`).join("")}</ul>
      </div></section>
    </div>`;
}

// =====================================================================
// ĐƠN HÀNG
// =====================================================================
function viewOrders() {
  const o = ui.o;
  return `<section class="panel">
    <div class="toolbar">
      <input class="in searchIn" id="oQ" placeholder="Tìm mã đơn, khách hàng, món..." value="${esc(o.q)}">
      <select class="in" id="oType"><option value="all">Mọi loại đơn</option><option value="food" ${o.type === "food" ? "selected" : ""}>Đơn đồ ăn</option><option value="ride" ${o.type === "ride" ? "selected" : ""}>Chuyến xe</option></select>
      <select class="in" id="oStatus"><option value="all">Mọi trạng thái</option><option value="active" ${o.status === "active" ? "selected" : ""}>Đang xử lý</option><option value="done" ${o.status === "done" ? "selected" : ""}>Hoàn thành</option><option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>Đã hủy</option></select>
      <span class="sp"></span>
      <button class="btn line" data-act="csv">Xuất CSV</button>
    </div>
    <div id="ordTable"></div></section>`;
}
function filteredOrders() {
  const f = ui.o, q = norm(f.q);
  return orders.filter(o =>
    (f.type === "all" || o.type === f.type) &&
    (f.status === "all" || (f.status === "active" && isActive(o)) || (f.status === "done" && !o.cancelled && o.status === 4) || (f.status === "cancelled" && o.cancelled)) &&
    (!q || norm([o.id, o.customer || "", summary(o), o.pay, o.code].join(" ")).includes(q))
  ).sort((a, b) => ots(b) - ots(a));
}
function renderOrdersTable() {
  const list = filteredOrders(), per = 10, pages = Math.max(1, Math.ceil(list.length / per));
  ui.o.page = Math.min(ui.o.page, pages);
  const rows = list.slice((ui.o.page - 1) * per, ui.o.page * per);
  $("#ordTable").innerHTML = rows.length ? `<div class="tblWrap"><table class="tbl"><thead><tr>
      <th>Mã đơn</th><th>Thời gian</th><th>Khách hàng</th><th>Nội dung</th><th>Thanh toán</th><th class="num">Tổng tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${rows.map(o => `<tr><td class="id">${esc(o.id)}<br><small>${o.type === "food" ? "Đồ ăn" : "Chuyến xe"}</small></td>
        <td>${fmtShort(ots(o))}</td><td>${esc(o.customer || "Khách vãng lai")}</td>
        <td><div class="clip" title="${esc(summary(o))}">${esc(summary(o))}</div></td>
        <td>${esc(o.pay)}${o.code ? `<br><small>Mã ${esc(o.code)}</small>` : ""}</td>
        <td class="num"><b>${money(o.total)}</b></td><td>${pill(o)}</td>
        <td class="acts"><button class="btn line sm" data-act="ordView" data-id="${esc(o.id)}">Xem</button>
          ${isActive(o) ? `<button class="btn sm" data-act="ordNext" data-id="${esc(o.id)}" title="Chuyển sang: ${stepsOf(o)[o.status + 1]}">Tiếp ▸</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="pager"><span>Hiển thị ${(ui.o.page - 1) * per + 1}–${(ui.o.page - 1) * per + rows.length} / ${list.length} đơn</span>
        <div><button class="btn line sm" data-act="page" data-id="${ui.o.page - 1}" ${ui.o.page <= 1 ? "disabled" : ""}>‹ Trước</button>
          <span style="align-self:center">Trang ${ui.o.page}/${pages}</span>
          <button class="btn line sm" data-act="page" data-id="${ui.o.page + 1}" ${ui.o.page >= pages ? "disabled" : ""}>Sau ›</button></div></div>`
    : `<div class="empty"><b>Không có đơn phù hợp</b>Thử đổi từ khóa hoặc bộ lọc.</div>`;
}

function setStatus(id, v) {
  orders = load("gonow_orders", orders);   // [FIX] đọc bản mới nhất (khách có thể vừa đặt đơn mới) trước khi ghi
  const o = orders.find(x => x.id === id); if (!o) return;
  if (v === "x") o.cancelled = true; else { o.cancelled = false; o.status = +v; }
  o.upd = Date.now();
  saveOrders(); refresh();
}
function openOrder(id) {
  const o = orders.find(x => x.id === id); if (!o) return;
  curOrder = id;
  const steps = stepsOf(o);
  const items = o.items
    ? o.items.map(i => { const f = ALL_FOODS.find(x => x.id === i.id), p = itemPrice(i);
        return `<li>${th(f ? imgSrc(f) : `images/food/${i.id}.jpg`)}<span class="g"><b>${esc(itemName(i))}</b><br><small>${money(p)} × ${i.qty}</small></span><b>${money(p * i.qty)}</b></li>`; }).join("")
    : o.detail.map(d => `<li><span class="g">${esc(d)}</span></li>`).join("");
  openPanel(`${pnHead("Đơn " + esc(o.id), `<div style="margin-top:6px">${pill(o)}</div>`)}
    <div class="pnBody">
      <div class="kv"><div><p>Thời gian đặt</p>${fmtFull(ots(o))}</div><div><p>Loại đơn</p>${o.type === "food" ? "Đồ ăn" : "Chuyến xe"}</div>
        <div><p>Khách hàng</p>${esc(o.customer || "Khách vãng lai")}</div><div><p>Thanh toán</p>${esc(o.pay)}${o.paid === false ? " – CHƯA nhận tiền" : ""}</div>${o.phone ? `<div><p>Giao đến</p>${esc(o.phone)}<br>${esc(o.address || "")}${o.note ? "<br><i>" + esc(o.note) + "</i>" : ""}</div>` : ""}${o.storeName ? `<div><p>Cửa hàng</p>${esc(o.storeName)} (${o.km} km)</div>` : ""}
        <div><p>Mã giảm giá</p>${o.code ? esc(o.code) : "—"}</div></div>
      <div><p class="sub">${o.type === "food" ? "MÓN ĐÃ ĐẶT" : "CHI TIẾT CHUYẾN"}</p><ul class="lines">${items}</ul></div>
      <div class="sumRows"><div><span>Tạm tính</span><span>${money(o.subtotal)}</span></div>
        ${o.type === "food" ? `<div><span>Phí giao hàng</span><span>${money(o.ship)}</span></div>` : ""}
        <div><span>Giảm giá</span><span>−${money(o.discount)}</span></div><div class="tot"><span>Tổng cộng</span><span>${money(o.total)}</span></div></div>
      <div><p class="sub">TRẠNG THÁI ĐƠN</p>
        <div class="steps ${o.cancelled ? "x" : ""}">${steps.map((s, i) => `<span class="${i <= o.status ? "on" : ""}">${s}</span>`).join("")}</div>
        <label class="field" style="margin-top:14px">Cập nhật trạng thái<select class="in" id="stSel" data-id="${esc(o.id)}">
          ${steps.map((s, i) => `<option value="${i}" ${!o.cancelled && o.status === i ? "selected" : ""}>${s}</option>`).join("")}
          <option value="x" ${o.cancelled ? "selected" : ""}>Đã hủy</option></select></label></div>
    </div>
    <div class="pnFoot"><button class="btn danger" data-act="ordDelete" data-id="${esc(o.id)}">Xóa đơn</button><span class="sp"></span>
      ${o.cancelled ? `<button class="btn line" data-act="ordRestore" data-id="${esc(o.id)}">Khôi phục đơn</button>`
        : `<button class="btn danger" data-act="ordCancel" data-id="${esc(o.id)}">Hủy đơn</button>`}
      ${o.paid === false && !o.cancelled ? `<button class="btn" data-act="ordPaid" data-id="${esc(o.id)}">Đã nhận tiền</button>` : ""}${isActive(o) ? `<button class="btn brand" data-act="ordNext" data-id="${esc(o.id)}">Chuyển: ${steps[o.status + 1]}</button>` : ""}</div>`);
}

function exportCSV() {
  const q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const head = ["Mã đơn", "Thời gian", "Loại", "Khách hàng", "Nội dung", "Thanh toán", "Mã giảm giá", "Tạm tính", "Phí giao", "Giảm giá", "Tổng", "Trạng thái"];
  const rows = filteredOrders().map(o => [o.id, fmtFull(ots(o)), o.type === "food" ? "Đồ ăn" : "Chuyến xe", o.customer || "Khách vãng lai", summary(o), o.pay, o.code || "", o.subtotal, o.ship, o.discount, o.total, statusOf(o).label]);
  download(`gonow-don-hang-${new Date().toISOString().slice(0, 10)}.csv`, "\ufeff" + [head, ...rows].map(r => r.map(q).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  toast(`Đã xuất ${rows.length} đơn`);
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// =====================================================================
// SẢN PHẨM
// =====================================================================
const catsList = () => [...new Set(ALL_FOODS.map(f => f.cat))];
function viewProducts() {
  const p = ui.p;
  return `<div class="strip" id="pStrip"></div>
    <section class="panel"><div class="toolbar">
      <input class="in searchIn" id="pQ" placeholder="Tìm sản phẩm..." value="${esc(p.q)}">
      <select class="in" id="pCat"><option value="all">Mọi danh mục</option>${catsList().map(c => `<option ${p.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <select class="in" id="pVis"><option value="all">Hiện và ẩn</option><option value="on" ${p.vis === "on" ? "selected" : ""}>Đang hiển thị</option><option value="off" ${p.vis === "off" ? "selected" : ""}>Đang ẩn</option></select>
      <span class="sp"></span>
      <button class="btn line" data-act="bulkOpen">Chỉnh giá hàng loạt</button>
      <button class="btn brand" data-act="prodNew">+ Thêm sản phẩm</button>
    </div><div id="prodTable"></div></section>`;
}
function renderProdStrip() {
  const on = ALL_FOODS.filter(f => f.active !== false).length, avg = ALL_FOODS.length ? ALL_FOODS.reduce((s, f) => s + f.price, 0) / ALL_FOODS.length : 0;
  const el = $("#pStrip"); if (!el) return;
  el.innerHTML = `<div><p>Tổng sản phẩm</p><strong>${ALL_FOODS.length}</strong></div><div><p>Đang hiển thị</p><strong>${on}</strong></div>
    <div><p>Đang ẩn</p><strong>${ALL_FOODS.length - on}</strong></div><div><p>Danh mục</p><strong>${catsList().length}</strong></div><div><p>Giá trung bình</p><strong>${money(avg)}</strong></div>`;
}
function renderProductsTable() {
  renderProdStrip();
  const p = ui.p, q = norm(p.q);
  const list = ALL_FOODS.filter(f => (p.cat === "all" || f.cat === p.cat) && (p.vis === "all" || (p.vis === "on") === (f.active !== false)) && (!q || norm(f.name + " " + f.cat + " " + f.desc).includes(q)));
  const sold = {}; orders.filter(o => !o.cancelled).forEach(o => (o.items || []).forEach(i => { sold[i.id] = (sold[i.id] || 0) + i.qty; }));
  $("#prodTable").innerHTML = list.length ? `<div class="tblWrap"><table class="tbl"><thead><tr>
      <th>Sản phẩm</th><th>Danh mục</th><th class="num">Giá bán</th><th class="num">Đánh giá</th><th class="num">Đã bán</th><th>Hiển thị</th><th></th></tr></thead><tbody>
      ${list.map(f => `<tr data-row="${f.id}" class="${f.active === false ? "off" : ""}">
        <td><div class="pcell">${th(imgSrc(f))}<div><b>${esc(f.name)}</b><small>${esc(f.desc)}</small></div></div></td>
        <td>${esc(f.cat)}</td>
        <td class="num"><span class="pwrap"><input class="priceIn" data-id="${f.id}" value="${fmtNum(f.price)}" inputmode="numeric" aria-label="Giá ${esc(f.name)}"><u>đ</u></span></td>
        <td class="num">★ ${f.rating}</td><td class="num">${sold[f.id] || 0}</td>
        <td><button class="tog" data-act="prodToggle" data-id="${f.id}" aria-label="Bật/tắt hiển thị"><span class="sw ${f.active !== false ? "on" : ""}"></span></button></td>
        <td class="acts"><button class="btn line sm" data-act="prodEdit" data-id="${f.id}">Sửa</button><button class="btn danger sm" data-act="prodDelete" data-id="${f.id}">Xóa</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="pager"><span>${list.length} sản phẩm. Bấm vào giá để sửa nhanh, nhấn Enter để lưu.</span></div>`
    : `<div class="empty"><b>Không có sản phẩm phù hợp</b><button class="btn brand" data-act="prodNew">+ Thêm sản phẩm</button></div>`;
}

function openProduct(id) {
  const f = id ? ALL_FOODS.find(x => x.id === id) : { name: "", price: "", cat: "", rating: 4.5, desc: "", img: "", active: true };
  editingId = id || 0; formImg = f.img || ""; formActive = f.active !== false;
  openPanel(`${pnHead(id ? "Sửa sản phẩm" : "Thêm sản phẩm", id ? `<small>Mã #${id}</small>` : "")}
    <div class="pnBody">
      <label class="field">Tên sản phẩm<input class="in" id="fName" maxlength="60" value="${esc(f.name)}"></label>
      <div class="two">
        <label class="field">Danh mục<input class="in" id="fCat" list="catList" maxlength="30" value="${esc(f.cat)}" placeholder="Chọn hoặc gõ mới"><datalist id="catList">${catsList().map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
        <label class="field">Giá bán (đ)<input class="in" id="fPrice" inputmode="numeric" value="${f.price}"></label></div>
      <div class="two">
        <label class="field">Đánh giá (0–5)<input class="in" id="fRating" type="number" min="0" max="5" step="0.1" value="${f.rating}"></label>
        <div class="field">Hiển thị trên cửa hàng<button class="tog" type="button" data-act="fActive" style="height:38px"><span class="sw ${formActive ? "on" : ""}" id="fSw"></span><span id="fSwT">${formActive ? "Đang hiển thị" : "Đang ẩn"}</span></button></div></div>
      <label class="field">Mô tả ngắn<textarea class="in" id="fDesc" maxlength="140">${esc(f.desc)}</textarea></label>
      <div class="field">Ảnh sản phẩm
        <div class="upl"><div class="pv" id="fPv"></div>
          <div class="ctl"><div style="display:flex;gap:8px"><button class="btn line sm" type="button" data-act="pickImg">Chọn ảnh từ máy</button><button class="btn line sm" type="button" data-act="clearImg">Xóa ảnh</button></div>
            <input class="in" id="fImgPath" placeholder="hoặc dán đường dẫn: images/food/ten-mon.jpg" value="${formImg.startsWith("data:") ? "" : esc(formImg)}">
            <small>Ảnh tải lên được thu nhỏ và lưu trong trình duyệt. Để trống thì cửa hàng dùng images/food/${id || "&lt;mã&gt;"}.jpg.</small></div></div></div>
    </div>
    <div class="pnFoot"><button class="btn line" data-act="closePanel">Hủy</button><span class="sp"></span><button class="btn brand" data-act="prodSave">${id ? "Lưu thay đổi" : "Thêm sản phẩm"}</button></div>`);
  renderPv();
}
const renderPv = () => { const el = $("#fPv"); if (el) el.innerHTML = formImg ? `<img src="${esc(formImg)}" alt="" onerror="this.remove()">` : ""; };

// Thu nhỏ ảnh tải lên (tối đa 560px) để không đầy bộ nhớ trình duyệt
function loadImage(file) {
  const rd = new FileReader();
  rd.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 560 / Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      formImg = c.toDataURL("image/jpeg", 0.8); $("#fImgPath").value = ""; renderPv();
    };
    im.onerror = () => toast("Không đọc được file ảnh này");
    im.src = rd.result;
  };
  rd.readAsDataURL(file);
}

function saveProduct() {
  const name = clean($("#fName").value), cat = clean($("#fCat").value), desc = clean($("#fDesc").value);
  const price = parseInt($("#fPrice").value.replace(/\D/g, ""), 10), rating = parseFloat($("#fRating").value);
  if (!name) return toast("Vui lòng nhập tên sản phẩm");
  if (!cat) return toast("Vui lòng nhập danh mục");
  if (isNaN(price) || price < 0) return toast("Giá bán không hợp lệ");
  if (isNaN(rating) || rating < 0 || rating > 5) return toast("Đánh giá phải từ 0 đến 5");
  const data = { name, cat, desc, price, rating: Math.round(rating * 10) / 10, img: formImg, active: formActive };
  if (editingId) Object.assign(ALL_FOODS.find(x => x.id === editingId), data);
  else ALL_FOODS.push({ id: nextFoodId(), ...data });
  saveFoods(); closePanel(); route(); toast(editingId ? "Đã lưu thay đổi" : "Đã thêm sản phẩm");
}

// Chỉnh giá hàng loạt
function bulkCalc() {
  const scope = $("#bScope").value, up = $("#bDir").value === "up", pct = $("#bUnit").value === "pct";
  const amt = parseFloat($("#bAmt").value) || 0, round = $("#bRound").checked;
  return ALL_FOODS.filter(f => scope === "all" || f.cat === scope).map(f => {
    let nv = pct ? f.price * (1 + (up ? 1 : -1) * amt / 100) : f.price + (up ? 1 : -1) * amt;
    nv = Math.max(0, round ? Math.round(nv / 1000) * 1000 : Math.round(nv));
    return { f, old: f.price, nv };
  });
}
function bulkPreview() {
  const list = bulkCalc(), changed = list.filter(x => x.nv !== x.old);
  $("#bPrev").innerHTML = `<b>${changed.length}</b> / ${list.length} sản phẩm sẽ đổi giá.` +
    changed.slice(0, 3).map(x => `<span>${esc(x.f.name)}: ${money(x.old)} → <b>${money(x.nv)}</b></span>`).join("");
}
function openBulk() {
  openPanel(`${pnHead("Chỉnh giá hàng loạt", "<small>Áp dụng cho nhiều sản phẩm cùng lúc</small>")}
    <div class="pnBody">
      <label class="field">Phạm vi<select class="in" id="bScope"><option value="all">Tất cả sản phẩm</option>${catsList().map(c => `<option>${esc(c)}</option>`).join("")}</select></label>
      <div class="two"><label class="field">Hướng<select class="in" id="bDir"><option value="up">Tăng giá</option><option value="down">Giảm giá</option></select></label>
        <label class="field">Đơn vị<select class="in" id="bUnit"><option value="pct">Phần trăm (%)</option><option value="vnd">Số tiền (đ)</option></select></label></div>
      <label class="field">Mức điều chỉnh<input class="in" id="bAmt" type="number" min="0" step="any" value="10"></label>
      <label class="tog"><input type="checkbox" id="bRound" checked> Làm tròn đến nghìn đồng</label>
      <div class="preview" id="bPrev"></div>
    </div>
    <div class="pnFoot"><button class="btn line" data-act="closePanel">Hủy</button><span class="sp"></span><button class="btn brand" data-act="bulkApply">Áp dụng</button></div>`);
  bulkPreview();
}

// =====================================================================
// MÃ GIẢM GIÁ
// =====================================================================
function viewVouchers() {
  const codes = Object.keys(VOUCHERS), used = c => orders.filter(o => !o.cancelled && (o.codes || String(o.code || "").split("+")).includes(c)).length;
  return `<section class="panel"><div class="toolbar"><span class="mut" style="font-size:14px">${codes.length} mã. Khách nhập mã ở bước thanh toán. Mỗi tài khoản dùng mỗi mã 1 lần; các mã khác loại (giảm % + miễn phí giao) cộng dồn được.</span><span class="sp"></span>
    <button class="btn brand" data-act="vNew">+ Thêm mã</button></div>
    ${codes.length ? `<div class="tblWrap"><table class="tbl"><thead><tr><th>Mã</th><th>Áp dụng cho</th><th>Ưu đãi</th><th class="num">Đơn tối thiểu</th><th class="num">Đã dùng</th><th></th></tr></thead><tbody>
      ${codes.map(c => { const v = VOUCHERS[c]; return `<tr><td class="id">${esc(c)}</td><td>${v.type === "food" ? "Đồ ăn" : "Chuyến xe"}</td>
        <td>${esc(v.text)}<br><small>${v.pct ? "Giảm " + v.pct + "%" : "Miễn phí giao hàng"}</small></td>
        <td class="num">${v.min ? money(v.min) : "—"}</td><td class="num">${used(c)}</td>
        <td class="acts"><button class="btn line sm" data-act="vEdit" data-id="${esc(c)}">Sửa</button><button class="btn danger sm" data-act="vDelete" data-id="${esc(c)}">Xóa</button></td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="empty"><b>Chưa có mã giảm giá</b></div>`}</section>`;
}
function openVoucher(code) {
  const v = code ? VOUCHERS[code] : { type: "food", pct: 10, text: "", min: 0 };
  editingCode = code || "";
  const kind = v.freeship ? "free" : "pct";
  openPanel(`${pnHead(code ? "Sửa mã " + esc(code) : "Thêm mã giảm giá")}
    <div class="pnBody">
      <label class="field">Mã (chữ và số, viết liền)<input class="in" id="vCode" maxlength="16" value="${esc(code || "")}" style="text-transform:uppercase"></label>
      <div class="two"><label class="field">Áp dụng cho<select class="in" id="vType"><option value="food" ${v.type === "food" ? "selected" : ""}>Đơn đồ ăn</option><option value="ride" ${v.type === "ride" ? "selected" : ""}>Chuyến xe</option></select></label>
        <label class="field">Loại ưu đãi<select class="in" id="vKind"><option value="pct" ${kind === "pct" ? "selected" : ""}>Giảm theo %</option><option value="free" ${kind === "free" ? "selected" : ""}>Miễn phí giao (chỉ đồ ăn)</option></select></label></div>
      <div class="two"><label class="field">Phần trăm giảm<input class="in" id="vPct" type="number" min="1" max="100" value="${v.pct || 10}"></label>
        <label class="field">Đơn tối thiểu (đ)<input class="in" id="vMin" inputmode="numeric" value="${v.min || 0}"></label></div>
      <label class="field">Mô tả hiển thị cho khách<input class="in" id="vText" maxlength="70" value="${esc(v.text || "")}" placeholder="Để trống để tự tạo"></label>
    </div>
    <div class="pnFoot"><button class="btn line" data-act="closePanel">Hủy</button><span class="sp"></span><button class="btn brand" data-act="vSave">Lưu mã</button></div>`);
}
function saveVoucher() {
  const code = $("#vCode").value.trim().toUpperCase(), type = $("#vType").value, kind = $("#vKind").value;
  const pct = parseInt($("#vPct").value, 10), min = parseInt($("#vMin").value.replace(/\D/g, ""), 10) || 0;
  if (!/^[A-Z0-9]{3,16}$/.test(code)) return toast("Mã gồm 3–16 chữ hoặc số, không dấu, không khoảng trắng");
  if (code !== editingCode && VOUCHERS[code]) return toast("Mã này đã tồn tại");
  if (kind === "free" && type !== "food") return toast("Miễn phí giao chỉ áp dụng cho đơn đồ ăn");
  if (kind === "pct" && (isNaN(pct) || pct < 1 || pct > 100)) return toast("Phần trăm giảm từ 1 đến 100");
  const text = clean($("#vText").value) || (kind === "pct" ? `Giảm ${pct}% ${type === "food" ? "đơn đồ ăn" : "chuyến xe"}` : `Miễn phí giao cho đơn từ ${money(min)}`);
  const v = { type, text }; if (kind === "pct") v.pct = pct; else v.freeship = true; if (min > 0) v.min = min;
  if (editingCode && editingCode !== code) delete VOUCHERS[editingCode];
  VOUCHERS[code] = v; saveVouchers(); closePanel(); route(); toast("Đã lưu mã " + code);
}

// =====================================================================
// CÀI ĐẶT
// =====================================================================
function viewSettings() {
  const sampleN = orders.filter(o => o.sample).length;
  return `<section class="panel"><div class="ph"><h3>Cửa hàng</h3></div><ul class="set">
      <li><div class="t"><b>Phí giao hàng</b><small>Áp dụng cho mọi đơn đồ ăn (trừ khi dùng mã miễn phí giao).</small></div>
        <div class="ctl"><input class="in" id="setShip" inputmode="numeric" value="${fmtNum(SHIP_FEE)}"><button class="btn brand" data-act="setShip">Lưu</button></div></li></ul></section>
    <section class="panel" style="margin-top:20px"><div class="ph"><h3>Dữ liệu</h3></div><ul class="set">
      <li><div class="t"><b>Dữ liệu mẫu</b><small>Tạo 48 đơn hàng giả trong 30 ngày qua để xem biểu đồ. Đơn mẫu có thể xóa riêng, không ảnh hưởng đơn thật. Hiện có ${sampleN} đơn mẫu.</small></div>
        <div class="ctl"><button class="btn line" data-act="genSample">Tạo đơn mẫu</button><button class="btn line" data-act="clearSample" ${sampleN ? "" : "disabled"}>Xóa đơn mẫu</button></div></li>
      <li><div class="t"><b>Sao lưu và khôi phục</b><small>Tải toàn bộ đơn hàng, sản phẩm, mã giảm giá về file JSON, hoặc nạp lại từ file đã lưu. Nên sao lưu trước buổi bảo vệ đồ án.</small></div>
        <div class="ctl"><button class="btn line" data-act="exportJSON">Tải file sao lưu</button><button class="btn line" data-act="importOpen">Nạp từ file</button></div></li></ul></section>
    <section class="panel dangerZone" style="margin-top:20px"><div class="ph"><h3>Vùng nguy hiểm</h3></div><ul class="set">
      <li><div class="t"><b>Xóa toàn bộ đơn hàng</b><small>${orders.length} đơn sẽ bị xóa vĩnh viễn.</small></div><div class="ctl"><button class="btn danger" data-act="clearOrders">Xóa đơn hàng</button></div></li>
      <li><div class="t"><b>Đặt lại sản phẩm và mã giảm giá</b><small>Quay về danh sách gốc trong data.js. Đơn hàng được giữ nguyên.</small></div><div class="ctl"><button class="btn danger" data-act="resetCatalog">Đặt lại mặc định</button></div></li></ul></section>
    <p class="hint" style="margin-top:16px">Dữ liệu lưu trong trình duyệt này (LocalStorage), dùng chung với trang cửa hàng khi mở cùng địa chỉ. Đơn của khách ở máy khác sẽ không hiện ở đây cho đến khi chuyển sang Firebase Firestore.</p>`;
}

// Tạo đơn mẫu
function genSample() {
  const foods = ALL_FOODS.filter(f => f.active !== false), names = ["Nguyễn Minh Anh", "Trần Quốc Bảo", "Lê Thu Hà", "Phạm Gia Huy", "Võ Ngọc Lan", "Đặng Hoàng Nam", "Bùi Thanh Tâm", "Hoàng Khánh Linh", "Đỗ Thảo Vy", "Ngô Đức Long"];
  if (!foods.length) return toast("Cần ít nhất một sản phẩm đang hiển thị");
  const used = new Set(orders.map(o => o.id)), out = [], now = Date.now();
  for (let k = 0; k < 48; k++) {
    const daysAgo = rnd(30);
    let ts = sod(now) - daysAgo * DAY + (7 + rnd(15)) * 3600e3 + rnd(60) * 60e3;
    if (ts > now) ts = now - (1 + rnd(3)) * 3600e3;
    const type = Math.random() < 0.78 ? "food" : "ride";
    let id; do { id = "GN" + (10000000 + rnd(89999999)); } while (used.has(id)); used.add(id);
    let items = null, detail, subtotal, ship = 0, code = "", discount = 0;
    if (type === "food") {
      const chosen = [...foods].sort(() => Math.random() - 0.5).slice(0, 1 + rnd(4));
      items = chosen.map(f => ({ id: f.id, qty: 1 + rnd(3), name: f.name, price: f.price, cat: f.cat }));
      detail = items.map(i => `${i.name} × ${i.qty}`); subtotal = items.reduce((s, i) => s + i.price * i.qty, 0); ship = SHIP_FEE;
      const r = Math.random();
      if (r < 0.3 && VOUCHERS.FOOD10) { code = "FOOD10"; discount = Math.round(subtotal * VOUCHERS.FOOD10.pct / 100); }
      else if (r < 0.5 && VOUCHERS.FREESHIP && subtotal >= (VOUCHERS.FREESHIP.min || 0)) { code = "FREESHIP"; ship = 0; }
    } else {
      const ds = Object.keys(DISTRICTS), a = pick(ds); let b = pick(ds); while (b === a) b = pick(ds);
      const vk = pick(Object.keys(VEHICLES)), v = VEHICLES[vk];
      const km = Math.max(1, Math.round(Math.hypot(DISTRICTS[a][0] - DISTRICTS[b][0], DISTRICTS[a][1] - DISTRICTS[b][1]) * 13) / 10);
      subtotal = Math.round((v.base + km * v.perKm) / 1000) * 1000;
      detail = [`${a} → ${b}`, `${v.name}, ~${km} km (mô phỏng)`];
      if (Math.random() < 0.25 && VOUCHERS.RIDE15) { code = "RIDE15"; discount = Math.round(subtotal * VOUCHERS.RIDE15.pct / 100); }
    }
    let status = 4, cancelled = false;
    if (daysAgo === 0) status = rnd(5); else if (Math.random() < 0.12) { cancelled = true; status = rnd(3); }
    out.push({ id, type, detail, items, subtotal, discount, ship, total: subtotal - discount + ship, code,
      pay: type === "food" ? "Thanh toán khi nhận hàng (COD)" : "Trả tiền mặt cho tài xế", status, cancelled,
      createdAt: new Date(ts).toLocaleString("vi-VN"), ts, customer: pick(names) + " • 09" + (10000000 + rnd(89999999)), sample: true });
  }
  orders = [...out, ...orders]; saveOrders(); route(); toast("Đã tạo 48 đơn mẫu");
}

function exportJSON() {
  download(`gonow-sao-luu-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ app: "gonow", exportedAt: new Date().toISOString(), orders, foods: ALL_FOODS, vouchers: VOUCHERS, settings: { ship: SHIP_FEE } }, null, 2), "application/json");
  toast("Đã tải file sao lưu");
}
function importJSON(file) {
  const rd = new FileReader();
  rd.onload = async () => {
    let d; try { d = JSON.parse(rd.result); } catch (e) { return toast("File không phải JSON hợp lệ"); }
    if (d.app !== "gonow") return toast("Đây không phải file sao lưu của GoNow");
    if (!await ask("Nạp dữ liệu từ file?", "Dữ liệu hiện tại (đơn hàng, sản phẩm, mã giảm giá) sẽ bị thay thế.", "Nạp dữ liệu", true)) return;
    if (Array.isArray(d.orders)) { orders = d.orders; saveOrders(); }
    if (Array.isArray(d.foods) && d.foods.length) { ALL_FOODS.splice(0, ALL_FOODS.length, ...d.foods); saveFoods(); }
    if (d.vouchers && typeof d.vouchers === "object") { Object.keys(VOUCHERS).forEach(k => delete VOUCHERS[k]); Object.assign(VOUCHERS, d.vouchers); saveVouchers(); }
    if (d.settings && d.settings.ship >= 0) { SHIP_FEE = d.settings.ship; save("gonow_settings", { ship: SHIP_FEE }); }
    route(); toast("Đã nạp dữ liệu");
  };
  rd.readAsText(file);
}

// =====================================================================
// SỰ KIỆN (event delegation)
// =====================================================================
const actions = {
  logout, closePanel, csv: exportCSV,
  gTab: m => { gMode = m; gMsg(""); renderGate(); }, genSample, exportJSON,
  dlgYes: () => dlgClose(true), dlgNo: () => dlgClose(false),
  range: n => { ui.range = n; route(); },
  togglePending: () => { ui.incPending = !ui.incPending; route(); },
  // đơn hàng
  ordView: id => openOrder(id),
  // hồ sơ tài xế
  drvView: id => openDriver(id), drvApprove: id => setApp(id, "approved"), drvReject: id => setApp(id, "rejected"), drvReopen: id => setApp(id, "pending"), drvImg: r => openDocImg(r),
  drvDelete: async id => { if (await ask("Xóa hồ sơ " + id + "?", "Hồ sơ và ảnh giấy tờ bị xóa vĩnh viễn.", "Xóa hồ sơ", true)) { driverApps = driverApps.filter(a => a.id !== id); saveApps(); closePanel(); route(); toast("Đã xóa hồ sơ " + id); } },
  ordNext: id => { const o = orders.find(x => x.id === id); if (o && isActive(o)) { setStatus(id, o.status + 1); toast(`Đơn ${id}: ${stepsOf(o)[o.status]}`); } },
  ordCancel: async id => { if (await ask("Hủy đơn " + id + "?", "Đơn sẽ không được tính vào doanh thu. Bạn có thể khôi phục sau.", "Hủy đơn", true)) { setStatus(id, "x"); toast("Đã hủy đơn " + id); } },
  ordRestore: id => { setStatus(id, 0); toast("Đã khôi phục đơn " + id); },
  ordPaid: id => { const o = orders.find(x => x.id === id); if (o) { o.paid = true; o.upd = Date.now(); saveOrders(); closePanel(); route(); toast("Đã xác nhận nhận tiền đơn " + id); } },
  ordDelete: async id => { if (await ask("Xóa đơn " + id + "?", "Đơn bị xóa vĩnh viễn và không thể khôi phục.", "Xóa đơn", true)) { orders = orders.filter(o => o.id !== id); saveOrders(); closePanel(); route(); toast("Đã xóa đơn " + id); } },
  page: n => { ui.o.page = n; renderOrdersTable(); },
  // sản phẩm
  prodNew: () => openProduct(0), prodEdit: id => openProduct(id), prodSave: saveProduct,
  prodToggle: id => { const f = ALL_FOODS.find(x => x.id === id); f.active = f.active === false; saveFoods(); renderProductsTable(); toast(`${f.name}: ${f.active ? "đã hiển thị" : "đã ẩn khỏi cửa hàng"}`); },
  prodDelete: async id => { const f = ALL_FOODS.find(x => x.id === id);
    if (await ask("Xóa “" + esc(f.name) + "”?", "Sản phẩm biến mất khỏi cửa hàng. Đơn hàng cũ vẫn giữ nguyên tên món. Nếu chỉ muốn tạm ngừng bán, hãy dùng công tắc Hiển thị.", "Xóa sản phẩm", true)) {
      ALL_FOODS.splice(ALL_FOODS.indexOf(f), 1); saveFoods(); route(); toast("Đã xóa " + f.name); } },
  fActive: () => { formActive = !formActive; $("#fSw").classList.toggle("on", formActive); $("#fSwT").textContent = formActive ? "Đang hiển thị" : "Đang ẩn"; },
  pickImg: () => { $("#importFile").dataset.mode = "img"; $("#importFile").accept = "image/*"; $("#importFile").click(); },
  clearImg: () => { formImg = ""; $("#fImgPath").value = ""; renderPv(); },
  bulkOpen: openBulk,
  bulkApply: () => {
    const changed = bulkCalc().filter(x => x.nv !== x.old);
    if (!changed.length) return toast("Không có sản phẩm nào đổi giá");
    changed.forEach(x => { x.f.price = x.nv; }); saveFoods(); closePanel(); route(); toast(`Đã đổi giá ${changed.length} sản phẩm`);
  },
  // mã giảm giá
  vNew: () => openVoucher(""), vEdit: c => openVoucher(c), vSave: saveVoucher,
  vDelete: async c => { if (await ask("Xóa mã " + c + "?", "Khách sẽ không dùng được mã này nữa. Đơn đã dùng mã vẫn giữ nguyên.", "Xóa mã", true)) { delete VOUCHERS[c]; saveVouchers(); route(); toast("Đã xóa mã " + c); } },
  // cài đặt
  setShip: () => { const v = parseInt($("#setShip").value.replace(/\D/g, ""), 10); if (isNaN(v)) return toast("Phí giao không hợp lệ"); SHIP_FEE = v; save("gonow_settings", { ship: v }); route(); toast("Đã lưu phí giao " + money(v)); },
  clearSample: async () => { if (await ask("Xóa đơn mẫu?", "Chỉ xóa các đơn do chức năng “Tạo đơn mẫu” sinh ra.", "Xóa đơn mẫu", true)) { orders = orders.filter(o => !o.sample); saveOrders(); route(); toast("Đã xóa đơn mẫu"); } },
  importOpen: () => { $("#importFile").dataset.mode = "json"; $("#importFile").accept = "application/json"; $("#importFile").click(); },
  clearOrders: async () => { if (await ask("Xóa toàn bộ đơn hàng?", `${orders.length} đơn sẽ bị xóa vĩnh viễn. Nên tải file sao lưu trước.`, "Xóa tất cả", true)) { orders = []; saveOrders(); route(); toast("Đã xóa toàn bộ đơn hàng"); } },
  resetCatalog: async () => { if (await ask("Đặt lại sản phẩm và mã giảm giá?", "Mọi thay đổi sản phẩm, giá và mã giảm giá sẽ mất.", "Đặt lại", true)) {
    ALL_FOODS.splice(0, ALL_FOODS.length, ...DEFAULT_FOODS.map(f => ({ ...f })));
    Object.keys(VOUCHERS).forEach(k => delete VOUCHERS[k]); Object.assign(VOUCHERS, JSON.parse(JSON.stringify(DEFAULT_VOUCHERS)));
    SHIP_FEE = DEFAULT_SHIP; ["gonow_foods", "gonow_vouchers", "gonow_settings"].forEach(k => localStorage.removeItem(k)); route(); toast("Đã đặt lại mặc định"); } }
};

document.addEventListener("click", e => {
  if (e.target.id === "panelWrap") return closePanel();
  const btn = e.target.closest("[data-act]");
  if (!btn || !actions[btn.dataset.act]) return;
  const raw = btn.dataset.id;
  actions[btn.dataset.act](raw !== undefined && raw !== "" && !isNaN(raw) && !/^GN/i.test(raw) ? +raw : raw);
});
document.addEventListener("input", e => {
  const id = e.target.id;
  if (id === "oQ") { ui.o.q = e.target.value; ui.o.page = 1; renderOrdersTable(); }
  else if (id === "pQ") { ui.p.q = e.target.value; renderProductsTable(); }
  else if (id === "dQ") { ui.d.q = e.target.value; renderDriversTable(); }
  else if (id === "fImgPath") { formImg = e.target.value.trim(); renderPv(); }
  else if (e.target.closest("#panel") && id && id.startsWith("b") && $("#bPrev")) bulkPreview();
});
document.addEventListener("change", e => {
  const t = e.target, id = t.id;
  if (id === "oType") { ui.o.type = t.value; ui.o.page = 1; renderOrdersTable(); }
  else if (id === "oStatus") { ui.o.status = t.value; ui.o.page = 1; renderOrdersTable(); }
  else if (id === "dStatus") { ui.d.status = t.value; renderDriversTable(); }
  else if (id === "pCat") { ui.p.cat = t.value; renderProductsTable(); }
  else if (id === "pVis") { ui.p.vis = t.value; renderProductsTable(); }
  else if (id === "stSel") { setStatus(t.dataset.id, t.value); toast("Đã cập nhật trạng thái đơn " + t.dataset.id); }
  else if (id === "importFile") {
    const file = t.files[0]; if (file) (t.dataset.mode === "img" ? loadImage : importJSON)(file); t.value = "";
  } else if (id && id.startsWith("b") && $("#bPrev")) bulkPreview();
  else if (t.classList.contains("priceIn")) {          // sửa giá nhanh ngay trong bảng
    const f = ALL_FOODS.find(x => x.id === +t.dataset.id), v = parseInt(t.value.replace(/\D/g, ""), 10);
    if (isNaN(v)) { t.value = fmtNum(f.price); return toast("Giá không hợp lệ"); }
    if (v !== f.price) {
      const old = f.price; f.price = v; saveFoods(); renderProdStrip();
      toast(`${f.name}: ${money(old)} → ${money(v)}`);
      const row = t.closest("tr"); row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
    }
    t.value = fmtNum(f.price);
  }
});
document.addEventListener("focusin", e => { if (e.target.classList.contains("priceIn")) e.target.select(); });
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.classList.contains("priceIn")) e.target.blur();
  if (e.key === "Escape") { if (!$("#dialogWrap").hidden) dlgClose(false); else if (!$("#panelWrap").hidden) closePanel(); }
});
window.addEventListener("hashchange", () => { if (!$("#app").hidden) { closePanel(); route(); } });
window.addEventListener("storage", e => {      // đơn mới từ cửa hàng (tab khác) → tự cập nhật
  if (e.key === "gonow_orders" && !$("#app").hidden && $("#panelWrap").hidden) { orders = load("gonow_orders", []); route(); }
  if (e.key === "gonow_driverapps" && !$("#app").hidden && $("#panelWrap").hidden) { driverApps = load("gonow_driverapps", []); renderNav(); route(); }
});
window.addEventListener("gn-remote", () => {   // dữ liệu mới từ Firestore (đơn của khách, v.v.)
  orders = load("gonow_orders", []); driverApps = load("gonow_driverapps", []);
  if (!$("#app").hidden && $("#panelWrap").hidden) { renderNav(); route(); }
});
$("#gateForm").addEventListener("submit", gateSubmit);

// ---- KHỞI TẠO ----
if (fbMode) {
  auth.onAuthStateChanged(async u => {
    if (!u) {
      if (sessionStorage.getItem("gonow_admin") === "1") enter("Quản trị viên (demo cục bộ)");
      else showGate();
      return;
    }
    if (!isAdminEmail(u.email)) {
      gMsg("Tài khoản này không có quyền quản trị (chưa nằm trong ADMIN_EMAILS).");
      await auth.signOut();
      showGate();
      return;
    }
    try { await u.getIdToken(true); } catch (_) {}
    sessionStorage.removeItem("gonow_admin");
    dbStart(fbApp, true);
    enter(u.email);
  });
} else if (sessionStorage.getItem("gonow_admin") === "1") {
  enter("Quản trị viên (demo cục bộ)");
} else {
  showGate();
}