(function () {
  "use strict";

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  // A4 页面位图：300 dpi（210 mm × 297 mm → 2480 × 3508 px），线条更清晰。
  const A4 = {
    width: 2480,
    height: 3508,
    pageWidth: 595.28,
    pageHeight: 841.89
  };

  const STORAGE_KEY = "vernier-caliper-minimal-v1";
  const PAGE_CAPACITY = window.Caliper.PAGE_CAPACITY;

  const state = {
    resolution: "0.02",
    count: 20,
    answers: false
  };

  let questions = [];
  let isBusy = false;
  let countTimer = 0;
  let toastTimer = 0;

  const els = {};

  function cacheElements() {
    els.sheets = $("#sheets");
    els.resolutionValue = $("#resolutionValue");
    els.countValue = $("#countValue");
    els.workspaceMeta = $("#workspaceMeta");
    els.countInput = $("#countInput");
    els.countRange = $("#countRange");
    els.decreaseBtn = $("#decreaseBtn");
    els.increaseBtn = $("#increaseBtn");
    els.regenerateBtn = $("#regenerateBtn");
    els.answerToggle = $("#answerToggle");
    els.downloadPdfTop = $("#downloadPdfTop");
    els.downloadPdfSide = $("#downloadPdfSide");
    els.busyLayer = $("#busyLayer");
    els.busyTitle = $("#busyTitle");
    els.busyDetail = $("#busyDetail");
    els.toast = $("#toast");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function currentProfile() {
    return window.Caliper.PROFILES[state.resolution];
  }

  function pageCount(count) {
    return Math.ceil(count / PAGE_CAPACITY);
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (window.Caliper.PROFILES[saved.resolution]) state.resolution = saved.resolution;
      if (Number.isFinite(Number(saved.count))) state.count = clamp(Number(saved.count), 1, 60);
    } catch (error) {
      // The generator works without storage.
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ resolution: state.resolution, count: state.count }));
    } catch (error) {
      // Ignore private-mode storage failures.
    }
  }

  function init() {
    cacheElements();
    loadSettings();
    bindEvents();
    regenerate();
  }

  function bindEvents() {
    $$('input[name="resolution"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        state.resolution = input.value;
        regenerate();
        saveSettings();
      });
    });

    const resolutionInputs = $$('input[name="resolution"]');
    resolutionInputs.forEach((input, index) => {
      input.addEventListener("keydown", (event) => {
        if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
        const next = resolutionInputs[(index + direction + resolutionInputs.length) % resolutionInputs.length];
        next.checked = true;
        next.dispatchEvent(new Event("change", { bubbles: true }));
        next.focus();
      });
    });

    els.decreaseBtn.addEventListener("click", () => commitCount(state.count - 1));
    els.increaseBtn.addEventListener("click", () => commitCount(state.count + 1));

    els.countInput.addEventListener("input", () => {
      const value = Number(els.countInput.value);
      if (Number.isFinite(value) && value >= 1 && value <= 60) paintCount(value, false);
    });

    els.countInput.addEventListener("change", () => {
      commitCount(els.countInput.value);
    });

    els.countInput.addEventListener("blur", () => {
      paintCount(state.count, false);
    });

    els.countRange.addEventListener("input", () => {
      const value = Number(els.countRange.value);
      paintCount(value, false);
      window.clearTimeout(countTimer);
      countTimer = window.setTimeout(() => commitCount(value), 120);
    });

    els.countRange.addEventListener("change", () => {
      window.clearTimeout(countTimer);
      commitCount(Number(els.countRange.value));
    });

    $$("[data-count]").forEach((button) => {
      button.addEventListener("click", () => commitCount(Number(button.dataset.count)));
    });

    els.answerToggle.addEventListener("change", () => {
      state.answers = els.answerToggle.checked;
      renderSheets();
      syncMeta();
    });

    els.regenerateBtn.addEventListener("click", regenerate);
    els.downloadPdfTop.addEventListener("click", exportPdf);
    els.downloadPdfSide.addEventListener("click", exportPdf);
  }

  function regenerate() {
    questions = window.Caliper.generateQuestions(state.resolution, state.count);
    renderSheets();
    syncMeta();
  }

  function commitCount(raw) {
    const parsed = Number.parseInt(raw, 10);
    const next = clamp(Number.isFinite(parsed) ? parsed : state.count, 1, 60);

    if (next === state.count) {
      paintCount(next, true);
      return;
    }

    state.count = next;
    questions = window.Caliper.generateQuestions(state.resolution, state.count);
    renderSheets();
    syncMeta();
    saveSettings();
  }

  function paintCount(count, syncInput) {
    const n = clamp(Number(count) || 1, 1, 60);
    const pages = pageCount(n);

    els.countValue.textContent = `${n} 题 · ${pages} 页`;
    els.countRange.value = String(n);
    els.countRange.style.setProperty("--range-progress", `${((n - 1) / 59) * 100}%`);
    if (syncInput) els.countInput.value = String(n);

    $$("[data-count]").forEach((button) => {
      button.classList.toggle("is-current", Number(button.dataset.count) === n);
    });
  }

  function syncMeta() {
    const profile = currentProfile();
    const pages = pageCount(state.count);

    $$(".resolution-option").forEach((option) => {
      const input = $('input[name="resolution"]', option);
      option.classList.toggle("is-selected", input.value === state.resolution);
    });

    paintCount(state.count, true);
    els.answerToggle.checked = state.answers;
    els.resolutionValue.textContent = `${profile.value} mm`;
    els.workspaceMeta.textContent = `${profile.value} mm · ${profile.label} · ${state.count} 题 · ${pages} 页`;
    els.downloadPdfTop.title = `下载 ${pages} 页 A4 PDF（${state.answers ? "答案版" : "题版"}）`;
    els.downloadPdfSide.textContent = "生成 PDF";
    els.downloadPdfTop.disabled = isBusy;
    els.downloadPdfSide.disabled = isBusy;
  }

  function renderSheets() {
    const profile = currentProfile();
    const pages = [];
    for (let i = 0; i < questions.length; i += PAGE_CAPACITY) {
      pages.push(questions.slice(i, i + PAGE_CAPACITY));
    }

    els.sheets.innerHTML = "";
    const fragment = document.createDocumentFragment();

    pages.forEach((pageQuestions, pageIndex) => {
      const figure = document.createElement("figure");
      figure.className = "sheet-figure";

      const caption = document.createElement("figcaption");
      caption.className = "sheet-caption";
      caption.innerHTML = `<span>第 ${pageIndex + 1} / ${pages.length} 页 · ${pageQuestions.length} 题</span><span>A4 · 20 题 / 页</span>`;

      const paper = document.createElement("div");
      paper.className = "sheet-paper";
      paper.innerHTML = window.Caliper.renderSheetSVG(
        pageQuestions,
        pageIndex * PAGE_CAPACITY + 1,
        pageIndex,
        pages.length,
        profile,
        state.answers
      );

      figure.append(caption, paper);
      fragment.append(figure);
    });

    els.sheets.append(fragment);
    syncMeta();
  }

  function toast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 2600);
  }

  function setBusy(visible, title, detail) {
    isBusy = visible;
    els.busyLayer.classList.toggle("is-visible", visible);
    els.busyLayer.setAttribute("aria-hidden", String(!visible));
    if (title) els.busyTitle.textContent = title;
    if (detail) els.busyDetail.textContent = detail;
    els.downloadPdfTop.disabled = visible;
    els.downloadPdfSide.disabled = visible;
    els.regenerateBtn.disabled = visible;
  }

  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async function ensureFonts() {
    if (!document.fonts) return;
    try {
      await document.fonts.ready;
    } catch (error) {
      // System fonts remain usable.
    }
  }

  function loadSvgImage(svgText) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("无法渲染页面线稿"));
      };
      image.src = url;
    });
  }

  function drawPageCanvas(image) {
    const canvas = document.createElement("canvas");
    canvas.width = A4.width;
    canvas.height = A4.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, A4.width, A4.height);
    ctx.drawImage(image, 0, 0, A4.width, A4.height);
    return canvas;
  }

  function canvasToJpeg(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            reject(new Error("页面编码失败"));
            return;
          }
          const buffer = await blob.arrayBuffer();
          resolve({
            bytes: new Uint8Array(buffer),
            width: canvas.width,
            height: canvas.height
          });
        },
        "image/jpeg",
        0.95
      );
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function exportPdf() {
    if (isBusy) return;

    const profile = currentProfile();
    const snapshot = questions.slice();
    const answers = state.answers;
    const pages = [];
    for (let i = 0; i < snapshot.length; i += PAGE_CAPACITY) {
      pages.push(snapshot.slice(i, i + PAGE_CAPACITY));
    }
    const totalPages = pages.length;
    const edition = answers ? "答案版" : "题版";
    const images = [];

    try {
      setBusy(true, "正在生成 PDF", `排版第 1 / ${totalPages} 页…`);
      await ensureFonts();
      await nextPaint();

      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        els.busyDetail.textContent = `绘制第 ${pageIndex + 1} / ${totalPages} 页…`;
        await nextPaint();

        const svg = window.Caliper.renderSheetSVG(
          pages[pageIndex],
          pageIndex * PAGE_CAPACITY + 1,
          pageIndex,
          totalPages,
          profile,
          answers
        );
        const image = await loadSvgImage(svg);
        const canvas = drawPageCanvas(image);
        images.push(await canvasToJpeg(canvas));
      }

      els.busyTitle.textContent = "正在写入 PDF";
      els.busyDetail.textContent = "生成可打印文件…";
      await nextPaint();

      const pdf = window.SimplePDF.buildPdf(images, {
        pageWidth: A4.pageWidth,
        pageHeight: A4.pageHeight
      });
      downloadBlob(pdf, `游标卡尺简笔画_${state.resolution}mm_${snapshot.length}题_${edition}.pdf`);
      toast(`已生成 ${totalPages} 页 A4 PDF`);
    } catch (error) {
      console.error(error);
      toast("PDF 生成失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();