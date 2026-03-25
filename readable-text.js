const observers = new WeakMap();

const toFiniteLineCount = (value, fallback = 3) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(2, Math.round(numeric));
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

const isOverflowing = (element) => {
  const maxLines = toFiniteLineCount(window.getComputedStyle(element).getPropertyValue("--collapsed-lines"), 3);
  const renderedLines = estimateRenderedLineCount(element);

  if (renderedLines > 0) {
    return renderedLines > maxLines;
  }

  return element.scrollHeight > element.clientHeight + 1;
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

export const enhanceReadableText = (element, options = {}) => {
  if (!element) {
    return;
  }

  const lines = toFiniteLineCount(options.lines, 3);
  const moreLabel = options.moreLabel ?? "続きを読む";
  const lessLabel = options.lessLabel ?? "閉じる";

  const sourceText = (element.textContent || "").trim();
  element.textContent = applyParagraphBreaks(sourceText);
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
    element.classList.add("is-collapsed");
    toggleButton.textContent = moreLabel;
    toggleButton.setAttribute("aria-expanded", "false");
  };

  const expand = () => {
    element.classList.remove("is-collapsed");
    toggleButton.textContent = lessLabel;
    toggleButton.setAttribute("aria-expanded", "true");
  };

  const update = () => {
    element.classList.remove("is-collapsed");

    if (!element.isConnected) {
      toggleButton.hidden = true;
      return;
    }

    const canCollapse = isOverflowing(element);
    element.dataset.collapsible = canCollapse ? "true" : "false";
    toggleButton.hidden = !canCollapse;

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
  window.requestAnimationFrame(update);

  const existing = observers.get(element);
  if (existing) {
    window.removeEventListener("resize", existing);
  }

  const resizeHandler = () => {
    window.requestAnimationFrame(update);
  };
  observers.set(element, resizeHandler);
  window.addEventListener("resize", resizeHandler);
};
