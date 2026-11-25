// [AI] XÁC MINH TÀI XẾ NGAY TRÊN TRÌNH DUYỆT (miễn phí, không cần máy chủ).
//  • Giấy tờ chỉ chụp bằng camera trong khung hướng dẫn (không chọn ảnh từ thư viện) → khó dùng ảnh có sẵn/ảnh chụp lại màn hình.
//  • Kiểm tra chất lượng ảnh: mờ, quá tối/sáng.
//  • OCR (Tesseract.js): đọc số CCCD, họ tên, ngày sinh; hạng + ngày hết hạn bằng lái → đối chiếu với thông tin ứng viên đã khai.
//  • Nhận diện khuôn mặt (face-api.js): tìm ảnh chân dung trên CCCD, so khuôn mặt selfie với CCCD.
//  • Thử thách "người thật" NGẪU NHIÊN (quay trái/phải, chớp mắt, há miệng) và kiểm tra vẫn là cùng một khuôn mặt từ đầu đến cuối.
// GIỚI HẠN (nói thẳng): code chạy ở trình duyệt nên người rành kỹ thuật vẫn có thể can thiệp; công cụ miễn phí không phát hiện được
// mọi kiểu giả mạo (video quay sẵn, mặt nạ...). Vì vậy kết quả ở đây là CHẤM ĐIỂM SÀNG LỌC, ADMIN LUÔN LÀ NGƯỜI QUYẾT ĐỊNH CUỐI CÙNG
// (xem điểm + ảnh trong admin.html). Xác thực tuyệt đối với dữ liệu quốc gia (VNeID) chỉ có qua đối tác được cấp phép.
const KYC = (() => {
  const cfg = {
    faceBase: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/",
    tessSrc: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    passDist: 0.50,        // khoảng cách khuôn mặt ≤ ngưỡng này: khớp
    failDist: 0.65,        // > ngưỡng này: không khớp (giữa hai ngưỡng: cần admin xem kỹ)
    sameDist: 0.50,        // selfie đầu và cuối phiên phải là cùng một người
    minBlur: 45, warnBlur: 80, minLum: 45, maxLum: 220,
    turn: 0.14,            // độ lệch mũi khỏi giữa mặt để tính là "quay mặt"
    challengeSec: 9
  };
  const $ = s => document.querySelector(s);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const loadScript = src => new Promise((ok, bad) => { if (document.querySelector(`script[data-k="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.dataset.k = src; s.onload = ok; s.onerror = () => bad(new Error("Không tải được thư viện xác minh. Kiểm tra mạng.")); document.head.appendChild(s); });
  const strip = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9\s/.-]/g, " ").replace(/\s+/g, " ").trim();

  // ---------- Tải mô hình (lần đầu ~10MB, sau đó trình duyệt nhớ) ----------
  let faceP = null;
  function loadFace(say) {
    return faceP || (faceP = (async () => {
      say && say("Đang tải mô hình nhận diện khuôn mặt (chỉ lần đầu)…");
      await loadScript(cfg.faceBase + "dist/face-api.js");
      const u = cfg.faceBase + "model/";
      await Promise.all([faceapi.nets.ssdMobilenetv1.loadFromUri(u), faceapi.nets.tinyFaceDetector.loadFromUri(u), faceapi.nets.faceLandmark68Net.loadFromUri(u), faceapi.nets.faceRecognitionNet.loadFromUri(u)]);
    })().catch(e => { faceP = null; throw e; }));
  }
  const ssd = () => new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });

  // ---------- Camera ----------
  const hasCam = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
  function overlay({ facing, aspect, title, tip, shutter }) {
    return new Promise(async (res, rej) => {
      const w = document.createElement("div"); w.className = "kcWrap"; w.setAttribute("role", "dialog"); w.setAttribute("aria-modal", "true");
      w.innerHTML = `<div class="kcBox"><div class="kcHead"><b>${title}</b><button type="button" class="kcX" aria-label="Đóng">✕</button></div>
        <div class="kcStage"><video playsinline muted autoplay></video>${aspect ? '<div class="kcGuide"></div>' : '<div class="kcOval"></div>'}<div class="kcFlash"></div></div>
        <p class="kcTip">${tip || ""}</p><div class="kcBar">${shutter ? '<button type="button" class="kcShot" aria-label="Chụp"></button>' : ""}</div></div>`;
      document.body.appendChild(w); document.body.style.overflow = "hidden";
      const video = w.querySelector("video"), stage = w.querySelector(".kcStage"), tipEl = w.querySelector(".kcTip");
      let stream = null;
      const close = () => { if (stream) stream.getTracks().forEach(t => t.stop()); w.remove(); document.body.style.overflow = ""; };
      w.querySelector(".kcX").onclick = () => { close(); rej(new Error("cancel")); };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } } });
        video.srcObject = stream; await video.play();
        await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = r; });
      } catch (e) { close(); return rej(new Error(e && e.name === "NotAllowedError" ? "Bạn chưa cho phép dùng camera. Hãy bật quyền camera cho trang này." : "Không mở được camera trên thiết bị này.")); }
      stage.style.aspectRatio = video.videoWidth + " / " + video.videoHeight;
      if (facing === "user") video.classList.add("mirror");
      res({ video, tip: t => { tipEl.textContent = t; }, close, stage,
        shot: () => new Promise(done => { w.querySelector(".kcShot").onclick = () => done(); }) });
    });
  }
  function grab(video, aspect, maxSide) {   // cắt đúng vùng khung hướng dẫn (rộng 88% khung hình)
    const vw = video.videoWidth, vh = video.videoHeight;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (aspect) { sw = Math.round(vw * 0.88); sh = Math.round(sw / aspect); if (sh > vh * 0.9) { sh = Math.round(vh * 0.9); sw = Math.round(sh * aspect); } sx = Math.round((vw - sw) / 2); sy = Math.round((vh - sh) / 2); }
    const k = Math.min(1, maxSide / Math.max(sw, sh)), c = document.createElement("canvas"); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    c.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height); return c;
  }
  function quality(c) {
    const w = Math.min(480, c.width), h = Math.max(1, Math.round(c.height * w / c.width)), t = document.createElement("canvas"); t.width = w; t.height = h;
    const g = t.getContext("2d", { willReadFrequently: true }); g.drawImage(c, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, y = new Float32Array(w * h); let sum = 0;
    for (let i = 0; i < w * h; i++) { y[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; sum += y[i]; }
    let m = 0, m2 = 0, n = 0;
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const p = j * w + i, l = 4 * y[p] - y[p - 1] - y[p + 1] - y[p - w] - y[p + w]; m += l; m2 += l * l; n++; }
    return { blur: Math.round(m2 / n - (m / n) ** 2), lum: Math.round(sum / (w * h)) };
  }
  const qIssue = q => q.blur < cfg.minBlur ? "Ảnh bị mờ. Giữ chắc tay, lấy nét rồi chụp lại." : q.lum < cfg.minLum ? "Ảnh quá tối. Hãy chụp nơi đủ sáng." : q.lum > cfg.maxLum ? "Ảnh bị lóa/quá sáng. Tránh ánh đèn chiếu thẳng vào giấy tờ." : "";

  // Chụp giấy tờ: trả về {url, q, source}. Không có camera → cho chọn ảnh nhưng đánh dấu source:"file" (admin sẽ thấy cảnh báo).
  async function captureDoc({ title, tip, aspect = 1.586, side = 1100, kb = 110 }) {
    if (!hasCam()) throw Object.assign(new Error("nocam"), { nocam: true });
    const ov = await overlay({ facing: "environment", aspect, title, tip, shutter: true });
    try {
      for (;;) {
        await ov.shot();
        const c = grab(ov.video, aspect, 1600), q = quality(c), bad = qIssue(q);
        if (bad) { ov.tip(bad); continue; }
        ov.close(); return { canvas: c, url: toJpeg(c, side, kb), q, source: "camera" };
      }
    } catch (e) { ov.close(); throw e; }
  }
  function toJpeg(c, side, kb) {
    let k = Math.min(1, side / Math.max(c.width, c.height)), q = 0.82, out = "";
    for (let i = 0; i < 10; i++) {
      const t = document.createElement("canvas"); t.width = Math.round(c.width * k); t.height = Math.round(c.height * k); t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
      out = t.toDataURL("image/jpeg", q); if (out.length * 0.75 <= kb * 1024) break; if (q > 0.55) q -= 0.08; else k *= 0.88;
    }
    return out;
  }
  const imgFrom = src => new Promise((ok, bad) => { if (src instanceof HTMLCanvasElement) return ok(src); const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });

  // ---------- OCR ----------
  async function ocr(canvas, say) {
    say && say("Đang đọc chữ trên giấy tờ… (có thể mất 10–30 giây)");
    await loadScript(cfg.tessSrc);
    const r = await Tesseract.recognize(canvas, "vie");
    return r.data.text || "";
  }
  const dates = t => [...t.matchAll(/(\d{2})[\/.\- ](\d{2})[\/.\- ](\d{4})/g)].map(m => ({ d: +m[1], m: +m[2], y: +m[3], s: `${m[3]}-${m[2]}-${m[1]}` })).filter(x => x.m >= 1 && x.m <= 12 && x.d >= 1 && x.d <= 31);
  function matchCccd(text, typed) {                      // typed = {no, name, dob}; chạy lại được khi ứng viên sửa thông tin
    const flat = text.replace(/[^\d]/g, ""), norm = strip(text);
    const nums = (text.replace(/[Oo]/g, "0").match(/\d[\d ]{10,14}\d/g) || []).map(x => x.replace(/ /g, "")).filter(x => x.length === 12);
    const toks = strip(typed.name).split(" ").filter(Boolean), hit = toks.filter(t => norm.includes(t)).length;
    return { noOk: !!typed.no && (flat.includes(typed.no) || nums.includes(typed.no)), nameOk: toks.length ? hit / toks.length >= 0.7 : null,
      dobOk: typed.dob ? dates(text).some(x => x.s === typed.dob) : null, readNo: nums[0] || "" };
  }
  async function readCccd(canvas, say) { return { text: await ocr(canvas, say) }; }
  const VEH_CLASS = { bike: ["A", "A1", "A2", "A3", "A4"], car4: ["B1", "B2", "B", "C", "D", "E", "FB2", "FC"], car7: ["B1", "B2", "B", "C", "D", "E", "FB2", "FC"] };
  async function readLicense(canvas, say) {
    const text = await ocr(canvas, say), up = text.toUpperCase().replace(/[^A-Z0-9\s/.:-]/g, " ");
    const cm = [...up.matchAll(/\b(FB2|FC|A[1-4]?|B[12]?|C|D|E)\b/g)].map(m => m[1]);
    const cls = cm.find(x => x.length > 1) || cm[0] || "";
    const ds = dates(text).map(x => x.s).sort();
    return { cls, expiry: ds.length ? ds[ds.length - 1] : "" };
  }
  function licCheck(l, vehicle) {                         // so với loại xe đã chọn + ngày hôm nay
    const today = new Date().toISOString().slice(0, 10);
    return { cls: l.cls, expiry: l.expiry, classOk: l.cls ? (VEH_CLASS[vehicle] || []).includes(l.cls) : null, expired: l.expiry ? l.expiry < today : null };
  }

  // ---------- Khuôn mặt ----------
  async function faceOf(src, say) {
    await loadFace(say); const im = await imgFrom(src);
    const r = await faceapi.detectSingleFace(im, ssd()).withFaceLandmarks().withFaceDescriptor();
    return r ? { desc: r.descriptor, score: r.detection.score, box: r.detection.box } : null;
  }
  const dist = (a, b) => faceapi.euclideanDistance(a, b);
  const faceLevel = d => d <= cfg.passDist ? "pass" : d <= cfg.failDist ? "review" : "fail";

  // ---------- Thử thách người thật ----------
  const pt = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  function metrics(lm) {
    const P = lm.positions, jaw = [P[0], P[16]], nose = P[30];
    const yaw = 1 - (nose.x - jaw[0].x) / Math.max(1, jaw[1].x - jaw[0].x);    // đã đảo gương: <0.5 = mặt quay về TRÁI màn hình
    const ear = (a, b, c, d, e, f) => (pt(P[b], P[f]) + pt(P[c], P[e])) / (2 * pt(P[a], P[d]));
    const eye = (ear(36, 37, 38, 39, 40, 41) + ear(42, 43, 44, 45, 46, 47)) / 2;
    const mouth = pt(P[62], P[66]) / Math.max(1, pt(P[60], P[64]));
    return { yaw, eye, mouth };
  }
  const CH = {
    left:  { say: "Quay mặt sang TRÁI (về phía trái màn hình)", test: (m) => m.yaw < 0.5 - cfg.turn },
    right: { say: "Quay mặt sang PHẢI (về phía phải màn hình)", test: (m) => m.yaw > 0.5 + cfg.turn },
    mouth: { say: "Há miệng ra", test: (m) => m.mouth > 0.35 },
    blink: { say: "Chớp mắt 2 lần", test: null }
  };
  const pick2 = () => { const k = Object.keys(CH), a = new Uint32Array(4); crypto.getRandomValues(a); const i = a[0] % k.length, r = k.filter((_, j) => j !== i); return [k[i], r[a[1] % r.length]]; };

  async function liveness({ say }) {
    await loadFace(say);
    if (!hasCam()) throw Object.assign(new Error("nocam"), { nocam: true });
    const ov = await overlay({ facing: "user", title: "Quét khuôn mặt", tip: "Đặt khuôn mặt vào giữa khung hình" });
    const v = ov.video, tiny = new faceapi.TinyFaceDetectorOptions({ inputSize: 288, scoreThreshold: 0.5 });
    const look = async () => { const r = await faceapi.detectSingleFace(v, tiny).withFaceLandmarks(); return r ? { m: metrics(r.landmarks), w: r.detection.box.width / v.videoWidth } : null; };
    const snap = async () => { const c = grab(v, 0, 640), f = await faceOf(c); return f ? { c, f } : null; };
    const out = { ok: false, challenges: [], steps: [], sameDist: null, selfie: "", desc: null };
    try {
      // 1) nhìn thẳng, giữ yên → chụp selfie đầu tiên
      ov.tip("Nhìn thẳng vào camera, giữ yên…"); let steady = 0, first = null, t0 = Date.now();
      while (!first) {
        if (Date.now() - t0 > 20000) throw new Error("Không thấy rõ khuôn mặt. Hãy tìm nơi đủ sáng và đưa mặt vào giữa khung.");
        const s = await look();
        if (s && s.w > 0.22 && Math.abs(s.m.yaw - 0.5) < 0.08) { steady++; ov.tip("Giữ yên…"); } else { steady = 0; ov.tip(s ? (s.w <= 0.22 ? "Đưa mặt lại gần hơn" : "Nhìn thẳng vào camera") : "Đặt khuôn mặt vào giữa khung hình"); }
        if (steady >= 4) { first = await snap(); steady = 0; }
        await wait(120);
      }
      // 2) hai thử thách ngẫu nhiên
      out.challenges = pick2();
      for (const key of out.challenges) {
        const ch = CH[key]; ov.tip(ch.say); let done = false, closed = false, blinks = 0; const end = Date.now() + cfg.challengeSec * 1000, base = { eye: 0.3 };
        while (Date.now() < end && !done) {
          const s = await look(); await wait(60);
          if (!s) continue;
          if (key === "blink") { if (s.m.eye < 0.2) closed = true; else if (closed && s.m.eye > 0.25) { blinks++; closed = false; ov.tip(`Chớp mắt… (${blinks}/2)`); } done = blinks >= 2; }
          else done = ch.test(s.m);
        }
        out.steps.push({ k: key, ok: done });
        if (!done) throw new Error("Chưa nhận ra động tác “" + ch.say.replace(/ \(.*\)/, "") + "”. Hãy thử lại, làm chậm và rõ động tác.");
        ov.tip("Tốt lắm!"); await wait(350);
      }
      // 3) quay lại nhìn thẳng → selfie thứ hai, phải cùng một người với selfie đầu
      ov.tip("Nhìn thẳng vào camera một lần nữa…"); steady = 0; let last = null; t0 = Date.now();
      while (!last) {
        if (Date.now() - t0 > 12000) throw new Error("Không nhận lại được khuôn mặt ở bước cuối. Hãy thử lại.");
        const s = await look(); if (s && s.w > 0.22 && Math.abs(s.m.yaw - 0.5) < 0.08) steady++; else steady = 0;
        if (steady >= 3) last = await snap(); await wait(120);
      }
      out.sameDist = +dist(first.f.desc, last.f.desc).toFixed(3);
      out.selfie = toJpeg(first.c, 360, 45); out.desc = first.f.desc;
      out.ok = out.sameDist <= cfg.sameDist;
      if (!out.ok) throw new Error("Khuôn mặt đầu và cuối phiên quét không giống nhau. Vui lòng tự quét lại.");
      ov.tip("Hoàn tất ✓"); await wait(500);
    } finally { ov.close(); }
    return out;
  }

  // ---------- Tổng hợp mức tin cậy ----------
  function summarize(k) {
    const flags = [], hard = [];
    if (!k.live || !k.live.ok) hard.push("Chưa qua thử thách người thật");
    if (k.faceFound === false) hard.push("Không thấy ảnh chân dung trên CCCD");
    if (k.faceDist != null && k.faceLevel === "fail") hard.push("Khuôn mặt không khớp CCCD");
    if (k.faceLevel === "review") flags.push("Độ khớp khuôn mặt ở mức trung bình");
    if (k.cccd) { if (k.cccd.noOk === false) flags.push("Số CCCD đọc được không khớp số đã khai"); if (k.cccd.nameOk === false) flags.push("Họ tên trên CCCD không khớp"); if (k.cccd.dobOk === false) flags.push("Ngày sinh trên CCCD không khớp"); }
    if (k.lic) { if (k.lic.expired === true) hard.push("Bằng lái đã hết hạn"); if (k.lic.classOk === false) hard.push("Hạng bằng lái không phù hợp loại xe"); if (k.lic.cls === "" ) flags.push("Chưa đọc được hạng bằng lái"); if (!k.lic.expiry) flags.push("Chưa đọc được ngày hết hạn bằng lái"); }
    if (Object.values(k.src || {}).includes("file")) flags.push("Có ảnh tải từ thư viện (không chụp trực tiếp)");
    return { level: hard.length ? "fail" : flags.length ? "review" : "pass", hard, flags };
  }
  return { cfg, toJpeg, quality, qIssue, hasCam, loadFace, captureDoc, readCccd, matchCccd, readLicense, licCheck, faceOf, dist, faceLevel, liveness, summarize };
})();