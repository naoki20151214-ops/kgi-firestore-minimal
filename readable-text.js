const observers = new WeakMap();

const isOverflowing = (element) => {
  const styles = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const maxLines = Number.parseInt(styles.getPropertyValue("--collapsed-lines"), 10) || 3;

  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return element.scrollHeight > element.clientHeight + 1;
  }

  const threshold = lineHeight * maxLines + 1;
  return element.scrollHeight > threshold;
};

const applyParagraphBreaks = (text) => {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/。\s*/g, "。\n")
    .replace(/\s*(?=\d+\))/g, " ")
    .replace(/(^|[^\n])\s*(\d+\))/g, (match, prefix, marker) => `${prefix}\n${marker}`)
    .replace(/(^|[^\n])\s*・\s*/g, (match, prefix) => `${prefix}\n・ `)
    .replace(/\s*(?=(条件|成功条件|前提|達成条件)\s*[：:])/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return normalized.trim();
};

export const enhanceReadableText = (element, options = {}) => {
  if (!element) {
    return;
  }

  const lines = Number.isFinite(Number(options.lines)) ? Math.max(2, Math.round(Number(options.lines))) : 3;
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
