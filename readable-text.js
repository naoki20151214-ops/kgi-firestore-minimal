const observers = new WeakMap();

const toFiniteLineCount = (value, fallback = 3) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(2, Math.round(numeric));
};

const toLineHeightPx = (styles) => {
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) {
    return lineHeight;
  }

  const fontSize = Number.parseFloat(styles.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) {
    return fontSize * 1.5;
  }

  return 0;
};

const estimateRenderedLineCount = (element) => {
  if (!element || !element.isConnected) {
    return 0;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
  range.detach?.();

  if (rects.length > 0) {
    return rects.length;
  }

  const styles = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) {
    return Math.ceil(element.scrollHeight / lineHeight);
  }

  return 0;
};

const measureExpandedHeight = (element) => {
  if (!element || !element.isConnected) {
    return { height: 0, lineHeight: 0 };
  }

  const styles = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const width = Math.max(0, rect.width || element.clientWidth);
  if (width <= 0) {
    return { height: 0, lineHeight: toLineHeightPx(styles) };
  }

  const clone = element.cloneNode(true);
  clone.classList.remove("is-collapsed");
  clone.setAttribute("aria-hidden", "true");
  clone.style.position = "absolute";
  clone.style.visibility = "hidden";
  clone.style.pointerEvents = "none";
  clone.style.left = "-9999px";
  clone.style.top = "0";
  clone.style.width = `${width}px`;
  clone.style.maxWidth = `${width}px`;
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.display = "block";
  clone.style.webkitLineClamp = "unset";
  clone.style.webkitBoxOrient = "unset";

  document.body.appendChild(clone);
  const height = clone.scrollHeight;
  clone.remove();

  return { height, lineHeight: toLineHeightPx(styles) };
};

const isOverflowing = (element, options = {}) => {
  const maxLines = toFiniteLineCount(window.getComputedStyle(element).getPropertyValue("--collapsed-lines"), 3);
  const { fallbackCharacterThreshold = 100 } = options;
  const expanded = measureExpandedHeight(element);
  const collapsedHeight = expanded.lineHeight > 0 ? expanded.lineHeight * maxLines : 0;

  if (expanded.height > 0 && collapsedHeight > 0) {
    return expanded.height > collapsedHeight + 1;
  }

  const renderedLines = estimateRenderedLineCount(element);

  if (renderedLines > 0) {
    return renderedLines > maxLines;
  }

  if (element.scrollHeight > element.clientHeight + 1) {
    return true;
  }

  const textLength = (element.textContent || "").trim().length;
  return textLength >= Math.max(80, Number(fallbackCharacterThreshold) || 0);
};

const shouldRetryMeasurement = (element) => {
  if (!element || !element.isConnected) {
    return true;
  }

  const rect = element.getBoundingClientRect();
  return rect.width <= 0 || rect.height <= 0;
};

const applyParagraphBreaks = (text) => {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/。\s*/g, "。\n")
    .replace(/\s*(?=\d+\))/g, " ")
    .replace(/(^|[^\n])\s*(\d+\))/g, (match, prefix, marker) => `${prefix}\n${marker}`)
    .replace(/(^|[^\n])\s*[-・●◦]\s*/g, (match, prefix) => `${prefix}\n・ `)
    .replace(/\s*(?=(条件|成功条件|前提|達成条件|評価条件|判断基準)\s*[：:])/g, "\n")
    .replace(/\s*(?=(かつ|または|もしくは|および)\s*[^\n]{8,})/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return normalized.trim();
};

const SECTION_TITLES = [
  "やること",
  "実施内容",
  "タスク",
  "成功指標",
  "計測方法",
  "検証項目",
  "チェック項目"
];

const toBulletItem = (line) => line.replace(/^[-・●◦*]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
const SENTENCE_BOUNDARY_PATTERN = /(?<=[。！？!?])\s*/g;

const parseStructuredLines = (text) => {
  const normalized = applyParagraphBreaks(text);
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines;
};

const buildStructuredContent = (element, text) => {
  const lines = parseStructuredLines(text);
  if (!lines.length) {
    element.textContent = "";
    return;
  }

  element.textContent = "";
  const fragment = document.createDocumentFragment();
  let activeSection = null;

  const appendSection = (titleText) => {
    const section = document.createElement("section");
    section.className = "readable-section";

    const title = document.createElement("p");
    title.className = "readable-section-title";
    title.textContent = titleText;

    const list = document.createElement("ul");
    list.className = "readable-section-list";

    section.append(title, list);
    fragment.appendChild(section);
    activeSection = list;
  };

  lines.forEach((line) => {
    const headingMatch = line.match(/^([^:：]{2,20})\s*[：:]\s*(.*)$/);
    if (headingMatch) {
      const maybeTitle = headingMatch[1].trim();
      const body = headingMatch[2].trim();

      if (SECTION_TITLES.includes(maybeTitle)) {
        appendSection(maybeTitle);
        if (body) {
          const item = document.createElement("li");
          item.textContent = toBulletItem(body);
          activeSection?.appendChild(item);
        }
        return;
      }
    }

    const isBulletLine = /^[-・●◦*]\s+/.test(line) || /^\d+[.)]\s+/.test(line);

    if (isBulletLine) {
      if (!activeSection) {
        appendSection("やること");
      }
      const item = document.createElement("li");
      item.textContent = toBulletItem(line);
      activeSection?.appendChild(item);
      return;
    }

    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    fragment.appendChild(paragraph);
    activeSection = null;
  });

  element.appendChild(fragment);
};

const splitIntoSentences = (text) => {
  const normalized = applyParagraphBreaks(text);
  if (!normalized) {
    return [];
  }

  return normalized
    .split("\n")
    .flatMap((line) => line.split(SENTENCE_BOUNDARY_PATTERN))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

const buildSentenceContent = (element, text) => {
  const sentences = splitIntoSentences(text);
  if (!sentences.length) {
    element.textContent = "";
    return;
  }

  element.textContent = "";
  const fragment = document.createDocumentFragment();

  sentences.forEach((sentence) => {
    const paragraph = document.createElement("p");
    paragraph.className = "readable-sentence";
    paragraph.textContent = sentence;
    fragment.appendChild(paragraph);
  });

  element.appendChild(fragment);
};

export const enhanceReadableText = (element, options = {}) => {
  if (!element) {
    return;
  }

  const lines = toFiniteLineCount(options.lines, 3);
  const fallbackCharacterThreshold = Number.isFinite(Number(options.fallbackCharacterThreshold))
    ? Number(options.fallbackCharacterThreshold)
    : 100;
  const moreLabel = options.moreLabel ?? "続きを読む";
  const lessLabel = options.lessLabel ?? "閉じる";
  const formatAsBulletSections = options.formatAsBulletSections === true;
  const formatAsSentenceBlocks = options.formatAsSentenceBlocks === true;
  const maxRecheckCount = Number.isFinite(Number(options.maxRecheckCount))
    ? Math.max(0, Math.round(Number(options.maxRecheckCount)))
    : 3;
  const recheckDelayMs = Number.isFinite(Number(options.recheckDelayMs))
    ? Math.max(0, Math.round(Number(options.recheckDelayMs)))
    : 120;

  const sourceText = (element.textContent || "").trim();
  if (formatAsBulletSections) {
    buildStructuredContent(element, sourceText);
    element.classList.add("readable-text--structured");
    element.classList.remove("readable-text--sentence-blocks");
  } else if (formatAsSentenceBlocks) {
    buildSentenceContent(element, sourceText);
    element.classList.remove("readable-text--structured");
    element.classList.add("readable-text--sentence-blocks");
  } else {
    element.textContent = applyParagraphBreaks(sourceText);
    element.classList.remove("readable-text--structured");
    element.classList.remove("readable-text--sentence-blocks");
  }
  element.classList.add("readable-text");
  element.style.setProperty("--collapsed-lines", String(lines));
  element.dataset.collapsible = "false";

  let toggleButton = element.nextElementSibling;
  if (!toggleButton || !toggleButton.classList.contains("readable-toggle")) {
    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "readable-toggle";
    toggleButton.hidden = true;
    element.insertAdjacentElement("afterend", toggleButton);
  }

  const collapse = () => {
    if (toggleButton.hidden || element.dataset.collapsible !== "true") {
      element.classList.remove("is-collapsed");
      return;
    }
    element.classList.add("is-collapsed");
    toggleButton.textContent = moreLabel;
    toggleButton.setAttribute("aria-expanded", "false");
  };

  const expand = () => {
    element.classList.remove("is-collapsed");
    toggleButton.textContent = lessLabel;
    toggleButton.setAttribute("aria-expanded", "true");
  };

  const update = (attempt = 0) => {
    element.classList.remove("is-collapsed");

    if (!element.isConnected) {
      toggleButton.hidden = true;
      return;
    }

    if (shouldRetryMeasurement(element) && attempt < maxRecheckCount) {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => update(attempt + 1));
      }, recheckDelayMs);
      return;
    }

    const canCollapse = isOverflowing(element, { fallbackCharacterThreshold });
    element.dataset.collapsible = canCollapse ? "true" : "false";
    toggleButton.hidden = !canCollapse;
    element.dataset.toggleGenerated = "true";
    element.dataset.toggleHidden = String(toggleButton.hidden);
    element.dataset.measuredWhileCollapsed = String(element.classList.contains("is-collapsed"));

    if (!canCollapse) {
      toggleButton.textContent = "";
      toggleButton.setAttribute("aria-expanded", "true");
      return;
    }

    collapse();
  };

  toggleButton.onclick = () => {
    if (element.classList.contains("is-collapsed")) {
      expand();
      return;
    }
    collapse();
  };

  update();
  window.requestAnimationFrame(() => update(1));

  const existing = observers.get(element);
  if (existing) {
    window.removeEventListener("resize", existing);
  }

  const resizeHandler = () => {
    window.requestAnimationFrame(() => update(0));
  };
  observers.set(element, resizeHandler);
  window.addEventListener("resize", resizeHandler);
};
