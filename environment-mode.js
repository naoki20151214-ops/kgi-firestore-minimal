const STORAGE_KEY = "kgi-environment-mode";

export const ENV_MODE = {
  PROD: "prod",
  TEST: "test"
};

const COLLECTION_MAP = {
  kgis: {
    [ENV_MODE.PROD]: "kgis",
    [ENV_MODE.TEST]: "test_kgis"
  },
  kpis: {
    [ENV_MODE.PROD]: "kpis",
    [ENV_MODE.TEST]: "test_kpis"
  },
  tasks: {
    [ENV_MODE.PROD]: "tasks",
    [ENV_MODE.TEST]: "test_tasks"
  },
  kgiCreationSessions: {
    [ENV_MODE.PROD]: "kgiCreationSessions",
    [ENV_MODE.TEST]: "test_kgiCreationSessions"
  }
};

const normalizeMode = (value) => (value === ENV_MODE.TEST ? ENV_MODE.TEST : ENV_MODE.PROD);

export const getCurrentMode = () => {
  try {
    return normalizeMode(window.localStorage.getItem(STORAGE_KEY));
  } catch (_error) {
    return ENV_MODE.PROD;
  }
};

export const setCurrentMode = (mode) => {
  const nextMode = normalizeMode(mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  } catch (_error) {
    // ignore localStorage errors and continue with in-memory mode propagation
  }
  window.dispatchEvent(new CustomEvent("kgi:environment-mode-changed", { detail: { mode: nextMode } }));
  return nextMode;
};

export const getCollectionName = (baseCollectionName, mode = getCurrentMode()) => {
  const mapping = COLLECTION_MAP[baseCollectionName];
  if (!mapping) {
    throw new Error(`Unsupported collection mapping: ${baseCollectionName}`);
  }
  return mapping[normalizeMode(mode)] ?? mapping[ENV_MODE.PROD];
};

const getModeLabel = (mode) => (mode === ENV_MODE.TEST ? "テストモード" : "本番モード");

const renderModeUi = (wrapper, mode) => {
  const isTest = mode === ENV_MODE.TEST;
  wrapper.classList.toggle("env-mode-test", isTest);

  const status = wrapper.querySelector("[data-env-role='status']");
  const desc = wrapper.querySelector("[data-env-role='description']");
  const prodButton = wrapper.querySelector("[data-env-role='prod']");
  const testButton = wrapper.querySelector("[data-env-role='test']");

  if (status) {
    status.textContent = `現在: ${getModeLabel(mode)}`;
  }
  if (desc) {
    desc.textContent = isTest
      ? "テストモードです。本番には影響しません。"
      : "本番モードです。実データを表示・更新します。";
  }
  if (prodButton) {
    prodButton.classList.toggle("active", !isTest);
    prodButton.setAttribute("aria-pressed", String(!isTest));
  }
  if (testButton) {
    testButton.classList.toggle("active", isTest);
    testButton.setAttribute("aria-pressed", String(isTest));
  }

  document.body.classList.toggle("is-test-mode", isTest);
};

export const initEnvironmentModeUi = () => {
  if (typeof document === "undefined") {
    return;
  }

  let wrapper = document.getElementById("environmentModeSwitcher");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "environmentModeSwitcher";
    wrapper.className = "environment-mode-switcher";
    wrapper.innerHTML = `
      <p class="environment-mode-title">データ環境の切替</p>
      <p class="environment-mode-status" data-env-role="status"></p>
      <p class="environment-mode-description" data-env-role="description"></p>
      <div class="environment-mode-actions">
        <button type="button" data-env-role="prod">本番モード</button>
        <button type="button" data-env-role="test">テストモード</button>
      </div>
    `;
    document.body.prepend(wrapper);
  }

  const handleClick = (mode) => {
    const previousMode = getCurrentMode();
    const nextMode = setCurrentMode(mode);
    renderModeUi(wrapper, nextMode);
    if (previousMode !== nextMode) {
      window.location.reload();
    }
  };

  wrapper.querySelector("[data-env-role='prod']")?.addEventListener("click", () => {
    handleClick(ENV_MODE.PROD);
  });
  wrapper.querySelector("[data-env-role='test']")?.addEventListener("click", () => {
    handleClick(ENV_MODE.TEST);
  });

  renderModeUi(wrapper, getCurrentMode());
};
