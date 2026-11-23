// [AI] LỚP CHỐNG SPAM / BOM HÀNG (chạy trên trình duyệt). Chỉnh các con số ở GUARD bên dưới.
// Lưu ý: đây là lớp chặn ở phía khách – người rành kỹ thuật vẫn có thể vượt qua. Muốn chặn thật cần thêm luật Firestore / App Check.
const GUARD = {
  minSeconds: 3,            // phải mở giỏ/xác nhận ít nhất ngần này giây mới được bấm đặt (chặn bấm tự động)
  cooldownSec: 45,          // khoảng cách tối thiểu giữa 2 lần đặt trên cùng thiết bị
  maxPerHour: 4,            // tối đa số đơn / giờ / thiết bị
  maxPerDay: 10,            // tối đa số đơn / 24 giờ / thiết bị
  maxActiveFood: 3,         // số đơn đồ ăn đang xử lý tối đa (chưa giao, chưa hủy)
  maxActiveRide: 1,         // số chuyến xe đang xử lý tối đa
  maxCancelPerDay: 3,       // hủy quá số này trong 24 giờ → tạm khóa đặt đơn
  blockHours: 24,           // thời gian khóa
  maxQtyPerItem: 20,        // tối đa số lượng 1 món
  maxCodTotal: 1500000,     // đơn trả tiền mặt tối đa (đ)
  maxCodGuest: 800000,      // khách chưa đăng nhập: tối đa (đ), cao hơn phải đăng nhập
  blockedPhones: []         // số điện thoại bị chặn, ví dụ ["0900000001"]
};

const GUARD_KEY = "gonow_guard";
let guardOpenedAt = Date.now();
const guardState = () => { const g = load(GUARD_KEY, null) || {}; return { t: g.t || [], c: g.c || [], until: g.until || 0 }; };
const guardOpen = () => { guardOpenedAt = Date.now(); };               // gọi khi mở giỏ hàng / xác nhận chuyến
const guardWait = ms => ms >= 3600000 ? `${Math.ceil(ms / 3600000)} giờ` : ms >= 60000 ? `${Math.ceil(ms / 60000)} phút` : `${Math.ceil(ms / 1000)} giây`;

// Trả về chuỗi lý do nếu phải CHẶN, "" nếu cho phép. kind: "food" | "ride"
function guardCheck(kind, d) {
  const now = Date.now(), g = guardState(), day = 86400000, hour = 3600000;
  if (g.until > now) return `Tạm thời chưa thể đặt đơn (đã hủy nhiều đơn liên tiếp). Thử lại sau ${guardWait(g.until - now)}.`;
  if (now - guardOpenedAt < GUARD.minSeconds * 1000) return "Bạn thao tác quá nhanh, vui lòng kiểm tra lại đơn rồi bấm đặt.";

  const t = g.t.filter(x => now - x < day);
  const last = t.length ? Math.max(...t) : 0;
  if (last && now - last < GUARD.cooldownSec * 1000) return `Bạn vừa đặt đơn xong, vui lòng đợi ${guardWait(GUARD.cooldownSec * 1000 - (now - last))} nữa.`;
  if (t.filter(x => now - x < hour).length >= GUARD.maxPerHour) return "Bạn đã đặt quá nhiều đơn trong 1 giờ. Vui lòng thử lại sau.";
  if (t.length >= GUARD.maxPerDay) return "Bạn đã đạt giới hạn số đơn trong ngày.";

  const active = o => !o.cancelled && o.status < 4;
  const mine = (typeof orders !== "undefined" ? orders : []).filter(o => o.type === kind && active(o));
  const own = mine.filter(o => o.uid === myUid());
  if (own.length >= (kind === "food" ? GUARD.maxActiveFood : GUARD.maxActiveRide))
    return kind === "food" ? "Bạn đang có nhiều đơn chưa giao xong. Hãy đợi các đơn đó hoàn tất hoặc hủy bớt." : "Bạn đang có một chuyến xe chưa hoàn thành.";

  if (d.total > GUARD.maxCodTotal) return `Đơn trả tiền mặt tối đa ${money(GUARD.maxCodTotal)}. Vui lòng giảm bớt hoặc tách đơn.`;
  if (!user && d.total > GUARD.maxCodGuest) return `Đơn từ ${money(GUARD.maxCodGuest)} cần đăng nhập để đặt.`;

  if (kind === "food") {
    if ((d.items || []).some(i => i.qty > GUARD.maxQtyPerItem)) return `Mỗi món tối đa ${GUARD.maxQtyPerItem} phần.`;
    const p = d.phone || "";
    if (GUARD.blockedPhones.includes(p)) return "Số điện thoại này không thể đặt hàng.";
    if (/^(\d)\1{9}$/.test(p) || /^0(123456789|987654321)$/.test(p) || /(\d)\1{6}$/.test(p)) return "Số điện thoại có vẻ không thật, vui lòng kiểm tra lại.";
    if (mine.filter(o => o.phone === p).length >= GUARD.maxActiveFood) return "Số điện thoại này đang có nhiều đơn chưa giao xong.";
    const a = (d.addr || "").trim(), flat = a.replace(/[\s,.\-\/]/g, "");
    if (!/\s/.test(a) || /^(.)\1+$/.test(flat) || /^\d+$/.test(flat)) return "Địa chỉ giao hàng chưa hợp lệ, vui lòng nhập đầy đủ số nhà, đường, quận.";
    const n = d.note || "";
    if (n.length > 200) return "Ghi chú tối đa 200 ký tự.";
    if (/(https?:|www\.|\.com\b|\.vn\b|\.net\b)/i.test(n + " " + a)) return "Ghi chú/địa chỉ không được chứa đường dẫn website.";
  }
  return "";
}

function guardRecord() {                                      // gọi ngay sau khi đặt đơn thành công
  const now = Date.now(), g = guardState();
  save(GUARD_KEY, { ...g, t: [...g.t.filter(x => now - x < 86400000), now].slice(-30) });
}
function guardCancel() {                                      // gọi khi khách hủy đơn
  const now = Date.now(), g = guardState();
  const c = [...g.c.filter(x => now - x < 86400000), now];
  save(GUARD_KEY, { ...g, c: c.slice(-30), until: c.length >= GUARD.maxCancelPerDay ? now + GUARD.blockHours * 3600000 : g.until });
}