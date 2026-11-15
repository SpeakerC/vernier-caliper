(function (global) {
  "use strict";

  const PROFILES = {
    "0.1": {
      key: "0.1",
      value: 0.1,
      divisions: 10,
      vernierLength: 9,
      decimals: 1,
      label: "10 分度",
      description: "10 格 / 9 mm",
      mainLabelStep: 5,
      vernierLabelStep: 5
    },
    "0.05": {
      key: "0.05",
      value: 0.05,
      divisions: 20,
      vernierLength: 19,
      decimals: 2,
      label: "20 分度",
      description: "20 格 / 19 mm",
      mainLabelStep: 5,
      vernierLabelStep: 5
    },
    "0.02": {
      key: "0.02",
      value: 0.02,
      divisions: 50,
      vernierLength: 49,
      decimals: 2,
      label: "50 分度",
      description: "50 格 / 49 mm",
      mainLabelStep: 10,
      vernierLabelStep: 10
    }
  };

  const SHEET = {
    width: 1240,
    height: 1754,
    marginX: 56,
    contentWidth: 1128,
    headerLineY: 76,
    rowsTop: 100,
    rowHeight: 160,
    columns: [56, 640],
    cellWidth: 544,
    plotLeft: 22,
    plotWidth: 504,
    item: {
      indexY: 16,
      mainLabelY: 38,
      mainLineY: 52,
      tickBottomY: 80,
      vernierLineY: 108,
      vernierLabelY: 126,
      readingY: 151
    }
  };

  const PAGE_CAPACITY = 20;

  function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function makeQuestion(profile, main, k) {
    const fraction = Number((k * profile.value).toFixed(profile.decimals + 1));
    const reading = Number((main + fraction).toFixed(profile.decimals + 1));
    const valueText = reading.toFixed(profile.decimals);

    return {
      main,
      k,
      fraction,
      reading,
      valueText,
      resolution: profile.key,
      profile
    };
  }

  function generateQuestions(resolution, count) {
    const profile = PROFILES[resolution] || PROFILES["0.02"];
    const wanted = Math.max(1, Math.min(60, Number(count) || 1));
    const questions = [];
    const seen = new Set();
    const mainUse = new Map();
    const maxPerMain = wanted <= 20 ? 2 : wanted <= 40 ? 3 : 4;
    let attempts = 0;

    while (questions.length < wanted && attempts < wanted * 180) {
      attempts += 1;
      const main = randomInt(0, 95);
      const k = randomInt(0, profile.divisions - 1);
      const key = `${main}:${k}`;
      const used = mainUse.get(main) || 0;

      if (seen.has(key) || used >= maxPerMain) continue;

      seen.add(key);
      mainUse.set(main, used + 1);
      questions.push(makeQuestion(profile, main, k));
    }

    for (let main = 0; main <= 95 && questions.length < wanted; main += 1) {
      for (let k = 0; k < profile.divisions && questions.length < wanted; k += 1) {
        const key = `${main}:${k}`;
        if (!seen.has(key)) {
          seen.add(key);
          questions.push(makeQuestion(profile, main, k));
        }
      }
    }

    return shuffle(questions);
  }

  function scaleNumberStep(profile) {
    return profile.mainLabelStep;
  }

  function renderItem(question, displayIndex, x, y, answers) {
    const profile = question.profile;
    const start = Math.max(0, question.main - 3);
    const span = profile.vernierLength + 8;
    const ppm = SHEET.plotWidth / span;
    const x0 = SHEET.plotLeft;
    const x1 = SHEET.plotLeft + SHEET.plotWidth;
    const sx = (mm) => x0 + (mm - start) * ppm;
    const zeroX = sx(question.main + question.fraction);
    const vernierEndX = zeroX + profile.vernierLength * ppm;

    const mainTicks = [];
    const mainLabels = [];
    const mainStart = Math.max(0, Math.ceil(start));
    const mainEnd = Math.floor(start + span);

    for (let mm = mainStart; mm <= mainEnd; mm += 1) {
      const px = sx(mm);
      if (px < x0 - 1 || px > x1 + 1) continue;
      const isMajor = mm % 5 === 0;
      const strokeWidth = isMajor ? 1.05 : 0.72;
      mainTicks.push(
        `<line x1="${px.toFixed(2)}" y1="${SHEET.item.mainLineY}" x2="${px.toFixed(2)}" y2="${SHEET.item.tickBottomY}" stroke="#1d201b" stroke-width="${strokeWidth}" stroke-linecap="square"/>`
      );

      if (mm % scaleNumberStep(profile) === 0 && px > 8 && px < 537) {
        mainLabels.push(
          `<text x="${px.toFixed(2)}" y="${SHEET.item.mainLabelY}" text-anchor="middle" class="scale-number">${mm}</text>`
        );
      }
    }

    const vernierTicks = [];
    const vernierLabels = [];
    const spacingPx = (profile.vernierLength / profile.divisions) * ppm;
    const labelStep = profile.vernierLabelStep;

    for (let i = 0; i <= profile.divisions; i += 1) {
      const px = zeroX + i * spacingPx;
      const isMajor = i === 0 || i === profile.divisions || i % labelStep === 0;
      const strokeWidth = isMajor ? 1.05 : 0.72;
      vernierTicks.push(
        `<line x1="${px.toFixed(2)}" y1="${SHEET.item.tickBottomY}" x2="${px.toFixed(2)}" y2="${SHEET.item.vernierLineY}" stroke="#1d201b" stroke-width="${strokeWidth}" stroke-linecap="square"/>`
      );

      if (isMajor) {
        vernierLabels.push(
          `<text x="${px.toFixed(2)}" y="${SHEET.item.vernierLabelY}" text-anchor="middle" class="vernier-number">${i}</text>`
        );
      }
    }

    const readingText = answers
      ? `<text x="52" y="${SHEET.item.readingY + 1}" class="reading-value">${escapeXml(question.valueText)}</text>
         <text x="${(58 + question.valueText.length * 7.9).toFixed(1)}" y="${SHEET.item.readingY + 1}" class="reading-unit">mm</text>`
      : `<line x1="50" y1="${SHEET.item.readingY + 1}" x2="235" y2="${SHEET.item.readingY + 1}" stroke="#8c8d82" stroke-width="0.8"/>`;

    return `<g transform="translate(${x} ${y})">
      <text x="0" y="${SHEET.item.indexY}" class="item-index">${pad2(displayIndex)}</text>
      <line x1="${x0}" y1="${SHEET.item.mainLineY}" x2="${x1}" y2="${SHEET.item.mainLineY}" stroke="#1d201b" stroke-width="1" stroke-linecap="square"/>
      ${mainTicks.join("")}
      ${mainLabels.join("")}
      <line x1="${zeroX.toFixed(2)}" y1="${SHEET.item.vernierLineY}" x2="${vernierEndX.toFixed(2)}" y2="${SHEET.item.vernierLineY}" stroke="#1d201b" stroke-width="1" stroke-linecap="square"/>
      ${vernierTicks.join("")}
      ${vernierLabels.join("")}
      <text x="22" y="${SHEET.item.readingY}" class="reading-label">读数</text>
      ${readingText}
      ${answers ? "" : '<text x="242" y="' + (SHEET.item.readingY + 1) + '" class="reading-unit">mm</text>'}
    </g>`;
  }

  function renderSheetSVG(questions, startNumber, pageIndex, totalPages, profile, answers) {
    const answerNote = answers ? " · 答案版" : "";
    const pageText = `第 ${pageIndex + 1} / ${totalPages} 页 · ${questions.length} 题${answerNote}`;
    const items = questions
      .map((question, index) => {
        const row = Math.floor(index / 2);
        const column = index % 2;
        const x = SHEET.columns[column];
        const y = SHEET.rowsTop + row * SHEET.rowHeight;
        return renderItem(question, startNumber + index, x, y, answers);
      })
      .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.width} ${SHEET.height}" role="img" aria-label="第 ${pageIndex + 1} 页 A4 游标卡尺读数简笔画，共 ${questions.length} 题">
      <style>
        .sheet-title { font-family: "Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif; font-size: 23px; font-weight: 700; fill: #1b1d19; letter-spacing: 0.7px; }
        .sheet-sub { font-family: "Bahnschrift", "DIN Alternate", "Consolas", monospace; font-size: 7.5px; font-weight: 500; fill: #8b8c80; letter-spacing: 1.5px; }
        .sheet-meta { font-family: "Bahnschrift", "DIN Alternate", "Consolas", monospace; font-size: 8.5px; font-weight: 500; fill: #55584f; letter-spacing: 0.35px; }
        .sheet-foot { font-family: "Bahnschrift", "DIN Alternate", "Consolas", monospace; font-size: 7px; fill: #a0a196; letter-spacing: 0.8px; }
        .item-index { font-family: "Bahnschrift", "DIN Alternate", "Consolas", monospace; font-size: 9px; font-weight: 500; fill: #929388; letter-spacing: 0.5px; }
        .scale-number { font-family: "Bahnschrift", "DIN Alternate", "Consolas", monospace; font-size: 12.5px; font-weight: 500; fill: #292c26; letter-spacing: -0.1px; }
        .vernier-number { font-family: "Bahnschrift", "DIN Alternate", "Consolas", monospace; font-size: 10.5px; font-weight: 500; fill: #3f423a; letter-spacing: -0.1px; }
        .reading-label { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; font-size: 9px; font-weight: 500; fill: #65685e; letter-spacing: 1px; }
        .reading-value { font-family: "Bahnschrift", "DIN Alternate", "Consolas", monospace; font-size: 13px; font-weight: 600; fill: #1d201b; letter-spacing: 0.2px; }
        .reading-unit { font-family: "Bahnschrift", "DIN Alternate", "Consolas", monospace; font-size: 9px; font-weight: 500; fill: #74766b; }
        text { -webkit-font-smoothing: antialiased; }
      </style>

      <rect width="${SHEET.width}" height="${SHEET.height}" fill="#ffffff"/>

      <g>
        <text x="56" y="39" class="sheet-title">游标卡尺读数练习</text>
        <text x="56" y="58" class="sheet-sub">VERNIER CALIPER / SIMPLE LINE SKETCH</text>
        <text x="1184" y="34" text-anchor="end" class="sheet-meta">分度值 ${profile.value} mm · ${profile.label} · ${profile.description}</text>
        <text x="1184" y="54" text-anchor="end" class="sheet-meta">${pageText}</text>
        <line x1="56" y1="${SHEET.headerLineY}" x2="1184" y2="${SHEET.headerLineY}" stroke="#c8c7bd" stroke-width="0.9"/>
      </g>

      ${items}

      <g>
        <line x1="56" y1="1723" x2="1184" y2="1723" stroke="#d4d2c8" stroke-width="0.8"/>
        <text x="56" y="1741" class="sheet-foot">刻度之间 / A4 · 20 题 / 页 · 白底线稿</text>
        <text x="1184" y="1741" text-anchor="end" class="sheet-foot">PAGE ${pad2(pageIndex + 1)} / ${pad2(totalPages)}</text>
      </g>
    </svg>`;
  }

  global.Caliper = {
    PROFILES,
    SHEET,
    PAGE_CAPACITY,
    generateQuestions,
    renderSheetSVG,
    pad2
  };
})(window);