// [AI] Đăng ký nhà hàng đối tác. Luồng: đăng nhập Gmail đã xác minh → 4 bước (cơ sở, pháp lý, ngân hàng, xác nhận) → gửi hồ sơ.
// Hồ sơ → Firestore partnerApps/{id} + partnerLocks/{uid} (cùng 1 batch: mỗi tài khoản chỉ 1 hồ sơ đang chờ) và LocalStorage gonow_partnerapps (admin mở cùng trình duyệt ở chế độ demo vẫn thấy).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const load = (k, d) => { try { const r = localStorage.getItem(k); return r === null ? d : JSON.parse(r); } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
let toastT = 0;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), Math.max(2200, m.length * 60)); }

// ---- Firebase ----
let auth = null, fs = null;
if (typeof firebase !== "undefined" && typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("DIEN")) {
  try { const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG); auth = app.auth(); fs = app.firestore(); } catch (e) { console.warn("Firebase:", e); }
}
const AUTH_ERR = { "auth/invalid-email": "Email không hợp lệ.", "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.", "auth/email-already-in-use": "Email này đã đăng ký. Hãy bấm Đăng nhập.",
  "auth/invalid-credential": "Sai email hoặc mật khẩu.", "auth/too-many-requests": "Thử quá nhiều lần, hãy đợi một lúc.", "auth/network-request-failed": "Lỗi mạng." };
const gmailOk = e => /^[a-z0-9._-]+@gmail\.com$/i.test(String(e || "").trim());     // chỉ Gmail gốc, không dấu +

// ---- Dữ liệu cố định ----
const AREAS = ["Quận 1", "Quận 3", "Quận 7", "Bình Thạnh", "Tân Bình", "Thủ Đức"];
const CATS = ["Món nước", "Cơm", "Ăn vặt", "Pizza & Burger", "Đồ uống", "Tráng miệng", "Món chay"];
// req: true = bắt buộc. attp = chỉ bắt buộc khi chọn "Có giấy chứng nhận ATTP".
const DOCS = [
  { k: "gpkd", t: "Giấy phép kinh doanh / Giấy chứng nhận ĐKKD", req: true },
  { k: "attp", t: "Giấy chứng nhận đủ điều kiện ATTP", req: true, attp: true },
  { k: "training", t: "Giấy xác nhận tập huấn kiến thức ATTP", req: true },
  { k: "health", t: "Giấy khám sức khỏe người chế biến", req: true },
  { k: "cccdF", t: "CCCD chủ cơ sở (mặt trước)", req: true },
  { k: "cccdB", t: "CCCD chủ cơ sở (mặt sau)", req: true },
  { k: "front", t: "Ảnh mặt tiền quán (thấy biển hiệu)", req: true },
  { k: "kitchen", t: "Ảnh khu bếp / sơ chế", req: true },
  { k: "menu", t: "Ảnh thực đơn (không bắt buộc)", req: false }
];
const IMGS = {};            // k → dataURL đã thu nhỏ
let step = 1, busy = false, gps = null;

// ---- Tiện ích kiểm tra ----
const strip = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const val = id => ($("#" + id).value || "").trim();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// Thu nhỏ ảnh bằng canvas, giảm dần chất lượng tới khi ≤ maxKB (Firestore giới hạn 1MB/tài liệu cho CẢ hồ sơ)
function shrink(file, maxKB = 95) {
  return new Promise((ok, bad) => {
    if (!/^image\//.test(file.type)) return bad(new Error("Chỉ nhận file ảnh (JPG, PNG). Hãy chụp ảnh giấy tờ thay vì PDF."));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = 1100, q = 0.72, out = "";
      for (let i = 0; i < 8; i++) {
        const r = Math.min(1, w / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", q);
        if (out.length * 0.75 / 1024 <= maxKB) break;
        w = Math.round(w * 0.85); q = Math.max(0.4, q - 0.05);
      }
      ok(out);
    };
    img.onerror = () => bad(new Error("Không đọc được ảnh này."));
    img.src = url;
  });
}

// ---- Dựng giao diện ----
function build() {
  $("#pArea").innerHTML = AREAS.map(a => `<option>${a}</option>`).join("");
  $("#pCats").innerHTML = CATS.map(c => `<label class="ptTick"><input type="checkbox" value="${esc(c)}"><span>${esc(c)}</span></label>`).join("");
  $("#ptUploads").innerHTML = DOCS.map(d => `<div class="ptUpItem" data-k="${d.k}">
      <div class="ptUpHead"><b>${esc(d.t)}</b>${d.req ? '<em>Bắt buộc</em>' : "<em class='opt'>Tùy chọn</em>"}</div>
      <label class="ptUpBox"><input type="file" accept="image/*" hidden><span class="ptUpEmpty">Bấm để chọn ảnh</span><img alt="" hidden></label>
      <small class="ptUpErr"></small></div>`).join("");
  document.querySelectorAll(".ptUpItem input[type=file]").forEach(inp => inp.addEventListener("change", async () => {
    const box = inp.closest(".ptUpItem"), k = box.dataset.k, f = inp.files[0]; if (!f) return;
    const err = box.querySelector(".ptUpErr"); err.textContent = "";
    try {
      const d = await shrink(f); IMGS[k] = d;
      const im = box.querySelector("img"); im.src = d; im.hidden = false; box.querySelector(".ptUpEmpty").hidden = true; box.classList.add("ok");
    } catch (e) { err.textContent = e.message; delete IMGS[k]; }
  }));
  $("#pAttpMode").addEventListener("change", syncAttp); syncAttp();
  $("#pGps").addEventListener("click", getGps);
  $("#pNext").addEventListener("click", next); $("#pPrev").addEventListener("click", () => goStep(step - 1));
  $("#ptForm").addEventListener("submit", e => e.preventDefault());
}
function syncAttp() {
  const ex = val("pAttpMode") === "exempt";
  $("#pAttpHave").hidden = ex; $("#pAttpEx").hidden = !ex;
  const it = document.querySelector('.ptUpItem[data-k="attp"]');
  it.querySelector("em").textContent = ex ? "Tùy chọn" : "Bắt buộc"; it.querySelector("em").className = ex ? "opt" : "";
}
function getGps() {
  const t = $("#pGpsTxt");
  if (!navigator.geolocation) return (t.textContent = "Thiết bị không hỗ trợ GPS.");
  t.textContent = "Đang lấy vị trí…";
  navigator.geolocation.getCurrentPosition(p => { gps = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }; t.textContent = `Đã lấy: ${gps.lat}, ${gps.lng}`; },
    () => { t.textContent = "Không lấy được vị trí. Bạn vẫn có thể gửi hồ sơ không có GPS."; }, { timeout: 8000 });
}
function goStep(n, scroll = true) {
  step = n;
  document.querySelectorAll(".ptStep").forEach(f => { f.hidden = +f.dataset.step !== n; });
  document.querySelectorAll("#ptSteps li").forEach(li => { const s = +li.dataset.s; li.classList.toggle("on", s === n); li.classList.toggle("done", s < n); });
  $("#pPrev").hidden = n === 1; $("#pNext").textContent = n === 4 ? "Gửi hồ sơ" : "Tiếp tục"; $("#pMsg").textContent = "";
  if (n === 4) review();
  if (scroll) $("#ptForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- Kiểm tra từng bước (trả về danh sách lỗi) ----
function validate(n) {
  const e = [];
  if (n === 1) {
    if (val("pName").length < 3) e.push("Nhập tên quán (ít nhất 3 ký tự).");
    if (!val("pType")) e.push("Chọn loại hình.");
    if (!/^0\d{9}$/.test(val("pPhone").replace(/[\s.]/g, ""))) e.push("Số điện thoại quán gồm 10 số, bắt đầu bằng 0.");
    const a = val("pAddr"); if (a.length < 10 || !/\s/.test(a) || /^\d+$/.test(a.replace(/\W/g, ""))) e.push("Nhập địa chỉ đầy đủ: số nhà, đường, phường, quận.");
    if (/(https?:|www\.)/i.test(a)) e.push("Địa chỉ không được chứa đường dẫn website.");
    if (val("pOpen") >= val("pClose")) e.push("Giờ đóng cửa phải sau giờ mở cửa.");
    if (!document.querySelector("#pCats input:checked")) e.push("Chọn ít nhất 1 nhóm món.");
  }
  if (n === 2) {
    if (val("pOwner").length < 5 || !/\s/.test(val("pOwner"))) e.push("Nhập đầy đủ họ tên chủ cơ sở.");
    if (!/^\d{12}$/.test(val("pCccd"))) e.push("Số CCCD gồm đúng 12 số.");
    if (!val("pForm")) e.push("Chọn hình thức kinh doanh.");
    if (!/^\d{10}(-?\d{3})?$/.test(val("pTax"))) e.push("Mã số thuế gồm 10 số (hoặc 13 số cho đơn vị phụ thuộc).");
    if (!/^[A-Za-z0-9\/.\-]{6,20}$/.test(val("pLic"))) e.push("Số giấy phép kinh doanh chưa hợp lệ (6–20 ký tự, chữ/số).");
    if (!val("pLicDate") || val("pLicDate") > today()) e.push("Ngày cấp ĐKKD phải là ngày đã qua.");
    if (val("pAttpMode") === "have") {
      if (val("pAttpNo").length < 4) e.push("Nhập số giấy chứng nhận ATTP.");
      if (!val("pAttpFrom") || val("pAttpFrom") > today()) e.push("Ngày cấp giấy ATTP phải là ngày đã qua.");
      if (!val("pAttpTo") || val("pAttpTo") <= addDays(today(), 30)) e.push("Giấy ATTP phải còn hạn ít nhất 30 ngày.");
      else if (val("pAttpTo") <= val("pAttpFrom")) e.push("Ngày hết hạn phải sau ngày cấp.");
    } else if (val("pAttpWhy").length < 20) e.push("Hãy giải thích rõ vì sao cơ sở thuộc diện được miễn giấy ATTP (ít nhất 20 ký tự).");
    DOCS.forEach(d => { if (d.req && !(d.attp && val("pAttpMode") === "exempt") && !IMGS[d.k]) e.push(`Thiếu ảnh: ${d.t}.`); });
  }
  if (n === 3) {
    if (!val("pBank")) e.push("Chọn ngân hàng.");
    if (!/^\d{6,19}$/.test(val("pAcc"))) e.push("Số tài khoản gồm 6–19 chữ số.");
    if (strip(val("pAccName")) !== strip(val("pOwner"))) e.push("Tên chủ tài khoản phải trùng với tên chủ cơ sở (" + val("pOwner") + ").");
  }
  if (n === 4) { if (!["c1", "c2", "c3"].every(id => $("#" + id).checked)) e.push("Bạn cần đồng ý cả 3 cam kết."); }
  return e;
}
function next() {
  if (busy) return;
  const e = validate(step), box = $("#e" + step);
  box.innerHTML = e.length ? "<ul>" + e.map(x => `<li>${esc(x)}</li>`).join("") + "</ul>" : "";
  if (e.length) return box.scrollIntoView({ behavior: "smooth", block: "center" });
  if (step < 4) return goStep(step + 1);
  submit();
}
function review() {
  const row = (k, v) => `<div><dt>${k}</dt><dd>${esc(v || "—")}</dd></div>`;
  $("#pReview").innerHTML = `<dl>${row("Tên quán", val("pName"))}${row("Địa chỉ", val("pAddr") + ", " + val("pArea"))}${row("Chủ cơ sở", val("pOwner"))}
    ${row("Mã số thuế", val("pTax"))}${row("Giấy ATTP", val("pAttpMode") === "have" ? val("pAttpNo") + " (hết hạn " + val("pAttpTo").split("-").reverse().join("/") + ")" : "Xin miễn, chờ admin xét")}
    ${row("Ngân hàng", val("pBank") + " • " + val("pAcc"))}${row("Số ảnh giấy tờ", Object.keys(IMGS).length + " ảnh")}</dl>`;
}

// ---- Gửi hồ sơ ----
const newId = () => "PT" + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase();
const mine = () => load("gonow_mypartner", null);
async function submit() {
  const old = mine();
  if (old && old.status !== "rejected") return toast("Bạn đã gửi hồ sơ " + old.id + " rồi.");
  const u = auth && auth.currentUser;
  busy = true; $("#pNext").disabled = true; $("#pNext").textContent = "Đang gửi…";
  const have = val("pAttpMode") === "have", id = newId();
  const doc = {
    id, uid: u ? u.uid : "local", email: u ? u.email : "", ts: Date.now(), createdAt: new Date().toLocaleString("vi-VN"), status: "pending", note: "",
    name: val("pName"), type: val("pType"), area: val("pArea"), phone: val("pPhone").replace(/[\s.]/g, ""), addr: val("pAddr"), open: val("pOpen"), close: val("pClose"),
    cats: [...document.querySelectorAll("#pCats input:checked")].map(i => i.value), gps,
    owner: val("pOwner").replace(/\s+/g, " "), cccd: val("pCccd"), bizForm: val("pForm"), tax: val("pTax"), lic: val("pLic"), licDate: val("pLicDate"),
    attp: have ? { mode: "have", no: val("pAttpNo"), from: val("pAttpFrom"), to: val("pAttpTo") } : { mode: "exempt", why: val("pAttpWhy") },
    bank: val("pBank"), acc: val("pAcc"), accName: val("pAccName").toUpperCase(), docs: { ...IMGS }
  };
  let synced = false, reason = "";
  if (JSON.stringify(doc).length > 950000) reason = "Ảnh quá nặng, hãy chọn ảnh nhỏ hơn.";
  else if (fs && u) {
    try {
      const FV = firebase.firestore.FieldValue, b = fs.batch();
      b.set(fs.doc("partnerLocks/" + u.uid), { appId: id, ts: FV.serverTimestamp() });         // khóa: mỗi tài khoản 1 hồ sơ
      b.set(fs.doc("partnerApps/" + id), { ...doc, sts: FV.serverTimestamp() });
      await b.commit(); synced = true;
    } catch (err) {
      console.warn("Firestore:", err);
      reason = err.code === "permission-denied" ? "Máy chủ từ chối: tài khoản này đã có hồ sơ đang chờ, hoặc chưa cập nhật luật Firestore." : "Chưa kết nối được máy chủ.";
    }
  } else reason = fs ? "Cần đăng nhập Gmail đã xác minh." : "Chưa cấu hình Firebase (chế độ demo, hồ sơ chỉ lưu trên máy này).";
  busy = false; $("#pNext").disabled = false; $("#pNext").textContent = "Gửi hồ sơ";
  if (reason.startsWith("Ảnh") || (fs && u && !synced)) { $("#pMsg").textContent = reason; return; }
  const list = load("gonow_partnerapps", []).filter(x => x.id !== id);
  if (!store("gonow_partnerapps", [{ ...doc, local: !synced }, ...list])) store("gonow_partnerapps", [{ ...doc, docs: {}, local: !synced }, ...list]);
  store("gonow_mypartner", { id, name: doc.name, ts: doc.ts, createdAt: doc.createdAt, status: "pending", note: "", synced });
  toast("Đã gửi hồ sơ " + id); render();
}

// ---- Trạng thái hồ sơ của tôi ----
const ST = { pending: ["Đang chờ duyệt", "wait", "Admin sẽ kiểm tra giấy phép kinh doanh và giấy ATTP trong 1–2 ngày làm việc."],
  approved: ["Đã duyệt", "ok", "Chúc mừng! Quán của bạn đã được duyệt. Admin sẽ liên hệ để thiết lập thực đơn."],
  rejected: ["Chưa đạt", "bad", "Hồ sơ chưa đạt. Xem ghi chú bên dưới, bổ sung rồi gửi lại."] };
async function refreshMine() {
  let m = mine(); if (!m) return null;
  const loc = load("gonow_partnerapps", []).find(x => x.id === m.id);
  if (loc && (loc.status !== m.status || (loc.note || "") !== (m.note || ""))) { m = { ...m, status: loc.status, note: loc.note || "" }; store("gonow_mypartner", m); }
  if (fs && auth && auth.currentUser && m.synced) {
    try { const s = await fs.doc("partnerApps/" + m.id).get(); if (s.exists) { const d = s.data(); m = { ...m, status: d.status, note: d.note || "" }; store("gonow_mypartner", m); } }
    catch (e) { console.warn("Tra cứu:", e.code || e); }
  }
  return m;
}
async function resubmit() {          // hồ sơ bị từ chối: xóa khóa để gửi lại (luật Firestore chỉ cho xóa khi status = rejected)
  const m = mine(); const u = auth && auth.currentUser;
  try { if (fs && u && m && m.synced) await fs.doc("partnerLocks/" + u.uid).delete(); } catch (e) { console.warn(e); return toast("Chưa gỡ được khóa hồ sơ cũ. Thử lại sau."); }
  localStorage.removeItem("gonow_mypartner"); render();
}

// ---- Đăng nhập ----
const aMsg = (t, ok) => { const m = $("#paMsg"); m.textContent = t || ""; m.className = "ptMsg" + (ok ? " ok" : ""); };
function authUI() {
  if (!auth) { $("#ptAuth").hidden = true; $("#ptForm").hidden = !!(mine() && mine().status !== "rejected"); return; }   // chế độ demo: không cần đăng nhập
  const u = auth && auth.currentUser, okUser = u && !u.isAnonymous && u.emailVerified && gmailOk(u.email);
  $("#ptAuth").hidden = !!okUser; $("#ptForm").hidden = !okUser || !!(mine() && mine().status !== "rejected");
  const need = u && !u.isAnonymous && !u.emailVerified;
  $("#ptAuthForm").hidden = !!need; $("#ptVerify").hidden = !need;
  if (need) $("#pvText").textContent = `Chúng tôi đã gửi email xác minh tới ${u.email}. Mở email, bấm đường dẫn, rồi quay lại bấm “Tôi đã xác minh”. Xem cả mục Spam.`;
}
async function doAuth(reg) {
  const email = val("paEmail").toLowerCase(), pass = $("#paPass").value;
  if (!gmailOk(email)) return aMsg(/@gmail\.com$/i.test(email) ? "Không dùng email có dấu +. Hãy dùng Gmail gốc." : "Chỉ nhận email @gmail.com.");
  if (pass.length < 6) return aMsg("Mật khẩu cần ít nhất 6 ký tự.");
  aMsg(""); $("#paLogin").disabled = $("#paReg").disabled = true;
  try {
    if (reg) { const c = await auth.createUserWithEmailAndPassword(email, pass); try { await c.user.sendEmailVerification(); } catch (e) {} }
    else await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) { aMsg(AUTH_ERR[err.code] || "Có lỗi xảy ra (" + err.code + ")"); }
  $("#paLogin").disabled = $("#paReg").disabled = false; authUI(); render();
}
function bindAuth() {
  $("#paLogin").addEventListener("click", () => doAuth(false)); $("#paReg").addEventListener("click", () => doAuth(true));
  $("#pvResend").addEventListener("click", async () => { try { await auth.currentUser.sendEmailVerification(); aMsg("Đã gửi lại email xác minh.", true); } catch (e) { aMsg(AUTH_ERR[e.code] || "Chưa gửi được, thử lại sau 1 phút."); } });
  $("#pvCheck").addEventListener("click", async () => {
    try { await auth.currentUser.reload(); if (!auth.currentUser.emailVerified) return aMsg("Email chưa được xác minh."); await auth.currentUser.getIdToken(true); aMsg(""); } catch (e) { return aMsg("Không kiểm tra được, thử lại."); }
    authUI(); render();
  });
  $("#pvOut").addEventListener("click", async () => { await auth.signOut(); authUI(); render(); });
}

// ---- Vẽ trạng thái chung ----
async function render() {
  const box = $("#ptMine"), m = await refreshMine();
  if (!m) { box.hidden = true; authUI(); return; }
  const s = ST[m.status] || ST.pending;
  box.hidden = false;
  box.innerHTML = `<h3>Hồ sơ ${esc(m.id)} – ${esc(m.name)}</h3><p><span class="ptPill ${s[1]}">${s[0]}</span></p><p class="ptSub">${s[2]}</p>
    ${m.note ? `<p class="ptNote"><b>Ghi chú từ GoNow:</b> ${esc(m.note)}</p>` : ""}
    ${m.synced === false ? `<p class="ptFine">Hồ sơ mới chỉ lưu trên máy này (chưa lên máy chủ).</p>` : ""}
    ${m.status === "rejected" ? `<button class="btn" id="ptAgain" type="button">Gửi hồ sơ mới</button>` : ""}`;
  const again = $("#ptAgain"); if (again) again.addEventListener("click", resubmit);
  authUI();
}

build(); bindAuth();
if (auth) auth.onAuthStateChanged(() => { authUI(); render(); }); else render();
goStep(1, false);
if (location.hash !== "#apply") window.scrollTo(0, 0);