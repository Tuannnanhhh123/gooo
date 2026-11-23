// [AI] CẤU HÌNH TRANG QUẢN TRỊ – chỉ admin.html tải file này (trang khách không tải).
// Lưu ý: file vẫn nằm công khai trên web, nên KHÔNG dùng cho bảo mật thật.
//  - Chế độ Firebase (khuyên dùng): đăng nhập email + mật khẩu, email phải nằm trong ADMIN_EMAILS (và trong firestore.rules).
//    Chỉ chế độ này mới đồng bộ dữ liệu lên Firestore.
//  - Mã quản trị DEMO: chỉ để xem thử giao diện trên máy này, KHÔNG đồng bộ Firestore. Khi deploy hãy xóa dòng ADMIN_PASSCODE (đặt "").
const ADMIN_EMAILS = ["admin@gonow.vn"];
const ADMIN_PASSCODE = "gonow2026";
