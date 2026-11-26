// [AI] HỆ THỐNG CHỐNG SPAM / BOM HÀNG – chi phí 0đ (không SMS OTP, không dịch vụ trả phí). Thay thế guard.js cũ.
// KHÔNG DÙNG IP: không có dòng nào đọc/chặn theo địa chỉ IP, nên nhiều khách cùng dùng chung wifi quán cà phê vẫn đặt bình thường.
// Mọi giới hạn tính theo: TÀI KHOẢN (uid) và THIẾT BỊ (deviceId).
//
// 5 TẦNG BẢO VỆ (chỉnh con số ở GUARD bên dưới):
//  1. Định danh: chỉ nhận @gmail.com (đã xác minh email) + deviceId (vân tay trình duyệt + mã ngẫu nhiên lưu localStorage).
//  2. Tần suất: khóa nút ngay khi bấm (chống click đúp), 45 giây / đơn, tối đa 2 đơn đang chạy, tối đa 10 đơn / 24 giờ.
//  3. Điểm uy tín (trustScore, mặc định 100): hủy đơn liên tục → trừ điểm + khóa đặt 15 phút → 1 giờ → 24 giờ. Điểm thấp / tài khoản mới → hạn mức giá trị đơn thấp.
//  4. Dữ liệu & vị trí: kiểm tra tọa độ, khoảng cách điểm đón–đến (≥100m, ≤ bán kính phục vụ), GPS thiết bị lệch >5km → hỏi lại.
//  5. Backend: firestore.rules chặn bằng serverTimestamp, nên script/Postman cũng không vượt được tầng 2–3 (xem firestore.rules).
// Lưu ý trung thực: tầng 1, 4 và giới hạn "đơn đang chạy" chỉ chặn ở phía trình duyệt; tầng 2 (thời gian, 10 đơn/ngày) và tầng 3 chặn thật ở máy chủ.
const GUARD = {
  gmailOnly: true,
  minSeconds: 3,              // phải mở giỏ/xác nhận ít nhất ngần này giây mới bấm đặt được
  cooldownSec: 45,            // tối thiểu giữa 2 đơn của cùng tài khoản HOẶC cùng thiết bị (khớp firestore.rules)
  maxActive: 2,               // tổng đơn đang xử lý (đồ ăn + chuyến xe) của 1 tài khoản / 1 thiết bị
  maxActiveRide: 1,
  maxPerDay: 10,              // đơn / 24 giờ / tài khoản (khớp firestore.rules)
  warnAccountsPerDevice: 3,   // 1 thiết bị đăng nhập ≥ 3 tài khoản khác nhau: cảnh báo
  blockAccountsPerDevice: 5,  // ≥ 5: chặn tài khoản thứ 6 trở đi (khớp firestore.rules)
  cancel: {
    freeSec: 120,             // hủy trong 2 phút đầu = đặt nhầm, không trừ điểm
    windowHours: 24,
    points: { food: [1, 2, 4, 4, 4], ride: [1, 3, 3, 3, 3] },   // "độ nặng" theo trạng thái đơn lúc hủy
    scorePerPoint: 3,         // mỗi điểm nặng trừ 3 trustScore (tối thiểu 3 cho 1 lần hủy có tính; luật Firestore bắt buộc trừ ≥ 3)
    burstCount: 3,            // hủy ≥ 3 đơn (có tính) trong 1 giờ → khóa
    ratio: 0.6,               // hoặc tỷ lệ hủy ≥ 60% khi đã đặt ≥ 4 đơn trong 24 giờ
    ratioMinOrders: 4,
    lockMinutes: [15, 60, 1440],   // lần khóa thứ 1, 2, 3+ (tính trong 7 ngày)
    blockPenalty: 8           // bị khóa thì trừ thêm điểm
  },
  limits: {                   // giá trị đơn tối đa (đ)
    normal: 1500000,
    restricted: 300000,       // tài khoản mới (< newAccountHours) hoặc trustScore < lowScore
    newAccountHours: 24, lowScore: 70, blockScore: 20   // trustScore < blockScore: không được đặt
  },
  maxQtyPerItem: 20,
  maxFoodKm: 15, maxRideKm: 60, minRideKm: 0.1,   // bán kính phục vụ, điểm đón–đến tối thiểu 100m
  gpsFarKm: 5,                // GPS thiết bị cách điểm đón/giao > 5km → hỏi lại
  gpsTimeoutMs: 4000,
  blockedPhones: []
};

// ---------- Tiện ích ----------
const guardWait = ms => ms >= 3600000 ? `${Math.ceil(ms / 3600000)} giờ` : ms >= 60000 ? `${Math.ceil(ms / 60000)} phút` : `${Math.ceil(ms / 1000)} giây`;
const guardMs = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (+v || 0);     // Firestore Timestamp → ms
function guardHash(str) {                       // cyrb53 ×2 → chuỗi 20 ký tự (không phải mật mã, chỉ để gọn + khó đọc ngược)
  const h = seed => { let a = 0xdeadbeef ^ seed, b = 0x41c6ce57 ^ seed; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
    a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
    return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36); };
  return (h(1) + h(2)).slice(0, 20);
}
const guardKm = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const guardPoint = p => !!p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(+p.lat === 0 && +p.lng === 0);

// ---------- Tầng 1: deviceId ----------
// fp = hash(thông tin trình duyệt): nhiều máy giống hệt nhau (cùng đời iPhone, cùng ngôn ngữ) sẽ ra CÙNG fp → fp chỉ để tham khảo, KHÔNG dùng để chặn.
// deviceId = hash(fp + mã ngẫu nhiên tạo 1 lần, lưu localStorage) → riêng cho từng trình duyệt, nên người khác cùng đời máy không bị tính nhầm.
function guardFingerprint() {
  const n = navigator, s = window.screen || {};
  let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
  return [n.userAgent, n.language, (n.languages || []).join(","), n.platform, s.width + "x" + s.height, s.colorDepth, window.devicePixelRatio || 1,
    tz, new Date().getTimezoneOffset(), n.hardwareConcurrency || 0, n.deviceMemory || 0, n.maxTouchPoints || 0].join("|");
}
const DEVICE = (() => {
  const fp = guardHash(guardFingerprint());
  let d = load("gonow_device", null);
  if (!d || !d.id) {
    const salt = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    d = { id: "d" + guardHash(fp + "|" + salt), salt, created: Date.now() };
  }
  d.fp = fp; save("gonow_device", d);
  return d;
})();
const guardDeviceId = () => DEVICE.id;
const DEVV = { accounts: 0, warn: false, blocked: false };     // trạng thái "1 thiết bị – nhiều tài khoản"

// Chỉ nhận Gmail thật. Chặn kiểu abc+1@gmail.com (cùng một hộp thư nhưng tạo được vô số tài khoản).
const guardGmailOk = e => /^[a-z0-9._-]+@gmail\.com$/i.test(String(e || "").trim());

// ---------- Tầng 3: trustScore ----------
// Lưu ở Firestore trust/{uid} (chống xóa localStorage để "làm mới"); localStorage chỉ là bộ nhớ đệm.
// Máy khách chỉ được GIẢM điểm (luật Firestore), không tự tăng được. Admin khôi phục điểm bằng cách sửa tài liệu trust/{uid}.
const trustDefault = uid => ({ uid, score: 100, lockedUntil: 0, cancels: [], blocks: [], firstSeen: Date.now(), lastOrderAt: 0, dayStart: 0, dayCount: 0 });
let TRUST = null, PENDING_PENALTY = null;
function guardTrust() {
  const uid = (typeof myUid === "function") ? myUid() : "local";
  if (!TRUST || TRUST.uid !== uid) TRUST = { ...trustDefault(uid), ...(load("gonow_trust_" + uid, null) || {}), uid };
  return TRUST;
}
const guardSaveTrust = () => { if (TRUST) localStorage.setItem("gonow_trust_" + TRUST.uid, JSON.stringify(TRUST)); };
function guardApplyRemote(uid, d) {            // storage.js gọi khi Firestore trả trust/{uid} về
  TRUST = { ...trustDefault(uid), uid, score: d.score ?? 100, lockedUntil: guardMs(d.lockedUntil), lastOrderAt: guardMs(d.lastOrderAt),
    dayStart: guardMs(d.dayStart), dayCount: d.dayCount || 0, firstSeen: guardMs(d.firstSeen) || Date.now(), cancels: d.cancels || [], blocks: d.blocks || [] };
  guardSaveTrust();
}
const guardIsNewAccount = () => Date.now() - guardTrust().firstSeen < GUARD.limits.newAccountHours * 3600000;
function guardMaxTotal() { const t = guardTrust(); return (guardIsNewAccount() || t.score < GUARD.limits.lowScore) ? GUARD.limits.restricted : GUARD.limits.normal; }

async function guardRegisterDevice(uid) {      // ghi "thiết bị này có tài khoản uid"; đếm số tài khoản trên thiết bị
  if (typeof DB === "undefined" || !DB.fs) return;
  const ref = DB.fs.doc("devices/" + DEVICE.id), FV = firebase.firestore.FieldValue;
  try {
    const s = await ref.get();
    if (!s.exists) { await ref.set({ uids: [uid], created: FV.serverTimestamp() }); DEVV.accounts = 1; }
    else {
      const uids = s.data().uids || []; DEVV.accounts = uids.length;
      if (!uids.includes(uid)) {
        if (uids.length >= GUARD.blockAccountsPerDevice) DEVV.blocked = true;
        else { await ref.update({ uids: FV.arrayUnion(uid) }); DEVV.accounts = uids.length + 1; }
      }
    }
    DEVV.warn = DEVV.accounts >= GUARD.warnAccountsPerDevice;
  } catch (e) { console.warn("Thiết bị:", e.code || e); }
}
function guardOnLogin(u) {                     // app.js gọi khi đã đăng nhập thật (không phải ẩn danh)
  if (!u || u.isAnonymous) return;
  TRUST = null; guardTrust();
  if (typeof dbWatchTrust === "function") dbWatchTrust(u.uid);
  guardRegisterDevice(u.uid).then(() => { if (DEVV.blocked) toast("Thiết bị này đã đăng nhập quá nhiều tài khoản nên không thể đặt đơn."); else if (DEVV.warn) toast("Cảnh báo: thiết bị này đang dùng nhiều tài khoản. Vui lòng chỉ dùng tài khoản của bạn."); });
}

// ---------- Tầng 2: kiểm tra trước khi đặt ----------
let guardOpenedAt = Date.now();
const guardOpen = () => { guardOpenedAt = Date.now(); };               // gọi khi mở giỏ hàng / xác nhận chuyến

function guardCheck(kind, d) {                // trả chuỗi lý do nếu CHẶN, "" nếu cho phép
  const now = Date.now(), t = guardTrust(), day = 86400000;
  if (DEVV.blocked) return "Thiết bị này đã đăng nhập quá nhiều tài khoản nên không thể đặt đơn.";
  if (t.lockedUntil > now) return `Tạm thời chưa thể đặt đơn vì bạn đã hủy khá nhiều đơn gần đây. Thử lại sau ${guardWait(t.lockedUntil - now)}. (Hủy trong ${Math.round(GUARD.cancel.freeSec / 60)} phút đầu sau khi đặt không bị tính.)`;
  if (t.score < GUARD.limits.blockScore) return "Điểm uy tín của tài khoản quá thấp nên tạm thời không đặt được đơn. Vui lòng liên hệ hỗ trợ.";
  if (now - guardOpenedAt < GUARD.minSeconds * 1000) return "Bạn thao tác quá nhanh, vui lòng kiểm tra lại đơn rồi bấm đặt.";

  const last = Math.max(t.lastOrderAt || 0, DEVICE.lastOrder || 0);
  if (last && now - last < GUARD.cooldownSec * 1000) return `Bạn vừa đặt đơn xong, vui lòng đợi ${guardWait(GUARD.cooldownSec * 1000 - (now - last))} nữa.`;
  const dayN = (t.dayStart && now - t.dayStart < day) ? t.dayCount : 0;
  if (dayN >= GUARD.maxPerDay) return "Bạn đã đạt giới hạn số đơn trong ngày.";

  const list = (typeof orders !== "undefined" ? orders : []).filter(o => !o.cancelled && o.status < 4);
  const uid = myUid(), own = list.filter(o => o.uid === uid), dev = list.filter(o => o.deviceId === DEVICE.id);
  if (own.length >= GUARD.maxActive || dev.length >= GUARD.maxActive) return "Bạn đang có 2 đơn chưa hoàn tất. Hãy đợi các đơn đó xong hoặc hủy bớt rồi đặt tiếp.";
  if (kind === "ride" && own.filter(o => o.type === "ride").length >= GUARD.maxActiveRide) return "Bạn đang có một chuyến xe chưa hoàn thành.";

  const cap = guardMaxTotal();
  if (d.total > cap) return `Đơn tối đa ${money(cap)} với ${guardIsNewAccount() ? "tài khoản mới (dưới " + GUARD.limits.newAccountHours + " giờ)" : "điểm uy tín hiện tại"}. Vui lòng giảm bớt hoặc tách đơn.`;

  if (kind === "food") {
    if ((d.items || []).some(i => i.qty > GUARD.maxQtyPerItem)) return `Mỗi món tối đa ${GUARD.maxQtyPerItem} phần.`;
    const p = d.phone || "";
    if (GUARD.blockedPhones.includes(p)) return "Số điện thoại này không thể đặt hàng.";
    if (/^(\d)\1{9}$/.test(p) || /^0(123456789|987654321)$/.test(p) || /(\d)\1{6}$/.test(p)) return "Số điện thoại có vẻ không thật, vui lòng kiểm tra lại.";
    if (list.filter(o => o.phone === p).length >= GUARD.maxActive) return "Số điện thoại này đang có nhiều đơn chưa giao xong.";
    const a = (d.addr || "").trim(), flat = a.replace(/[\s,.\-\/]/g, "");
    if (!/\s/.test(a) || /^(.)\1+$/.test(flat) || /^\d+$/.test(flat)) return "Địa chỉ giao hàng chưa hợp lệ, vui lòng nhập đầy đủ số nhà, đường, quận.";
    const n = d.note || "";
    if (n.length > 200) return "Ghi chú tối đa 200 ký tự.";
    if (/(https?:|www\.|\.com\b|\.vn\b|\.net\b)/i.test(n + " " + a)) return "Ghi chú/địa chỉ không được chứa đường dẫn website.";
  }
  return "";
}

// ---------- Tầng 4: dữ liệu & vị trí thực tế ----------
function guardDevicePos() {                    // GPS hiện tại của thiết bị; không có/không cho phép → null (không chặn)
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) }), () => res(null),
      { enableHighAccuracy: false, timeout: GUARD.gpsTimeoutMs, maximumAge: 300000 });
  });
}
// in:  { kind, from:{lat,lng}|null, to:{lat,lng}|null, km }   (food: `to` = nơi giao; ride: `from` = điểm đón, `to` = điểm đến)
// out: { block:"lý do chặn" | "", confirm:"câu hỏi xác nhận lại" | "", gps:{lat,lng,acc,distKm}|null }
async function guardGeo(g) {
  const out = { block: "", confirm: "", gps: null };
  const pts = [g.from, g.to].filter(Boolean);
  if (pts.some(p => !guardPoint(p))) { out.block = "Tọa độ vị trí không hợp lệ. Hãy chọn lại địa chỉ trên bản đồ."; return out; }
  if (g.kind === "ride") {
    if (g.from && g.to) {
      const km = guardKm(g.from, g.to);
      if (km < GUARD.minRideKm) { out.block = "Điểm đón và điểm đến quá gần nhau (dưới 100 m). Hãy chọn lại điểm đến."; return out; }
      if (km > GUARD.maxRideKm) { out.block = `Quãng đường vượt bán kính phục vụ (${GUARD.maxRideKm} km).`; return out; }
    } else if (g.km && g.km > GUARD.maxRideKm) { out.block = `Quãng đường vượt bán kính phục vụ (${GUARD.maxRideKm} km).`; return out; }
  } else if (g.km && g.km > GUARD.maxFoodKm) { out.block = `Địa chỉ giao nằm ngoài bán kính phục vụ của quán (${GUARD.maxFoodKm} km).`; return out; }
  const ref = g.kind === "ride" ? g.from : g.to;                 // điểm mà thiết bị đáng lẽ phải ở gần
  if (ref) {
    const pos = await guardDevicePos();
    if (pos && guardPoint(pos)) {
      const d = Math.round(guardKm(pos, ref) * 10) / 10;
      out.gps = { ...pos, distKm: d };
      if (d > GUARD.gpsFarKm) out.confirm = g.kind === "ride"
        ? `Vị trí hiện tại của bạn cách điểm đón khoảng ${d} km. Bạn có chắc muốn đón xe ở đó không?`
        : `Vị trí hiện tại của bạn cách địa chỉ giao khoảng ${d} km. Bạn có đang đặt giúp người khác không?`;
    }
  }
  return out;
}

// ---------- Ghi nhận đơn ----------
// Trường gửi kèm khi tạo đơn (storage.js gộp vào cùng 1 batch với đơn → luật Firestore kiểm tra bằng getAfter()).
function guardBatchFields(ts) {
  const t = guardTrust(), now = Date.now(), fresh = !t.dayStart || now - t.dayStart >= 86400000;
  return fresh ? { lastOrderAt: ts, dayStart: ts, dayCount: 1 } : { lastOrderAt: ts, dayCount: (t.dayCount || 0) + 1 };
}
function guardRecord() {                      // gọi ngay sau khi đặt đơn thành công (cập nhật bản ghi cục bộ)
  const t = guardTrust(), now = Date.now(), fresh = !t.dayStart || now - t.dayStart >= 86400000;
  t.lastOrderAt = now; if (fresh) { t.dayStart = now; t.dayCount = 1; } else t.dayCount = (t.dayCount || 0) + 1;
  DEVICE.lastOrder = now; save("gonow_device", DEVICE); guardSaveTrust();
}

// Gọi khi khách hủy đơn o. Trả câu nhắc/thông báo ("" = không cần nói gì).
function guardCancel(o) {
  const now = Date.now(), t = guardTrust(), C = GUARD.cancel, win = C.windowHours * 3600000;
  const kind = o && o.type === "ride" ? "ride" : "food", table = C.points[kind];
  const st = Math.max(0, Math.min(table.length - 1, (o && o.status) || 0));
  const free = !o || !o.ts || now - o.ts <= C.freeSec * 1000;                // hủy ngay sau khi đặt = đặt nhầm
  if (free) return "";                                                         // không trừ điểm, không ghi nhận
  const p = table[st];
  const cancels = [...(t.cancels || []).filter(x => now - x.t < win), { t: now, p }].slice(-40);
  const hourN = cancels.filter(x => now - x.t < 3600000).length, dayN = (t.dayStart && now - t.dayStart < 86400000) ? t.dayCount : 0;
  const ratioHigh = dayN >= C.ratioMinOrders && cancels.length / dayN >= C.ratio;
  let score = Math.max(0, t.score - Math.max(3, p * C.scorePerPoint)), until = t.lockedUntil, blocks = (t.blocks || []).filter(x => now - x < 7 * 86400000), msg = "";
  if (hourN >= C.burstCount || ratioHigh) {
    const mins = C.lockMinutes[Math.min(blocks.length, C.lockMinutes.length - 1)];   // 15 phút → 1 giờ → 24 giờ
    if (until <= now) { blocks = [...blocks, now]; score = Math.max(0, score - C.blockPenalty); }
    until = Math.max(until, now + mins * 60000);
    msg = `Bạn đã hủy khá nhiều đơn nên tạm thời chưa đặt được trong ${guardWait(until - now)}.`;
  } else if (hourN === C.burstCount - 1) msg = "Bạn đã hủy khá nhiều đơn gần đây. Hủy thêm có thể khiến bạn tạm thời không đặt được đơn.";
  Object.assign(t, { cancels, blocks, score, lockedUntil: until }); guardSaveTrust();
  PENDING_PENALTY = { cancels, blocks, score, ...(until > now ? { lockedUntil: until } : {}) };
  return msg;
}
// storage.js lấy phần "phạt" để ghi cùng batch với việc hủy đơn (luật Firestore bắt buộc: hủy muộn mà không bị trừ điểm sẽ bị từ chối).
function guardTakePenalty() {
  const p = PENDING_PENALTY; PENDING_PENALTY = null; if (!p) return null;
  const out = { ...p }; if (out.lockedUntil) out.lockedUntil = firebase.firestore.Timestamp.fromMillis(out.lockedUntil); return out;
}

// Chống click đúp: khóa nút ngay khi bấm, mở lại khi xong. Dùng: guardOnce(async () => {...})
let guardBusy = false;
async function guardOnce(fn) {
  if (guardBusy) return;
  guardBusy = true;
  const btns = [...document.querySelectorAll('[data-act="confirm"]')];
  btns.forEach(b => { b.disabled = true; b.dataset.lbl = b.textContent; b.textContent = "Đang xử lý…"; b.setAttribute("aria-busy", "true"); });
  try { return await fn(); }
  finally { guardBusy = false; btns.forEach(b => { if (b.isConnected) { b.disabled = false; b.textContent = b.dataset.lbl || b.textContent; b.removeAttribute("aria-busy"); } }); }
}