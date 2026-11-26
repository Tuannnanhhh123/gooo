// [AI] Phần nhỏ của giao diện kiểu Grab: đồng bộ số trên nút giỏ nổi (#badge → .gFabN). Mọi logic khác nằm trong app.js.
(() => {
  const src = document.getElementById("badge"), dst = document.querySelector(".gFabN");
  if (!src || !dst) return;
  const sync = () => { const n = (src.textContent || "0").trim(); dst.textContent = n === "0" ? "" : n; dst.dataset.n = n; };
  new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  sync();
})();