// [AI] Trang đăng ký tài xế. Hồ sơ → Firestore (driverApps/{id}) + LocalStorage (gonow_driverapps) để admin duyệt.
// Ảnh giấy tờ được thu nhỏ bằng canvas rồi nhúng thẳng vào tài liệu (Firestore giới hạn 1MB/tài liệu).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => Math.round(n).toLocaleString("vi-VN") + "đ";
const load = (k, d) => { try { const r = localStorage.getItem(k); return r === null ? d : JSON.parse(r); } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), Math.max(2200, msg.length * 60)); }

// ---- Firebase (tùy chọn) ----
let auth = null, fs = null;
if (typeof firebase !== "undefined" && typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("DIEN")) {
  try { const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG); auth = app.auth(); fs = app.firestore(); }
  catch (err) { console.warn("Firebase:", err); }
}
let userP = null;
function ensureUser() {            // khách chưa đăng nhập dùng tài khoản ẩn danh để hồ sơ gắn với một uid (chỉ tạo một lần)
  return userP || (userP = new Promise(res => {
    if (!auth) return res(null);
    const off = auth.onAuthStateChanged(u => { off(); if (u) return res(u); auth.signInAnonymously().then(c => res(c.user)).catch(() => res(null)); });
  }));
}

// ---- Dữ liệu cố định ----
const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const SHIFTS = [["Sáng", "6–12h"], ["Chiều", "12–18h"], ["Tối", "18–24h"]];
const VEH_LIST = [["bike", "Xe máy", "1 khách"], ["car4", "Ô tô 4 chỗ", "tối đa 4 khách"], ["car7", "Ô tô 7 chỗ", "tối đa 7 khách"]];
const DOCS = [
  { k: "cccd", label: "CCCD – mặt trước", tip: "Đặt mặt TRƯỚC căn cước vừa khung, thấy rõ ảnh chân dung và số.", aspect: 1.586, side: 1100, kb: 120 },
  { k: "cccdBack", label: "CCCD – mặt sau", tip: "Đặt mặt SAU căn cước vừa khung.", aspect: 1.586, side: 1000, kb: 90 },
  { k: "license", label: "Giấy phép lái xe", tip: "Đặt bằng lái vừa khung, thấy rõ hạng và ngày hết hạn.", aspect: 1.586, side: 1100, kb: 120 },
  { k: "reg", label: "Giấy đăng ký xe (cà vẹt)", tip: "Đặt giấy đăng ký xe vừa khung, thấy rõ biển số.", aspect: 1.45, side: 1100, kb: 100 }
];
const STATUS = { pending: ["Đang chờ duyệt", "pending"], approved: ["Đã được duyệt", "approved"], rejected: ["Chưa đạt yêu cầu", "rejected"] };

// ---- Trạng thái biểu mẫu ----
const draft = load("gonow_driverdraft", {});
const F = { vehicle: draft.vehicle || "bike", svc: draft.svc || [], sched: draft.sched || [], imgs: { cccd: "", cccdBack: "", license: "", reg: "", selfie: "" },
  kyc: { src: {}, q: {}, note: {}, text: {}, lic: null, live: null, cccdDesc: null, selfieDesc: null, faceFound: null, faceDist: null } };
let step = 1, busy = false;

// =============== MÁY TÍNH THU NHẬP ===============
const calc = { veh: "bike" };
function renderCalc() {
  $("#cVeh").innerHTML = VEH_LIST.map(([k, name]) => `<button type="button" class="${k === calc.veh ? "on" : ""}" data-veh="${k}">${name}</button>`).join("");
  const trips = +$("#cTrips").value, days = +$("#cDays").value, km = +$("#cKm").value;
  $("#cTripsV").textContent = trips; $("#cDaysV").textContent = days; $("#cKmV").textContent = km + " km";
  const v = VEHICLES[calc.veh], fare = Math.round((v.base + km * v.perKm) / 1000) * 1000;
  const month = fare * 0.8 * trips * days * 4.3;
  $("#cOut").textContent = "≈ " + (month / 1e6).toFixed(1).replace(".", ",") + " triệu đ";
  $("#cNote").textContent = `${money(fare)} / chuyến × ${trips} chuyến × ${days} ngày × 4,3 tuần, giữ lại 80%`;
}
$("#cVeh").addEventListener("click", e => { const b = e.target.closest("[data-veh]"); if (b) { calc.veh = b.dataset.veh; renderCalc(); } });
["cTrips", "cDays", "cKm"].forEach(id => $("#" + id).addEventListener("input", renderCalc));

// =============== BIỂU MẪU ===============
function buildStatic() {
  $("#dArea").innerHTML = '<option value="">Chọn khu vực…</option>' + Object.keys(DISTRICTS).map(d => `<option>${d}</option>`).join("");
  const y = new Date().getFullYear();
  $("#dYear").innerHTML = '<option value="">Chọn năm…</option>' + Array.from({ length: y - 2004 }, (_, i) => y - i).map(v => `<option>${v}</option>`).join("");
  $("#dVeh").innerHTML = VEH_LIST.map(([k, name, sub]) => `<label class="vOpt ${k === F.vehicle ? "on" : ""}"><input type="radio" name="vehicle" value="${k}" ${k === F.vehicle ? "checked" : ""}><b>${name}</b><small>${sub}</small></label>`).join("");
  $("#dSvc").innerHTML = [["ride", "Đặt xe (chở khách)"], ["food", "Giao đồ ăn"]].map(([k, t]) => `<label class="cOpt"><input type="checkbox" value="${k}" ${F.svc.includes(k) ? "checked" : ""}><span>${t}</span></label>`).join("");
  $("#dSched").innerHTML = `<span></span>` + DAYS.map(d => `<b>${d}</b>`).join("")
    + SHIFTS.map(([n, h], si) => `<span class="sl">${n}<small>${h}</small></span>` + DAYS.map((d, di) => `<button type="button" class="sc ${F.sched.includes(di + "-" + si) ? "on" : ""}" data-c="${di}-${si}" aria-pressed="${F.sched.includes(di + "-" + si)}" aria-label="${d} ${n}"></button>`).join("")).join("");
  const tile = (k, label, attr, empty) => `<div class="up" data-k="${k}">
      <div class="upBox" ${attr} tabindex="0" role="button" aria-label="${label}"><span class="upEmpty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>${empty}</span><img alt="" hidden></div>
      <div class="upMeta"><b>${label} <i class="rq">*</i></b><small class="upInfo"></small><button type="button" class="upDel" ${attr} hidden>Chụp lại</button></div><em class="err" data-for="up-${k}"></em></div>`;
  $("#dUps").innerHTML = DOCS.map(d => tile(d.k, d.label, `data-cap="${d.k}"`, "Chụp bằng camera")).join("");
  $("#dLive").innerHTML = tile("selfie", "Quét khuôn mặt", 'data-live="1"', "Quét khuôn mặt (khoảng 30 giây)");
  ["dName", "dPhone", "dCccd", "dEmail", "dDob", "dArea", "dBrand", "dPlate", "dYear", "dColor", "dHours", "dHeard"].forEach(id => { if (draft[id]) $("#" + id).value = draft[id]; });
  const dob = $("#dDob"); const t = new Date(); dob.max = `${t.getFullYear() - 18}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; dob.min = `${t.getFullYear() - 70}-01-01`;
}
function saveDraft() {
  const d = { vehicle: F.vehicle, svc: F.svc, sched: F.sched };
  ["dName", "dPhone", "dCccd", "dEmail", "dDob", "dArea", "dBrand", "dPlate", "dYear", "dColor", "dHours", "dHeard"].forEach(id => { d[id] = $("#" + id).value; });
  store("gonow_driverdraft", d);
}

// ---- Chụp giấy tờ + quét mặt (kyc.js) ----
const sleep = ms => new Promise(r => setTimeout(r, ms));
function showImg(k) {
  const box = document.querySelector(`.up[data-k="${k}"]`); if (!box) return;
  const img = box.querySelector("img"), has = !!F.imgs[k];
  img.hidden = !has; if (has) img.src = F.imgs[k];
  box.querySelector(".upEmpty").hidden = has; box.querySelector(".upDel").hidden = !has;
  box.querySelector(".upDel").textContent = k === "selfie" ? "Quét lại" : "Chụp lại";
  box.querySelector(".upInfo").textContent = has ? (F.kyc.note[k] || "Đã chụp") : "";
  box.classList.toggle("has", has);
}
const note = (k, t) => { F.kyc.note[k] = t; showImg(k); };
const pickFile = () => new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/jpeg,image/png"; i.onchange = () => res(i.files[0] || null); i.click(); });
async function fromFile(d) {       // chỉ dùng khi thiết bị không có camera / không có HTTPS → bị đánh dấu "ảnh từ thư viện"
  const f = await pickFile(); if (!f) throw new Error("cancel");
  const im = await new Promise((ok, bad) => { const m = new Image(); m.onload = () => ok(m); m.onerror = () => bad(new Error("Không đọc được ảnh này.")); m.src = URL.createObjectURL(f); });
  const c = document.createElement("canvas"), s = Math.min(1, 1600 / Math.max(im.width, im.height)); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  const q = KYC.quality(c), bad = KYC.qIssue(q); if (bad) throw new Error(bad);
  return { canvas: c, url: KYC.toJpeg(c, d.side, d.kb), q, source: "file" };
}
const typedInfo = () => ({ no: $("#dCccd").value.trim(), name: $("#dName").value.trim().replace(/\s+/g, " "), dob: $("#dDob").value });
function recomputeFace() { const k = F.kyc; k.faceDist = k.cccdDesc && k.selfieDesc ? +KYC.dist(k.cccdDesc, k.selfieDesc).toFixed(3) : null; }
async function capture(k) {
  const d = DOCS.find(x => x.k === k); if (!d || busy) return; busy = true;
  const err = document.querySelector(`[data-for="up-${k}"]`); err.textContent = "";
  try {
    let r; try { r = await KYC.captureDoc(d); } catch (e) { if (e.nocam) r = await fromFile(d); else throw e; }
    F.imgs[k] = r.url; F.kyc.src[k] = r.source; F.kyc.q[k] = r.q; note(k, "Đã chụp • đang kiểm tra…");
    const say = t => note(k, t);
    try {
      if (k === "cccd") {
        const f = await KYC.faceOf(r.canvas, say); F.kyc.cccdDesc = f ? f.desc : null; F.kyc.faceFound = !!f; recomputeFace();
        if (!f) err.textContent = "Không thấy ảnh chân dung trên CCCD. Hãy chụp lại rõ hơn, đủ sáng, thấy cả khuôn mặt.";
        F.kyc.text.cccd = (await KYC.readCccd(r.canvas, say)).text;
      } else if (k === "license") F.kyc.lic = await KYC.readLicense(r.canvas, say);
      note(k, "Đã chụp ✓");
    } catch (e) { console.warn("Kiểm tra tự động:", e); if (k === "cccd") F.kyc.faceFound = F.kyc.faceFound === false ? false : null; note(k, "Đã chụp (chưa kiểm tra tự động được, nhân viên sẽ xem)"); }
  } catch (e) { if (e.message !== "cancel") err.textContent = e.message; }
  busy = false; renderKycRes();
}
async function startLive() {
  if (busy) return; const err = document.querySelector('[data-for="up-selfie"]'); err.textContent = "";
  if (!F.imgs.cccd) { err.textContent = "Hãy chụp CCCD mặt trước trước, rồi mới quét khuôn mặt."; return; }
  if (F.kyc.faceFound === false) { err.textContent = "Chưa thấy khuôn mặt trên ảnh CCCD. Hãy chụp lại CCCD mặt trước."; return; }
  busy = true;
  try {
    if (!F.kyc.cccdDesc) { note("selfie", "Đang chuẩn bị…"); const f = await KYC.faceOf(F.imgs.cccd, t => note("selfie", t)); F.kyc.cccdDesc = f ? f.desc : null; F.kyc.faceFound = !!f; if (!f) throw new Error("Chưa thấy khuôn mặt trên ảnh CCCD. Hãy chụp lại CCCD mặt trước."); }
    const r = await KYC.liveness({ say: t => note("selfie", t) });
    F.imgs.selfie = r.selfie; F.kyc.selfieDesc = r.desc; F.kyc.live = { ok: r.ok, challenges: r.challenges, steps: r.steps, sameDist: r.sameDist }; recomputeFace();
    note("selfie", "Đã quét ✓");
  } catch (e) { if (e.message !== "cancel") err.textContent = e.nocam ? "Thiết bị không có camera trước hoặc chưa bật HTTPS. Hãy dùng điện thoại." : e.message; showImg("selfie"); }
  busy = false; renderKycRes();
}
function kycPack() {
  const t = typedInfo(), K = F.kyc;
  const cccd = K.text.cccd != null ? KYC.matchCccd(K.text.cccd, t) : null, lic = K.lic ? KYC.licCheck(K.lic, F.vehicle) : null;
  const base = { cccd, lic, live: K.live, faceFound: K.faceFound, faceDist: K.faceDist, faceLevel: K.faceDist != null ? KYC.faceLevel(K.faceDist) : null, src: K.src, q: K.q };
  const s = KYC.summarize(base);
  if (!cccd) s.flags.push("Chưa đọc được chữ trên CCCD");
  if (!lic) s.flags.push("Chưa đọc được bằng lái");
  const level = s.hard.length ? "fail" : s.flags.length ? "review" : "pass";
  return { v: 1, ...base, level, hard: s.hard, flags: s.flags, ts: Date.now() };
}
function renderKycRes() {
  const box = $("#kycRes"); if (!box) return;
  if (!F.imgs.cccd && !F.imgs.selfie && !F.imgs.license) { box.innerHTML = ""; return; }
  const p = kycPack(), row = (st, t) => `<li class="${st}"><i>${st === "ok" ? "✓" : st === "no" ? "✕" : "!"}</i>${esc(t)}</li>`, c = p.cccd, l = p.lic;
  const items = [
    F.imgs.cccd && row(p.faceFound === false ? "no" : p.faceFound ? "ok" : "warn", p.faceFound === false ? "Không thấy ảnh chân dung trên CCCD" : p.faceFound ? "Thấy ảnh chân dung trên CCCD" : "Chưa kiểm tra được ảnh chân dung"),
    F.imgs.selfie && row(p.live && p.live.ok ? "ok" : "no", p.live && p.live.ok ? "Đã qua thử thách người thật" : "Chưa qua thử thách người thật"),
    p.faceLevel && row(p.faceLevel === "pass" ? "ok" : p.faceLevel === "review" ? "warn" : "no", p.faceLevel === "pass" ? "Khuôn mặt khớp với CCCD" : p.faceLevel === "review" ? "Khuôn mặt tương đối khớp, nhân viên sẽ xem kỹ hơn" : "Khuôn mặt không khớp với CCCD"),
    c && row(c.noOk ? "ok" : "warn", c.noOk ? "Số CCCD khớp thông tin đã khai" : "Chưa xác nhận được số CCCD (ảnh khó đọc?)"),
    c && c.nameOk != null && row(c.nameOk ? "ok" : "warn", c.nameOk ? "Họ tên khớp CCCD" : "Chưa xác nhận được họ tên trên CCCD"),
    c && c.dobOk != null && row(c.dobOk ? "ok" : "warn", c.dobOk ? "Ngày sinh khớp CCCD" : "Chưa xác nhận được ngày sinh trên CCCD"),
    l && row(l.expired === true ? "no" : l.expiry ? "ok" : "warn", l.expired === true ? "Giấy phép lái xe đã hết hạn" : l.expiry ? "Giấy phép lái xe còn hạn" : "Chưa đọc được ngày hết hạn bằng lái"),
    l && row(l.classOk === false ? "no" : l.classOk ? "ok" : "warn", l.classOk === false ? `Hạng ${l.cls} không phù hợp loại xe đã chọn` : l.classOk ? `Hạng bằng ${l.cls} phù hợp loại xe` : "Chưa đọc được hạng bằng lái")
  ].filter(Boolean).join("");
  const head = p.level === "pass" ? ["ok", "Đạt kiểm tra tự động"] : p.level === "review" ? ["warn", "Hồ sơ sẽ được nhân viên kiểm tra kỹ hơn (vẫn gửi được)"] : ["no", "Chưa thể gửi: " + p.hard.join("; ")];
  box.innerHTML = `<div class="kcSum ${head[0]}"><b>${head[1]}</b></div><ul class="kcList">${items}</ul>`;
}

// ---- Kiểm tra từng bước ----
const setErr = (id, msg) => { const el = document.querySelector(`[data-for="${id}"]`); if (el) el.textContent = msg || ""; const f = $("#" + id); if (f) f.classList.toggle("bad", !!msg); return !msg; };
function validate(s) {
  let ok = true; const chk = (id, msg) => { if (!setErr(id, msg)) ok = false; };
  if (s === 1) {
    const name = $("#dName").value.trim().replace(/\s+/g, " "), phone = $("#dPhone").value.replace(/[\s.]/g, ""), email = $("#dEmail").value.trim(), dob = $("#dDob").value;
    chk("dName", name.length < 2 || !/\s/.test(name) ? "Nhập đầy đủ họ và tên." : ""); chk("dCccd", /^\d{12}$/.test($("#dCccd").value.trim()) ? "" : "Số căn cước công dân gồm đúng 12 chữ số.");
    chk("dPhone", /^0\d{9}$/.test(phone) ? "" : "Số điện thoại gồm 10 số, bắt đầu bằng 0.");
    chk("dEmail", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Email chưa đúng định dạng.");
    let m = ""; if (!dob) m = "Chọn ngày sinh."; else { const a = (Date.now() - new Date(dob)) / 31557600000; if (a < 18) m = "Bạn cần đủ 18 tuổi."; else if (a > 70) m = "Ngày sinh chưa hợp lệ."; }
    chk("dDob", m); chk("dArea", $("#dArea").value ? "" : "Chọn khu vực hoạt động.");
  } else if (s === 2) {
    chk("dVeh", F.vehicle ? "" : "Chọn loại xe.");
    chk("dBrand", $("#dBrand").value.trim().length < 3 ? "Nhập hãng và dòng xe." : "");
    chk("dPlate", /^[0-9]{2}[A-Z]{1,2}[0-9]?[-\s]?[0-9]{3}[.\s]?[0-9]{2}$/i.test($("#dPlate").value.trim()) ? "" : "Biển số chưa đúng (ví dụ 59X1-123.45).");
    chk("dYear", $("#dYear").value ? "" : "Chọn năm sản xuất."); chk("dColor", $("#dColor").value.trim().length < 2 ? "Nhập màu xe." : "");
  } else if (s === 3) {
    DOCS.forEach(d => chk("up-" + d.k, F.imgs[d.k] ? "" : "Cần chụp ảnh này."));
    chk("up-selfie", F.imgs.selfie && F.kyc.live && F.kyc.live.ok ? "" : "Cần quét khuôn mặt.");
    if (ok) { const p = kycPack(); if (p.hard.length) chk("up-selfie", p.hard.join(". ") + ". Hãy chụp/quét lại cho đúng."); }
  } else if (s === 4) {
    chk("dSvc", F.svc.length ? "" : "Chọn ít nhất một loại chuyến."); chk("dSched", F.sched.length ? "" : "Chọn ít nhất một khung giờ.");
    chk("dHours", $("#dHours").value ? "" : "Chọn số giờ chạy mỗi tuần.");
  } else if (s === 5) chk("dAgree", $("#dAgree").checked ? "" : "Bạn cần đồng ý để gửi hồ sơ.");
  return ok;
}

// ---- Điều hướng các bước ----
function renderReview() {
  const v = VEH_LIST.find(x => x[0] === F.vehicle), svcs = F.svc.map(k => k === "ride" ? "Đặt xe" : "Giao đồ ăn").join(", ");
  const sched = DAYS.map((d, di) => { const s = SHIFTS.filter((_, si) => F.sched.includes(di + "-" + si)).map(x => x[0]); return s.length ? `${d}: ${s.join(", ")}` : ""; }).filter(Boolean).join(" • ");
  const rows = [["Họ tên", $("#dName").value], ["Số CCCD", $("#dCccd").value], ["Điện thoại", $("#dPhone").value], ["Email", $("#dEmail").value], ["Ngày sinh", $("#dDob").value.split("-").reverse().join("/")], ["Khu vực", $("#dArea").value],
    ["Phương tiện", `${v ? v[1] : ""} • ${$("#dBrand").value} • ${$("#dYear").value} • ${$("#dColor").value}`], ["Biển số", $("#dPlate").value.toUpperCase()], ["Loại chuyến", svcs], ["Lịch rảnh", sched], ["Giờ chạy / tuần", $("#dHours").value]];
  $("#dReview").innerHTML = `<dl>${rows.map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join("")}</dl>
    <div class="rvImgs">${DOCS.concat([{ k: "selfie", label: "Ảnh quét khuôn mặt" }]).filter(d => F.imgs[d.k]).map(d => `<figure><img src="${F.imgs[d.k]}" alt=""><figcaption>${d.label}</figcaption></figure>`).join("")}</div>`;
}
function goStep(n, scroll = true) {
  step = n;
  document.querySelectorAll(".dStep").forEach(f => { f.hidden = +f.dataset.step !== n; });
  document.querySelectorAll("#dStepper li").forEach(li => { const s = +li.dataset.s; li.classList.toggle("on", s === n); li.classList.toggle("done", s < n); });
  $("#dPrev").hidden = n === 1; $("#dNext").textContent = n === 5 ? "Gửi hồ sơ" : "Tiếp tục"; $("#dMsg").textContent = "";
  if (n === 3) renderKycRes();
  if (n === 5) renderReview();
  if (scroll) $("#dForm").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function next() {
  if (busy) return;
  if (!validate(step)) { $("#dMsg").textContent = "Vui lòng kiểm tra các mục báo đỏ."; const bad = document.querySelector(".dStep:not([hidden]) .bad, .dStep:not([hidden]) .err:not(:empty)"); if (bad) bad.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
  $("#dMsg").textContent = "";
  if (step < 5) return goStep(step + 1);
  submit();
}

// ---- Gửi hồ sơ ----
const newId = () => "DR" + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase();
function mine() { return load("gonow_myapp", null); }
async function submit() {
  const old = mine();
  if (old && old.status !== "rejected") return toast("Bạn đã gửi hồ sơ " + old.id + " rồi.");
  busy = true; $("#dNext").disabled = true; $("#dNext").textContent = "Đang gửi…";
  const user = await ensureUser();
  const v = VEH_LIST.find(x => x[0] === F.vehicle);
  const doc = {
    id: newId(), uid: user ? user.uid : "local", ts: Date.now(), createdAt: new Date().toLocaleString("vi-VN"), status: "pending", note: "",
    name: $("#dName").value.trim().replace(/\s+/g, " "), phone: $("#dPhone").value.replace(/[\s.]/g, ""), email: $("#dEmail").value.trim().toLowerCase(),
    dob: $("#dDob").value, area: $("#dArea").value, vehicle: F.vehicle, vehicleName: v ? v[1] : "", brand: $("#dBrand").value.trim(), plate: $("#dPlate").value.trim().toUpperCase(),
    year: +$("#dYear").value, color: $("#dColor").value.trim(), services: F.svc, schedule: F.sched, hours: $("#dHours").value, heard: $("#dHeard").value,
    cccdNo: $("#dCccd").value.trim(), docs: { ...F.imgs }, kyc: kycPack()
  };
  let synced = false, reason = "";
  if (JSON.stringify(doc).length > 950000) reason = "Ảnh quá nặng, hãy chọn ảnh nhỏ hơn.";
  else if (fs && user) {
    try { await fs.collection("driverApps").doc(doc.id).set(doc); synced = true; }
    catch (err) { console.warn("Firestore:", err); reason = err.code === "permission-denied" ? "Máy chủ chưa cho phép gửi (chưa cập nhật luật Firestore)." : "Chưa kết nối được máy chủ."; }
  } else reason = fs ? "Chưa đăng nhập được tài khoản ẩn danh." : "Chưa cấu hình Firebase.";
  if (reason.startsWith("Ảnh")) { busy = false; $("#dNext").disabled = false; $("#dNext").textContent = "Gửi hồ sơ"; $("#dMsg").textContent = reason; return; }
  // bản sao trên máy (admin mở cùng trình duyệt cũng thấy khi chạy chế độ demo)
  const list = load("gonow_driverapps", []).filter(x => x.id !== doc.id);
  if (!store("gonow_driverapps", [{ ...doc, local: !synced }, ...list])) store("gonow_driverapps", [{ ...doc, docs: {}, local: !synced }, ...list]);
  store("gonow_myapp", { id: doc.id, name: doc.name, ts: doc.ts, createdAt: doc.createdAt, status: "pending", note: "", synced });
  localStorage.removeItem("gonow_driverdraft");
  busy = false; $("#dNext").disabled = false;
  renderMyApp(synced ? "" : reason);
  toast("Đã gửi hồ sơ " + doc.id);
}

// ---- Trạng thái hồ sơ của tôi ----
async function refreshMine() {
  let m = mine(); if (!m) return m;
  const loc = load("gonow_driverapps", []).find(x => x.id === m.id);     // admin mở cùng trình duyệt (chế độ demo) cũng cập nhật được
  if (loc && (loc.status !== m.status || (loc.note || "") !== (m.note || ""))) { m = { ...m, status: loc.status, note: loc.note || "" }; store("gonow_myapp", m); }
  if (!m.synced || !fs) return m;
  const user = await ensureUser(); if (!user) return m;
  try {
    const s = await fs.collection("driverApps").doc(m.id).get();
    if (s.exists) { const d = s.data(); const n = { ...m, status: d.status, note: d.note || "" }; store("gonow_myapp", n); return n; }
  } catch (err) { console.warn("Tra cứu:", err.code || err); }
  return m;
}
function renderMyApp(warn = "") {
  const m = mine(), box = $("#myApp");
  if (!m) { box.hidden = true; $("#dApply").hidden = false; return; }
  const st = STATUS[m.status] || STATUS.pending, blocked = m.status !== "rejected";
  box.hidden = false; $("#dApply").hidden = blocked;
  box.className = "myApp " + st[1];
  box.innerHTML = `<div class="maHead"><span class="maBadge">${st[0]}</span><b>Hồ sơ ${esc(m.id)}</b><small>Gửi lúc ${esc(m.createdAt || "")}</small></div>
    <p>${m.status === "approved" ? "Chúc mừng " + esc(m.name) + "! GoNow sẽ liên hệ qua số điện thoại bạn đã đăng ký để hẹn buổi tập huấn đầu tiên."
      : m.status === "rejected" ? "Rất tiếc, hồ sơ chưa đạt yêu cầu. Bạn có thể bổ sung và gửi lại hồ sơ mới bên dưới."
      : "Cảm ơn " + esc(m.name) + "! GoNow đã nhận hồ sơ và sẽ xem trong 1–2 ngày làm việc. Hãy giữ mã hồ sơ này để tra cứu."}</p>
    ${m.note ? `<p class="maNote"><b>Ghi chú từ GoNow:</b> ${esc(m.note)}</p>` : ""}
    ${warn ? `<p class="maWarn">${esc(warn)} Hồ sơ đã được lưu trên máy này để demo.</p>` : ""}
    <div class="maActs"><button type="button" class="btn sm" data-ma="refresh">Cập nhật trạng thái</button><button type="button" class="dGhost2" data-ma="copy">Sao chép mã hồ sơ</button></div>`;
}
$("#myApp").addEventListener("click", async e => {
  const b = e.target.closest("[data-ma]"); if (!b) return;
  if (b.dataset.ma === "copy") { try { await navigator.clipboard.writeText(mine().id); toast("Đã sao chép mã hồ sơ"); } catch (err) { toast("Mã hồ sơ: " + mine().id); } return; }
  b.disabled = true; const before = (mine() || {}).status; await refreshMine(); renderMyApp(); toast((mine() || {}).status === before ? "Hồ sơ chưa có thay đổi mới" : "Đã cập nhật trạng thái hồ sơ");
});

// ---- Sự kiện biểu mẫu ----
$("#dNext").addEventListener("click", next);
$("#dPrev").addEventListener("click", () => goStep(step - 1));
$("#dForm").addEventListener("submit", e => { e.preventDefault(); next(); });
$("#dForm").addEventListener("input", e => { if (e.target.id) { saveDraft(); if (e.target.classList.contains("bad")) setErr(e.target.id, ""); } });
$("#dForm").addEventListener("change", e => {
  const t = e.target;
  if (t.name === "vehicle") { F.vehicle = t.value; document.querySelectorAll(".vOpt").forEach(l => l.classList.toggle("on", l.contains(t) && t.checked)); setErr("dVeh", ""); saveDraft(); }
  else if (t.closest("#dSvc")) { F.svc = [...document.querySelectorAll("#dSvc input:checked")].map(i => i.value); setErr("dSvc", ""); saveDraft(); }
});
$("#dForm").addEventListener("click", e => {
  const c = e.target.closest(".sc");
  if (c) { const k = c.dataset.c, on = !F.sched.includes(k); F.sched = on ? [...F.sched, k] : F.sched.filter(x => x !== k); c.classList.toggle("on", on); c.setAttribute("aria-pressed", on); setErr("dSched", ""); saveDraft(); return; }
});
$("#dUps").addEventListener("click", e => { const c = e.target.closest("[data-cap]"); if (c) capture(c.dataset.cap); });
$("#dLive").addEventListener("click", e => { if (e.target.closest("[data-live]")) startLive(); });
$("#dForm").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") { e.preventDefault(); next(); }
  if ((e.key === "Enter" || e.key === " ") && (e.target.dataset.cap || e.target.dataset.live)) { e.preventDefault(); e.target.click(); }
});
// ---- Khởi tạo ----
buildStatic(); renderCalc(); goStep(1, false);
DOCS.forEach(d => showImg(d.k)); showImg("selfie"); renderKycRes();
renderMyApp();
refreshMine().then(() => renderMyApp());
ensureUser().then(u => {          // tự điền từ tài khoản GoNow nếu đã đăng nhập
  if (u && !u.isAnonymous) { if (!$("#dName").value && u.displayName) $("#dName").value = u.displayName; if (!$("#dEmail").value && u.email) $("#dEmail").value = u.email; }
});
if (location.hash === "#apply") setTimeout(() => $("#apply").scrollIntoView(), 50);