// [AI] CẤU HÌNH RIÊNG CỦA BẠN – chỉ cần sửa file này.

// 1) CAROUSEL Ở ĐẦU TRANG CHỦ (hero). Mỗi phần tử trong danh sách là 1 slide, tự chuyển mỗi 6 giây.
//    - img:   ảnh nền của slide. Tự làm ảnh rồi đặt vào thư mục images/hero/ (khuyên dùng ngang 1600×700, dưới 400KB, đuôi .jpg/.webp).
//             Chưa có ảnh thì slide hiện nền màu, trang vẫn chạy bình thường.
//    - title: tiêu đề lớn (tối đa ~10 từ; dùng <br> để xuống dòng).
//    - text:  dòng mô tả ngắn (để "" nếu không cần). Có thể dùng <b>chữ đậm</b>.
//    - cta:   chữ trên nút (nên là lời kêu gọi cụ thể, vd "Đặt món ngay"). act: nút làm gì:
//             "toFoods" (xuống thực đơn) | "toPromos" (xuống ưu đãi) | "ride" (mở Đặt xe, id: "bike"/"car4"/"car7") | "toStores" (xuống quán)
//    Muốn thêm/bớt slide: thêm/bớt một dòng { ... }, trong khoảng 1–5 slide là đẹp nhất.
const HERO_SLIDES = [
  { img: "images/hero/1.jpg", title: "Đói bụng? Món ngon<br>đến tận cửa nhà bạn", text: "<b>FOOD10</b> giảm 10% • <b>FREESHIP</b> miễn phí giao từ 100.000đ", cta: "Đặt món ngay", act: "toFoods" },
  { img: "images/hero/2.jpg", title: "Đặt xe nhanh,<br>giá rõ ràng theo từng km", text: "Nhập <b>RIDE15</b> để giảm 15% chuyến xe", cta: "Đặt xe ngay", act: "ride", id: "bike" },
  { img: "images/hero/3.jpg", title: "Ưu đãi mới<br>mỗi ngày tại GoNow", text: "Những món được chấm điểm cao nhất, kèm mã giảm giá", cta: "Xem ưu đãi", act: "toPromos" }
];

// 2) Tài khoản MB Bank nhận tiền. Mã QR được tạo tự động theo số tiền + mã đơn.
//    accountName: tên chủ tài khoản viết HOA, không dấu (đúng như trên app MB).
const BANK = {
  bankId: "MB",
  bankName: "MB Bank",
  accountNo: "0343758848",   // <-- thay bằng số tài khoản MB của bạn, ví dụ "0123456789"
  accountName: "Tran Le Tuan Anh"       // <-- thay bằng tên chủ tài khoản
};

// 3) Firebase Authentication (Project settings → Your apps → Web app → SDK setup and configuration).
//    Cần bật Authentication → Sign-in method → Email/Password.
//    Để nguyên "DIEN_..." thì trang đăng nhập chạy ở chế độ demo (không kiểm tra mật khẩu).
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB7EaeaHVADPXSa-DymkDMhuHZro8-T0Bw",
  authDomain: "gonow-66519.firebaseapp.com",
  projectId: "gonow-66519",
  appId: "1:819176062656:web:1134efa405aee8716cb725"
};

// 4) Cấu hình trang quản trị đã chuyển sang js/admin-config.js (chỉ admin.html tải file đó).

// 5) BẢN ĐỒ cho trang Đặt xe (hiện vị trí của khách, chọn nơi đến, tính tiền theo km).
//    - Để GOOGLE_MAPS_KEY = ""  → dùng OpenStreetMap, MIỄN PHÍ, không cần tài khoản hay thẻ thanh toán (mặc định).
//      Dữ liệu bản đồ/tìm địa chỉ/đường đi lấy từ OpenStreetMap, Photon và OSRM (máy chủ công cộng, phù hợp dự án học tập).
//    - Muốn dùng Google Maps thì điền key (Google bắt buộc có tài khoản thanh toán, nhưng có hạn mức miễn phí hằng tháng):
//        1. https://console.cloud.google.com → tạo Project → bật Billing.
//        2. APIs & Services → Library → bật: Maps JavaScript API, Places API (New), Geocoding API, Routes API.
//        3. Credentials → Create credentials → API key. Ở "Application restrictions" chọn "Websites" rồi thêm:
//             https://TEN-GITHUB-CUA-BAN.github.io/*      (và http://localhost:*  để chạy thử trên máy)
//        4. Dán key vào GOOGLE_MAPS_KEY bên dưới, lưu, đẩy lên GitHub.
//    Nếu bản đồ không tải được (mất mạng...), trang tự quay về chế độ chọn quận mô phỏng.
const GOOGLE_MAPS_KEY = "";
const GOOGLE_MAP_ID = "DEMO_MAP_ID";   // chỉ dùng khi có key Google, có thể giữ nguyên