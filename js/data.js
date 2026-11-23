// [AI] Toàn bộ dữ liệu bên dưới là DỮ LIỆU MÔ PHỎNG, không lấy từ API thật.
// ẢNH: mặc định web tìm images/food/<id>.jpg và images/store/<id>.jpg. Muốn dùng ảnh khác tên/đuôi (png, webp...),
// thêm thuộc tính img cho món/cửa hàng, ví dụ: { id: 1, name: "Phở bò", ..., img: "images/food/pho-bo.png" }
const FOODS = [
  { id: 1, name: "Phở bò", price: 55000, cat: "Món nước", rating: 4.8, desc: "Nước dùng hầm xương 12 giờ" },
  { id: 2, name: "Bún chả", price: 50000, cat: "Món nước", rating: 4.6, desc: "Chả nướng than hoa, nước chấm đậm vị" },
  { id: 3, name: "Cơm tấm sườn", price: 48000, cat: "Cơm", rating: 4.7, desc: "Sườn nướng, bì, chả trứng" },
  { id: 4, name: "Cơm gà xối mỡ", price: 45000, cat: "Cơm", rating: 4.4, desc: "Da giòn, thịt mềm" },
  { id: 5, name: "Bánh mì thịt", price: 25000, cat: "Ăn vặt", rating: 4.5, desc: "Giòn nóng, pate nhà làm" },
  { id: 6, name: "Gỏi cuốn (4 cuốn)", price: 35000, cat: "Ăn vặt", rating: 4.3, desc: "Tôm thịt, rau tươi, tương đậu phộng" },
  { id: 7, name: "Pizza hải sản", price: 129000, cat: "Pizza & Burger", rating: 4.6, desc: "Đế mỏng, phô mai kéo sợi" },
  { id: 8, name: "Burger bò phô mai", price: 79000, cat: "Pizza & Burger", rating: 4.5, desc: "Bò xay nướng, phô mai tan chảy" },
  { id: 9, name: "Trà sữa trân châu", price: 39000, cat: "Đồ uống", rating: 4.7, desc: "Trà đậm, trân châu dai" },
  { id: 10, name: "Cà phê sữa đá", price: 29000, cat: "Đồ uống", rating: 4.9, desc: "Robusta rang đậm" },
  // [AI] Thêm món mới (id 11–17) để trang chủ có nhiều danh mục hơn
  { id: 11, name: "Bún bò Huế", price: 52000, cat: "Món nước", rating: 4.7, desc: "Nước lèo đậm đà, giò heo mềm" },
  { id: 12, name: "Mì Quảng", price: 45000, cat: "Món nước", rating: 4.5, desc: "Sợi mì vàng, tôm thịt, bánh tráng giòn" },
  { id: 13, name: "Sinh tố bơ", price: 35000, cat: "Đồ uống", rating: 4.6, desc: "Bơ sáp xay mịn, sữa đặc" },
  { id: 14, name: "Chè thập cẩm", price: 30000, cat: "Tráng miệng", rating: 4.4, desc: "Đậu, thạch, nước cốt dừa" },
  { id: 15, name: "Bánh flan", price: 22000, cat: "Tráng miệng", rating: 4.6, desc: "Mềm mịn, caramel đắng nhẹ" },
  { id: 16, name: "Cơm chay thập cẩm", price: 40000, cat: "Món chay", rating: 4.3, desc: "Đậu hũ, nấm, rau củ xào" },
  { id: 17, name: "Đậu hũ sốt nấm", price: 38000, cat: "Món chay", rating: 4.2, desc: "Đậu hũ non, sốt nấm đông cô" }
];

// [AI] Cửa hàng MÔ PHỎNG (tên tự đặt). district + near (km) dùng để tính khoảng cách từ khu vực người dùng chọn.
// cats = các danh mục món mà cửa hàng bán (bấm vào cửa hàng sẽ hiện các món thuộc danh mục đó).
// promos = mã trong VOUCHERS được hiển thị dưới dạng nhãn ưu đãi.
const STORES = [
  { id: 1,  name: "Phở Gia Truyền Cô Lan",    district: "Quận 1",     near: 0.4, rating: 4.8, cats: ["Món nước"],                 promos: ["FOOD10", "FREESHIP"] },
  { id: 2,  name: "Bún Chả Phố Cổ",           district: "Quận 3",     near: 0.6, rating: 4.6, cats: ["Món nước"],                 promos: ["FOOD10"] },
  { id: 3,  name: "Cơm Tấm Sườn Bì Chả",      district: "Bình Thạnh", near: 0.5, rating: 4.7, cats: ["Cơm"],                      promos: ["FOOD10", "FREESHIP"] },
  { id: 4,  name: "Cơm Gà Xối Mỡ Chú Tư",     district: "Tân Bình",   near: 0.8, rating: 4.4, cats: ["Cơm"],                      promos: ["FREESHIP"] },
  { id: 5,  name: "Tiệm Bánh Mì Nóng",        district: "Quận 1",     near: 1.1, rating: 4.5, cats: ["Ăn vặt"],                   promos: ["FOOD10"] },
  { id: 6,  name: "Gỏi Cuốn Nhà Làm",         district: "Quận 7",     near: 0.7, rating: 4.3, cats: ["Ăn vặt"],                   promos: [] },
  { id: 7,  name: "Pizza Lò Củi",             district: "Quận 3",     near: 1.2, rating: 4.6, cats: ["Pizza & Burger"],           promos: ["FOOD10", "FREESHIP"] },
  { id: 8,  name: "Burger Lửa Than",          district: "Thủ Đức",    near: 0.9, rating: 4.5, cats: ["Pizza & Burger"],           promos: ["FREESHIP"] },
  { id: 9,  name: "Trà Sữa Trân Châu 39",     district: "Quận 7",     near: 0.5, rating: 4.7, cats: ["Đồ uống"],                  promos: ["FOOD10"] },
  { id: 10, name: "Cà Phê Robusta Sài Gòn",   district: "Quận 1",     near: 0.3, rating: 4.9, cats: ["Đồ uống"],                  promos: ["FOOD10"] },
  { id: 11, name: "Quán Ăn Gia Đình Bảy",     district: "Bình Thạnh", near: 1.4, rating: 4.2, cats: ["Món nước", "Cơm"],          promos: ["FREESHIP"] },
  { id: 12, name: "Góc Ăn Vặt Sinh Viên",     district: "Thủ Đức",    near: 0.6, rating: 4.1, cats: ["Ăn vặt", "Đồ uống"],        promos: ["FOOD10"] },
  { id: 13, name: "Chè & Flan Dì Ba",         district: "Quận 3",     near: 0.9, rating: 4.5, cats: ["Tráng miệng"],             promos: ["FOOD10"] },
  { id: 14, name: "Quán Chay An Nhiên",       district: "Tân Bình",   near: 1.0, rating: 4.4, cats: ["Món chay"],                 promos: ["FOOD10", "FREESHIP"] }
];

// Loại xe: giá mở cửa (đ), giá mỗi km (đ), tốc độ trung bình (km/h) để ước tính thời gian
const VEHICLES = {
  bike: { name: "Xe máy", desc: "Nhanh, tiết kiệm, 1 khách", base: 12000, perKm: 6000, speed: 28 },
  car4: { name: "Ô tô 4 chỗ", desc: "Thoải mái, tối đa 4 khách", base: 25000, perKm: 12000, speed: 24 },
  car7: { name: "Ô tô 7 chỗ", desc: "Rộng rãi, tối đa 7 khách", base: 35000, perKm: 15000, speed: 22 }
};

// Tọa độ GIẢ ĐỊNH (km) trên một lưới tự đặt, dùng để mô phỏng khoảng cách
const DISTRICTS = {
  "Quận 1": [0, 0], "Quận 3": [-1, 1.5], "Quận 7": [2, -6], "Bình Thạnh": [2, 3],
  "Tân Bình": [-6, 4], "Thủ Đức": [10, 6]
};

const VOUCHERS = {
  FOOD10: { type: "food", pct: 10, text: "Giảm 10% đơn đồ ăn" },
  RIDE15: { type: "ride", pct: 15, text: "Giảm 15% chuyến xe" },
  FREESHIP: { type: "food", freeship: true, min: 100000, text: "Miễn phí giao cho đơn từ 100.000đ" }
};

let SHIP_FEE = 15000;   // admin có thể chỉnh (lưu ở gonow_settings)
const FOOD_STEPS = ["Chờ xác nhận", "Đang tìm tài xế", "Nhà hàng chuẩn bị", "Đang giao hàng", "Đã giao"];
const RIDE_STEPS = ["Đang tìm tài xế", "Đã có tài xế", "Tài xế đang đến", "Đang di chuyển", "Hoàn thành"];
