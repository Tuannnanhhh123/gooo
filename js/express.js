
/* [AI] GoNow Express — Tách chuẩn 5 bước độc lập (Mỗi bước 1 màn hình riêng) */
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
    { id: 'food', label: 'Thực phẩm', icon: '🍴' },
    { id: 'clothes', label: 'Quần áo', icon: '👕' },
    { id: 'elec', label: 'Điện tử', icon: '📱' },
    { id: 'doc', label: 'Tài liệu', icon: '📄' },
    { id: 'other', label: 'Khác', icon: '📦' }
  ];

  const state = {
    // 5 bước tách biệt rõ ràng:
    // 'step1_home' -> 'step2_map' -> 'step3_contact' -> 'step4_service' -> 'step5_detail' -> 'step5b_item' -> 'step6_review'
    step: 'step1_home',
    modal: null, // null | 'vehicle' | 'fare'
    toast: '',
    pickup: {
      title: '86 Street No.27',
      sub: 'P.Tân Quy, Quận 7, TP.Hồ Chí Minh',
      floor: '',
      name: 'Tuấn Anh',
      phone: '+84343758848',
      note: '',
      lat: 10.7412,
      lng: 106.7128
    },
    dropoff: {
      title: '',
      sub: '',
      floor: '',
      name: '',
      phone: '',
      note: '',
      lat: 10.8165,
      lng: 106.6644
    },
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

  function calcDistanceKm() {
    if (!state.dropoff.title) return 5.2;
    const R = 6371;
    const dLat = (state.dropoff.lat - state.pickup.lat) * Math.PI / 180;
    const dLon = (state.dropoff.lng - state.pickup.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(state.pickup.lat * Math.PI / 180) * Math.cos(state.dropoff.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(1.5, +(d * 1.25).toFixed(1));
  }

  function calcPricing() {
    const km = calcDistanceKm();
    const svc = SERVICES.find(s => s.id === state.serviceId) || SERVICES[0];
    const veh = VEHICLES.find(v => v.id === state.vehicleId) || VEHICLES[0];

    let baseRaw = (svc.base + km * 4800) * (veh.id === 'bike' ? 1 : veh.mult * 0.78);
    baseRaw = Math.round(baseRaw / 1000) * 1000;

    let addonSum = 0;
    state.addons.forEach(id => {
      const a = ADDONS.find(x => x.id === id);
      if (a) addonSum += a.price;
    });

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
    let root = $('#gnExpressApp');
    if (!root) {
      root = document.createElement('div');
      root.id = 'gnExpressApp';
      root.hidden = true;
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(msg) {
    state.toast = msg;
    render();
    setTimeout(() => {
      if (state.toast === msg) {
        state.toast = '';
        render();
      }
    }, 3000);
  }

  /* ================== RENDER TỪNG BƯỚC ĐỘC LẬP ================== */
  function render() {
    const root = ensureRoot();
    if (root.hidden) return;

    const p = calcPricing();
    let stepHtml = '';

    switch (state.step) {
      case 'step1_home':    stepHtml = renderStep1Home(); break;
      case 'step2_map':     stepHtml = renderStep2Map(); break;
      case 'step3_contact': stepHtml = renderStep3Contact(); break;
      case 'step4_service': stepHtml = renderStep4Service(p); break;
      case 'step5_detail':  stepHtml = renderStep5Detail(p); break;
      case 'step5b_item':   stepHtml = renderStep5bItem(); break;
      case 'step6_review':  stepHtml = renderStep6Review(p); break;
    }

    root.innerHTML = `
      <div class="gexShell">
        ${state.toast ? `
          <div class="gexTopToast">
            <span class="gexToastCheck">✓</span>
            <span style="flex:1">${esc(state.toast)}</span>
            <button type="button" data-act="close-toast">✕</button>
          </div>` : ''}
        ${stepHtml}
        ${state.modal === 'vehicle' ? renderVehicleModal(p) : ''}
        ${state.modal === 'fare' ? renderFareModal(p) : ''}
      </div>`;

    if (state.step === 'step2_map' || state.step === 'step3_contact') {
      setTimeout(initLeafletMap, 30);
    }
  }

  /* BƯỚC 1: TRANG CHỦ EXPRESS */
  function renderStep1Home() {
    return `
      <div class="gexScroll" style="padding-bottom:28px">
        <div class="gexHero">
          <div class="gexTopBar">
            <button type="button" class="gexIconBtn" data-act="exit" aria-label="Quay lại">←</button>
            <span style="font-size:12.5px;font-weight:700;color:#065f46;background:#fff;padding:4px 12px;border-radius:999px">Bước 1/5 • Chọn điểm giao</span>
            <button type="button" class="gexIconBtn" data-act="open-orders" title="Đơn giao hàng">📋</button>
          </div>
          <div class="gexHeroRow">
            <div style="min-width:0">
              <h2>Cần ship hàng gấp?</h2>
              <p data-act="go-step2-drop" style="cursor:pointer">Đặt GoExpress nhận ưu đãi cuối ngay! ›</p>
            </div>
            <div class="gexMascot">🛵📦</div>
          </div>
        </div>

        <div class="gexRouteCard">
          <div class="gexDots">
            <span class="gexDotBlue"></span>
            <span class="gexDotLine"></span>
            <span class="gexDotRed"></span>
          </div>
          <div class="gexRouteInputs">
            <div class="gexAddrRow" data-act="go-step2-pick">
              <div class="gexAddrTitle">${esc(state.pickup.title)}</div>
            </div>
            <div class="gexAddrRow" data-act="go-step2-drop">
              ${state.dropoff.title
                ? `<div class="gexAddrTitle">${esc(state.dropoff.title)}</div>`
                : `<div class="gexAddrPlaceholder">Giao đến đâu?</div>`}
            </div>
          </div>
          <button type="button" class="gexSwapBtn" data-act="swap-addr">⇅</button>
        </div>

        <div class="gexChips">
          ${QUICK_PLACES.map((pl, idx) => `
            <button type="button" class="gexChip" data-act="quick-place" data-idx="${idx}">
              <div>
                <small>Giao đến</small>
                <b>${esc(pl.short)}</b>
              </div>
              <span class="gexChipPin">📍</span>
            </button>
          `).join('')}
        </div>

        <div class="gexSec">
          <h3>Bạn có thể thích</h3>
          <div class="gexPromoGrid">
            <div class="gexPromoCard" style="background:#fdf2f2" data-act="apply-promo-card" data-code="Hội Chủ Shop - Giảm 20% Ưu Tiên">
              <div><b>Hội Chủ Shop</b><span>Giảm 20%* giá cước đơn Ưu Tiên</span></div>
              <span class="gexBadgeShop">HỘI CHỦ SHOP</span>
            </div>
            <div class="gexPromoCard" style="background:#eef8fc" data-act="apply-promo-card" data-code="Đổi điểm thưởng - Giảm 15.000đ">
              <div><b>Đổi mã ưu đãi</b><span>Đổi GoPoints sang mã ưu đãi GE</span></div>
              <span class="gexCoin">G</span>
            </div>
            <div class="gexPromoCard" style="background:#eafaf1" data-act="apply-promo-card" data-code="Đi đơn có quà - Trợ giá 15%">
              <div><b>Đi đơn có quà</b><span>Đi đơn càng nhiều, trợ giá càng hời</span></div>
              <span style="font-size:26px">🎁</span>
            </div>
            <div class="gexPromoCard" style="background:#fdf2f4" data-act="select-van">
              <div><b>Xe Tải Van</b><span>Giảm lên đến 50%*</span></div>
              <span style="font-size:26px">🚐</span>
            </div>
          </div>
        </div>

        <div class="gexSec">
          <h3>Khám phá thêm</h3>
          <div class="gexExploreCard" data-act="go-step2-drop">
            <div class="gexExploreIco">🛍️</div>
            <div><b>GoExpress Mua hộ</b><p>Ngồi ở nhà, cần gì GoExpress mua hộ</p></div>
          </div>
        </div>
      </div>`;
  }

  /* BƯỚC 2: BẢN ĐỒ GHIM VỊ TRÍ */
  function renderStep2Map() {
    const isDrop = state.mapTarget === 'dropoff';
    return `
      <div class="gexMapPage">
        <div id="gexLeafletMap" class="gexMapCanvas"></div>
        <button type="button" class="gexMapBack" data-act="back-step1">←</button>
        <div class="gexStepPillFloat">Bước 2/5 • Ghim vị trí trên bản đồ</div>
        <button type="button" class="gexMapGps" data-act="locate-gps" title="Vị trí hiện tại">⌖</button>

        <div class="gexMapSheet">
          <div class="gexSheetHandle"></div>
          <div class="gexMapSearchBox">
            <input type="text" id="gexMapSearchInput" class="gexMapSearchIn" placeholder="Nhập địa chỉ cần tìm..." value="${esc(state.tempPin.title)}">
            <button type="button" class="gexMapSearchBtn" data-act="search-map">Tìm</button>
          </div>
          <div class="gexMapPinTitle">${esc(state.tempPin.title)} ✎</div>
          <div class="gexMapPinSub">${esc(state.tempPin.sub)}</div>
          <div class="gexMapSubSpot">
            <span>📍</span>
            <b style="flex:1">Điểm Đón GoBike / Cổng chính</b>
            <span style="color:#6b7280">⋮</span>
          </div>
          <button type="button" class="gexPrimaryBtn" data-act="confirm-step2">
            ${isDrop ? 'Chọn điểm đến này' : 'Chọn điểm lấy hàng này'}
          </button>
        </div>
      </div>`;
  }

  /* BƯỚC 3: THÔNG TIN ĐIỂM GIAO / LẤY HÀNG */
  function renderStep3Contact() {
    const isDrop = state.mapTarget === 'dropoff';
    const data = isDrop ? state.dropoff : state.pickup;
    const valid = data.name.trim().length >= 2 && data.phone.trim().length >= 8;

    return `
      <div class="gexMapPage">
        <div id="gexLeafletMap" class="gexMapCanvas" style="height:26%"></div>
        <button type="button" class="gexMapBack" data-act="back-step2">←</button>
        <div class="gexStepPillFloat">Bước 3/5 • Thông tin liên lạc</div>

        <div class="gexMapSheet" style="max-height:80%;overflow-y:auto">
          <div class="gexSheetHandle"></div>
          <h3 style="font-size:20px;font-weight:800;margin:0 0 12px">
            ${isDrop ? 'Thông tin điểm giao hàng' : 'Thông tin điểm lấy hàng'}
          </h3>

          <label class="gexFieldLbl">Địa chỉ</label>
          <div class="gexAddrSelectBtn" data-act="back-step2">
            <span class="gexEllipsis">${esc(data.title)}</span>
            <span>›</span>
          </div>

          <label class="gexFieldLbl">Số tầng, số toà nhà</label>
          <input type="text" class="gexInput" id="gexFloorIn" maxlength="120" placeholder="Thêm số tầng hoặc số căn hộ" value="${esc(data.floor)}">
          <div class="gexCharCnt"><span id="gexFloorCnt">${data.floor.length}</span>/120</div>

          <label class="gexFieldLbl">Tên người liên lạc <span style="color:#dc2626">*</span></label>
          <input type="text" class="gexInput" id="gexNameIn" placeholder="Tên" value="${esc(data.name)}">

          <label class="gexFieldLbl">Số điện thoại <span style="color:#dc2626">*</span></label>
          <input type="tel" class="gexInput" id="gexPhoneIn" placeholder="Số điện thoại" value="${esc(data.phone)}">

          <label class="gexFieldLbl">Ghi chú cho tài xế</label>
          <input type="text" class="gexInput" id="gexNoteIn" placeholder="Ghi chú cho tài xế" value="${esc(data.note)}">

          <button type="button" class="gexPrimaryBtn" id="gexContactConfirmBtn" data-act="confirm-step3" style="margin-top:16px" ${valid ? '' : 'disabled'}>
            Xác nhận
          </button>
        </div>
      </div>`;
  }

  /* BƯỚC 4: TRANG CHỌN DỊCH VỤ GIAO HÀNG (TÁCH THÀNH 1 BƯỚC RIÊNG BIỆT) */
  function renderStep4Service(p) {
    return `
      <div class="gexHeaderBar">
        <button type="button" class="gexBackPlain" data-act="back-step3">←</button>
        <h2>Chọn dịch vụ giao</h2>
        <span style="font-size:12px;font-weight:700;color:#059669">Bước 4/5</span>
      </div>

      <div class="gexScroll" style="padding:14px 20px 100px;background:#fff">
        <div class="gexMiniRouteBanner">
          <div><b style="color:#1d74f5">● Từ:</b> ${esc(state.pickup.title)} (${esc(state.pickup.name)})</div>
          <div style="margin-top:4px"><b style="color:#ea4335">● Đến:</b> ${esc(state.dropoff.title)} (${esc(state.dropoff.name)})</div>
        </div>

        <h3 style="font-size:19px;font-weight:800;margin:16px 0 12px">Bạn muốn chọn dịch vụ giao nào?</h3>

        ${SERVICES.map(s => {
          const active = s.id === state.serviceId;
          const est = Math.round(((s.base + p.km * 4800) * (s.isVan ? 1 : 0.85)) / 1000) * 1000;
          return `
            <div class="gexSvcOption ${active ? 'active' : ''}" data-act="pick-service" data-id="${s.id}">
              <div class="gexSvcBadgeIco" style="background:${s.color}18;color:${s.color}">${s.icon}</div>
              <div style="flex:1">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <b style="font-size:16px">${esc(s.name)}</b>
                  <b style="font-size:16px">${s.id === 'saver' ? 'Từ ' : ''}${money(est)}</b>
                </div>
                <div style="font-size:13.5px;color:#6b7280;margin-top:2px">${esc(s.desc)}</div>
              </div>
            </div>`;
        }).join('')}
      </div>

      <div class="gexFooter">
        <button type="button" class="gexPrimaryBtn" data-act="confirm-step4">
          Tiếp theo
        </button>
      </div>`;
  }

  /* BƯỚC 5: CHI TIẾT ĐƠN HÀNG (SAU KHI BẤM TIẾP THEO Ở BƯỚC 4) */
  function renderStep5Detail(p) {
    const canReview = state.item.confirmed;
    return `
      <div class="gexHeaderBar">
        <button type="button" class="gexBackPlain" data-act="back-step4">←</button>
        <h2>Chi tiết đơn hàng</h2>
        <button type="button" class="gexShareBtn" data-act="share-trip" title="Chia sẻ">🔗</button>
      </div>

      <div class="gexScroll">
        <div class="gexCard">
          <div class="gexRouteEditBox">
            <div class="gexDots">
              <span class="gexDotBlue"></span>
              <span class="gexDotLine" style="height:34px"></span>
              <span class="gexDotRed"></span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="gexStopBlock" data-act="edit-pickup">
                <div class="gexAddrTitle">${esc(state.pickup.title)}</div>
                <div class="gexAddrSub">${esc(state.pickup.name)} • ${esc(state.pickup.phone)}</div>
              </div>
              <div class="gexStopBlock" data-act="edit-dropoff" style="border-top:1px solid #f1f5f9;padding-top:10px;margin-top:10px">
                <div class="gexAddrTitle">${esc(state.dropoff.title)}</div>
                <div class="gexAddrSub">${esc(state.dropoff.name)} • ${esc(state.dropoff.phone)}</div>
              </div>
            </div>
            <button type="button" class="gexSwapMini" data-act="swap-addr">⇅</button>
          </div>

          <div class="gexRowLink" data-act="back-step4">
            <div class="gexSvcIco" style="background:#f3e8ff">${p.svc.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:15px">${esc(p.svc.eta)}</div>
              <div style="font-size:13px;color:#6b7280">Giao vào ${getEtaTime()} • ${esc(p.svc.name)}</div>
            </div>
            <span class="gexChevron">›</span>
          </div>

          <div class="gexRowLink" data-act="open-vehicle-modal">
            <div class="gexSvcIco">${p.veh.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:15px">${esc(p.veh.name)}</div>
              <div style="font-size:13px;color:#6b7280">${esc(p.veh.spec)}</div>
            </div>
            <span class="gexChevron">›</span>
          </div>

          <div class="gexRowLink" data-act="go-step5b-item">
            <div class="gexSvcIco" style="background:#ffedd5">📦</div>
            <div style="flex:1">
              ${state.item.confirmed
                ? `<div style="font-weight:700;font-size:15px;color:#111827">Cỡ ${esc(state.item.size)} • ${esc(state.item.weight)}kg • ${esc(state.item.cat)}</div>
                   <div style="font-size:13px;color:#059669">Đảm bảo hàng hóa • 1 Phổ thông ✓</div>`
                : `<div style="font-weight:700;font-size:15px;color:#0284c7">Thêm chi tiết món hàng *</div>
                   <div style="font-size:13px;color:#6b7280">Đảm bảo hàng hóa • 1 Phổ thông</div>`}
            </div>
            <span class="gexChevron">›</span>
          </div>
        </div>

        <div class="gexSecTitle">Áp dụng ưu đãi</div>
        <div class="gexCard" style="padding:12px 16px">
          <div class="gexRowLink" data-act="toggle-promo" style="padding:4px 0">
            <span style="font-size:18px">🏷️</span>
            <div style="flex:1;font-weight:600;font-size:14.5px;color:${state.promoActive ? '#111827' : '#6b7280'}">
              ${state.promoActive ? esc(state.promoCode) : 'Chạm để áp dụng ưu đãi giảm 15%'}
            </div>
            <span style="font-size:12.5px;font-weight:700;color:#00b14f">${state.promoActive ? 'Đang dùng' : 'Áp dụng'}</span>
          </div>
        </div>

        <div class="gexSecTitle">Dịch vụ thêm</div>
        <div class="gexCard">
          ${ADDONS.map(a => `
            <label class="gexAddonRow">
              <input type="checkbox" data-act="toggle-addon" data-id="${a.id}" ${state.addons.has(a.id) ? 'checked' : ''}>
              <div style="flex:1">
                <div style="font-weight:600;font-size:14.5px;color:#111827">${esc(a.name)}</div>
                ${a.desc ? `<div style="font-size:12.5px;color:#6b7280;margin-top:2px">${esc(a.desc)}</div>` : ''}
              </div>
              <div style="font-weight:600;font-size:14.5px;color:#111827">${money(a.price)}</div>
            </label>`).join('')}
        </div>
      </div>

      <div class="gexBottomCheckout">
        <div class="gexTotalRow" data-act="open-fare-modal">
          <span>Tổng cộng</span>
          <div style="display:flex;align-items:baseline;gap:8px">
            <strong class="gexFinalPrice">${money(p.finalTotal)}</strong>
            ${p.discount > 0 ? `<del class="gexOldPrice">${money(p.originalTotal)}</del>` : ''}
            <span style="font-size:13px;color:#4b5563">⌃</span>
          </div>
        </div>
        <div class="gexBtnRow">
          <button type="button" class="gexBookmarkBtn" data-act="save-draft" title="Lưu nháp">🔖</button>
          <button type="button" class="gexPrimaryBtn" data-act="go-step6-review" ${canReview ? '' : 'disabled'}>
            ${canReview ? 'Kiểm tra đơn hàng' : 'Thêm chi tiết món hàng để tiếp tục'}
          </button>
        </div>
      </div>`;
  }

  /* BƯỚC 5B: TRANG CHI TIẾT MÓN HÀNG */
  function renderStep5bItem() {
    const valid = Number(state.item.weight) > 0 && Boolean(state.item.cat);
    return `
      <div class="gexHeaderBar">
        <button type="button" class="gexBackPlain" data-act="back-step5">←</button>
        <h2>Chi tiết món hàng</h2>
        <span style="width:36px"></span>
      </div>

      <div class="gexScroll" style="padding:12px 20px 130px;background:#fff">
        <p style="font-size:14.5px;color:#4b5563;margin:0 0 16px">
          Thông tin này giúp tài xế sắp xếp và bảo quản hàng đúng cách.
        </p>

        <div class="gexBoxDiagram">
          <div class="gexShipperBox">
            <span class="gexDimTop">20cm</span>
            <span class="gexDimLeft">20cm</span>
            <div style="font-size:52px">🧑‍✈️📦</div>
            <span class="gexDimBot">25cm</span>
          </div>
        </div>

        <div class="gexSizeWeightGrid">
          <div>
            <div class="gexFieldLbl">Kích cỡ<span style="color:#dc2626">*</span></div>
            <div class="gexSizePills">
              ${['S', 'M', 'L', 'XL'].map(sz => `
                <button type="button" class="gexSizeBtn ${state.item.size === sz ? 'active' : ''}" data-act="pick-size" data-val="${sz}">${sz}</button>
              `).join('')}
            </div>
          </div>
          <div>
            <div class="gexFieldLbl">Trọng lượng<span style="color:#dc2626">*</span></div>
            <div class="gexWeightWrap">
              <input type="number" id="gexWeightIn" min="0.1" max="1000" step="0.1" placeholder="1" value="${esc(state.item.weight)}">
              <span>kg</span>
            </div>
          </div>
        </div>

        <label class="gexPhotoBox ${state.item.photo ? 'hasImg' : ''}" style="display:block;margin-top:18px">
          <input type="file" id="gexPhotoFile" accept="image/*" hidden>
          ${state.item.photo
            ? `<img src="${state.item.photo}" class="gexPhotoPreview" alt="Ảnh gói hàng"><div style="font-size:13px;color:#059669;font-weight:700">Chạm để đổi ảnh gói hàng</div>`
            : `<div style="display:flex;align-items:center;justify-content:center;gap:10px;color:#374151;font-weight:600">
                 <span style="font-size:20px">📷</span>
                 <span>Thêm ảnh (Không bắt buộc)</span>
               </div>`}
        </label>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:22px">
          <div class="gexFieldLbl" style="margin:0">Loại hàng hoá<span style="color:#dc2626">*</span></div>
          <button type="button" class="gexProhibitedLink" data-act="show-prohibited">Mặt hàng nào bị cấm?</button>
        </div>

        <div class="gexTagPills">
          ${ITEM_CATS.map(c => `
            <button type="button" class="gexTagBtn ${state.item.cat === c.label ? 'active' : ''}" data-act="pick-cat" data-val="${esc(c.label)}">
              ${esc(c.label)} ${c.icon}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="gexFooter" style="background:#fff">
        <div class="gexGuaranteeBanner">
          Mới! Ra mắt gói Phổ thông với mức bồi thường lên đến 3.000.000đ
        </div>
        <button type="button" class="gexPrimaryBtn" id="gexItemConfirmBtn" data-act="confirm-step5b" ${valid ? '' : 'disabled'}>
          Xác nhận
        </button>
      </div>`;
  }

  /* BƯỚC 6: KIỂM TRA & ĐẶT ĐƠN */
  function renderStep6Review(p) {
    return `
      <div class="gexHeaderBar">
        <button type="button" class="gexBackPlain" data-act="back-step5">←</button>
        <h2>Xác nhận đơn giao hàng</h2>
        <span style="width:36px"></span>
      </div>

      <div class="gexScroll">
        <div class="gexCard">
          <div style="font-weight:800;font-size:15px;margin-bottom:10px">Lộ trình giao hàng (${p.km} km)</div>
          <div style="font-size:13.5px;margin-bottom:8px">
            <b style="color:#1d74f5">● Điểm lấy:</b> ${esc(state.pickup.title)}<br>
            <span style="color:#6b7280">${esc(state.pickup.name)} • ${esc(state.pickup.phone)}</span>
          </div>
          <div style="font-size:13.5px">
            <b style="color:#ea4335">● Điểm giao:</b> ${esc(state.dropoff.title)}<br>
            <span style="color:#6b7280">${esc(state.dropoff.name)} • ${esc(state.dropoff.phone)}</span>
          </div>
        </div>

        <div class="gexCard">
          <div style="font-weight:800;font-size:15px;margin-bottom:8px">Gói dịch vụ & Hàng hóa</div>
          <div style="font-size:13.5px;line-height:1.7;color:#374151">
            • Gói giao: <b>${esc(p.svc.name)}</b> (${esc(p.veh.name)})<br>
            • Hàng hóa: <b>Cỡ ${esc(state.item.size)} • ${esc(state.item.weight)}kg • ${esc(state.item.cat)}</b><br>
            • Thanh toán: <b>Tiền mặt khi lấy/giao hàng</b>
          </div>
        </div>

        <div class="gexCard">
          <div style="font-weight:800;font-size:15px;margin-bottom:8px">Chi tiết cước phí</div>
          <div class="gexFareLine"><span>Cước vận chuyển (${p.km} km)</span><span>${money(p.baseRaw)}</span></div>
          ${p.addonSum > 0 ? `<div class="gexFareLine"><span>Dịch vụ thêm (${state.addons.size})</span><span>${money(p.addonSum)}</span></div>` : ''}
          ${p.discount > 0 ? `<div class="gexFareLine" style="color:#059669"><span>Ưu đãi 15%</span><span>-${money(p.discount)}</span></div>` : ''}
          <div class="gexFareLine total"><span>Tổng thanh toán</span><span>${money(p.finalTotal)}</span></div>
        </div>
      </div>

      <div class="gexFooter">
        <button type="button" class="gexPrimaryBtn" data-act="submit-order">
          Đặt giao hàng • ${money(p.finalTotal)}
        </button>
      </div>`;
  }

  /* MODAL CHỌN LOẠI XE */
  function renderVehicleModal(p) {
    return `
      <div class="gexSheetOverlay" data-act="close-modal">
        <div class="gexBottomModal" onclick="event.stopPropagation()">
          <div class="gexSheetHandle"></div>
          <h3 style="font-size:20px;font-weight:800;margin:6px 0 14px">Loại xe</h3>
          ${VEHICLES.map(v => {
            const active = v.id === state.vehicleId;
            const est = Math.round(((p.svc.base + p.km * 4800) * (v.id === 'bike' ? 1 : v.mult * 0.78) * 0.85) / 1000) * 1000;
            return `
              <div class="gexSvcOption ${active ? 'active' : ''}" data-act="pick-vehicle" data-id="${v.id}">
                <div class="gexSvcBadgeIco">${v.icon}</div>
                <div style="flex:1">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <b style="font-size:16px">${esc(v.name)}</b>
                    <b style="font-size:16px">${money(est)}</b>
                  </div>
                  <div style="font-size:13.5px;color:#6b7280;margin-top:2px">${esc(v.spec)}</div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  /* MODAL XEM CHI TIẾT GIÁ CƯỚC */
  function renderFareModal(p) {
    return `
      <div class="gexSheetOverlay" data-act="close-modal">
        <div class="gexBottomModal" onclick="event.stopPropagation()">
          <div class="gexSheetHandle"></div>
          <h3 style="font-size:19px;font-weight:800;margin:6px 0 12px">Chi tiết giá cước</h3>
          <div class="gexFareLine"><span>Gói ${esc(p.svc.name)} (${p.km} km)</span><span>${money(p.baseRaw)}</span></div>
          <div class="gexFareLine"><span>Dịch vụ thêm</span><span>${money(p.addonSum)}</span></div>
          <div class="gexFareLine" style="color:#059669"><span>Ưu đãi áp dụng</span><span>-${money(p.discount)}</span></div>
          <div class="gexFareLine total"><span>Tổng cộng</span><span>${money(p.finalTotal)}</span></div>
          <button type="button" class="gexPrimaryBtn" data-act="close-modal" style="margin-top:14px">Đóng</button>
        </div>
      </div>`;
  }

  /* ================== BẢN ĐỒ LEAFLET ================== */
  function initLeafletMap() {
    const el = $('#gexLeafletMap');
    if (!el || typeof L === 'undefined') return;
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    const pt = state.step === 'step2_map'
      ? state.tempPin
      : (state.mapTarget === 'dropoff' ? state.dropoff : state.pickup);

    mapInstance = L.map(el, { zoomControl: false }).setView([pt.lat, pt.lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapInstance);

    const redPin = L.divIcon({
      className: 'gexCustomPin',
      html: `<div class="gexRedMarker"><span></span></div>`,
      iconSize: [36, 44],
      iconAnchor: [18, 42]
    });

    mapMarker = L.marker([pt.lat, pt.lng], { icon: redPin, draggable: state.step === 'step2_map' }).addTo(mapInstance);

    if (state.step === 'step2_map') {
      mapInstance.on('click', e => updatePinCoords(e.latlng.lat, e.latlng.lng));
      mapMarker.on('dragend', () => {
        const ll = mapMarker.getLatLng();
        updatePinCoords(ll.lat, ll.lng);
      });
    }
  }

  async function updatePinCoords(lat, lng) {
    state.tempPin.lat = lat;
    state.tempPin.lng = lng;
    if (mapMarker) mapMarker.setLatLng([lat, lng]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=vi`);
      const data = await res.json();
      if (data?.display_name) {
        const parts = data.display_name.split(',');
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
        state.tempPin = {
          title: parts.slice(0, 2).join(', ').trim(),
          sub: parts.slice(2, 5).join(', ').trim(),
          lat: parseFloat(arr[0].lat),
          lng: parseFloat(arr[0].lon)
        };
        render();
      } else showToast('Không tìm thấy địa chỉ, hãy chạm lên bản đồ');
    } catch {}
  }

  /* ================== ĐIỀU HƯỚNG TỪNG BƯỚC ================== */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn || $('#gnExpressApp')?.hidden) return;
    const act = btn.dataset.act;

    if (act === 'exit') closeExpress();
    else if (act === 'close-toast') { state.toast = ''; render(); }
    else if (act === 'open-orders') { closeExpress(); document.querySelector('[data-go="orders"]')?.click(); }

    // Điều hướng lùi từng bước
    else if (act === 'back-step1') { state.step = 'step1_home'; render(); }
    else if (act === 'back-step2') { state.step = 'step2_map'; render(); }
    else if (act === 'back-step3') { state.step = 'step3_contact'; render(); }
    else if (act === 'back-step4') { state.step = 'step4_service'; render(); }
    else if (act === 'back-step5') { state.step = 'step5_detail'; render(); }

    // Bước 1 -> Bước 2
    else if (act === 'go-step2-drop') {
      state.mapTarget = 'dropoff';
      state.tempPin = state.dropoff.title ? { ...state.dropoff } : { ...QUICK_PLACES[0] };
      state.step = 'step2_map';
      render();
    }
    else if (act === 'go-step2-pick') {
      state.mapTarget = 'pickup';
      state.tempPin = { ...state.pickup };
      state.step = 'step2_map';
      render();
    }
    else if (act === 'quick-place') {
      const pl = QUICK_PLACES[Number(btn.dataset.idx)];
      if (pl) {
        state.mapTarget = 'dropoff';
        state.tempPin = { title: pl.title, sub: pl.sub, lat: pl.lat, lng: pl.lng };
        state.step = 'step2_map';
        render();
      }
    }
    else if (act === 'swap-addr') {
      if (!state.dropoff.title) return showToast('Vui lòng chọn điểm đến trước');
      const tmp = { ...state.pickup };
      state.pickup = { ...state.dropoff };
      state.dropoff = tmp;
      render();
    }
    else if (act === 'search-map') searchMapAddress($('#gexMapSearchInput')?.value || '');
    else if (act === 'locate-gps') {
      navigator.geolocation?.getCurrentPosition(
        pos => updatePinCoords(pos.coords.latitude, pos.coords.longitude),
        () => showToast('Không lấy được GPS, hãy chạm lên bản đồ')
      );
    }

    // Bước 2 -> Bước 3
    else if (act === 'confirm-step2') {
      const target = state.mapTarget === 'dropoff' ? state.dropoff : state.pickup;
      target.title = state.tempPin.title;
      target.sub = state.tempPin.sub;
      target.lat = state.tempPin.lat;
      target.lng = state.tempPin.lng;
      state.step = 'step3_contact';
      render();
    }

    // Bước 3 -> Bước 4 (Trang chọn gói dịch vụ giao hàng)
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

    // Bước 4 -> Bước 5 (Chi tiết đơn hàng)
    else if (act === 'pick-service') {
      state.serviceId = btn.dataset.id;
      if (state.serviceId.startsWith('van_') && state.vehicleId === 'bike') state.vehicleId = 'van500';
      else if (!state.serviceId.startsWith('van_') && state.vehicleId !== 'bike') state.vehicleId = 'bike';
      render();
    }
    else if (act === 'confirm-step4') {
      state.step = 'step5_detail';
      render();
    }

    // Các thao tác trong Bước 5
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
    else if (act === 'apply-promo-card') { state.promoActive = true; state.promoCode = btn.dataset.code; showToast('Đã áp dụng ưu đãi!'); }
    else if (act === 'select-van') { state.serviceId = 'van_priority'; state.vehicleId = 'van500'; state.mapTarget = 'dropoff'; state.tempPin = { ...QUICK_PLACES[0] }; state.step = 'step2_map'; render(); }
    else if (act === 'save-draft') { showToast('Đã lưu đơn hàng vào mục nháp'); }
    else if (act === 'share-trip') { showToast('Đã sao chép liên kết theo dõi đơn hàng!'); }
    else if (act === 'show-prohibited') { alert('Hàng cấm: Chất cháy nổ, vũ khí, chất cấm, tiền mặt giá trị lớn, động vật sống.'); }
    else if (act === 'submit-order') createExpressOrder();
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if ($('#gnExpressApp')?.hidden) return;
    if (t.dataset.act === 'toggle-addon') {
      if (t.checked) state.addons.add(t.dataset.id);
      else state.addons.delete(t.dataset.id);
      render();
    }
    if (t.id === 'gexPhotoFile' && t.files?.[0]) {
      const r = new FileReader();
      r.onload = () => { state.item.photo = r.result; render(); };
      r.readAsDataURL(t.files[0]);
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if ($('#gnExpressApp')?.hidden) return;
    if (t.id === 'gexFloorIn') {
      const target = state.mapTarget === 'dropoff' ? state.dropoff : state.pickup;
      target.floor = t.value;
      const cnt = $('#gexFloorCnt');
      if (cnt) cnt.textContent = t.value.length;
    }
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

  function createExpressOrder() {
    const p = calcPricing();
    const orderId = 'GE' + Date.now().toString().slice(-6);
    const newOrder = {
      id: orderId,
      type: 'express',
      status: 'Đang tìm tài xế',
      createdAt: new Date().toISOString(),
      store: `GoExpress • ${p.svc.name} (${p.veh.name})`,
      from: state.pickup.title,
      to: state.dropoff.title,
      receiver: `${state.dropoff.name} (${state.dropoff.phone})`,
      itemSummary: `Cỡ ${state.item.size} • ${state.item.weight}kg • ${state.item.cat}`,
      total: p.finalTotal,
      items: [{ name: `Giao hàng ${p.svc.name} (${p.km} km)`, qty: 1, price: p.finalTotal }]
    };

    try {
      const list = JSON.parse(localStorage.getItem('gn_orders') || '[]');
      list.unshift(newOrder);
      localStorage.setItem('gn_orders', JSON.stringify(list));
    } catch {}

    const overlay = document.createElement('div');
    overlay.className = 'gexSuccessOverlay';
    overlay.innerHTML = `
      <div class="gexSuccessCard">
        <div class="gexCheckWrap">
          <div class="gexRadarRing"></div>
          <div class="gexCheckCircle">✓</div>
        </div>
        <h3 style="margin:0 0 6px;font-size:21px;font-weight:800">Đặt giao hàng thành công!</h3>
        <p style="margin:0;color:#4b5563;font-size:14px">Mã đơn <b>#${orderId}</b> • Cước phí <b>${money(p.finalTotal)}</b></p>
        <div class="gexDriverPingBadge">
          <span class="gexPingDot"></span>
          <span>Đang kết nối tài xế ${esc(p.veh.name)} gần bạn...</span>
        </div>
        <button type="button" class="gexPrimaryBtn" id="gexDoneGoOrders">Theo dõi đơn hàng</button>
      </div>`;
    document.body.appendChild(overlay);

    $('#gexDoneGoOrders', overlay).onclick = () => {
      overlay.remove();
      closeExpress();
      document.querySelector('[data-go="orders"]')?.click();
    };
  }

  function openExpress() {
    state.step = 'step1_home';
    state.modal = null;
    const root = ensureRoot();
    root.hidden = false;
    document.body.classList.add('noScroll');
    render();
  }

  function closeExpress() {
    const root = $('#gnExpressApp');
    if (root) root.hidden = true;
    document.body.classList.remove('noScroll');
  }

  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-go="express"], [data-svc="express"], .qk');
    if (!trigger) return;
    if (trigger.dataset.go === 'express' || trigger.dataset.svc === 'express' || trigger.textContent.trim().toLowerCase().includes('giao hàng')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openExpress();
    }
  }, true);

  window.openGoExpress = openExpress;
})();
