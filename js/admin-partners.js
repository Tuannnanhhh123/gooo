// [AI] Tab "Nhà hàng" trong trang quản trị: duyệt hồ sơ đối tác từ partner.html. Nạp SAU admin.js (xem admin.html); không sửa admin.js.
// Dùng lại hàm của admin.js (esc, norm, openPanel, closePanel, ask, toast, route, renderNav, pnHead, fmtShort, fmtFull, clean, ui, NAV, PAGES, ICONS, actions).
(() => {
  let partnerApps = load("gonow_partnerapps", []);
  const saveP = () => { save("gonow_partnerapps", partnerApps); renderNav(); };
  const ST = { pending: ["Chờ duyệt", "p-wait"], approved: ["Đã duyệt", "p-done"], rejected: ["Chưa đạt", "p-bad"] };
  const pill = a => { const s = ST[a.status] || ST.pending; return `<span class="pill ${s[1]}">${s[0]}</span>`; };
  const pendingN = () => partnerApps.filter(a => a.status === "pending").length;
  ui.pt = { q: "", status: "all" };
  const LBL = { gpkd: "Giấy phép kinh doanh", attp: "Giấy chứng nhận ATTP", training: "Tập huấn ATTP", health: "Khám sức khỏe", cccdF: "CCCD mặt trước", cccdB: "CCCD mặt sau", front: "Mặt tiền", kitchen: "Khu bếp", menu: "Thực đơn" };
  const strip = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  // Tự kiểm tra sơ bộ để admin khỏi bỏ sót (chỉ tham khảo, admin quyết định)
  function checks(a) {
    const out = [], t = new Date().toISOString().slice(0, 10), in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const add = (ok, text) => out.push([ok, text]);
    add(/^\d{10}(-?\d{3})?$/.test(a.tax || ""), "Mã số thuế đúng định dạng (" + (a.tax || "—") + ")");
    add(/^\d{12}$/.test(a.cccd || ""), "Số CCCD đủ 12 số");
    add(strip(a.accName) === strip(a.owner), "Tên chủ tài khoản ngân hàng trùng tên chủ cơ sở");
    if (a.attp && a.attp.mode === "have") { add(a.attp.to > in30, "Giấy ATTP còn hạn tới " + (a.attp.to || "—").split("-").reverse().join("/")); add(a.attp.to > a.attp.from, "Ngày hết hạn sau ngày cấp"); }
    else out.push([null, "XIN MIỄN giấy ATTP – cần đọc kỹ giải trình và xác minh loại hình có thực sự được miễn"]);
    const need = ["gpkd", "training", "health", "cccdF", "cccdB", "front", "kitchen"].concat(a.attp && a.attp.mode === "have" ? ["attp"] : []);
    const miss = need.filter(k => !(a.docs && a.docs[k]));
    add(!miss.length, miss.length ? "Thiếu ảnh: " + miss.map(k => LBL[k]).join(", ") : "Đủ ảnh giấy tờ bắt buộc");
    add(a.licDate && a.licDate <= t, "Ngày cấp ĐKKD hợp lệ");
    return out;
  }
  const checkHTML = a => `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:4px">${checks(a).map(([ok, tx]) => `<li style="display:flex;gap:8px;font-size:14px"><b style="color:${ok === true ? "#007a3b" : ok === false ? "#d93025" : "#b7791f"}">${ok === true ? "✓" : ok === false ? "✕" : "!"}</b><span>${esc(tx)}</span></li>`).join("")}</ul>`;

  window.viewPartners = () => {
    const c = s => partnerApps.filter(a => a.status === s).length;
    return `<section class="panel"><div class="toolbar">
      <input class="in" id="ptQ" placeholder="Tìm tên quán, chủ quán, SĐT, MST…" value="${esc(ui.pt.q)}" style="min-width:260px">
      <select class="in" id="ptStatus"><option value="all">Mọi trạng thái</option><option value="pending" ${ui.pt.status === "pending" ? "selected" : ""}>Chờ duyệt (${c("pending")})</option><option value="approved" ${ui.pt.status === "approved" ? "selected" : ""}>Đã duyệt (${c("approved")})</option><option value="rejected" ${ui.pt.status === "rejected" ? "selected" : ""}>Chưa đạt (${c("rejected")})</option></select>
      <span class="sp"></span><span class="mut" style="font-size:14px">${partnerApps.length} hồ sơ • <a href="partner.html" target="_blank" rel="noopener">Mở trang đăng ký ↗</a></span></div>
      <div id="ptTable"></div></section>`;
  };
  window.renderPartnersTable = () => {
    const q = norm(ui.pt.q.trim());
    const list = partnerApps.filter(a => (ui.pt.status === "all" || a.status === ui.pt.status) && (!q || norm([a.id, a.name, a.owner, a.phone, a.tax, a.email].join(" ")).includes(q)));
    $("#ptTable").innerHTML = list.length ? `<div class="tblWrap"><table class="tbl"><thead><tr><th>Mã hồ sơ</th><th>Quán</th><th>Chủ cơ sở</th><th>Khu vực</th><th>Giấy ATTP</th><th>Ngày gửi</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${list.map(a => `<tr><td class="id">${esc(a.id)}</td><td><b>${esc(a.name)}</b><br><small>${esc(a.phone)}</small></td><td>${esc(a.owner)}<br><small>MST ${esc(a.tax)}</small></td><td>${esc(a.area)}</td>
        <td>${a.attp && a.attp.mode === "have" ? "Có • hết hạn " + esc((a.attp.to || "").split("-").reverse().join("/")) : "<b style='color:#b7791f'>Xin miễn</b>"}</td><td>${fmtShort(a.ts)}</td><td>${pill(a)}</td>
        <td class="acts"><button class="btn line sm" data-act="ptView" data-id="${esc(a.id)}">Xem hồ sơ</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><b>${partnerApps.length ? "Không có hồ sơ phù hợp" : "Chưa có hồ sơ nào"}</b>${partnerApps.length ? "Thử đổi từ khóa hoặc bộ lọc." : "Hồ sơ gửi từ trang partner.html sẽ hiện ở đây."}</div>`;
  };
  function openPartner(id) {
    const a = partnerApps.find(x => x.id === id); if (!a) return;
    const docs = Object.keys(LBL).filter(k => a.docs && a.docs[k]).map(k => `<figure class="dImg"><button type="button" data-act="ptImg" data-id="${esc(a.id)}:${k}" title="Bấm để mở ảnh lớn"><img src="${esc(a.docs[k])}" alt="${LBL[k]}"></button><figcaption>${LBL[k]}</figcaption></figure>`).join("");
    const at = a.attp || {};
    openPanel(`${pnHead("Hồ sơ " + esc(a.id), `<div style="margin-top:6px">${pill(a)}</div>`)}
      <div class="pnBody">
        <div><p class="sub">KIỂM TRA SƠ BỘ (tham khảo)</p>${checkHTML(a)}</div>
        <div class="kv"><div><p>Tên quán</p><b>${esc(a.name)}</b></div><div><p>Loại hình</p>${esc(a.type)}</div><div><p>Địa chỉ</p>${esc(a.addr)}, ${esc(a.area)}</div><div><p>Giờ mở cửa</p>${esc(a.open)} – ${esc(a.close)}</div>
          <div><p>Điện thoại</p>${esc(a.phone)}</div><div><p>Email tài khoản</p>${esc(a.email || "—")}</div><div><p>Nhóm món</p>${esc((a.cats || []).join(", "))}</div><div><p>GPS</p>${a.gps ? esc(a.gps.lat + ", " + a.gps.lng) : "Không có"}</div>
          <div><p>Chủ cơ sở</p><b>${esc(a.owner)}</b></div><div><p>CCCD</p>${esc(a.cccd)}</div><div><p>Hình thức</p>${esc(a.bizForm)}</div><div><p>Mã số thuế</p>${esc(a.tax)}</div>
          <div><p>Số ĐKKD • ngày cấp</p>${esc(a.lic)} • ${esc((a.licDate || "").split("-").reverse().join("/"))}</div>
          <div><p>Giấy ATTP</p>${at.mode === "have" ? esc(at.no) + " (" + esc((at.from || "").split("-").reverse().join("/")) + " → " + esc((at.to || "").split("-").reverse().join("/")) + ")" : "Xin miễn"}</div>
          <div><p>Ngân hàng</p>${esc(a.bank)} • ${esc(a.acc)}</div><div><p>Chủ tài khoản</p>${esc(a.accName)}</div><div><p>Gửi lúc</p>${fmtFull(a.ts)}</div></div>
        ${at.mode === "exempt" ? `<div><p class="sub">GIẢI TRÌNH XIN MIỄN ATTP</p><p style="font-size:14px;line-height:1.6">${esc(at.why)}</p></div>` : ""}
        <div><p class="sub">GIẤY TỜ ĐÃ TẢI LÊN</p>${docs ? `<div class="dImgs">${docs}</div>` : `<p class="mut" style="font-size:14px">Không có ảnh.</p>`}</div>
        <div><p class="sub">GHI CHÚ GỬI CHO ĐỐI TÁC</p><label class="field"><textarea class="in" id="ptNote" maxlength="300" placeholder="Ví dụ: Giấy ATTP đã hết hạn, vui lòng bổ sung bản mới.">${esc(a.note || "")}</textarea><small>Đối tác thấy ghi chú này ở trang đăng ký. Bắt buộc điền khi từ chối.</small></label></div>
        ${a.reviewedAt ? `<p class="mut" style="font-size:13px">Xử lý lần cuối: ${fmtFull(a.reviewedAt)}</p>` : ""}
      </div>
      <div class="pnFoot"><button class="btn danger" data-act="ptDelete" data-id="${esc(a.id)}">Xóa hồ sơ</button><span class="sp"></span>
        ${a.status !== "pending" ? `<button class="btn line" data-act="ptReopen" data-id="${esc(a.id)}">Đưa về chờ duyệt</button>` : ""}
        ${a.status !== "rejected" ? `<button class="btn danger" data-act="ptReject" data-id="${esc(a.id)}">Từ chối</button>` : ""}
        ${a.status !== "approved" ? `<button class="btn brand" data-act="ptApprove" data-id="${esc(a.id)}">Duyệt hồ sơ</button>` : ""}</div>`);
  }
  function setStatus(id, status) {
    const a = partnerApps.find(x => x.id === id); if (!a) return;
    const note = $("#ptNote") ? clean($("#ptNote").value).slice(0, 300) : a.note;
    if (status === "rejected" && !note) { toast("Hãy ghi lý do từ chối để đối tác biết cách bổ sung."); const n = $("#ptNote"); if (n) n.focus(); return; }
    if (status === "approved" && checks(a).some(c => c[0] === false)) { if (!window.confirm("Hồ sơ còn mục kiểm tra chưa đạt (dấu ✕). Vẫn duyệt?")) return; }
    a.status = status; a.note = note; a.reviewedAt = Date.now(); saveP(); closePanel(); route();
    toast(status === "approved" ? "Đã duyệt hồ sơ " + id : status === "rejected" ? "Đã từ chối hồ sơ " + id : "Đã đưa hồ sơ " + id + " về chờ duyệt");
  }
  async function openImg(ref) {
    const [id, k] = ref.split(":"), a = partnerApps.find(x => x.id === id); if (!a || !a.docs || !a.docs[k]) return;
    try { const b = await (await fetch(a.docs[k])).blob(); window.open(URL.createObjectURL(b), "_blank", "noopener"); } catch (e) { toast("Không mở được ảnh này."); }
  }
  Object.assign(actions, {
    ptView: openPartner, ptApprove: id => setStatus(id, "approved"), ptReject: id => setStatus(id, "rejected"), ptReopen: id => setStatus(id, "pending"), ptImg: openImg,
    ptDelete: async id => { if (await ask("Xóa hồ sơ " + id + "?", "Hồ sơ và ảnh giấy tờ bị xóa vĩnh viễn.", "Xóa hồ sơ", true)) { partnerApps = partnerApps.filter(a => a.id !== id); saveP(); closePanel(); route(); toast("Đã xóa hồ sơ " + id); } }
  });
  // Gắn vào điều hướng
  NAV.splice(3, 0, ["partners", "Nhà hàng"]);
  ICONS.partners = '<path d="M4 10l1-5h14l1 5"/><path d="M4 10a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0"/><path d="M5 12v8h14v-8M10 20v-4h4v4"/>';
  PAGES.partners = ["Hồ sơ nhà hàng đối tác", window.viewPartners, window.renderPartnersTable];
  const origNav = renderNav;
  renderNav = function () { origNav(); const a = document.querySelector('#nav a[href="#partners"]'); if (a && pendingN()) a.insertAdjacentHTML("beforeend", `<span class="cnt">${pendingN()}</span>`); };
  document.addEventListener("input", e => { if (e.target.id === "ptQ") { ui.pt.q = e.target.value; renderPartnersTable(); } });
  document.addEventListener("change", e => { if (e.target.id === "ptStatus") { ui.pt.status = e.target.value; renderPartnersTable(); } });
  // đồng bộ khi Firestore (hoặc tab khác) cập nhật
  window.addEventListener("gn-remote", e => { if (e.detail && e.detail.key === "gonow_partnerapps") { partnerApps = load("gonow_partnerapps", []); renderNav(); if (curPage === "partners") route(); } });
  window.addEventListener("storage", e => { if (e.key === "gonow_partnerapps") { partnerApps = load("gonow_partnerapps", []); renderNav(); if (curPage === "partners") route(); } });
})();