// [AI] Logic chính của GoNow. Chia theo khu vực: tiện ích → ảnh → đăng nhập → đồ ăn → cửa hàng → giỏ hàng → đặt xe → QR → giỏ/modal → đơn hàng → trang chủ → sự kiện → khởi tạo.
const $ = s => document.querySelector(s);
const money = n => n.toLocaleString("vi-VN") + "đ";
const foodById = id => FOODS.find(f => f.id === id);
// Bỏ dấu để tìm "pho" vẫn ra "Phở"
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

// ---- Ảnh: khung xám trống, có file ảnh thì tự hiện ----
// Đường dẫn mặc định: images/<loại>/<id>.jpg. Muốn đổi, thêm thuộc tính img cho món/cửa hàng trong data.js.
const imgOf = (kind, o) => o.img || `images/${kind}/${o.id}.jpg`;
const CAT_ICON = { "Món nước": "🍜", "Cơm": "🍚", "Ăn vặt": "🥖", "Pizza & Burger": "🍕", "Đồ uống": "🧋", "Tráng miệng": "🍮", "Món chay": "🥗" };
const catIcon = c => CAT_ICON[c] || "🍽️";
// Ảnh lỗi/chưa có: hiện biểu tượng danh mục thay vì ô xám trống (icon rỗng = ẩn ảnh)
const failImg = icon => icon ? `this.outerHTML='<b class=&quot;ph&quot;>${icon}</b>'` : "this.remove()";
const pic = (src, cls, icon = "") => `<span class="${cls}"><img src="${src}" alt="" onerror="${failImg(icon)}"></span>`;

// ---- Firebase (chỉ bật khi đã điền FIREBASE_CONFIG trong js/config.js) ----
const fbReady = typeof firebase !== "undefined" && !!FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("DIEN");
let auth = null;
if (fbReady) {
  try { const fbApp = firebase.initializeApp(FIREBASE_CONFIG); auth = fbApp.auth(); dbStart(fbApp, false); }
  catch (err) { console.error("Firebase lỗi:", err); }
}
const useFirebase = !!auth;

// ---- Trạng thái (đồng bộ với LocalStorage) ----
let cart = load("gonow_cart", []).filter(c => foodById(c.id));   // [{id, qty}]  (chỉ lưu id + số lượng, giá lấy từ FOODS)
let favs = load("gonow_favs", []);      // [id]
let orders = load("gonow_orders", []);  // đơn đồ ăn + chuyến xe, phân biệt bằng order.type
let trip = { from: "", to: "", vehicle: "bike", fromLoc: null, toLoc: null, km: 0, exact: false, busy: false, path: null, sched: 0 };   // fromLoc/toLoc = {lat, lng, address} (chế độ Google Maps)
let ctx = "food";        // đang mở: food (giỏ hàng) | ride | location | store
let vouchers = [];       // các mã đang áp dụng (cộng dồn các mã khác loại)
let voucherMsg = { text: "", ok: false };
const COD = "Thanh toán khi nhận hàng (COD)", COD_RIDE = "Trả tiền mặt cho tài xế";   // chỉ còn một cách thanh toán
let ref = "";            // mã đơn dự kiến, cũng là nội dung chuyển khoản
let user = useFirebase ? null : load("gonow_user", null);   // {name, email?, phone?}
let authMode = "login";    // "login" | "register"
let loc = load("gonow_loc", "Quận 1");
let cartStore = load("gonow_cartstore", 0);                       // mỗi giỏ chỉ thuộc một cửa hàng
let contact = { phone: "", addr: "", note: "", ...load("gonow_contact", {}) };   // thông tin nhận hàng
const cid = load("gonow_cid", null) || (() => { const v = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); save("gonow_cid", v); return v; })();
const myUid = () => (auth && auth.currentUser && auth.currentUser.uid) || cid;   // id gắn đơn với người dùng (Firebase uid, hoặc id thiết bị)
if (!DISTRICTS[loc]) loc = "Quận 1";
let storeId = 0;
let storesShown = 6;
let places = load("gonow_places", {});         // địa điểm đã lưu: { home, work } = {lat, lng, address}
let cartOwner = load("gonow_cartowner", "");   // uid chủ của giỏ đang lưu trên máy ("" = khách)
let cartUnsub = null, cartPushT = 0, cartRemoteTs = 0;
const rateDraft = {};                          // đánh giá tài xế đang soạn dở: { [orderId]: {stars, tags, text} }
let lastActEl = null;
let direct = null;                             // "Mua ngay": {items:[{id,qty}], sid} – đơn tách riêng, không đụng tới giỏ hàng
let dt = { id: 0, qty: 1, sid: 0 };            // món đang xem ở trang chi tiết
const activeCart = () => (direct ? direct.items : cart);
const CART_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.2 11h10.4l2.2-8.500H6"/><path d="M12.600 8.600v4M10.600 10.600h4"/></svg>';                          // nút vừa bấm (để hiệu ứng "bay vào giỏ")

// Hàng ô vuông trên cùng: [nhãn, hành động, tham số]. Ảnh: images/quick/1.png, 2.png...
// Bộ icon SVG vector đồng bộ phong cách Grab (nét bo tròn, phối màu xanh thương hiệu #00B14F)
const QUICK_SVGS = {
  food: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><rect x="6" y="13" width="24" height="15" rx="4" fill="#00B14F"/><path d="M12 13V10a6 6 0 0112 0v3" stroke="#007A3B" stroke-width="2.4" stroke-linecap="round"/><circle cx="14" cy="20" r="1.8" fill="#fff"/><circle cx="22" cy="20" r="1.8" fill="#fff"/><path d="M15 24h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
  bike: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><circle cx="10" cy="24" r="4.5" stroke="#007A3B" stroke-width="2.4" fill="#fff"/><circle cx="26" cy="24" r="4.5" stroke="#007A3B" stroke-width="2.4" fill="#fff"/><path d="M10 24l5-8h6l3 5h2M18 16l-2-5h-3" stroke="#00B14F" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="11" r="2.2" fill="#00B14F"/></svg>`,
  car4: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M7 18l3.2-6.5A3 3 0 0112.9 10h10.2a3 3 0 012.7 1.5L29 18v6a2 2 0 01-2 2h-1a2 2 0 01-2-2v-1H12v1a2 2 0 01-2 2H9a2 2 0 01-2-2v-6z" fill="#00B14F"/><path d="M11 17l2-4.2h10L25 17H11z" fill="#E6F7EE"/><circle cx="11.5" cy="20.5" r="1.6" fill="#fff"/><circle cx="24.5" cy="20.5" r="1.6" fill="#fff"/></svg>`,
  car7: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M5 17l2.5-6.2A2.8 2.8 0 0110.1 9h15.8a2.8 2.8 0 012.6 1.8L31 17v7a2 2 0 01-2 2h-1a2 2 0 01-2-2v-1H10v1a2 2 0 01-2 2H7a2 2 0 01-2-2v-7z" fill="#007A3B"/><rect x="9.5" y="12" width="7" height="4.5" rx="1" fill="#E6F7EE"/><rect x="18.5" y="12" width="8" height="4.5" rx="1" fill="#E6F7EE"/><circle cx="10.5" cy="20.5" r="1.6" fill="#fff"/><circle cx="25.5" cy="20.5" r="1.6" fill="#fff"/></svg>`,
  promo: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M6 12a2 2 0 012-2h20a2 2 0 012 2v3.5a2.5 2.5 0 000 5V24a2 2 0 01-2 2H8a2 2 0 01-2-2v-3.5a2.5 2.5 0 000-5V12z" fill="#FF7A00"/><path d="M14.5 21.5l7-7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="14.5" cy="15" r="1.6" fill="#fff"/><circle cx="21.5" cy="21" r="1.6" fill="#fff"/></svg>`,
  nearby: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M18 6c-5.5 0-10 4.3-10 9.6 0 6.8 10 14.4 10 14.4s10-7.6 10-14.4C28 10.3 23.5 6 18 6z" fill="#00B14F"/><circle cx="18" cy="15.5" r="4" fill="#fff"/></svg>`,
  fav: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M18 28.5S7.5 21.8 7.5 14.2C7.5 10.6 10.3 8 13.7 8c2 0 3.7.9 4.3 2.4C18.6 8.9 20.3 8 22.3 8c3.4 0 6.2 2.6 6.2 6.2 0 7.6-10.5 14.3-10.5 14.3z" fill="#EF4444"/></svg>`,
  orders: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><rect x="9" y="6" width="18" height="24" rx="3" fill="#00B14F"/><path d="M13 13h10M13 18h10M13 23h6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  driver: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><circle cx="18" cy="14" r="6" fill="#00B14F"/><path d="M11 13c1.5-4.5 12.5-4.5 14 0" stroke="#007A3B" stroke-width="3" stroke-linecap="round"/><path d="M8 28c1.5-5 6-7 10-7s8.5 2 10 7" fill="#007A3B"/></svg>`,
  partner: `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M7 15h22v13a2 2 0 01-2 2H9a2 2 0 01-2-2V15z" fill="#E6F7EE" stroke="#007A3B" stroke-width="2.2"/><path d="M5 15l2.5-7h21L31 15a3.5 3.5 0 01-6.5 0 3.5 3.5 0 01-6.5 0 3.5 3.5 0 01-6.5 0A3.5 3.5 0 015 15z" fill="#00B14F"/><rect x="15" y="21" width="6" height="9" rx="1" fill="#00B14F"/></svg>`
};

const QUICK = [
  ["Đồ ăn", "toFoods", ""],
  ["Xe máy", "ride", "bike"],
  ["Ô tô", "ride", "car4"],
  ["Ô tô 7 chỗ", "ride", "car7"],
  ["Ưu đãi", "toPromos", ""],
  ["Quán gần bạn", "toStores", ""],
  ["Yêu thích", "favOnly", ""],
  ["Đơn hàng", "tab", "orders"],
  ["Làm tài xế", "go", "driver.html"],
  ["Mở quán", "go", "partner.html"]
];
// ---- Tiện ích ----
let toastTimer = 0;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), Math.max(2200, msg.length * 60));   // câu dài hiện lâu hơn
}
const goto = sel => { const el = $(sel); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

function showTab(tab) {
  if (tab === "account" && !user) return openAuth();   // chưa đăng nhập → mở trang đăng nhập
  document.body.classList.toggle("ride-on", tab === "ride");   // tab đặt xe: bản đồ full màn hình (css/ride.css)
  ["food", "ride", "orders", "account"].forEach(name => {
    $("#" + name).hidden = name !== tab;
    document.querySelectorAll(`[data-tab="${name}"]`).forEach(b => b.classList.toggle("active", name === tab));
  });
  if (tab === "orders") renderOrders();
  if (tab === "account") renderAccount();
  if (tab === "ride") initRideMap();
  updateRails();
}

// Hiện mũi tên ❯ chỉ khi hàng cuộn ngang bị tràn
function updateRails() {
  document.querySelectorAll(".railWrap").forEach(w => {
    const r = w.querySelector(".rail"), b = w.querySelector(".next");
    if (r && b) b.hidden = r.scrollWidth <= r.clientWidth + 4;
  });
}

// Kéo chuột để cuộn ngang các hàng (điện thoại thật vuốt được sẵn; đây là cho chuột / chế độ giả lập trên PC)
function initRailDrag() {
  document.querySelectorAll(".rail, .quick").forEach(r => {
    let down = false, moved = false, sx = 0, sl = 0, lastX = 0, lastT = 0, v = 0, raf = 0;
    r.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse") return;
      cancelAnimationFrame(raf); down = true; moved = false; sx = lastX = e.clientX; sl = r.scrollLeft; lastT = performance.now(); v = 0;
    });
    window.addEventListener("pointermove", e => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 5) { moved = true; r.classList.add("drag"); }
      if (!moved) return;
      r.scrollLeft = sl - dx;
      const now = performance.now(), dt = now - lastT || 1;
      v = 0.8 * v + 0.2 * ((lastX - e.clientX) / dt); lastX = e.clientX; lastT = now;
    });
    window.addEventListener("pointerup", () => {
      if (!down) return; down = false;
      if (!moved) return r.classList.remove("drag");
      const glide = () => { r.scrollLeft += v * 16; v *= 0.94; if (Math.abs(v) > 0.02) raf = requestAnimationFrame(glide); else r.classList.remove("drag"); };
      glide();
    });
    r.addEventListener("dragstart", e => e.preventDefault());
    r.addEventListener("click", e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  });
}

// ---- HERO: carousel ảnh (danh sách HERO_SLIDES trong js/config.js). Ảnh đặt trong images/hero/ ----
const hs = { list: [], i: 0, timer: 0, hover: false, x0: null };
function heroSlides() {
  const raw = typeof HERO_SLIDES !== "undefined" && Array.isArray(HERO_SLIDES) ? HERO_SLIDES : [];
  const l = raw.filter(x => x && x.title);
  return l.length ? l : [{ title: "Món ngon<br>đến tận cửa nhà bạn", text: "", cta: "", act: "" }];
}
function renderHero() {
  hs.list = heroSlides();
  $("#introVideo").innerHTML = hs.list.map((x, k) => `<div class="hslide tone${k % 4}">${x.img ? `<img src="${esc(x.img)}" alt="" ${k ? "" : 'fetchpriority="high"'} onerror="this.remove()">` : ""}</div>`).join("");
  const many = hs.list.length > 1;
  $("#heroDots").hidden = !many;
  document.querySelectorAll(".heroNav").forEach(b => { b.hidden = !many; });
  $("#heroDots").innerHTML = hs.list.map((_, k) => `<button type="button" data-act="heroGo" data-id="${k}" aria-label="Chuyển tới slide ${k + 1}"></button>`).join("");
  showHero(0, true);
  const hero = $("#hero");
  // Chỉ hiện chữ hero khi ảnh đầu đã tải xong (chờ tối đa 1,5 giây) → không bị nháy chữ trước ảnh
  const reveal = () => hero.classList.remove("loading"), firstImg = $("#introVideo img");
  if (firstImg && !firstImg.complete) { firstImg.addEventListener("load", reveal, { once: true }); firstImg.addEventListener("error", reveal, { once: true }); setTimeout(reveal, 1500); }
  else reveal();
  ["mouseenter", "focusin"].forEach(ev => hero.addEventListener(ev, () => { hs.hover = true; }));
  ["mouseleave", "focusout"].forEach(ev => hero.addEventListener(ev, () => { hs.hover = false; }));
  hero.addEventListener("touchstart", e => { hs.x0 = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener("touchend", e => {   // vuốt trái/phải để chuyển slide
    if (hs.x0 === null) return;
    const dx = e.changedTouches[0].clientX - hs.x0; hs.x0 = null;
    if (Math.abs(dx) > 50) moveHero(dx < 0 ? 1 : -1);
  });
  restartHero();
}
function showHero(i, first) {
  const n = hs.list.length; hs.i = ((i % n) + n) % n;
  const x = hs.list[hs.i], box = $(".heroIn");
  // Slide cũ giữ nguyên độ mờ cho tới khi slide mới phủ kín → không bị "chớp" nền giữa hai ảnh
  const slides = [...document.querySelectorAll(".hslide")], old = slides.find(el => el.classList.contains("on"));
  slides.forEach((el, k) => {
    if (k === hs.i) { el.classList.remove("prev"); el.classList.add("on"); }
    else if (el === old) { el.classList.remove("on"); el.classList.add("prev"); setTimeout(() => el.classList.remove("prev"), 950); }
    else el.classList.remove("on", "prev");
  });
  document.querySelectorAll("#heroDots button").forEach((el, k) => { el.classList.toggle("on", k === hs.i); el.setAttribute("aria-current", k === hs.i ? "true" : "false"); });
  const apply = () => {
    $("#heroTitle").innerHTML = x.title;
    $("#heroText").innerHTML = x.text || ""; $("#heroText").hidden = !x.text;
    $("#heroCta").innerHTML = x.cta ? `<button class="btn heroBtn" data-act="${esc(x.act || "toFoods")}" data-id="${esc(x.id || "")}">${esc(x.cta)}</button>` : "";
    box.classList.remove("swap");
  };
  if (first) apply(); else { box.classList.add("swap"); setTimeout(apply, 220); }
}
const moveHero = d => { showHero(hs.i + d); restartHero(); };
function restartHero() {
  clearInterval(hs.timer);
  if (hs.list.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;   // người dùng tắt chuyển động → không tự chạy
  hs.timer = setInterval(() => { if (!hs.hover && !document.hidden) showHero(hs.i + 1); }, 6000);
}

// ---- ĐĂNG NHẬP / ĐĂNG KÝ (trang riêng, Firebase Auth) ----
// Đăng nhập bằng email + mật khẩu; số điện thoại nhập bình thường khi đăng ký/đặt hàng, chỉ bắt buộc xác minh email.
const AUTH_ERR = {
  "auth/invalid-email": "Email không hợp lệ.",
  "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.",
  "auth/email-already-in-use": "Tài khoản này đã được đăng ký. Hãy đăng nhập.",
  "auth/invalid-credential": "Sai tài khoản hoặc mật khẩu.",
  "auth/user-not-found": "Không tìm thấy tài khoản này.",
  "auth/wrong-password": "Sai mật khẩu.",
  "auth/too-many-requests": "Thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.",
  "auth/network-request-failed": "Lỗi mạng. Kiểm tra kết nối internet.",
  "auth/unauthorized-domain": "Tên miền chưa được cho phép. Thêm vào Firebase → Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed": "Chưa bật phương thức đăng nhập này trong Firebase → Authentication → Sign-in method (Email/Password).",
  "auth/requires-recent-login": "Phiên đăng nhập đã cũ. Hãy đăng xuất và đăng nhập lại."
};

// Trả về 9 số sau +84 nếu hợp lệ (đầu 3,5,7,8,9), ngược lại ""
function normPhone(v) {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("84")) d = d.slice(2);
  d = d.replace(/^0/, "");
  return /^[35789]\d{8}$/.test(d) ? d : "";
}
const isGmail = v => /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(String(v || "").trim());
const authEmail = () => $("#aEmail").value.trim().toLowerCase();
function authValid() {
  if (authMode === "register" && !guardGmailOk(authEmail())) return false;
  if (!isGmail(authEmail()) || $("#aPass").value.length < 6) return false;
  return authMode !== "register" || (!!$("#aName").value.trim() && !!normPhone($("#aPhone").value));
}
const updateAuthBtn = () => {
  $("#authGo").disabled = !authValid();
  const m = $("#amsg"), e = authEmail();
  if (authMode === "register" && e.includes("@") && !guardGmailOk(e)) { m.className = "msg bad"; m.dataset.g = "1"; m.textContent = /@gmail\.com$/.test(e) ? "Không dùng email có dấu +. Hãy dùng địa chỉ Gmail gốc." : "Chỉ nhận email @gmail.com để tránh tài khoản ảo."; }
  else if (m.dataset.g) { m.textContent = ""; delete m.dataset.g; }
};

let authReason = "";   // lý do mở trang đăng nhập (vd: cần đăng nhập để đặt hàng)
function showReason(t) { const n = $("#authReason"); n.textContent = t || ""; n.hidden = !t; }
function renderAuth() {
  const reg = authMode === "register";
  $("#authTitle").textContent = reg ? "Đăng ký GoNow" : "Đăng nhập vào GoNow";
  $("#authForm").hidden = false; $("#authVerify").hidden = true;
  $("#aName").hidden = !reg; $("#authPhone").hidden = !reg;
  $("#authGo").textContent = reg ? "Tạo tài khoản" : "Đăng nhập";
  $("#aPass").autocomplete = reg ? "new-password" : "current-password";
  $("#authSwitch").innerHTML = (reg
    ? 'Đã có tài khoản? <button class="link2" data-act="authMode" data-id="login">Đăng nhập</button>'
    : 'Chưa có tài khoản? <button class="link2" data-act="authMode" data-id="register">Đăng ký</button>')
    + (!reg ? ' • <button class="link2" data-act="resetPw">Quên mật khẩu</button>' : "");
  $("#authDemo").hidden = useFirebase;
  showReason(authReason);
  $("#amsg").textContent = "";
  updateAuthBtn();
}

function openAuth(reason = "") {
  authMode = "login"; authReason = reason; $("#auth").hidden = false; renderAuth();
  setTimeout(() => $("#aEmail").focus(), 50);
}
const closeAuth = () => { $("#auth").hidden = true; authReason = ""; };
// ---- XÁC MINH EMAIL (bắt buộc trước khi đặt hàng; SĐT nhập bình thường, không qua SMS) ----
const isVerified = u => !!(u && !u.isAnonymous && u.emailVerified);
const verifiedPhone = u => { const m = ((u && u.phoneNumber) || "").match(/^\+84(\d{9})$/); return m ? "0" + m[1] : ""; };
const vMsg = (t, ok) => { const m = $("#vmsg"); m.className = "msg " + (ok ? "ok" : "bad"); m.textContent = t || ""; };
function coolDown(sel, label, sec) {          // khóa nút "gửi lại" trong sec giây để tránh gửi liên tục
  const b = $(sel); if (!b) return;
  let n = sec; b.disabled = true;
  const tick = () => { if (n <= 0) { b.disabled = false; b.textContent = label; return; } b.textContent = `${label} (${n--}s)`; setTimeout(tick, 1000); };
  tick();
}
function openVerify(reason = "") {
  if (!useFirebase || !auth.currentUser || auth.currentUser.isAnonymous) return openAuth(reason);
  $("#auth").hidden = false; $("#authForm").hidden = true; $("#authVerify").hidden = false;
  $("#authTitle").textContent = "Xác minh tài khoản"; showReason(reason);
  renderVerify();
}
function renderVerify() {
  const u = auth.currentUser; if (!u) return;
  const eOk = u.emailVerified;
  $("#vEmailBadge").textContent = eOk ? "Đã xác minh" : "Chưa xác minh"; $("#vEmailBadge").className = "vBadge" + (eOk ? " ok" : "");
  $("#vEmailText").textContent = eOk ? u.email : `Chúng tôi đã gửi email xác minh tới ${u.email}. Mở email, bấm vào đường dẫn, rồi quay lại đây bấm “Tôi đã xác minh”. Hãy xem cả mục Spam.`;
  $("#vEmailActs").hidden = eOk;
  if ($("#vPhoneBadge")) $("#vPhoneBadge").hidden = true;
  if ($("#vPhoneDone")) $("#vPhoneDone").hidden = true;
  if ($("#vPhoneForm")) $("#vPhoneForm").hidden = true;
  if ($("#vCodeForm")) $("#vCodeForm").hidden = true;
  $("#vDone").disabled = !eOk;
}
async function sendVerifyEmail() {
  try { await auth.currentUser.sendEmailVerification(); vMsg("Đã gửi email xác minh. Hãy kiểm tra hộp thư (cả mục Spam).", true); coolDown("#vResend", "Gửi lại email", 60); }
  catch (err) { vMsg(AUTH_ERR[err.code] || "Không gửi được email (" + err.code + ")"); }
}
async function checkEmailVerified() {
  try { await auth.currentUser.reload(); } catch (err) { return vMsg(AUTH_ERR[err.code] || "Không kiểm tra được (" + err.code + ")"); }
  const u = auth.currentUser;
  if (!u.emailVerified) return vMsg("Email chưa được xác minh. Hãy bấm vào đường dẫn trong email rồi thử lại.");
  await u.getIdToken(true);                  // làm mới quyền để máy chủ biết email đã xác minh
  setUser(u); renderVerify(); vMsg("Email đã được xác minh.", true);
}
function finishVerify() {
  if (!isVerified(auth.currentUser)) return vMsg("Cần xác minh email trước.");
  closeAuth(); toast("Tài khoản đã xác minh. Bạn có thể đặt hàng.");
}
// Chặn đặt hàng nếu chưa đăng nhập / chưa xác minh email. Trả về true nếu bị chặn (và mở sẵn màn hình cần làm).
function blockUnverified() {
  if (!useFirebase) { if (user) return false; openAuth("Vui lòng đăng nhập để đặt hàng."); return true; }
  const u = auth.currentUser;
  if (!u || u.isAnonymous) { openAuth("Vui lòng đăng nhập để đặt hàng."); return true; }
  if (!isVerified(u)) { openVerify("Cần xác minh email trước khi đặt hàng."); return true; }
  return false;
}

function setUser(u) {
  if (!u) user = null;
  else user = {
    name: u.displayName || (u.email || "").split("@")[0],
    email: u.email,
    phone: verifiedPhone(u) || (user && user.phone) || contact.phone || "",
    verified: isVerified(u),
    photo: u.photoURL || ""
  };
  renderUser();
}
const initial = n => (String(n || "?").trim().charAt(0) || "?").toUpperCase();
// Ảnh đại diện tròn: có ảnh thì hiện ảnh, chưa có (hoặc lỗi tải) thì hiện chữ cái đầu
const avatarHTML = (u, cls = "") => `<span class="avatar ${cls}">${esc(initial(u.name))}${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>`;
function renderUser() {
  const b = $("#loginBtn");
  b.classList.toggle("isUser", !!user);
  b.innerHTML = user ? avatarHTML(user, "sm") : '<span class="lbl">Đăng nhập</span><svg class="uic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  b.setAttribute("aria-label", user ? "Tài khoản của " + user.name : "Đăng nhập");
  renderNavUser();
  if (!$("#account").hidden) { if (user) renderAccount(); else showTab("food"); }   // đăng xuất khi đang xem trang tài khoản → về trang chủ
}

// ---- TÀI KHOẢN: xem thông tin, đổi tên, đổi mật khẩu ----
function renderAccount() {
  if (!user) return;
  const mine = orders.filter(o => !o.uid || o.uid === myUid());
  const done = mine.filter(o => !o.cancelled && o.status === 4);
  const spent = done.reduce((t, o) => t + o.total, 0);
  const ico = {
    bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 016 0"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
    wallet: '<svg viewBox="0 0 24 24"><path d="M3 7h16a2 2 0 012 2v9H5a2 2 0 01-2-2z"/><path d="M3 7l12-3v3"/><circle cx="17" cy="13" r="1.2"/></svg>'
  };
  $("#acMe").innerHTML = `<div class="acBanner"></div>
    <div class="acProfile">${avatarHTML(user)}
      <div class="acWho"><h3>${esc(user.name)}</h3><p>${esc(user.email || "")}${user.phone ? " · " + esc(user.phone) : ""}</p>${useFirebase ? (user.verified ? '<span class="vBadge ok">✓ Đã xác minh email</span>' : '<button class="btn ghost vBtn" data-act="openVerify">Xác minh email</button>') : ""}</div>
      <div class="acts"><button class="btn" data-act="toOrders">Đơn hàng của tôi</button><button class="btn ghost" data-act="logout">Đăng xuất</button></div></div>
    <div class="acStats"><div><i>${ico.bag}</i><b>${mine.length}</b><span>Đơn đã đặt</span></div><div><i>${ico.ok}</i><b>${done.length}</b><span>Hoàn tất</span></div><div><i>${ico.wallet}</i><b>${money(spent)}</b><span>Đã chi tiêu</span></div></div>`;
  const stText = o => o.cancelled ? ["Đã hủy", "x"] : [(o.type === "ride" ? RIDE_STEPS : FOOD_STEPS)[o.status] || "", o.status >= 4 ? "ok" : "go"];
  const recent = mine.slice(0, 3);
  $("#acRecent").innerHTML = recent.length ? recent.map(o => { const s = stText(o); return `<button type="button" class="acOrd" data-act="toOrders">
      <span class="acOrdIc">${o.type === "ride" ? "🛵" : "🍜"}</span>
      <span class="acOrdMain"><b>${o.type === "ride" ? "Chuyến xe" : "Đơn đồ ăn"} #${esc(o.id)}</b><small>${esc(o.createdAt || "")}</small></span>
      <span class="acOrdR"><b>${money(o.total)}</b><em class="st ${s[1]}">${esc(s[0])}</em></span></button>`; }).join("")
    : `<p class="acEmpty">Bạn chưa có đơn nào. <button class="acLink" data-act="toFoods">Đặt món ngay</button></p>`;
  if (document.activeElement !== $("#acName")) $("#acName").value = user.name;
  if (document.activeElement !== $("#acPhone")) $("#acPhone").value = contact.phone || user.phone || "";
  if (document.activeElement !== $("#acAddr")) $("#acAddr").value = contact.addr || "";
  $("#acId").value = user.email || "";
  $("#acPwCard").classList.toggle("off", !useFirebase);
  $("#pwDemo").hidden = useFirebase;
  ["#acNew", "#acCur", "#acNew2"].forEach(id => { $(id).disabled = !useFirebase; });
}
function saveContactInfo() {
  const phone = $("#acPhone").value.replace(/[\s.]/g, ""), addr = $("#acAddr").value.trim(), m = $("#acCtMsg");
  const say = (t, ok) => { m.className = "msg " + (ok ? "ok" : "bad"); m.textContent = t; };
  if (phone && !/^0\d{9}$/.test(phone)) return say("Số điện thoại gồm 10 số, bắt đầu bằng 0.", false);
  if (addr && addr.length < 8) return say("Nhập địa chỉ đầy đủ hơn (số nhà, đường, phường).", false);
  if (addr !== contact.addr) contact.loc = null;     // đổi địa chỉ thì ghim bản đồ cũ không còn đúng
  contact.phone = phone; contact.addr = addr; save("gonow_contact", contact); say("Đã lưu thông tin nhận hàng.", true);
}
const acMsg = (sel, text, ok) => { const m = $(sel); m.className = "msg " + (ok ? "ok" : "bad"); m.textContent = text; };
async function saveName() {
  const name = $("#acName").value.trim().replace(/\s+/g, " ");
  if (name.length < 2) return acMsg("#acMsg", "Tên cần ít nhất 2 ký tự.", false);
  if (name === user.name) return acMsg("#acMsg", "Tên chưa thay đổi.", false);
  try {
    if (useFirebase) { await auth.currentUser.updateProfile({ displayName: name }); setUser(auth.currentUser); }
    else { user = { ...user, name }; save("gonow_user", user); renderUser(); }
    acMsg("#acMsg", "Đã cập nhật tên.", true); renderAccount(); toast("Đã lưu tên mới");
  } catch (err) { acMsg("#acMsg", AUTH_ERR[err.code] || "Không lưu được (" + (err.code || err.message) + ")", false); }
}
async function changePassword() {
  if (!useFirebase) return acMsg("#pwMsg", "Chế độ demo chưa có mật khẩu thật.", false);
  const cur = $("#acCur").value, nw = $("#acNew").value, nw2 = $("#acNew2").value;
  if (!cur) return acMsg("#pwMsg", "Hãy nhập mật khẩu hiện tại.", false);
  if (nw.length < 6) return acMsg("#pwMsg", "Mật khẩu mới cần ít nhất 6 ký tự.", false);
  if (nw !== nw2) return acMsg("#pwMsg", "Hai mật khẩu mới chưa khớp nhau.", false);
  if (nw === cur) return acMsg("#pwMsg", "Mật khẩu mới phải khác mật khẩu cũ.", false);
  const btn = $("#pwGo"); btn.disabled = true;
  try {
    const u = auth.currentUser;
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, cur));   // xác nhận lại mật khẩu cũ
    await u.updatePassword(nw);
    ["#acCur", "#acNew", "#acNew2"].forEach(id => { $(id).value = ""; });
    acMsg("#pwMsg", "Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.", true); toast("Đã đổi mật khẩu");
  } catch (err) { acMsg("#pwMsg", AUTH_ERR[err.code] || "Không đổi được mật khẩu (" + (err.code || err.message) + ")", false); }
  btn.disabled = false;
}

async function submitAuth() {
  if (!authValid()) return;
  const reg = authMode === "register", name = $("#aName").value.trim(), email = authEmail(), pass = $("#aPass").value;
  const msg = $("#amsg"), btn = $("#authGo"), fromOrder = !!authReason;
  if (!useFirebase) {   // chế độ demo: không kiểm tra mật khẩu, không xác minh được
    const phone = reg ? "0" + normPhone($("#aPhone").value) : "";
    user = { name: reg ? name : email.split("@")[0], email, phone }; save("gonow_user", user);
    renderUser(); closeAuth(); if (!fromOrder) { showTab("account"); window.scrollTo({ top: 0 }); } return toast("Đăng nhập thành công (chế độ demo)");
  }
  btn.disabled = true; msg.textContent = "";
  try {
    await auth.setPersistence($("#remember").checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    if (reg) {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: name });
      const phone = normPhone($("#aPhone").value);
      if (phone) { contact.phone = "0" + phone; save("gonow_contact", contact); }
      try { await cred.user.sendEmailVerification(); } catch (e) { console.warn("Không gửi được email xác minh:", e.code); }
      setUser(auth.currentUser); openVerify("Đăng ký thành công! Hãy xác minh email để đặt hàng.");
      coolDown("#vResend", "Gửi lại email", 60);
    } else {
      await auth.signInWithEmailAndPassword(email, pass);
      const u = auth.currentUser; setUser(u);
      if (isVerified(u)) { closeAuth(); if (!fromOrder) { showTab("account"); window.scrollTo({ top: 0 }); } toast("Đăng nhập thành công!"); }
      else openVerify("Tài khoản chưa xác minh email.");
    }
  } catch (err) {
    msg.textContent = err.code === "auth/operation-not-allowed"
      ? "Dự án Firebase “" + FIREBASE_CONFIG.projectId + "” chưa bật đăng nhập Email/Password (Authentication → Sign-in method). Mã lỗi: " + err.code
      : (AUTH_ERR[err.code] || "Có lỗi xảy ra (" + err.code + ")");
    updateAuthBtn();
  }
}

async function resetPassword() {
  const email = $("#aEmail").value.trim(), m = $("#amsg");
  if (!/^\S+@\S+\.\S+$/.test(email)) { m.className = "msg bad"; m.textContent = "Nhập email của bạn rồi bấm lại “Quên mật khẩu”."; return; }
  if (!useFirebase) { m.className = "msg bad"; m.textContent = "Cần cấu hình Firebase để gửi email đặt lại mật khẩu."; return; }
  try { await auth.sendPasswordResetEmail(email); m.className = "msg ok"; m.textContent = "Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư (cả mục Spam)."; }
  catch (err) { m.className = "msg bad"; m.textContent = AUTH_ERR[err.code] || "Không gửi được email (" + err.code + ")"; }
}

// ---- HỘP XÁC NHẬN dùng chung (thay cho confirm() mặc định của trình duyệt) ----
const CFM_ICONS = {
  logout: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  trash: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>',
  warn: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"/></svg>'
};
let cfmResolve = null;
function askConfirm({ title, text = "", yes = "Xác nhận", no = "Quay lại", danger = false, icon = "warn" }) {
  closeConfirm(false);
  return new Promise(res => {
    cfmResolve = res;
    $("#cfmIcon").innerHTML = CFM_ICONS[icon] || CFM_ICONS.warn;
    $("#cfmIcon").className = "cfmIcon" + (danger ? " danger" : "");
    $("#cfmTitle").textContent = title; $("#cfmText").textContent = text;
    $("#cfmYes").textContent = yes; $("#cfmYes").className = "btn" + (danger ? " danger" : "");
    $("#cfmNo").textContent = no;
    $("#confirmWrap").hidden = false; $("#cfmNo").focus();
  });
}
function closeConfirm(result) {
  if (!cfmResolve) return;
  const r = cfmResolve; cfmResolve = null;
  $("#confirmWrap").hidden = true; r(result);
}

async function logout() {
  const ok = await askConfirm({ icon: "logout", danger: true, yes: "Đăng xuất", no: "Ở lại",
    title: "Đăng xuất khỏi GoNow?",
    text: useFirebase ? `Bạn đang đăng nhập với tên “${user.name}”. Giỏ hàng và đơn hàng được lưu theo tài khoản, đăng nhập lại là thấy.` : `Bạn đang đăng nhập với tên “${user.name}”. Giỏ hàng và lịch sử đơn vẫn được giữ trên thiết bị này.` });
  if (!ok) return;
  if (useFirebase) auth.signOut(); else { user = null; localStorage.removeItem("gonow_user"); renderUser(); }
  toast("Đã đăng xuất");
}

// ---- ĐỒ ĂN: tìm kiếm, lọc, sắp xếp ----
function foodCard(f, promo) {
  const liked = favs.includes(f.id);
  return `<article class="card">
    <div class="pic" data-act="detail" data-id="${f.id}" role="button" tabindex="0" aria-label="Xem chi tiết ${esc(f.name)}"><img src="${imgOf("food", f)}" alt="${esc(f.name)}" loading="lazy" decoding="async" onerror="${failImg(catIcon(f.cat))}">${promo ? '<span class="promo">Ưu đãi</span>' : ""}<button class="heart ${liked ? "on" : ""}" data-act="fav" data-id="${f.id}" aria-label="Yêu thích">${liked ? "♥" : "♡"}</button></div>
    <div class="info"><b class="nm" data-act="detail" data-id="${f.id}">${esc(f.name)}</b><small>${esc(f.cat)} • ★ ${f.rating}</small><small>${esc(f.desc)}</small>
      <div class="cardFoot"><span class="price">${money(f.price)}</span>
        <button class="cartIco" data-act="add" data-id="${f.id}" aria-label="Thêm ${esc(f.name)} vào giỏ hàng" title="Thêm vào giỏ hàng">${CART_SVG}</button></div></div></article>`;
}

function renderFood() {
  const raw = $("#q").value.trim(), q = norm(raw), cat = $("#cat").value;
  const maxPrice = +$("#price").value, sort = $("#sort").value, onlyFav = $("#onlyFav").checked;
  const list = FOODS.filter(f =>
    norm(f.name + " " + f.cat).includes(q) && (cat === "all" || f.cat === cat) &&
    (!maxPrice || f.price <= maxPrice) && (!onlyFav || favs.includes(f.id)));
  if (sort === "asc") list.sort((a, b) => a.price - b.price);
  if (sort === "desc") list.sort((a, b) => b.price - a.price);
  $("#foodList").textContent = raw ? `Kết quả cho “${raw}”` : "Toàn bộ thực đơn";
  $("#foodGrid").innerHTML = list.length ? list.map(foodCard).join("")
    : `<p class="empty">${onlyFav && !favs.length ? "Bạn chưa có món yêu thích. Bấm ♡ trên món để lưu lại nhé." : "Không tìm thấy món phù hợp. Thử đổi từ khóa hoặc bộ lọc nhé."}</p>`;
  syncFilterUI(); reveal($("#foodGrid"));
}

function toggleFav(id) {
  favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
  save("gonow_favs", favs);
  const on = favs.includes(id);
  document.querySelectorAll(`.heart[data-id="${id}"]`).forEach(b => {   // đổi tại chỗ, không vẽ lại cả danh sách
    b.classList.toggle("on", on); b.textContent = on ? "♥" : "♡"; b.classList.add("pop"); setTimeout(() => b.classList.remove("pop"), 350);
  });
  syncFilterUI();
  if ($("#onlyFav").checked) renderFood();
}

// ---- CỬA HÀNG (mô phỏng) ----
// Khoảng cách = đường chim bay từ khu vực đã chọn × 1.3 + độ lệch trong khu vực của cửa hàng
function storeKm(s) {
  const [x1, y1] = DISTRICTS[loc], [x2, y2] = DISTRICTS[s.district];
  return Math.round((Math.hypot(x2 - x1, y2 - y1) * 1.3 + s.near) * 10) / 10;
}
const cartStoreObj = () => STORES.find(s => s.id === (direct ? direct.sid : cartStore));
const cartKm = () => { const s = cartStoreObj(); return s ? storeKm(s) : 0; };
// Phí giao = phí cơ bản (SHIP_FEE, admin chỉnh) cho 2 km đầu + 5.000đ mỗi km tiếp theo
const shipFeeKm = km => SHIP_FEE + Math.max(0, Math.ceil(km - 2)) * 5000;
const shipFee = () => shipFeeKm(cartKm());
const storeMin = km => Math.round(km / 25 * 60) + 12;
const chip = code => { const v = VOUCHERS[code]; if (!v) return ""; return `<span class="chip">${code}: ${v.pct ? "giảm " + v.pct + "%" : "miễn phí giao" + (v.min ? " từ " + v.min / 1000 + "K" : "")}</span>`; };

function storeCard(s) {
  return `<button class="store" data-act="store" data-id="${s.id}">
    ${pic(imgOf("store", s), "logoBox", catIcon(s.cats[0]))}
    <span class="sname">${esc(s.name)}</span>
    <span class="smeta"><span>${storeKm(s)} km • ★ ${s.rating}</span><span>Giao ${money(shipFeeKm(storeKm(s)))}</span></span>
    <span class="chips">${s.promos.map(chip).join("")}</span></button>`;
}


const renderLoc = () => { $("#locText").textContent = loc + ", TP.HCM"; const nl = $("#navLoc"); if (nl) nl.textContent = loc; };
function setLoc(d) {
  loc = d; save("gonow_loc", loc);
  renderLoc(); renderStores();
  $("#from").value = loc; renderRide();   // điểm đón mặc định = khu vực đã chọn
  closeModal(); toast("Đã chọn khu vực " + d);
}
function makeKey(foodId, opt = [], note = "") {
  const normOpt = Array.isArray(opt)
    ? opt.map(o => (o && typeof o === "object" ? `${o.group ?? o.grp ?? ""}:${o.id ?? o.name ?? o.value ?? ""}` : String(o ?? ""))).join(",")
    : String(opt ?? "");
  return `${Number(foodId) || foodId}|${normOpt}|${String(note || "").trim()}`;
}

function lineKey(item) {
  if (!item) return "";
  if (item.k) return String(item.k);
  return makeKey(item.id, item.opt || [], item.note || "");
}
if (typeof lineText !== "function") {
  window.lineText = function (item) {
    if (!item || !Array.isArray(item.opt) || !item.opt.length) return "";
    return item.opt
      .map(o => (typeof o === "string" ? o : (o && (o.name || o.label || o.value || o.id)) || ""))
      .filter(Boolean)
      .join(", ");
  };
}

function unitPrice(itemOrFood, optSel = []) {
  // Hỗ trợ cả 2 kiểu gọi: unitPrice(cartItem) hoặc unitPrice(food, optSel)
  const isCartItem = itemOrFood && typeof itemOrFood === "object" && "id" in itemOrFood && !("price" in itemOrFood);
  const f = isCartItem ? foodById(itemOrFood.id) : itemOrFood;
  if (!f) return 0;

  const base = Number(f.price) || 0;
  const sel = isCartItem ? (itemOrFood.opt || []) : (optSel || []);

  // Nếu có hàm tính giá option riêng (ví dụ optionExtra / optPrice), dùng nó; nếu không thì cộng delta từ danh sách option của món
  if (typeof optionExtra === "function") {
    return Math.max(0, base + (Number(optionExtra(f, sel)) || 0));
  }

  let extra = 0;
  if (Array.isArray(f.options) && Array.isArray(sel)) {
    for (const choice of sel) {
      for (const grp of f.options) {
        const found = (grp.choices || grp.items || []).find(
          c => (c.id ?? c.name ?? c) === (choice && typeof choice === "object" ? (choice.id ?? choice.name) : choice)
        );
        if (found && typeof found === "object") {
          extra += Number(found.price ?? found.extra ?? 0) || 0;
        }
      }
    }
  }
  return Math.max(0, base + extra);
}
// ---- GIỎ HÀNG ----
function cartSubtotal() {
  const list = (typeof direct !== "undefined" && direct) ? [direct] : (cart || []);
  return list.reduce((sum, c) => sum + unitPrice(c) * (Number(c.qty) || 1), 0);
}   // unitPrice: giá món + phụ thu tùy chọn (js/options.js)

function cartChanged(remote) {
  if (!cart.length) cartStore = 0;
  save("gonow_cart", cart); save("gonow_cartstore", cartStore);
  $("#badge").textContent = cart.reduce((s, c) => s + c.qty, 0);
  if (!$("#drawerWrap").hidden) renderDrawer();
  if (!remote) cartPush();   // đã đăng nhập: đẩy giỏ lên Firestore để đăng nhập máy nào cũng thấy
}

// Quán bán món này: ưu tiên quán đang chọn / quán đang có trong giỏ (nếu bán đúng danh mục), không thì quán gần nhất
function pickStoreFor(f, sid = 0) {
  const cur = STORES.find(s => s.id === cartStore);
  return sid || (cur && cart.length && cur.cats.includes(f.cat) ? cur.id
    : (STORES.filter(s => s.cats.includes(f.cat)).sort((x, y) => storeKm(x) - storeKm(y))[0] || {}).id || 0);
}
function addCart(id, sid = 0, qty = 1, after, line = {}) {
  const f = foodById(Number(id) || id);
  if (!f) return;
  direct = null;
  sid = pickStoreFor(f, sid);
  const cur = STORES.find(s => s.id === cartStore);
  const put = () => {
    cartStore = sid;
    const opt = line.opt || (typeof defaultSel === "function" ? defaultSel(f) : []);
    const note = line.note || "";
    const k = typeof makeKey === "function" ? makeKey(f.id, opt, note) : `${f.id}|${note}`;
    const item = cart.find(c => (typeof lineKey === "function" ? lineKey(c) : (c.k || `${c.id}|${c.note || ""}`)) === k);
    const maxQ = (typeof GUARD !== "undefined" && GUARD.maxQtyPerItem) || 99;
    if (item) item.qty = Math.min(maxQ, item.qty + qty);
    else cart.push({ id: f.id, qty: Math.min(maxQ, qty), opt, note, k });
    cartChanged();
    if (typeof flyToCart === "function") flyToCart();
    toast(`Đã thêm ${f.name} vào giỏ`);
    if (after) after();
  };
  if (cart.length && cartStore && sid && sid !== cartStore) {
    askConfirm({
      icon: "warn",
      title: "Đổi cửa hàng?",
      text: `Giỏ đang có món của “${cur ? cur.name : "cửa hàng khác"}”. Mỗi đơn chỉ đặt từ một cửa hàng; thêm món này sẽ xóa giỏ hiện tại.`,
      yes: "Xóa giỏ & thêm",
      no: "Giữ giỏ"
    }).then(ok => { if (ok) { cart = []; put(); } });
    return;
  }
  put();
}

function changeQty(key, delta) {
  const item = activeCart().find(c => lineKey(c) === String(key));
  if (!item) return;
  item.qty += delta;
  if (direct) { item.qty = Math.max(1, Math.min(GUARD.maxQtyPerItem, item.qty)); renderDrawer(); return; }   // mua ngay: tối thiểu 1
  if (item.qty <= 0) cart = cart.filter(c => lineKey(c) !== String(key));
  cartChanged();
}

// Công thức tiền: tổng = tạm tính − giảm giá + phí giao. Sửa quy tắc giảm giá tại đây.
function calc(subtotal, ship) {
  vouchers = vouchers.filter(v => {
    if (v.min && subtotal < v.min) { voucherMsg = { text: `Mã ${v.code} không còn đủ điều kiện, đã gỡ.`, ok: false }; return false; }
    return true;
  });
  let discount = 0;
  vouchers.forEach(v => { if (v.pct) discount += Math.round(subtotal * v.pct / 100); if (v.freeship) ship = 0; });
  discount = Math.min(discount, subtotal);
  return { subtotal, discount, ship, total: subtotal - discount + ship };
}

// ---- ĐẶT XE ----
// Hai chế độ: "map" (Google Maps, khi có GOOGLE_MAPS_KEY) và "legacy" (chọn quận mô phỏng như cũ).
// Bản đồ thật: Google Maps nếu có GOOGLE_MAPS_KEY, không thì OpenStreetMap (miễn phí, không cần key).
// Nếu không tải được bản đồ (mất mạng...) thì tự quay về chế độ chọn quận mô phỏng.
const useGoogle = typeof GOOGLE_MAPS_KEY !== "undefined" && !!GOOGLE_MAPS_KEY;
let rideMode = "map";
const gm = { st: "idle", seq: 0, acSeq: { from: 0, to: 0 }, mk: {}, sug: { from: [], to: [] }, active: "from", token: null, line: null, lib: {}, map: null };
const VN_BOUNDS = { west: 106.3, east: 107.1, south: 10.3, north: 11.2 };   // ưu tiên gợi ý quanh TP.HCM
const ll = v => ({ lat: typeof v.lat === "function" ? v.lat() : v.lat, lng: typeof v.lng === "function" ? v.lng() : v.lng });

function distanceKm() {
  if (rideMode === "map") return trip.fromLoc && trip.toLoc && !trip.busy ? trip.km : 0;
  if (!trip.from || !trip.to || trip.from === trip.to) return 0;
  const [x1, y1] = DISTRICTS[trip.from], [x2, y2] = DISTRICTS[trip.to];
  // Khoảng cách đường chim bay × 1.3 (hệ số đường đi), làm tròn 0,1 km
  return Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) * 1.3 * 10) / 10);
}
// Cước = giá mở cửa + km × giá mỗi km (làm tròn nghìn đồng)
const fareOf = (v, km) => Math.round((v.base + km * v.perKm) / 1000) * 1000;
const kmUnit = () => (rideMode === "map" ? (trip.exact ? "" : " (ước tính)") : " (mô phỏng)");

function setRideMode(m) {
  rideMode = m;
  $("#rideMapUI").hidden = m !== "map"; $("#mapCol").hidden = m !== "map"; $("#rideLegacy").hidden = m !== "legacy";
  $("#ride").classList.toggle("withMap", m === "map");
  renderRide();
}

function renderRide() {
  const map = rideMode === "map";
  if (map) { trip.from = trip.fromLoc ? trip.fromLoc.address : ""; trip.to = trip.toLoc ? trip.toLoc.address : ""; }
  else { trip.from = $("#from").value; trip.to = $("#to").value; }
  const km = distanceKm(), ok = km > 0;
  const hint = trip.busy ? "Đang tính quãng đường…" : map ? "Nhập điểm đón và điểm đến để xem giá" : "Chọn 2 điểm khác nhau để xem giá";
  $("#vehicles").innerHTML = Object.entries(VEHICLES).map(([key, v]) => `
    <div class="veh ${trip.vehicle === key ? "sel" : ""}" data-act="veh" data-id="${key}">
      ${pic(`images/vehicle/${key}.png`, "thumb")}
      <div><b>${v.name}</b><small>${v.desc} • mở cửa ${money(v.base)} + ${money(v.perKm)}/km</small>
        <small>${ok ? `~${km} km${kmUnit()} • khoảng ${Math.round(km / v.speed * 60) + 3} phút` : hint}</small></div>
      <b>${ok ? "~" + money(fareOf(v, km)) : "—"}</b></div>`).join("");
  $("#bookBtn").disabled = !ok;
  $("#bookBtn").textContent = ok ? (trip.sched ? "Hẹn xe lúc " + fmtWhen(trip.sched) : "Đặt xe ngay") : trip.busy ? "Đang tính quãng đường…" : map ? "Nhập điểm đón và điểm đến" : "Chọn 2 khu vực khác nhau";
}

// ---- Google Maps: tải khi mở tab Đặt xe lần đầu ----
window.gm_authFailure = () => {   // Google gọi hàm này khi key sai / chưa bật dịch vụ / chưa có billing
  if (rideMode !== "map") return;
  gm.st = "failed"; setRideMode("legacy"); toast("Google Maps báo lỗi key. Đang dùng chế độ chọn quận.");
};
const mapMsg = t => { const m = $("#mapMsg"); m.textContent = t || ""; m.hidden = !t; };

function loadMapsScript() {
  return new Promise((ok, bad) => {
    if (window.google && google.maps && google.maps.importLibrary) return ok();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&loading=async&language=vi&region=VN&v=weekly`;
    s.async = true; s.onload = ok; s.onerror = () => bad(new Error("Không tải được script Google Maps"));
    document.head.appendChild(s);
  });
}

async function initRideMap() {
  if (rideMode !== "map") return;
  if (!useGoogle) return initOsmMap();
  if (gm.st === "ready") return google.maps.event.trigger(gm.map, "resize");
  if (gm.st !== "idle") return;
  gm.st = "loading"; mapMsg("Đang tải bản đồ…");
  try {
    await loadMapsScript();
    const [maps, marker, places, routes, geo, core] = await Promise.all(["maps", "marker", "places", "routes", "geocoding", "core"].map(n => google.maps.importLibrary(n)));
    gm.lib = { maps, marker, places, routes, geo, core };
    gm.map = new maps.Map($("#map"), {
      center: { lat: 10.7769, lng: 106.7009 }, zoom: 13, mapId: (typeof GOOGLE_MAP_ID !== "undefined" && GOOGLE_MAP_ID) || "DEMO_MAP_ID",
      disableDefaultUI: true, zoomControl: true, fullscreenControl: true, gestureHandling: "greedy", clickableIcons: false
    });
    gm.map.addListener("click", e => pickOnMap(e.latLng));
    gm.st = "ready"; mapMsg("");
    if (!gm.autoLocated && !trip.fromLoc) { gm.autoLocated = true; locateMe(true); }   // tự hỏi vị trí hiện tại
  } catch (err) {
    console.error("Google Maps lỗi:", err);
    gm.st = "failed"; setRideMode("legacy"); toast("Chưa tải được Google Maps. Đang dùng chế độ chọn quận.");
  }
}

// Lấy vị trí hiện tại → đặt làm điểm đón. auto = true: tự hỏi quyền khi vừa mở tab Đặt xe (chỉ 1 lần)
function locateMe(auto) {
  if (gm.st !== "ready") return auto ? 0 : toast("Bản đồ chưa sẵn sàng.");
  if (!navigator.geolocation) return auto ? 0 : toast("Trình duyệt không hỗ trợ định vị.");
  if (auto) mapMsg("Đang xác định vị trí của bạn… Hãy bấm “Cho phép” khi trình duyệt hỏi."); else toast("Đang lấy vị trí của bạn…");
  navigator.geolocation.getCurrentPosition(async pos => {
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const addr = await reverseGeocode(p);
    mapMsg(""); setPoint("from", { ...p, address: addr });
  }, err => {
    mapMsg("");
    toast(err.code === 1 ? "Bạn đã chặn quyền vị trí. Hãy bật lại trong cài đặt trình duyệt, hoặc tự nhập điểm đón." : "Không lấy được vị trí. Hãy bật GPS/định vị hoặc tự nhập điểm đón.");
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

async function reverseGeocode(p) {
  if (!useGoogle) return osmReverse(p);
  try {
    const { results } = await new gm.lib.geo.Geocoder().geocode({ location: p });
    if (results && results[0]) return results[0].formatted_address;
  } catch (err) { console.warn("Geocoding lỗi:", err); }
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

function pinEl(w) { const d = document.createElement("div"); d.className = "pin " + w; d.textContent = w === "from" ? "A" : "B"; return d; }
function updateMarkers() {
  if (!useGoogle) return osmMarkers();
  ["from", "to"].forEach(w => {
    const p = trip[w + "Loc"]; let m = gm.mk[w];
    if (!p) { if (m) { m.map = null; gm.mk[w] = null; } return; }
    if (!m) {
      m = new gm.lib.marker.AdvancedMarkerElement({ map: gm.map, position: p, content: pinEl(w), gmpDraggable: true, title: w === "from" ? "Điểm đón" : "Điểm đến" });
      m.addListener("dragend", async () => { const q = ll(m.position); setPoint(w, { ...q, address: await reverseGeocode(q) }); });
      gm.mk[w] = m;
    } else m.position = p;
  });
}

// ---- OpenStreetMap (miễn phí): Leaflet = bản đồ, Photon/Nominatim = tìm địa chỉ, OSRM = đường đi và số km ----
const sheetH = () => { const p = document.querySelector(".ridePanel"); return p && document.body.classList.contains("ride-on") ? Math.min(p.offsetHeight, innerHeight * 0.6) : 0; };   // chiều cao bảng đặt xe che bản đồ
function focusMap(pt) {
  if (useGoogle) { gm.map.panTo(pt); gm.map.setZoom(16); } else { gm.map.setView([pt.lat, pt.lng], 16); if (innerWidth < 900 && sheetH()) gm.map.panBy([0, sheetH() / 2], { animate: false }); }
}
function loadLeaflet() {
  return new Promise((ok, bad) => {
    if (window.L && L.map) return ok();
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    sc.onload = ok; sc.onerror = () => bad(new Error("Không tải được thư viện bản đồ Leaflet")); document.head.appendChild(sc);
  });
}
async function initOsmMap() {
  if (gm.st === "ready") return gm.map.invalidateSize();
  if (gm.st !== "idle") return;
  gm.st = "loading"; mapMsg("Đang tải bản đồ…");
  try {
    await loadLeaflet();
    gm.map = L.map("map", { zoomControl: true }).setView([10.7769, 106.7009], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(gm.map);
    gm.map.on("click", e => pickOnMap(e.latlng));
    gm.st = "ready"; mapMsg("");
    setTimeout(() => gm.map.invalidateSize(), 60);
    if (!gm.autoLocated && !trip.fromLoc) { gm.autoLocated = true; locateMe(true); }   // tự hỏi vị trí hiện tại
  } catch (err) {
    console.error("Bản đồ lỗi:", err);
    gm.st = "failed"; setRideMode("legacy"); toast("Chưa tải được bản đồ (kiểm tra mạng). Đang dùng chế độ chọn quận.");
  }
}
function osmMarkers() {
  ["from", "to"].forEach(w => {
    const q = trip[w + "Loc"]; let m = gm.mk[w];
    if (!q) { if (m) { m.remove(); gm.mk[w] = null; } return; }
    if (!m) {
      m = L.marker([q.lat, q.lng], {
        draggable: true, title: w === "from" ? "Điểm đón" : "Điểm đến",
        icon: L.divIcon({ className: "osmPin", html: `<div class="pin ${w}">${w === "from" ? "A" : "B"}</div>`, iconSize: [32, 42], iconAnchor: [16, 41] })
      }).addTo(gm.map);
      m.on("dragend", async () => { const c = m.getLatLng(), pt = { lat: c.lat, lng: c.lng }; setPoint(w, { ...pt, address: await reverseGeocode(pt) }); });
      gm.mk[w] = m;
    } else m.setLatLng([q.lat, q.lng]);
  });
}
const shortAddr = name => name.split(", ").filter(x => x !== "Việt Nam" && !/^\d{4,6}$/.test(x)).join(", ");
async function osmReverse(q) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${q.lat}&lon=${q.lng}&zoom=18&accept-language=vi`);
    const j = await r.json();
    if (j && j.display_name) return shortAddr(j.display_name);
  } catch (err) { console.warn("Nominatim reverse:", err); }
  return `${q.lat.toFixed(5)}, ${q.lng.toFixed(5)}`;
}
async function osmSearch(text) {
  try {   // Photon (dữ liệu OpenStreetMap) hỗ trợ gợi ý khi gõ
    const j = await (await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=6&lat=10.78&lon=106.70&lang=default`)).json();
    const out = (j.features || []).filter(f => !f.properties.countrycode || f.properties.countrycode === "VN").map(f => {
      const pr = f.properties, main = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(" ");
      const sub = [pr.name && pr.street ? (pr.housenumber ? pr.housenumber + " " : "") + pr.street : "", pr.district, pr.city || pr.state].filter(Boolean).join(", ");
      return { main, sub, label: [main, sub].filter(Boolean).join(", "), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    });
    if (out.length) return out;
  } catch (err) { console.warn("Photon:", err); }
  const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(text)}&countrycodes=vn&limit=6&accept-language=vi`)).json();
  return j.map(x => { const label = shortAddr(x.display_name), parts = label.split(", "); return { main: parts[0], sub: parts.slice(1).join(", "), label, lat: +x.lat, lng: +x.lon }; });
}
async function osmSuggest(which) {
  const inp = $(which === "from" ? "#pFrom" : "#pTo"), list = $(which === "from" ? "#acFrom" : "#acTo"), text = inp.value.trim();
  if (gm.st !== "ready" || text.length < 3) { list.hidden = true; return; }
  const mine = ++gm.acSeq[which];
  try {
    const res = await osmSearch(text);
    if (mine !== gm.acSeq[which]) return;
    gm.sug[which] = res;
    list.innerHTML = res.length
      ? res.map((r, i) => `<li><button type="button" class="acItem" data-act="pickSug" data-id="${which}:${i}"><b>${esc(r.main || r.label)}</b><small>${esc(r.sub)}</small></button></li>`).join("")
      : '<li class="acEmpty">Không tìm thấy địa điểm phù hợp. Hãy thử gõ thêm tên đường/quận hoặc chạm vào bản đồ.</li>';
  } catch (err) {
    console.warn("Tìm địa chỉ lỗi:", err);
    list.innerHTML = '<li class="acEmpty">Không tìm được địa chỉ lúc này. Bạn có thể chạm trực tiếp lên bản đồ để chọn điểm.</li>';
  }
  list.hidden = false;
}
async function osrmRoute(a, b) {   // máy chủ demo của OSRM (miễn phí, dữ liệu OpenStreetMap)
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
  const j = await r.json();
  if (j.code !== "Ok" || !j.routes || !j.routes[0]) throw new Error("OSRM: " + (j.code || r.status));
  return { km: j.routes[0].distance / 1000, path: j.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) };
}

function clearRoute() { trip.path = null; if (gm.line) { if (useGoogle) gm.line.setMap(null); else gm.line.remove(); gm.line = null; } trip.km = 0; trip.busy = false; gm.seq++; }

function setPoint(which, pt) {
  if (gm.st !== "ready") return;
  trip[which + "Loc"] = pt;
  $(which === "from" ? "#pFrom" : "#pTo").value = pt.address;
  $(which === "from" ? "#acFrom" : "#acTo").hidden = true;
  updateMarkers();
  if (!(trip.fromLoc && trip.toLoc)) { clearRoute(); focusMap(pt); renderRide(); }
  else computeRoute();
}

async function pickOnMap(latLng) {
  if (gm.st !== "ready") return;
  const which = !trip.fromLoc ? "from" : !trip.toLoc ? "to" : gm.active, p = ll(latLng);
  setPoint(which, { ...p, address: await reverseGeocode(p) });
}

const haversineKm = (a, b) => {
  const R = 6371, rad = d => d * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Lấy quãng đường thật: ưu tiên Routes API (Route.computeRoutes), rồi Directions, cuối cùng ước tính đường chim bay × 1.3
async function computeRoute() {
  const a = trip.fromLoc, b = trip.toLoc;
  clearRoute();
  if (!a || !b) return renderRide();
  if (haversineKm(a, b) < 0.05) { toast("Điểm đón và điểm đến đang trùng nhau."); return renderRide(); }
  const seq = gm.seq; trip.busy = true; renderRide();
  let km = 0, path = null, exact = false;
  const R = useGoogle ? gm.lib.routes : null;
  if (!useGoogle) {
    try { const r = await osrmRoute(a, b); km = r.km; path = r.path; exact = true; }
    catch (err) { console.warn("OSRM:", err); }
  } else try {
    if (R.Route && R.Route.computeRoutes) {
      const { routes } = await R.Route.computeRoutes({ origin: a, destination: b, travelMode: "DRIVE", fields: ["path", "distanceMeters"] });
      if (routes && routes[0]) { km = routes[0].distanceMeters / 1000; path = routes[0].path.map(ll); exact = true; }
    }
  } catch (err) { console.warn("Routes API:", err); }
  if (useGoogle && !exact) {
    try {
      const res = await new R.DirectionsService().route({ origin: a, destination: b, travelMode: "DRIVING" });
      km = res.routes[0].legs[0].distance.value / 1000; path = res.routes[0].overview_path.map(ll); exact = true;
    } catch (err) { console.warn("Directions API:", err); }
  }
  if (seq !== gm.seq) return;   // người dùng đã đổi điểm trong lúc chờ
  if (!exact) { km = haversineKm(a, b) * 1.3; path = [a, b]; toast("Chưa lấy được đường đi thật, đang ước tính quãng đường."); }
  trip.km = Math.max(1, Math.round(km * 10) / 10); trip.exact = exact; trip.busy = false; trip.path = path;
  if (useGoogle) {
    gm.line = new gm.lib.maps.Polyline({ map: gm.map, path, strokeColor: "#00b14f", strokeWeight: 5, strokeOpacity: exact ? 0.9 : 0.5 });
    const bounds = new gm.lib.core.LatLngBounds(); path.forEach(p => bounds.extend(p));
    gm.map.fitBounds(bounds, { top: 90, bottom: 70 + sheetH(), left: 70, right: 70 });
  } else {
    gm.line = L.polyline(path.map(q => [q.lat, q.lng]), { color: "#007a3b", weight: 5, opacity: exact ? 0.9 : 0.5, dashArray: exact ? null : "8 8" }).addTo(gm.map);
    gm.map.fitBounds(gm.line.getBounds(), { paddingTopLeft: [50, 90], paddingBottomRight: [50, 50 + sheetH()] });
  }
  renderRide();
}

// Gợi ý địa chỉ (Places API New). Ô nhập tự vẽ để đồng bộ giao diện với web.
async function suggest(which) {
  if (!useGoogle) return osmSuggest(which);
  const inp = $(which === "from" ? "#pFrom" : "#pTo"), list = $(which === "from" ? "#acFrom" : "#acTo"), q = inp.value.trim();
  if (gm.st !== "ready" || q.length < 2) { list.hidden = true; return; }
  const mine = ++gm.acSeq[which], P = gm.lib.places;
  try {
    gm.token = gm.token || new P.AutocompleteSessionToken();
    const { suggestions } = await P.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, sessionToken: gm.token, includedRegionCodes: ["vn"], locationBias: VN_BOUNDS });
    if (mine !== gm.acSeq[which]) return;
    gm.sug[which] = suggestions.map(s => s.placePrediction).filter(Boolean);
    list.innerHTML = gm.sug[which].length
      ? gm.sug[which].map((p, i) => `<li><button type="button" class="acItem" data-act="pickSug" data-id="${which}:${i}"><b>${esc(p.mainText ? p.mainText.text : p.text.text)}</b><small>${esc(p.secondaryText ? p.secondaryText.text : "")}</small></button></li>`).join("")
      : '<li class="acEmpty">Không tìm thấy địa điểm phù hợp</li>';
  } catch (err) {
    console.warn("Places lỗi:", err);
    list.innerHTML = '<li class="acEmpty">Không lấy được gợi ý. Hãy kiểm tra đã bật “Places API (New)” cho key.</li>';
  }
  list.hidden = false;
}

function bindRideInputs() {
  ["from", "to"].forEach(w => {
    const inp = $(w === "from" ? "#pFrom" : "#pTo"); let t;
    inp.addEventListener("input", () => {
      if (trip[w + "Loc"]) { trip[w + "Loc"] = null; updateMarkers(); clearRoute(); renderRide(); }
      clearTimeout(t); t = setTimeout(() => suggest(w), useGoogle ? 250 : 600);   // OpenStreetMap: gõ chậm lại để không bị giới hạn lượt tìm
    });
    inp.addEventListener("focus", () => { gm.active = w; if (!trip[w + "Loc"]) suggest(w); });
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter" && !$(w === "from" ? "#acFrom" : "#acTo").hidden && gm.sug[w][0]) { e.preventDefault(); actions.pickSug(w + ":0"); }
    });
  });
}

// ---- GIỎ HÀNG (ngăn kéo) + MODAL ----
function resetCheckout(mode) {
  ctx = mode; vouchers = []; voucherMsg = { text: "", ok: false };
  ref = "GN" + Date.now().toString().slice(-8);
}
function openDrawer() { direct = null; guardOpen(); resetCheckout("food"); $("#modal").hidden = true; $("#drawerWrap").hidden = false; renderDrawer(); }
function openModal(mode) { guardOpen(); resetCheckout(mode); $("#drawerWrap").hidden = true; $("#modal").hidden = false; renderModal(); }
const closeModal = () => { direct = null; $("#modal").hidden = true; $("#drawerWrap").hidden = true; };
const renderCurrent = () => (ctx === "food" ? renderDrawer() : renderModal());

// Phần chung: mã giảm giá + cách thanh toán (+ QR) và bảng tổng tiền
const contactHTML = () => ctx !== "food" ? "" : `<div style="display:grid;gap:8px;margin:12px 0">
    <input class="v" id="cPhone" inputmode="tel" autocomplete="tel" placeholder="Số điện thoại nhận hàng" value="${esc(contact.phone || (user && user.phone) || "")}">
    <input class="v" id="cAddr" autocomplete="street-address" placeholder="Địa chỉ giao (số nhà, đường, phường)" value="${esc(contact.addr)}">
    <input class="v" id="cNote" placeholder="Ghi chú cho quán (không bắt buộc)" value="${esc(contact.note)}"></div>${addrMapHTML()}`;

// ---- Bản đồ xác nhận địa chỉ giao hàng (OpenStreetMap, miễn phí) ----
const am = { map: null, mk: null, seq: 0, fseq: 0, t: 0, res: "", msg: "" };
const addrHas = () => !!contact.loc;
function addrMapHTML() {
  return `<div class="addrBox"><div class="addrHead"><b>Đây có đúng chỗ bạn ở không?</b><button type="button" class="link2" data-act="addrGps">📍 Dùng vị trí của tôi</button></div>
    <div class="addrMapWrap"><div id="addrMap" class="addrMap"></div></div>
    <p class="addrRes ${contact.loc ? "ok" : ""}" id="addrRes">${esc(am.msg || am.res || "")}</p>
    <p class="addrHint">Nhập địa chỉ ở trên, bản đồ sẽ tự tìm. Nếu ghim chưa đúng, hãy kéo ghim hoặc chạm vào bản đồ để chọn lại. Đây chỉ giúp tài xế tìm nhà dễ hơn.</p></div>`;
}
function addrSay(msg, res) { if (msg !== undefined) am.msg = msg; if (res !== undefined) am.res = res; const n = $("#addrRes"); if (n) { n.textContent = am.msg || am.res || ""; n.classList.toggle("ok", !!contact.loc && !am.msg); } }
async function addrMapMount() {
  const el = $("#addrMap"); if (!el || ctx !== "food") return;
  if (am.map) { try { am.map.remove(); } catch (e) {} am.map = am.mk = null; }
  const seq = ++am.seq;
  try { await loadLeaflet(); } catch (err) { addrSay("Chưa tải được bản đồ (kiểm tra mạng). Bạn vẫn đặt hàng được bình thường."); return; }
  if (seq !== am.seq || !document.body.contains(el)) return;
  const l0 = contact.loc;
  am.map = L.map(el, { zoomControl: true }).setView(l0 ? [l0.lat, l0.lng] : [10.7769, 106.7009], l0 ? 17 : 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(am.map);
  am.map.on("click", e => addrPin({ lat: e.latlng.lat, lng: e.latlng.lng }));
  if (l0) addrMarker(l0); else if (contact.addr.trim().length >= 8) addrFind();
  [80, 400].forEach(ms => setTimeout(() => am.map && am.map.invalidateSize(), ms));
}
function addrMarker(pt) {
  if (!am.map) return;
  if (am.mk) am.mk.setLatLng([pt.lat, pt.lng]);
  else {
    am.mk = L.marker([pt.lat, pt.lng], { draggable: true, title: "Vị trí nhận hàng", icon: L.divIcon({ className: "osmPin", html: '<div class="pin to">●</div>', iconSize: [32, 42], iconAnchor: [16, 41] }) }).addTo(am.map);
    am.mk.on("dragend", () => { const c = am.mk.getLatLng(); addrPin({ lat: c.lat, lng: c.lng }); });
  }
}
async function addrPin(pt, label) {                 // đặt ghim + ghi nhớ; chưa có tên đường thì hỏi OpenStreetMap
  contact.loc = { lat: +pt.lat.toFixed(6), lng: +pt.lng.toFixed(6), label: label || "" };
  addrMarker(contact.loc); save("gonow_contact", contact);
  if (am.map) am.map.setView([pt.lat, pt.lng], Math.max(am.map.getZoom(), 17));
  addrSay("", "Đang xác định vị trí…");
  if (!label) { const l = await osmReverse(pt); if (contact.loc && contact.loc.lat === +pt.lat.toFixed(6)) { contact.loc.label = l; save("gonow_contact", contact); } label = l; }
  addrSay("", "Ghim đang ở: " + label);
}
async function addrFind() {
  const text = contact.addr.trim(); if (text.length < 5 || !am.map) return;
  const seq = ++am.fseq; addrSay("Đang tìm trên bản đồ…");
  try {
    const list = await osmSearch(/hồ chí minh|hcm|sài gòn/i.test(text) ? text : text + ", Hồ Chí Minh");
    if (seq !== am.fseq) return;
    if (!list.length) { addrSay("Chưa tìm thấy địa chỉ này. Hãy chạm vào bản đồ để chọn đúng chỗ bạn ở."); return; }
    addrSay(""); addrPin({ lat: list[0].lat, lng: list[0].lng }, list[0].label);
  } catch (err) { console.warn("Tìm địa chỉ giao:", err); addrSay("Chưa tìm được địa chỉ lúc này. Bạn có thể chạm vào bản đồ để chọn chỗ."); }
}
function addrGps() {
  if (!navigator.geolocation) return toast("Thiết bị không hỗ trợ định vị.");
  if (!am.map) return toast("Bản đồ chưa sẵn sàng.");
  addrSay("Đang lấy vị trí của bạn…");
  navigator.geolocation.getCurrentPosition(
    pos => addrPin({ lat: pos.coords.latitude, lng: pos.coords.longitude }).then(() => { if (contact.loc && contact.loc.label && contact.addr.trim().length < 8) { contact.addr = contact.loc.label; save("gonow_contact", contact); const i = $("#cAddr"); if (i) i.value = contact.addr; } }),
    () => addrSay("Không lấy được vị trí. Hãy cho phép truy cập vị trí hoặc chạm vào bản đồ."), { enableHighAccuracy: true, timeout: 10000 });
}
function payHTML(t) {
  const ride = ctx !== "food", used = usedCodes();
  const sug = Object.entries(VOUCHERS).filter(([c, v]) => v.type === ctx && !vouchers.some(x => x.code === c) && !used.has(c));
  return contactHTML() + `<div class="vbox"><input class="v" id="vcode" placeholder="Nhập mã giảm giá" autocomplete="off" value="">
      <button class="btn sm" data-act="applyV">Áp dụng</button></div>
    ${vouchers.length ? `<div class="vApplied">${vouchers.map(v => `<span class="vTag"><b>${esc(v.code)}</b><i>${esc(v.text || "")}</i><button type="button" data-act="rmV" data-id="${esc(v.code)}" aria-label="Gỡ mã ${esc(v.code)}">✕</button></span>`).join("")}</div>` : ""}
    <p class="msg ${voucherMsg.ok ? "ok" : "bad"}">${esc(voucherMsg.text)}</p>
    ${sug.length ? `<div class="vSug"><span>Mã dành cho bạn:</span>${sug.map(([c, v]) => `<button type="button" data-act="pickV" data-id="${esc(c)}" title="${esc(v.text || "")}">${esc(c)}</button>`).join("")}</div>` : ""}
    <div class="codBox"><span class="codIcon" aria-hidden="true">💵</span>
      <div><b>${ride ? "Trả tiền mặt cho tài xế" : "Thanh toán khi nhận hàng (COD)"}</b>
      <small>${ride ? "Thanh toán trực tiếp khi hoàn thành chuyến." : "Bạn chỉ trả tiền khi đã nhận món. Hãy chuẩn bị " + money(t.total) + " tiền mặt."}</small></div></div>`;
}
function sumHTML(t) {
  return `<div class="sum"><div class="row"><span>Tạm tính</span><span>${money(t.subtotal)}</span></div>
    ${ctx === "food" ? `<div class="row"><span>Phí giao hàng</span><span>${money(t.ship)}</span></div>` : ""}
    <div class="row"><span>Giảm giá</span><span>−${money(t.discount)}</span></div>
    <div class="row total"><span>Tổng cộng</span><span>${money(t.total)}</span></div></div>`;
}
const confirmLabel = () => (ctx === "food" ? "Đặt hàng (COD)" : trip.sched ? "Xác nhận hẹn xe" : "Xác nhận đặt xe");

function renderDrawer() {
  const body = $("#drawerBody"), keep = body.querySelector(".dScroll")?.scrollTop || 0, oldMap = $("#addrMap");
  const close = `<div class="dHead"><button class="dx" data-act="close" aria-label="Đóng"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>`;
  if (!activeCart().length) {
    body.innerHTML = close + `<div class="dEmpty"><span class="emptyArt"><img src="images/empty-cart.png" alt="" onerror="this.remove()"></span>
      <h3>Bắt đầu chọn món!</h3><p>Thêm món ăn vào giỏ hàng và đặt đơn tại đây.</p>
      <button class="link2" data-act="browse">Duyệt cửa hàng</button></div>`;
    return;
  }
  const t = calc(cartSubtotal(), shipFee());
  const lines = activeCart().map(c => { const f = foodById(c.id), k = esc(lineKey(c)), up = unitPrice(c), tx = lineText(c); return `<div class="line">${pic(imgOf("food", f), "thumb")}
      <div class="lmeta"><b>${esc(f.name)}</b>${tx ? `<small class="lopt">${esc(tx)}</small>` : ""}${c.note ? `<small class="lopt">Ghi chú: ${esc(c.note)}</small>` : ""}<small>${money(up)}</small>
        <span class="qty"><button data-act="dec" data-id="${k}" aria-label="Giảm">−</button><i>${c.qty}</i><button data-act="inc" data-id="${k}" aria-label="Tăng">+</button></span></div>
      <b>${money(up * c.qty)}</b><button class="ico" data-act="del" data-id="${k}" aria-label="Xóa ${esc(f.name)}">✕</button></div>`; }).join("");
  body.innerHTML = close + `<h2 class="dTitle">${direct ? "Mua ngay" : "Giỏ hàng của bạn"}</h2>
    ${cartStoreObj() ? `<p style="margin:0 20px 8px;font-size:13px;opacity:.8">Cửa hàng: <b>${esc(cartStoreObj().name)}</b> • ${cartKm()} km</p>` : ""}
    <div class="dScroll">${lines}${direct ? '<p class="note" style="margin:6px 0 0">Đơn này tách riêng, không ảnh hưởng giỏ hàng của bạn.</p>' : '<button class="link" data-act="clear">Xóa toàn bộ giỏ hàng</button>'}${payHTML(t)}</div>
    <div class="dFoot">${sumHTML(t)}<button class="btn block" data-act="confirm">${confirmLabel()}</button></div>`;
  body.querySelector(".dScroll").scrollTop = keep;
  const ph = $("#addrMap");                       // giữ nguyên bản đồ đang chạy khi giỏ vẽ lại (không bị tải lại / nháy)
  if (ph) { if (oldMap && am.map) { ph.replaceWith(oldMap); setTimeout(() => am.map && am.map.invalidateSize(), 50); } else addrMapMount(); }
}

function renderModal() {
  $("#modal .box").classList.toggle("mDetail", ctx === "detail");
  if (ctx === "detail") return renderDetail();
  if (ctx === "location") {
    $("#modalBody").innerHTML = `<h2>Chọn khu vực của bạn</h2><p class="note">Vị trí mô phỏng. Khoảng cách cửa hàng sẽ tính theo khu vực bạn chọn.</p><div style="margin-top:12px">`
      + Object.keys(DISTRICTS).map(d => `<button class="opt ${d === loc ? "sel" : ""}" data-act="setLoc" data-id="${d}"><span>${d}, TP.HCM</span><span>${d === loc ? "✓" : ""}</span></button>`).join("") + "</div>";
    return;
  }
  if (ctx === "store") {
    const s = STORES.find(x => x.id === storeId), km = storeKm(s);
    const menu = FOODS.filter(f => s.cats.includes(f.cat));
    $("#modalBody").innerHTML = `<h2>${s.name}</h2>
      <p class="sub">${km} km • khoảng ${storeMin(km)} phút • ★ ${s.rating} • Giao ${money(SHIP_FEE)}</p>
      <div class="chips" style="margin-bottom:8px">${s.promos.map(chip).join("")}</div>
      ${menu.map(f => `<div class="menuRow"><span class="clk" data-act="detail" data-id="${f.id}" role="button" tabindex="0" aria-label="Xem chi tiết ${esc(f.name)}">${pic(imgOf("food", f), "thumb")}</span><span class="mi" style="margin-left:0"><b>${f.name}</b><small>${f.desc}</small></span><b>${money(f.price)}</b>
        <button class="cartIco sm" data-act="add" data-id="${f.id}" aria-label="Thêm ${esc(f.name)} vào giỏ hàng" title="Thêm vào giỏ hàng">${CART_SVG}</button></div>`).join("")}
      <div class="acts"><button class="btn" data-act="openCart">Xem giỏ hàng</button><button class="btn ghost" data-act="close">Tiếp tục xem</button></div>`;
    return;
  }
  // ctx === "ride": xác nhận chuyến xe
  const v = VEHICLES[trip.vehicle], km = distanceKm();
  const t = calc(fareOf(v, km), 0);
  $("#modalBody").innerHTML = `<h2>Xác nhận chuyến xe</h2>
    <div class="row"><span>${esc(trip.from)} → ${esc(trip.to)}</span><b>~${km} km</b></div>
    <div class="row"><span>${v.name}</span><b>${money(t.subtotal)}</b></div>
    ${trip.sched ? `<div class="row"><span>Giờ đón</span><b>${fmtWhen(trip.sched)}</b></div>` : ""}
    <p class="note">${rideMode === "map" ? "Giá chỉ là ước tính, có thể thay đổi theo thực tế." : "Khoảng cách mô phỏng, giá chỉ là ước tính."}</p>
    ${payHTML(t)}${sumHTML(t)}
    <div class="acts"><button class="btn" data-act="confirm">${confirmLabel()}</button><button class="btn ghost" data-act="close">Hủy chuyến</button></div>`;
}

function applyVoucher(pick) {
  const code = (typeof pick === "string" && pick ? pick : ($("#vcode") ? $("#vcode").value : "")).trim().toUpperCase();
  const v = VOUCHERS[code];
  const subtotal = ctx === "food" ? cartSubtotal() : fareOf(VEHICLES[trip.vehicle], distanceKm());
  const clash = v && vouchers.find(x => vKind(x) === vKind(v));
  const set = (text, ok) => { voucherMsg = { text, ok }; };
  if (!code) set("Vui lòng nhập mã giảm giá.", false);
  else if (!v) set("Mã không tồn tại.", false);
  else if (v.type !== ctx) set(`Mã ${code} chỉ áp dụng cho ${v.type === "food" ? "đơn đồ ăn" : "chuyến xe"}.`, false);
  else if (!user) set("Hãy đăng nhập để dùng mã giảm giá (mỗi tài khoản dùng mỗi mã 1 lần).", false);
  else if (vouchers.some(x => x.code === code)) set(`Mã ${code} đã được áp dụng rồi.`, false);
  else if (usedCodes().has(code)) set(`Tài khoản của bạn đã dùng mã ${code} rồi, mỗi mã chỉ dùng được 1 lần.`, false);
  else if (v.min && subtotal < v.min) set(`Mã ${code} cần đơn từ ${money(v.min)}.`, false);
  else if (clash) set(`Mã ${code} cùng loại với ${clash.code}. Chỉ cộng dồn được các mã khác loại (giảm % + miễn phí giao).`, false);
  else { vouchers.push({ code, ...v }); set(`Đã áp dụng ${code}: ${v.text}`, true); }
  renderCurrent();
}

// Dự phòng nếu chưa khai báo ở file khác
if (typeof guardCheck !== "function") {
  window.guardCheck = function () { return ""; };
}
if (typeof guardRecord !== "function") {
  window.guardRecord = function () {};
}
if (typeof guardCancel !== "function") {
  window.guardCancel = function () {};
}

// ---- ĐƠN HÀNG ----
// Bọc ngoài: khóa nút ngay khi bấm (chống click đúp / gửi trùng). Logic thật nằm trong confirmOrderCore.
// Nới lỏng bộ lọc chống spam để không chặn nhầm tài khoản mới / đặt đơn đầu / đặt bình thường
window.guardCheck = function (kind, payload = {}) {
  if (kind === "food") {
    if (!Array.isArray(payload.items) || !payload.items.length) return "Giỏ hàng đang trống.";
    if ((Number(payload.total) || 0) <= 0) return "Giá trị đơn hàng không hợp lệ.";
  }
  return "";
};

if (typeof window.guardOnce !== "function") {
  let _orderLock = false;
  window.guardOnce = async function (fn) {
    if (_orderLock) return;
    _orderLock = true;
    try { return await fn(); }
    finally { setTimeout(() => { _orderLock = false; }, 600); }
  };
}

const confirmOrder = () => guardOnce(confirmOrderCore);
async function confirmOrderCore() {
  if (typeof blockUnverified === "function" && blockUnverified()) return;   // phải đăng nhập và xác minh email mới đặt được
  let detail, items = null, subtotal, ship = 0, store = null;
  if (ctx === "food") {
    const phone = (contact.phone || (user && user.phone) || "").replace(/[\s.]/g, "");
    if (!/^0\d{9}$/.test(phone)) { toast("Nhập số điện thoại hợp lệ (10 số, bắt đầu bằng 0)"); $("#cPhone")?.focus(); return; }
    if (contact.addr.trim().length < 8) { toast("Nhập địa chỉ giao hàng đầy đủ"); $("#cAddr")?.focus(); return; }
    contact.phone = phone; save("gonow_contact", contact);
    store = cartStoreObj();
    // Lưu tên + giá + danh mục tại thời điểm đặt, để admin vẫn thấy đúng dù sau này món bị sửa/xóa
    items = activeCart().map(c => { const f = foodById(c.id), tx = lineText(c); return { id: c.id, qty: c.qty, name: f.name + (tx ? ` (${tx})` : ""), price: unitPrice(c), cat: f.cat, o: c.opt || [], ...(c.note ? { note: c.note } : {}) }; });
    detail = (store ? [`Cửa hàng: ${store.name}`] : []).concat(items.map(i => `${i.name} × ${i.qty}` + (i.note ? ` – ${i.note}` : "")));
    subtotal = cartSubtotal(); ship = shipFee();
  } else {
    if (trip.sched && trip.sched < Date.now() + 20000) { toast("Giờ hẹn đã qua, hãy chọn lại giờ đón."); closeModal(); renderWhen(); return; }
    const km = distanceKm();
    detail = [`${trip.from} → ${trip.to}`, `${VEHICLES[trip.vehicle].name}, ~${km} km${kmUnit()}`];
    subtotal = fareOf(VEHICLES[trip.vehicle], km);
  }
  const dup = vouchers.find(v => usedCodes().has(v.code));   // kiểm tra lại lúc đặt: mỗi tài khoản chỉ dùng mỗi mã 1 lần
  if (dup) { vouchers = vouchers.filter(v => v !== dup); voucherMsg = { text: `Mã ${dup.code} đã được dùng trước đó, đã gỡ khỏi đơn.`, ok: false }; renderCurrent(); toast(voucherMsg.text); return; }
  const t = calc(subtotal, ship);
  const blocked = guardCheck(ctx, { total: t.total, items, phone: ctx === "food" ? contact.phone : "", addr: ctx === "food" ? contact.addr : "", note: ctx === "food" ? contact.note : "" });
  if (blocked) { toast(blocked); return; }
  // Tầng 4: kiểm tra tọa độ / bán kính phục vụ / GPS thiết bị so với điểm đón-giao
  const geo = await guardGeo(ctx === "food"
    ? { kind: "food", to: contact.loc ? { lat: contact.loc.lat, lng: contact.loc.lng } : null, km: cartKm() }
    : { kind: "ride", from: rideMode === "map" ? trip.fromLoc : null, to: rideMode === "map" ? trip.toLoc : null, km: distanceKm() });
  if (geo.block) { toast(geo.block); return; }
  if (geo.confirm && !(await askConfirm({ icon: "warn", title: "Xác nhận vị trí", text: geo.confirm, yes: "Vẫn đặt", no: "Kiểm tra lại" }))) return;
  const orderId = (typeof ref !== "undefined" && ref) ? ref : ("GN" + Date.now().toString().slice(-6));
  const order = { id: orderId, type: ctx, detail, items, ...t, uid: myUid(), deviceId: guardDeviceId(), gps: geo.gps,
    ...(ctx === "food" ? { phone: contact.phone, address: contact.addr.trim(), note: contact.note.trim(), storeId: store ? store.id : 0, storeName: store ? store.name : "", km: cartKm(), geo: contact.loc ? { lat: contact.loc.lat, lng: contact.loc.lng, label: contact.loc.label || "" } : null } : rideExtra(orderId)),
    paid: null,   // luôn trả khi nhận hàng (COD)

    code: vouchers.map(v => v.code).join("+"), codes: vouchers.map(v => v.code), pay: ctx === "food" ? COD : COD_RIDE, status: 0, cancelled: false,
    createdAt: new Date().toLocaleString("vi-VN"), ts: Date.now(),
    customer: user ? user.name + (user.phone ? " • " + user.phone : "") : "Khách vãng lai" };
  orders = load("gonow_orders", orders);   // [FIX] luôn đọc bản mới nhất (admin có thể vừa đổi trạng thái) trước khi thêm đơn
  orders.unshift(order); save("gonow_orders", orders); guardRecord();
  if (ctx === "food") { if (direct) direct = null; else { cart = []; cartChanged(); } } else { trip.sched = 0; renderWhen(); }
  closeModal(); showTab("orders"); window.scrollTo({ top: 0 }); toast(`Đặt thành công! Mã đơn ${order.id}`);
}

// Nội dung chính của đơn: món ăn (ảnh, số lượng, giá) hoặc lộ trình chuyến xe
function orderBody(o) {
  if (o.type === "food") {
    const lines = (o.items || []).map(i => {
      const f = foodById(i.id), name = i.name || (f && f.name);
      if (!name) return "";
      const price = i.price != null ? i.price : f ? f.price : 0;
      return `<li>${pic(f ? imgOf("food", f) : `images/food/${i.id}.jpg`, "thumb", catIcon(i.cat || (f && f.cat)))}<div class="oiName"><b>${esc(name)}</b><small>${money(price)} × ${i.qty}</small></div><b>${money(price * i.qty)}</b></li>`;
    }).join("");
    return (o.storeName ? `<p class="oStore">🏪 <b>${esc(o.storeName)}</b>${o.km ? ` • cách bạn ${o.km} km` : ""}</p>` : "")
      + (lines ? `<ul class="oLines">${lines}</ul>` : `<p>${o.detail.map(esc).join("<br>")}</p>`);
  }
  const [a, b] = o.from ? [o.from, o.to] : String(o.detail[0] || "").split(" → ");
  return `<div class="oRoute"><div><i class="rA">A</i><span>${esc(a || "")}</span></div><div><i class="rB">B</i><span>${esc(b || "")}</span></div></div>`;
}
function orderInfo(o) {
  const rows = o.type === "food"
    ? [["Giao đến", o.address], ["Số điện thoại", o.phone], ["Ghi chú", o.note], ["Thanh toán", o.pay]]
    : [["Phương tiện", o.vehicle || String(o.detail[1] || "").split(",")[0]], ["Quãng đường", o.km ? `~${o.km} km` : ""], ["Giờ đón", o.sched ? fmtWhen(o.sched) : ""], ["Thanh toán", o.pay]];
  const list = rows.filter(r => r[1]);
  return list.length ? `<dl class="oInfo">${list.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : "";
}
function orderCard(o) {
  const food = o.type === "food", steps = food ? FOOD_STEPS : RIDE_STEPS;
  const done = !o.cancelled && o.status === 4, active = !o.cancelled && o.status < 4;
  const live = !food && o.fromLoc && o.toLoc, sim = live ? rideSim(o) : null;
  const wait = !!(live && active && o.status === 0 && sim.waiting);
  const badge = o.cancelled ? '<span class="tag bad">Đã hủy</span>' : wait ? `<span class="tag sch">Hẹn ${fmtWhen(o.sched)}</span>` : `<span class="tag ${done ? "done" : "live"}">${steps[o.status]}</span>`;
  const track = o.cancelled ? '<p class="oCancel">Đơn này đã bị hủy.</p>'
    : `<ol class="track">${steps.map((st, i) => `<li class="${i < o.status || done ? "done" : i === o.status ? "now" : ""}"><i>${i < o.status || done ? "✓" : i + 1}</i><span>${st}</span></li>`).join("")}</ol>`;
  const eta = live && active ? `<p class="etaLine" data-eta="${esc(o.id)}">${esc(etaText(o, sim))}</p>` : "";
  const drv = !food && o.driver && !o.cancelled && o.status >= 1 ? driverHTML(o.driver) : "";
  const rate = !food && done && o.driver ? rateHTML(o) : "";
  const sum = `<div class="oSum"><div><span>Tạm tính</span><span>${money(o.subtotal)}</span></div>
    ${food ? `<div><span>Phí giao hàng</span><span>${money(o.ship)}</span></div>` : ""}
    ${o.discount ? `<div class="disc"><span>Giảm giá${o.code ? ` (${esc(String(o.code).replace(/\+/g, " + "))})` : ""}</span><span>−${money(o.discount)}</span></div>` : ""}
    <div class="tot"><span>Tổng cộng</span><b>${money(o.total)}</b></div></div>`;
  const acts = [
    live && active ? `<button class="btn sm" data-act="track" data-id="${esc(o.id)}">${wait ? "Xem lộ trình" : "Theo dõi trực tiếp"}</button>` : "",
    active && o.status <= 1 ? `<button class="btn sm ghost" data-act="cancel" data-id="${esc(o.id)}">Hủy đơn</button>` : "",
    food && o.items && !active ? `<button class="btn sm" data-act="reorder" data-id="${esc(o.id)}">Đặt lại đơn này</button>` : ""
  ].join("");
  return `<article class="ordCard ${o.cancelled ? "cancelled" : ""}">
    <header><span class="oIcon ${o.type}" aria-hidden="true">${food ? "🍜" : "🛵"}</span>
      <div class="oHead"><b>${food ? "Đơn đồ ăn" : "Chuyến xe"} #${esc(o.id)}</b><small>${esc(o.createdAt)}</small></div>${badge}</header>
    ${track}${eta}${drv}${orderBody(o)}${orderInfo(o)}${sum}${rate}${acts ? `<div class="acts">${acts}</div>` : ""}</article>`;
}

function renderOrders() {
  const type = $("#orderFilter").value, st = $("#orderStatus").value;
  const mine = orders.filter(o => !o.uid || o.uid === myUid());
  const live = mine.filter(o => !o.cancelled && o.status < 4).length, done = mine.filter(o => !o.cancelled && o.status === 4);
  $("#orderStats").hidden = !mine.length;
  $("#orderStats").innerHTML = [["Tổng số đơn", mine.length], ["Đang xử lý", live], ["Hoàn tất", done.length], ["Đã chi tiêu", money(done.reduce((t, o) => t + o.total, 0))]]
    .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("");
  const list = mine.filter(o => (type === "all" || o.type === type)
    && (st === "all" || (st === "cancelled" ? o.cancelled : st === "done" ? !o.cancelled && o.status === 4 : !o.cancelled && o.status < 4)));
  $("#orderList").innerHTML = list.length ? list.map(orderCard).join("")
    : `<div class="empty ordEmpty"><span aria-hidden="true">🧾</span><p>${mine.length ? "Không có đơn nào khớp bộ lọc." : "Chưa có đơn nào. Hãy đặt món hoặc đặt xe đầu tiên của bạn!"}</p>${mine.length ? "" : '<button class="btn" data-act="toFoods">Đặt món ngay</button>'}</div>`;
  reveal($("#orderList"));
}

function updateOrder(id, fn) {
  orders = load("gonow_orders", orders);
  const o = orders.find(x => x.id === id);
  if (o) { fn(o); o.upd = Date.now(); save("gonow_orders", orders); renderOrders(); }
}

// Ảnh danh mục: ưu tiên images/cat/<tên-không-dấu>.jpg (vd mon-nuoc.jpg), nếu chưa có thì dùng số thứ tự cũ 1.jpg, 2.jpg...
const slug = c => norm(c).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const catPic = (c, i) => `<span class="catImg"><img src="images/cat/${slug(c)}.jpg" alt="" onerror="this.onerror=function(){this.remove()};this.src='images/cat/${i + 1}.jpg'"></span>`;

// ---- TRANG CHỦ: lời chào, ô nhanh, danh mục, ưu đãi ----
function renderHome() {
$("#quick").innerHTML = QUICK.map(([label, act, id], i) =>
  `<button class="qk" data-act="${act}" data-id="${id}"><span class="qIcon"><img src="images/quick/${i + 1}.png" alt="${label}"></span><span>${label}</span></button>`
).join(""); // ... giữ nguyên phần còn lại của renderHome()
  const cats = [...new Set(FOODS.map(f => f.cat))];
  $("#cats").innerHTML = cats.map((c, i) => `<button class="cat" data-act="pickCat" data-id="${c}">
    ${catPic(c, i)}<span>${c}</span></button>`).join("");
  $("#ftCats").innerHTML = cats.map(c => `<li><button class="fl" data-act="pickCat" data-id="${c}">${c}</button></li>`).join("");
  const top = [...FOODS].sort((a, b) => b.rating - a.rating).slice(0, 6);   // 6 món đánh giá cao nhất
  $("#promos").innerHTML = top.map(f => foodCard(f, true)).join("");
  buildFilterUI(); updateRails(); reveal();
}

// ---- SỰ KIỆN: gom vào một chỗ bằng event delegation ----
const actions = {
  home: () => { closeAuth(); showTab("food"); window.scrollTo({ top: 0, behavior: "smooth" }); },
  openCart: openDrawer,
  browse: () => { closeModal(); showTab("food"); goto("#moreStores"); },
  location: () => openModal("location"), setLoc: setLoc,
  store: id => { storeId = id; openModal("store"); },
  search: () => { showTab("food"); renderFood(); goto("#foodList"); },
  searchFor: t => { $("#q").value = t; actions.search(); },
  pickCat: c => { showTab("food"); $("#cat").value = c; renderFood(); goto("#foodList"); },
  favOnly: () => { showTab("food"); $("#onlyFav").checked = true; renderFood(); goto("#foodList"); },
  ride: key => { trip.vehicle = key; showTab("ride"); renderRide(); window.scrollTo({ top: 0, behavior: "smooth" }); },
  toPromos: () => { showTab("food"); goto("#promosHead"); },
  toStores: () => { showTab("food"); goto("#moreStores"); },
  tab: id => { showTab(id); window.scrollTo({ top: 0 }); },
  go: url => { location.href = url; },
  toFaq: () => { showTab("food"); goto("#faq"); },
  loadMore: () => { storesShown += 6; renderStores(); },
  slide: id => {
    const r = $("#" + id), end = r.scrollLeft + r.clientWidth >= r.scrollWidth - 4;
    r.scrollTo({ left: end ? 0 : r.scrollLeft + r.clientWidth * 0.8, behavior: "smooth" });
  },
  // đăng nhập
  login: () => { if (!user) openAuth(); else { showTab("account"); window.scrollTo({ top: 0 }); } },
  closeAuth: closeAuth,
  openVerify: () => openVerify(),
  vEmailResend: sendVerifyEmail, vEmailCheck: checkEmailVerified,
  vDone: finishVerify,
  authMode: m => { authMode = m; renderAuth(); },
  authSubmit: submitAuth, resetPw: resetPassword,
  togglePass: () => { const p = $("#aPass"), show = p.type === "password"; p.type = show ? "text" : "password"; $(".showPass").textContent = show ? "Ẩn" : "Hiện"; },
  close: closeModal,
  add: id => addCart(id, ctx === "store" && !$("#modal").hidden ? storeId : 0), fav: id => toggleFav(id),
  inc: id => changeQty(id, 1), dec: id => changeQty(id, -1),
  del: key => { if (direct) return closeModal(); cart = cart.filter(c => lineKey(c) !== String(key)); cartChanged(); },
  clear: () => askConfirm({ icon: "trash", danger: true, title: "Xóa toàn bộ giỏ hàng?", text: "Tất cả món trong giỏ sẽ bị xóa.", yes: "Xóa giỏ hàng", no: "Giữ lại" })
    .then(ok => { if (ok) { cart = []; cartChanged(); } }),
  // đặt xe + Google Maps
  useGps: () => locateMe(false),
  swapRoute: () => {
    if (gm.st !== "ready") return;
    [trip.fromLoc, trip.toLoc] = [trip.toLoc, trip.fromLoc];
    $("#pFrom").value = trip.fromLoc ? trip.fromLoc.address : ""; $("#pTo").value = trip.toLoc ? trip.toLoc.address : "";
    updateMarkers(); computeRoute();
  },
  pickSug: async v => {
    const [w, i] = String(v).split(":"), pred = gm.sug[w] && gm.sug[w][+i];
    if (!pred) return;
    $(w === "from" ? "#acFrom" : "#acTo").hidden = true;
    if (!useGoogle) return setPoint(w, { lat: pred.lat, lng: pred.lng, address: pred.label });
    try {
      const place = pred.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      gm.token = null;   // kết thúc phiên gợi ý
      setPoint(w, { ...ll(place.location), address: pred.text.text });
    } catch (err) { console.warn(err); toast("Không lấy được vị trí địa điểm này."); }
  },
  heroGo: i => { if (i !== hs.i) { showHero(i); restartHero(); } },
  heroPrev: () => moveHero(-1), heroNext: () => moveHero(1),
  toFoods: () => { showTab("food"); goto("#foodList"); },
  toOrders: () => { showTab("orders"); window.scrollTo({ top: 0 }); },
  logout: logout, saveName: saveName, changePw: changePassword,
  reorder: id => {
    const o = orders.find(x => x.id === id), items = o && o.items ? o.items.filter(i => foodById(i.id)) : [];
    if (!items.length) return toast("Các món trong đơn này hiện không còn bán.");
    const go = () => { cart = items.map(i => ({ id: i.id, qty: i.qty, opt: i.o || [], note: i.note || "", k: makeKey(i.id, i.o || [], i.note || "") })); cartStore = o.storeId || 0; cartChanged(); openDrawer(); toast("Đã thêm lại các món vào giỏ"); };
    if (cart.length) askConfirm({ icon: "warn", title: "Thay giỏ hàng hiện tại?", text: "Giỏ đang có món khác. Đặt lại sẽ thay bằng các món của đơn này.", yes: "Thay giỏ hàng", no: "Giữ giỏ cũ" }).then(ok => { if (ok) go(); });
    else go();
  },
  veh: key => { trip.vehicle = key; renderRide(); },
  book: () => {
    if (distanceKm() <= 0) return;
    if (trip.sched && trip.sched < Date.now() + 30000) { toast("Giờ hẹn đã qua, hãy chọn lại giờ đón."); return renderWhen(); }
    openModal("ride");
  },
  applyV: applyVoucher, confirm: confirmOrder,
  cancel: id => askConfirm({ icon: "warn", danger: true, title: "Hủy đơn này?", text: `Đơn ${id} sẽ bị hủy và không thể khôi phục.`, yes: "Hủy đơn", no: "Giữ đơn" })
    .then(ok => { if (ok) updateOrder(id, o => { o.cancelled = true; const w = guardCancel(o); if (w) setTimeout(() => toast(w), 400); }); }),
  resetDemo: () => askConfirm({ icon: "trash", danger: true, title: "Xóa dữ liệu demo?", text: "Giỏ hàng, món yêu thích và lịch sử đơn sẽ bị xóa khỏi trình duyệt này.", yes: "Xóa dữ liệu", no: "Giữ lại" })
    .then(ok => {
      if (!ok) return;
      clearDemoData(); cart = []; favs = []; orders = [];
      cartChanged(); renderHome(); renderFood(); renderOrders(); toast("Đã xóa dữ liệu demo");
    })
};

// ==========================================================================
// [AI] BẢN CẬP NHẬT: menu dọc điện thoại, hiệu ứng, đồng bộ giỏ hàng theo tài khoản,
// đặt xe nâng cao (địa điểm đã lưu, hẹn giờ, tài xế, theo dõi trực tiếp, đánh giá), bộ lọc món.
// ==========================================================================

// Phần "cửa hàng" đã bỏ khỏi trang chủ; giữ hàm rỗng để các nơi còn gọi không báo lỗi (lỗi này từng làm init() dừng giữa chừng).
// Lưới quán kiểu Grab: ảnh lớn + thẻ cam "Giảm …" + tên + ★ điểm + khoảng cách; sắp theo quãng đường từ khu vực đã chọn
const storeTag = s => { const v = VOUCHERS[(s.promos || [])[0]]; return v ? (v.pct ? `Giảm ${v.pct}%` : v.freeship ? "Freeship" : "Ưu đãi") : ""; };
function renderStores() {
  const el = $("#storeGrid"); if (!el) return;
  el.innerHTML = [...STORES].sort((a, b) => storeKm(a) - storeKm(b)).map(s => `<button class="gStore" data-act="store" data-id="${s.id}">
    <span class="gPic">${pic(imgOf("store", s), "gImg", catIcon(s.cats[0]))}${storeTag(s) ? `<i class="gTag">${storeTag(s)}</i>` : ""}</span>
    <span class="gName">${esc(s.name)}</span>
    <span class="gMeta"><b>★ ${s.rating}</b><span>${storeKm(s)} km</span></span></button>`).join("");
}

// ---- Menu dọc (điện thoại) ----
function openNav() {
  const w = $("#navWrap"); w.hidden = false; document.body.classList.add("noScroll");
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add("on")));
}
function closeNav() {
  const w = $("#navWrap"); if (w.hidden) return;
  w.classList.remove("on"); document.body.classList.remove("noScroll");
  setTimeout(() => { if (!w.classList.contains("on")) w.hidden = true; }, 230);
}
function renderNavUser() {
  const n = $("#navUser"); if (!n) return;
  n.innerHTML = user
    ? `${avatarHTML(user)}<div class="nuTxt"><b>${esc(user.name)}</b><small>${esc(user.email || "")}</small></div>`
    : `<div class="nuTxt"><b>Chào bạn!</b><small>Đăng nhập để lưu giỏ hàng và đơn hàng</small></div><button class="btn sm" data-act="login">Đăng nhập</button>`;
  $("#navAccount").hidden = !user; $("#navLogout").hidden = !user;
  $("#navLoc").textContent = loc;
}

// ---- Hiệu ứng: hiện dần khi cuộn + nút thêm giỏ "bay" vào giỏ ----
const reveal = (() => {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = "IntersectionObserver" in window && !calm
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.05 })
    : null;
  return root => {
    if (!io) return;
    (root || document).querySelectorAll(".card:not(.rv),.cat:not(.rv),.qk:not(.rv),.secHead:not(.rv),.ordCard:not(.rv)").forEach((el, i) => {
      el.classList.add("rv"); el.style.setProperty("--d", Math.min(i % 8, 7) * 50 + "ms"); io.observe(el);
    });
  };
})();

function flyToCart() {
  const btn = lastActEl; lastActEl = null;
  const cartEl = document.querySelector(".cartBtn");
  const bump = () => { if (!cartEl) return; cartEl.classList.remove("bump"); void cartEl.offsetWidth; cartEl.classList.add("bump"); };
  if (!btn || btn.dataset.act !== "add" || !cartEl || !cartEl.getClientRects().length || matchMedia("(prefers-reduced-motion: reduce)").matches) return bump();
  const src = btn.closest(".card,.menuRow"), img = src && src.querySelector("img");
  const a = (img || btn).getBoundingClientRect(), b = cartEl.getBoundingClientRect(), S = 56;
  const el = document.createElement("div"); el.className = "fly";
  if (img && img.currentSrc) el.style.backgroundImage = `url("${img.currentSrc}")`;
  const sx = a.left + a.width / 2 - S / 2, sy = a.top + a.height / 2 - S / 2;
  el.style.left = sx + "px"; el.style.top = sy + "px";
  document.body.appendChild(el);
  const dx = b.left + b.width / 2 - S / 2 - sx, dy = b.top + b.height / 2 - S / 2 - sy;
  const run = el.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 70}px) scale(.8)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0.5 }
  ], { duration: 680, easing: "cubic-bezier(.45,.05,.35,1)" });
  run.onfinish = () => { el.remove(); bump(); };
}

// ---- Bộ lọc món: chip danh mục, mức giá, sắp xếp, nút yêu thích ----
const PRICES = [[0, "Mọi giá"], [50000, "Dưới 50K"], [100000, "Dưới 100K"]];
function buildFilterUI() {
  const cats = [...new Set(FOODS.map(f => f.cat))];
  $("#fCats").innerHTML = `<button class="fChip" data-act="setCat" data-id="all">Tất cả</button>`
    + cats.map(c => `<button class="fChip" data-act="setCat" data-id="${esc(c)}"><span aria-hidden="true">${catIcon(c)}</span>${esc(c)}</button>`).join("");
  $("#fPrice").innerHTML = PRICES.map(([v, t]) => `<button data-act="setPrice" data-id="${v}">${t}</button>`).join("");
  syncFilterUI();
}
function syncFilterUI() {
  const cat = $("#cat").value, price = +$("#price").value, fav = $("#onlyFav").checked;
  document.querySelectorAll("#fCats .fChip").forEach(b => b.classList.toggle("on", b.dataset.id === cat));
  document.querySelectorAll("#fPrice button").forEach(b => b.classList.toggle("on", +b.dataset.id === price));
  const f = $("#fFav"); f.classList.toggle("on", fav); f.setAttribute("aria-pressed", fav); $("#favN").textContent = favs.length;
}

// ---- Giỏ hàng đồng bộ theo tài khoản (Firestore: users/{uid}); khách vãng lai dùng LocalStorage ----
const userDoc = () => (useFirebase && DB.fs && auth.currentUser && !auth.currentUser.isAnonymous) ? DB.fs.doc("users/" + auth.currentUser.uid) : null;
function cartPush() {
  const d = userDoc();
  if (!d) return;
  clearTimeout(cartPushT);
  cartPushT = setTimeout(() => {
    cartRemoteTs = Date.now();
    d.set({
      cart: {
        items: cart.map(c => ({ id: c.id, qty: c.qty, opt: c.opt || [], note: c.note || "", k: c.k || `${c.id}|${c.note || ""}` })),
        store: cartStore || 0,
        ts: cartRemoteTs
      }
    }, { merge: true }).catch(() => {});
  }, 400);
}
function placesPush() { const d = userDoc(); if (d) d.set({ places }, { merge: true }).catch(dbWarn); }
function setCartRemote(items, store) {
  cart = items.map(c => ({ id: c.id, qty: c.qty, opt: c.opt || [], note: c.note || "", k: c.k || makeKey(c.id, c.opt || [], c.note || "") })); cartStore = store || 0; cartChanged(true);
}
function setCartOwner(v) { cartOwner = v; save("gonow_cartowner", v); }
function cartWatch(u) {
  if (cartUnsub) { cartUnsub(); cartUnsub = null; }
  if (!u || !DB.fs) return;
  let first = true;
  cartUnsub = DB.fs.doc("users/" + u.uid).onSnapshot(s => {
    const d = s.exists ? s.data() : {}, rc = d.cart;
    const items = rc ? (rc.items || []).filter(c => foodById(c.id) && c.qty > 0) : [];
    if (first) {
      first = false;
      if (cartOwner === "" && cart.length) {            // giỏ của khách → gộp vào giỏ tài khoản
        if (!items.length) cartPush();
        else if ((rc.store || 0) === (cartStore || 0)) {
          const m = items.map(c => ({ ...c }));
          cart.forEach(g => { const x = m.find(c => lineKey(c) === lineKey(g)); if (x) x.qty += g.qty; else m.push({ ...g }); });
          setCartRemote(m, cartStore); cartPush(); toast("Đã gộp giỏ hàng của bạn vào tài khoản");
        } else { setCartRemote(items, rc.store); toast("Đã khôi phục giỏ hàng trong tài khoản của bạn"); }
      } else if (cartOwner === u.uid) {                 // cùng tài khoản: bản trên mây là chuẩn
        if (rc) setCartRemote(items, rc.store); else if (cart.length) cartPush();
      } else {                                          // máy đang giữ giỏ của người khác
        if (rc) setCartRemote(items, rc.store); else setCartRemote([], 0);
      }
      setCartOwner(u.uid);
      if (d.places) { places = d.places; save("gonow_places", places); renderPlaces(); }
      else if (Object.keys(places).length) placesPush();
    } else {
      if (rc && rc.ts !== cartRemoteTs && !s.metadata.hasPendingWrites) setCartRemote(items, rc.store);
      if (d.places && JSON.stringify(d.places) !== JSON.stringify(places)) { places = d.places; save("gonow_places", places); renderPlaces(); }
    }
  }, dbWarn);
}
function guestReset() {                                  // đăng xuất: giỏ & địa điểm đã lưu nằm trên tài khoản, máy trở lại trạng thái khách
  if (!cartOwner) return;
  cart = []; cartStore = 0; places = {}; save("gonow_places", places); setCartOwner("");
  cartChanged(true); renderPlaces();
}

// ---- Mã giảm giá: mỗi tài khoản dùng mỗi mã 1 lần (tính từ các đơn chưa hủy), cộng dồn mã khác loại ----
const vKind = v => (v.freeship ? "freeship" : v.pct ? "pct" : "other");
function usedCodes() {
  const s = new Set();
  orders.forEach(o => {
    if (o.uid !== myUid() || o.cancelled) return;
    (o.codes || (o.code ? String(o.code).split("+") : [])).forEach(c => s.add(c));
  });
  return s;
}

// ---- Địa điểm đã lưu (Nhà / Công ty) ----
const shortLabel = a => { const s = String(a || "").split(",")[0].trim(); return s.length > 24 ? s.slice(0, 23) + "…" : s; };
function renderPlaces() {
  const el = $("#placeChips"); if (!el) return;
  el.innerHTML = [["home", "🏠", "Nhà"], ["work", "🏢", "Công ty"]].map(([k, ic, name]) => places[k]
    ? `<span class="pl saved"><button type="button" data-act="usePlace" data-id="${k}" title="${esc(places[k].address)}">${ic} <b>${name}</b><small>${esc(shortLabel(places[k].address))}</small></button><button type="button" class="plx" data-act="delPlace" data-id="${k}" aria-label="Xóa ${name}">✕</button></span>`
    : `<button type="button" class="pl add" data-act="savePlace" data-id="${k}">${ic} ${name} <b>＋</b></button>`).join("");
}

// ---- Hẹn giờ ----
const p2 = n => String(n).padStart(2, "0");
const toLocalInput = ts => { const d = new Date(ts); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const fmtWhen = ts => { const d = new Date(ts), t = `${p2(d.getHours())}:${p2(d.getMinutes())}`; return d.toDateString() === new Date().toDateString() ? `${t} hôm nay` : `${t} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; };
function renderWhen() {
  const later = !!trip.sched, pick = $("#whenPick"); if (!pick) return;
  document.querySelectorAll("#rideWhen .whenTabs button").forEach(b => b.classList.toggle("on", (b.dataset.act === "whenLater") === later));
  pick.hidden = !later;
  if (later) {
    const inp = $("#whenInput"); inp.min = toLocalInput(Date.now() + 60000); inp.max = toLocalInput(Date.now() + 7 * 86400000);
    if (document.activeElement !== inp) inp.value = toLocalInput(trip.sched);
    $("#whenNote").textContent = `Hẹn đón lúc ${fmtWhen(trip.sched)}. Tài xế sẽ được gán đúng giờ này.`;
  }
}
const roundMin = ts => Math.ceil(ts / 60000) * 60000;

// ---- Mô phỏng chuyến xe: tài xế, vị trí, thời gian đến ----
const hashStr = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
const rad = d => d * Math.PI / 180;
function pickDriver(id, key) {
  const h = hashStr(id), d = DRIVERS[h % DRIVERS.length], models = DRIVER_MODELS[key] || DRIVER_MODELS.bike;
  const num = `${100 + h % 900}.${10 + (h >> 3) % 90}`;
  const plate = key === "bike" ? `59${"XYZ"[h % 3]}${1 + h % 9}-${num}` : `5${1 + h % 9}${"ABCDEFGH"[h % 8]}-${num}`;
  return { id: d.id, name: d.name, rating: d.rating, trips: d.trips, years: d.years, model: models[(h >> 2) % models.length], plate };
}
const simplifyPath = p => {
  if (!p || p.length < 2) return null;
  const out = [], step = (p.length - 1) / Math.min(80, p.length - 1);
  for (let i = 0; i < p.length - 1; i += step) out.push(p[Math.floor(i)]);
  out.push(p[p.length - 1]);
  return out.map(q => ({ lat: +q.lat.toFixed(5), lng: +q.lng.toFixed(5) }));
};
function rideExtra(id) {
  const pt = p => ({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) });
  const map = rideMode === "map" && trip.fromLoc && trip.toLoc;
  return { from: trip.from, to: trip.to, vehicle: VEHICLES[trip.vehicle].name, km: distanceKm(),
    ...(map ? { fromLoc: pt(trip.fromLoc), toLoc: pt(trip.toLoc), path: simplifyPath(trip.path) } : {}),
    sched: trip.sched || 0, driver: pickDriver(id, trip.vehicle) };
}
const cumOf = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + haversineKm(pts[i - 1], pts[i])); return c; };
function along(pts, cum, f) {
  const tot = cum[cum.length - 1];
  if (!tot) return pts[0];
  const d = Math.max(0, Math.min(1, f)) * tot;
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const k = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = pts[i - 1], b = pts[i];
  return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k };
}
const geoCache = {};
const vehKey = o => Object.keys(VEHICLES).find(k => VEHICLES[k].name === o.vehicle) || "bike";
function rideGeo(o) {
  if (geoCache[o.id]) return geoCache[o.id];
  const A = o.fromLoc, B = o.toLoc, route = o.path && o.path.length > 1 ? o.path : [A, B];
  const h = hashStr(o.id), ang = rad(h % 360), dist = 0.8 + (h % 9) / 10;   // tài xế xuất phát cách điểm đón 0,8–1,6 km
  const start = { lat: A.lat + dist / 111 * Math.cos(ang), lng: A.lng + dist / (111 * Math.cos(rad(A.lat))) * Math.sin(ang) };
  const approach = [start, A], v = VEHICLES[vehKey(o)], sp = Math.max(1, RIDE_SIM.speedUp);
  const realApp = haversineKm(start, A) * 1.3 / v.speed * 60, realTrip = (o.km || haversineKm(A, B) * 1.3) / v.speed * 60;
  return (geoCache[o.id] = { A, B, start, route, rtCum: cumOf(route), approach, appCum: cumOf(approach), realApp, realTrip,
    approachSec: Math.min(45, Math.max(12, realApp * 60 / sp)), tripSec: Math.min(150, Math.max(30, realTrip * 60 / sp)) });
}
function rideSim(o, now = Date.now()) {
  const g = rideGeo(o), e = (now - (o.sched || o.ts)) / 1000;
  const b1 = RIDE_SIM.findSec, b2 = b1 + RIDE_SIM.assignSec, b3 = b2 + g.approachSec, b4 = b3 + g.tripSec;
  const st = e < b1 ? 0 : e < b2 ? 1 : e < b3 ? 2 : e < b4 ? 3 : 4;
  const frac = st === 2 ? (e - b2) / g.approachSec : st === 3 ? (e - b3) / g.tripSec : st === 4 ? 1 : 0;
  return { st, frac, e, waiting: e < 0 };
}
function ridePos(o, sim) {
  const g = rideGeo(o), st = Math.max(o.status, sim.waiting ? 0 : sim.st);
  const f = !RIDE_SIM.auto ? 0.5 : o.status > sim.st ? 0 : sim.frac;
  const pos = st <= 1 ? g.start : st === 2 ? along(g.approach, g.appCum, f) : st === 3 ? along(g.route, g.rtCum, f) : g.B;
  return { st, f, pos };
}
function etaText(o, sim) {
  if (o.cancelled) return "Chuyến đã hủy";
  const g = rideGeo(o), mins = x => Math.max(1, Math.ceil(x));
  if (sim.waiting && o.status === 0) {
    const m = Math.ceil(-sim.e / 60);
    return `Hẹn lúc ${fmtWhen(o.sched)} • còn ${m >= 60 ? Math.floor(m / 60) + " giờ " + (m % 60) + " phút" : m + " phút"}`;
  }
  const p = ridePos(o, sim);
  if (p.st === 0) return "Đang tìm tài xế gần bạn…";
  if (p.st === 1) return `Đã có tài xế • đến đón sau ~${mins(g.realApp)} phút`;
  if (p.st === 2) return `Tài xế đến sau ~${mins(g.realApp * (1 - p.f))} phút`;
  if (p.st === 3) return `Còn ~${mins(g.realTrip * (1 - p.f))} phút đến nơi`;
  return "Đã đến nơi. Chúc bạn một ngày tốt lành!";
}
function rideTick() {
  const mine = orders.filter(o => o.type === "ride" && !o.cancelled && o.status < 4 && o.fromLoc && o.toLoc && o.uid === myUid());
  let changed = false;
  if (RIDE_SIM.auto) mine.forEach(o => {
    const sim = rideSim(o);
    if (sim.waiting || sim.st <= o.status) return;
    o.status = sim.st; o.upd = Date.now(); changed = true;
    toast(["", `Tài xế ${o.driver ? o.driver.name : ""} đã nhận chuyến của bạn`, "Tài xế đang trên đường đến đón bạn", "Bạn đã lên xe. Chúc chuyến đi vui vẻ!", "Đã đến nơi! Hãy đánh giá chuyến đi nhé."][sim.st]);
  });
  if (changed) {
    save("gonow_orders", orders); lastOrdersSig = JSON.stringify(load("gonow_orders", []));
    if (!$("#orders").hidden) renderOrders();
  }
  document.querySelectorAll("[data-eta]").forEach(el => {
    const o = orders.find(x => x.id === el.dataset.eta);
    if (o && o.fromLoc) el.textContent = etaText(o, rideSim(o));
  });
}

// ---- Hồ sơ tài xế + đánh giá ----
const starsTxt = n => "★".repeat(n) + "☆".repeat(5 - n);
const avatarOf = (name, photo, cls) => avatarHTML({ name, photo }, cls);
function driverHTML(d) {
  if (!d) return "";
  return `<div class="drvCard">${avatarOf(d.name, `images/driver/${d.id}.jpg`, "drv")}
    <div class="drvTxt"><b>${esc(d.name)}</b><small>★ ${d.rating} • ${Number(d.trips).toLocaleString("vi-VN")} chuyến • ${d.years} năm</small>
      <small>${esc(d.model)} • <span class="plate">${esc(d.plate)}</span></small></div>
    <button class="drvCall" type="button" data-act="callDrv" aria-label="Gọi tài xế">📞</button></div>`;
}
const RATE_TAGS = { good: ["Lái xe an toàn", "Đúng giờ", "Thân thiện", "Xe sạch sẽ", "Đi đúng lộ trình"], bad: ["Đến trễ", "Lái xe ẩu", "Thái độ chưa tốt", "Xe chưa sạch", "Đi sai lộ trình"] };
const tagsFor = s => (s >= 4 ? RATE_TAGS.good : RATE_TAGS.bad);
function rateHTML(o) {
  if (o.rating) return `<div class="rated"><b>Bạn đã đánh giá tài xế</b><span class="stars on">${starsTxt(o.rating.stars)}</span>${o.rating.tags && o.rating.tags.length ? `<small>${o.rating.tags.map(esc).join(" • ")}</small>` : ""}${o.rating.text ? `<small>“${esc(o.rating.text)}”</small>` : ""}</div>`;
  const dr = rateDraft[o.id] || { stars: 0, tags: [], text: "" };
  return `<div class="rate"><b>Chuyến đi thế nào?</b>
    <div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${n <= dr.stars ? "on" : ""}" data-act="rateStar" data-id="${esc(o.id)}:${n}" aria-label="${n} sao">★</button>`).join("")}</div>
    ${dr.stars ? `<div class="rtags">${tagsFor(dr.stars).map((t, i) => `<button type="button" class="${dr.tags.includes(t) ? "on" : ""}" data-act="rateTag" data-id="${esc(o.id)}:${i}">${t}</button>`).join("")}</div>
    <textarea data-rate-text="${esc(o.id)}" maxlength="200" rows="2" placeholder="Nhận xét thêm (không bắt buộc)">${esc(dr.text)}</textarea>
    <button class="btn sm" type="button" data-act="rateSend" data-id="${esc(o.id)}">Gửi đánh giá</button>` : ""}</div>`;
}

// ---- Theo dõi chuyến xe trực tiếp ----
const tk = { id: "", map: null, drv: null, appLine: null, raf: 0, last: 0, st: -1 };
const pinIcon = w => L.divIcon({ className: "osmPin", html: `<div class="pin ${w}">${w === "from" ? "A" : "B"}</div>`, iconSize: [32, 42], iconAnchor: [16, 41] });
function renderTrackInfo(o, st) {
  $("#tkInfo").innerHTML = `${driverHTML(o.driver)}
    <ol class="track tkSteps">${RIDE_STEPS.map((s, i) => `<li class="${i < st ? "done" : i === st ? "now" : ""}"><i>${i < st ? "✓" : i + 1}</i><span>${s}</span></li>`).join("")}</ol>
    <div class="oRoute"><div><i class="rA">A</i><span>${esc(o.from)}</span></div><div><i class="rB">B</i><span>${esc(o.to)}</span></div></div>
    ${st === 4 && o.driver && !o.rating ? `<button class="btn block" type="button" data-act="rateNow">Đánh giá tài xế</button>` : ""}`;
}
async function openTrack(id) {
  const o = orders.find(x => x.id === id);
  if (!o || !o.fromLoc || !o.toLoc) return toast("Chuyến này chưa có dữ liệu bản đồ.");
  tk.id = id; tk.st = -1; $("#trackWrap").hidden = false; document.body.classList.add("noScroll");
  $("#tkEta").textContent = "Đang tải bản đồ…";
  try { await loadLeaflet(); } catch (err) { toast("Không tải được bản đồ, hãy kiểm tra mạng."); return closeTrack(); }
  if (tk.id !== id) return;
  if (tk.map) { tk.map.remove(); tk.map = null; }
  const g = rideGeo(o), rt = g.route.map(p => [p.lat, p.lng]);
  tk.map = L.map("trackMap", { zoomControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(tk.map);
  L.polyline(rt, { color: "#007a3b", weight: 5, opacity: 0.9 }).addTo(tk.map);
  tk.appLine = L.polyline(g.approach.map(p => [p.lat, p.lng]), { color: "#1769d1", weight: 4, opacity: 0.8, dashArray: "6 8" }).addTo(tk.map);
  L.marker([g.A.lat, g.A.lng], { icon: pinIcon("from"), interactive: false }).addTo(tk.map);
  L.marker([g.B.lat, g.B.lng], { icon: pinIcon("to"), interactive: false }).addTo(tk.map);
  const emoji = vehKey(o) === "bike" ? "🛵" : "🚗";
  tk.drv = L.marker([g.start.lat, g.start.lng], { icon: L.divIcon({ className: "drvIcon", html: `<div class="drvDot"><span>${emoji}</span></div>`, iconSize: [44, 44], iconAnchor: [22, 22] }), zIndexOffset: 1000, interactive: false }).addTo(tk.map);
  tk.map.fitBounds(L.latLngBounds([...rt, [g.start.lat, g.start.lng]]), { padding: [50, 50] });
  setTimeout(() => tk.map && tk.map.invalidateSize(), 80);
  osrmRoute(g.start, g.A).then(r => {       // đường đón thật (nếu máy chủ trả lời kịp)
    if (tk.id !== id || !tk.map || r.path.length < 2) return;
    g.approach = r.path; g.appCum = cumOf(r.path); tk.appLine.setLatLngs(r.path.map(p => [p.lat, p.lng]));
  }).catch(() => {});
  cancelAnimationFrame(tk.raf); tk.raf = requestAnimationFrame(trackFrame);
}
function trackFrame() {
  const o = orders.find(x => x.id === tk.id);
  if ($("#trackWrap").hidden || !tk.map) return;
  if (!o || o.cancelled) { toast("Chuyến xe đã bị hủy."); return closeTrack(); }
  const sim = rideSim(o), p = ridePos(o, sim);
  tk.drv.setLatLng([p.pos.lat, p.pos.lng]);
  const now = performance.now();
  if (now - tk.last > 500) {
    tk.last = now; $("#tkEta").textContent = etaText(o, sim);
    if (p.st !== tk.st) { tk.st = p.st; renderTrackInfo(o, p.st); $("#tkSub").textContent = RIDE_STEPS[p.st]; }
    if (p.st >= 2 && p.st < 4 && !tk.map.getBounds().pad(-0.15).contains([p.pos.lat, p.pos.lng])) tk.map.panTo([p.pos.lat, p.pos.lng]);
  }
  tk.raf = requestAnimationFrame(trackFrame);
}
function closeTrack() {
  cancelAnimationFrame(tk.raf); tk.id = "";
  if (tk.map) { tk.map.remove(); tk.map = null; }
  $("#trackWrap").hidden = true; document.body.classList.remove("noScroll");
}

// ---- Hành động mới ----
Object.assign(actions, {
  openNav, closeNav,
  setCat: c => { $("#cat").value = c; renderFood(); },
  setPrice: p => { $("#price").value = String(p); renderFood(); },
  toggleFavOnly: () => { const c = $("#onlyFav"); c.checked = !c.checked; renderFood(); },
  pickV: c => applyVoucher(String(c)),
  rmV: c => { vouchers = vouchers.filter(v => v.code !== c); voucherMsg = { text: "", ok: false }; renderCurrent(); },
  usePlace: k => {
    if (gm.st !== "ready" || !places[k]) return toast("Bản đồ chưa sẵn sàng.");
    setPoint(trip.fromLoc ? "to" : "from", { ...places[k] }); toast(`Đã chọn ${k === "home" ? "Nhà" : "Công ty"}`);
  },
  savePlace: k => {
    const p = trip.toLoc || trip.fromLoc;
    if (!p) return toast("Chọn điểm đến trên bản đồ trước, rồi bấm ＋ để lưu.");
    places[k] = { lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), address: p.address };
    save("gonow_places", places); placesPush(); renderPlaces(); toast(`Đã lưu ${k === "home" ? "Nhà" : "Công ty"}: ${shortLabel(p.address)}`);
  },
  delPlace: k => { delete places[k]; save("gonow_places", places); placesPush(); renderPlaces(); },
  whenNow: () => { trip.sched = 0; renderWhen(); renderRide(); },
  whenLater: () => { if (!trip.sched) trip.sched = roundMin(Date.now() + 30 * 60000); renderWhen(); renderRide(); },
  whenPlus: m => { trip.sched = roundMin(Date.now() + m * 60000); renderWhen(); renderRide(); },
  track: id => openTrack(String(id)), closeTrack,
  callDrv: () => toast("Đây là bản demo, chưa gọi được tài xế thật."),
  rateNow: () => { closeTrack(); showTab("orders"); window.scrollTo({ top: 0 }); },
  rateStar: v => {
    const [id, n] = String(v).split(":"), d = rateDraft[id] || (rateDraft[id] = { stars: 0, tags: [], text: "" });
    if ((+n >= 4) !== (d.stars >= 4)) d.tags = [];
    d.stars = +n; renderOrders();
  },
  rateTag: v => {
    const [id, i] = String(v).split(":"), d = rateDraft[id]; if (!d) return;
    const t = tagsFor(d.stars)[+i]; d.tags = d.tags.includes(t) ? d.tags.filter(x => x !== t) : [...d.tags, t]; renderOrders();
  },
  rateSend: id => {
    const d = rateDraft[id]; if (!d || !d.stars) return toast("Hãy chọn số sao trước nhé.");
    updateOrder(id, o => { o.rating = { stars: d.stars, tags: d.tags, text: d.text.trim().slice(0, 200), ts: Date.now() }; });
    delete rateDraft[id]; toast("Cảm ơn bạn đã đánh giá tài xế!");
  }
});
document.addEventListener("change", e => {
  if (e.target.id !== "whenInput") return;
  const t = new Date(e.target.value).getTime();
  if (!t || t < Date.now() + 30000) { toast("Hãy chọn giờ đón sau hiện tại ít nhất 1 phút."); return renderWhen(); }
  if (t > Date.now() + 7 * 86400000) { toast("Chỉ hẹn được tối đa 7 ngày."); return renderWhen(); }
  trip.sched = t; renderWhen(); renderRide();
});
document.addEventListener("input", e => {
  const k = e.target.dataset && e.target.dataset.rateText;
  if (k) (rateDraft[k] || (rateDraft[k] = { stars: 0, tags: [], text: "" })).text = e.target.value;
});

document.addEventListener("click", e => {
  if (e.target.id === "confirmWrap") return closeConfirm(false);
  if (e.target.id === "navWrap") return closeNav();
  if (e.target.id === "trackWrap") return closeTrack();
  if (e.target.closest("#navDrawer [data-act],#navDrawer [data-tab]")) closeNav();
  if (!e.target.closest(".acBox")) document.querySelectorAll(".acList").forEach(l => { l.hidden = true; });
  // Liên kết chưa có trang đích (footer): không nhảy lên đầu trang
  const dead = e.target.closest('a[href="#"]');
  if (dead) { e.preventDefault(); return toast("Mục này chưa có trong bản demo"); }
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { showTab(tabBtn.dataset.tab); return window.scrollTo({ top: 0 }); }
  if (e.target.id === "modal" || e.target.id === "drawerWrap") return closeModal();
  const btn = e.target.closest("[data-act]");
  if (!btn || !actions[btn.dataset.act]) return;
  const raw = btn.dataset.id;
  lastActEl = btn;
  actions[btn.dataset.act](raw !== undefined && raw !== "" && !isNaN(raw) ? +raw : raw);
});
document.addEventListener("input", e => { if (e.target.closest("#auth")) updateAuthBtn(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (cfmResolve) closeConfirm(false); else if (!$("#trackWrap").hidden) closeTrack(); else if (!$("#navWrap").hidden) closeNav(); else if (!$("#auth").hidden) closeAuth(); else closeModal(); }
  if (e.key === "Tab" && cfmResolve) {   // giữ focus trong hộp xác nhận
    e.preventDefault(); ($("#cfmNo") === document.activeElement ? $("#cfmYes") : $("#cfmNo")).focus();
  }
  if (e.key === "Enter") {
    if (e.target.closest("#auth") && e.target.tagName === "INPUT") submitAuth();
    if (e.target.id === "vcode") applyVoucher();
  }
});

// Dữ liệu đổi từ nơi khác (Firestore, hoặc tab admin cùng máy) → cập nhật tại chỗ, KHÔNG tải lại trang.
// Chỉ vẽ lại khi dữ liệu thật sự khác, gom nhiều thông báo liên tiếp làm một, và không đụng tới ngăn giỏ hàng khi chỉ có đơn hàng đổi.
const dataSig = () => JSON.stringify([ALL_FOODS, VOUCHERS, SHIP_FEE]);
let lastDataSig = dataSig(), lastOrdersSig = JSON.stringify(load("gonow_orders", [])), refreshTimer = 0;
function softRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const ds = dataSig(), os = JSON.stringify(load("gonow_orders", []));
    const dataChanged = ds !== lastDataSig, ordersChanged = os !== lastOrdersSig;
    if (!dataChanged && !ordersChanged) return;
    lastDataSig = ds; lastOrdersSig = os;
    if (ordersChanged) { orders = load("gonow_orders", []); renderOrders(); }
    if (dataChanged) { cart = cart.filter(c => foodById(c.id)); cartChanged(); renderHome(); renderFood(); renderStores(); }
  }, 150);
}
window.addEventListener("gn-order-rejected", e => {
  const { id, code } = e.detail || {}, o = orders.find(x => x.id === id);
  if (DB.last && DB.last.gonow_orders) delete DB.last.gonow_orders[id];
  if (o && Date.now() - (o.ts || 0) < 180000) {
    orders = orders.filter(x => x.id !== id);
    localStorage.setItem("gonow_orders", JSON.stringify(orders));
    renderOrders();
  }
  toast(code === "permission-denied"
    ? "Không có quyền lưu đơn trên máy chủ (kiểm tra luật Firestore hoặc xác minh tài khoản)."
    : "Không gửi được đơn lên máy chủ. Hãy kiểm tra mạng rồi đặt lại.");
});
window.addEventListener("gn-remote", softRefresh);   // Firestore: admin đổi món/giá/mã, hoặc trạng thái đơn
window.addEventListener("storage", e => {            // tab khác (admin cùng máy) ghi LocalStorage
  if (e.key === "gonow_foods") { const l = load("gonow_foods", null); if (l) applyFoods(l); softRefresh(); }
  else if (e.key === "gonow_vouchers") {
    const v = load("gonow_vouchers", null);
    if (v) { Object.keys(VOUCHERS).forEach(k => delete VOUCHERS[k]); Object.assign(VOUCHERS, v); }
    softRefresh();
  } else if (e.key === "gonow_settings") { const st = load("gonow_settings", null); if (st && st.ship >= 0) SHIP_FEE = st.ship; softRefresh(); }
  else if (e.key === "gonow_orders") softRefresh();
  else if (e.key === "gonow_cart") { cart = load("gonow_cart", []).filter(c => foodById(c.id)); cartStore = load("gonow_cartstore", 0); cartChanged(true); }
});

document.addEventListener("input", e => {   // nhớ thông tin nhận hàng khi gõ (không vẽ lại để không mất con trỏ)
  const k = { cPhone: "phone", cAddr: "addr", cNote: "note" }[e.target.id];
  if (k) { contact[k] = e.target.value; if (k === "addr") { contact.loc = null; if (am.mk) { am.mk.remove(); am.mk = null; } addrSay("", ""); clearTimeout(am.t); am.t = setTimeout(addrFind, 900); } save("gonow_contact", contact); }
});

// ---- TRANG CHI TIẾT MÓN ----
function renderDetail() {
  const f = foodById(dt.id); if (!f) return closeModal();
  const s = STORES.find(x => x.id === dt.sid), km = s ? storeKm(s) : 0;
  $("#modalBody").innerHTML = `<div class="dtPic">${pic(imgOf("food", f), "dtImg", catIcon(f.cat))}</div>
    <h2>${esc(f.name)}</h2>
    <p class="dtMeta"><span class="dtStar">★ ${f.rating}</span> • ${esc(f.cat)}</p>
    <p class="dtDesc">${esc(f.desc)}</p>
    ${s ? `<div class="dtStore"><span aria-hidden="true">🏪</span><div><b>${esc(s.name)}</b><small>${esc(s.district)} • ${km} km • khoảng ${storeMin(km)} phút • ★ ${s.rating}</small></div></div>` : ""}
    <div class="dtRow"><b class="dtPrice">${money(f.price)}</b>
      <span class="qty"><button data-act="dtQty" data-id="-1" aria-label="Giảm số lượng">−</button><i id="dtQ">${dt.qty}</i><button data-act="dtQty" data-id="1" aria-label="Tăng số lượng">+</button></span></div>
    <div class="dtActs"><button class="btn dtBuy" data-act="buyNow">Mua ngay • <span id="dtTotal">${money(f.price * dt.qty)}</span></button>
      <button class="cartIco big" data-act="dtAdd" aria-label="Thêm vào giỏ hàng" title="Thêm vào giỏ hàng">${CART_SVG}</button></div>`;
}
Object.assign(actions, {
  saveContact: saveContactInfo,
  detail: id => {
    const f = foodById(id); if (!f) return;
    const fromStore = ctx === "store" && !$("#modal").hidden;
    dt = { id, qty: 1, sid: pickStoreFor(f, fromStore ? storeId : 0) };
    openModal("detail");
  },
  dtQty: n => { dt.qty = Math.max(1, Math.min(GUARD.maxQtyPerItem, dt.qty + n)); $("#dtQ").textContent = dt.qty; $("#dtTotal").textContent = money(foodById(dt.id).price * dt.qty); },
  dtAdd: () => addCart(dt.id, dt.sid, dt.qty, closeModal),
  buyNow: () => {
    const f = foodById(dt.id); if (!f) return;
    direct = { items: [{ id: f.id, qty: dt.qty }], sid: dt.sid };
    resetCheckout("food"); guardOpen();
    $("#modal").hidden = true; $("#drawerWrap").hidden = false; renderDrawer();
  },
  addrGps
});
document.addEventListener("keydown", e => {      // Enter / Space trên ảnh món = mở chi tiết
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[data-act="detail"][role="button"]')) { e.preventDefault(); e.target.click(); }
});
// ---- LUỒNG ĐẶT XE 4 BƯỚC (KIỂU GRAB) ----
// step: "home" | "search" | "pin" | "quote"
const rFlow = { step: "home", tab: "suggest", pinFor: "from", recent: load("gonow_ride_recent", []) };

function saveRecentPlace(pt) {
  if (!pt || !pt.address) return;
  rFlow.recent = [pt, ...rFlow.recent.filter(x => x.address !== pt.address)].slice(0, 8);
  save("gonow_ride_recent", rFlow.recent);
}

function ridePromoCode() {
  return Object.keys(VOUCHERS || {}).find(k => (VOUCHERS[k] || {}).type === "ride") || "";
}

function rideEstimatedFare(v, km) {
  const raw = fareOf(v, km);
  const pCode = ridePromoCode();
  const pv = pCode ? VOUCHERS[pCode] : null;
  if (pv && pv.pct) {
    const disc = Math.round(raw * pv.pct / 100);
    return { raw, final: Math.max(0, raw - disc), code: pCode, pct: pv.pct };
  }
  return { raw, final: raw, code: "", pct: 0 };
}

function syncRideMapSize() {
  if (gm.st !== "ready" || !gm.map) return;
  if (useGoogle && window.google && google.maps) google.maps.event.trigger(gm.map, "resize");
  else if (gm.map.invalidateSize) setTimeout(() => gm.map.invalidateSize(), 60);
}

function setRideStep(step, opts = {}) {
  rFlow.step = step;
  if (opts.tab) rFlow.tab = opts.tab;
  if (opts.pinFor) rFlow.pinFor = opts.pinFor;
  renderRideFlow();
  if (step === "pin" || step === "quote") {
    initRideMap().then(() => {
      syncRideMapSize();
      updateMarkers();
      if (step === "quote" && trip.fromLoc && trip.toLoc && !trip.path && !trip.busy) computeRoute();
    });
  }
}

function popularPlacesList() {
  const base = [
    { name: "Phố Đi Bộ Bùi Viện", address: "Đề Thám, P. Bến Thành, Quận 1, TP.HCM", lat: 10.7676, lng: 106.6957 },
    { name: "Bến Xe Miền Tây", address: "395 Kinh Dương Vương, An Lạc, Bình Tân, TP.HCM", lat: 10.7405, lng: 106.6197 },
    { name: "Bến Xe An Sương", address: "Quốc Lộ 22, Bà Điểm, Hóc Môn, TP.HCM", lat: 10.8435, lng: 106.6119 },
    { name: "Sân Bay Tân Sơn Nhất (T1/T2)", address: "Trường Sơn, Tân Bình, TP.HCM", lat: 10.8185, lng: 106.6588 }
  ];
  const origin = trip.fromLoc || { lat: 10.8548, lng: 106.6266 }; // quanh Lê Văn Khương / Quận 12 mặc định
  return base.map(p => ({
    ...p,
    km: Math.round(haversineKm(origin, p) * 1.3 * 10) / 10
  }));
}

function renderRideFlow() {
  const box = $('rideFlowBox');
  if (!box) return;
  const step = rideFlow.step;
  const isMapStep = step === 'pin' || step === 'quote';
  box.classList.toggle('isMap', isMapStep);
  if (isMapStep && typeof gm !== 'undefined' && gm.map) {
    setTimeout(() => { try { gm.map.invalidateSize(); } catch {} }, 80);
  }
  if (step === 'home') return renderRideHome(box);
  if (step === 'search') return renderRideSearch(box);
  if (step === 'pin') return renderRidePin(box);
  if (step === 'quote') return renderRideQuote(box);
}

/* BƯỚC 1: MÀN HÌNH CHÍNH ĐẶT XE */
function renderRideHome(box) {
  const saved = Array.isArray(rideFlow.saved) ? rideFlow.saved : [];
  const recents = Array.isArray(rideFlow.recents) ? rideFlow.recents : [];
  const list = saved.length ? saved : recents.slice(0, 4);

  box.innerHTML = `
    <div class="gfHomeWrap">
      <div class="gfHomeHero">
        <button class="gfHomeBack" type="button" onclick="nav('home')">←</button>
        <div class="gfHomeBanner">
          <div class="gfHomeTitle">Di chuyển</div>
          <div class="gfHomeSub">Đặt xe nhanh chóng, an toàn và đúng giờ mọi lúc</div>
        </div>
        <div class="gfHomeSearchBar" onclick="openRideSearch()">
          <span class="gfDotDest"></span>
          <span class="gfHomePlaceholder">${rideFlow.dropoff ? escapeHtml(rideFlow.dropoff.name || rideFlow.dropoff.address) : 'Bạn muốn đi đâu?'}</span>
          <button class="gfNowChip" type="button" onclick="event.stopPropagation(); openRideSearch(true)">
            <span>🕒</span> ${rideFlow.when === 'later' && rideFlow.schedTime ? escapeHtml(rideFlow.schedTime) : 'Bây giờ'} ▾
          </button>
        </div>
      </div>

      <div class="gfHomeBody">
        <div class="gfQuickRow">
          <div class="gfQuickCard" onclick="openRideSearch()">
            <div class="gfQuickIco" style="background:#e8f8ef;color:#00a84f">📍</div>
            <div>
              <div class="gfQuickTitle">Chọn điểm đến</div>
              <div class="gfQuickSub">Nhập địa chỉ hoặc ghim bản đồ</div>
            </div>
          </div>
          <div class="gfQuickCard" onclick="openRideSearch(true)">
            <div class="gfQuickIco" style="background:#eef4ff;color:#1d6ce0">📅</div>
            <div>
              <div class="gfQuickTitle">Đặt lịch trước</div>
              <div class="gfQuickSub">Chủ động thời gian đón</div>
            </div>
          </div>
        </div>

        ${list.length ? `
          <div class="gfSecHead">Điểm đến gợi ý & đã lưu</div>
          <div class="gfHomeList">
            ${list.map((p, i) => `
              <div class="gfHomeItem" onclick="pickHomeSuggestion(${i}, ${saved.length ? 'true' : 'false'})">
                <div class="gfPinDark">📍</div>
                <div class="gfSugTxt">
                  <div class="gfSugName">${escapeHtml(p.name || 'Địa điểm')}</div>
                  <div class="gfSugAddr">${escapeHtml(p.address || '')}</div>
                </div>
                <div class="gfSugDist">›</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function openRideSearch(openSchedule) {
  rideFlow.step = 'search';
  rideFlow.focus = 'dropoff';
  if (openSchedule) rideFlow.when = 'later';
  renderRideFlow();
}

function pickHomeSuggestion(idx, isSaved) {
  const arr = isSaved ? rideFlow.saved : rideFlow.recents;
  const p = arr[idx];
  if (!p) return;
  rideFlow.dropoff = { ...p };
  if (!rideFlow.pickup) {
    rideFlow.pickup = {
      name: 'Vị trí hiện tại của bạn',
      address: 'TP. Hồ Chí Minh',
      lat: DEFAULT_CENTER[0],
      lng: DEFAULT_CENTER[1]
    };
  }
  rideFlow.step = 'quote';
  renderRideFlow();
}

function setRideWhen(mode) {
  rideFlow.when = mode;
  if (mode === 'later' && !rideFlow.schedTime) {
    const d = new Date(Date.now() + 30 * 60000);
    rideFlow.schedTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Hôm nay`;
  }
  renderRideSearch($('rideFlowBox'));
}

/* BƯỚC 2: TÌM KIẾM ĐIỂM ĐÓN / ĐIỂM ĐẾN */
function mountRideSearchShell(box) {
  const pkVal = rideFlow.pickup ? (rideFlow.pickup.name || rideFlow.pickup.address || '') : '';
  const dfVal = rideFlow.dropoff ? (rideFlow.dropoff.name || rideFlow.dropoff.address || '') : '';
  const schedPickerHtml = rideFlow.when === 'later' ? `
    <div class="gfSchedBar">
      <span>🕒 Thời gian đón dự kiến:</span>
      <input type="text" class="gfSchedIn" value="${escapeHtml(rideFlow.schedTime || '')}" placeholder="VD: 14:30 Hôm nay" onchange="rideFlow.schedTime=this.value">
    </div>
  ` : '';

  box.innerHTML = `
    <div class="gfSrchTop">
      <div class="gfSrchRow1">
        <button class="gfBack" type="button" onclick="rideBack()">←</button>
        <div class="gfModeSeg">
          <button type="button" class="gfSegBtn ${rideFlow.when === 'now' ? 'active' : ''}" onclick="setRideWhen('now')">Bây giờ</button>
          <button type="button" class="gfSegBtn ${rideFlow.when === 'later' ? 'active' : ''}" onclick="setRideWhen('later')">Đặt trước</button>
        </div>
      </div>
      ${schedPickerHtml}
      <div class="gfInputsWrap">
        <div class="gfLineConn">
          <span class="gfDotOrig"></span>
          <span class="gfVLine"></span>
          <span class="gfDotDest"></span>
        </div>
        <div class="gfInputCol">
          <div class="gfInRow ${rideFlow.focus === 'pickup' ? 'isFocus' : ''}">
            <input id="gfInPickup" class="gfIn" type="text" value="${escapeHtml(pkVal)}" placeholder="Điểm đón của bạn ở đâu?" onfocus="onRideInputFocus('pickup')" oninput="onRideInputType('pickup', this.value)">
            ${pkVal ? `<button type="button" class="gfClrBtn" onclick="clearRideInput('pickup')">✕</button>` : ''}
          </div>
          <div class="gfInDivider"></div>
          <div class="gfInRow ${rideFlow.focus === 'dropoff' ? 'isFocus' : ''}">
            <input id="gfInDropoff" class="gfIn" type="text" value="${escapeHtml(dfVal)}" placeholder="Bạn muốn đến đâu?" onfocus="onRideInputFocus('dropoff')" oninput="onRideInputType('dropoff', this.value)">
            ${dfVal ? `<button type="button" class="gfClrBtn" onclick="clearRideInput('dropoff')">✕</button>` : ''}
          </div>
        </div>
        <button type="button" class="gfSwapBtn" title="Đổi chiều" onclick="swapRidePoints()">⇅</button>
      </div>
      <div class="gfSubTabs">
        <button type="button" class="gfSubTab ${rideFlow.subTab === 'recent' ? 'active' : ''}" onclick="setRideSubTab('recent')">Gần đây</button>
        <button type="button" class="gfSubTab ${rideFlow.subTab === 'suggested' ? 'active' : ''}" onclick="setRideSubTab('suggested')">Đề xuất</button>
        <button type="button" class="gfSubTab ${rideFlow.subTab === 'saved' ? 'active' : ''}" onclick="setRideSubTab('saved')">Đã lưu</button>
      </div>
    </div>
    <div id="gfSugList" class="gfSugList"></div>
    <div class="gfFloatMapWrap">
      <button type="button" class="gfFloatMapBtn" onclick="openRidePinOnMap()">🗺️ Chọn trên bản đồ</button>
    </div>
  `;
}

function clearRideInput(which) {
  rideFlow[which] = null;
  rideFlow.focus = which;
  rideFlow.query = '';
  renderRideSearch($('rideFlowBox'));
}

function swapRidePoints() {
  const tmp = rideFlow.pickup;
  rideFlow.pickup = rideFlow.dropoff;
  rideFlow.dropoff = tmp;
  renderRideSearch($('rideFlowBox'));
}

function openRidePinOnMap() {
  rideFlow.pinTarget = rideFlow.focus || 'dropoff';
  const base = rideFlow[rideFlow.pinTarget] || rideFlow.pickup || { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], name: 'Vị trí đã ghim', address: 'TP. Hồ Chí Minh' };
  rideFlow.pinPoint = { ...base };
  rideFlow.step = 'pin';
  renderRideFlow();
}

/* BƯỚC 3: GHIM VỊ TRÍ TRÊN BẢN ĐỒ */
function renderRidePin(box) {
  const isPickup = rideFlow.pinTarget === 'pickup';
  const pt = rideFlow.pinPoint || { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], name: 'Vị trí trên bản đồ', address: 'Kéo bản đồ hoặc chạm để chọn điểm' };

  box.innerHTML = `
    <div class="gfPinTopBar">
      <button type="button" class="gfBackCircle" onclick="rideBack()">←</button>
      <div class="gfPinBadge">${isPickup ? 'Chọn điểm đón' : 'Chọn điểm đến'}</div>
    </div>

    <div class="gfMapViewport" id="gfPinMapHost"></div>

    <div class="gfPinSheet">
      <div class="gfSheetHandle"></div>
      <div class="gfPinTitle">${isPickup ? 'Xác nhận điểm đón' : 'Xác nhận điểm đến'}</div>
      <div class="gfPinCard">
        <div class="${isPickup ? 'gfDotOrig' : 'gfDotDest'}"></div>
        <div class="gfSugTxt">
          <div class="gfSugName">${escapeHtml(pt.name || 'Vị trí đã chọn')}</div>
          <div class="gfSugAddr">${escapeHtml(pt.address || `${Number(pt.lat).toFixed(5)}, ${Number(pt.lng).toFixed(5)}`)}</div>
        </div>
      </div>
      <button type="button" class="gfPrimaryBtn" onclick="confirmRidePin()">
        ${isPickup ? 'Xác nhận điểm đón' : 'Xác nhận điểm đến'}
      </button>
    </div>
  `;

  mountSharedLeafletMap('gfPinMapHost', pt, (lat, lng) => {
    rideFlow.pinPoint = {
      name: 'Vị trí đã ghim trên bản đồ',
      address: `Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng
    };
    const nameEl = box.querySelector('.gfPinCard .gfSugName');
    const addrEl = box.querySelector('.gfPinCard .gfSugAddr');
    if (nameEl) nameEl.textContent = rideFlow.pinPoint.name;
    if (addrEl) addrEl.textContent = rideFlow.pinPoint.address;
  });
}

function confirmRidePin() {
  const target = rideFlow.pinTarget || 'dropoff';
  if (rideFlow.pinPoint) {
    rideFlow[target] = { ...rideFlow.pinPoint };
  }
  if (!rideFlow.pickup) {
    rideFlow.pickup = {
      name: 'Vị trí hiện tại của bạn',
      address: 'TP. Hồ Chí Minh',
      lat: DEFAULT_CENTER[0],
      lng: DEFAULT_CENTER[1]
    };
  }
  if (!rideFlow.dropoff) {
    rideFlow.step = 'search';
    rideFlow.focus = 'dropoff';
  } else {
    rideFlow.step = 'quote';
  }
  renderRideFlow();
}

/* BƯỚC 4: CHỌN LOẠI XE & ĐẶT CHUYẾN */
function renderRideQuote(box) {
  if (!rideFlow.pickup) {
    rideFlow.pickup = { name: 'Điểm đón hiện tại', address: 'TP. Hồ Chí Minh', lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
  }
  if (!rideFlow.dropoff) {
    rideFlow.step = 'search';
    return renderRideFlow();
  }

  const distKm = calcRideDistKm(rideFlow.pickup, rideFlow.dropoff);
  const services = (typeof SVC !== 'undefined' && Array.isArray(SVC) && SVC.length) ? SVC : [
    { id: 'bike', name: 'Xe máy', desc: 'Nhanh gọn, linh hoạt', base: 12000, perKm: 4300, eta: '3 phút' },
    { id: 'car4', name: 'Ô tô 4 chỗ', desc: 'Thoải mái, máy lạnh', base: 25000, perKm: 9500, eta: '5 phút' },
    { id: 'car7', name: 'Ô tô 7 chỗ', desc: 'Rộng rãi cho nhóm & hành lý', base: 32000, perKm: 11500, eta: '6 phút' }
  ];
  if (!rideFlow.svcId) rideFlow.svcId = services[0].id;

  const selectedSvc = services.find(s => s.id === rideFlow.svcId) || services[0];
  const calcFare = (s) => Math.round(((s.base || 15000) + distKm * (s.perKm || 5000)) / 1000) * 1000;

  box.innerHTML = `
    <div class="gfPinTopBar">
      <button type="button" class="gfBackCircle" onclick="rideBack()">←</button>
      <div class="gfRoutePill" onclick="rideFlow.step='search'; renderRideFlow()">
        <span class="gfDotOrig"></span>
        <span class="gfRouteTxt">${escapeHtml(rideFlow.pickup.name || 'Điểm đón')}</span>
        <span>→</span>
        <span class="gfDotDest"></span>
        <span class="gfRouteTxt">${escapeHtml(rideFlow.dropoff.name || 'Điểm đến')}</span>
      </div>
    </div>

    <div class="gfMapViewport gfMapQuote" id="gfQuoteMapHost"></div>

    <div class="gfQuoteSheet">
      <div class="gfSheetHandle"></div>
      <div class="gfQuoteMeta">
        <span>Quãng đường ước tính: <b>${distKm.toFixed(1)} km</b></span>
        <span>${rideFlow.when === 'later' && rideFlow.schedTime ? '🕒 ' + escapeHtml(rideFlow.schedTime) : '⚡ Đón ngay'}</span>
      </div>

      <div class="gfSvcList">
        ${services.map(s => {
          const fare = calcFare(s);
          const active = s.id === selectedSvc.id;
          return `
            <div class="gfSvcRow ${active ? 'active' : ''}" onclick="rideFlow.svcId='${s.id}'; renderRideFlow()">
              <div class="gfSvcIco">${s.id.includes('bike') ? '🛵' : (s.id.includes('7') ? '🚐' : '🚗')}</div>
              <div class="gfSvcInfo">
                <div class="gfSvcName">${escapeHtml(s.name)} <span class="gfSvcEta">• ${escapeHtml(s.eta || '4 phút')}</span></div>
                <div class="gfSvcDesc">${escapeHtml(s.desc || 'Tài xế gần bạn')}</div>
              </div>
              <div class="gfSvcPrice">${fare.toLocaleString('vi-VN')}đ</div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="gfPayRow">
        <select class="gfPaySel" onchange="rideFlow.pay=this.value">
          <option value="cash" ${rideFlow.pay === 'cash' ? 'selected' : ''}>💵 Tiền mặt</option>
          <option value="wallet" ${rideFlow.pay === 'wallet' ? 'selected' : ''}>💳 Ví điện tử</option>
          <option value="card" ${rideFlow.pay === 'card' ? 'selected' : ''}>🏦 Thẻ ngân hàng</option>
        </select>
        <input class="gfPromoIn" type="text" value="${escapeHtml(rideFlow.promo || '')}" placeholder="Mã ưu đãi..." onchange="rideFlow.promo=this.value">
      </div>

      <button type="button" class="gfPrimaryBtn" onclick="submitRideBooking(${calcFare(selectedSvc)}, '${escapeHtml(selectedSvc.name)}')">
        Đặt ${escapeHtml(selectedSvc.name)} • ${calcFare(selectedSvc).toLocaleString('vi-VN')}đ
      </button>
    </div>
  `;

  mountSharedLeafletMap('gfQuoteMapHost', rideFlow.dropoff, null, rideFlow.pickup);
}

function calcRideDistKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 3.2;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const d = 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return Math.max(0.8, d * 1.25);
}

function mountSharedLeafletMap(hostId, focusPt, onPickCb, originPt) {
  const host = $(hostId);
  if (!host || typeof L === 'undefined') return;
  const lat = Number(focusPt?.lat) || DEFAULT_CENTER[0];
  const lng = Number(focusPt?.lng) || DEFAULT_CENTER[1];

  host.innerHTML = '';
  const mapEl = document.createElement('div');
  mapEl.style.cssText = 'width:100%;height:100%;';
  host.appendChild(mapEl);

  const m = L.map(mapEl, { zoomControl: false }).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(m);

  const destMarker = L.marker([lat, lng]).addTo(m);
  if (originPt && originPt.lat != null) {
    const oLat = Number(originPt.lat), oLng = Number(originPt.lng);
    L.circleMarker([oLat, oLng], { radius: 7, color: '#00a84f', fillColor: '#00b14f', fillOpacity: 1 }).addTo(m);
    L.polyline([[oLat, oLng], [lat, lng]], { color: '#00b14f', weight: 4, dashArray: '6, 6' }).addTo(m);
    m.fitBounds([[oLat, oLng], [lat, lng]], { padding: [45, 45] });
  }

  if (typeof onPickCb === 'function') {
    m.on('click', (e) => {
      destMarker.setLatLng(e.latlng);
      onPickCb(e.latlng.lat, e.latlng.lng);
    });
  }
  setTimeout(() => { try { m.invalidateSize(); } catch {} }, 100);
}

function submitRideBooking(totalFare, svcName) {
  if (typeof saveRideRecent === 'function' && rideFlow.dropoff) {
    saveRideRecent(rideFlow.dropoff);
  }
  if (typeof toast === 'function') {
    toast(`Đã đặt ${svcName} (${totalFare.toLocaleString('vi-VN')}đ). Đang tìm tài xế gần bạn...`);
  } else {
    alert(`Đã đặt ${svcName} (${totalFare.toLocaleString('vi-VN')}đ). Đang tìm tài xế!`);
  }
  rideFlow.step = 'home';
  renderRideFlow();
}
function mountRideSearchShell() {
  const box = $("#rideFlow");
  if (!box || rFlow.step !== "search") return;
  box.innerHTML = `
    <div class="gfSrchTop">
      <div class="gfSrchRow1">
        <button type="button" class="gfBack" data-act="rStep" data-id="home">←</button>
        <div class="gfModeSeg">
          <button type="button" class="${!trip.sched ? "on" : ""}" data-act="whenNow">⚡ Đặt ngay</button>
          <button type="button" class="${trip.sched ? "on" : ""}" data-act="whenLater">📅 Đặt trước</button>
        </div>
      </div>
      <div class="gfInputsWrap">
        <div class="gfLineConn"><i></i><b></b><i></i></div>
        <div class="gfInputCol">
          <input class="gfIn" id="gfFromIn" value="${esc((trip.fromLoc && trip.fromLoc.address) || trip.from || "")}" placeholder="Nhập điểm đón">
          <input class="gfIn ${rFlow.pinFor === "to" ? "focus" : ""}" id="gfToIn" value="${esc((trip.toLoc && trip.toLoc.address) || trip.to || "")}" placeholder="Bạn muốn đến đâu?">
        </div>
      </div>
      <div class="gfSubTabs">
        <button type="button" class="${rFlow.tab === "recent" ? "on" : ""}" data-act="rTab" data-id="recent">Dùng gần đây</button>
        <button type="button" class="${rFlow.tab === "suggest" ? "on" : ""}" data-act="rTab" data-id="suggest">Đề xuất</button>
        <button type="button" class="${rFlow.tab === "saved" ? "on" : ""}" data-act="rTab" data-id="saved">Đã lưu</button>
      </div>
    </div>
    <ul class="gfSugList" id="gfSugList"></ul>
    <button type="button" class="gfFloatMapBtn" data-act="rStep" data-id="pin:${rFlow.pinFor}">🗺 Chọn trên bản đồ</button>`;
  fillRideSugList();
}

function fillRideSugList(customItems = null) {
  const ul = $("#gfSugList");
  if (!ul) return;
  let items = customItems;
  if (!items) {
    if (rFlow.tab === "recent") items = rFlow.recent;
    else if (rFlow.tab === "saved") items = Object.values(places || {});
    else items = popularPlacesList();
  }
  rFlow._curList = items;
  ul.innerHTML = items.length ? items.map((it, idx) => {
    const title = it.name || (it.mainText && it.mainText.text) || (it.text && it.text.text) || it.address || "";
    const sub = it.address || (it.secondaryText && it.secondaryText.text) || "";
    const dist = it.km != null ? `${it.km} km • ` : "";
    return `<li><button type="button" class="gfSugRow" data-act="rPickItem" data-id="${idx}">
      <span class="gfPinDark">📍</span>
      <span><b>${esc(title)}</b><small>${dist}${esc(sub)}</small></span>
    </button></li>`;
  }).join("") : `<li class="gfEmptySug">Chưa có địa điểm nào. Nhập địa chỉ phía trên hoặc chạm bản đồ.</li>`;
}

Object.assign(actions, {
  rStep: v => {
    const [st, arg] = String(v).split(":");
    if (st === "search" && arg === "later") {
      if (!trip.sched) trip.sched = roundMin(Date.now() + 30 * 60000);
    }
    setRideStep(st, { pinFor: arg === "from" || arg === "to" ? arg : rFlow.pinFor });
    if (st === "search") {
      mountRideSearchShell();
      setTimeout(() => $(arg === "from" ? "#gfFromIn" : "#gfToIn")?.focus(), 40);
    }
  },
  rTab: t => { rFlow.tab = t; mountRideSearchShell(); },
  rPickVeh: k => {
    trip.vehicle = k;
    renderRide();
    if (trip.fromLoc && trip.toLoc) setRideStep("quote");
    else renderRideFlow();
  },
  rQuickTo: idx => {
    const p = popularPlacesList()[+idx];
    if (!p) return;
    if (!trip.fromLoc) {
      trip.fromLoc = { lat: 10.8548, lng: 106.6266, address: loc + ", TP.HCM" };
    }
    trip.toLoc = { lat: p.lat, lng: p.lng, address: p.address };
    saveRecentPlace(trip.toLoc);
    setRideStep("quote");
    computeRoute();
  },
  rPickNear: idx => {
    const p = popularPlacesList()[+idx];
    if (!p) return;
    const pt = { lat: p.lat, lng: p.lng, address: p.address };
    trip[rFlow.pinFor + "Loc"] = pt;
    saveRecentPlace(pt);
    updateMarkers();
    focusMap(pt);
    renderRideFlow();
  },
  rConfirmPin: () => {
    const pt = trip[rFlow.pinFor + "Loc"] || { lat: 10.7769, lng: 106.7009, address: loc + ", TP.HCM" };
    trip[rFlow.pinFor + "Loc"] = pt;
    saveRecentPlace(pt);
    if (rFlow.pinFor === "from" && !trip.toLoc) {
      rFlow.pinFor = "to";
      setRideStep("search");
      mountRideSearchShell();
      setTimeout(() => $("#gfToIn")?.focus(), 40);
      return;
    }
    if (trip.fromLoc && trip.toLoc) {
      setRideStep("quote");
      computeRoute();
    } else {
      setRideStep("home");
    }
  },
  rPickItem: async idx => {
    const it = (rFlow._curList || [])[+idx];
    if (!it) return;
    const which = rFlow.pinFor || "to";
    let pt = null;
    if (it.lat != null && it.lng != null) {
      pt = { lat: +it.lat, lng: +it.lng, address: it.address || it.name || "" };
    } else if (useGoogle && typeof it.toPlace === "function") {
      const place = it.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      gm.token = null;
      pt = { ...ll(place.location), address: (it.text && it.text.text) || place.formattedAddress || "" };
    }
    if (!pt) return;
    trip[which + "Loc"] = pt;
    saveRecentPlace(pt);
    if (trip.fromLoc && trip.toLoc) {
      setRideStep("quote");
      computeRoute();
    } else {
      rFlow.pinFor = which === "from" ? "to" : "from";
      mountRideSearchShell();
      setTimeout(() => $(rFlow.pinFor === "to" ? "#gfToIn" : "#gfFromIn")?.focus(), 40);
    }
  }
});

// Lắng nghe gõ tìm kiếm trong màn hình search
let _gfSearchTimer = 0;
document.addEventListener("input", e => {
  if (e.target.id !== "gfFromIn" && e.target.id !== "gfToIn") return;
  const which = e.target.id === "gfFromIn" ? "from" : "to";
  rFlow.pinFor = which;
  trip[which + "Loc"] = null;
  const q = e.target.value.trim();
  clearTimeout(_gfSearchTimer);
  _gfSearchTimer = setTimeout(async () => {
    if (q.length < 2) return fillRideSugList();
    try {
      if (useGoogle && gm.st === "ready") {
        const P = gm.lib.places;
        gm.token = gm.token || new P.AutocompleteSessionToken();
        const { suggestions } = await P.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q, sessionToken: gm.token, includedRegionCodes: ["vn"], locationBias: VN_BOUNDS
        });
        fillRideSugList(suggestions.map(s => s.placePrediction).filter(Boolean));
      } else if (gm.st === "ready") {
        const res = await osmSearch(q);
        fillRideSugList(res.map(r => ({ name: r.main || r.label, address: r.sub || r.label, lat: r.lat, lng: r.lng })));
      }
    } catch (_) {}
  }, useGoogle ? 250 : 500);
});

// Tự động vẽ lại giao diện 4 bước khi showTab("ride") hoặc renderRide() chạy
const _origShowTab = showTab;
showTab = function (tab) {
  _origShowTab(tab);
  if (tab === "ride") {
    if (rFlow.step === "search") mountRideSearchShell();
    else renderRideFlow();
  }
};
const _origRenderRide = renderRide;
renderRide = function () {
  _origRenderRide();
  if (rFlow.step !== "search") renderRideFlow();
};
// ---- KHỞI TẠO ----
function init() {
  setTimeout(() => { if (document.activeElement !== $("#q")) $("#q").value = ""; }, 400);   // trình duyệt hay tự điền tên đăng nhập vào ô tìm kiếm
  $("#cat").insertAdjacentHTML("beforeend", [...new Set(FOODS.map(f => f.cat))].map(c => `<option>${c}</option>`).join(""));
  const opts = '<option value="">-- Chọn quận --</option>' + Object.keys(DISTRICTS).map(d => `<option>${d}</option>`).join("");
  $("#from").innerHTML = opts; $("#to").innerHTML = opts; $("#from").value = loc;
  ["q", "cat", "price", "sort", "onlyFav"].forEach(id => $("#" + id).addEventListener("input", renderFood));
  ["from", "to"].forEach(id => $("#" + id).addEventListener("change", renderRide));
  $("#orderFilter").addEventListener("change", renderOrders); $("#orderStatus").addEventListener("change", renderOrders);
  $("#q").addEventListener("keydown", e => { if (e.key === "Enter") actions.search(); });
  $("#lang").addEventListener("change", e => { e.target.value = "vi"; toast("Bản demo hiện chỉ có tiếng Việt"); });
  window.addEventListener("resize", updateRails);
  $("#cfmYes").addEventListener("click", () => closeConfirm(true));
  $("#cfmNo").addEventListener("click", () => closeConfirm(false));
  bindRideInputs(); setRideMode(rideMode);
  if (useFirebase) auth.onAuthStateChanged(u => {   // khách chưa đăng nhập dùng tài khoản ẩn danh để đơn vẫn gắn với một uid
    if (!u) { setUser(null); cartWatch(null); guestReset(); auth.signInAnonymously().catch(() => {}); return; }
    if (u.isAnonymous && u.uid !== cid && orders.some(o => o.uid === cid)) {   // [FIX] đơn đặt lúc chưa đăng nhập ẩn danh mang uid thiết bị → chuyển sang uid Firebase để khớp bộ lọc & luật Firestore
      orders.forEach(o => { if (o.uid === cid) o.uid = u.uid; }); save("gonow_orders", orders);
    }
    setUser(u.isAnonymous ? null : u); dbWatchOrders(u.uid); renderOrders();
    if (!u.isAnonymous) guardOnLogin(u);
    cartWatch(u.isAnonymous ? null : u); if (u.isAnonymous) guestReset();
  });   // tự giữ trạng thái đăng nhập khi tải lại trang
  initRailDrag(); renderHero(); renderHome(); renderFood(); renderStores(); renderRide(); renderLoc(); cartChanged(true); renderUser(); showTab("food");
  renderPlaces(); renderWhen(); renderNavUser(); reveal(); rideTick(); setInterval(rideTick, 1000);
}
init();
/* ================== BẢN VÁ HOÀN CHỈNH: ĐẶT XE + CAROUSEL + SEARCH + CHI TIẾT ================== */
(function initAllFixes() {
  const _$ = (id) => document.getElementById(id);
  const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

  /* --------------------------------------------------------------------------
     1. CHỐNG GIẬT / NHẢY TRANG KHI GÕ VÀO Ô TÌM KIẾM CHÍNH
     -------------------------------------------------------------------------- */
  const origScrollTo = window.scrollTo.bind(window);
  let isTypingInSearch = false;

  document.addEventListener('focusin', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      isTypingInSearch = true;
    }
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => { isTypingInSearch = false; }, 150);
  });

  // Chặn mọi lệnh tự cuộn trang lên đầu khi người dùng đang gõ chữ trong ô tìm kiếm
  window.scrollTo = function (...args) {
    if (isTypingInSearch) return;
    return origScrollTo(...args);
  };

  // Giữ ổn định chiều cao vùng danh sách món ăn để không bị co giật thanh cuộn khi lọc
  document.addEventListener('input', (e) => {
    const inp = e.target;
    if (!inp || inp.tagName !== 'INPUT' || inp.closest('#rideFlowBox')) return;
    const foodSec = _$('food');
    if (foodSec && !foodSec.hidden) {
      const curH = foodSec.offsetHeight;
      if (curH > 300 && !foodSec.style.minHeight) {
        foodSec.style.minHeight = curH + 'px';
      }
    }
  }, true);

  /* --------------------------------------------------------------------------
     2. SỬA TRIỆT ĐỂ CAROUSEL (XÓA BÓNG MỜ / HÌNH CHỮ NHẬT DÍNH KHI CHUYỂN SLIDE)
     -------------------------------------------------------------------------- */
  function fixSmoothCarousel() {
    // Dọn dẹp các timer cũ có thể gây xung đột nếu chưa lưu
    const tracks = document.querySelectorAll('.carouselTrack, .bannerTrack, .heroTrack, [data-carousel-track]');
    tracks.forEach((track) => {
      if (track.dataset.v2Fixed === '1') return;
      track.dataset.v2Fixed = '1';

      // Xóa sạch clone cũ nếu có
      track.querySelectorAll('.is-clone').forEach(c => c.remove());

      const wrapper = track.parentElement;
      if (!wrapper) return;

      // Ép kiểu CSS chuẩn để không bao giờ lộ mép ảnh kế bên
      wrapper.style.overflow = 'hidden';
      wrapper.style.position = 'relative';
      track.style.display = 'flex';
      track.style.gap = '0px';
      track.style.padding = '0px';
      track.style.margin = '0px';
      track.style.width = '100%';

      const origSlides = Array.from(track.children);
      if (origSlides.length <= 1) return;

      origSlides.forEach(s => {
        s.style.flex = '0 0 100%';
        s.style.width = '100%';
        s.style.maxWidth = '100%';
        s.style.margin = '0';
        s.style.boxSizing = 'border-box';
      });

      const firstClone = origSlides[0].cloneNode(true);
      const lastClone = origSlides[origSlides.length - 1].cloneNode(true);
      firstClone.classList.add('is-clone');
      lastClone.classList.add('is-clone');
      track.appendChild(firstClone);
      track.insertBefore(lastClone, origSlides[0]);

      let idx = 1;
      let locked = false;
      let timer = null;

      const applyTransform = (withAnim) => {
        track.style.transition = withAnim ? 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
        track.style.transform = `translate3d(-${idx * 100}%, 0, 0)`;
      };

      applyTransform(false);

      const next = () => {
        if (locked) return;
        locked = true;
        idx++;
        applyTransform(true);
      };

      const prev = () => {
        if (locked) return;
        locked = true;
        idx--;
        applyTransform(true);
      };

      track.addEventListener('transitionend', (e) => {
        if (e.target !== track) return;
        locked = false;
        if (idx >= origSlides.length + 1) {
          idx = 1;
          applyTransform(false);
        } else if (idx <= 0) {
          idx = origSlides.length;
          applyTransform(false);
        }
      });

      const play = () => { stop(); timer = setInterval(next, 4000); };
      const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

      wrapper.addEventListener('mouseenter', stop);
      wrapper.addEventListener('mouseleave', play);

      const prevBtn = wrapper.querySelector('.prev, .carouselPrev, [data-dir="prev"]');
      const nextBtn = wrapper.querySelector('.next, .carouselNext, [data-dir="next"]');
      if (prevBtn) prevBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); stop(); prev(); play(); };
      if (nextBtn) nextBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); stop(); next(); play(); };

      play();
    });
  }

  /* --------------------------------------------------------------------------
     3. ĐẶT XE CHUẨN GRAB: GPS VỊ TRÍ HIỆN TẠI + POP-UP THÔNG BÁO ĐẸP
     -------------------------------------------------------------------------- */
  window.rideFlow = window.rideFlow || {};
  const rf = window.rideFlow;
  rf.step = rf.step || 'home';
  rf.when = rf.when || 'now';
  rf.focus = rf.focus || 'dropoff';
  rf.subTab = rf.subTab || 'recent';
  rf.pay = rf.pay || 'cash';
  rf.query = rf.query || '';
  rf.gpsLoading = false;

  rf.saved = Array.isArray(rf.saved) ? rf.saved : [
    { name: 'Nhà riêng', address: '124 Nguyễn Thị Thập, Quận 7, TP.HCM', lat: 10.7385, lng: 106.7124 },
    { name: 'Công ty / Trường học', address: '227 Nguyễn Văn Cừ, Quận 5, TP.HCM', lat: 10.7629, lng: 106.6822 }
  ];
  rf.recents = Array.isArray(rf.recents) ? rf.recents : [
    { name: 'Crescent Mall', address: '101 Tôn Dật Tiên, Tân Phú, Quận 7', lat: 10.7289, lng: 106.7191 },
    { name: 'Chợ Bến Thành', address: 'Lê Lợi, Phường Bến Thành, Quận 1', lat: 10.7725, lng: 106.6980 },
    { name: 'Sân bay Tân Sơn Nhất', address: 'Trường Sơn, Phường 2, Tân Bình', lat: 10.8185, lng: 106.6588 },
    { name: 'Landmark 81', address: '720A Điện Biên Phủ, Bình Thạnh', lat: 10.7950, lng: 106.7218 }
  ];

  const CENTER = (typeof DEFAULT_CENTER !== 'undefined' && Array.isArray(DEFAULT_CENTER)) ? DEFAULT_CENTER : [10.7769, 106.7009];

  window.renderRideFlow = function () {
    const rideSec = _$('ride');
    if (rideSec) rideSec.hidden = false;
    const box = _$('rideFlowBox');
    if (!box) return;

    const step = rf.step || 'home';
    box.classList.toggle('isMap', step === 'pin' || step === 'quote');

    if (step === 'home') return _renderHome(box);
    if (step === 'search') return _renderSearch(box);
    if (step === 'pin') return _renderPin(box);
    if (step === 'quote') return _renderQuote(box);
  };

  /* BƯỚC 1: MÀN HÌNH CHÍNH DI CHUYỂN CHUẨN GRAB */
  function _renderHome(box) {
    const list = rf.saved.concat(rf.recents).slice(0, 5);
    const curPkName = rf.pickup ? rf.pickup.name : 'Chưa xác định vị trí đón';

    box.innerHTML = `
      <div class="grbWrap">
        <div class="grbHero">
          <div class="grbHeroTop">
            <button class="grbIconBtn" type="button" onclick="goFoodTab()" title="Quay lại">←</button>
            <div class="grbGpsPill" onclick="rfRequestCurrentGPS(true)">
              <span class="grbPulseDot"></span>
              <span class="grbGpsText">${rf.gpsLoading ? 'Đang định vị GPS...' : _esc(curPkName)}</span>
              <span class="grbGpsAction">Định vị</span>
            </div>
          </div>

          <div class="grbHeroText">
            <h1 class="grbHeroTitle">Di chuyển cùng GoNow</h1>
            <p class="grbHeroSub">Đón tận nơi • Giá cước minh bạch • Tài xế 5 sao</p>
          </div>

          <!-- Thanh tìm kiếm nổi chuẩn Grab -->
          <div class="grbSearchCard">
            <div class="grbSearchMain" onclick="rfOpenSearch(false)">
              <span class="grbPinRed"></span>
              <span class="grbSearchPlaceholder">${rf.dropoff ? _esc(rf.dropoff.name) : 'Bạn muốn đến đâu hôm nay?'}</span>
              <button class="grbTimeChip" type="button" onclick="event.stopPropagation(); rfOpenSearch(true)">
                🕒 ${rf.when === 'later' && rf.schedTime ? _esc(rf.schedTime) : 'Bây giờ'} ▾
              </button>
            </div>
            <div class="grbSavedChips">
              ${rf.saved.map((s, idx) => `
                <button type="button" class="grbChipItem" onclick="rfPickQuick(${idx})">
                  <span>${idx === 0 ? '🏠' : '💼'}</span> ${_esc(s.name)}
                </button>
              `).join('')}
              <button type="button" class="grbChipItem grbChipGps" onclick="rfRequestCurrentGPS(true)">
                <span>🎯</span> Vị trí của tôi
              </button>
            </div>
          </div>
        </div>

        <div class="grbBody">
          <!-- Thẻ dịch vụ nổi bật -->
          <div class="grbServiceGrid">
            <div class="grbSvcCard" onclick="rfOpenSearch(false)">
              <div class="grbSvcIconBox" style="background:#e8f8ef;color:#00b14f;">🛵</div>
              <div class="grbSvcMeta">
                <div class="grbSvcCardTitle">GoBike</div>
                <div class="grbSvcCardSub">Nhanh & Tiết kiệm</div>
              </div>
            </div>
            <div class="grbSvcCard" onclick="rfOpenSearch(false)">
              <div class="grbSvcIconBox" style="background:#eef4ff;color:#2563eb;">🚗</div>
              <div class="grbSvcMeta">
                <div class="grbSvcCardTitle">GoCar 4-7 chỗ</div>
                <div class="grbSvcCardSub">Thoải mái, mát lạnh</div>
              </div>
            </div>
            <div class="grbSvcCard" onclick="rfOpenSearch(true)">
              <div class="grbSvcIconBox" style="background:#fef3c7;color:#d97706;">📅</div>
              <div class="grbSvcMeta">
                <div class="grbSvcCardTitle">Đặt lịch trước</div>
                <div class="grbSvcCardSub">Chủ động giờ đón</div>
              </div>
            </div>
          </div>

          <div class="grbSecTitle">Điểm đến phổ biến & gần đây</div>
          <div class="grbPlaceList">
            ${list.map((p, i) => `
              <div class="grbPlaceRow" onclick="rfPickQuick(${i})">
                <div class="grbPlaceIcon">📍</div>
                <div class="grbPlaceInfo">
                  <div class="grbPlaceName">${_esc(p.name)}</div>
                  <div class="grbPlaceAddr">${_esc(p.address)}</div>
                </div>
                <span class="grbArrow">›</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /* BƯỚC 2: NHẬP ĐIỂM ĐÓN / ĐIỂM ĐẾN + NÚT XÁC ĐỊNH VỊ TRÍ HIỆN TẠI */
  function _renderSearch(box) {
    const pkVal = rf.pickup ? (rf.pickup.name || '') : '';
    const dfVal = rf.dropoff ? (rf.dropoff.name || '') : '';

    box.innerHTML = `
      <div class="grbSrchHeader">
        <div class="grbSrchTopRow">
          <button class="grbBackBtn" type="button" onclick="rfStepBack()">←</button>
          <span class="grbSrchHeading">Chọn lộ trình chuyến đi</span>
          <div class="grbModeSeg">
            <button type="button" class="grbSegBtn ${rf.when === 'now' ? 'active' : ''}" onclick="rfSetWhen('now')">Bây giờ</button>
            <button type="button" class="grbSegBtn ${rf.when === 'later' ? 'active' : ''}" onclick="rfSetWhen('later')">Đặt trước</button>
          </div>
        </div>

        ${rf.when === 'later' ? `
          <div class="grbSchedBar">
            <span>🕒 Thời gian đón dự kiến:</span>
            <input type="text" class="grbSchedIn" value="${_esc(rf.schedTime || '15:30 Hôm nay')}" onchange="rideFlow.schedTime=this.value">
          </div>
        ` : ''}

        <div class="grbRouteBox">
          <div class="grbRouteLine">
            <span class="grbDotBlue"></span>
            <span class="grbLineDash"></span>
            <span class="grbDotRed"></span>
          </div>
          <div class="grbRouteInputs">
            <div id="gfRowPickup" class="grbInputWrap ${rf.focus === 'pickup' ? 'isFocus' : ''}">
              <input id="gfInputPickup" class="grbInput" type="text" autocomplete="off" value="${_esc(pkVal)}" placeholder="Nhập điểm đón của bạn..." onfocus="rfFocusInput('pickup')" oninput="rfOnType('pickup', this.value)">
              <button type="button" class="grbGpsMiniBtn" title="Lấy vị trí hiện tại của bạn" onclick="rfRequestCurrentGPS(false)">
                🎯 Vị trí hiện tại
              </button>
              <button id="gfClrPickup" type="button" class="grbClrBtn" style="display:${pkVal ? 'inline-grid' : 'none'}" onclick="rfClearPt('pickup')">✕</button>
            </div>
            <div class="grbInputSep"></div>
            <div id="gfRowDropoff" class="grbInputWrap ${rf.focus === 'dropoff' ? 'isFocus' : ''}">
              <input id="gfInputDropoff" class="grbInput" type="text" autocomplete="off" value="${_esc(dfVal)}" placeholder="Bạn muốn đến đâu?" onfocus="rfFocusInput('dropoff')" oninput="rfOnType('dropoff', this.value)">
              <button id="gfClrDropoff" type="button" class="grbClrBtn" style="display:${dfVal ? 'inline-grid' : 'none'}" onclick="rfClearPt('dropoff')">✕</button>
            </div>
          </div>
          <button type="button" class="grbSwapBtn" title="Đổi điểm đón & điểm đến" onclick="rfSwapPts()">⇅</button>
        </div>

        <!-- Nút xác định vị trí hiện tại nổi bật -->
        <div class="grbCurrentLocBanner" onclick="rfRequestCurrentGPS(false)">
          <div class="grbLocRadar">🎯</div>
          <div class="grbLocText">
            <div class="grbLocTitle">${rf.gpsLoading ? 'Đang dò tín hiệu GPS trên thiết bị...' : 'Sử dụng vị trí hiện tại của bạn'}</div>
            <div class="grbLocSub">Tự động định vị GPS làm điểm đón chính xác</div>
          </div>
          <span class="grbLocAction">Xác định ›</span>
        </div>

        <div class="grbTabs">
          <button type="button" class="grbTab ${rf.subTab === 'recent' ? 'active' : ''}" onclick="rideFlow.subTab='recent'; renderRideFlow()">Gần đây</button>
          <button type="button" class="grbTab ${rf.subTab === 'saved' ? 'active' : ''}" onclick="rideFlow.subTab='saved'; renderRideFlow()">Đã lưu</button>
        </div>
      </div>

      <div id="gfSugListContainer" class="grbSugList"></div>

      <div class="grbFloatBar">
        <button type="button" class="grbMapBtn" onclick="rfOpenPin()">🗺️ Chọn điểm trên bản đồ</button>
      </div>
    `;

    _updateSuggestionList();

    setTimeout(() => {
      const targetInp = rf.focus === 'pickup' ? _$('gfInputPickup') : _$('gfInputDropoff');
      if (targetInp) {
        targetInp.focus();
        const len = targetInp.value.length;
        targetInp.setSelectionRange(len, len);
      }
    }, 10);
  }

  function _updateSuggestionList() {
    const container = _$('gfSugListContainer');
    if (!container) return;

    const pool = rf.subTab === 'saved' ? rf.saved : rf.recents;
    const q = (rf.query || '').trim().toLowerCase();
    const filtered = q ? pool.filter(x => (x.name + ' ' + x.address).toLowerCase().includes(q)) : pool;

    let customHtml = '';
    if (q.length >= 2) {
      customHtml = `
        <div class="grbPlaceRow" style="background:#f0fdf4;" onclick="rfUseTypedAddress()">
          <div class="grbPlaceIcon" style="background:#00b14f;color:#fff;">✓</div>
          <div class="grbPlaceInfo">
            <div class="grbPlaceName">Chọn địa chỉ: "${_esc(rf.query.trim())}"</div>
            <div class="grbPlaceAddr">Sử dụng địa chỉ bạn vừa nhập</div>
          </div>
        </div>
      `;
    }

    container.innerHTML = customHtml + (filtered.length ? filtered.map((p) => {
      const realIdx = pool.indexOf(p);
      return `
        <div class="grbPlaceRow" onclick="rfSelectSug(${realIdx})">
          <div class="grbPlaceIcon">📍</div>
          <div class="grbPlaceInfo">
            <div class="grbPlaceName">${_esc(p.name)}</div>
            <div class="grbPlaceAddr">${_esc(p.address)}</div>
          </div>
        </div>
      `;
    }).join('') : (!customHtml ? `<div class="grbEmpty">Nhập tên đường, địa điểm hoặc bấm "Chọn điểm trên bản đồ" bên dưới.</div>` : ''));
  }

  /* BƯỚC 3: GHIM BẢN ĐỒ */
  function _renderPin(box) {
    const isPk = rf.pinTarget === 'pickup';
    const pt = rf.pinPoint || { lat: CENTER[0], lng: CENTER[1], name: 'Vị trí đã ghim', address: 'Chạm vào bản đồ để đặt ghim' };
    box.innerHTML = `
      <div class="grbMapTopBar">
        <button type="button" class="grbCircleBtn" onclick="rfStepBack()">←</button>
        <div class="grbMapPill">${isPk ? 'Ghim điểm đón trên bản đồ' : 'Ghim điểm đến trên bản đồ'}</div>
        <button type="button" class="grbCircleBtn" title="Về vị trí của tôi" onclick="rfRequestCurrentGPS(false)">🎯</button>
      </div>
      <div class="grbMapArea" id="gfPinMapHost"></div>
      <div class="grbBottomSheet">
        <div class="grbHandle"></div>
        <div class="grbSheetTitle">${isPk ? 'Xác nhận điểm đón' : 'Xác nhận điểm đến'}</div>
        <div class="grbPinSummary">
          <span class="${isPk ? 'grbDotBlue' : 'grbDotRed'}"></span>
          <div class="grbPlaceInfo">
            <div class="grbPlaceName" id="gfPinName">${_esc(pt.name)}</div>
            <div class="grbPlaceAddr" id="gfPinAddr">${_esc(pt.address)}</div>
          </div>
        </div>
        <button type="button" class="grbPrimaryBtn" onclick="rfConfirmPin()">Xác nhận vị trí này</button>
      </div>
    `;
    _mountMap('gfPinMapHost', pt, (lat, lng) => {
      rf.pinPoint = { name: 'Vị trí đã ghim trên bản đồ', address: `Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
      if (_$('gfPinName')) _$('gfPinName').textContent = rf.pinPoint.name;
      if (_$('gfPinAddr')) _$('gfPinAddr').textContent = rf.pinPoint.address;
    });
  }

  /* BƯỚC 4: CHỌN LOẠI XE & ĐẶT CHUYẾN */
  function _renderQuote(box) {
    if (!rf.pickup) rf.pickup = { name: 'Vị trí hiện tại của bạn', address: 'TP. Hồ Chí Minh', lat: CENTER[0], lng: CENTER[1] };
    if (!rf.dropoff) { rf.step = 'search'; return renderRideFlow(); }

    const km = _calcKm(rf.pickup, rf.dropoff);
    const svcs = (typeof SVC !== 'undefined' && Array.isArray(SVC) && SVC.length) ? SVC : [
      { id: 'bike', name: 'GoBike', desc: 'Xe máy nhanh gọn, len lỏi tốt', base: 12000, perKm: 4500, eta: '3 phút' },
      { id: 'car4', name: 'GoCar 4 chỗ', desc: 'Ô tô máy lạnh êm ái', base: 25000, perKm: 9500, eta: '5 phút' },
      { id: 'car7', name: 'GoCar 7 chỗ', desc: 'Rộng rãi cho nhóm & hành lý', base: 32000, perKm: 11500, eta: '6 phút' }
    ];
    if (!rf.svcId) rf.svcId = svcs[0].id;
    const cur = svcs.find(s => s.id === rf.svcId) || svcs[0];
    const fareOf = (s) => Math.round(((s.base || 15000) + km * (s.perKm || 5000)) / 1000) * 1000;

    box.innerHTML = `
      <div class="grbMapTopBar">
        <button type="button" class="grbCircleBtn" onclick="rfStepBack()">←</button>
        <div class="grbRouteSummaryPill" onclick="rideFlow.step='search'; renderRideFlow()">
          <span class="grbDotBlue"></span>
          <span class="grbEllipsis">${_esc(rf.pickup.name)}</span>
          <span style="color:#9ca3af;">→</span>
          <span class="grbDotRed"></span>
          <span class="grbEllipsis">${_esc(rf.dropoff.name)}</span>
        </div>
      </div>

      <div class="grbMapArea grbMapQuote" id="gfQuoteMapHost"></div>

      <div class="grbBottomSheet">
        <div class="grbHandle"></div>
        <div class="grbQuoteTopInfo">
          <span>Lộ trình dự kiến: <b>${km.toFixed(1)} km</b> (~${Math.max(4, Math.round(km * 3))} phút)</span>
          <span class="grbTimeBadge">${rf.when === 'later' ? '🕒 ' + _esc(rf.schedTime || 'Đặt trước') : '⚡ Đón ngay'}</span>
        </div>

        <div class="grbVehicleList">
          ${svcs.map(s => {
            const active = s.id === cur.id;
            const fare = fareOf(s);
            return `
              <div class="grbVehCard ${active ? 'active' : ''}" onclick="rideFlow.svcId='${s.id}'; renderRideFlow()">
                <div class="grbVehIcon">${String(s.id).includes('bike') ? '🛵' : (String(s.id).includes('7') ? '🚐' : '🚗')}</div>
                <div class="grbVehBody">
                  <div class="grbVehName">${_esc(s.name)} <span class="grbVehEta">• ${s.eta || '4 phút'}</span></div>
                  <div class="grbVehDesc">${_esc(s.desc || '')}</div>
                </div>
                <div class="grbVehPrice">${fare.toLocaleString('vi-VN')}đ</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="grbPayStrip">
          <select class="grbSelect" onchange="rideFlow.pay=this.value">
            <option value="cash" ${rf.pay === 'cash' ? 'selected' : ''}>💵 Tiền mặt</option>
            <option value="wallet" ${rf.pay === 'wallet' ? 'selected' : ''}>💳 Ví GoPay</option>
            <option value="card" ${rf.pay === 'card' ? 'selected' : ''}>🏦 Thẻ ngân hàng</option>
          </select>
          <input class="grbPromoInput" type="text" value="${_esc(rf.promo || '')}" placeholder="Mã khuyến mãi (RIDE15)..." onchange="rideFlow.promo=this.value">
        </div>

        <button type="button" class="grbPrimaryBtn" onclick="rfBookNow(${fareOf(cur)}, '${_esc(cur.name)}')">
          Đặt ${cur.name} • ${fareOf(cur).toLocaleString('vi-VN')}đ
        </button>
      </div>
    `;
    _mountMap('gfQuoteMapHost', rf.dropoff, null, rf.pickup);
  }

  /* --------------------------------------------------------------------------
     HÀM XÁC ĐỊNH VỊ TRÍ HIỆN TẠI (GPS) + HỘP THOẠI YÊU CẦU BẬT ĐỊNH VỊ
     -------------------------------------------------------------------------- */
  window.rfRequestCurrentGPS = function (stayOnHome) {
    if (!('geolocation' in navigator)) {
      _showGpsPermissionModal('Thiết bị hoặc trình duyệt của bạn không hỗ trợ định vị GPS.');
      return;
    }

    rf.gpsLoading = true;
    renderRideFlow();

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let placeName = 'Vị trí hiện tại của bạn';
        let placeAddr = `Tọa độ GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        // Dịch tọa độ sang địa chỉ đường phố thực tế (Reverse Geocoding)
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=vi`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.display_name) {
              const parts = data.display_name.split(',').map(s => s.trim());
              placeName = parts.slice(0, 2).join(', ') || 'Vị trí hiện tại của bạn';
              placeAddr = parts.slice(0, 4).join(', ');
            }
          }
        } catch {}

        rf.gpsLoading = false;
        rf.pickup = { name: placeName, address: placeAddr, lat, lng };
        rf.pinPoint = { ...rf.pickup };

        if (!stayOnHome && rf.step === 'search' && !rf.dropoff) {
          rf.focus = 'dropoff';
        }
        renderRideFlow();
        _showMiniToast(`📍 Đã xác định vị trí: ${placeName}`);
      },
      (err) => {
        rf.gpsLoading = false;
        renderRideFlow();
        let reason = 'Vui lòng bật Dịch vụ vị trí (GPS) trên điện thoại/trình duyệt và chọn "Cho phép" để ứng dụng xác định điểm đón của bạn.';
        if (err && err.code === 1) {
          reason = 'Bạn đang tắt quyền truy cập vị trí. Hãy mở Cài đặt vị trí trên điện thoại hoặc biểu tượng ổ khóa trên thanh địa chỉ trình duyệt và bật Vị trí (Location).';
        }
        _showGpsPermissionModal(reason);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  function _showGpsPermissionModal(message) {
    let modal = _$('grbGpsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'grbGpsModal';
      document.body.appendChild(modal);
    }
    modal.className = 'grbModalOverlay';
    modal.innerHTML = `
      <div class="grbModalCard">
        <div class="grbModalIconWarn">📡</div>
        <h3 class="grbModalTitle">Bật định vị vị trí (GPS)</h3>
        <p class="grbModalDesc">${_esc(message)}</p>
        <div class="grbModalBtns">
          <button type="button" class="grbModalBtnSec" onclick="document.getElementById('grbGpsModal').remove()">Để sau</button>
          <button type="button" class="grbModalBtnPri" onclick="document.getElementById('grbGpsModal').remove(); rfRequestCurrentGPS(false)">Thử định vị lại</button>
        </div>
      </div>
    `;
  }

  /* --------------------------------------------------------------------------
     POP-UP THÔNG BÁO ĐẶT XE THÀNH CÔNG ĐẸP (THAY THẾ ALERT TRÌNH DUYỆT)
     -------------------------------------------------------------------------- */
  // Hàm đẩy chuyến xe vào kho dữ liệu chung (cho cả Admin và Trang Hoạt động)
  function pushRideToSystemOrders(rideOrder) {
    // 1. Lưu vào mảng đơn hàng toàn cục của web (nếu có)
    if (typeof orders !== 'undefined' && Array.isArray(orders)) {
      orders.unshift(rideOrder);
    } else if (Array.isArray(window.orders)) {
      window.orders.unshift(rideOrder);
    }

    // 2. Đồng bộ vào localStorage để trang Admin & trang Hoạt động đọc được ngay
    const possibleKeys = ['gonow_orders', 'orders', 'ORDERS', 'gn_orders'];
    let savedToExisting = false;
    possibleKeys.forEach((k) => {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            arr.unshift(rideOrder);
            localStorage.setItem(k, JSON.stringify(arr));
            savedToExisting = true;
          }
        }
      } catch {}
    });

    if (!savedToExisting) {
      try {
        const fallback = JSON.parse(localStorage.getItem('gonow_orders') || '[]');
        fallback.unshift(rideOrder);
        localStorage.setItem('gonow_orders', JSON.stringify(fallback));
      } catch {}
    }

    // 3. Gọi các hàm render lại danh sách đơn hàng / hoạt động có sẵn của dự án
    if (typeof saveOrders === 'function') { try { saveOrders(); } catch {} }
    if (typeof renderOrders === 'function') { try { renderOrders(); } catch {} }
    if (typeof renderAdmin === 'function') { try { renderAdmin(); } catch {} }
  }

  // Ghi đè hàm đặt xe: Vừa hiện Pop-up đẹp, vừa gửi đơn qua Admin & Trang Hoạt động
  window.rfBookNow = function (fare, svcName) {
    // Tự động hiển thị thẻ theo dõi chuyến xe trong tab Đơn hàng / Hoạt động
  function injectRideTrackerInOrders() {
    const ordersSec = document.getElementById('orders');
    if (!ordersSec) return;

    let trackerWrap = document.getElementById('gnRideActivityList');
    if (!trackerWrap) {
      trackerWrap = document.createElement('div');
      trackerWrap.id = 'gnRideActivityList';
      trackerWrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-bottom:18px;';
      ordersSec.insertBefore(trackerWrap, ordersSec.firstChild.nextSibling || ordersSec.firstChild);
    }

    let allOrders = [];
    ['gonow_orders', 'orders', 'ORDERS', 'gn_orders'].forEach((k) => {
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr)) allOrders = allOrders.concat(arr);
      } catch {}
    });

    // Lọc các chuyến xe (loại bỏ trùng lặp theo id)
    const seen = new Set();
    const rides = allOrders.filter(o => {
      if (!o || o.type !== 'ride' || seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

    if (!rides.length) {
      trackerWrap.innerHTML = '';
      return;
    }

    trackerWrap.innerHTML = `
      <div style="font-size:16px;font-weight:800;color:#111827;margin-top:6px;">🚖 Chuyến xe của bạn</div>
      ${rides.map(r => {
        const isApproved = r.status === 'approved' || r.status === 'delivering' || r.status === 'accepted';
        const isDone = r.status === 'done' || r.status === 'completed';
        const badgeBg = isDone ? '#dcfce7' : (isApproved ? '#dbeafe' : '#fef3c7');
        const badgeColor = isDone ? '#166534' : (isApproved ? '#1d4ed8' : '#b45309');
        const statusLabel = isDone ? 'Hoàn thành chuyến đi' : (isApproved ? 'Tài xế đang di chuyển tới điểm đón' : '⏳ Chờ Admin duyệt chuyến');
        const pct = isDone ? 100 : (isApproved ? 65 : 20);

        return `
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px;box-shadow:0 4px 14px rgba(0,0,0,0.04);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:800;font-size:14.5px;color:#111827;">🛵 ${_esc(r.service || 'Chuyến xe')} • #${_esc(r.id)}</span>
              <span style="background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;">${statusLabel}</span>
            </div>
            <div style="font-size:13px;color:#374151;display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">
              <div>🔵 <b>Đón:</b> ${_esc(r.from)}</div>
              <div>🔴 <b>Đến:</b> ${_esc(r.to)}</div>
            </div>
            <!-- Thanh tiến trình theo dõi tài xế -->
            <div style="background:#f3f4f6;height:8px;border-radius:999px;overflow:hidden;margin-bottom:8px;">
              <div style="width:${pct}%;height:100%;background:#00b14f;transition:width 0.4s ease;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:#6b7280;">
              <span>${isApproved ? '👨‍✈️ Tài xế: Nguyễn Văn A (59-X1 889.24)' : 'Đang chờ Admin xác nhận điều phối'}</span>
              <strong style="color:#00a84f;font-size:14.5px;">${Number(r.total || 0).toLocaleString('vi-VN')}đ</strong>
            </div>
          </div>
        `;
      }).join('')}
    `;
  }

  // Cập nhật danh sách theo dõi mỗi khi bấm vào tab Đơn hàng / Hoạt động
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab="orders"]')) {
      setTimeout(injectRideTrackerInOrders, 40);
    }
  });
    const rf = window.rideFlow || {};
    const pk = rf.pickup || { name: 'Vị trí hiện tại của bạn', address: 'TP. Hồ Chí Minh', lat: 10.7769, lng: 106.7009 };
    const df = rf.dropoff || { name: 'Điểm đến đã chọn', address: 'TP. Hồ Chí Minh', lat: 10.7820, lng: 106.7050 };
    const code = 'GN-' + Math.floor(100000 + Math.random() * 900000);
    const amount = Number(fare || 0);

    // Tạo object đơn hàng chuẩn cấu trúc để Admin & trang Hoạt động nhận diện
    const newRideOrder = {
      id: code,
      type: 'ride',
      service: svcName,
      title: `${svcName}: ${pk.name} → ${df.name}`,
      from: pk.name,
      to: df.name,
      pickup: pk,
      dropoff: df,
      total: amount,
      price: amount,
      pay: rf.pay || 'cash',
      status: 'pending', // Trạng thái chờ Admin duyệt
      statusText: 'Chờ Admin duyệt & tìm tài xế',
      driver: {
        name: 'Đang điều phối tài xế...',
        plate: '59-X1 889.24',
        phone: '0909 123 456',
        progress: 10
      },
      createdAt: new Date().toLocaleString('vi-VN'),
      timestamp: Date.now()
    };

    pushRideToSystemOrders(newRideOrder);

    window.showRideSuccessModal({
      svcName: svcName,
      fareText: amount.toLocaleString('vi-VN') + 'đ',
      pickup: pk.name,
      dropoff: df.name,
      code: code
    });
  };

  window.rfCloseSuccessModal = function () {
    const modal = _$('grbSuccessModal');
    if (modal) modal.remove();
    rf.step = 'home';
    renderRideFlow();
  };

  function _showMiniToast(text) {
    let t = _$('grbMiniToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'grbMiniToast';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function _calcKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 3.5;
    const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return Math.max(0.8, 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 1.25);
  }

  function _mountMap(hostId, pt, onPick, orig) {
    const host = _$(hostId);
    if (!host) return;
    if (typeof L === 'undefined') {
      host.innerHTML = `<div style="height:100%;display:grid;place-items:center;color:#4b5563;font-size:13px;padding:16px;text-align:center;">Bản đồ đang tải. Bạn vẫn có thể bấm xác nhận bên dưới.</div>`;
      return;
    }
    const lat = Number(pt?.lat) || CENTER[0], lng = Number(pt?.lng) || CENTER[1];
    host.innerHTML = '<div style="width:100%;height:100%"></div>';
    const m = L.map(host.firstChild, { zoomControl: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
    const mk = L.marker([lat, lng]).addTo(m);
    if (orig && orig.lat != null) {
      L.circleMarker([orig.lat, orig.lng], { radius: 7, color: '#00a84f', fillColor: '#00b14f', fillOpacity: 1 }).addTo(m);
      L.polyline([[orig.lat, orig.lng], [lat, lng]], { color: '#00b14f', weight: 4, dashArray: '6,6' }).addTo(m);
      m.fitBounds([[orig.lat, orig.lng], [lat, lng]], { padding: [45, 45] });
    }
    if (typeof onPick === 'function') {
      m.on('click', (e) => { mk.setLatLng(e.latlng); onPick(e.latlng.lat, e.latlng.lng); });
    }
    setTimeout(() => { try { m.invalidateSize(); } catch {} }, 100);
  }

  window.goFoodTab = () => { const btn = document.querySelector('[data-tab="food"]'); if (btn) btn.click(); };
  window.rfOpenSearch = (later) => { rf.step = 'search'; rf.focus = 'dropoff'; rf.query = ''; if (later) rf.when = 'later'; renderRideFlow(); };
  window.rfPickQuick = (i) => {
    const p = rf.saved.concat(rf.recents)[i];
    if (!p) return;
    rf.dropoff = { ...p };
    if (!rf.pickup) rf.pickup = { name: 'Vị trí hiện tại của bạn', address: 'TP. Hồ Chí Minh', lat: CENTER[0], lng: CENTER[1] };
    rf.step = 'quote';
    renderRideFlow();
  };
  window.rfStepBack = () => {
    if (rf.step === 'quote') rf.step = 'search';
    else if (rf.step === 'pin') rf.step = 'search';
    else if (rf.step === 'search') rf.step = 'home';
    else window.goFoodTab();
    renderRideFlow();
  };
  window.rfSetWhen = (w) => { rf.when = w; renderRideFlow(); };
  window.rfFocusInput = (which) => {
    rf.focus = which;
    const rPk = _$('gfRowPickup'), rDf = _$('gfRowDropoff');
    if (rPk) rPk.classList.toggle('isFocus', which === 'pickup');
    if (rDf) rDf.classList.toggle('isFocus', which === 'dropoff');
  };
  window.rfOnType = (which, val) => {
    rf.focus = which;
    rf.query = val;
    const clrBtn = which === 'pickup' ? _$('gfClrPickup') : _$('gfClrDropoff');
    if (clrBtn) clrBtn.style.display = val ? 'inline-grid' : 'none';
    _updateSuggestionList();
  };
  window.rfUseTypedAddress = () => {
    const text = (rf.query || '').trim();
    if (!text) return;
    const target = rf.focus || 'dropoff';
    rf[target] = {
      name: text,
      address: text + ', TP. Hồ Chí Minh',
      lat: CENTER[0] + (Math.random() - 0.5) * 0.03,
      lng: CENTER[1] + (Math.random() - 0.5) * 0.03
    };
    rf.query = '';
    if (!rf.pickup) rf.pickup = { name: 'Vị trí hiện tại của bạn', address: 'TP. Hồ Chí Minh', lat: CENTER[0], lng: CENTER[1] };
    rf.step = rf.dropoff ? 'quote' : 'search';
    renderRideFlow();
  };
  window.rfClearPt = (which) => {
    rf[which] = null;
    rf.focus = which;
    rf.query = '';
    const inp = which === 'pickup' ? _$('gfInputPickup') : _$('gfInputDropoff');
    const clr = which === 'pickup' ? _$('gfClrPickup') : _$('gfClrDropoff');
    if (inp) { inp.value = ''; inp.focus(); }
    if (clr) clr.style.display = 'none';
    _updateSuggestionList();
  };
  window.rfSwapPts = () => { [rf.pickup, rf.dropoff] = [rf.dropoff, rf.pickup]; renderRideFlow(); };
  window.rfSelectSug = (i) => {
    const pool = rf.subTab === 'saved' ? rf.saved : rf.recents;
    const p = pool[i];
    if (!p) return;
    rf[rf.focus || 'dropoff'] = { ...p };
    rf.query = '';
    if (!rf.pickup) rf.pickup = { name: 'Vị trí hiện tại của bạn', address: 'TP. Hồ Chí Minh', lat: CENTER[0], lng: CENTER[1] };
    rf.step = rf.dropoff ? 'quote' : 'search';
    renderRideFlow();
  };
  window.rfOpenPin = () => {
    rf.pinTarget = rf.focus || 'dropoff';
    rf.pinPoint = { ...(rf[rf.pinTarget] || { lat: CENTER[0], lng: CENTER[1], name: 'Vị trí đã ghim', address: 'Chạm bản đồ để chọn' }) };
    rf.step = 'pin';
    renderRideFlow();
  };
  window.rfConfirmPin = () => {
    if (rf.pinPoint) rf[rf.pinTarget || 'dropoff'] = { ...rf.pinPoint };
    if (!rf.pickup) rf.pickup = { name: 'Vị trí hiện tại của bạn', address: 'TP. Hồ Chí Minh', lat: CENTER[0], lng: CENTER[1] };
    rf.step = rf.dropoff ? 'quote' : 'search';
    renderRideFlow();
  };
  window.rfBookNow = (fare, name) => {
    alert(`Đặt ${name} thành công! Giá cước: ${Number(fare).toLocaleString('vi-VN')}đ. Đang tìm tài xế gần bạn...`);
    rf.step = 'home';
    renderRideFlow();
  };

  /* --------------------------------------------------------------------------
     4. TRANG CHI TIẾT SẢN PHẨM RIÊNG (THAY POPUP)
     -------------------------------------------------------------------------- */
  function getAllProducts() {
    if (typeof MENU !== 'undefined' && Array.isArray(MENU) && MENU.length) return MENU;
    if (typeof FOODS !== 'undefined' && Array.isArray(FOODS) && FOODS.length) return FOODS;
    if (typeof ITEMS !== 'undefined' && Array.isArray(ITEMS) && ITEMS.length) return ITEMS;
    if (typeof PRODUCTS !== 'undefined' && Array.isArray(PRODUCTS) && PRODUCTS.length) return PRODUCTS;
    return [];
  }

  function ensureDetailSection() {
    let sec = _$('productDetailPage');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'productDetailPage';
      sec.className = 'wrap gnDetailPage';
      sec.hidden = true;
      const foodSec = _$('food');
      if (foodSec && foodSec.parentNode) foodSec.parentNode.insertBefore(sec, foodSec.nextSibling);
      else document.body.appendChild(sec);
    }
    return sec;
  }

  let detailQty = 1;
  let currentDetailItem = null;

  window.openProductDetailPage = function (itemOrId) {
    const all = getAllProducts();
    const item = (typeof itemOrId === 'object' && itemOrId !== null)
      ? itemOrId
      : all.find(x => String(x.id) === String(itemOrId));
    if (!item) return;

    currentDetailItem = item;
    detailQty = 1;

    ['food', 'ride', 'orders', 'profile'].forEach(id => { const el = _$(id); if (el) el.hidden = true; });
    document.querySelectorAll('.modal, .popup, #itemModal, #foodModal').forEach(m => { m.hidden = true; m.style.display = 'none'; });

    const sec = ensureDetailSection();
    sec.hidden = false;
    origScrollTo({ top: 0, behavior: 'smooth' });

    const imgUrl = item.img || item.image || item.photo || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80';
    const price = Number(item.price || 35000);
    const oldPrice = item.oldPrice ? Number(item.oldPrice) : Math.round(price * 1.2);
    const shopName = item.shop || item.store || item.restaurant || 'GoNow Kitchen • Giao nhanh 20 phút';

    const promos = [
      { code: 'GONOW20', title: 'Giảm 20.000đ đơn từ 80.000đ', sub: 'Áp dụng cho tất cả món ăn hôm nay', tag: 'Hot' },
      { code: 'FREESHIP', title: 'Miễn phí vận chuyển tối đa 15.000đ', sub: 'Cho đơn hàng trong bán kính 5km', tag: 'Freeship' },
      { code: 'COMBO15', title: 'Giảm thêm 15% khi đặt từ 2 phần', sub: 'Tự động áp dụng tại bước thanh toán', tag: 'Ưu đãi' }
    ];

    const suggestions = all.filter(x => String(x.id) !== String(item.id)).slice(0, 8);

    sec.innerHTML = `
      <div class="gnDetTopNav">
        <button type="button" class="gnDetBackBtn" onclick="closeProductDetailPage()"><span>←</span> Quay lại thực đơn</button>
        <div class="gnDetBreadcrumb">Trang chủ / Đồ ăn / <b>${_esc(item.name)}</b></div>
      </div>

      <div class="gnDetHeroCard">
        <div class="gnDetImgCol">
          <img src="${_esc(imgUrl)}" alt="${_esc(item.name)}" class="gnDetMainImg">
          <span class="gnDetBadge">Bán chạy hôm nay</span>
        </div>
        <div class="gnDetInfoCol">
          <div class="gnDetShopTag">🏪 ${_esc(shopName)}</div>
          <h1 class="gnDetTitle">${_esc(item.name)}</h1>
          <div class="gnDetMetaRow">
            <span class="gnDetStar">⭐ ${item.rating || '4.9'}</span>
            <span>•</span><span>Đã bán ${item.sold || '1.2k+'}</span>
            <span>•</span><span class="gnDetFast">⚡ Giao 15 - 25 phút</span>
          </div>
          <p class="gnDetDesc">${_esc(item.desc || item.description || 'Nguyên liệu tươi ngon tuyển chọn mỗi ngày, chế biến nóng hổi ngay khi bạn đặt đơn.')}</p>
          <div class="gnDetPriceBox">
            <span class="gnDetPrice">${_fmt(price)}</span>
            <span class="gnDetOldPrice">${_fmt(oldPrice)}</span>
            <span class="gnDetSaveTag">Tiết kiệm ${_fmt(oldPrice - price)}</span>
          </div>
          <div class="gnDetNoteBox">
            <label for="gnDetNoteInput">Ghi chú cho quán (không bắt buộc):</label>
            <input id="gnDetNoteInput" type="text" placeholder="VD: Ít cay, không hành, thêm nước chấm...">
          </div>
          <div class="gnDetActionRow">
            <div class="gnQtyControl">
              <button type="button" onclick="updateDetailQty(-1)">−</button>
              <span id="gnDetQtyVal">${detailQty}</span>
              <button type="button" onclick="updateDetailQty(1)">+</button>
            </div>
            <button type="button" class="gnDetAddBtn" id="gnDetAddBtn" onclick="addDetailToCart()">
              🛒 Thêm vào giỏ • ${_fmt(price * detailQty)}
            </button>
          </div>
        </div>
      </div>

      <div class="gnDetSection">
        <div class="gnDetSecHeader">
          <h2 class="gnDetSecTitle">🎁 Ưu đãi hôm nay</h2>
          <p class="gnDetSecSub">Chạm để sao chép mã giảm giá và dùng ngay cho đơn hàng của bạn</p>
        </div>
        <div class="gnPromoGrid">
          ${promos.map(p => `
            <div class="gnPromoCard" onclick="copyDetailPromo('${p.code}')">
              <div class="gnPromoLeft">
                <span class="gnPromoTag">${p.tag}</span>
                <div class="gnPromoTitle">${_esc(p.title)}</div>
                <div class="gnPromoSub">${_esc(p.sub)}</div>
              </div>
              <div class="gnPromoRight">
                <span class="gnPromoCode">${p.code}</span>
                <button type="button" class="gnPromoCopyBtn">Sao chép</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="gnDetSection">
        <div class="gnDetSecHeader">
          <h2 class="gnDetSecTitle">✨ Gợi ý dành cho bạn</h2>
          <p class="gnDetSecSub">Những món ngon được yêu thích nhất có thể bạn sẽ thích</p>
        </div>
        <div class="gnSugGrid">
          ${suggestions.map(s => `
            <div class="gnSugCard" onclick="openProductDetailPage('${_esc(s.id)}')">
              <div class="gnSugImgWrap">
                <img src="${_esc(s.img || s.image || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&q=80')}" alt="${_esc(s.name)}" loading="lazy">
              </div>
              <div class="gnSugBody">
                <div class="gnSugName">${_esc(s.name)}</div>
                <div class="gnSugShop">${_esc(s.shop || s.category || 'Món ngon đề xuất')}</div>
                <div class="gnSugFoot">
                  <span class="gnSugPrice">${_fmt(s.price)}</span>
                  <span class="gnSugViewBtn">Xem chi tiết →</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  window.closeProductDetailPage = function () {
    const sec = _$('productDetailPage');
    if (sec) sec.hidden = true;
    const foodSec = _$('food');
    if (foodSec) foodSec.hidden = false;
  };

  window.updateDetailQty = function (delta) {
    if (!currentDetailItem) return;
    detailQty = Math.max(1, detailQty + delta);
    const price = Number(currentDetailItem.price || 35000);
    if (_$('gnDetQtyVal')) _$('gnDetQtyVal').textContent = detailQty;
    if (_$('gnDetAddBtn')) _$('gnDetAddBtn').textContent = `🛒 Thêm vào giỏ • ${_fmt(price * detailQty)}`;
  };

  window.addDetailToCart = function () {
    if (!currentDetailItem) return;
    if (typeof addToCart === 'function') {
      for (let i = 0; i < detailQty; i++) addToCart(currentDetailItem.id);
    }
    alert(`Đã thêm ${detailQty}x "${currentDetailItem.name}" vào giỏ hàng!`);
  };

  window.copyDetailPromo = function (code) {
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
    alert(`Đã sao chép mã ưu đãi: ${code}`);
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab="ride"]')) {
      setTimeout(() => window.renderRideFlow(), 20);
      return;
    }
    if (e.target.closest('[data-tab]')) {
      const sec = _$('productDetailPage');
      if (sec) sec.hidden = true;
      return;
    }
    if (e.target.closest('button, .addBtn, [data-act="add"]')) return;

    const card = e.target.closest('.card, .foodCard, .itemCard, .menuItem, [data-item-id], [data-id]');
    if (!card || card.closest('#productDetailPage')) return;

    const clickedTitleOrImg = e.target.closest('img, h3, h4, .title, .name, .foodName, .cardTitle');
    if (!clickedTitleOrImg) return;

    const rawId = card.dataset.itemId || card.dataset.id;
    const all = getAllProducts();
    let matched = rawId ? all.find(x => String(x.id) === String(rawId)) : null;

    if (!matched) {
      const titleEl = card.querySelector('h3, h4, .title, .name, .foodName, .cardTitle');
      const titleTxt = titleEl ? titleEl.textContent.trim().toLowerCase() : '';
      if (titleTxt) matched = all.find(x => String(x.name || '').trim().toLowerCase() === titleTxt);
    }

    if (matched) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openProductDetailPage(matched);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixSmoothCarousel);
  } else {
    setTimeout(fixSmoothCarousel, 120);
  }
})();
/* ================== POP-UP ĐẶT XE THÀNH CÔNG (ANIMATION VÒNG XANH LÁ) ================== */
(function installModernRideSuccessPopup() {
  const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  window.showRideSuccessModal = function (opts) {
    const info = opts || {};
    const svcName = info.svcName || 'GoCar / GoBike';
    const fareText = info.fareText || '';
    const rf = window.rideFlow || {};
    const pkName = info.pickup || (rf.pickup && rf.pickup.name) || 'Điểm đón hiện tại của bạn';
    const dfName = info.dropoff || (rf.dropoff && rf.dropoff.name) || 'Điểm đến đã chọn';
    const code = 'GN-' + Math.floor(100000 + Math.random() * 900000);

    const old = document.getElementById('grbRideSuccessOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'grbRideSuccessOverlay';
    overlay.className = 'grbPopOverlay';
    overlay.innerHTML = `
      <div class="grbPopBox" role="dialog" aria-modal="true">
        <!-- Vòng tròn xanh lá quay 1 vòng và bung dấu tích -->
        <div class="grbSpinStage">
          <svg class="grbSpinSvg" viewBox="0 0 80 80">
            <circle class="grbSpinTrack" cx="40" cy="40" r="34"></circle>
            <circle class="grbSpinArc" cx="40" cy="40" r="34"></circle>
          </svg>
          <div class="grbCheckBadge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        <span class="grbPopCode">MÃ CHUYẾN #${code}</span>
        <h2 class="grbPopTitle">Đặt xe thành công!</h2>
        <p class="grbPopDesc">
          Đã xác nhận chuyến <b>${_esc(svcName)}</b>. Hệ thống đang điều phối tài xế gần bạn nhất...
        </p>

        <div class="grbPopSummary">
          <div class="grbPopRow">
            <span class="grbPopDotBlue"></span>
            <span class="grbPopAddr">${_esc(pkName)}</span>
          </div>
          <div class="grbPopRow">
            <span class="grbPopDotRed"></span>
            <span class="grbPopAddr">${_esc(dfName)}</span>
          </div>
          ${fareText ? `
            <div class="grbPopDivider"></div>
            <div class="grbPopFareRow">
              <span>Tổng cước phí</span>
              <strong>${_esc(fareText)}</strong>
            </div>
          ` : ''}
        </div>

        <button type="button" class="grbPopBackBtn" id="grbPopBackBtn">
          ← Quay trở lại
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeAndReset = () => {
      overlay.classList.add('is-closing');
      setTimeout(() => {
        overlay.remove();
        if (window.rideFlow) {
          window.rideFlow.step = 'home';
          if (typeof window.renderRideFlow === 'function') window.renderRideFlow();
        }
      }, 200);
    };

    document.getElementById('grbPopBackBtn').onclick = closeAndReset;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAndReset();
    });
  };

  // Ghi đè hàm đặt xe mới
  window.rfBookNow = function (fare, svcName) {
    window.showRideSuccessModal({
      svcName: svcName,
      fareText: Number(fare || 0).toLocaleString('vi-VN') + 'đ'
    });
  };

  // Chặn luôn mọi lệnh alert() đặt xe cũ nếu code phía trên vô tình gọi tới
  const _nativeAlert = window.alert.bind(window);
  window.alert = function (msg) {
    const text = String(msg || '');
    if (text.includes('Đặt ') && text.includes('thành công')) {
      const mSvc = text.match(/Đặt\s+(.+?)\s+thành công/i);
      const mFare = text.match(/([\d.,]+đ)/i);
      window.showRideSuccessModal({
        svcName: mSvc ? mSvc[1] : 'Chuyến xe',
        fareText: mFare ? mFare[1] : ''
      });
      return;
    }
    return _nativeAlert(msg);
  };
})();
/* ================== KẾT NỐI ĐẶT XE CHUẨN CẤU TRÚC GONOW (ADMIN + FIRESTORE + HOẠT ĐỘNG) ================== */
(function connectRideToGoNowSystem() {
  const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // 1. Pop-up đặt xe thành công có vòng tròn xanh lá quay + nút "Theo dõi chuyến xe"
  window.showRideSuccessModal = function (opts) {
    const info = opts || {};
    const svcName = info.svcName || 'GoCar / GoBike';
    const fareText = info.fareText || '';
    const pkName = info.pickup || 'Điểm đón hiện tại của bạn';
    const dfName = info.dropoff || 'Điểm đến đã chọn';
    const code = info.code || ('GN' + Math.floor(10000000 + Math.random() * 89999999));

    const old = document.getElementById('grbRideSuccessOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'grbRideSuccessOverlay';
    overlay.className = 'grbPopOverlay';
    overlay.innerHTML = `
      <div class="grbPopBox" role="dialog" aria-modal="true">
        <div class="grbSpinStage">
          <svg class="grbSpinSvg" viewBox="0 0 80 80">
            <circle class="grbSpinTrack" cx="40" cy="40" r="34"></circle>
            <circle class="grbSpinArc" cx="40" cy="40" r="34"></circle>
          </svg>
          <div class="grbCheckBadge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        <span class="grbPopCode">MÃ CHUYẾN #${_esc(code)}</span>
        <h2 class="grbPopTitle">Đặt xe thành công!</h2>
        <p class="grbPopDesc">
          Chuyến <b>${_esc(svcName)}</b> đã được gửi sang hệ thống Admin để duyệt & điều phối tài xế.
        </p>

        <div class="grbPopSummary">
          <div class="grbPopRow">
            <span class="grbPopDotBlue"></span>
            <span class="grbPopAddr">${_esc(pkName)}</span>
          </div>
          <div class="grbPopRow">
            <span class="grbPopDotRed"></span>
            <span class="grbPopAddr">${_esc(dfName)}</span>
          </div>
          <div class="grbPopDivider"></div>
          <div class="grbPopFareRow">
            <span>Tổng cước phí</span>
            <strong>${_esc(fareText)}</strong>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <button type="button" class="grbPopBackBtn" id="grbPopTrackBtn">
            📍 Theo dõi chuyến xe của bạn
          </button>
          <button type="button" id="grbPopBackBtn" style="width:100%;background:#f3f4f6;color:#374151;border:none;border-radius:14px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;">
            ← Quay trở lại
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const resetRideHome = () => {
      overlay.remove();
      if (window.rideFlow) {
        window.rideFlow.step = 'home';
        if (typeof window.renderRideFlow === 'function') window.renderRideFlow();
      }
    };

    // Bấm "Theo dõi chuyến xe của bạn" -> Mở tab Hoạt động / Đơn hàng (#orders)
    document.getElementById('grbPopTrackBtn').onclick = () => {
      resetRideHome();
      const ordersTabBtn = document.querySelector('[data-tab="orders"]');
      if (ordersTabBtn) ordersTabBtn.click();
      if (typeof renderOrders === 'function') { try { renderOrders(); } catch {} }
      setTimeout(window.renderRideActivityTracker, 50);
    };

    document.getElementById('grbPopBackBtn').onclick = resetRideHome;
  };

  // 2. Hàm đặt xe tạo đúng chuẩn Object của GoNow (tương thích 100% admin_2.js & storage_2.js)
  window.rfBookNow = function (fare, svcName) {
    const rf = window.rideFlow || {};
    const pk = rf.pickup || { name: 'Vị trí hiện tại của bạn', address: 'TP. Hồ Chí Minh', lat: 10.7769, lng: 106.7009 };
    const df = rf.dropoff || { name: 'Điểm đến đã chọn', address: 'TP. Hồ Chí Minh', lat: 10.7820, lng: 106.7050 };

    const now = Date.now();
    const code = 'GN' + Math.floor(10000000 + Math.random() * 89999999);
    const amount = Math.round(Number(fare || 0));

    // Tính khoảng cách ước tính
    let km = 3.2;
    if (pk.lat != null && df.lat != null) {
      const R = 6371, dLat = (df.lat - pk.lat) * Math.PI / 180, dLng = (df.lng - pk.lng) * Math.PI / 180;
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(pk.lat * Math.PI / 180) * Math.cos(df.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      km = Math.max(0.8, Math.round(2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 1.25 * 10) / 10);
    }

    // Lấy thông tin khách hàng + uid (nếu đăng nhập)
    let customerLabel = 'Khách vãng lai';
    let uid = (typeof myUid === 'function' && myUid()) || '';
    try {
      const u = (typeof currentUser !== 'undefined' && currentUser)
        || JSON.parse(localStorage.getItem('gonow_user') || localStorage.getItem('currentUser') || 'null');
      if (u) {
        const nm = u.name || u.fullName || u.displayName || u.email || 'Khách hàng';
        customerLabel = u.phone ? `${nm} • ${u.phone}` : nm;
        if (!uid && u.uid) uid = u.uid;
      }
    } catch {}

    const payLabels = {
      cash: 'Trả tiền mặt cho tài xế',
      wallet: 'Ví điện tử GoPay',
      card: 'Thẻ ngân hàng'
    };

    // Object đơn hàng khớp 100% schema của admin_2.js & storage_2.js
    const rideOrder = {
      id: code,
      type: 'ride',
      detail: [
        `${pk.name} → ${df.name}`,
        `${svcName}, ~${km} km`
      ],
      items: null,
      subtotal: amount,
      discount: 0,
      ship: 0,
      total: amount,
      code: (rf.promo || '').trim().toUpperCase(),
      pay: payLabels[rf.pay] || 'Trả tiền mặt cho tài xế',
      status: 0,            // 0 = bước đầu tiên trong RIDE_STEPS (Admin duyệt tăng 1 -> 2 -> 3 -> 4)
      cancelled: false,
      createdAt: new Date(now).toLocaleString('vi-VN'),
      ts: now,
      upd: now,
      customer: customerLabel,
      uid: uid,
      pickup: pk,
      dropoff: df,
      service: svcName
    };

    // Đọc danh sách gonow_orders hiện có, thêm chuyến mới lên đầu, và lưu qua hàm save() của storage.js
    let list = [];
    try {
      list = (typeof load === 'function')
        ? load('gonow_orders', [])
        : JSON.parse(localStorage.getItem('gonow_orders') || '[]');
    } catch {}
    if (!Array.isArray(list)) list = [];

    list.unshift(rideOrder);

    // Đồng bộ biến orders toàn cục nếu đang tồn tại ở cửa hàng
    if (typeof orders !== 'undefined' && Array.isArray(orders) && orders !== list) {
      orders.length = 0;
      orders.push(...list);
    }

    // Lưu vào localStorage + tự động đẩy lên Firestore qua dbMirror trong storage.js!
    if (typeof save === 'function') {
      save('gonow_orders', list);
    } else {
      localStorage.setItem('gonow_orders', JSON.stringify(list));
    }

    // Cập nhật lại giao diện Đơn hàng / Hoạt động của khách ngay lập tức
    if (typeof renderOrders === 'function') { try { renderOrders(); } catch {} }
    window.renderRideActivityTracker();

    // Hiển thị Pop-up xanh lá thành công
    window.showRideSuccessModal({
      svcName: svcName,
      fareText: amount.toLocaleString('vi-VN') + 'đ',
      pickup: pk.name,
      dropoff: df.name,
      code: code
    });
  };

  // 3. Khung theo dõi tiến trình tài xế trong tab Hoạt động / Đơn hàng (#orders)
  // Đồng bộ trực tiếp với status (0..4) và cancelled mà Admin bấm duyệt bên admin.html!
  window.renderRideActivityTracker = function () {
    const ordersSec = document.getElementById('orders');
    if (!ordersSec) return;

    let wrap = document.getElementById('gnRideActivityList');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'gnRideActivityList';
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;margin:12px 0 22px;';
      const anchor = ordersSec.querySelector('h2, .sub, .secHead');
      if (anchor && anchor.nextSibling) {
        ordersSec.insertBefore(wrap, anchor.nextSibling);
      } else {
        ordersSec.prepend(wrap);
      }
    }

    let list = [];
    try {
      list = (typeof load === 'function')
        ? load('gonow_orders', [])
        : JSON.parse(localStorage.getItem('gonow_orders') || '[]');
    } catch {}
    if (!Array.isArray(list)) list = [];

    const rides = list.filter(o => o && o.type === 'ride');
    if (!rides.length) {
      wrap.innerHTML = '';
      return;
    }

    const defaultSteps = ['Chờ Admin duyệt', 'Đã tìm thấy tài xế', 'Tài xế đang đến đón', 'Đang trên chuyến đi', 'Hoàn thành'];
    const stepsArr = (typeof RIDE_STEPS !== 'undefined' && Array.isArray(RIDE_STEPS)) ? RIDE_STEPS : defaultSteps;

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:800;color:#111827;">🚖 Theo dõi chuyến xe của bạn (${rides.length})</h3>
        <button type="button" onclick="renderRideActivityTracker()" style="background:#ecfdf3;color:#008a3e;border:1px solid #a7f3d0;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;">↻ Cập nhật</button>
      </div>
      ${rides.map((r) => {
        const st = Number(r.status || 0);
        const isCancel = !!r.cancelled;
        const isDone = !isCancel && st >= 4;
        const isApproved = !isCancel && st >= 1 && st < 4;

        const stepLabel = isCancel ? 'Đã hủy chuyến' : (stepsArr[st] || defaultSteps[st] || 'Đang xử lý');
        const badgeBg = isCancel ? '#fee2e2' : (isDone ? '#dcfce7' : (isApproved ? '#dbeafe' : '#fef3c7'));
        const badgeColor = isCancel ? '#b91c1c' : (isDone ? '#166534' : (isApproved ? '#1d4ed8' : '#b45309'));
        const pct = isCancel ? 0 : Math.min(100, Math.round(((st + 1) / 5) * 100));

        const routeLine = Array.isArray(r.detail) && r.detail[0] ? r.detail[0] : `${r.from || 'Điểm đón'} → ${r.to || 'Điểm đến'}`;
        const svcLine = Array.isArray(r.detail) && r.detail[1] ? r.detail[1] : (r.service || 'Chuyến xe GoNow');

        return `
          <div style="background:#ffffff;border:1.5px solid ${isApproved ? '#3b82f6' : (isDone ? '#00b14f' : '#e5e7eb')};border-radius:18px;padding:16px 18px;box-shadow:0 6px 20px rgba(0,0,0,0.05);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
              <div>
                <span style="font-weight:800;font-size:15px;color:#111827;">🛵 ${_esc(svcLine)}</span>
                <span style="font-size:12.5px;color:#6b7280;margin-left:6px;">• #${_esc(r.id)}</span>
              </div>
              <span style="background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:800;padding:5px 12px;border-radius:999px;">
                ${_esc(stepLabel)}
              </span>
            </div>

            <div style="background:#f8faf9;border-radius:12px;padding:10px 12px;font-size:13.5px;font-weight:600;color:#1f2937;margin-bottom:12px;">
              📍 ${_esc(routeLine)}
            </div>

            <!-- Thanh tiến trình 5 bước đồng bộ với Admin -->
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;">
                <span style="color:${st >= 0 && !isCancel ? '#00a84f' : ''}">1. Chờ duyệt</span>
                <span style="color:${st >= 1 && !isCancel ? '#00a84f' : ''}">2. Nhận chuyến</span>
                <span style="color:${st >= 2 && !isCancel ? '#00a84f' : ''}">3. Đang đón</span>
                <span style="color:${st >= 3 && !isCancel ? '#00a84f' : ''}">4. Đang đi</span>
                <span style="color:${st >= 4 && !isCancel ? '#00a84f' : ''}">5. Hoàn thành</span>
              </div>
              <div style="background:#e5e7eb;height:8px;border-radius:999px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#00b14f,#10b981);border-radius:999px;transition:width 0.4s ease;"></div>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#4b5563;padding-top:8px;border-top:1px dashed #e5e7eb;">
              <span>${isApproved || isDone ? '👨‍✈️ Tài xế: <b>Nguyễn Văn A</b> • Biển số: <b>59-X1 889.24</b>' : '🕒 Đặt lúc: ' + _esc(r.createdAt || '')}</span>
              <strong style="font-size:16px;font-weight:800;color:#00a84f;">${Number(r.total || 0).toLocaleString('vi-VN')}đ</strong>
            </div>
          </div>
        `;
      }).join('')}
    `;
  };

  // Tự động cập nhật theo dõi khi mở tab Hoạt động hoặc khi Admin ở tab khác vừa bấm duyệt!
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab="orders"]')) {
      setTimeout(window.renderRideActivityTracker, 40);
    }
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'gonow_orders') window.renderRideActivityTracker();
  });
  window.addEventListener('gn-remote', (e) => {
    if (!e.detail || e.detail.key === 'gonow_orders') window.renderRideActivityTracker();
  });
})();
/* ================== HIỆU ỨNG GỢN SÓNG (RIPPLE) CHO NÚT ĐẶT XE ================== */
document.addEventListener('pointerdown', function (e) {
  const btn = e.target.closest(
    '.grbPrimaryBtn, .grbPopBackBtn, .grbSvcCard, .grbVehCard, .grbChipItem, .grbGpsPill, .grbCurrentLocBanner, .grbGpsMiniBtn, .grbMapBtn, .grbSwapBtn, .grbIconBtn, .grbBackBtn, .grbCircleBtn'
  );
  if (!btn) return;

  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const wave = document.createElement('span');
  const isLightBtn = btn.classList.contains('grbSvcCard') || btn.classList.contains('grbVehCard') || btn.classList.contains('grbChipItem') || btn.classList.contains('grbCurrentLocBanner') || btn.classList.contains('grbGpsMiniBtn') || btn.classList.contains('grbBackBtn') || btn.classList.contains('grbCircleBtn');

  wave.className = 'grbRippleWave' + (isLightBtn ? ' is-dark' : '');
  wave.style.width = wave.style.height = size + 'px';
  wave.style.left = (e.clientX - rect.left - size / 2) + 'px';
  wave.style.top = (e.clientY - rect.top - size / 2) + 'px';

  if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
  btn.style.overflow = 'hidden';
  btn.appendChild(wave);
  setTimeout(() => wave.remove(), 600);
});
/* ================== 1. ANIMATION TÀI XẾ DI CHUYỂN TỪ VỊ TRÍ NGẪU NHIÊN ĐẾN ĐÓN & TRẢ KHÁCH ================== */
(function installLiveDriverAnimation() {
  const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const driverOrigins = {}; // Lưu vị trí xuất phát ngẫu nhiên cố định theo từng mã chuyến

  function getRandomOrigin(rideId) {
    if (!driverOrigins[rideId]) {
      // Tạo tọa độ xuất phát ngẫu nhiên ở góc trái/trên/dưới bản đồ (x: 8..26%, y: 18..82%)
      driverOrigins[rideId] = {
        x: Math.round(8 + Math.random() * 18),
        y: Math.round(18 + Math.random() * 64)
      };
    }
    return driverOrigins[rideId];
  }

  // Nội suy tọa độ mượt trên đường cong Bezier bậc 2
  function quadPoint(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
    };
  }

  window.renderRideActivityTracker = function () {
    const ordersSec = document.getElementById('orders');
    if (!ordersSec) return;

    let wrap = document.getElementById('gnRideActivityList');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'gnRideActivityList';
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;margin:12px 0 22px;';
      const anchor = ordersSec.querySelector('h2, .sub, .secHead');
      if (anchor && anchor.nextSibling) ordersSec.insertBefore(wrap, anchor.nextSibling);
      else ordersSec.prepend(wrap);
    }

    let list = [];
    try {
      list = (typeof load === 'function')
        ? load('gonow_orders', [])
        : JSON.parse(localStorage.getItem('gonow_orders') || '[]');
    } catch {}
    if (!Array.isArray(list)) list = [];

    const rides = list.filter(o => o && o.type === 'ride');
    if (!rides.length) {
      wrap.innerHTML = '';
      return;
    }

    const defaultSteps = ['Chờ Admin duyệt', 'Đã tìm thấy tài xế', 'Tài xế đang đến đón', 'Đang trên chuyến đi', 'Hoàn thành'];
    const stepsArr = (typeof RIDE_STEPS !== 'undefined' && Array.isArray(RIDE_STEPS)) ? RIDE_STEPS : defaultSteps;

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;font-size:17px;font-weight:800;color:#111827;">🚖 Theo dõi chuyến xe trực tiếp (${rides.length})</h3>
        <button type="button" onclick="renderRideActivityTracker()" style="background:#ecfdf3;color:#008a3e;border:1px solid #a7f3d0;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;">↻ Làm mới</button>
      </div>
      ${rides.map((r) => {
        const st = Number(r.status || 0);
        const isCancel = !!r.cancelled;
        const isDone = !isCancel && st >= 4;
        const isApproved = !isCancel && st >= 1 && st < 4;

        const stepLabel = isCancel ? 'Đã hủy chuyến' : (stepsArr[st] || defaultSteps[st] || 'Đang xử lý');
        const badgeBg = isCancel ? '#fee2e2' : (isDone ? '#dcfce7' : (isApproved ? '#dbeafe' : '#fef3c7'));
        const badgeColor = isCancel ? '#b91c1c' : (isDone ? '#166534' : (isApproved ? '#1d4ed8' : '#b45309'));
        const pct = isCancel ? 0 : Math.min(100, Math.round(((st + 1) / 5) * 100));

        const routeLine = Array.isArray(r.detail) && r.detail[0] ? r.detail[0] : `${r.from || 'Điểm đón'} → ${r.to || 'Điểm đến'}`;
        const svcLine = Array.isArray(r.detail) && r.detail[1] ? r.detail[1] : (r.service || 'Chuyến xe GoNow');
        const isBike = /bike|xe máy/i.test(svcLine);

        // Tọa độ các điểm trên bản đồ mini (%):
        // Tài xế xuất phát ngẫu nhiên -> Điểm đón bạn (44%, 64%) -> Điểm đến (86%, 32%)
        const drvStart = getRandomOrigin(r.id);
        const pickupPt = { x: 44, y: 64 };
        const dropoffPt = { x: 86, y: 32 };
        const ctrl1 = { x: (drvStart.x + pickupPt.x) / 2, y: Math.min(drvStart.y, pickupPt.y) - 16 };
        const ctrl2 = { x: 64, y: 26 };

        // Tính vị trí hiện tại của tài xế theo trạng thái đơn (0..4) + dao động nhẹ theo thời gian thực
        const pulse = (Math.sin(Date.now() / 900) + 1) / 2; // 0..1
        let drvPos = drvStart;
        let mapCaption = '📡 Đang dò tìm tài xế quanh khu vực của bạn...';
        let tripProgress = 0;

        if (isCancel) {
          drvPos = drvStart;
          mapCaption = '✕ Chuyến đi đã hủy';
        } else if (st === 0) {
          drvPos = drvStart;
          mapCaption = '⏳ Chờ Admin duyệt điều phối tài xế...';
        } else if (st === 1) {
          // Tài xế bắt đầu rời điểm ngẫu nhiên tiến về phía bạn (35% -> 55% đoạn đường đón)
          drvPos = quadPoint(drvStart, ctrl1, pickupPt, 0.35 + pulse * 0.2);
          mapCaption = '🛵 Tài xế đã nhận chuyến, đang hướng về điểm đón...';
        } else if (st === 2) {
          // Tài xế sắp tới ngay điểm đón bạn (75% -> 96% đoạn đường đón)
          drvPos = quadPoint(drvStart, ctrl1, pickupPt, 0.75 + pulse * 0.21);
          mapCaption = '📍 Tài xế sắp đến điểm đón của bạn (~1 phút)';
        } else if (st === 3) {
          // Đã đón bạn và đang chở bạn đến điểm cần tới (25% -> 82% tuyến chính)
          const tMain = 0.25 + pulse * 0.55;
          drvPos = quadPoint(pickupPt, ctrl2, dropoffPt, tMain);
          tripProgress = tMain;
          mapCaption = '🚀 Đang đưa bạn tới điểm đến...';
        } else if (st >= 4) {
          drvPos = dropoffPt;
          tripProgress = 1;
          mapCaption = '🎉 Đã đến điểm trả khách an toàn!';
        }

        const dashLen = 120;
        const dashOffset = Math.round(dashLen * (1 - tripProgress));

        return `
          <div style="background:#ffffff;border:1.5px solid ${isApproved ? '#3b82f6' : (isDone ? '#00b14f' : '#e5e7eb')};border-radius:18px;padding:16px 18px;box-shadow:0 6px 20px rgba(0,0,0,0.05);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
              <div>
                <span style="font-weight:800;font-size:15px;color:#111827;">${isBike ? '🛵' : '🚗'} ${_esc(svcLine)}</span>
                <span style="font-size:12.5px;color:#6b7280;margin-left:6px;">• #${_esc(r.id)}</span>
              </div>
              <span style="background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:800;padding:5px 12px;border-radius:999px;">
                ${_esc(stepLabel)}
              </span>
            </div>

            <!-- BẢN ĐỒ ANIMATION TÀI XẾ DI CHUYỂN ĐÓN & TRẢ KHÁCH -->
            <div class="gnLiveMapCard">
              <div class="gnLiveMapGrid"></div>
              <div class="gnLiveMapBadge">${mapCaption}</div>
              <svg class="gnLiveMapSvg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <!-- Tuyến tài xế từ chỗ ngẫu nhiên đến đón bạn -->
                <path class="gnRouteApproach" d="M ${drvStart.x} ${drvStart.y} Q ${ctrl1.x} ${ctrl1.y} ${pickupPt.x} ${pickupPt.y}"></path>
                <!-- Tuyến chính từ điểm đón đến điểm trả khách -->
                <path class="gnRouteMainBg" d="M ${pickupPt.x} ${pickupPt.y} Q ${ctrl2.x} ${ctrl2.y} ${dropoffPt.x} ${dropoffPt.y}"></path>
                <path class="gnRouteMainActive" stroke-dasharray="${dashLen}" stroke-dashoffset="${dashOffset}" d="M ${pickupPt.x} ${pickupPt.y} Q ${ctrl2.x} ${ctrl2.y} ${dropoffPt.x} ${dropoffPt.y}"></path>
              </svg>

              <!-- Điểm xuất phát ngẫu nhiên của tài xế -->
              <div class="gnMapPin" style="left:${drvStart.x}%;top:${drvStart.y}%;">
                <div class="gnMapPinDot" style="background:#94a3b8;"></div>
                <span class="gnMapPinTag" style="background:rgba(71,85,105,0.85);">Vị trí tài xế</span>
              </div>

              <!-- Điểm đón bạn -->
              <div class="gnMapPin" style="left:${pickupPt.x}%;top:${pickupPt.y}%;">
                <div class="gnMapPinDot" style="background:#2563eb;"></div>
                <span class="gnMapPinTag">🔵 Điểm đón bạn</span>
              </div>

              <!-- Điểm đến -->
              <div class="gnMapPin" style="left:${dropoffPt.x}%;top:${dropoffPt.y}%;">
                <div class="gnMapPinDot" style="background:#ef4444;"></div>
                <span class="gnMapPinTag">🔴 Điểm đến</span>
              </div>

              <!-- Icon xe tài xế di chuyển -->
              <div class="gnDriverMarker" style="left:${drvPos.x}%;top:${drvPos.y}%;">
                ${isBike ? '🛵' : '🚕'}
              </div>
            </div>

            <div style="background:#f8faf9;border-radius:12px;padding:10px 12px;font-size:13.5px;font-weight:600;color:#1f2937;margin-bottom:12px;">
              📍 ${_esc(routeLine)}
            </div>

            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;">
                <span style="color:${st >= 0 && !isCancel ? '#00a84f' : ''}">1. Chờ duyệt</span>
                <span style="color:${st >= 1 && !isCancel ? '#00a84f' : ''}">2. Nhận chuyến</span>
                <span style="color:${st >= 2 && !isCancel ? '#00a84f' : ''}">3. Đang đón</span>
                <span style="color:${st >= 3 && !isCancel ? '#00a84f' : ''}">4. Đang đi</span>
                <span style="color:${st >= 4 && !isCancel ? '#00a84f' : ''}">5. Hoàn thành</span>
              </div>
              <div style="background:#e5e7eb;height:8px;border-radius:999px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#00b14f,#10b981);border-radius:999px;transition:width 0.4s ease;"></div>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#4b5563;padding-top:8px;border-top:1px dashed #e5e7eb;">
              <span>${isApproved || isDone ? '👨‍✈️ Tài xế: <b>Nguyễn Văn A</b> • Biển số: <b>59-X1 889.24</b>' : '🕒 Đặt lúc: ' + _esc(r.createdAt || '')}</span>
              <strong style="font-size:16px;font-weight:800;color:#00a84f;">${Number(r.total || 0).toLocaleString('vi-VN')}đ</strong>
            </div>
          </div>
        `;
      }).join('')}
    `;
  };

  // Tự động cập nhật chuyển động tài xế mỗi 1.2 giây khi người dùng đang mở tab Hoạt động
  setInterval(() => {
    const ordersSec = document.getElementById('orders');
    if (ordersSec && !ordersSec.hidden && ordersSec.offsetParent !== null) {
      window.renderRideActivityTracker();
    }
  }, 1200);
})();


/* ================== 2. SỬA LỖI THÊM VÀO GIỎ Ở TRANG CHI TIẾT + POP-UP XANH LÁ ĐẸP MẮT ================== */
(function fixDetailAddToCartAndModernPopups() {
  const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Pop-up xanh lá dùng chung cho cả Thêm vào giỏ hàng & Đặt đơn đồ ăn thành công
  window.showGreenActionModal = function (opts) {
    const o = opts || {};
    const old = document.getElementById('grbRideSuccessOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'grbRideSuccessOverlay';
    overlay.className = 'grbPopOverlay';
    overlay.innerHTML = `
      <div class="grbPopBox" role="dialog" aria-modal="true">
        <div class="grbSpinStage">
          <svg class="grbSpinSvg" viewBox="0 0 80 80">
            <circle class="grbSpinTrack" cx="40" cy="40" r="34"></circle>
            <circle class="grbSpinArc" cx="40" cy="40" r="34"></circle>
          </svg>
          <div class="grbCheckBadge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        ${o.badge ? `<span class="grbPopCode">${_esc(o.badge)}</span>` : ''}
        <h2 class="grbPopTitle">${_esc(o.title || 'Thành công!')}</h2>
        <p class="grbPopDesc">${o.desc || ''}</p>

        ${o.summaryHtml ? `<div class="grbPopSummary">${o.summaryHtml}</div>` : ''}

        <div style="display:flex;flex-direction:column;gap:10px;">
          ${o.primaryText ? `<button type="button" class="grbPopBackBtn" id="grbPopPrimaryAct">${_esc(o.primaryText)}</button>` : ''}
          <button type="button" id="grbPopBackBtn" style="width:100%;background:#f3f4f6;color:#374151;border:none;border-radius:14px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;">
            ${_esc(o.closeText || '← Quay trở lại')}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    document.getElementById('grbPopBackBtn').onclick = closeModal;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    if (o.primaryText && typeof o.onPrimary === 'function') {
      document.getElementById('grbPopPrimaryAct').onclick = () => {
        closeModal();
        o.onPrimary();
      };
    }
  };

  // Hàm thêm món vào giỏ hàng chuẩn xác (chạy được trên cả detail.html lẫn index.html)
  function addFoodItemToGoNowCart(foodId, qty, note) {
    const id = Number(foodId);
    const amountQty = Math.max(1, Number(qty) || 1);
    const allList = (typeof ALL_FOODS !== 'undefined' && Array.isArray(ALL_FOODS))
      ? ALL_FOODS
      : ((typeof FOODS !== 'undefined' && Array.isArray(FOODS)) ? FOODS : []);
    const food = allList.find(f => Number(f.id) === id);

    // Đọc giỏ hàng hiện tại từ gonow_cart
    let cart = [];
    try {
      cart = (typeof load === 'function')
        ? load('gonow_cart', [])
        : JSON.parse(localStorage.getItem('gonow_cart') || '[]');
    } catch {}
    if (!Array.isArray(cart)) cart = [];

    const existing = cart.find(item => Number(item.id) === id && (item.note || '') === (note || ''));
    if (existing) {
      existing.qty = Number(existing.qty || 1) + amountQty;
    } else {
      cart.push({
        id: id,
        qty: amountQty,
        note: note || '',
        name: food ? food.name : 'Món ăn GoNow',
        price: food ? Number(food.price) : 0,
        cat: food ? food.cat : 'Đồ ăn'
      });
    }

    // Lưu vào localStorage & cập nhật biến cart toàn cục nếu có
    if (typeof save === 'function') save('gonow_cart', cart);
    else localStorage.setItem('gonow_cart', JSON.stringify(cart));

    if (typeof window.cart !== 'undefined' && Array.isArray(window.cart) && window.cart !== cart) {
      window.cart.length = 0;
      window.cart.push(...cart);
    }

    // Cập nhật huy hiệu số lượng trên nút Giỏ hàng
    const totalCount = cart.reduce((s, x) => s + Number(x.qty || 1), 0);
    document.querySelectorAll('#cartCnt, .cartCnt, [data-cart-count]').forEach(el => {
      el.textContent = totalCount;
      el.hidden = totalCount === 0;
    });
    if (typeof renderCart === 'function') { try { renderCart(); } catch {} }
    if (typeof updateCartBadge === 'function') { try { updateCartBadge(); } catch {} }

    return { food, totalCount, amountQty };
  }

  // Bắt sự kiện click vào nút "Thêm vào giỏ hàng" ở trang chi tiết (detail.html hoặc modal chi tiết)
  document.addEventListener('click', function (e) {
    const addBtn = e.target.closest('#detailAddBtn, #addToCartBtn, [data-act="detailAdd"], [data-act="addDetail"], .detailAddBtn');
    const isDetailTextBtn = !addBtn && e.target.closest('button') && /thêm vào giỏ/i.test(e.target.closest('button').textContent || '');
    const btn = addBtn || (isDetailTextBtn ? e.target.closest('button') : null);
    if (!btn) return;

    // Lấy ID món ăn từ data-id, biến toàn cục hoặc tham số ?id= trên URL (detail.html?id=...)
    const urlId = new URLSearchParams(window.location.search).get('id');
    const foodId = btn.dataset.id || btn.getAttribute('data-food-id') || window.currentDetailId || window.detailFoodId || urlId;
    if (!foodId) return; // Nếu là nút thêm nhanh có sẵn handler chuẩn ở ngoài thì bỏ qua

    e.preventDefault();
    e.stopImmediatePropagation();

    const qtyInput = document.querySelector('#detailQty, #qtyVal, .qtyVal, input[name="qty"]');
    const qty = qtyInput ? (parseInt(qtyInput.value || qtyInput.textContent, 10) || 1) : 1;
    const noteInput = document.querySelector('#detailNote, #itemNote');
    const note = noteInput ? noteInput.value.trim() : '';

    const { food, totalCount, amountQty } = addFoodItemToGoNowCart(foodId, qty, note);
    const foodName = food ? food.name : 'Món ăn đã chọn';
    const subPrice = food ? (food.price * amountQty).toLocaleString('vi-VN') + 'đ' : '';

    window.showGreenActionModal({
      badge: `GIỎ HÀNG HIỆN CÓ ${totalCount} MÓN`,
      title: 'Thêm vào giỏ thành công!',
      desc: `Đã thêm <b>${amountQty} × ${_esc(foodName)}</b> vào giỏ hàng của bạn.`,
      summaryHtml: subPrice ? `
        <div class="grbPopFareRow">
          <span>Tạm tính món vừa thêm</span>
          <strong>${_esc(subPrice)}</strong>
        </div>
      ` : '',
      primaryText: '🛒 Xem giỏ hàng & Thanh toán',
      onPrimary: () => {
        const cartBtn = document.querySelector('#openCartBtn, [data-act="openCart"], .cartBtn, a[href*="cart"]');
        if (cartBtn) cartBtn.click();
        else if (window.location.pathname.includes('detail')) window.location.href = 'index.html#cart';
      },
      closeText: '← Tiếp tục xem món'
    });
  }, true); // Dùng capture = true để chặn trước các handler cũ bị lỗi hoặc gọi alert()

  // Chặn luôn mọi alert() thô cứng khi thêm giỏ hàng hoặc đặt đơn đồ ăn thành công
  const _nativeAlert = window.alert.bind(window);
  window.alert = function (msg) {
    const text = String(msg || '');
    if (/thêm vào giỏ|đã thêm|đặt hàng thành công|đặt đơn thành công/i.test(text)) {
      const isOrder = /đặt hàng|đặt đơn/i.test(text);
      window.showGreenActionModal({
        badge: isOrder ? 'ĐƠN HÀNG ĐÃ GỬI ADMIN' : 'CẬP NHẬT GIỎ HÀNG',
        title: isOrder ? 'Đặt đơn thành công!' : 'Đã thêm vào giỏ hàng!',
        desc: _esc(text),
        primaryText: isOrder ? '📦 Theo dõi đơn hàng của bạn' : '🛒 Mở giỏ hàng',
        onPrimary: () => {
          if (isOrder) {
            const tab = document.querySelector('[data-tab="orders"]');
            if (tab) tab.click();
          } else {
            const cartBtn = document.querySelector('#openCartBtn, [data-act="openCart"], .cartBtn');
            if (cartBtn) cartBtn.click();
          }
        },
        closeText: '← Quay trở lại'
      });
      return;
    }
    return _nativeAlert(msg);
  };
})();
/* ================== SỬA TRIỆT ĐỂ THÊM VÀO GIỎ TỪ TRANG CHI TIẾT + MỞ NGĂN KÉO GIỎ HÀNG ================== */
(function fixDetailPageAddCartFinal() {
  const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // 1. Nối chuẩn xác nút "Thêm vào giỏ" của trang chi tiết (#productDetailPage) vào hàm addCart() gốc
  window.addDetailToCart = function () {
    const all = (typeof FOODS !== 'undefined' && Array.isArray(FOODS)) ? FOODS : [];
    const titleEl = document.querySelector('#productDetailPage .gnDetTitle');
    const titleTxt = titleEl ? titleEl.textContent.trim().toLowerCase() : '';
    const item = all.find(x => String(x.name || '').trim().toLowerCase() === titleTxt) || all[0];
    if (!item) return;

    const qtyEl = document.getElementById('gnDetQtyVal');
    const qty = qtyEl ? (parseInt(qtyEl.textContent, 10) || 1) : 1;
    const noteEl = document.getElementById('gnDetNoteInput');
    const note = noteEl ? noteEl.value.trim() : '';

    // Gọi đúng hàm addCart() gốc của app_3.js để cập nhật biến cart, cartStore, #badge và đồng bộ Firestore!
    if (typeof addCart === 'function') {
      addCart(item.id, 0, qty, null, { note: note });
    }

    const totalItems = (typeof cart !== 'undefined' && Array.isArray(cart))
      ? cart.reduce((sum, c) => sum + (Number(c.qty) || 1), 0)
      : qty;
    const subTotal = (Number(item.price || 0) * qty).toLocaleString('vi-VN') + 'đ';

    // Hiện Pop-up xanh lá hiện đại thay thế alert()
    if (typeof window.showGreenActionModal === 'function') {
      window.showGreenActionModal({
        badge: `GIỎ HÀNG ĐANG CÓ ${totalItems} MÓN`,
        title: 'Đã thêm vào giỏ hàng!',
        desc: `Đã thêm <b>${qty} × ${_esc(item.name)}</b>${note ? ` (Ghi chú: <i>${_esc(note)}</i>)` : ''} vào giỏ hàng.`,
        summaryHtml: `
          <div class="grbPopFareRow">
            <span>Tạm tính món vừa chọn</span>
            <strong>${subTotal}</strong>
          </div>
        `,
        primaryText: '🛒 Mở giỏ hàng & Thanh toán',
        onPrimary: () => {
          if (typeof openDrawer === 'function') openDrawer();
          else if (typeof actions !== 'undefined' && actions.openCart) actions.openCart();
        },
        closeText: '← Tiếp tục xem món'
      });
    }
  };

  // 2. Bắt trực tiếp click vào nút #gnDetAddBtn (chặn handler cũ dùng addToCart sai tên)
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('#gnDetAddBtn');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.addDetailToCart();
  }, true);
})();
/* ================== GIAO DIỆN HOẠT ĐỘNG / ĐƠN HÀNG CHUẨN GRAB + MODAL TIẾN ĐỘ TÀI XẾ ================== */
(function installGrabActivityHub() {
  const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {
    view: 'active',   // 'active' = Đang diễn ra (màn hình chính) | 'history' = Lịch sử
    cat: 'all',       // 'all' | 'ride' | 'food'
    trackingId: null, // ID chuyến xe đang mở modal xem tiến độ
    origins: {}       // Vị trí xuất phát ngẫu nhiên của tài xế theo từng chuyến
  };

  function getDriverOrigin(id) {
    if (!state.origins[id]) {
      state.origins[id] = {
        x: Math.round(10 + Math.random() * 18),
        y: Math.round(20 + Math.random() * 60)
      };
    }
    return state.origins[id];
  }

  function quadPoint(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
    };
  }

  function getMyOrders() {
    let list = [];
    try {
      list = (typeof load === 'function')
        ? load('gonow_orders', [])
        : JSON.parse(localStorage.getItem('gonow_orders') || '[]');
    } catch {}
    if (!Array.isArray(list)) list = [];
    const uid = (typeof myUid === 'function') ? myUid() : '';
    return list.filter(o => o && (!o.uid || !uid || o.uid === uid));
  }

  // Ghi đè giao diện trang Hoạt động / Đơn hàng (#orders)
  window.renderOrders = function () {
    const ordersSec = document.getElementById('orders');
    if (!ordersSec) return;

    // Ẩn khung cũ nếu có
    const oldTracker = document.getElementById('gnRideActivityList');
    if (oldTracker) oldTracker.remove();

    const allMine = getMyOrders();
    const isHistoryOrder = (o) => !!o.cancelled || Number(o.status || 0) >= 4;

    const activeOrders = allMine.filter(o => !isHistoryOrder(o));
    const historyOrders = allMine.filter(o => isHistoryOrder(o));

    const pool = state.view === 'history' ? historyOrders : activeOrders;
    const ridePool = pool.filter(o => o.type === 'ride');
    const foodPool = pool.filter(o => o.type !== 'ride');

    const shown = state.cat === 'ride' ? ridePool : (state.cat === 'food' ? foodPool : pool);

    const rideSteps = (typeof RIDE_STEPS !== 'undefined' && Array.isArray(RIDE_STEPS))
      ? RIDE_STEPS : ['Chờ Admin duyệt', 'Đã tìm thấy tài xế', 'Tài xế đang đến đón', 'Đang trên chuyến đi', 'Hoàn thành'];
    const foodSteps = (typeof FOOD_STEPS !== 'undefined' && Array.isArray(FOOD_STEPS))
      ? FOOD_STEPS : ['Chờ quán xác nhận', 'Quán đang chuẩn bị', 'Tài xế đang lấy món', 'Đang giao đến bạn', 'Hoàn thành'];

    ordersSec.innerHTML = `
      <div class="gnActShell">
        <!-- Thanh tiêu đề + Nút Lịch sử góc trên bên phải -->
        <div class="gnActTopBar">
          <div>
            <h2 class="gnActTitle">${state.view === 'history' ? 'Lịch sử hoạt động' : 'Hoạt động đang diễn ra'}</h2>
            <p class="gnActSub">
              ${state.view === 'history'
                ? 'Danh sách các chuyến xe & đơn đồ ăn đã hoàn thành hoặc đã hủy'
                : 'Theo dõi trực tiếp các chuyến xe và đơn đồ ăn hiện tại của bạn'}
            </p>
          </div>
          <button type="button" id="gnToggleHistoryBtn" class="gnHistToggleBtn ${state.view === 'history' ? 'is-active' : ''}">
            <span>${state.view === 'history' ? '← Đang diễn ra' : '🕒 Lịch sử'}</span>
            <span class="gnHistCnt">${state.view === 'history' ? activeOrders.length : historyOrders.length}</span>
          </button>
        </div>

        <!-- Tab phân loại rõ ràng: Tất cả / Chuyến xe / Đồ ăn -->
        <div class="gnCatTabs">
          <button type="button" class="gnCatPill ${state.cat === 'all' ? 'active' : ''}" data-gn-cat="all">
            📋 Tất cả (${pool.length})
          </button>
          <button type="button" class="gnCatPill ${state.cat === 'ride' ? 'active' : ''}" data-gn-cat="ride">
            🚖 Chuyến xe (${ridePool.length})
          </button>
          <button type="button" class="gnCatPill ${state.cat === 'food' ? 'active' : ''}" data-gn-cat="food">
            🍜 Đơn đồ ăn (${foodPool.length})
          </button>
        </div>

        <!-- Danh sách thẻ đơn hàng / chuyến xe -->
        ${shown.length ? shown.map(o => {
          const isRide = o.type === 'ride';
          const st = Number(o.status || 0);
          const isCancel = !!o.cancelled;
          const isDone = !isCancel && st >= 4;
          const isLive = !isCancel && st < 4;

          const steps = isRide ? rideSteps : foodSteps;
          const statusLabel = isCancel ? 'Đã hủy' : (steps[st] || 'Đang xử lý');
          const badgeBg = isCancel ? '#fee2e2' : (isDone ? '#dcfce7' : (st >= 1 ? '#dbeafe' : '#fef3c7'));
          const badgeColor = isCancel ? '#b91c1c' : (isDone ? '#166534' : (st >= 1 ? '#1d4ed8' : '#b45309'));

          // Nội dung chi tiết
          let mainTitle = isRide ? 'Chuyến xe GoNow' : (o.storeName || 'Đơn đồ ăn GoNow');
          let bodyHtml = '';
          if (isRide) {
            const routeTxt = Array.isArray(o.detail) && o.detail[0] ? o.detail[0] : `${o.from || 'Điểm đón'} → ${o.to || 'Điểm đến'}`;
            const svcTxt = Array.isArray(o.detail) && o.detail[1] ? o.detail[1] : (o.service || 'GoCar / GoBike');
            mainTitle = svcTxt;
            bodyHtml = `<div class="gnOrdRouteBox">📍 <b>Lộ trình:</b> ${_esc(routeTxt)}</div>`;
          } else {
            const itemLines = Array.isArray(o.items) && o.items.length
              ? o.items.map(i => `${_esc(i.name)} × ${i.qty}`).join(' • ')
              : (Array.isArray(o.detail) ? o.detail.map(_esc).join(' • ') : '');
            bodyHtml = `
              <div class="gnOrdRouteBox">
                <div>🍽️ ${itemLines || 'Món ăn đã đặt'}</div>
                ${o.address ? `<div style="margin-top:4px;font-size:12.5px;color:#4b5563;">🏠 Giao đến: ${_esc(o.address)}</div>` : ''}
              </div>
            `;
          }

          return `
            <article class="gnOrdItemCard ${isLive ? 'is-live' : ''}">
              <div class="gnOrdHead">
                <div class="gnOrdTypeBadge">
                  <div class="gnOrdCircleIco ${isRide ? 'ride' : 'food'}">${isRide ? '🚖' : '🍜'}</div>
                  <div>
                    <div style="font-weight:800;font-size:15px;color:#111827;">${_esc(mainTitle)}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:2px;">Mã #${_esc(o.id)} • ${_esc(o.createdAt || '')}</div>
                  </div>
                </div>
                <span class="gnOrdStatusPill" style="background:${badgeBg};color:${badgeColor};">${_esc(statusLabel)}</span>
              </div>

              ${bodyHtml}

              <div class="gnOrdFoot">
                <div>
                  <span style="font-size:12.5px;color:#6b7280;">Tổng thanh toán: </span>
                  <strong style="font-size:16px;font-weight:800;color:#00a84f;">${Number(o.total || 0).toLocaleString('vi-VN')}đ</strong>
                </div>

                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  ${isRide && isLive ? `
                    <button type="button" class="gnTrackDriverBtn" data-gn-track-ride="${_esc(o.id)}">
                      📍 Xem tiến độ của tài xế đang đến
                    </button>
                  ` : ''}
                  ${isLive && st <= 1 ? `
                    <button type="button" data-act="cancel" data-id="${_esc(o.id)}" style="background:#fff;color:#dc2626;border:1px solid #fecaca;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:700;cursor:pointer;">
                      Hủy đơn
                    </button>
                  ` : ''}
                  ${!isRide && !isLive && o.items ? `
                    <button type="button" data-act="reorder" data-id="${_esc(o.id)}" style="background:#ecfdf3;color:#008a3e;border:1px solid #a7f3d0;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:700;cursor:pointer;">
                      ↻ Đặt lại
                    </button>
                  ` : ''}
                </div>
              </div>
            </article>
          `;
        }).join('') : `
          <div style="background:#ffffff;border:1.5px dashed #d1d5db;border-radius:20px;padding:42px 20px;text-align:center;">
            <div style="font-size:40px;margin-bottom:10px;">${state.view === 'history' ? '🗂️' : (state.cat === 'ride' ? '🚖' : '🛍️')}</div>
            <h3 style="margin:0 0 6px;font-size:16px;font-weight:800;color:#111827;">
              ${state.view === 'history' ? 'Chưa có lịch sử hoạt động' : 'Không có hoạt động nào đang diễn ra'}
            </h3>
            <p style="margin:0 0 16px;font-size:13.5px;color:#6b7280;">
              ${state.view === 'history'
                ? 'Các chuyến xe và đơn hàng sau khi hoàn tất sẽ được lưu gọn tại đây.'
                : 'Bạn có thể đặt xe hoặc đặt món ngon ngay bây giờ!'}
            </p>
            ${state.view === 'active' ? `
              <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
                <button type="button" data-tab="ride" style="background:#00b14f;color:#fff;border:none;border-radius:12px;padding:10px 18px;font-size:13.5px;font-weight:700;cursor:pointer;">🚖 Đặt xe ngay</button>
                <button type="button" data-tab="food" style="background:#f3f4f6;color:#1f2937;border:none;border-radius:12px;padding:10px 18px;font-size:13.5px;font-weight:700;cursor:pointer;">🍜 Đặt đồ ăn</button>
              </div>
            ` : ''}
          </div>
        `}
      </div>
    `;
  };

  window.renderRideActivityTracker = window.renderOrders;

  // Mở Modal Pop-up xem animation tài xế di chuyển từ vị trí ngẫu nhiên tới đón & trả khách
  function renderDriverProgressModal() {
    if (!state.trackingId) return;
    const r = getMyOrders().find(o => String(o.id) === String(state.trackingId));
    if (!r) {
      closeDriverProgressModal();
      return;
    }

    let overlay = document.getElementById('gnDriverTrackModal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'gnDriverTrackModal';
      overlay.className = 'gnTrackModalOverlay';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDriverProgressModal();
      });
      document.body.appendChild(overlay);
    }

    const st = Number(r.status || 0);
    const isCancel = !!r.cancelled;
    const svcLine = Array.isArray(r.detail) && r.detail[1] ? r.detail[1] : (r.service || 'Chuyến xe GoNow');
    const routeLine = Array.isArray(r.detail) && r.detail[0] ? r.detail[0] : `${r.from || 'Điểm đón'} → ${r.to || 'Điểm đến'}`;
    const isBike = /bike|xe máy/i.test(svcLine);

    const drvStart = getDriverOrigin(r.id);
    const pickupPt = { x: 45, y: 64 };
    const dropoffPt = { x: 86, y: 30 };
    const ctrl1 = { x: (drvStart.x + pickupPt.x) / 2, y: Math.min(drvStart.y, pickupPt.y) - 16 };
    const ctrl2 = { x: 65, y: 24 };

    const pulse = (Math.sin(Date.now() / 850) + 1) / 2;
    let drvPos = drvStart;
    let caption = '⏳ Đang chờ Admin duyệt điều phối tài xế...';
    let tripProgress = 0;

    if (isCancel) {
      caption = '✕ Chuyến xe đã bị hủy';
    } else if (st === 1) {
      drvPos = quadPoint(drvStart, ctrl1, pickupPt, 0.35 + pulse * 0.25);
      caption = '🛵 Tài xế đã nhận chuyến, đang xuất phát tới điểm đón...';
    } else if (st === 2) {
      drvPos = quadPoint(drvStart, ctrl1, pickupPt, 0.72 + pulse * 0.25);
      caption = '📍 Tài xế đang đến rất gần điểm đón của bạn (~1 phút)';
    } else if (st === 3) {
      const tMain = 0.25 + pulse * 0.55;
      drvPos = quadPoint(pickupPt, ctrl2, dropoffPt, tMain);
      tripProgress = tMain;
      caption = '🚀 Đã đón bạn! Đang di chuyển tới điểm đến...';
    } else if (st >= 4) {
      drvPos = dropoffPt;
      tripProgress = 1;
      caption = '🎉 Đã đến điểm trả khách an toàn!';
    }

    const dashLen = 120;
    const dashOffset = Math.round(dashLen * (1 - tripProgress));
    const pct = isCancel ? 0 : Math.min(100, Math.round(((st + 1) / 5) * 100));

    overlay.innerHTML = `
      <div class="gnTrackModalCard">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <h3 style="margin:0;font-size:17px;font-weight:800;color:#111827;">${isBike ? '🛵' : '🚖'} Tiến độ tài xế</h3>
            <div style="font-size:12px;color:#6b7280;">Mã chuyến #${_esc(r.id)} • ${_esc(svcLine)}</div>
          </div>
          <button type="button" id="gnCloseTrackModal" style="width:32px;height:32px;border-radius:50%;border:none;background:#f3f4f6;font-size:16px;font-weight:700;cursor:pointer;">✕</button>
        </div>

        <!-- Bản đồ trực quan tài xế từ vị trí ngẫu nhiên -> điểm đón -> điểm đến -->
        <div class="gnLiveMapCard" style="height:190px;">
          <div class="gnLiveMapGrid"></div>
          <div class="gnLiveMapBadge">${caption}</div>
          <svg class="gnLiveMapSvg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path class="gnRouteApproach" d="M ${drvStart.x} ${drvStart.y} Q ${ctrl1.x} ${ctrl1.y} ${pickupPt.x} ${pickupPt.y}"></path>
            <path class="gnRouteMainBg" d="M ${pickupPt.x} ${pickupPt.y} Q ${ctrl2.x} ${ctrl2.y} ${dropoffPt.x} ${dropoffPt.y}"></path>
            <path class="gnRouteMainActive" stroke-dasharray="${dashLen}" stroke-dashoffset="${dashOffset}" d="M ${pickupPt.x} ${pickupPt.y} Q ${ctrl2.x} ${ctrl2.y} ${dropoffPt.x} ${dropoffPt.y}"></path>
          </svg>

          <div class="gnMapPin" style="left:${drvStart.x}%;top:${drvStart.y}%;">
            <div class="gnMapPinDot" style="background:#64748b;"></div>
            <span class="gnMapPinTag" style="background:rgba(51,65,85,0.88);">Vị trí tài xế</span>
          </div>
          <div class="gnMapPin" style="left:${pickupPt.x}%;top:${pickupPt.y}%;">
            <div class="gnMapPinDot" style="background:#2563eb;"></div>
            <span class="gnMapPinTag">🔵 Điểm đón bạn</span>
          </div>
          <div class="gnMapPin" style="left:${dropoffPt.x}%;top:${dropoffPt.y}%;">
            <div class="gnMapPinDot" style="background:#ef4444;"></div>
            <span class="gnMapPinTag">🔴 Điểm đến</span>
          </div>

          <div class="gnDriverMarker" style="left:${drvPos.x}%;top:${drvPos.y}%;">
            ${isBike ? '🛵' : '🚕'}
          </div>
        </div>

        <div style="background:#f8fafc;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:600;color:#1f2937;margin-bottom:12px;">
          📍 ${_esc(routeLine)}
        </div>

        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:5px;">
            <span style="color:${st >= 0 && !isCancel ? '#00a84f' : ''}">1. Chờ duyệt</span>
            <span style="color:${st >= 1 && !isCancel ? '#00a84f' : ''}">2. Nhận chuyến</span>
            <span style="color:${st >= 2 && !isCancel ? '#00a84f' : ''}">3. Đang đón</span>
            <span style="color:${st >= 3 && !isCancel ? '#00a84f' : ''}">4. Đang đi</span>
            <span style="color:${st >= 4 && !isCancel ? '#00a84f' : ''}">5. Hoàn thành</span>
          </div>
          <div style="background:#e5e7eb;height:8px;border-radius:999px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#00b14f,#10b981);border-radius:999px;transition:width 0.4s ease;"></div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;font-size:13px;">
          <span>👨‍✈️ <b>Nguyễn Văn A</b> • Biển số: <b>59-X1 889.24</b></span>
          <strong style="color:#008a3e;">${Number(r.total || 0).toLocaleString('vi-VN')}đ</strong>
        </div>
      </div>
    `;

    document.getElementById('gnCloseTrackModal').onclick = closeDriverProgressModal;
  }

  function closeDriverProgressModal() {
    state.trackingId = null;
    const overlay = document.getElementById('gnDriverTrackModal');
    if (overlay) overlay.remove();
  }

  // Bắt sự kiện chuyển tab Lịch sử, chuyển loại Chuyến xe / Đồ ăn, và mở Modal tiến độ tài xế
  document.addEventListener('click', (e) => {
    if (e.target.closest('#gnToggleHistoryBtn')) {
      state.view = state.view === 'history' ? 'active' : 'history';
      window.renderOrders();
      return;
    }
    const catBtn = e.target.closest('[data-gn-cat]');
    if (catBtn) {
      state.cat = catBtn.dataset.gnCat;
      window.renderOrders();
      return;
    }
    const trackBtn = e.target.closest('[data-gn-track-ride]');
    if (trackBtn) {
      state.trackingId = trackBtn.dataset.gnTrackRide;
      renderDriverProgressModal();
      return;
    }
  });

  // Cập nhật animation xe chạy mượt khi Modal tiến độ tài xế đang mở
  setInterval(() => {
    if (state.trackingId) renderDriverProgressModal();
  }, 1100);

  // Tự động render lại khi dữ liệu thay đổi từ Admin
  window.addEventListener('storage', (e) => {
    if (e.key === 'gonow_orders') {
      window.renderOrders();
      if (state.trackingId) renderDriverProgressModal();
    }
  });
  window.addEventListener('gn-remote', (e) => {
    if (!e.detail || e.detail.key === 'gonow_orders') {
      window.renderOrders();
      if (state.trackingId) renderDriverProgressModal();
    }
  });
})();
/* ================== CHỐNG NHẢY Ô TÌM KIẾM TRANG CHÍNH KHI GÕ TỪNG CHỮ ================== */
(function fixMainSearchJump() {
  function lockSearchInput(input) {
    if (!input || input.dataset.gnSearchLocked) return;
    input.dataset.gnSearchLocked = '1';

    let savedPos = null;
    let savedScrollY = 0;

    // 1. Chặn mọi phím tắt toàn cục cướp focus khi đang gõ chữ
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
    }, true);

    // 2. Ghi nhớ vị trí con trỏ và vị trí cuộn trang trước khi DOM cập nhật
    input.addEventListener('input', function () {
      savedPos = this.selectionStart;
      savedScrollY = window.scrollY;

      // Giữ nguyên focus và vị trí con trỏ ngay sau khi danh sách món bên dưới lọc xong
      requestAnimationFrame(() => {
        if (document.activeElement !== input) {
          input.focus({ preventScroll: true });
        }
        if (savedPos !== null && typeof input.setSelectionRange === 'function') {
          try { input.setSelectionRange(savedPos, savedPos); } catch {}
        }
        if (Math.abs(window.scrollY - savedScrollY) > 2) {
          window.scrollTo({ top: savedScrollY, behavior: 'instant' });
        }
      });
    }, true);
  }

  function scanAndLock() {
    // Quét tất cả ô tìm kiếm ở trang chính / header / thanh tìm món
    const selectors = [
      '#searchInput',
      '#foodSearch',
      '#mainSearch',
      'header input[type="search"]',
      'header input[type="text"]',
      'input[placeholder*="Tìm"]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(lockSearchInput);
  }

  scanAndLock();
  // Theo dõi nếu giao diện vẽ lại ô tìm kiếm thì khóa lại ngay lập tức
  const obs = new MutationObserver(scanAndLock);
  obs.observe(document.body, { childList: true, subtree: true });
})();
/* Tự động gỡ border trắng của khung rỗng nằm đè lên banner đầu trang */
(function removeEmptyBannerBorder() {
  const clean = () => {
    document.querySelectorAll('section:first-of-type div, .hero div, #hero div, [class*="banner" i] div, [class*="hero" i] div').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.borderWidth !== '0px' && cs.borderStyle !== 'none') {
        el.style.setProperty('border', 'none', 'important');
        el.style.setProperty('outline', 'none', 'important');
      }
    });
  };
  clean();
  setTimeout(clean, 400);
})();
/* ================== TỰ ĐỘNG LÀM ĐẦY BẢN ĐỒ ĐẶT XE KHI MỞ TRÊN ĐIỆN THOẠI ================== */
(function fixFullScreenRideMap() {
  function refreshRideMap() {
    const rideSec = document.getElementById('ride');
    if (!rideSec || rideSec.hidden) return;

    // Kích hoạt sự kiện resize để Leaflet tự tính lại toàn bộ khung hình full-screen
    window.dispatchEvent(new Event('resize'));

    // Gọi trực tiếp invalidateSize() nếu biến bản đồ đặt xe đang tồn tại
    const mapCandidates = [window.rideMap, window.map, window._rideMap];
    mapCandidates.forEach(m => {
      if (m && typeof m.invalidateSize === 'function') {
        try { m.invalidateSize(true); } catch {}
      }
    });
  }

  // Chạy ngay khi bấm chuyển sang tab Đặt xe hoặc bấm chọn dịch vụ Xe máy / Ô tô
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab="ride"], [data-service], .svcBtn, .rideSvc')) {
      setTimeout(refreshRideMap, 60);
      setTimeout(refreshRideMap, 300);
    }
  });

  // Theo dõi khi trang #ride được mở ra
  const rideEl = document.getElementById('ride');
  if (rideEl) {
    new MutationObserver(refreshRideMap).observe(rideEl, {
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style']
    });
  }
})();
/* ================== ĐỒNG BỘ MÓN MỚI TỪ CỬA HÀNG LÊN TRANG CHỦ (BẢN FIX TRIỆT ĐỂ) ================== */
(function syncPartnerFoodsFull() {
  function buildCompleteFoodItem(cf) {
    return {
      ...cf,
      sid: cf.sid || cf.storeId || 1,
      storeId: cf.storeId || cf.sid || 1,
      shop: cf.shop || cf.storeName || 'Cửa hàng đối tác GoNow',
      sold: cf.sold || 'Mới mở bán',
      time: cf.time || '15-20 phút',
      rating: Number(cf.rating || 5.0),
      tag: cf.tag || 'Quán mới'
    };
  }

  function syncAll() {
    let customFoods = [];
    let partners = [];
    try { customFoods = JSON.parse(localStorage.getItem('gonow_partner_foods') || '[]'); } catch {}
    try { partners = JSON.parse(localStorage.getItem('gonow_partners') || '[]'); } catch {}

    // 1. Nạp cửa hàng mới đăng ký vào mảng STORES (nếu có)
    if (Array.isArray(partners) && partners.length && typeof STORES !== 'undefined' && Array.isArray(STORES)) {
      partners.forEach(p => {
        const sid = p.storeId || p.id;
        if (!sid) return;
        if (!STORES.some(s => String(s.id) === String(sid))) {
          STORES.unshift({
            id: sid,
            name: p.storeName,
            district: p.district || 'Quận 1',
            near: 0.5,
            rating: 5.0,
            cats: [p.mainCat || 'Cơm', 'Đồ uống', 'Ăn vặt', 'Món nước', 'Pizza & Burger', 'Tráng miệng', 'Món chay'],
            promos: ['FOOD10']
          });
        }
      });
    }

    // 2. Nạp món ăn mới vào cả biến FOODS, ALL_FOODS và localStorage('gonow_foods')
    if (Array.isArray(customFoods) && customFoods.length) {
      const normalized = customFoods.map(buildCompleteFoodItem);

      [typeof FOODS !== 'undefined' ? FOODS : null, typeof ALL_FOODS !== 'undefined' ? ALL_FOODS : null].forEach(arr => {
        if (!Array.isArray(arr)) return;
        normalized.forEach(item => {
          const idx = arr.findIndex(f => String(f.id) === String(item.id));
          if (idx >= 0) arr[idx] = { ...arr[idx], ...item };
          else arr.unshift(item);
        });
      });

      // Đồng bộ thêm vào kho gonow_foods nếu trang chủ dùng cache này
      try {
        const storedFoods = JSON.parse(localStorage.getItem('gonow_foods') || '[]');
        if (Array.isArray(storedFoods) && storedFoods.length) {
          normalized.forEach(item => {
            const idx = storedFoods.findIndex(f => String(f.id) === String(item.id));
            if (idx >= 0) storedFoods[idx] = { ...storedFoods[idx], ...item };
            else storedFoods.unshift(item);
          });
          localStorage.setItem('gonow_foods', JSON.stringify(storedFoods));
        }
      } catch {}
    }

    // 3. Gọi lại tất cả các hàm render danh sách món trên trang chủ
    ['renderFood', 'renderFoods', 'renderHome', 'renderStores', 'applyFoodFilter'].forEach(fnName => {
      if (typeof window[fnName] === 'function') {
        try { window[fnName](); } catch {}
      }
    });
  }

  // Chạy ngay lập tức và chạy lại sau khi DOM/dữ liệu gốc khởi tạo xong
  syncAll();
  window.addEventListener('DOMContentLoaded', () => setTimeout(syncAll, 150));
  setTimeout(syncAll, 500);
  setTimeout(syncAll, 1500);

  // Tự động cập nhật khi tab Cửa hàng vừa thêm món hoặc khi quay lại tab trang chủ
  window.addEventListener('storage', (e) => {
    if (e.key === 'gonow_partner_foods' || e.key === 'gonow_partners') syncAll();
  });
  window.addEventListener('focus', syncAll);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncAll();
  });
})();
/* ================== GẮN VĨNH VIỄN TÀI XẾ & CỬA HÀNG VÀO TÀI KHOẢN USER (KỂ CẢ KHI ĐĂNG XUẤT) ================== */
(function bindPartnersToUserAccount() {
  function getActiveUserKey() {
    const keys = ['gonow_user', 'currentUser', 'gonow_current_user', 'user', 'authUser'];
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const u = JSON.parse(raw);
        if (u && (u.uid || u.id || u.email || u.phone)) {
          return String(u.uid || u.id || u.email || u.phone);
        }
      } catch {}
    }
    return '';
  }

  function syncAccountLink() {
    const uKey = getActiveUserKey();
    if (!uKey) {
      localStorage.removeItem('gonow_active_account_key');
      localStorage.removeItem('gonow_current_driver_id');
      localStorage.removeItem('gonow_current_partner_id');
      return;
    }
    localStorage.setItem('gonow_active_account_key', uKey);

    try {
      const drivers = JSON.parse(localStorage.getItem('gonow_drivers') || '[]');
      const myDrv = drivers.find(d => String(d.ownerUid) === uKey);
      if (myDrv) localStorage.setItem('gonow_current_driver_id', myDrv.id);
    } catch {}

    try {
      const partners = JSON.parse(localStorage.getItem('gonow_partners') || '[]');
      const myShop = partners.find(p => String(p.ownerUid) === uKey);
      if (myShop) localStorage.setItem('gonow_current_partner_id', myShop.id);
    } catch {}
  }

  syncAccountLink();
  setInterval(syncAccountLink, 1000);
  window.addEventListener('storage', syncAccountLink);
})();
/* ================== HỆ THỐNG MEMBER THƯỜNG / VIP (50K) / SVIP (150K) + QR CHUYỂN KHOẢN ================== */
(function installMemberTierSystem() {
  // 👇 THAY THÔNG TIN NGÂN HÀNG CỦA BẠN TẠI ĐÂY 👇
  const MY_BANK = {
    bankId: 'MB',                 // Mã ngân hàng VietQR: MB, VCB, TCB, ACB, BIDV, VTB, TPB, MBBank...
    accountNo: '0343758848',      // Số tài khoản ngân hàng của bạn
    accountName: 'Trần Lê Tuấn Anh'   // Tên chủ tài khoản (viết hoa không dấu)
  };

  const TIERS = {
    regular: { id: 'regular', name: 'Member Thường', price: 0, rideOff: 0, foodOff: 0, shipOff: 0 },
    vip:     { id: 'vip',     name: 'Member VIP',    price: 50000, rideOff: 0.10, foodOff: 0.05, shipOff: 0.50 },
    svip:    { id: 'svip',    name: 'Member SVIP',   price: 150000, rideOff: 0.20, foodOff: 0.12, shipOff: 1.00 }
  };

  const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _money = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';

  function getUserKey() {
    const keys = ['gonow_user', 'currentUser', 'gonow_current_user', 'user', 'authUser'];
    for (const k of keys) {
      try {
        const u = JSON.parse(localStorage.getItem(k) || 'null');
        if (u && (u.uid || u.id || u.email || u.phone)) return String(u.uid || u.id || u.email || u.phone);
      } catch {}
    }
    return 'guest_demo';
  }

  function getUserName() {
    const keys = ['gonow_user', 'currentUser', 'gonow_current_user', 'user', 'authUser'];
    for (const k of keys) {
      try {
        const u = JSON.parse(localStorage.getItem(k) || 'null');
        if (u && (u.name || u.displayName || u.email)) return String(u.name || u.displayName || u.email);
      } catch {}
    }
    return 'Khách hàng GoNow';
  }

  function getMemberMap() {
    try { return JSON.parse(localStorage.getItem('gonow_member_tiers') || '{}'); } catch { return {}; }
  }

  window.getCurrentMemberTier = function () {
    const map = getMemberMap();
    const tierId = map[getUserKey()] || 'regular';
    return TIERS[tierId] || TIERS.regular;
  };

  function getRequests() {
    try { return JSON.parse(localStorage.getItem('gonow_vip_requests') || '[]'); } catch { return []; }
  }
  function saveRequests(list) {
    localStorage.setItem('gonow_vip_requests', JSON.stringify(list));
  }

  // Hiển thị bảng chọn nâng cấp thẻ thành viên trong tab Tài khoản (#account)
  // Gắn huy hiệu logo hạng thẻ ngay cạnh tên tài khoản + mở Pop-up nâng cấp khi bấm vào
  function renderMemberSection() {
    const oldBox = document.getElementById('gnMemberTierBox');
    if (oldBox) oldBox.remove();

    const cur = window.getCurrentMemberTier();
    const uKey = getUserKey();
    const pendingReq = getRequests().find(r => r.userKey === uKey && r.status === 'pending');

    const badgeIcon = cur.id === 'svip' ? '💎' : (cur.id === 'vip' ? '👑' : '🥉');
    const badgeLabel = cur.id === 'svip' ? 'SVIP' : (cur.id === 'vip' ? 'VIP' : 'Member');

    // Tìm tên tài khoản trong vùng #account (Tuấn Trần) hoặc trên header
    const accSec = document.getElementById('account');
    const nameEl = accSec
      ? Array.from(accSec.querySelectorAll('h1, h2, h3, .accName, .profileName, strong, div')).find(el =>
          el.children.length === 0 && el.textContent.trim().length >= 2 && el.textContent.trim().length <= 40 && !/tài khoản của tôi|đã xác minh|@/i.test(el.textContent)
        )
      : null;

    if (nameEl) {
      nameEl.style.display = 'inline-flex';
      nameEl.style.alignItems = 'center';
      nameEl.style.flexWrap = 'wrap';
      nameEl.style.gap = '8px';

      let pill = document.getElementById('gnInlineMemberPill');
      if (!pill) {
        pill = document.createElement('button');
        pill.id = 'gnInlineMemberPill';
        pill.type = 'button';
        pill.onclick = () => window.openTierSelectorModal();
        nameEl.appendChild(pill);
      }
      pill.className = `gnTierBadge ${cur.id}`;
      pill.style.cssText = 'cursor:pointer;padding:4px 11px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.12);transition:transform .18s ease;';
      pill.title = 'Bấm để xem quyền lợi & nâng cấp thẻ VIP / SVIP';
      pill.innerHTML = `${badgeIcon} <span>${badgeLabel}</span>${pendingReq ? ' <span style="font-size:10px;opacity:.85;">(Chờ duyệt)</span>' : ' <span style="font-size:11px;opacity:.8;">▾</span>'}`;
    }

    // Đồng thời gắn huy hiệu nhỏ kế bên nút avatar tài khoản trên thanh Header
    const headerAccBtn = document.querySelector('header button[data-tab="account"], header .avatar, header #userBtn, header [class*="user" i]');
    if (headerAccBtn && headerAccBtn.parentElement) {
      let mini = document.getElementById('gnHeaderTierMini');
      if (!mini) {
        mini = document.createElement('button');
        mini.id = 'gnHeaderTierMini';
        mini.type = 'button';
        mini.onclick = (e) => { e.stopPropagation(); window.openTierSelectorModal(); };
        headerAccBtn.parentElement.insertBefore(mini, headerAccBtn.nextSibling);
      }
      mini.className = `gnTierBadge ${cur.id}`;
      mini.style.cssText = 'cursor:pointer;padding:4px 9px;font-size:11.5px;margin-left:6px;';
      mini.innerHTML = `${badgeIcon} ${badgeLabel}`;
    }
  }

  // Pop-up chọn gói Thường / VIP (50k) / SVIP (150k) chỉ hiện khi bấm vào huy hiệu
  window.openTierSelectorModal = function () {
    const cur = window.getCurrentMemberTier();
    const uKey = getUserKey();
    const pendingReq = getRequests().find(r => r.userKey === uKey && r.status === 'pending');

    let ov = document.getElementById('gnTierSelectOverlay');
    if (ov) ov.remove();

    ov = document.createElement('div');
    ov.id = 'gnTierSelectOverlay';
    ov.className = 'gnVipPayOverlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `
      <div style="background:#fff;width:100%;max-width:780px;border-radius:24px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.3);max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <h3 style="margin:0;font-size:18px;font-weight:800;">💳 Thẻ thành viên GoNow</h3>
            <div style="font-size:12.5px;color:#64748b;">Nâng cấp để tự động giảm giá mọi chuyến xe & đơn đồ ăn</div>
          </div>
          <button type="button" onclick="document.getElementById('gnTierSelectOverlay').remove()" style="border:none;background:#f1f5f9;width:32px;height:32px;border-radius:50%;font-weight:800;cursor:pointer;">✕</button>
        </div>

        ${pendingReq ? `
          <div style="background:#fef3c7;border:1.5px solid #f59e0b;border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:12.5px;color:#92400e;">
            ⏳ Đang chờ duyệt gói <b>${_esc(pendingReq.tierName)}</b> • Nội dung CK: <b>${_esc(pendingReq.memo)}</b>
          </div>
        ` : ''}

        <div class="gnTierGrid">
          <div class="gnTierCard regular">
            <div>
              <div style="font-weight:800;font-size:15px;">🥉 Member Thường</div>
              <div style="font-size:19px;font-weight:800;margin:4px 0;">Miễn phí</div>
              <ul class="gnTierList" style="color:#475569;">
                <li>✓ Đặt xe & đồ ăn tiêu chuẩn</li>
                <li>✕ Không giảm giá cước & ship</li>
              </ul>
            </div>
            <button type="button" disabled style="width:100%;padding:9px;border-radius:11px;border:1px solid #cbd5e1;background:#e2e8f0;color:#475569;font-weight:700;">
              ${cur.id === 'regular' ? '✓ Đang dùng' : 'Mặc định'}
            </button>
          </div>

          <div class="gnTierCard vip">
            <div>
              <div style="font-weight:800;font-size:15px;color:#92400e;">👑 Member VIP</div>
              <div style="font-size:20px;font-weight:800;margin:4px 0;color:#b45309;">50.000đ</div>
              <ul class="gnTierList" style="color:#78350f;">
                <li>✅ <b>Giảm 10%</b> mọi chuyến xe</li>
                <li>✅ <b>Giảm 50% phí ship</b> đồ ăn</li>
                <li>✅ <b>Giảm thêm 5%</b> tiền món</li>
              </ul>
            </div>
            <button type="button" onclick="document.getElementById('gnTierSelectOverlay').remove();openMemberQrModal('vip')" ${cur.id === 'vip' || cur.id === 'svip' ? 'disabled' : ''} style="width:100%;padding:10px;border-radius:11px;border:none;background:#f59e0b;color:#fff;font-weight:800;cursor:pointer;">
              ${cur.id === 'vip' ? '✓ Đang dùng VIP' : (cur.id === 'svip' ? 'Đã vượt cấp' : 'Đăng ký VIP • 50k')}
            </button>
          </div>

          <div class="gnTierCard svip">
            <div>
              <div style="font-weight:800;font-size:15px;color:#c7d2fe;">💎 Member SVIP</div>
              <div style="font-size:20px;font-weight:800;margin:4px 0;color:#fbbf24;">150.000đ</div>
              <ul class="gnTierList" style="color:#e2e8f0;">
                <li>🌟 <b>Full quyền lợi của VIP</b></li>
                <li>💎 <b>Giảm 20%</b> mọi chuyến xe</li>
                <li>💎 <b>Freeship 0đ</b> mọi đơn hàng</li>
                <li>💎 <b>Giảm thêm 12%</b> tiền món</li>
              </ul>
            </div>
            <button type="button" onclick="document.getElementById('gnTierSelectOverlay').remove();openMemberQrModal('svip')" ${cur.id === 'svip' ? 'disabled' : ''} style="width:100%;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-weight:800;cursor:pointer;">
              ${cur.id === 'svip' ? '✓ Đang dùng SVIP' : 'Nâng cấp SVIP • 150k'}
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
  };
  // Mở Pop-up mã QR ngân hàng của bạn kèm nội dung chuyển khoản riêng
  window.openMemberQrModal = function (tierId) {
    const tier = TIERS[tierId];
    if (!tier) return;
    const code = Math.floor(100000 + Math.random() * 900000);
    const memo = `GONOW ${tier.id.toUpperCase()} ${code}`;
    const qrUrl = `https://img.vietqr.io/image/${MY_BANK.bankId}-${MY_BANK.accountNo}-compact2.png?amount=${tier.price}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(MY_BANK.accountName)}`;

    let overlay = document.getElementById('gnVipQrOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'gnVipQrOverlay';
    overlay.className = 'gnVipPayOverlay';
    overlay.innerHTML = `
      <div class="gnVipPayModal">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:17px;">Quét QR nâng cấp ${tier.name}</strong>
          <button type="button" id="gnCloseVipQr" style="border:none;background:#f1f5f9;width:30px;height:30px;border-radius:50%;font-weight:800;cursor:pointer;">✕</button>
        </div>
        <p style="font-size:13px;color:#64748b;margin:0 0 10px;">Chuyển khoản đúng số tiền và nội dung bên dưới để được cấp thẻ:</p>

        <img src="${qrUrl}" alt="Mã QR chuyển khoản" style="width:220px;height:220px;object-fit:contain;border-radius:16px;border:1.5px solid #e2e8f0;padding:6px;background:#fff;" />

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin:12px 0;text-align:left;font-size:13px;line-height:1.6;">
          <div>🏦 Ngân hàng: <b>${_esc(MY_BANK.bankId)}</b> • STK: <b>${_esc(MY_BANK.accountNo)}</b></div>
          <div>👤 Chủ TK: <b>${_esc(MY_BANK.accountName)}</b></div>
          <div>💰 Số tiền: <strong style="color:#008a3e;font-size:15px;">${_money(tier.price)}</strong></div>
          <div>📝 Nội dung bắt buộc: <code style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-weight:800;font-size:14px;">${_esc(memo)}</code></div>
        </div>

        <button type="button" id="gnConfirmVipPaid" style="width:100%;padding:12px;border-radius:13px;border:none;background:#00b14f;color:#fff;font-weight:800;font-size:14px;cursor:pointer;">
          ✅ Tôi đã chuyển khoản đúng nội dung
        </button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('gnCloseVipQr').onclick = () => overlay.remove();
    document.getElementById('gnConfirmVipPaid').onclick = () => {
      const reqs = getRequests();
      reqs.unshift({
        id: 'REQ-' + code,
        userKey: getUserKey(),
        userName: getUserName(),
        tierId: tier.id,
        tierName: tier.name,
        amount: tier.price,
        memo: memo,
        status: 'pending',
        createdAt: new Date().toLocaleString('vi-VN')
      });
      saveRequests(reqs);
      overlay.remove();
      renderMemberSection();
      alert(`Đã gửi yêu cầu xác nhận!\nVui lòng chờ ngân hàng xác nhận đúng nội dung "${memo}" để cấp thẻ ${tier.name}.`);
    };
  };

  // Tự động áp dụng giảm giá VIP / SVIP lên đơn hàng vừa tạo
  function applyVipDiscountToNewOrders() {
    const tier = window.getCurrentMemberTier();
    if (tier.id === 'regular') return;
    try {
      const orders = JSON.parse(localStorage.getItem('gonow_orders') || '[]');
      let changed = false;
      orders.forEach(o => {
        if (!o || o.vipApplied) return;
        o.vipApplied = tier.id;
        if (o.type === 'ride' && tier.rideOff > 0) {
          o.total = Math.round(Number(o.total || 0) * (1 - tier.rideOff));
          changed = true;
        } else if (o.type === 'food' && tier.foodOff > 0) {
          o.total = Math.max(0, Math.round(Number(o.total || 0) * (1 - tier.foodOff)));
          changed = true;
        }
      });
      if (changed) localStorage.setItem('gonow_orders', JSON.stringify(orders));
    } catch {}
  }

  renderMemberSection();
  setInterval(() => {
    renderMemberSection();
    applyVipDiscountToNewOrders();
  }, 1500);
  window.addEventListener('storage', (e) => {
    if (e.key === 'gonow_member_tiers' || e.key === 'gonow_vip_requests') renderMemberSection();
    if (e.key === 'gonow_orders') applyVipDiscountToNewOrders();
  });
})();
/* ================== CHỨC NĂNG GOEXPRESS — CÓ BẢN ĐỒ LỘ TRÌNH + RESPONSIVE LAPTOP/MOBILE + BẮT BUỘC ẢNH + BÁO TÀI XẾ ================== */
(function installGoExpressDelivery() {
  const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _money = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';

  if (!document.getElementById('gnExpressResponsiveCSS')) {
    const st = document.createElement('style');
    st.id = 'gnExpressResponsiveCSS';
    st.textContent = `
      #gnExpressApp {
        position: fixed; inset: 0; z-index: 9990;
        background: rgba(15, 23, 42, 0.58);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        font-family: inherit;
      }
      #gnExpressApp[hidden] { display: none !important; }
      .gexShell {
        width: 100%; max-width: 1120px; height: 92vh; max-height: 820px;
        background: #f8fafc; border-radius: 24px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.28);
        display: flex; flex-direction: column; overflow: hidden;
        position: relative;
      }
      .gexTopHeader {
        background: linear-gradient(135deg, #00b14f 0%, #008a3e 100%);
        color: #fff; padding: 14px 24px;
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0;
      }
      .gexIconBtn {
        width: 38px; height: 38px; border-radius: 50%; border: none;
        background: rgba(255,255,255,0.2); color: #fff;
        font-size: 18px; font-weight: 800; cursor: pointer;
        display: grid; place-items: center; transition: .15s;
      }
      .gexIconBtn:hover { background: rgba(255,255,255,0.32); }
      .gexIconBtn.dark { background: #f1f5f9; color: #0f172a; }
      .gexIconBtn.dark:hover { background: #e2e8f0; }

      .gexBodyGrid {
        flex: 1; overflow-y: auto; padding: 18px 24px;
        display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 20px;
        align-items: start;
      }
      @media (max-width: 860px) {
        #gnExpressApp { padding: 0; }
        .gexShell { max-width: 100%; height: 100vh; max-height: 100vh; border-radius: 0; }
        .gexBodyGrid { grid-template-columns: 1fr; padding: 14px 16px 90px; gap: 14px; }
      }

      .gexCard {
        background: #fff; border-radius: 18px; padding: 16px 18px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
      }
      .gexSecTitle {
        margin: 0 0 12px; font-size: 15px; font-weight: 800; color: #0f172a;
        display: flex; align-items: center; justify-content: space-between;
      }

      /* Khung Bản đồ lộ trình tương tác */
      .gexMapBox {
        position: relative; width: 100%; height: 195px; border-radius: 16px;
        overflow: hidden; border: 1px solid #cbd5e1; margin-bottom: 14px;
        background: #e9f2ec;
      }
      .gexMapBadge {
        position: absolute; top: 10px; left: 10px; right: 10px;
        display: flex; justify-content: space-between; align-items: center;
        pointer-events: none; gap: 8px;
      }
      .gexMapPill {
        background: rgba(255, 255, 255, 0.94); backdrop-filter: blur(4px);
        padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 800;
        color: #0f172a; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        border: 1px solid #e2e8f0;
      }

      /* Lộ trình nhận - giao */
      .gexRouteBox { display: flex; gap: 12px; align-items: stretch; }
      .gexDots { display: flex; flex-direction: column; align-items: center; padding: 12px 0; }
      .gexDotBlue { width: 12px; height: 12px; border-radius: 50%; background: #2563eb; box-shadow: 0 0 0 4px #dbeafe; }
      .gexDotLine { flex: 1; width: 2px; background: repeating-linear-gradient(to bottom, #cbd5e1 0 4px, transparent 4px 8px); margin: 4px 0; }
      .gexDotRed { width: 12px; height: 12px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 4px #fee2e2; }
      .gexAddrSlot {
        flex: 1; padding: 10px 14px; border-radius: 14px; background: #f8fafc;
        border: 1.5px solid #e2e8f0; cursor: pointer; transition: .15s;
      }
      .gexAddrSlot:hover { border-color: #00b14f; background: #f0fdf4; }
      .gexSwapBtn {
        align-self: center; width: 38px; height: 38px; border-radius: 12px;
        border: 1px solid #e2e8f0; background: #fff; font-size: 16px;
        cursor: pointer; flex-shrink: 0;
      }
      .gexSwapBtn:hover { background: #f1f5f9; }

      .gexChipRow { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .gexChip {
        padding: 6px 12px; border-radius: 999px; border: 1px solid #cbd5e1;
        background: #fff; font-size: 12.5px; font-weight: 600; color: #334155;
        cursor: pointer; transition: .15s;
      }
      .gexChip:hover { border-color: #00b14f; color: #008a3e; background: #ecfdf5; }

      .gexSvcGrid { display: grid; grid-template-columns: 1fr; gap: 10px; }
      .gexSvcItem {
        display: flex; align-items: center; gap: 12px; padding: 11px 14px;
        border-radius: 14px; border: 1.5px solid #e2e8f0; cursor: pointer;
        transition: .15s; background: #fff;
      }
      .gexSvcItem:hover { border-color: #86efac; }
      .gexSvcItem.active { border-color: #00b14f; background: #f0fdf4; }
      .gexSvcIco {
        width: 42px; height: 42px; border-radius: 12px; background: #e6f9ee;
        display: grid; place-items: center; font-size: 22px; flex-shrink: 0;
      }

      /* Khung chụp/tải ảnh bắt buộc */
      .gexPhotoDrop {
        border: 2px dashed #94a3b8; border-radius: 16px; padding: 14px;
        text-align: center; background: #f8fafc; cursor: pointer;
        transition: .15s; position: relative;
      }
      .gexPhotoDrop:hover { border-color: #00b14f; background: #f0fdf4; }
      .gexPhotoDrop.hasImg { border-style: solid; border-color: #00b14f; background: #ecfdf5; }
      .gexPhotoDrop.missingErr { border-color: #ef4444; background: #fef2f2; animation: gexShake .35s ease; }
      .gexPhotoPreview {
        width: 100%; max-height: 155px; object-fit: cover;
        border-radius: 12px; display: block; margin: 0 auto 8px;
      }

      .gexInput, .gexSelect {
        width: 100%; padding: 10px 12px; border-radius: 11px;
        border: 1.5px solid #cbd5e1; font-size: 13.5px; outline: none;
        box-sizing: border-box; background: #fff;
      }
      .gexInput:focus, .gexSelect:focus { border-color: #00b14f; }
      .gexPrimaryBtn {
        width: 100%; padding: 14px 20px; border-radius: 14px; border: none;
        background: linear-gradient(135deg, #00b14f, #009440); color: #fff;
        font-size: 15px; font-weight: 800; cursor: pointer;
        box-shadow: 0 8px 20px rgba(0, 177, 79, 0.28); transition: .15s;
      }
      .gexPrimaryBtn:hover { filter: brightness(1.04); transform: translateY(-1px); }

      .gexSubModal {
        position: absolute; inset: 0; z-index: 30; background: #fff;
        display: flex; flex-direction: column; overflow-y: auto;
      }

      .gexSuccessOverlay {
        position: fixed; inset: 0; z-index: 10050;
        background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px);
        display: grid; place-items: center; padding: 16px;
        animation: gexFadeIn .22s ease;
      }
      .gexSuccessCard {
        background: #fff; width: 100%; max-width: 430px; border-radius: 26px;
        padding: 28px 24px 22px; text-align: center;
        box-shadow: 0 25px 60px rgba(0,0,0,.3);
        animation: gexPopScale .32s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .gexCheckWrap {
        width: 84px; height: 84px; margin: 0 auto 14px; position: relative;
        display: grid; place-items: center;
      }
      .gexRadarRing {
        position: absolute; inset: 0; border-radius: 50%;
        border: 3px solid #00b14f;
        animation: gexRadar 1.5s infinite ease-out;
      }
      .gexCheckCircle {
        width: 66px; height: 66px; border-radius: 50%;
        background: linear-gradient(135deg, #00c853, #009624); color: #fff;
        display: grid; place-items: center;
        box-shadow: 0 10px 24px rgba(0, 177, 79, 0.4);
      }
      .gexCheckSvg path {
        stroke-dasharray: 30; stroke-dashoffset: 30;
        animation: gexDrawTick .45s .15s forwards ease-out;
      }
      .gexDriverPingBadge {
        display: inline-flex; align-items: center; gap: 8px;
        background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;
        padding: 7px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 700;
        margin: 12px 0 14px;
      }
      .gexPingDot {
        width: 9px; height: 9px; border-radius: 50%; background: #00b14f;
        box-shadow: 0 0 0 0 rgba(0,177,79,0.7);
        animation: gexPulse 1.3s infinite;
      }

      @keyframes gexFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes gexPopScale { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: scale(1); } }
      @keyframes gexRadar { 0% { transform: scale(.8); opacity: .9; } 100% { transform: scale(1.45); opacity: 0; } }
      @keyframes gexDrawTick { to { stroke-dashoffset: 0; } }
      @keyframes gexPulse { 0% { box-shadow: 0 0 0 0 rgba(0,177,79,.7); } 70% { box-shadow: 0 0 0 8px rgba(0,177,79,0); } 100% { box-shadow: 0 0 0 0 rgba(0,177,79,0); } }
      @keyframes gexShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
    `;
    document.head.appendChild(st);
  }

  const PRESET_PLACES = [
    { name: "86 Đường số 27, Quận 7", full: "86 Đường số 27, P. Tân Phong, Quận 7, TP.HCM", x: 310, y: 145, km: 0 },
    { name: "Sân Bay Tân Sơn Nhất (T2)", full: "Ga Quốc Tế - Nhà Ga 2, Trường Sơn, Tân Bình, TP.HCM", x: 165, y: 42, km: 13.4 },
    { name: "Vinhomes Central Park", full: "208 Nguyễn Hữu Cảnh, Bình Thạnh, TP.HCM", x: 365, y: 72, km: 7.8 },
    { name: "Chợ Bến Thành, Quận 1", full: "Lê Lợi, P. Bến Thành, Quận 1, TP.HCM", x: 285, y: 92, km: 5.2 },
    { name: "AEON Mall Tân Phú", full: "30 Bờ Bao Tân Thắng, Sơn Kỳ, Tân Phú, TP.HCM", x: 110, y: 78, km: 15.6 }
  ];

  const SERVICES = [
    { id: "priority", name: "Siêu Tốc (Ưu Tiên)", desc: "Tài xế lấy hàng ngay, giao thẳng 1 điểm", base: 38000, icon: "⚡", speedMin: 22 },
    { id: "fast",     name: "Giao Nhanh 1H",      desc: "Lấy hàng trong 15 phút, giao nội thành", base: 25000, icon: "📦", speedMin: 35 },
    { id: "saver",    name: "Tiết Kiệm",          desc: "Ghép tuyến tối ưu chi phí, giao trong ngày", base: 18000, icon: "🏷️", speedMin: 55 },
    { id: "van",      name: "Xe Tải Van 500kg",   desc: "Hàng cồng kềnh, máy móc, chuyển đồ", base: 115000, icon: "🚐", speedMin: 40 }
  ];

  const ADDONS = [
    { id: "cod",    name: "Thu tiền hộ (COD)", price: 5000 },
    { id: "door",   name: "Giao tận tay lên lầu/chung cư", price: 10000 },
    { id: "fragile",name: "Bảo hiểm hàng dễ vỡ / giá trị cao", price: 8000 }
  ];

  function getActiveUser() {
    for (const k of ['gonow_user', 'gn_user', 'currentUser']) {
      try {
        const u = JSON.parse(localStorage.getItem(k) || 'null');
        if (u && (u.name || u.email || u.uid)) return u;
      } catch {}
    }
    return null;
  }

  function injectExpressShortcut() {
    const headerPills = Array.from(document.querySelectorAll('header button, header a, .topTabs button, .navSwitch button'))
      .filter(el => /^(Đồ ăn|Đặt xe|Giao hàng)$/i.test(el.textContent.trim()));

    if (headerPills.length >= 2) {
      let expTab = document.getElementById('gnHeaderExpressTab');
      if (headerPills.length >= 3) {
        expTab = headerPills[2];
        expTab.id = 'gnHeaderExpressTab';
      } else if (!expTab) {
        const rideTab = headerPills[1];
        expTab = rideTab.cloneNode(true);
        expTab.id = 'gnHeaderExpressTab';
        rideTab.parentElement.appendChild(expTab);
      }

      expTab.textContent = 'Giao hàng';
      expTab.removeAttribute('data-tab');
      expTab.onclick = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        headerPills.forEach(p => p.classList.remove('active', 'is-active'));
        expTab.classList.add('active', 'is-active');
        openExpressPage();
      };

      headerPills.slice(0, 2).forEach(p => {
        if (!p.dataset.gnBoundExp) {
          p.dataset.gnBoundExp = '1';
          p.addEventListener('click', () => expTab.classList.remove('active', 'is-active'));
        }
      });
    }

    if (!document.getElementById('gnQuickExpressBtn')) {
      const catItems = Array.from(document.querySelectorAll('button, a, div[role="button"], .quickItem, .catItem'))
        .filter(el => el.children.length >= 1 && el.children.length <= 3 && /^Ô tô 7 chỗ$/i.test(el.textContent.trim()));

      const targetAnchor = catItems[0];
      if (targetAnchor && targetAnchor.parentElement) {
        const btn = targetAnchor.cloneNode(true);
        btn.id = 'gnQuickExpressBtn';
        btn.removeAttribute('data-service');
        btn.removeAttribute('data-tab');

        const iconBox = btn.firstElementChild;
        if (iconBox) {
          iconBox.innerHTML = `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M18 6l11 6v12l-11 6-11-6V12l11-6z" fill="#00B14F"/><path d="M7 12l11 6 11-6M18 18v12" stroke="#E6F7EE" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
          iconBox.style.display = 'grid';
          iconBox.style.placeItems = 'center';
        }
        const textNode = Array.from(btn.querySelectorAll('*')).reverse().find(el => el.children.length === 0 && el.textContent.trim().length > 0);
        if (textNode) textNode.textContent = 'Giao hàng';

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          openExpressPage();
        };

        targetAnchor.parentElement.insertBefore(btn, targetAnchor.nextSibling);
      }
    }
  }

  // Tính tọa độ & khoảng cách cho khung bản đồ
  function getRouteMetrics(pickup, dropoff, svc) {
    const pMatch = PRESET_PLACES.find(p => pickup.addr.includes(p.name)) || PRESET_PLACES[0];
    if (!dropoff || !dropoff.addr) {
      return { x1: pMatch.x, y1: pMatch.y, x2: null, y2: null, km: 0, mins: 0 };
    }
    const dMatch = PRESET_PLACES.find(p => dropoff.addr.includes(p.name));
    let x2 = 175, y2 = 58, km = 6.4;
    if (dMatch) {
      x2 = dMatch.x;
      y2 = dMatch.y;
      km = Math.max(1.8, Math.abs(dMatch.km - pMatch.km) || 5.2);
    } else {
      // Tạo tọa độ ổn định dựa trên tên địa chỉ tự nhập
      let hash = 0;
      for (let i = 0; i < dropoff.addr.length; i++) hash = (hash * 31 + dropoff.addr.charCodeAt(i)) % 1000;
      x2 = 95 + (hash % 310);
      y2 = 38 + ((hash * 7) % 120);
      km = Number((2.5 + (hash % 95) / 10).toFixed(1));
    }
    const mins = Math.max(12, Math.round(km * 3.2 + (svc.speedMin * 0.35)));
    return { x1: pMatch.x, y1: pMatch.y, x2, y2, km, mins };
  }

  function renderRouteMapSVG(pickup, dropoff, metrics) {
    const hasDest = metrics.x2 !== null;
    const cx = hasDest ? Math.round((metrics.x1 + metrics.x2) / 2) : metrics.x1;
    const cy = hasDest ? Math.max(24, Math.min(metrics.y1, metrics.y2) - 28) : metrics.y1;

    return `
      <div class="gexMapBox">
        <svg viewBox="0 0 500 195" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="display:block;">
          <!-- Nền bản đồ khu vực TP.HCM -->
          <rect width="500" height="195" fill="#eef5f0"/>
          <!-- Sông Sài Gòn -->
          <path d="M 335 0 C 315 55, 390 80, 360 125 C 335 160, 410 175, 430 195" fill="none" stroke="#bae6fd" stroke-width="18" stroke-linecap="round"/>
          <!-- Mảng xanh công viên -->
          <ellipse cx="265" cy="82" rx="22" ry="13" fill="#bbf7d0" opacity="0.85"/>
          <ellipse cx="145" cy="52" rx="26" ry="14" fill="#bbf7d0" opacity="0.7"/>
          <!-- Mạng lưới đường giao thông -->
          <g stroke="#ffffff" stroke-width="5" fill="none" opacity="0.92">
            <path d="M 0 45 L 500 95"/>
            <path d="M 0 135 L 500 155"/>
            <path d="M 90 0 L 150 195"/>
            <path d="M 250 0 L 315 195"/>
            <path d="M 165 42 L 285 92 L 310 145"/>
            <path d="M 110 78 L 285 92 L 365 72"/>
          </g>
          <g stroke="#cbd5e1" stroke-width="1.2" fill="none" stroke-dasharray="4 4">
            <path d="M 30 95 L 470 50"/>
            <path d="M 200 10 L 210 190"/>
          </g>

          ${hasDest ? `
            <!-- Tuyến đường giao hàng -->
            <path d="M ${metrics.x1} ${metrics.y1} Q ${cx} ${cy} ${metrics.x2} ${metrics.y2}"
                  fill="none" stroke="#00b14f" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="8 6"/>
            <!-- Điểm giao hàng (Đỏ) -->
            <circle cx="${metrics.x2}" cy="${metrics.y2}" r="14" fill="#ef4444" opacity="0.22"/>
            <circle cx="${metrics.x2}" cy="${metrics.y2}" r="7" fill="#ef4444" stroke="#fff" stroke-width="2.5"/>
            <g transform="translate(${Math.min(355, Math.max(12, metrics.x2 - 55))}, ${Math.max(32, metrics.y2 - 28)})">
              <rect width="122" height="22" rx="6" fill="#0f172a" opacity="0.88"/>
              <text x="61" y="14.5" fill="#fff" font-size="10.5" font-weight="700" text-anchor="middle">🏁 Giao: ${_esc(dropoff.addr.slice(0, 16))}</text>
            </g>
          ` : ''}

          <!-- Điểm lấy hàng (Xanh dương) -->
          <circle cx="${metrics.x1}" cy="${metrics.y1}" r="15" fill="#2563eb" opacity="0.22"/>
          <circle cx="${metrics.x1}" cy="${metrics.y1}" r="7.5" fill="#2563eb" stroke="#fff" stroke-width="2.5"/>
          <g transform="translate(${Math.min(355, Math.max(12, metrics.x1 - 55))}, ${Math.min(168, metrics.y1 + 12)})">
            <rect width="122" height="22" rx="6" fill="#1d4ed8" opacity="0.92"/>
            <text x="61" y="14.5" fill="#fff" font-size="10.5" font-weight="700" text-anchor="middle">📦 Lấy: ${_esc(pickup.addr.slice(0, 16))}</text>
          </g>
        </svg>

        <div class="gexMapBadge">
          <span class="gexMapPill">🗺️ Bản đồ lộ trình TP.HCM</span>
          <span class="gexMapPill" style="color:#008a3e;">
            ${hasDest ? `📏 ~${metrics.km} km • ⏱️ Dự kiến ${metrics.mins} phút` : 'Chọn điểm giao để xem tuyến đường'}
          </span>
        </div>
      </div>
    `;
  }

  window.openExpressPage = function () {
    const curUser = getActiveUser();
    const state = {
      pickup: {
        addr: PRESET_PLACES[0].name,
        full: PRESET_PLACES[0].full,
        name: (curUser && (curUser.name || curUser.displayName)) || 'Khách hàng GoNow',
        phone: (curUser && curUser.phone) || '0343758848',
        note: ''
      },
      dropoff: null,
      serviceId: 'priority',
      pkg: {
        category: 'Thực phẩm / Đồ ăn',
        weight: 1.5,
        note: '',
        photo: ''
      },
      addons: new Set(),
      promoDiscount: 5000
    };

    let root = document.getElementById('gnExpressApp');
    if (!root) {
      root = document.createElement('div');
      root.id = 'gnExpressApp';
      document.body.appendChild(root);
    }
    root.hidden = false;

    function calcTotal() {
      const svc = SERVICES.find(s => s.id === state.serviceId) || SERVICES[0];
      const extraKg = Math.max(0, (Number(state.pkg.weight) || 1) - 3);
      const kgFee = Math.round(extraKg * 2500);
      let addonSum = 0;
      state.addons.forEach(id => {
        const a = ADDONS.find(x => x.id === id);
        if (a) addonSum += a.price;
      });
      const raw = svc.base + kgFee + addonSum;
      return { raw, kgFee, addonSum, final: Math.max(0, raw - state.promoDiscount) };
    }

    function dispatchExpressOrder(svc, finalPrice) {
      const u = getActiveUser();
      const uid = (typeof myUid === 'function' && myUid()) || (u && (u.uid || u.email)) || '';
      const orderId = 'EXP-' + Math.floor(100000 + Math.random() * 900000);
      const now = Date.now();
      const pickupText = `${state.pickup.addr} (${state.pickup.name} - ${state.pickup.phone})`;
      const dropoffText = `${state.dropoff.addr} (${state.dropoff.name} - ${state.dropoff.phone})`;

      const newOrder = {
        id: orderId,
        uid: uid,
        type: 'ride',
        subType: 'express',
        service: `GoNow Express • ${svc.name}`,
        serviceName: `GoNow Express • ${svc.name}`,
        title: `Giao hàng ${svc.name}: ${state.pickup.addr} → ${state.dropoff.addr}`,
        from: pickupText,
        to: dropoffText,
        detail: [
          `${state.pickup.addr} → ${state.dropoff.addr}`,
          `📦 ${svc.name} • ${state.pkg.category} (${state.pkg.weight}kg)${state.pkg.note ? ' • ' + state.pkg.note : ''}`
        ],
        customer: `Gửi: ${state.pickup.name} (${state.pickup.phone}) → Nhận: ${state.dropoff.name} (${state.dropoff.phone})`,
        pickupInfo: state.pickup,
        dropoffInfo: state.dropoff,
        packageInfo: { ...state.pkg },
        packagePhoto: state.pkg.photo,
        total: finalPrice,
        price: finalPrice,
        pay: state.addons.has('cod') ? `Thu hộ COD + Cước ${_money(finalPrice)}` : `Tiền mặt (${_money(finalPrice)})`,
        status: 0,
        statusText: 'Đang tìm tài xế nhận đơn',
        cancelled: false,
        createdAt: new Date(now).toLocaleString('vi-VN'),
        ts: now,
        upd: now
      };

      ['gonow_orders', 'gn_orders', 'orders'].forEach(key => {
        try {
          const arr = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(arr)) {
            arr.unshift(newOrder);
            localStorage.setItem(key, JSON.stringify(arr));
          }
        } catch {}
      });

      if (typeof orders !== 'undefined' && Array.isArray(orders)) {
        orders.unshift(newOrder);
      }

      try {
        const driverQueue = JSON.parse(localStorage.getItem('gn_driver_requests') || '[]');
        driverQueue.unshift({
          ...newOrder,
          broadcastMessage: `📦 CUỐC GIAO HÀNG MỚI (${_money(finalPrice)}) | Nhận tại: ${state.pickup.addr} → Giao đến: ${state.dropoff.addr}`,
          pickupAddress: state.pickup.addr,
          dropoffAddress: state.dropoff.addr,
          acceptedBy: null
        });
        localStorage.setItem('gn_driver_requests', JSON.stringify(driverQueue));
      } catch {}

      try {
        const bc = new BroadcastChannel('gonow_driver_channel');
        bc.postMessage({
          type: 'NEW_EXPRESS_ORDER',
          order: newOrder,
          alertText: `Có đơn giao hàng mới!\n• Điểm nhận hàng: ${state.pickup.addr}\n• Điểm giao hàng: ${state.dropoff.addr}\n• Cước phí: ${_money(finalPrice)}`
        });
      } catch {}

      if (typeof window.renderOrders === 'function') { try { window.renderOrders(); } catch {} }
      if (typeof window.renderAccount === 'function') { try { window.renderAccount(); } catch {} }

      return newOrder;
    }

    function showSuccessPopup(order, svc) {
      const overlay = document.createElement('div');
      overlay.className = 'gexSuccessOverlay';
      overlay.innerHTML = `
        <div class="gexSuccessCard" role="dialog" aria-modal="true">
          <div class="gexCheckWrap">
            <div class="gexRadarRing"></div>
            <div class="gexCheckCircle">
              <svg class="gexCheckSvg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          </div>

          <div style="font-size:12px;font-weight:800;color:#008a3e;letter-spacing:.5px;margin-bottom:4px;">MÃ ĐƠN #${_esc(order.id)}</div>
          <h3 style="margin:0 0 6px;font-size:21px;font-weight:800;color:#0f172a;">Đặt giao hàng thành công!</h3>
          <p style="margin:0;font-size:13.5px;color:#475569;">Gói dịch vụ <b>${_esc(svc.name)}</b> • Tổng cước <b>${_money(order.total)}</b></p>

          <div class="gexDriverPingBadge">
            <span class="gexPingDot"></span>
            <span>Đã phát thông báo mời nhận cuốc tới tất cả tài xế</span>
          </div>

          <div style="background:#f8fafc;border-radius:14px;padding:12px 14px;text-align:left;font-size:13px;margin-bottom:18px;border:1px solid #e2e8f0;line-height:1.5;">
            <div style="margin-bottom:6px;"><b style="color:#2563eb;">● Điểm nhận hàng:</b> ${_esc(order.from)}</div>
            <div><b style="color:#ef4444;">● Điểm giao hàng:</b> ${_esc(order.to)}</div>
          </div>

          <div style="display:flex;gap:10px;">
            <button type="button" id="gexDoneClose" style="flex:1;height:44px;border-radius:12px;border:1.5px solid #cbd5e1;background:#fff;font-weight:700;cursor:pointer;">Về trang chủ</button>
            <button type="button" id="gexGoActivity" style="flex:1.3;height:44px;border-radius:12px;border:none;background:#00b14f;color:#fff;font-weight:800;cursor:pointer;">Xem Hoạt động</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#gexDoneClose').onclick = () => {
        overlay.remove();
        root.hidden = true;
      };
      overlay.querySelector('#gexGoActivity').onclick = () => {
        overlay.remove();
        root.hidden = true;
        const ordTab = document.querySelector('[data-tab="orders"]');
        if (ordTab) ordTab.click();
      };
    }

    function render() {
      const svc = SERVICES.find(s => s.id === state.serviceId) || SERVICES[0];
      const { raw, kgFee, final } = calcTotal();
      const metrics = getRouteMetrics(state.pickup, state.dropoff, svc);
      const hasDropoff = Boolean(state.dropoff && state.dropoff.addr && state.dropoff.name && state.dropoff.phone);
      const hasPhoto = Boolean(state.pkg.photo);

      root.innerHTML = `
        <div class="gexShell">
          <div class="gexTopHeader">
            <div style="display:flex;align-items:center;gap:12px;">
              <button type="button" class="gexIconBtn" id="gexCloseBtn" title="Đóng">←</button>
              <div>
                <div style="font-size:17px;font-weight:800;">📦 GoNow Express — Giao hàng siêu tốc</div>
                <div style="font-size:12.5px;opacity:.9;">Lấy hàng tận nơi • Chụp ảnh đối chiếu • Kết nối tài xế tức thì</div>
              </div>
            </div>
            <button type="button" id="gexViewActBtn" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:700;cursor:pointer;">
              📋 Hoạt động giao hàng
            </button>
          </div>

          <div class="gexBodyGrid">
            <!-- CỘT TRÁI: BẢN ĐỒ LỘ TRÌNH + ĐIỂM NHẬN/GIAO + CHI TIẾT ĐƠN & CHỤP ẢNH -->
            <div style="display:flex;flex-direction:column;gap:16px;">
              <div class="gexCard">
                <h3 class="gexSecTitle">🗺️ Bản đồ & Điểm nhận / giao hàng</h3>

                <!-- KHUNG BẢN ĐỒ TRỰC QUAN -->
                ${renderRouteMapSVG(state.pickup, state.dropoff, metrics)}

                <div class="gexRouteBox">
                  <div class="gexDots">
                    <span class="gexDotBlue"></span>
                    <span class="gexDotLine"></span>
                    <span class="gexDotRed"></span>
                  </div>
                  <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
                    <div class="gexAddrSlot" id="gexPickSlot">
                      <div style="font-size:11.5px;font-weight:700;color:#2563eb;">ĐIỂM NHẬN HÀNG (NGƯỜI GỬI)</div>
                      <div style="font-weight:800;font-size:14px;color:#0f172a;margin:2px 0;">${_esc(state.pickup.addr)}</div>
                      <div style="font-size:12.5px;color:#475569;">${_esc(state.pickup.name)} • ${_esc(state.pickup.phone)}</div>
                    </div>

                    <div class="gexAddrSlot" id="gexDropSlot" style="${!hasDropoff ? 'border-color:#f59e0b;background:#fffbeb;' : ''}">
                      <div style="font-size:11.5px;font-weight:700;color:#ef4444;">ĐIỂM GIAO HÀNG (NGƯỜI NHẬN) *</div>
                      ${hasDropoff
                        ? `<div style="font-weight:800;font-size:14px;color:#0f172a;margin:2px 0;">${_esc(state.dropoff.addr)}</div>
                           <div style="font-size:12.5px;color:#475569;">${_esc(state.dropoff.name)} • ${_esc(state.dropoff.phone)}</div>`
                        : `<div style="font-weight:700;font-size:13.5px;color:#b45309;margin-top:2px;">+ Bấm để nhập địa chỉ & SĐT người nhận</div>`}
                    </div>
                  </div>
                  <button type="button" class="gexSwapBtn" id="gexSwapBtn" title="Đổi chiều nhận/giao">⇅</button>
                </div>

                <div class="gexChipRow">
                  <span style="font-size:12px;color:#64748b;align-self:center;">Giao nhanh đến:</span>
                  ${PRESET_PLACES.slice(1).map((p, idx) => `
                    <button type="button" class="gexChip" data-preset="${idx + 1}">${_esc(p.name)}</button>
                  `).join('')}
                </div>
              </div>

              <!-- CHI TIẾT ĐƠN HÀNG & BẮT BUỘC CHỤP ẢNH -->
              <div class="gexCard">
                <h3 class="gexSecTitle">
                  <span>📦 Chi tiết đơn hàng giao</span>
                  <span style="font-size:12px;color:${hasPhoto ? '#008a3e' : '#dc2626'};font-weight:700;">
                    ${hasPhoto ? '✓ Đã có ảnh kiện hàng' : '* Bắt buộc chọn ảnh'}
                  </span>
                </h3>

                <input type="file" id="gexPhotoInput" accept="image/*" capture="environment" hidden>
                <div class="gexPhotoDrop ${hasPhoto ? 'hasImg' : ''}" id="gexPhotoDrop">
                  ${hasPhoto
                    ? `<img src="${state.pkg.photo}" class="gexPhotoPreview" alt="Ảnh đơn hàng cần giao">
                       <div style="font-size:13px;font-weight:800;color:#008a3e;">📷 Đã đính kèm ảnh đơn hàng (Bấm để đổi ảnh khác)</div>`
                    : `<div style="font-size:30px;margin-bottom:4px;">📸</div>
                       <div style="font-size:14px;font-weight:800;color:#0f172a;">Chụp ảnh hoặc tải ảnh đơn hàng cần giao *</div>
                       <div style="font-size:12.5px;color:#64748b;margin-top:3px;">Bắt buộc có ảnh để tài xế đối chiếu khi nhận & giao hàng</div>`}
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">
                  <div>
                    <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">Loại hàng hóa</label>
                    <select class="gexSelect" id="gexPkgCat">
                      ${['Thực phẩm / Đồ ăn', 'Quần áo / Thời trang', 'Tài liệu / Hồ sơ', 'Đồ điện tử', 'Hàng dễ vỡ'].map(c =>
                        `<option value="${c}" ${state.pkg.category === c ? 'selected' : ''}>${c}</option>`
                      ).join('')}
                    </select>
                  </div>
                  <div>
                    <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">Khối lượng ước tính (kg)</label>
                    <input type="number" class="gexInput" id="gexPkgWeight" min="0.5" max="500" step="0.5" value="${state.pkg.weight}">
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">Ghi chú cho tài xế</label>
                  <input type="text" class="gexInput" id="gexPkgNote" value="${_esc(state.pkg.note)}" placeholder="VD: Gọi trước khi đến, hàng dễ vỡ xin nhẹ tay...">
                </div>
              </div>
            </div>

            <!-- CỘT PHẢI: CHỌN GÓI GIAO + DỊCH VỤ BỔ SUNG + TỔNG TIỀN -->
            <div style="display:flex;flex-direction:column;gap:16px;">
              <div class="gexCard">
                <h3 class="gexSecTitle">🚚 Chọn gói giao hàng</h3>
                <div class="gexSvcGrid">
                  ${SERVICES.map(s => `
                    <div class="gexSvcItem ${state.serviceId === s.id ? 'active' : ''}" data-svc="${s.id}">
                      <div class="gexSvcIco">${s.icon}</div>
                      <div style="flex:1;">
                        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;color:#0f172a;">
                          <span>${_esc(s.name)}</span>
                          <span style="color:#008a3e;">${_money(s.base)}</span>
                        </div>
                        <div style="font-size:12px;color:#64748b;margin-top:2px;">${_esc(s.desc)}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="gexCard">
                <h3 class="gexSecTitle">✨ Dịch vụ bổ sung</h3>
                <div style="display:flex;flex-direction:column;gap:10px;">
                  ${ADDONS.map(a => `
                    <label style="display:flex;align-items:center;gap:10px;font-size:13.5px;cursor:pointer;">
                      <input type="checkbox" data-addon="${a.id}" ${state.addons.has(a.id) ? 'checked' : ''} style="width:17px;height:17px;accent-color:#00b14f;">
                      <span style="flex:1;color:#1e293b;font-weight:600;">${_esc(a.name)}</span>
                      <b style="color:#475569;">+${_money(a.price)}</b>
                    </label>
                  `).join('')}
                </div>
              </div>

              <div class="gexCard" style="background:#f0fdf4;border-color:#bbf7d0;">
                <div style="display:flex;justify-content:space-between;font-size:13px;color:#334155;margin-bottom:6px;">
                  <span>Cước cơ bản (${_esc(svc.name)})</span>
                  <b>${_money(svc.base)}</b>
                </div>
                ${kgFee > 0 ? `
                  <div style="display:flex;justify-content:space-between;font-size:13px;color:#334155;margin-bottom:6px;">
                    <span>Phụ phí khối lượng (${state.pkg.weight}kg)</span>
                    <b>+${_money(kgFee)}</b>
                  </div>
                ` : ''}
                <div style="display:flex;justify-content:space-between;font-size:13px;color:#008a3e;margin-bottom:10px;">
                  <span>Ưu đãi GoNow Express</span>
                  <b>-${_money(state.promoDiscount)}</b>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px dashed #86efac;margin-bottom:14px;">
                  <span style="font-weight:800;font-size:15px;color:#0f172a;">Tổng thanh toán</span>
                  <div>
                    <del style="font-size:12.5px;color:#64748b;margin-right:6px;">${_money(raw)}</del>
                    <strong style="font-size:21px;color:#008a3e;">${_money(final)}</strong>
                  </div>
                </div>

                <button type="button" class="gexPrimaryBtn" id="gexSubmitOrder">
                  📦 Đặt giao hàng ngay • ${_money(final)}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      const shell = root.querySelector('.gexShell');

      shell.querySelector('#gexCloseBtn').onclick = () => (root.hidden = true);
      shell.querySelector('#gexViewActBtn').onclick = () => {
        root.hidden = true;
        const ordTab = document.querySelector('[data-tab="orders"]');
        if (ordTab) ordTab.click();
      };

      shell.querySelector('#gexPickSlot').onclick = () => openAddressModal('pickup');
      shell.querySelector('#gexDropSlot').onclick = () => openAddressModal('dropoff');
      shell.querySelector('#gexSwapBtn').onclick = () => {
        if (!state.dropoff) return openAddressModal('dropoff');
        [state.pickup, state.dropoff] = [state.dropoff, state.pickup];
        render();
      };

      shell.querySelectorAll('[data-preset]').forEach(btn => {
        btn.onclick = () => {
          const p = PRESET_PLACES[Number(btn.dataset.preset)];
          state.dropoff = {
            addr: p.name,
            full: p.full,
            name: (state.dropoff && state.dropoff.name) || 'Người nhận hàng',
            phone: (state.dropoff && state.dropoff.phone) || '',
            note: ''
          };
          openAddressModal('dropoff');
        };
      });

      const photoInput = shell.querySelector('#gexPhotoInput');
      const photoDrop = shell.querySelector('#gexPhotoDrop');
      photoDrop.onclick = () => photoInput.click();
      photoInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxW = 640;
            const scale = Math.min(1, maxW / img.width);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            state.pkg.photo = canvas.toDataURL('image/jpeg', 0.78);
            render();
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      };

      shell.querySelector('#gexPkgCat').onchange = (e) => { state.pkg.category = e.target.value; };
      shell.querySelector('#gexPkgWeight').oninput = (e) => {
        state.pkg.weight = Math.max(0.5, parseFloat(e.target.value) || 1);
        render();
      };
      shell.querySelector('#gexPkgNote').oninput = (e) => { state.pkg.note = e.target.value; };

      shell.querySelectorAll('[data-svc]').forEach(el => {
        el.onclick = () => { state.serviceId = el.dataset.svc; render(); };
      });
      shell.querySelectorAll('[data-addon]').forEach(cb => {
        cb.onchange = () => {
          if (cb.checked) state.addons.add(cb.dataset.addon);
          else state.addons.delete(cb.dataset.addon);
          render();
        };
      });

      shell.querySelector('#gexSubmitOrder').onclick = () => {
        if (!hasDropoff) {
          if (typeof toast === 'function') toast('Vui lòng nhập đầy đủ địa chỉ và SĐT người nhận!');
          openAddressModal('dropoff');
          return;
        }
        if (!state.pkg.photo) {
          photoDrop.classList.add('missingErr');
          photoDrop.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof toast === 'function') toast('Bắt buộc chụp hoặc chọn ảnh đơn hàng cần giao!');
          setTimeout(() => photoDrop.classList.remove('missingErr'), 700);
          return;
        }

        const order = dispatchExpressOrder(svc, final);
        showSuccessPopup(order, svc);
      };
    }

    function openAddressModal(which) {
      const shell = root.querySelector('.gexShell');
      const isPick = which === 'pickup';
      const cur = isPick
        ? state.pickup
        : (state.dropoff || { addr: '', full: '', name: '', phone: '', note: '' });

      const modal = document.createElement('div');
      modal.className = 'gexSubModal';
      modal.innerHTML = `
        <div style="padding:16px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;">
          <button type="button" class="gexIconBtn dark" id="mClose">←</button>
          <b style="font-size:16.5px;">Thông tin điểm ${isPick ? 'nhận hàng (Người gửi)' : 'giao hàng (Người nhận)'}</b>
          <span style="width:38px;"></span>
        </div>

        <div style="padding:20px 24px;flex:1;max-width:600px;width:100%;margin:0 auto;box-sizing:border-box;">
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:13px;font-weight:700;margin-bottom:5px;">Địa chỉ chi tiết *</label>
            <input class="gexInput" id="mAddr" value="${_esc(cur.addr)}" placeholder="Nhập số nhà, tên đường, phường, quận...">
            <div class="gexChipRow">
              ${PRESET_PLACES.map(p => `<button type="button" class="gexChip" data-fill="${_esc(p.name)}">${_esc(p.name)}</button>`).join('')}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
            <div>
              <label style="display:block;font-size:13px;font-weight:700;margin-bottom:5px;">Tên người liên hệ *</label>
              <input class="gexInput" id="mName" value="${_esc(cur.name)}" placeholder="VD: Nguyễn Văn A">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:700;margin-bottom:5px;">Số điện thoại *</label>
              <input class="gexInput" id="mPhone" type="tel" value="${_esc(cur.phone)}" placeholder="VD: 0909123456">
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:700;margin-bottom:5px;">Ghi chú địa chỉ (Số tầng, cổng, tòa nhà...)</label>
            <input class="gexInput" id="mNote" value="${_esc(cur.note || '')}" placeholder="Không bắt buộc">
          </div>

          <button type="button" class="gexPrimaryBtn" id="mSave">Xác nhận địa chỉ</button>
        </div>
      `;
      shell.appendChild(modal);

      modal.querySelector('#mClose').onclick = () => modal.remove();
      modal.querySelectorAll('[data-fill]').forEach(b => {
        b.onclick = () => { modal.querySelector('#mAddr').value = b.dataset.fill; };
      });
      modal.querySelector('#mSave').onclick = () => {
        const addr = modal.querySelector('#mAddr').value.trim();
        const name = modal.querySelector('#mName').value.trim();
        const phone = modal.querySelector('#mPhone').value.trim();
        if (!addr || !name || !phone) {
          if (typeof toast === 'function') toast('Vui lòng nhập đầy đủ Địa chỉ, Tên và Số điện thoại!');
          return;
        }
        const info = { addr, full: addr, name, phone, note: modal.querySelector('#mNote').value.trim() };
        if (isPick) state.pickup = info;
        else state.dropoff = info;
        modal.remove();
        render();
      };
    }

    render();
  };

  injectExpressShortcut();
  setInterval(injectExpressShortcut, 1200);

  (function syncResponsiveMemberAndAccountBadge() {
  function getMemberInfo() {
    // Lấy thông tin hạng hiện tại từ nút Member có sẵn trên header (nếu có)
    const headerMember = document.querySelector('header .memberPill, header #memberBtn, .top button[id*="member" i], .top a[href*="member"]');
    const label = headerMember ? headerMember.textContent.trim() : '🥉 Member';
    return {
      el: headerMember,
      text: label || '🥉 Member'
    };
  }

  function injectBottomNavMember() {
    // Tìm thanh điều hướng ngang bên dưới (Trang chủ | Đặt xe | Hoạt động | Tài khoản)
    const bottomNav = document.querySelector('.bottomNav, .mobileNav, nav.tabbar, .mNav');
    if (!bottomNav || document.getElementById('gnMobileMemberTab')) return;

    const sampleItem = bottomNav.querySelector('a, button');
    if (!sampleItem) return;

    const { el: headerMember, text } = getMemberInfo();
    const mItem = sampleItem.cloneNode(true);
    mItem.id = 'gnMobileMemberTab';
    mItem.classList.remove('active', 'is-active');
    if (mItem.tagName === 'A') mItem.setAttribute('href', '#member');

    // Cập nhật icon huy chương & chữ Member
    const svg = mItem.querySelector('svg');
    if (svg) {
      svg.outerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="6"/><path d="M8.5 8.5L7 3h10l-1.5 5.5"/><path d="M12 11v6"/></svg>`;
    }
    const textNode = Array.from(mItem.querySelectorAll('span, div')).pop();
    if (textNode) {
      textNode.textContent = text.replace(/^[^\wÀ-ỹ]+/, '').trim() || 'Member';
    } else {
      mItem.textContent = 'Member';
    }

    mItem.onclick = (e) => {
      e.preventDefault();
      if (headerMember) {
        headerMember.click();
      } else if (typeof openMemberModal === 'function') {
        openMemberModal();
      } else {
        location.hash = '#member';
      }
    };

    // Chèn vào trước tab "Tài khoản" (tab cuối cùng)
    const tabs = bottomNav.children;
    if (tabs.length >= 2) {
      bottomNav.insertBefore(mItem, tabs[tabs.length - 1]);
    } else {
      bottomNav.appendChild(mItem);
    }
  }

  function injectAccountNameBadge() {
    // Tìm tiêu đề tên user trong trang "Tài khoản của tôi" (ví dụ: tuantran)
    const accHeading = document.querySelector('#accountView h2, #accountView h3, .accountCard h2, .accountCard h3, .profileName');
    if (!accHeading || accHeading.querySelector('.accMemberBadge')) return;

    const { el: headerMember, text } = getMemberInfo();
    accHeading.classList.add('accNameRow');

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'accMemberBadge';
    badge.title = 'Xem quyền lợi hạng thành viên';
    badge.innerHTML = `<span>${text}</span>`;
    badge.onclick = (e) => {
      e.preventDefault();
      if (headerMember) {
        headerMember.click();
      } else if (typeof openMemberModal === 'function') {
        openMemberModal();
      }
    };

    accHeading.appendChild(badge);
  }

  // Chạy khi load trang & tự động theo dõi khi người dùng bấm chuyển sang tab Tài khoản
  const runAll = () => {
    injectBottomNavMember();
    injectAccountNameBadge();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll);
  } else {
    runAll();
  }

  const observer = new MutationObserver(runAll);
  observer.observe(document.body, { childList: true, subtree: true });
})();
})();
iconBox.innerHTML = `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M18 6l11 6v12l-11 6-11-6V12l11-6z" fill="#00B14F"/><path d="M7 12l11 6 11-6M18 18v12" stroke="#E6F7EE" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
function findHeaderMemberBtn() {
  // Tìm mọi phần tử nằm ở thanh header phía trên (cách mép trên < 80px)
  const candidates = Array.from(document.querySelectorAll('header *, .top *'))
    .filter(el => {
      const txt = el.textContent.trim();
      if (!/^(🥉|🥈|🥇|💎|🏅)?\s*(Member|Silver|Gold|Platinum|Diamond)$/i.test(txt)) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.top < 80;
    });

  if (!candidates.length) return null;
  // Lấy thẻ bọc ngoài cùng của nút viên thuốc trắng (button/a/div có bo góc)
  const target = candidates[0];
  return target.closest('button, a, [role="button"]') || target;
}