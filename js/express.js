
/* [AI] GoNow Express — Giao diện 5 bước chuẩn GrabExpress (Độc lập hoàn toàn với HTML/CSS cũ) */
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  const SERVICES = [
    { id: 'priority', name: 'Ưu Tiên', desc: 'Lấy hàng ngay, giao hỏa tốc', eta: 'Lấy hàng trong vòng 15 phút', base: 18000, icon: '⚡', color: '#7c3aed' },
    { id: 'fast', name: 'Nhanh', desc: 'Lấy hàng 15 phút, giao nhanh 1 giờ', eta: 'Lấy hàng trong 15–20 phút', base: 14000, icon: '🚀', color: '#0284c7' },
    { id: 'saver', name: 'Tiết Kiệm', desc: 'Giá siêu rẻ, giao trong ngày', eta: 'Giao trước 18:00 hôm nay', base: 11000, icon: '🏷️', color: '#059669' },
    { id: 'van_priority', name: 'Tải Van Ưu Tiên', desc: 'Lấy hàng ngay, giao hỏa tốc', eta: 'Lấy hàng ngay lập tức', base: 65000, icon: '🚐', color: '#7c3aed', isVan: true },
    { id: 'van_fast', name: 'Tải Van Nhanh', desc: 'Lấy hàng nhanh, giá tốt hơn', eta: 'Lấy hàng trong 25 phút', base: 50000, icon: '🚚', color: '#0284c7', isVan: true }
  ];

  const VEHICLES = [
    { id: 'bike', name: 'Xe máy', spec: 'Hàng hóa tối đa 30kg (50×40×50cm)', mult: 1.0, icon: '🛵' },
    { id: 'van500', name: 'Xe Tải/ Van 500kg', spec: 'Lên tới 500kg (160×120×120cm)', mult: 2.8, icon: '🚐' },
    { id: 'van1000', name: 'Xe Tải/ Van 1000kg', spec: 'Lên tới 1000kg (200×150×150cm)', mult: 3.8, icon: '🚚' }
  ];

  const ADDONS = [
    { id: 'cod', name: 'Thu tiền hộ (COD)', desc: '', price: 5000 },
    { id: 'hand', name: 'Giao tận tay', desc: 'Cần liên hệ tòa nhà hỗ trợ', price: 10000 },
    { id: 'bulky', name: 'Giao hàng cỡ lớn', desc: 'Lên đến 50kg, 60×70×60cm', price: 15000 },
    { id: 'load2', name: 'Bốc xếp 2 chiều', desc: 'Tối đa 50m từ điểm lấy/trả hàng', price: 88000 },
    { id: 'load1', name: 'Bốc xếp 1 chiều', desc: 'Tối đa 50m từ điểm lấy/trả hàng', price: 44000 },
    { id: 'stair2', name: 'Bốc xếp lên/xuống lầu 2 chiều', desc: 'Chỉ áp dụng đến 1 lầu/hầm', price: 137000 },
    { id: 'stair1', name: 'Bốc xếp lên/xuống lầu 1 chiều', desc: 'Chỉ áp dụng đến 1 lầu/hầm', price: 69000 },
    { id: 'wait', name: 'Phí Chờ', desc: 'Tài xế chờ trên 15 phút tại điểm giao/nhận', price: 59000 }
  ];

  const QUICK_PLACES = [
    { short: 'Internati...', title: 'Ga Quốc Tế - Nhà Ga 2 (T2) - Sân Bay Tân Sơn Nhất', sub: 'Trường Sơn, P.Tân Sơn Hòa, TP.Hồ Chí Minh', lat: 10.8165, lng: 106.6644 },
    { short: 'Domesti...', title: 'Domestic Terminal - Terminal 1 (T1) - Tân Sơn Nhất', sub: 'Trường Sơn, P.2, Tân Bình, TP.Hồ Chí Minh', lat: 10.8132, lng: 106.6625 },
    { short: 'Vinhomes...', title: 'Vinhomes Central Park - Landmark 81', sub: '720A Điện Biên Phủ, Bình Thạnh, TP.HCM', lat: 10.7950, lng: 106.7218 },
    { short: 'Chợ Bến...', title: 'Chợ Bến Thành - Quận 1', sub: 'Lê Lợi, P.Bến Thành, Quận 1, TP.HCM', lat: 10.7725, lng: 106.6980 }
  ];

  const ITEM_CATS = [
    { label: 'Thực phẩm', icon: '🍴' },
    { label: 'Quần áo', icon: '👕' },
    { label: 'Điện tử', icon: '📱' },
    { label: 'Tài liệu', icon: '📄' },
    { label: 'Khác', icon: '📦' }
  ];

  const state = {
    step: 'step1_home', // step1_home -> step2_map -> step3_contact -> step4_service -> step5_detail -> step5b_item -> step6_review
    modal: null,
    toast: '',
    pickup: { title: '86 Street No.27', sub: 'P.Tân Quy, Quận 7, TP.Hồ Chí Minh', floor: '', name: 'Tuấn Anh', phone: '+84343758848', note: '', lat: 10.7412, lng: 106.7128 },
    dropoff: { title: '', sub: '', floor: '', name: '', phone: '', note: '', lat: 10.8165, lng: 106.6644 },
    mapTarget: 'dropoff',
    tempPin: { ...QUICK_PLACES[0] },
    serviceId: 'priority',
    vehicleId: 'bike',
    promoActive: true,
    promoCode: 'Ưu Tiên - Giảm 15% 7h-20h',
    item: { confirmed: false, size: 'S', weight: '', cat: '', photo: '' },
    addons: new Set()
  };

  let mapInstance = null;
  let mapMarker = null;

  const money = n => Math.round(n).toLocaleString('vi-VN') + 'đ';
  const esc = s => String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  function injectStyles() {
    if ($('#gexIsolatedStyles')) return;
    const st = document.createElement('style');
    st.id = 'gexIsolatedStyles';
    st.textContent = `
      #gexV2Root {
        position: fixed !important;
        inset: 0 !important;
        z-index: 99999 !important;
        background: #f5f7f9 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        color: #111827 !important;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #gexV2Root[hidden] { display: none !important; }
      #gexV2Root * { box-sizing: border-box; }
      .gex2Shell {
        position: relative;
        width: 100%;
        max-width: 520px;
        height: 100%;
        margin: 0 auto;
        background: #f5f7f9;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .gex2Scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 115px;
      }
      /* Bước 1: Trang chủ */
      .gex2Hero {
        background: linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%);
        padding: 14px 18px 46px;
      }
      .gex2TopBar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .gex2RoundBtn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: rgba(255,255,255,0.9);
        border: none;
        font-size: 18px;
        font-weight: 700;
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      .gex2HeroRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .gex2HeroRow h2 { margin: 0 0 4px; font-size: 20px; font-weight: 800; color: #064e3b; }
      .gex2HeroRow p { margin: 0; font-size: 14.5px; font-weight: 600; color: #065f46; }
      .gex2RouteCard {
        background: #fff;
        margin: -30px 16px 0;
        border-radius: 18px;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.08);
      }
      .gex2Dots { display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .gex2DotB { width: 12px; height: 12px; border-radius: 50%; border: 3px solid #2563eb; background: #fff; }
      .gex2DotL { width: 2px; height: 26px; border-left: 2px dashed #cbd5e1; }
      .gex2DotR { width: 12px; height: 12px; border-radius: 50%; border: 3px solid #ef4444; background: #fff; }
      .gex2AddrRow { padding: 7px 0; cursor: pointer; }
      .gex2AddrRow + .gex2AddrRow { border-top: 1px solid #f1f5f9; }
      .gex2AddrVal { font-size: 15.5px; font-weight: 700; color: #111827; }
      .gex2AddrPh { font-size: 15.5px; font-weight: 600; color: #6b7280; }
      .gex2Chips {
        display: flex;
        gap: 10px;
        overflow-x: auto;
        padding: 14px 16px 4px;
        scrollbar-width: none;
      }
      .gex2Chips::-webkit-scrollbar { display: none; }
      .gex2Chip {
        flex-shrink: 0;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        text-align: left;
        cursor: pointer;
      }
      .gex2Chip small { display: block; font-size: 11.5px; color: #6b7280; }
      .gex2Chip b { font-size: 14px; color: #111827; }
      .gex2Sec { padding: 14px 16px 0; }
      .gex2Sec h3 { margin: 0 0 10px; font-size: 18px; font-weight: 800; }
      .gex2PromoGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .gex2PromoCard {
        border-radius: 16px;
        padding: 13px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 6px;
        cursor: pointer;
      }
      .gex2PromoCard b { display: block; font-size: 14.5px; margin-bottom: 3px; }
      .gex2PromoCard span { font-size: 12px; color: #4b5563; line-height: 1.3; display: block; }
      /* Header & Card dùng chung */
      .gex2Header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #ecfdf5;
        border-bottom: 1px solid #d1fae5;
      }
      .gex2Header h2 { margin: 0; font-size: 18px; font-weight: 800; }
      .gex2Card {
        background: #fff;
        margin: 12px 16px;
        border-radius: 16px;
        padding: 14px 16px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.04);
      }
      .gex2RowLink {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-top: 1px solid #f1f5f9;
        cursor: pointer;
      }
      .gex2RowLink:first-child { border-top: none; padding-top: 2px; }
      .gex2IcoBox {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: #f3f4f6;
        display: grid;
        place-items: center;
        font-size: 20px;
        flex-shrink: 0;
      }
      .gex2Btn {
        width: 100%;
        height: 48px;
        border: none;
        border-radius: 999px;
        background: #00b14f;
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
      }
      .gex2Btn:disabled { background: #d1d5db; color: #6b7280; cursor: not-allowed; }
      .gex2Footer {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: #fff;
        padding: 12px 16px calc(14px + env(safe-area-inset-bottom));
        box-shadow: 0 -6px 20px rgba(0,0,0,0.07);
        z-index: 20;
      }
      /* Map & Form */
      .gex2MapWrap { position: relative; flex: 1; display: flex; flex-direction: column; }
      .gex2MapDiv { width: 100%; height: 55%; z-index: 1; }
      .gex2MapFloatBack {
        position: absolute; top: 14px; left: 14px; z-index: 30;
        width: 40px; height: 40px; border-radius: 50%; background: #fff;
        border: none; font-size: 18px; font-weight: 800; box-shadow: 0 4px 12px rgba(0,0,0,0.18);
      }
      .gex2Sheet {
        position: relative; z-index: 20; margin-top: -18px; flex: 1;
        background: #fff; border-radius: 22px 22px 0 0; padding: 12px 18px 20px;
        box-shadow: 0 -8px 24px rgba(0,0,0,0.1); overflow-y: auto;
      }
      .gex2Handle { width: 40px; height: 4px; border-radius: 99px; background: #d1d5db; margin: 0 auto 12px; }
      .gex2Input {
        width: 100%; height: 44px; border: 1.5px solid #e5e7eb; border-radius: 12px;
        padding: 0 12px; font-size: 15px; margin-top: 4px;
      }
      .gex2Lbl { display: block; font-size: 13.5px; font-weight: 700; color: #374151; margin-top: 12px; }
      /* Gói dịch vụ */
      .gex2SvcItem {
        display: flex; align-items: center; gap: 12px; padding: 13px;
        border: 1.5px solid #e5e7eb; border-radius: 14px; margin-bottom: 10px; cursor: pointer;
      }
      .gex2SvcItem.active { border-color: #00b14f; background: #f0fdf4; }
      /* Addon checkbox */
      .gex2Addon {
        display: flex; align-items: center; gap: 12px; padding: 11px 0;
        border-bottom: 1px solid #f1f5f9; cursor: pointer;
      }
      .gex2Addon:last-child { border-bottom: none; }
      .gex2Addon input { width: 20px; height: 20px; accent-color: #00b14f; }
      /* Size & Tag pills */
      .gex2Pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .gex2PillBtn {
        padding: 9px 15px; border-radius: 999px; border: 1.5px solid #e5e7eb;
        background: #f9fafb; font-weight: 700; font-size: 14px; cursor: pointer;
      }
      .gex2PillBtn.active { background: #065f46; color: #fff; border-color: #065f46; }
      /* Modal overlay */
      .gex2ModalBg {
        position: absolute; inset: 0; background: rgba(0,0,0,0.45);
        z-index: 50; display: flex; flex-direction: column; justify-content: flex-end;
      }
      .gex2ModalBox {
        background: #fff; border-radius: 22px 22px 0 0; padding: 14px 18px 24px;
        max-height: 82%; overflow-y: auto;
      }
      .gex2Toast {
        position: absolute; top: 12px; left: 14px; right: 14px; z-index: 60;
        background: #14532d; color: #fff; padding: 11px 14px; border-radius: 12px;
        display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600;
      }
    `;
    document.head.appendChild(st);
  }

  function calcDistanceKm() {
    if (!state.dropoff.title) return 5.2;
    const R = 6371;
    const dLat = (state.dropoff.lat - state.pickup.lat) * Math.PI / 180;
    const dLon = (state.dropoff.lng - state.pickup.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(state.pickup.lat * Math.PI / 180) * Math.cos(state.dropoff.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.max(1.5, +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.25).toFixed(1));
  }

  function calcPricing() {
    const km = calcDistanceKm();
    const svc = SERVICES.find(s => s.id === state.serviceId) || SERVICES[0];
    const veh = VEHICLES.find(v => v.id === state.vehicleId) || VEHICLES[0];
    let baseRaw = Math.round(((svc.base + km * 4800) * (veh.id === 'bike' ? 1 : veh.mult * 0.78)) / 1000) * 1000;
    let addonSum = 0;
    state.addons.forEach(id => { const a = ADDONS.find(x => x.id === id); if (a) addonSum += a.price; });
    const originalTotal = baseRaw + addonSum;
    const discount = state.promoActive ? Math.round((baseRaw * 0.15) / 1000) * 1000 : 0;
    const finalTotal = Math.max(15000, originalTotal - discount);
    return { km, svc, veh, baseRaw, addonSum, originalTotal, discount, finalTotal };
  }

  function getEtaTime() {
    const d = new Date(Date.now() + 45 * 60000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function ensureRoot() {
    injectStyles();
    let root = $('#gexV2Root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'gexV2Root';
      root.hidden = true;
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(msg) {
    state.toast = msg;
    render();
    setTimeout(() => { if (state.toast === msg) { state.toast = ''; render(); } }, 2800);
  }

  /* ================== RENDER TỪNG BƯỚC ================== */
  function render() {
    const root = ensureRoot();
    if (root.hidden) return;
    const p = calcPricing();

    let body = '';
    if (state.step === 'step1_home') body = renderStep1Home();
    else if (state.step === 'step2_map') body = renderStep2Map();
    else if (state.step === 'step3_contact') body = renderStep3Contact();
    else if (state.step === 'step4_service') body = renderStep4Service(p);
    else if (state.step === 'step5_detail') body = renderStep5Detail(p);
    else if (state.step === 'step5b_item') body = renderStep5bItem();
    else if (state.step === 'step6_review') body = renderStep6Review(p);

    root.innerHTML = `
      <div class="gex2Shell">
        ${state.toast ? `<div class="gex2Toast"><span>✓</span><span style="flex:1">${esc(state.toast)}</span><span data-act="close-toast" style="cursor:pointer">✕</span></div>` : ''}
        ${body}
        ${state.modal === 'vehicle' ? renderVehicleModal(p) : ''}
        ${state.modal === 'fare' ? renderFareModal(p) : ''}
      </div>`;

    if (state.step === 'step2_map' || state.step === 'step3_contact') setTimeout(initLeafletMap, 30);
  }

  /* BƯỚC 1: TRANG CHỦ */
  function renderStep1Home() {
    return `
      <div class="gex2Scroll" style="padding-bottom:24px">
        <div class="gex2Hero">
          <div class="gex2TopBar">
            <button type="button" class="gex2RoundBtn" data-act="exit">←</button>
            <span style="font-size:12.5px;font-weight:700;background:#fff;padding:5px 12px;border-radius:99px;color:#065f46">Bước 1/5 • Chọn điểm giao</span>
            <button type="button" class="gex2RoundBtn" data-act="open-orders">📋</button>
          </div>
          <div class="gex2HeroRow">
            <div>
              <h2>Cần ship hàng gấp?</h2>
              <p data-act="go-step2-drop" style="cursor:pointer">Đặt GoExpress nhận ưu đãi ngay! ›</p>
            </div>
            <div style="font-size:44px">🛵📦</div>
          </div>
        </div>

        <div class="gex2RouteCard">
          <div class="gex2Dots">
            <span class="gex2DotB"></span>
            <span class="gex2DotL"></span>
            <span class="gex2DotR"></span>
          </div>
          <div style="flex:1;min-width:0">
            <div class="gex2AddrRow" data-act="go-step2-pick">
              <div class="gex2AddrVal">${esc(state.pickup.title)}</div>
            </div>
            <div class="gex2AddrRow" data-act="go-step2-drop">
              ${state.dropoff.title ? `<div class="gex2AddrVal">${esc(state.dropoff.title)}</div>` : `<div class="gex2AddrPh">Giao đến đâu?</div>`}
            </div>
          </div>
          <button type="button" data-act="swap-addr" style="background:none;border:none;font-size:18px;cursor:pointer">⇅</button>
        </div>

        <div class="gex2Chips">
          ${QUICK_PLACES.map((pl, i) => `
            <button type="button" class="gex2Chip" data-act="quick-place" data-idx="${i}">
              <div><small>Giao đến</small><b>${esc(pl.short)}</b></div>
              <span>📍</span>
            </button>`).join('')}
        </div>

        <div class="gex2Sec">
          <h3>Bạn có thể thích</h3>
          <div class="gex2PromoGrid">
            <div class="gex2PromoCard" style="background:#fdf2f2" data-act="apply-promo" data-code="Hội Chủ Shop - Giảm 20%">
              <div><b>Hội Chủ Shop</b><span>Giảm 20%* giá cước đơn Ưu Tiên</span></div>
              <span style="font-size:24px">🏪</span>
            </div>
            <div class="gex2PromoCard" style="background:#eef8fc" data-act="apply-promo" data-code="Đổi GoPoints - Giảm 15.000đ">
              <div><b>Đổi mã ưu đãi</b><span>Đổi điểm sang mã ưu đãi GE</span></div>
              <span style="font-size:24px">🪙</span>
            </div>
            <div class="gex2PromoCard" style="background:#eafaf1" data-act="apply-promo" data-code="Đi đơn có quà - Trợ giá 15%">
              <div><b>Đi đơn có quà</b><span>Đi đơn càng nhiều, trợ giá càng hời</span></div>
              <span style="font-size:24px">🎁</span>
            </div>
            <div class="gex2PromoCard" style="background:#fdf2f4" data-act="select-van">
              <div><b>Xe Tải Van</b><span>Giảm lên đến 50%*</span></div>
              <span style="font-size:24px">🚐</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* BƯỚC 2: BẢN ĐỒ */
  function renderStep2Map() {
    const isDrop = state.mapTarget === 'dropoff';
    return `
      <div class="gex2MapWrap">
        <div id="gexLeafletMap" class="gex2MapDiv"></div>
        <button type="button" class="gex2MapFloatBack" data-act="back-step1">←</button>
        <div class="gex2Sheet">
          <div class="gex2Handle"></div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <input type="text" id="gexMapSearchInput" class="gex2Input" style="margin:0" placeholder="Tìm địa chỉ..." value="${esc(state.tempPin.title)}">
            <button type="button" data-act="search-map" style="background:#00b14f;color:#fff;border:none;border-radius:12px;padding:0 16px;font-weight:700">Tìm</button>
          </div>
          <div style="font-size:16px;font-weight:800">${esc(state.tempPin.title)} ✎</div>
          <div style="font-size:13px;color:#6b7280;margin:3px 0 12px">${esc(state.tempPin.sub)}</div>
          <div style="background:#f0fdf4;padding:11px 12px;border-radius:12px;font-size:13.5px;font-weight:700;margin-bottom:14px">
            📍 Điểm Đón GoBike / Cổng chính
          </div>
          <button type="button" class="gex2Btn" data-act="confirm-step2">
            ${isDrop ? 'Chọn điểm đến này' : 'Chọn điểm lấy hàng này'}
          </button>
        </div>
      </div>`;
  }

  /* BƯỚC 3: THÔNG TIN LIÊN LẠC */
  function renderStep3Contact() {
    const isDrop = state.mapTarget === 'dropoff';
    const data = isDrop ? state.dropoff : state.pickup;
    const valid = data.name.trim().length >= 2 && data.phone.trim().length >= 8;
    return `
      <div class="gex2MapWrap">
        <div id="gexLeafletMap" class="gex2MapDiv" style="height:24%"></div>
        <button type="button" class="gex2MapFloatBack" data-act="back-step2">←</button>
        <div class="gex2Sheet">
          <div class="gex2Handle"></div>
          <h3 style="margin:0 0 8px;font-size:19px;font-weight:800">${isDrop ? 'Thông tin điểm giao hàng' : 'Thông tin điểm lấy hàng'}</h3>
          <label class="gex2Lbl">Địa chỉ</label>
          <div class="gex2Input" style="display:flex;align-items:center;justify-content:space-between;background:#f9fafb" data-act="back-step2">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(data.title)}</span><span>›</span>
          </div>
          <label class="gex2Lbl">Số tầng, số toà nhà</label>
          <input type="text" class="gex2Input" id="gexFloorIn" placeholder="Thêm số tầng hoặc số căn hộ" value="${esc(data.floor)}">
          <label class="gex2Lbl">Tên người liên lạc *</label>
          <input type="text" class="gex2Input" id="gexNameIn" placeholder="Nhập tên" value="${esc(data.name)}">
          <label class="gex2Lbl">Số điện thoại *</label>
          <input type="tel" class="gex2Input" id="gexPhoneIn" placeholder="Nhập số điện thoại" value="${esc(data.phone)}">
          <label class="gex2Lbl">Ghi chú cho tài xế</label>
          <input type="text" class="gex2Input" id="gexNoteIn" placeholder="Ghi chú cho tài xế" value="${esc(data.note)}">
          <button type="button" class="gex2Btn" id="gexContactConfirmBtn" data-act="confirm-step3" style="margin-top:16px" ${valid ? '' : 'disabled'}>Xác nhận</button>
        </div>
      </div>`;
  }

  /* BƯỚC 4: CHỌN DỊCH VỤ GIAO HÀNG (TRANG RIÊNG) */
  function renderStep4Service(p) {
    return `
      <div class="gex2Header">
        <button type="button" class="gex2RoundBtn" data-act="back-step3">←</button>
        <h2>Chọn dịch vụ giao</h2>
        <span style="font-size:12px;font-weight:700;color:#059669">Bước 4/5</span>
      </div>
      <div class="gex2Scroll" style="padding:14px 16px 100px;background:#fff">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:14px">
          <div><b style="color:#2563eb">● Từ:</b> ${esc(state.pickup.title)} (${esc(state.pickup.name)})</div>
          <div style="margin-top:4px"><b style="color:#ef4444">● Đến:</b> ${esc(state.dropoff.title)} (${esc(state.dropoff.name)})</div>
        </div>
        <h3 style="margin:0 0 12px;font-size:18px;font-weight:800">Bạn muốn chọn dịch vụ giao nào?</h3>
        ${SERVICES.map(s => {
          const active = s.id === state.serviceId;
          const est = Math.round(((s.base + p.km * 4800) * (s.isVan ? 1 : 0.85)) / 1000) * 1000;
          return `
            <div class="gex2SvcItem ${active ? 'active' : ''}" data-act="pick-service" data-id="${s.id}">
              <div class="gex2IcoBox" style="background:${s.color}18;color:${s.color}">${s.icon}</div>
              <div style="flex:1">
                <div style="display:flex;justify-content:space-between">
                  <b style="font-size:15.5px">${esc(s.name)}</b>
                  <b style="font-size:15.5px">${s.id === 'saver' ? 'Từ ' : ''}${money(est)}</b>
                </div>
                <div style="font-size:13px;color:#6b7280;margin-top:2px">${esc(s.desc)}</div>
              </div>
            </div>`;
        }).join('')}
      </div>
      <div class="gex2Footer">
        <button type="button" class="gex2Btn" data-act="confirm-step4">Tiếp theo</button>
      </div>`;
  }

  /* BƯỚC 5: CHI TIẾT ĐƠN HÀNG */
  function renderStep5Detail(p) {
    return `
      <div class="gex2Header">
        <button type="button" class="gex2RoundBtn" data-act="back-step4">←</button>
        <h2>Chi tiết đơn hàng</h2>
        <button type="button" class="gex2RoundBtn" data-act="share-trip">🔗</button>
      </div>
      <div class="gex2Scroll">
        <div class="gex2Card">
          <div style="display:flex;gap:12px;align-items:center;padding-bottom:10px">
            <div class="gex2Dots"><span class="gex2DotB"></span><span class="gex2DotL"></span><span class="gex2DotR"></span></div>
            <div style="flex:1;min-width:0">
              <div data-act="edit-pickup" style="cursor:pointer">
                <div style="font-weight:700;font-size:14.5px">${esc(state.pickup.title)}</div>
                <div style="font-size:12.5px;color:#6b7280">${esc(state.pickup.name)} • ${esc(state.pickup.phone)}</div>
              </div>
              <div data-act="edit-dropoff" style="cursor:pointer;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9">
                <div style="font-weight:700;font-size:14.5px">${esc(state.dropoff.title)}</div>
                <div style="font-size:12.5px;color:#6b7280">${esc(state.dropoff.name)} • ${esc(state.dropoff.phone)}</div>
              </div>
            </div>
          </div>

          <div class="gex2RowLink" data-act="back-step4">
            <div class="gex2IcoBox">${p.svc.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:14.5px">${esc(p.svc.eta)}</div>
              <div style="font-size:12.5px;color:#6b7280">Giao vào ${getEtaTime()} • ${esc(p.svc.name)}</div>
            </div>
            <span>›</span>
          </div>

          <div class="gex2RowLink" data-act="open-vehicle-modal">
            <div class="gex2IcoBox">${p.veh.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:14.5px">${esc(p.veh.name)}</div>
              <div style="font-size:12.5px;color:#6b7280">${esc(p.veh.spec)}</div>
            </div>
            <span>›</span>
          </div>

          <div class="gex2RowLink" data-act="go-step5b-item">
            <div class="gex2IcoBox">📦</div>
            <div style="flex:1">
              ${state.item.confirmed
                ? `<div style="font-weight:700;font-size:14.5px">Cỡ ${esc(state.item.size)} • ${esc(state.item.weight)}kg • ${esc(state.item.cat)}</div><div style="font-size:12.5px;color:#059669">Đảm bảo hàng hóa • 1 Phổ thông ✓</div>`
                : `<div style="font-weight:700;font-size:14.5px;color:#0284c7">Thêm chi tiết món hàng *</div><div style="font-size:12.5px;color:#6b7280">Đảm bảo hàng hóa • 1 Phổ thông</div>`}
            </div>
            <span>›</span>
          </div>
        </div>

        <div style="font-weight:800;font-size:15.5px;margin:12px 16px 6px">Áp dụng ưu đãi</div>
        <div class="gex2Card" style="padding:10px 16px">
          <div class="gex2RowLink" data-act="toggle-promo" style="padding:2px 0">
            <span>🏷️</span>
            <div style="flex:1;font-size:14px;font-weight:600">${state.promoActive ? esc(state.promoCode) : 'Chạm để áp dụng ưu đãi 15%'}</div>
            <span style="color:#00b14f;font-weight:700;font-size:13px">${state.promoActive ? 'Đang dùng' : 'Áp dụng'}</span>
          </div>
        </div>

        <div style="font-weight:800;font-size:15.5px;margin:12px 16px 6px">Dịch vụ thêm</div>
        <div class="gex2Card">
          ${ADDONS.map(a => `
            <label class="gex2Addon">
              <input type="checkbox" data-act="toggle-addon" data-id="${a.id}" ${state.addons.has(a.id) ? 'checked' : ''}>
              <div style="flex:1">
                <div style="font-weight:600;font-size:14px">${esc(a.name)}</div>
                ${a.desc ? `<div style="font-size:12px;color:#6b7280">${esc(a.desc)}</div>` : ''}
              </div>
              <div style="font-weight:700;font-size:14px">${money(a.price)}</div>
            </label>`).join('')}
        </div>
      </div>

      <div class="gex2Footer">
        <div data-act="open-fare-modal" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:pointer">
          <span style="font-weight:600;font-size:15px">Tổng cộng</span>
          <div>
            <strong style="font-size:21px;font-weight:800">${money(p.finalTotal)}</strong>
            ${p.discount > 0 ? `<del style="color:#6b7280;font-size:14px;margin-left:6px">${money(p.originalTotal)}</del>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <button type="button" data-act="save-draft" style="width:48px;height:48px;border-radius:50%;border:none;background:#ecfdf5;font-size:18px">🔖</button>
          <button type="button" class="gex2Btn" data-act="go-step6-review" ${state.item.confirmed ? '' : 'disabled'}>
            ${state.item.confirmed ? 'Kiểm tra đơn hàng' : 'Thêm chi tiết món hàng *'}
          </button>
        </div>
      </div>`;
  }

  /* BƯỚC 5B: CHI TIẾT MÓN HÀNG */
  function renderStep5bItem() {
    const valid = Number(state.item.weight) > 0 && Boolean(state.item.cat);
    return `
      <div class="gex2Header">
        <button type="button" class="gex2RoundBtn" data-act="back-step5">←</button>
        <h2>Chi tiết món hàng</h2>
        <span style="width:38px"></span>
      </div>
      <div class="gex2Scroll" style="padding:14px 18px 130px;background:#fff">
        <p style="margin:0 0 14px;font-size:14px;color:#4b5563">Thông tin này giúp tài xế sắp xếp và bảo quản hàng đúng cách.</p>
        <div style="text-align:center;font-size:48px;padding:8px 0">🧑‍✈️📦 <span style="font-size:12px;color:#6b7280;display:block">20 × 20 × 25cm</span></div>
        <label class="gex2Lbl">Kích cỡ *</label>
        <div class="gex2Pills">
          ${['S', 'M', 'L', 'XL'].map(sz => `<button type="button" class="gex2PillBtn ${state.item.size === sz ? 'active' : ''}" data-act="pick-size" data-val="${sz}">${sz}</button>`).join('')}
        </div>
        <label class="gex2Lbl">Trọng lượng (kg) *</label>
        <input type="number" id="gexWeightIn" class="gex2Input" min="0.1" step="0.1" placeholder="Ví dụ: 1.5" value="${esc(state.item.weight)}">
        <label class="gex2Lbl">Loại hàng hoá *</label>
        <div class="gex2Pills">
          ${ITEM_CATS.map(c => `<button type="button" class="gex2PillBtn ${state.item.cat === c.label ? 'active' : ''}" data-act="pick-cat" data-val="${esc(c.label)}">${esc(c.label)} ${c.icon}</button>`).join('')}
        </div>
      </div>
      <div class="gex2Footer">
        <div style="background:#065f46;color:#fff;font-size:12.5px;padding:8px 12px;border-radius:10px;margin-bottom:8px">
          Mới! Ra mắt gói Phổ thông với mức bồi thường lên đến 3.000.000đ
        </div>
        <button type="button" class="gex2Btn" id="gexItemConfirmBtn" data-act="confirm-step5b" ${valid ? '' : 'disabled'}>Xác nhận</button>
      </div>`;
  }

  /* BƯỚC 6: XÁC NHẬN ĐẶT ĐƠN */
  function renderStep6Review(p) {
    return `
      <div class="gex2Header">
        <button type="button" class="gex2RoundBtn" data-act="back-step5">←</button>
        <h2>Xác nhận đơn giao hàng</h2>
        <span style="width:38px"></span>
      </div>
      <div class="gex2Scroll">
        <div class="gex2Card">
          <div style="font-weight:800;margin-bottom:8px">Lộ trình (${p.km} km)</div>
          <div style="font-size:13.5px;margin-bottom:6px"><b style="color:#2563eb">● Lấy:</b> ${esc(state.pickup.title)} (${esc(state.pickup.name)})</div>
          <div style="font-size:13.5px"><b style="color:#ef4444">● Giao:</b> ${esc(state.dropoff.title)} (${esc(state.dropoff.name)})</div>
        </div>
        <div class="gex2Card" style="font-size:13.5px;line-height:1.7">
          <div>• Dịch vụ: <b>${esc(p.svc.name)} — ${esc(p.veh.name)}</b></div>
          <div>• Hàng hóa: <b>Cỡ ${esc(state.item.size)} • ${esc(state.item.weight)}kg • ${esc(state.item.cat)}</b></div>
          <div>• Thanh toán: <b>Tiền mặt</b></div>
        </div>
        <div class="gex2Card" style="font-size:14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Cước phí</span><b>${money(p.baseRaw)}</b></div>
          ${p.addonSum > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Dịch vụ thêm</span><b>${money(p.addonSum)}</b></div>` : ''}
          ${p.discount > 0 ? `<div style="display:flex;justify-content:space-between;color:#059669;margin-bottom:6px"><span>Ưu đãi 15%</span><b>-${money(p.discount)}</b></div>` : ''}
          <div style="display:flex;justify-content:space-between;border-top:1px dashed #d1d5db;padding-top:8px;font-size:17px"><b>Tổng thanh toán</b><b>${money(p.finalTotal)}</b></div>
        </div>
      </div>
      <div class="gex2Footer">
        <button type="button" class="gex2Btn" data-act="submit-order">Đặt giao hàng • ${money(p.finalTotal)}</button>
      </div>`;
  }

  function renderVehicleModal(p) {
    return `
      <div class="gex2ModalBg" data-act="close-modal">
        <div class="gex2ModalBox" onclick="event.stopPropagation()">
          <div class="gex2Handle"></div>
          <h3 style="margin:0 0 12px;font-size:18px;font-weight:800">Loại xe</h3>
          ${VEHICLES.map(v => {
            const est = Math.round(((p.svc.base + p.km * 4800) * (v.id === 'bike' ? 1 : v.mult * 0.78) * 0.85) / 1000) * 1000;
            return `
              <div class="gex2SvcItem ${v.id === state.vehicleId ? 'active' : ''}" data-act="pick-vehicle" data-id="${v.id}">
                <div class="gex2IcoBox">${v.icon}</div>
                <div style="flex:1">
                  <div style="display:flex;justify-content:space-between"><b>${esc(v.name)}</b><b>${money(est)}</b></div>
                  <div style="font-size:12.5px;color:#6b7280">${esc(v.spec)}</div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderFareModal(p) {
    return `
      <div class="gex2ModalBg" data-act="close-modal">
        <div class="gex2ModalBox" onclick="event.stopPropagation()">
          <div class="gex2Handle"></div>
          <h3 style="margin:0 0 10px;font-size:18px;font-weight:800">Chi tiết giá cước</h3>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span>Cước gói ${esc(p.svc.name)}</span><b>${money(p.baseRaw)}</b></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span>Dịch vụ thêm</span><b>${money(p.addonSum)}</b></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;color:#059669"><span>Ưu đãi</span><b>-${money(p.discount)}</b></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px dashed #ccc;font-size:17px"><b>Tổng cộng</b><b>${money(p.finalTotal)}</b></div>
          <button type="button" class="gex2Btn" data-act="close-modal" style="margin-top:8px">Đóng</button>
        </div>
      </div>`;
  }

  /* ================== BẢN ĐỒ LEAFLET ================== */
  function initLeafletMap() {
    const el = $('#gexLeafletMap');
    if (!el || typeof L === 'undefined') return;
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
    const pt = state.step === 'step2_map' ? state.tempPin : (state.mapTarget === 'dropoff' ? state.dropoff : state.pickup);
    mapInstance = L.map(el, { zoomControl: false }).setView([pt.lat, pt.lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
    mapMarker = L.marker([pt.lat, pt.lng], { draggable: state.step === 'step2_map' }).addTo(mapInstance);
    if (state.step === 'step2_map') {
      mapInstance.on('click', e => updatePinCoords(e.latlng.lat, e.latlng.lng));
      mapMarker.on('dragend', () => { const ll = mapMarker.getLatLng(); updatePinCoords(ll.lat, ll.lng); });
    }
  }

  async function updatePinCoords(lat, lng) {
    state.tempPin.lat = lat; state.tempPin.lng = lng;
    if (mapMarker) mapMarker.setLatLng([lat, lng]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=vi`);
      const d = await res.json();
      if (d?.display_name) {
        const parts = d.display_name.split(',');
        state.tempPin.title = parts.slice(0, 2).join(', ').trim();
        state.tempPin.sub = parts.slice(2, 5).join(', ').trim();
        render();
      }
    } catch {}
  }

  async function searchMapAddress(q) {
    if (!q.trim()) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ', Hồ Chí Minh')}&limit=1&accept-language=vi`);
      const arr = await res.json();
      if (arr?.[0]) {
        const parts = arr[0].display_name.split(',');
        state.tempPin = { title: parts.slice(0, 2).join(', ').trim(), sub: parts.slice(2, 5).join(', ').trim(), lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
        render();
      }
    } catch {}
  }

  /* ================== SỰ KIỆN ================== */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn || $('#gexV2Root')?.hidden) return;
    const act = btn.dataset.act;

    if (act === 'exit') closeExpress();
    else if (act === 'close-toast') { state.toast = ''; render(); }
    else if (act === 'open-orders') { closeExpress(); document.querySelector('[data-go="orders"]')?.click(); }
    else if (act === 'back-step1') { state.step = 'step1_home'; render(); }
    else if (act === 'back-step2') { state.step = 'step2_map'; render(); }
    else if (act === 'back-step3') { state.step = 'step3_contact'; render(); }
    else if (act === 'back-step4') { state.step = 'step4_service'; render(); }
    else if (act === 'back-step5') { state.step = 'step5_detail'; render(); }
    else if (act === 'go-step2-drop') { state.mapTarget = 'dropoff'; state.tempPin = state.dropoff.title ? { ...state.dropoff } : { ...QUICK_PLACES[0] }; state.step = 'step2_map'; render(); }
    else if (act === 'go-step2-pick') { state.mapTarget = 'pickup'; state.tempPin = { ...state.pickup }; state.step = 'step2_map'; render(); }
    else if (act === 'quick-place') { const pl = QUICK_PLACES[Number(btn.dataset.idx)]; if (pl) { state.mapTarget = 'dropoff'; state.tempPin = { ...pl }; state.step = 'step2_map'; render(); } }
    else if (act === 'swap-addr') { if (!state.dropoff.title) return showToast('Vui lòng chọn điểm đến trước'); const t = { ...state.pickup }; state.pickup = { ...state.dropoff }; state.dropoff = t; render(); }
    else if (act === 'search-map') searchMapAddress($('#gexMapSearchInput')?.value || '');
    else if (act === 'confirm-step2') {
      const target = state.mapTarget === 'dropoff' ? state.dropoff : state.pickup;
      Object.assign(target, { title: state.tempPin.title, sub: state.tempPin.sub, lat: state.tempPin.lat, lng: state.tempPin.lng });
      state.step = 'step3_contact'; render();
    }
    else if (act === 'confirm-step3') {
      const target = state.mapTarget === 'dropoff' ? state.dropoff : state.pickup;
      target.floor = $('#gexFloorIn')?.value.trim() || '';
      target.name = $('#gexNameIn')?.value.trim() || '';
      target.phone = $('#gexPhoneIn')?.value.trim() || '';
      target.note = $('#gexNoteIn')?.value.trim() || '';
      state.step = 'step4_service';
      if (state.promoActive) state.toast = 'Đã áp dụng ưu đãi!';
      render();
    }
    else if (act === 'pick-service') { state.serviceId = btn.dataset.id; render(); }
    else if (act === 'confirm-step4') { state.step = 'step5_detail'; render(); }
    else if (act === 'edit-pickup') { state.mapTarget = 'pickup'; state.step = 'step3_contact'; render(); }
    else if (act === 'edit-dropoff') { state.mapTarget = 'dropoff'; state.step = 'step3_contact'; render(); }
    else if (act === 'open-vehicle-modal') { state.modal = 'vehicle'; render(); }
    else if (act === 'open-fare-modal') { state.modal = 'fare'; render(); }
    else if (act === 'close-modal') { state.modal = null; render(); }
    else if (act === 'pick-vehicle') { state.vehicleId = btn.dataset.id; state.modal = null; render(); }
    else if (act === 'go-step5b-item') { state.step = 'step5b_item'; render(); }
    else if (act === 'pick-size') { state.item.size = btn.dataset.val; render(); }
    else if (act === 'pick-cat') { state.item.cat = btn.dataset.val; render(); }
    else if (act === 'confirm-step5b') { state.item.confirmed = true; state.step = 'step5_detail'; render(); }
    else if (act === 'go-step6-review') { state.step = 'step6_review'; render(); }
    else if (act === 'toggle-promo') { state.promoActive = !state.promoActive; showToast(state.promoActive ? 'Đã áp dụng ưu đãi!' : 'Đã gỡ mã ưu đãi'); }
    else if (act === 'apply-promo') { state.promoActive = true; state.promoCode = btn.dataset.code; showToast('Đã áp dụng ưu đãi!'); }
    else if (act === 'select-van') { state.serviceId = 'van_priority'; state.vehicleId = 'van500'; state.mapTarget = 'dropoff'; state.tempPin = { ...QUICK_PLACES[0] }; state.step = 'step2_map'; render(); }
    else if (act === 'save-draft') showToast('Đã lưu đơn nháp');
    else if (act === 'share-trip') showToast('Đã sao chép liên kết theo dõi!');
    else if (act === 'submit-order') {
      const p = calcPricing();
      const orderId = 'GE' + Date.now().toString().slice(-6);
      try {
        const list = JSON.parse(localStorage.getItem('gn_orders') || '[]');
        list.unshift({ id: orderId, type: 'express', status: 'Đang tìm tài xế', createdAt: new Date().toISOString(), store: `GoExpress • ${p.svc.name}`, total: p.finalTotal, items: [{ name: `${state.pickup.title} → ${state.dropoff.title}`, qty: 1, price: p.finalTotal }] });
        localStorage.setItem('gn_orders', JSON.stringify(list));
      } catch {}
      alert(`Đặt giao hàng thành công! Mã đơn #${orderId} (${money(p.finalTotal)})`);
      closeExpress();
      document.querySelector('[data-go="orders"]')?.click();
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if ($('#gexV2Root')?.hidden) return;
    if (t.dataset.act === 'toggle-addon') {
      if (t.checked) state.addons.add(t.dataset.id); else state.addons.delete(t.dataset.id);
      render();
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if ($('#gexV2Root')?.hidden) return;
    if (t.id === 'gexNameIn' || t.id === 'gexPhoneIn') {
      const target = state.mapTarget === 'dropoff' ? state.dropoff : state.pickup;
      if (t.id === 'gexNameIn') target.name = t.value;
      if (t.id === 'gexPhoneIn') target.phone = t.value;
      const btn = $('#gexContactConfirmBtn');
      if (btn) btn.disabled = !(target.name.trim().length >= 2 && target.phone.trim().length >= 8);
    }
    if (t.id === 'gexWeightIn') {
      state.item.weight = t.value;
      const btn = $('#gexItemConfirmBtn');
      if (btn) btn.disabled = !(Number(state.item.weight) > 0 && Boolean(state.item.cat));
    }
  });

  function openExpress() {
    state.step = 'step1_home';
    state.modal = null;
    const root = ensureRoot();
    root.hidden = false;
    render();
  }

  function closeExpress() {
    const root = $('#gexV2Root');
    if (root) root.hidden = true;
  }

  // Chặn mọi nút Giao hàng trên toàn trang để mở giao diện mới này
  document.addEventListener('click', e => {
    if (e.target.closest('#gexV2Root')) return;
    const el = e.target.closest('button, a, div, li');
    if (!el) return;
    const txt = (el.textContent || '').trim().toLowerCase();
    if (el.dataset.go === 'express' || el.dataset.svc === 'express' || (txt === 'giao hàng' && el.children.length <= 2)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openExpress();
    }
  }, true);

  window.openGoExpress = openExpress;
})();
