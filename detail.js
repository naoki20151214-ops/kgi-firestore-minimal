import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const kgiMeta = document.getElementById("kgiMeta");
const kgiDeadlineForm = document.getElementById("kgiDeadlineForm");
const kgiDeadlineEditInput = document.getElementById("kgiDeadlineEdit");
const saveKgiDeadlineButton = document.getElementById("saveKgiDeadlineButton");
const kgiDeadlineFormStatus = document.getElementById("kgiDeadlineFormStatus");
const roadmapContainer = document.getElementById("roadmapContainer");
const roadmapStatusText = document.getElementById("roadmapStatusText");
const currentLocationContainer = document.getElementById("currentLocationContainer");
const currentLocationSection = document.getElementById("currentLocationSection");
const postRoadmapKpiSections = document.getElementById("postRoadmapKpiSections");
const generateRoadmapKpisButton = document.getElementById("generateRoadmapKpisButton");
const roadmapKpiIntro = document.getElementById("roadmapKpiIntro");
const roadmapKpiLoadingText = document.getElementById("roadmapKpiLoadingText");
const roadmapKpiErrorText = document.getElementById("roadmapKpiErrorText");
const kpiStatusText = document.getElementById("kpiStatusText");
const mindmapSection = document.getElementById("mindmapSection");
const mindmapStatusText = document.getElementById("mindmapStatusText");
const mindmapTree = document.getElementById("mindmapTree");
const kpiSummarySection = document.getElementById("kpiSummarySection");
const kpiSummaryStats = document.getElementById("kpiSummaryStats");
const kpiManagementPanel = document.getElementById("kpiManagementPanel");
const openKpiManagementButton = document.getElementById("openKpiManagementButton");
const openMindmapPageButton = document.getElementById("openMindmapPageButton");
const phaseTitle = document.getElementById("phaseTitle");
const phasePeriodBadge = document.getElementById("phasePeriodBadge");
const phaseDescription = document.getElementById("phaseDescription");
const phaseMetaText = document.getElementById("phaseMetaText");
const pageTitle = document.getElementById("pageTitle");
const pageLead = document.getElementById("pageLead");
const backToDetailLink = document.getElementById("backToDetailLink");
const nextActionContainer = document.getElementById("nextActionContainer");
const nextActionSection = document.getElementById("nextActionSection");
const phaseRecommendedKpiContainer = document.getElementById("phaseRecommendedKpiContainer");
const routineTaskSection = document.getElementById("routineTaskSection");
const routineTaskStatusText = document.getElementById("routineTaskStatusText");
const routineTaskForm = document.getElementById("routineTaskForm");
const routineTaskList = document.getElementById("routineTaskList");
const generateRoutineSuggestionsButton = document.getElementById("generateRoutineSuggestionsButton");
const routineSuggestionList = document.getElementById("routineSuggestionList");
const addSelectedRoutineSuggestionsButton = document.getElementById("addSelectedRoutineSuggestionsButton");
const kpiTable = document.getElementById("kpiTable");
const kpiTableBody = document.getElementById("kpiTableBody");
const kpiNameInput = document.getElementById("kpiName");
const kpiDescriptionInput = document.getElementById("kpiDescription");
const kpiTypeInput = document.getElementById("kpiType");
const kpiCategoryInput = document.getElementById("kpiCategory");
const kpiDeadlineInput = document.getElementById("kpiDeadline");
const addKpiButton = document.getElementById("addKpiButton");
const toggleKpiFormButton = document.getElementById("toggleKpiFormButton");
const kpiAddFormPanel = document.getElementById("kpiAddFormPanel");
const showArchivedToggle = document.getElementById("showArchivedToggle");
const archiveKgiButton = document.getElementById("archiveKgiButton");
const archiveKgiStatus = document.getElementById("archiveKgiStatus");
const archiveKgiDialog = document.getElementById("archiveKgiDialog");
const confirmArchiveKgiButton = document.getElementById("confirmArchiveKgiButton");
const archiveKgiDialogForm = archiveKgiDialog?.querySelector("form");
const archiveDebugTargetKgiId = document.getElementById("archiveDebugTargetKgiId");
const archiveDebugTargetCollectionPath = document.getElementById("archiveDebugTargetCollectionPath");
const archiveDebugWriteStarted = document.getElementById("archiveDebugWriteStarted");
const archiveDebugWriteSucceeded = document.getElementById("archiveDebugWriteSucceeded");
const archiveDebugVerifySucceeded = document.getElementById("archiveDebugVerifySucceeded");
const archiveDebugLastErrorMessage = document.getElementById("archiveDebugLastErrorMessage");
let overallProgressValue = document.getElementById("overallProgressValue");
let overallProgressFill = document.getElementById("overallProgressFill");
let overallProgressCaption = document.getElementById("overallProgressCaption");
const generateAiKpisButton = document.getElementById("generateAiKpisButton");
const aiLoadingText = document.getElementById("aiLoadingText");
const aiErrorText = document.getElementById("aiErrorText");
const aiSuggestionsContainer = document.getElementById("aiSuggestions");
const resultKpiSuggestions = document.getElementById("resultKpiSuggestions");
const actionKpiSuggestions = document.getElementById("actionKpiSuggestions");
const subKgiSuggestions = document.getElementById("subKgiSuggestions");
const debugPanel = document.getElementById("debugPanel");
const debugPanelContent = document.getElementById("debugPanelContent");

const debugMode = false;
let latestDebugState = [];
let latestDebugSummary = [];

const renderDebugPanelText = () => {
  if (!debugPanelContent) {
    return;
  }

  const summaryLines = latestDebugSummary.length > 0 ? latestDebugSummary : ["状態情報なし"];

  if (latestDebugState.length === 0) {
    debugPanelContent.textContent = [...summaryLines, "", "KPI / Task データなし"].join("\n");
    return;
  }

  const lines = latestDebugState.flatMap((kpiItem, index) => {
    const kpiHeader = `KPI ${index + 1}`;
    const kpiLines = [
      kpiHeader,
      `  id: ${kpiItem.id}`,
      `  currentValue: ${kpiItem.currentValue}`,
      `  related task count: ${kpiItem.relatedTaskCount}`,
      `  summed contributedValue: ${kpiItem.summedContributedValue}`
    ];

    const taskLines = (kpiItem.tasks ?? []).map((task, taskIndex) => [
      `    Task ${taskIndex + 1}`,
      `      id: ${task.id}`,
      `      title: ${task.title}`,
      `      type: ${task.type}`,
      `      isCompleted: ${task.isCompleted}`,
      `      progressValue: ${task.progressValue}`,
      `      contributedValue: ${task.contributedValue}`
    ].join("\n"));

    return [...kpiLines, ...taskLines, ""];
  });

  debugPanelContent.textContent = [...summaryLines, "", ...lines].join("\n").trim();
};

const updateDebugPanel = (kpiDebugItems = latestDebugState) => {
  latestDebugState = kpiDebugItems;

  if (!debugPanel || !debugPanelContent) {
    return;
  }

  if (!debugMode) {
    debugPanel.hidden = true;
    return;
  }

  debugPanel.hidden = false;
  renderDebugPanelText();
};

const setDebugSummary = (...items) => {
  latestDebugSummary = items.filter((item) => typeof item === "string" && item.trim().length > 0);
  updateDebugPanel(latestDebugState);
};

const appendDebugSummary = (...items) => {
  latestDebugSummary = [
    ...latestDebugSummary,
    ...items.filter((item) => typeof item === "string" && item.trim().length > 0)
  ];
  updateDebugPanel(latestDebugState);
};

const reportDebugError = (label, error) => {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error ?? "Unknown error");

  appendDebugSummary(`JS例外: ${label}`, message);
};

updateDebugPanel([]);
setDebugSummary("detail.html 初期化中");

window.addEventListener("error", (event) => {
  reportDebugError(event.filename
    ? `${event.filename}:${event.lineno ?? 0}`
    : "window.error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  reportDebugError("unhandledrejection", event.reason);
});

let db;
let kgiId = "";
const pageMode = document.body?.dataset.page === "phase" ? "phase" : "detail";
const isPhasePage = pageMode === "phase";
let selectedPhaseId = "";
let currentKgiData = null;
let currentRoadmapPhases = [];
let nextActionLoading = false;
let nextActionError = "";
let nextActionStepLoading = false;
let nextActionStepError = "";
let nextActionSteps = [];
let currentNextAction = null;
let latestNextActionStepRequestKey = "";

const emptyAiSuggestions = () => ({
  resultKpis: [],
  actionKpis: [],
  subKgiCandidates: []
});

let aiLoading = false;
let roadmapKpiLoading = false;
let roadmapKpiFeedbackTone = "info";
let roadmapPhaseOpenState = {};
let kpiDetailOpenState = {};
let taskFormOpenState = {};
let taskSectionOpenState = {};
let reflectionSectionOpenState = {};
let taskAiPanelOpenState = {};
let aiSavingKey = "";
let aiError = "";
let aiHasGenerated = false;
let aiSuggestions = emptyAiSuggestions();
let existingKpiKeys = new Set();
let subKgiSavingIds = new Set();
let subKgiSavedIds = new Set();
let subKgiSaveError = "";
let taskAiLoadingByKpiId = {};
let taskAiErrorByKpiId = {};
let taskAiSuggestionsByKpiId = {};
let taskAiSavedByKpiId = {};
let taskAiSavingByKpiId = {};
let latestRenderedKpis = [];
let initialDetailEntryState = null;
let taskCheckUiState = {};
let autoTaskGenerationInFlight = false;
let autoTaskGenerationPromise = null;
let showArchivedKpis = false;
let isPhaseDescriptionExpanded = false;
let latestRoutineTasks = [];
let routineSuggestionSelections = new Set();
let routineSuggestionsVisible = false;
let routineSuggestionTemplates = [];
let routineSuggestionLoading = false;
let archiveKgiInFlight = false;
let archiveSuccessMessageTimer = null;
let realtimeUnsubscribers = [];
let latestKpiDocs = [];
let latestTaskDocsByKpiId = new Map();
let latestKgiSnapshotData = null;
let scheduledSnapshotRefresh = null;
let mindmapOpenState = {};

const TASK_KIND = {
  KPI: "kpi_task",
  ROUTINE: "routine_task"
};

const ROUTINE_TASK_STATUS = {
  ACTIVE: "active",
  DONE: "done"
};

const ROUTINE_TASK_CADENCE_LABELS = {
  daily: "daily",
  weekly: "weekly",
  ad_hoc: "ad_hoc"
};

const DEFAULT_ROUTINE_TASK_TEMPLATES = [
  { id: "daily-top-page-check", title: "毎朝トップページを確認する", description: "", cadence: "daily" },
  { id: "daily-progress-log", title: "進捗を1行記録する", description: "", cadence: "daily" },
  { id: "daily-blocker-note", title: "詰まりをメモする", description: "", cadence: "daily" },
  { id: "weekly-review", title: "週1で全体を見直す", description: "", cadence: "weekly" }
];

const splitPhaseDescriptionIntoPoints = (description) => String(description ?? "")
  .replace(/\r\n?/g, "\n")
  .split(/(?:\n+|(?<=[。！？]))/)
  .map((item) => item.trim())
  .filter(Boolean);

const buildPhaseDescriptionSummaryPoints = (description, maxItems = 3) => {
  const points = splitPhaseDescriptionIntoPoints(description);

  if (points.length > 0) {
    return points.slice(0, maxItems);
  }

  const compact = String(description ?? "").trim();
  return compact ? [compact] : [];
};

const renderPhaseDescription = (description) => {
  if (!phaseDescription) {
    return;
  }

  const fullText = typeof description === "string" && description.trim()
    ? description.trim()
    : "このフェーズの説明はまだありません。";
  const summaryPoints = buildPhaseDescriptionSummaryPoints(fullText);
  const fullPoints = splitPhaseDescriptionIntoPoints(fullText);
  const shouldEnableToggle = fullPoints.length > summaryPoints.length || fullText.length > 80;
  const pointsToRender = isPhaseDescriptionExpanded || !shouldEnableToggle
    ? (fullPoints.length > 0 ? fullPoints : [fullText])
    : summaryPoints;
  const buttonLabel = isPhaseDescriptionExpanded ? "閉じる" : "続きを読む";

  phaseDescription.innerHTML = `
    <ul class="phase-description-list">
      ${pointsToRender.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
    </ul>
    ${shouldEnableToggle ? `<button id="phaseDescriptionToggle" class="button text phase-description-toggle" type="button" aria-expanded="${isPhaseDescriptionExpanded ? "true" : "false"}">${buttonLabel}</button>` : ""}
  `;

  const toggleButton = document.getElementById("phaseDescriptionToggle");
  if (!toggleButton) {
    return;
  }

  toggleButton.addEventListener("click", () => {
    isPhaseDescriptionExpanded = !isPhaseDescriptionExpanded;
    renderPhaseDescription(fullText);
  });
};

const buildRoadmapPhaseTitle = (title, index) => {
  const safeTitle = typeof title === "string" && title.trim() ? title.trim() : `フェーズ${index + 1}`;
  return safeTitle.startsWith(`フェーズ${index + 1}`) ? safeTitle : `フェーズ${index + 1} ${safeTitle}`;
};

const buildRoadmapPhaseName = (title, index) => {
  const fullTitle = buildRoadmapPhaseTitle(title, index);
  return fullTitle.replace(new RegExp(`^フェーズ${index + 1}\\s*`), "").trim() || fullTitle;
};

const formatListOrderLabel = (index) => String(index + 1).padStart(2, "0");

const buildPhaseFirstAction = (description) => {
  const firstPoint = splitPhaseDescriptionIntoPoints(description)[0] ?? "";
  const normalized = firstPoint
    .replace(/^[・\-\*\d\.\)\s]+/, "")
    .replace(/^(やること|ポイント|内容)[:：]\s*/, "")
    .trim();

  return normalized || "メモアプリを開いて、このフェーズでやることを1つ書く";
};

const renderRoadmapPhaseDescription = (description, options = {}) => {
  const points = splitPhaseDescriptionIntoPoints(description);
  const visiblePoints = points.slice(0, 2);
  const hiddenPoints = points.slice(2);
  const firstAction = buildPhaseFirstAction(description);
  const firstActionMarkup = `
    <div class="roadmap-phase-first-action${options.isEasy ? ' easy' : ''}">
      <span class="roadmap-phase-first-action-label">今やる1つ</span>
      <strong class="roadmap-phase-first-action-text">${escapeHtml(firstAction)}</strong>
    </div>
  `;

  if (points.length === 0) {
    return `<p class="hint">このフェーズの説明はまだありません。</p>${firstActionMarkup}`;
  }

  const visibleMarkup = `
    <ul class="roadmap-phase-points">
      ${visiblePoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
    </ul>
  `;

  if (hiddenPoints.length === 0) {
    return `${visibleMarkup}${firstActionMarkup}`;
  }

  return `
    ${visibleMarkup}
    <details class="roadmap-phase-details">
      <summary class="roadmap-phase-summary">続きを読む / 閉じる</summary>
      <ul class="roadmap-phase-points roadmap-phase-points-extra">
        ${hiddenPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
      </ul>
    </details>
    ${firstActionMarkup}
  `;
};

const getAiSuggestionStorageKey = () => kgiId ? `kgi-detail-ai-suggestions:${kgiId}` : "";
const getSubKgiSavedStorageKey = () => kgiId ? `kgi-detail-subkgi-saved:${kgiId}` : "";
const TASK_CHECK_RESULT_OPTIONS = [
  { value: "as_planned", label: "予定通りできた" },
  { value: "harder_than_expected", label: "思ったより難しかった" },
  { value: "needs_improvement", label: "やり方を変えたい" },
  { value: "could_not_do", label: "できなかった" }
];

const persistAiSuggestions = () => {
  const storageKey = getAiSuggestionStorageKey();

  if (!storageKey) {
    return;
  }

  try {
    if (!aiHasGenerated) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(aiSuggestions));
  } catch (error) {
    console.error("Failed to persist AI suggestions", error);
  }
};

const restoreAiSuggestions = () => {
  const storageKey = getAiSuggestionStorageKey();

  if (!storageKey) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    aiSuggestions = {
      resultKpis: Array.isArray(parsed?.resultKpis) ? parsed.resultKpis : [],
      actionKpis: Array.isArray(parsed?.actionKpis) ? parsed.actionKpis : [],
      subKgiCandidates: Array.isArray(parsed?.subKgiCandidates) ? parsed.subKgiCandidates : []
    };
    aiHasGenerated = true;
  } catch (error) {
    console.error("Failed to restore AI suggestions", error);
  }
};

const persistSubKgiSavedState = () => {
  const storageKey = getSubKgiSavedStorageKey();

  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(subKgiSavedIds)));
  } catch (error) {
    console.error("Failed to persist saved sub KGI state", error);
  }
};

const restoreSubKgiSavedState = () => {
  const storageKey = getSubKgiSavedStorageKey();

  if (!storageKey) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    subKgiSavedIds = new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : []);
  } catch (error) {
    console.error("Failed to restore saved sub KGI state", error);
    subKgiSavedIds = new Set();
  }
};

const buildSubKgiCandidateKey = (item) => JSON.stringify({
  title: displaySuggestionText(item?.title),
  description: displaySuggestionText(item?.description),
  kgiId
});

const buildSubKgiPayload = (item) => ({
  title: displaySuggestionText(item?.title) === "-" ? "" : displaySuggestionText(item?.title),
  description: displaySuggestionText(item?.description) === "-" ? "" : displaySuggestionText(item?.description)
});

const renderSubKgiSuggestionList = (items, container) => {
  if (!container) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<p class="hint">候補なし</p>';
    return;
  }

  const errorMarkup = subKgiSaveError
    ? `<p class="hint error">${subKgiSaveError}</p>`
    : "";

  const listMarkup = items.map((item) => {
    const title = displaySuggestionText(item?.title);
    const description = displaySuggestionText(item?.description);
    const payload = buildSubKgiPayload(item);
    const candidateKey = buildSubKgiCandidateKey(item);
    const isSaved = subKgiSavedIds.has(candidateKey);
    const isSaving = subKgiSavingIds.has(candidateKey);
    const buttonLabel = isSaved ? "追加済み" : isSaving ? "追加中..." : "＋追加";

    return `
      <li class="ai-suggestion-item">
        <div class="ai-suggestion-head">
          <strong>${title}</strong>
          <button
            class="button ai-add-button"
            type="button"
            data-sub-kgi='${JSON.stringify(payload).replace(/'/g, "&#39;")}'
            data-sub-kgi-id='${candidateKey.replace(/'/g, "&#39;")}'
            ${isSaved || isSaving ? "disabled" : ""}
          >${buttonLabel}</button>
        </div>
        <span class="ai-suggestion-meta">説明: ${description}</span>
      </li>
    `;
  }).join("");

  container.innerHTML = `${errorMarkup}<ul class="ai-suggestion-list">${listMarkup}</ul>`;
};

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const setKpiStatus = (message, isError = false) => {
  kpiStatusText.textContent = message;
  kpiStatusText.classList.toggle("error", isError);
};

const setRoutineTaskStatus = (message, isError = false) => {
  if (!routineTaskStatusText) {
    return;
  }

  routineTaskStatusText.hidden = false;
  routineTaskStatusText.textContent = message;
  routineTaskStatusText.classList.toggle("error", isError);
  routineTaskStatusText.classList.toggle("info", !isError);
};

const buildPhasePageUrl = (phaseId) => `./phase.html?id=${encodeURIComponent(kgiId)}${phaseId ? `&phaseId=${encodeURIComponent(phaseId)}` : ""}`;

const updatePhasePageLinks = () => {
  if (backToDetailLink instanceof HTMLAnchorElement) {
    backToDetailLink.href = `./detail.html?id=${encodeURIComponent(kgiId)}`;
  }

  if (openMindmapPageButton instanceof HTMLAnchorElement) {
    openMindmapPageButton.href = `./mindmap.html?id=${encodeURIComponent(kgiId)}`;
  }

  if (openKpiManagementButton instanceof HTMLAnchorElement) {
    openKpiManagementButton.href = buildPhasePageUrl(getDefaultPhaseId());
  }
};

const openKpiManagement = () => {
  if (openKpiManagementButton instanceof HTMLAnchorElement) {
    openKpiManagementButton.href = buildPhasePageUrl(getDefaultPhaseId());
  }

  if (!kpiManagementPanel) {
    return;
  }

  kpiManagementPanel.open = true;
  kpiManagementPanel.scrollIntoView({ behavior: "smooth", block: "start" });
};

openKpiManagementButton?.addEventListener("click", (event) => {
  if (openKpiManagementButton instanceof HTMLAnchorElement) {
    return;
  }

  event.preventDefault();
  openKpiManagement();
});

let isKpiFormExpanded = false;

const syncKpiFormToggle = () => {
  if (!(toggleKpiFormButton instanceof HTMLButtonElement) || !kpiAddFormPanel) {
    return;
  }

  kpiAddFormPanel.hidden = !isKpiFormExpanded;
  toggleKpiFormButton.setAttribute("aria-expanded", isKpiFormExpanded ? "true" : "false");
  toggleKpiFormButton.textContent = isKpiFormExpanded ? "KPI入力を閉じる" : "KPIを追加する";
};

toggleKpiFormButton?.addEventListener("click", () => {
  isKpiFormExpanded = !isKpiFormExpanded;
  syncKpiFormToggle();
});

syncKpiFormToggle();


const updateRoadmapKpiButtonState = (kpiCount = latestRenderedKpis.length) => {
  if (!generateRoadmapKpisButton) {
    return;
  }

  const canGenerate = Boolean(currentKgiData) && currentRoadmapPhases.length > 0;
  generateRoadmapKpisButton.hidden = !canGenerate;
  generateRoadmapKpisButton.disabled = !canGenerate || roadmapKpiLoading;
  generateRoadmapKpisButton.textContent = roadmapKpiLoading ? "KPIを作成中..." : "ロードマップからKPIを作る";
  generateRoadmapKpisButton.classList.toggle("attention", canGenerate && kpiCount === 0 && !roadmapKpiLoading);
};

const getInitialDetailEntryStorageKey = () => kgiId ? `kgi-detail-entry:${kgiId}` : "";

const persistInitialDetailEntryState = () => {
  const storageKey = getInitialDetailEntryStorageKey();

  if (!storageKey) {
    return;
  }

  if (!initialDetailEntryState) {
    window.sessionStorage.removeItem(storageKey);
    return;
  }

  window.sessionStorage.setItem(storageKey, JSON.stringify(initialDetailEntryState));
};

const restoreInitialDetailEntryState = () => {
  const storageKey = getInitialDetailEntryStorageKey();

  if (!storageKey) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("Failed to restore initial detail entry state", error);
    return null;
  }
};

const getInitialKpiGuidanceState = (kpiCount = latestRenderedKpis.length) => {
  const normalizedKpiCount = Number(kpiCount);
  const hasNoKpis = normalizedKpiCount === 0;
  const roadmapGenerated = Boolean(initialDetailEntryState?.roadmapKpiStarted);
  const isFirstKpiGuidance = hasNoKpis && roadmapGenerated === false;

  return {
    isFirstKpiGuidance,
    kpiCount: normalizedKpiCount,
    hasNoKpis,
    roadmapGenerated
  };
};

const updateInitialRoadmapKpiGuide = (kpiCount = latestRenderedKpis.length) => {
  const guidanceState = getInitialKpiGuidanceState(kpiCount);
  const { isFirstKpiGuidance, kpiCount: normalizedKpiCount } = guidanceState;

  if (roadmapKpiIntro) {
    roadmapKpiIntro.hidden = !isFirstKpiGuidance;
  }

  if (postRoadmapKpiSections) {
    postRoadmapKpiSections.hidden = isFirstKpiGuidance;
  }


  if (!isFirstKpiGuidance && normalizedKpiCount > 0 && initialDetailEntryState) {
    initialDetailEntryState = null;
    persistInitialDetailEntryState();
  }
};

const disableKpiActions = () => {
  addKpiButton.disabled = true;
  if (generateAiKpisButton) {
    generateAiKpisButton.disabled = true;
  }
  if (generateRoadmapKpisButton) {
    generateRoadmapKpisButton.disabled = true;
  }
};

const enableKpiActions = () => {
  addKpiButton.disabled = false;
  if (generateAiKpisButton) {
    generateAiKpisButton.disabled = false;
  }
  updateRoadmapKpiButtonState();
};

const resetKpiSection = () => {
  currentKgiData = null;
  currentRoadmapPhases = [];
  kgiMeta.hidden = true;
  kgiMeta.innerHTML = "";
  if (roadmapContainer) {
    roadmapContainer.innerHTML = "";
  }
  if (roadmapStatusText) {
    roadmapStatusText.textContent = "読み込み中...";
    roadmapStatusText.classList.remove("error");
  }
  if (currentLocationContainer) {
    currentLocationContainer.innerHTML = '<p class="hint">ロードマップを確認中...</p>';
  }
  setRoadmapKpiLoading(false);
  setRoadmapKpiError("");
  updateRoadmapKpiButtonState(0);
  updateInitialRoadmapKpiGuide(0);
  kpiTableBody.innerHTML = "";
  kpiTable.hidden = true;
  renderOverallProgress([]);
  latestNextActionStepRequestKey = "";
  setNextActionState({
    nextAction: null,
    loading: false,
    error: "",
    stepLoading: false,
    stepError: "",
    steps: []
  });
  renderNextAction(null);
  setArchiveKgiStatus("");
  updateArchiveKgiButtonState(null);
};

function renderAiSuggestions() {
  if (!aiSuggestionsContainer) {
    return;
  }

  aiSuggestionsContainer.hidden = !aiHasGenerated;
  renderSuggestionList(aiSuggestions.resultKpis, resultKpiSuggestions, "result", true, true);
  renderSuggestionList(aiSuggestions.actionKpis, actionKpiSuggestions, "action", true, true);
  renderSubKgiSuggestionList(aiSuggestions.subKgiCandidates, subKgiSuggestions);
}

const displaySuggestionText = (value) => {
  if (typeof value !== "string") {
    return "-";
  }

  const trimmed = value.trim();
  return trimmed || "-";
};

const setRoadmapKpiError = (message = "", tone = roadmapKpiFeedbackTone) => {
  roadmapKpiFeedbackTone = tone;

  if (!roadmapKpiErrorText) {
    return;
  }

  roadmapKpiErrorText.textContent = message;
  roadmapKpiErrorText.hidden = !message;
  roadmapKpiErrorText.classList.toggle("error", tone === "error");
  roadmapKpiErrorText.classList.toggle("info", tone !== "error");
};

const setRoadmapKpiLoading = (nextLoading) => {
  roadmapKpiLoading = nextLoading;
  persistRoadmapKpiLoadingState();
  updateRoadmapKpiButtonState();

  if (roadmapKpiLoadingText) {
    roadmapKpiLoadingText.hidden = !nextLoading;
    roadmapKpiLoadingText.textContent = nextLoading ? "KPIを作成中... 完了まで再押下できません。" : "";
  }
};

const setArchiveKgiStatus = (message = "", isError = false) => {
  if (!archiveKgiStatus) {
    return;
  }

  archiveKgiStatus.textContent = message;
  archiveKgiStatus.classList.toggle("error", isError);
  archiveKgiStatus.classList.toggle("info", !isError && Boolean(message));
};

const archiveDebugState = {
  targetKgiId: "",
  targetCollectionPath: "kgis",
  archiveWriteStarted: false,
  archiveWriteSucceeded: false,
  archiveVerifySucceeded: false,
  lastErrorMessage: ""
};

const renderArchiveDebugState = () => {
  if (archiveDebugTargetKgiId) {
    archiveDebugTargetKgiId.textContent = archiveDebugState.targetKgiId || "-";
  }
  if (archiveDebugTargetCollectionPath) {
    archiveDebugTargetCollectionPath.textContent = archiveDebugState.targetCollectionPath || "-";
  }
  if (archiveDebugWriteStarted) {
    archiveDebugWriteStarted.textContent = String(archiveDebugState.archiveWriteStarted);
  }
  if (archiveDebugWriteSucceeded) {
    archiveDebugWriteSucceeded.textContent = String(archiveDebugState.archiveWriteSucceeded);
  }
  if (archiveDebugVerifySucceeded) {
    archiveDebugVerifySucceeded.textContent = String(archiveDebugState.archiveVerifySucceeded);
  }
  if (archiveDebugLastErrorMessage) {
    archiveDebugLastErrorMessage.textContent = archiveDebugState.lastErrorMessage || "-";
  }
};

const updateArchiveDebugState = (partialState = {}) => {
  Object.assign(archiveDebugState, partialState);
  renderArchiveDebugState();
};

const logArchiveFlow = (message, detail = undefined, method = "info") => {
  const logger = typeof console?.[method] === "function" ? console[method] : console.info;
  if (detail === undefined) {
    logger(message);
    return;
  }

  logger(message, detail);
};

const resetArchiveDebugState = (targetId = kgiId) => {
  updateArchiveDebugState({
    targetKgiId: targetId || "",
    targetCollectionPath: "kgis",
    archiveWriteStarted: false,
    archiveWriteSucceeded: false,
    archiveVerifySucceeded: false,
    lastErrorMessage: ""
  });
};

const showArchiveSuccessThenRedirect = () => {
  if (archiveSuccessMessageTimer) {
    window.clearTimeout(archiveSuccessMessageTimer);
  }

  setArchiveKgiStatus("アーカイブしました");
  archiveSuccessMessageTimer = window.setTimeout(() => {
    redirectToKgiList();
  }, 700);
};

renderArchiveDebugState();

const updateArchiveKgiButtonState = (kgiData = currentKgiData) => {
  if (!(archiveKgiButton instanceof HTMLButtonElement)) {
    return;
  }

  const archived = isArchivedKgi(kgiData);
  archiveKgiButton.disabled = !kgiData || archived;
  archiveKgiButton.textContent = archived ? "このKGIはアーカイブ済みです" : "このKGIを削除";
};

const setAiLoading = (nextLoading) => {
  aiLoading = nextLoading;
  if (generateAiKpisButton) {
    generateAiKpisButton.disabled = nextLoading || !currentKgiData;
  }
  if (aiLoadingText) {
    aiLoadingText.hidden = !nextLoading;
  }
};

const setAiError = (message = "") => {
  aiError = message;
  if (!aiErrorText) {
    return;
  }

  aiErrorText.textContent = message;
  aiErrorText.hidden = !message;
};

const normalizeSuggestionType = (type, fallback = "result") => type === "action" ? "action" : fallback;

const normalizeSuggestionTarget = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const KPI_CATEGORY_OPTIONS = ["research", "design", "build", "quality", "validation", "distribution", "monetization"];
const DEFAULT_KPI_CATEGORY = "build";
const MAX_ACTIVE_KPIS_PER_PHASE_CATEGORY = 2;
const NEAR_DUPLICATE_DISTANCE_THRESHOLD = 3;

const normalizeKpiCategory = (value) => KPI_CATEGORY_OPTIONS.includes(String(value ?? "").trim().toLowerCase())
  ? String(value).trim().toLowerCase()
  : "";

const getKpiCategory = (kpi) => normalizeKpiCategory(kpi?.category) || inferKpiCategory(kpi?.name, kpi?.description) || DEFAULT_KPI_CATEGORY;
const normalizeKpiStatus = (value) => String(value ?? "").trim().toLowerCase() === "archived" ? "archived" : "active";
const isArchivedKpi = (kpi) => normalizeKpiStatus(kpi?.status) === "archived";
const isActiveKpi = (kpi) => !isArchivedKpi(kpi);
const isArchivedKgi = (kgi) => kgi?.archived === true || String(kgi?.status ?? "").trim().toLowerCase() === "archived";

const inferKpiCategory = (name = "", description = "") => {
  const text = `${name} ${description}`.toLowerCase();
  const categoryRules = [
    { category: "research", keywords: ["調査", "分析", "research", "survey", "リサーチ", "仮説"] },
    { category: "design", keywords: ["設計", "構成", "要件", "ワイヤー", "仕様", "design"] },
    { category: "build", keywords: ["実装", "開発", "構築", "build", "制作", "作成", "開発完了"] },
    { category: "quality", keywords: ["テスト", "品質", "安定", "bug", "不具合", "qa", "改善率"] },
    { category: "validation", keywords: ["ベータ", "検証", "反応", "ユーザー反応", "検証結果", "インタビュー", "validation"] },
    { category: "distribution", keywords: ["集客", "登録", "流入", "配信", "拡散", "sns", "distribution", "cv"] },
    { category: "monetization", keywords: ["課金", "売上", "購入", "収益", "単価", "継続課金", "monetization"] }
  ];

  const matched = categoryRules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
  return matched?.category ?? "";
};

const buildSuggestionKey = ({ name = "", description = "", target = 0, type = "result" }) => JSON.stringify({
  name: String(name).trim(),
  description: String(description).trim(),
  target: normalizeSuggestionTarget(target),
  type: normalizeSuggestionType(type)
});

const buildSavedSuggestionKeyFromKpi = (kpi) => buildSuggestionKey({
  name: kpi?.name ?? "",
  description: kpi?.description ?? "",
  target: kpi?.targetValue ?? kpi?.target ?? 0,
  type: kpi?.type ?? kpi?.kpiType ?? "result"
});

const buildSuggestionPayload = (item, fallbackType) => ({
  kgiId,
  name: displaySuggestionText(item?.title) === "-" ? "" : displaySuggestionText(item?.title),
  description: displaySuggestionText(item?.description) === "-" ? "" : displaySuggestionText(item?.description),
  target: normalizeSuggestionTarget(item?.targetValue),
  type: normalizeSuggestionType(item?.type, fallbackType),
  category: normalizeKpiCategory(item?.category) || inferKpiCategory(item?.title, item?.description) || DEFAULT_KPI_CATEGORY,
  reason: typeof item?.reason === "string" ? item.reason.trim() : ""
});

const buildTaskSuggestionKey = (item) => JSON.stringify({
  title: displaySuggestionText(item?.title),
  description: displaySuggestionText(item?.description),
  stage: normalizeTaskStage(item?.stage),
  priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 2,
  type: item?.type === "one_time" ? "one_time" : "one_time",
  progressValue: Number.isFinite(Number(item?.progressValue)) ? Number(item.progressValue) : 1
});

const ensureTaskAiSavedSet = (kpiTargetId) => {
  if (!(taskAiSavedByKpiId[kpiTargetId] instanceof Set)) {
    taskAiSavedByKpiId[kpiTargetId] = new Set();
  }

  return taskAiSavedByKpiId[kpiTargetId];
};

const ensureTaskAiSavingSet = (kpiTargetId) => {
  if (!(taskAiSavingByKpiId[kpiTargetId] instanceof Set)) {
    taskAiSavingByKpiId[kpiTargetId] = new Set();
  }

  return taskAiSavingByKpiId[kpiTargetId];
};

const setTaskAiLoading = (kpiTargetId, isLoading) => {
  taskAiLoadingByKpiId = {
    ...taskAiLoadingByKpiId,
    [kpiTargetId]: isLoading
  };
};

const setTaskAiError = (kpiTargetId, message = "") => {
  taskAiErrorByKpiId = {
    ...taskAiErrorByKpiId,
    [kpiTargetId]: message
  };
};

const FALLBACK_TASK_TITLE = "最初の一歩を決める";
const FALLBACK_TASK_DESCRIPTION = "KPI達成に向けて、最初に着手する具体的な作業を1つ決めて実行する。";

const normalizeGeneratedTaskDraft = (suggestion, kpiId, order = 0, ticketNote = "") => {
  const normalizedTitle = displaySuggestionText(suggestion?.title) === "-"
    ? (displaySuggestionText(suggestion?.kpi) === "-" ? displaySuggestionText(suggestion?.text) : displaySuggestionText(suggestion?.kpi))
    : displaySuggestionText(suggestion?.title);
  const normalizedDescription = displaySuggestionText(suggestion?.description) === "-"
    ? ""
    : displaySuggestionText(suggestion?.description);
  const parsedPriority = Number(suggestion?.priority);

  return {
    title: normalizedTitle || FALLBACK_TASK_TITLE,
    description: normalizedDescription || FALLBACK_TASK_DESCRIPTION,
    status: "todo",
    deadline: "",
    assignee: "",
    dueDate: "",
    doneDefinition: "",
    ticketStatus: ticketNote ? "ready" : "backlog",
    ticketNote,
    stage: normalizeTaskStage(suggestion?.stage),
    dependsOnTaskIds: normalizeDependsOnTaskIds(suggestion?.dependsOnTaskIds),
    priority: Number.isFinite(parsedPriority) ? parsedPriority : 0,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
    isSuggestedByAI: true,
    type: "one_time",
    progressValue: 1,
    contributedValue: 0,
    isCompleted: false,
    taskKind: TASK_KIND.KPI,
    kpiId,
    checkStatus: "not_checked",
    checkComment: "",
    checkResult: "",
    checkRecordedAt: null
  };
};

const setTaskAiSuggestions = (kpiTargetId, suggestions) => {
  taskAiSuggestionsByKpiId = {
    ...taskAiSuggestionsByKpiId,
    [kpiTargetId]: Array.isArray(suggestions) ? suggestions : []
  };
};

const hydrateTaskAiSavedStateFromTasks = (kpis) => {
  const nextSavedState = {};

  kpis.forEach((kpi) => {
    const savedSet = ensureTaskAiSavedSet(kpi.id);
    const nextSavedSet = new Set(savedSet);
    const tasks = Array.isArray(kpi.tasks) ? kpi.tasks : [];

    tasks.forEach((task) => {
      if (task?.isSuggestedByAI) {
        nextSavedSet.add(buildTaskSuggestionKey(task));
      }
    });

    nextSavedState[kpi.id] = nextSavedSet;
  });

  taskAiSavedByKpiId = nextSavedState;
};

const renderTaskSuggestionList = (kpi) => {
  const suggestions = Array.isArray(taskAiSuggestionsByKpiId[kpi.id]) ? taskAiSuggestionsByKpiId[kpi.id] : [];
  const isLoading = Boolean(taskAiLoadingByKpiId[kpi.id]);
  const errorMessage = taskAiErrorByKpiId[kpi.id] ?? "";
  const savedSet = ensureTaskAiSavedSet(kpi.id);
  const savingSet = ensureTaskAiSavingSet(kpi.id);
  const isOpen = Boolean(taskAiPanelOpenState[kpi.id]);

  const loadingMarkup = isLoading
    ? '<p class="hint">AIがTask案を作成中...</p>'
    : "";
  const errorMarkup = errorMessage
    ? `<p class="hint error">${errorMessage}</p>`
    : "";

  let listMarkup = "";

  if (suggestions.length > 0) {
    const itemsMarkup = suggestions.map((item) => {
      const suggestionKey = buildTaskSuggestionKey(item);
      const isSaved = savedSet.has(suggestionKey);
      const isSaving = savingSet.has(suggestionKey);
      const title = displaySuggestionText(item?.title);
      const description = displaySuggestionText(item?.description);
      const priority = Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 2;
      const buttonLabel = isSaved ? "追加済み" : isSaving ? "追加中..." : "＋追加";

      return `
        <li class="ai-suggestion-item">
          <div class="ai-suggestion-head">
            <strong>${title}</strong>
            <button
              class="button ai-add-button task-ai-add-button"
              type="button"
              data-task-suggestion='${JSON.stringify(item).replace(/'/g, "&#39;")}'
              data-kpi-id="${kpi.id}"
              ${isSaved || isSaving ? "disabled" : ""}
            >${buttonLabel}</button>
          </div>
          <span class="ai-suggestion-meta">説明: ${description}</span>
          <span class="ai-suggestion-meta">優先度: ${priority}</span>
        </li>
      `;
    }).join("");

    listMarkup = `<ul class="ai-suggestion-list">${itemsMarkup}</ul>`;
  }

  return `
    <div class="task-ai-panel">
      <div class="task-disclosure-header">
        <button
          class="button secondary task-disclosure-toggle"
          type="button"
          data-task-ai-toggle="${kpi.id}"
          aria-expanded="${isOpen ? "true" : "false"}"
        >${isOpen ? "AI候補を閉じる" : "AIでTask案を作る"}</button>
        <span class="hint">${suggestions.length > 0 ? `${suggestions.length}件の候補あり` : "必要なときだけ展開"}</span>
      </div>
      <div class="task-disclosure-body" ${isOpen ? "" : "hidden"}>
        <div class="ai-actions task-ai-actions">
          <button
            class="button"
            type="button"
            data-task-ai-generate="${kpi.id}"
            ${isLoading ? "disabled" : ""}
          >${suggestions.length > 0 ? "AI候補を再生成" : "AIでTask案を作る"}</button>
          ${loadingMarkup}
        </div>
        <p class="hint">過去の振り返りを反映して提案しています。</p>
        ${errorMarkup}
        ${listMarkup ? `<div class="task-ai-suggestions">${listMarkup}</div>` : ""}
      </div>
    </div>
  `;
};

const renderSuggestionList = (items, container, fallbackType, showTargetValue, allowAddButton) => {
  if (!container) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<p class="hint">候補なし</p>';
    return;
  }

  const listMarkup = items.map((item) => {
    const title = displaySuggestionText(item?.title);
    const description = displaySuggestionText(item?.description);
    const payload = buildSuggestionPayload(item, fallbackType);
    const suggestionKey = buildSuggestionKey(payload);
    const isSaved = existingKpiKeys.has(suggestionKey);
    const isSaving = aiSavingKey === suggestionKey;
    const targetValue = showTargetValue
      ? `<span class="ai-suggestion-meta">目標値: ${Number.isFinite(Number(item?.targetValue)) ? Number(item.targetValue) : "-"}</span>`
      : "";
    const categoryLabel = `<span class="ai-suggestion-meta">カテゴリ: ${escapeHtml(payload.category || DEFAULT_KPI_CATEGORY)}</span>`;
    const reasonLabel = typeof payload.reason === "string" && payload.reason
      ? `<span class="ai-suggestion-meta">理由: ${escapeHtml(payload.reason)}</span>`
      : "";
    const buttonLabel = isSaved ? "追加済み" : "＋追加";
    const buttonMarkup = allowAddButton
      ? `
          <button
            class="button ai-add-button"
            type="button"
            data-suggestion='${JSON.stringify(payload).replace(/'/g, "&#39;")}'
            ${isSaved || isSaving ? "disabled" : ""}
          >${buttonLabel}</button>
        `
      : "";

    return `
      <li class="ai-suggestion-item">
        <div class="ai-suggestion-head">
          <strong>${title}</strong>
          ${buttonMarkup}
        </div>
        <span class="ai-suggestion-meta">説明: ${description}</span>
        ${categoryLabel}
        ${targetValue}
        ${reasonLabel}
      </li>
    `;
  }).join("");

  container.innerHTML = `<ul class="ai-suggestion-list">${listMarkup}</ul>`;
};

renderAiSuggestions();

showArchivedToggle?.addEventListener("change", async (event) => {
  showArchivedKpis = Boolean(event.target instanceof HTMLInputElement ? event.target.checked : false);
  await loadKpis();
});

const handleArchiveDeleteButtonClick = () => {
  logArchiveFlow("delete button clicked", {
    buttonId: archiveKgiButton?.id ?? null,
    hasDialog: archiveKgiDialog instanceof HTMLDialogElement,
    archived: isArchivedKgi(currentKgiData),
    archiveKgiInFlight
  });

  if (!(archiveKgiDialog instanceof HTMLDialogElement) || isArchivedKgi(currentKgiData) || archiveKgiInFlight) {
    return;
  }

  setArchiveKgiStatus("");
  archiveKgiDialog.showModal();
  logArchiveFlow("dialog opened", {
    dialogId: archiveKgiDialog.id,
    open: archiveKgiDialog.open
  });
};

const handleArchiveConfirm = async (event) => {
  event?.preventDefault?.();
  logArchiveFlow("confirm clicked", {
    dialogId: archiveKgiDialog instanceof HTMLDialogElement ? archiveKgiDialog.id : null,
    confirmButtonId: confirmArchiveKgiButton?.id ?? null,
    dialogOpen: archiveKgiDialog instanceof HTMLDialogElement ? archiveKgiDialog.open : false
  });
  await archiveCurrentKgi();
};

const wireArchiveDeleteEvents = () => {
  if (archiveKgiButton instanceof HTMLButtonElement) {
    archiveKgiButton.addEventListener("click", handleArchiveDeleteButtonClick);
    archiveKgiButton.onclick = handleArchiveDeleteButtonClick;
  }

  if (confirmArchiveKgiButton instanceof HTMLButtonElement) {
    confirmArchiveKgiButton.addEventListener("click", handleArchiveConfirm);
    confirmArchiveKgiButton.onclick = handleArchiveConfirm;
  }

  if (archiveKgiDialogForm instanceof HTMLFormElement) {
    archiveKgiDialogForm.addEventListener("submit", handleArchiveConfirm);
  }

  logArchiveFlow("archive delete events wired", {
    deleteButtonId: archiveKgiButton?.id ?? null,
    confirmButtonId: confirmArchiveKgiButton?.id ?? null,
    hasDialog: archiveKgiDialog instanceof HTMLDialogElement
  });
};

wireArchiveDeleteEvents();

archiveKgiDialog?.addEventListener("close", () => {
  archiveKgiDialog.returnValue = "";
});


const resetAiSuggestions = () => {
  aiHasGenerated = false;
  aiSuggestions = emptyAiSuggestions();
  subKgiSaveError = "";
  persistAiSuggestions();
  renderAiSuggestions();
};

const buildGoalForAi = (kgiData) => {
  const name = typeof kgiData?.name === "string" ? kgiData.name.trim() : "";
  const goalText = typeof kgiData?.goalText === "string" ? kgiData.goalText.trim() : "";

  if (goalText) {
    return `${name} / ${goalText}`;
  }

  return name;
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString("ja-JP");
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString("ja-JP");
    }
  }

  return "-";
};

const normalizeRoutineTaskStatus = (value) => String(value ?? "").trim().toLowerCase() === ROUTINE_TASK_STATUS.DONE
  ? ROUTINE_TASK_STATUS.DONE
  : ROUTINE_TASK_STATUS.ACTIVE;

const normalizeRoutineTaskCadence = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(ROUTINE_TASK_CADENCE_LABELS, normalized) ? normalized : "ad_hoc";
};

const displayGoalText = (goalText) => {
  if (typeof goalText !== "string") {
    return "-";
  }

  const trimmed = goalText.trim();
  return trimmed || "-";
};

const DEFAULT_KGI_DURATION_DAYS = 100;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const formatDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const displayDeadline = (deadline) => {
  if (typeof deadline !== "string") {
    return "未設定";
  }

  const trimmed = deadline.trim();
  return trimmed || "未設定";
};

const parseDeadline = (deadline) => {
  if (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return null;
  }

  const [year, month, day] = deadline.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const calculateDistributedPhaseDeadlines = (startDateValue, deadlineValue, phaseCount) => {
  const startDate = parseDeadline(startDateValue);
  const deadlineDate = parseDeadline(deadlineValue);

  if (!startDate || !deadlineDate || !Number.isInteger(phaseCount) || phaseCount <= 0) {
    return [];
  }

  const totalDays = Math.max(0, Math.round((deadlineDate.getTime() - startDate.getTime()) / MS_PER_DAY));

  return Array.from({ length: phaseCount }, (_, index) => {
    const phaseOffset = Math.round((totalDays * (index + 1)) / phaseCount);
    return formatDateInputValue(addDays(startDate, phaseOffset));
  });
};

const buildKgiSchedule = (kgiData = {}, phases = []) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = parseDeadline(kgiData?.startDate)
    ? kgiData.startDate
    : formatDateInputValue(today);
  const deadline = parseDeadline(kgiData?.deadline)
    ? kgiData.deadline
    : formatDateInputValue(addDays(parseDeadline(startDate) ?? today, DEFAULT_KGI_DURATION_DAYS));

  return {
    startDate,
    deadline,
    phaseDeadlines: calculateDistributedPhaseDeadlines(startDate, deadline, Array.isArray(phases) ? phases.length : 0)
  };
};

const applyScheduleToRoadmapPhases = (phases, schedule) => (Array.isArray(phases) ? phases : []).map((phase, index) => ({
  ...phase,
  deadline: schedule.phaseDeadlines[index] || phase?.deadline || ""
}));

const calcRemainingDays = (deadline) => {
  const deadlineDate = parseDeadline(deadline);

  if (!deadlineDate) {
    return {
      deadlineText: "未設定",
      remainingText: "未設定",
      isOverdue: false
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return {
      deadlineText: deadline,
      remainingText: `あと${diffDays}日`,
      isOverdue: false
    };
  }

  if (diffDays === 0) {
    return {
      deadlineText: deadline,
      remainingText: "今日が期限",
      isOverdue: false
    };
  }

  return {
    deadlineText: deadline,
    remainingText: `期限超過 ${Math.abs(diffDays)}日`,
    isOverdue: true
  };
};

const getPhaseDeadlineDisplayLabel = (phase = {}) => {
  const deadline = typeof phase?.deadline === "string" ? phase.deadline.trim() : "";
  return deadline || "未設定";
};

const getPhaseRemainingDaysLabel = (phase = {}) => {
  const deadlineInfo = calcRemainingDays(phase?.deadline ?? "");
  return deadlineInfo.remainingText === "未設定" ? "あと日数: 未設定" : deadlineInfo.remainingText;
};

const setKgiDeadlineFormStatus = (message, isError = false) => {
  if (!kgiDeadlineFormStatus) {
    return;
  }

  kgiDeadlineFormStatus.textContent = message;
  kgiDeadlineFormStatus.classList.toggle("error", isError);
};

const ROADMAP_STATUS_LABELS = {
  done: "完了",
  current: "今ここ",
  next: "次",
  future: "予定"
};

const normalizeRoadmapStatus = (status) => {
  if (status === "done" || status === "current" || status === "next" || status === "future") {
    return status;
  }

  return "future";
};

const normalizeRoadmapPhases = (phases) => {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases
    .map((phase, index) => {
      const id = typeof phase?.id === "string" && phase.id.trim()
        ? phase.id.trim()
        : `phase_${index + 1}`;
      const title = typeof phase?.title === "string" && phase.title.trim()
        ? phase.title.trim()
        : `フェーズ${index + 1}`;
      const description = typeof phase?.description === "string" && phase.description.trim()
        ? phase.description.trim()
        : "説明はまだありません";
      const deadline = typeof phase?.deadline === "string" && phase.deadline.trim()
        ? phase.deadline.trim()
        : "";

      return {
        id,
        title,
        description,
        deadline,
        status: normalizeRoadmapStatus(phase?.status)
      };
    })
    .filter((phase) => phase.title);
};

const buildRoadmapPhaseSummary = (phases = currentRoadmapPhases) => (Array.isArray(phases) ? phases : []).map((phase) => ({
  id: phase.id,
  title: phase.title,
  description: phase.description,
  deadline: phase.deadline ?? "",
  status: phase.status
}));

const normalizeKpiDuplicateText = (value) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\s\u3000]+/g, "")
  .trim()
  .toLowerCase();

const levenshteinDistance = (source = "", target = "") => {
  const a = normalizeKpiDuplicateText(source);
  const b = normalizeKpiDuplicateText(target);

  if (!a) {
    return b.length;
  }

  if (!b) {
    return a.length;
  }

  const matrix = Array.from({ length: a.length + 1 }, (_, index) => [index]);

  for (let index = 0; index <= b.length; index += 1) {
    matrix[0][index] = index;
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const isNearDuplicateKpiName = (left, right) => {
  const normalizedLeft = normalizeKpiDuplicateText(left);
  const normalizedRight = normalizeKpiDuplicateText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (
    (normalizedLeft.length <= 18 || normalizedRight.length <= 18)
    && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return true;
  }

  return levenshteinDistance(normalizedLeft, normalizedRight) <= NEAR_DUPLICATE_DISTANCE_THRESHOLD;
};

const buildKpiDuplicateDiagnostics = (candidate, existingKpis = []) => {
  const candidateName = String(candidate?.name ?? "").trim();
  const candidatePhaseId = String(candidate?.phaseId ?? "").trim();
  const candidateCategory = normalizeKpiCategory(candidate?.category) || DEFAULT_KPI_CATEGORY;
  const normalizedCandidateName = normalizeKpiDuplicateText(candidateName);
  const activeKpis = existingKpis.filter(isActiveKpi);
  const samePhaseCategory = activeKpis.filter((kpi) => (
    String(kpi?.phaseId ?? "").trim() === candidatePhaseId
    && getKpiCategory(kpi) === candidateCategory
  ));
  const exactDuplicate = activeKpis.find((kpi) => normalizeKpiDuplicateText(kpi?.name) === normalizedCandidateName);
  const nearDuplicate = samePhaseCategory.find((kpi) => isNearDuplicateKpiName(kpi?.name, candidateName));
  const categoryOverflow = samePhaseCategory.length >= MAX_ACTIVE_KPIS_PER_PHASE_CATEGORY;

  return {
    exactDuplicate,
    nearDuplicate,
    categoryOverflow,
    samePhaseCategoryCount: samePhaseCategory.length
  };
};

const getPhaseIndexById = (phaseId, phases = currentRoadmapPhases) => phases.findIndex((phase) => phase.id === phaseId);

const resolvePhaseMetadata = (phaseId, phases = currentRoadmapPhases) => {
  const normalizedPhaseId = typeof phaseId === "string" ? phaseId.trim() : "";
  const phaseIndex = getPhaseIndexById(normalizedPhaseId, phases);
  const phase = phaseIndex >= 0 ? phases[phaseIndex] : null;

  return {
    phaseId: phase?.id ?? normalizedPhaseId,
    phaseName: phase?.title ?? "",
    phaseNumber: phaseIndex >= 0 ? phaseIndex + 1 : null
  };
};

const buildKpiSavePayload = async ({
  name,
  description,
  kpiType,
  deadline = "",
  targetValue = 100,
  phaseId = getDefaultPhaseId(),
  order = 0,
  category = "",
  source = "manual"
}) => {
  const simplified = await fetchSimpleKpi({
    name,
    description,
    type: kpiType,
    targetValue
  });

  const normalizedCategory = normalizeKpiCategory(category) || inferKpiCategory(name, description) || DEFAULT_KPI_CATEGORY;
  const phaseMeta = resolvePhaseMetadata(phaseId);

  return {
    kgiId,
    name,
    description,
    simpleName: simplified.simpleName,
    simpleDescription: simplified.simpleDescription,
    type: kpiType,
    kpiType,
    category: normalizedCategory,
    progressType: "task_based",
    target: targetValue,
    targetValue,
    currentValue: 0,
    unit: "pt",
    deadline,
    progress: 0,
    percentage: 0,
    phaseId: phaseMeta.phaseId,
    phaseName: phaseMeta.phaseName,
    phaseNumber: phaseMeta.phaseNumber,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: "active",
    priority: 2,
    order,
    source
  };
};

const buildPhaseNameNameKey = (phaseId, name) => `${normalizeKpiDuplicateText(phaseId)}::${normalizeKpiDuplicateText(name)}`;

const ROADMAP_KPI_LOADING_MAX_AGE_MS = 2 * 60 * 1000;
const getRoadmapKpiLoadingStorageKey = () => kgiId ? `kgi-detail-roadmap-kpi-loading:${kgiId}` : "";

const persistRoadmapKpiLoadingState = () => {
  const storageKey = getRoadmapKpiLoadingStorageKey();

  if (!storageKey) {
    return;
  }

  try {
    if (roadmapKpiLoading) {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ status: "loading", startedAt: Date.now() }));
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch (error) {
    console.error("Failed to persist roadmap KPI loading state", error);
  }
};

const restoreRoadmapKpiLoadingState = () => {
  const storageKey = getRoadmapKpiLoadingStorageKey();

  if (!storageKey) {
    return false;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw);
    return parsed?.status === "loading" && Number.isFinite(parsed?.startedAt) && Date.now() - parsed.startedAt < ROADMAP_KPI_LOADING_MAX_AGE_MS;
  } catch (error) {
    console.error("Failed to restore roadmap KPI loading state", error);
    return false;
  }
};

const requestRoadmapGeneratedKpis = async () => {
  const fetchUrl = "/api/generate-kpis-from-roadmap";
  const requestBody = {
    kgiName: currentKgiData?.name ?? "",
    kgiGoalText: currentKgiData?.goalText ?? "",
    roadmapPhases: buildRoadmapPhaseSummary(currentRoadmapPhases)
  };

  console.log("button clicked");
  console.log("fetch開始");
  console.log("fetch url", fetchUrl);
  console.log("request roadmapPhases length", Array.isArray(requestBody.roadmapPhases) ? requestBody.roadmapPhases.length : "invalid");

  const response = await fetch(fetchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  console.log("response.status", response.status);
  const responseText = await response.text();
  console.log("response body raw text", responseText);
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse /api/generate-kpis-from-roadmap response as JSON", parseError, responseText);
    }
  }

  if (!response.ok || !Array.isArray(data?.kpis)) {
    throw new Error(data?.error || "ロードマップからKPIを生成できませんでした");
  }

  return data.kpis;
};

const saveRoadmapGeneratedKpis = async (generatedKpis) => {
  const existingSnapshot = await getDocs(getKpisQuery());
  const existingKpis = normalizeKpis(existingSnapshot.docs);
  const existingKeys = new Set(existingKpis.map((kpi) => buildPhaseNameNameKey(kpi?.phaseId, kpi?.name)));
  const batch = writeBatch(db);
  const now = serverTimestamp();
  let nextOrder = existingSnapshot.size;
  let savedCount = 0;
  let skippedCount = 0;

  generatedKpis.forEach((kpi) => {
    const duplicateKey = buildPhaseNameNameKey(kpi?.phaseId, kpi?.name);
    const category = normalizeKpiCategory(kpi?.category) || inferKpiCategory(kpi?.name, kpi?.description) || DEFAULT_KPI_CATEGORY;
    const duplicateDiagnostics = buildKpiDuplicateDiagnostics({
      name: kpi?.name,
      phaseId: kpi?.phaseId,
      category
    }, existingKpis);

    if (!duplicateKey || existingKeys.has(duplicateKey) || duplicateDiagnostics.nearDuplicate || duplicateDiagnostics.categoryOverflow) {
      skippedCount += 1;
      return;
    }

    const topLevelRef = doc(getKpisRef());
    const nestedRef = doc(getNestedKpisRef(), topLevelRef.id);
    const phaseMeta = resolvePhaseMetadata(kpi?.phaseId);
    const payload = {
      kgiId,
      name: String(kpi.name ?? "").trim(),
      description: String(kpi.description ?? "").trim(),
      simpleName: String(kpi.simpleName ?? kpi.name ?? "").trim(),
      simpleDescription: String(kpi.simpleDescription ?? kpi.description ?? "").trim(),
      type: kpi.type,
      kpiType: kpi.type,
      category,
      target: Number(kpi.targetValue),
      targetValue: Number(kpi.targetValue),
      currentValue: 0,
      progressType: "task_based",
      unit: "pt",
      progress: 0,
      percentage: 0,
      phaseId: phaseMeta.phaseId,
      phaseName: phaseMeta.phaseName,
      phaseNumber: phaseMeta.phaseNumber,
      status: "active",
      priority: 2,
      order: nextOrder,
      createdAt: now,
      updatedAt: now
    };

    batch.set(topLevelRef, payload);
    batch.set(nestedRef, payload);
    existingKeys.add(duplicateKey);
    existingKpis.push({ ...payload, id: topLevelRef.id });
    nextOrder += 1;
    savedCount += 1;
  });

  if (savedCount > 0) {
    await batch.commit();
  }

  return { savedCount, skippedCount };
};

const getPhaseStatusRank = (status) => ({ current: 0, next: 1, future: 2, done: 3 }[normalizeRoadmapStatus(status)] ?? 4);

const getPhaseSectionTitle = (phase) => phase?.title || "未分類";

const getPhaseSectionStatusLabel = (phase) => {
  if (!phase?.id) {
    return "未分類";
  }

  return ROADMAP_STATUS_LABELS[normalizeRoadmapStatus(phase.status)] ?? "予定";
};

const ensurePhaseOpenState = (phaseGroups, phases = currentRoadmapPhases) => {
  const currentPhaseId = getCurrentRoadmapPhase(phases)?.id ?? "";
  const nextState = {};

  phaseGroups.forEach((group, index) => {
    const key = group.key;
    if (Object.prototype.hasOwnProperty.call(roadmapPhaseOpenState, key)) {
      nextState[key] = Boolean(roadmapPhaseOpenState[key]);
      return;
    }

    nextState[key] = Boolean(currentPhaseId) ? group.phaseId === currentPhaseId : index === 0;
  });

  roadmapPhaseOpenState = nextState;
};

const isPhaseGroupOpen = (groupKey) => Boolean(roadmapPhaseOpenState[groupKey]);

const buildPhaseGroups = (kpis, phases = currentRoadmapPhases) => {
  const phaseMap = new Map((Array.isArray(phases) ? phases : []).map((phase) => [phase.id, phase]));
  const grouped = new Map();

  (Array.isArray(kpis) ? kpis : []).forEach((kpi) => {
    const phaseId = typeof kpi?.phaseId === "string" ? kpi.phaseId.trim() : "";
    const groupKey = phaseId || "unclassified";

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }

    grouped.get(groupKey).push(kpi);
  });

  return Array.from(grouped.entries())
    .map(([groupKey, items]) => {
      const phase = phaseMap.get(groupKey) ?? null;
      return {
        phaseId: phase?.id ?? "",
        key: groupKey,
        title: getPhaseSectionTitle(phase),
        status: phase?.status ?? "future",
        statusLabel: getPhaseSectionStatusLabel(phase),
        description: phase?.description ?? "",
        items
      };
    })
    .sort((a, b) => {
      const rankDiff = getPhaseStatusRank(a.status) - getPhaseStatusRank(b.status);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      const indexA = phases.findIndex((phase) => phase.id === a.phaseId);
      const indexB = phases.findIndex((phase) => phase.id === b.phaseId);
      return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
    });
};

const getCurrentRoadmapPhase = (phases = currentRoadmapPhases) => phases.find((phase) => phase.status === "current") ?? null;
const getNextRoadmapPhase = (phases = currentRoadmapPhases) => phases.find((phase) => phase.status === "next") ?? null;

const getPhaseLabel = (phaseId, phases = currentRoadmapPhases) => {
  if (typeof phaseId !== "string" || !phaseId.trim()) {
    return "未分類";
  }

  return phases.find((phase) => phase.id === phaseId)?.title ?? "未分類";
};
const getDefaultPhaseId = (phases = currentRoadmapPhases) => {
  if (isPhasePage && selectedPhaseId) {
    return selectedPhaseId;
  }

  const currentPhase = getCurrentRoadmapPhase(phases);

  if (currentPhase?.id) {
    return currentPhase.id;
  }

  const nextPhase = getNextRoadmapPhase(phases);
  return nextPhase?.id ?? "";
};


const renderRoadmap = (phases = currentRoadmapPhases) => {
  if (!roadmapContainer) {
    return;
  }

  if (!Array.isArray(phases) || phases.length === 0) {
    roadmapContainer.innerHTML = '<p class="hint">ロードマップはまだ未生成です。KGI詳細にはそのまま進めます。</p>';
    if (roadmapStatusText) {
      roadmapStatusText.textContent = "未生成";
      roadmapStatusText.classList.remove("error");
    }
    return;
  }

  const markup = phases.map((phase, index) => {
    const periodLabel = getPhaseDeadlineDisplayLabel(phase);
    const remainingDaysLabel = getPhaseRemainingDaysLabel(phase);
    const phaseTitle = buildRoadmapPhaseTitle(phase.title, index);
    const isEasyLevel = (currentKgiData?.explanationLevel ?? "normal") === "easy";

    return `
    <li class="roadmap-phase-item ${phase.status}">
      <div class="roadmap-phase-head">
        <div class="roadmap-phase-title-group">
          <div class="roadmap-phase-heading-row">
            <span class="roadmap-phase-number" aria-label="フェーズ番号">フェーズ${index + 1}</span>
            <strong class="roadmap-phase-title">${escapeHtml(phaseTitle)}</strong>
          </div>
          <span class="roadmap-phase-period" aria-label="期間">期限目安: ${escapeHtml(periodLabel)}</span>
          <span class="roadmap-phase-remaining ${phase.status === "current" ? "current" : ""}" aria-label="残り日数">${escapeHtml(remainingDaysLabel)}</span>
        </div>
        <span class="roadmap-phase-status ${phase.status}">${ROADMAP_STATUS_LABELS[phase.status] ?? "予定"}</span>
      </div>
      ${renderRoadmapPhaseDescription(phase.description, { isEasy: isEasyLevel })}
      <span class="roadmap-phase-meta">順番: ${index + 1} / ${phases.length}</span>
      <div class="roadmap-phase-links">
        <a class="roadmap-phase-link" href="${buildPhasePageUrl(phase.id)}">KPIを見る</a>
      </div>
    </li>
  `;
  }).join("");

  roadmapContainer.innerHTML = `<ol class="roadmap-list">${markup}</ol>`;
  if (roadmapStatusText) {
    roadmapStatusText.textContent = `${phases.length}フェーズ`;
    roadmapStatusText.classList.remove("error");
  }
};

const renderCurrentLocation = (phases = currentRoadmapPhases) => {
  if (!currentLocationContainer) {
    return;
  }

  const currentPhase = getCurrentRoadmapPhase(phases);
  const nextPhase = getNextRoadmapPhase(phases);

  currentLocationContainer.innerHTML = `
    <div class="location-card">
      <strong>今いるフェーズ</strong>
      <div>${escapeHtml(currentPhase?.title ?? "未設定")}</div>
      <p class="hint">${escapeHtml(currentPhase?.description ?? "ロードマップ未生成のため、現在地を特定できていません。")}</p>
    </div>
    <div class="location-card">
      <strong>次の到達点</strong>
      <div>${escapeHtml(nextPhase?.title ?? "未設定")}</div>
      <p class="hint">${escapeHtml(nextPhase?.description ?? "次フェーズはまだありません。現在のTask完了後に見直してください。")}</p>
    </div>
  `;
};

const formatPercent = (value) => `${Math.round(value)}%`;

const clampPercent = (value) => Math.max(0, Math.min(100, value));

const displayDescription = (description) => {
  if (typeof description !== "string") {
    return "-";
  }

  const trimmed = description.trim();
  return trimmed || "-";
};

const getSimpleName = (kpi) => {
  if (typeof kpi?.simpleName === "string" && kpi.simpleName.trim()) {
    return kpi.simpleName.trim();
  }

  if (typeof kpi?.name === "string" && kpi.name.trim()) {
    return kpi.name.trim();
  }

  return "";
};

const getSimpleDescription = (kpi) => {
  if (typeof kpi?.simpleDescription === "string" && kpi.simpleDescription.trim()) {
    return kpi.simpleDescription.trim();
  }

  if (typeof kpi?.description === "string" && kpi.description.trim()) {
    return kpi.description.trim();
  }

  return "";
};

const buildSimpleKpiFallback = ({ name = "", description = "" }) => ({
  simpleName: typeof name === "string" && name.trim() ? name.trim() : "KPI",
  simpleDescription: typeof description === "string" && description.trim() ? description.trim() : "説明なし"
});

const fetchSimpleKpi = async ({ name = "", description = "", type = "result", targetValue = null }) => {
  const fallback = buildSimpleKpiFallback({ name, description });

  try {
    const response = await fetch("/api/simplify-kpi", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        description,
        type: type === "action" ? "action" : "result",
        targetValue
      })
    });

    const responseText = await response.text();
    let data = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse /api/simplify-kpi response as JSON", parseError, responseText);
      }
    }

    if (!response.ok) {
      const apiErrorMessage = typeof data?.error === "string" ? data.error : `HTTP ${response.status}`;
      throw new Error(apiErrorMessage);
    }

    return {
      simpleName: typeof data?.simpleName === "string" && data.simpleName.trim() ? data.simpleName.trim() : fallback.simpleName,
      simpleDescription: typeof data?.simpleDescription === "string" && data.simpleDescription.trim() ? data.simpleDescription.trim() : fallback.simpleDescription
    };
  } catch (error) {
    console.error("Failed to simplify KPI", error);
    return fallback;
  }
};

const ensureSimpleKpiFields = async (kpi) => {
  if (!kpi?.id) {
    return {
      ...kpi,
      ...buildSimpleKpiFallback(kpi ?? {})
    };
  }

  if (typeof kpi.simpleName === "string" && kpi.simpleName.trim() && typeof kpi.simpleDescription === "string" && kpi.simpleDescription.trim()) {
    return kpi;
  }

  const simplified = await fetchSimpleKpi({
    name: kpi.name ?? "",
    description: kpi.description ?? "",
    type: kpi.type ?? kpi.kpiType ?? "result",
    targetValue: kpi.targetValue ?? kpi.target ?? null
  });

  try {
    await updateDoc(getKpiRef(kpi.id), {
      simpleName: simplified.simpleName,
      simpleDescription: simplified.simpleDescription,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to persist simplified KPI fields", error);
  }

  return {
    ...kpi,
    ...simplified
  };
};

const parsePositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const TASK_STAGE_OPTIONS = ["setup", "research", "decision", "build", "launch", "review"];
const STAGE_ORDER = Object.freeze({
  setup: 0,
  research: 1,
  decision: 2,
  build: 3,
  launch: 4,
  review: 5
});
const TASK_STAGE_LABELS = {
  setup: "setup",
  research: "research",
  decision: "decision",
  build: "build",
  launch: "launch",
  review: "review"
};

const normalizeTaskStage = (stage) => {
  const normalized = typeof stage === "string" ? stage.trim().toLowerCase() : "";
  return TASK_STAGE_OPTIONS.includes(normalized) ? normalized : "build";
};

const normalizeDependsOnTaskIds = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const getTaskStageRank = (task) => STAGE_ORDER[normalizeTaskStage(task?.stage)] ?? STAGE_ORDER.build;
const getTaskStageLabel = (task) => TASK_STAGE_LABELS[normalizeTaskStage(task?.stage)] ?? "build";

const normalizeTaskType = (type) => {
  if (type === "repeatable") {
    return "repeatable";
  }
  return "one_time";
};

const displayTaskPriority = (priority) => {
  const parsed = Number(priority);
  return Number.isFinite(parsed) ? parsed : 2;
};
const getComparablePriority = (priority) => {
  const parsed = Number(priority);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return parsed;
};

const getComparableCreatedAt = (value) => {
  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return Number.MAX_SAFE_INTEGER;
};

const getComparableDeadline = (deadline) => {
  const parsed = parseDeadline(deadline);
  return parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
};

const TASK_TICKET_STATUS_OPTIONS = [
  { value: "backlog", label: "未整理" },
  { value: "ready", label: "着手可能" },
  { value: "doing", label: "進行中" },
  { value: "done", label: "完了" }
];

const getTaskAssignee = (task) => typeof task?.assignee === "string" ? task.assignee.trim() : "";

const getTaskDueDate = (task) => {
  if (typeof task?.dueDate === "string" && task.dueDate.trim()) {
    return task.dueDate.trim();
  }

  if (typeof task?.deadline === "string" && task.deadline.trim()) {
    return task.deadline.trim();
  }

  return "";
};

const getTaskDoneDefinition = (task) => typeof task?.doneDefinition === "string" ? task.doneDefinition.trim() : "";

const getTaskTicketNote = (task) => typeof task?.ticketNote === "string" ? task.ticketNote.trim() : "";

const normalizeTaskTicketStatus = (task) => {
  const rawStatus = typeof task?.ticketStatus === "string" ? task.ticketStatus.trim().toLowerCase() : "";

  if (TASK_TICKET_STATUS_OPTIONS.some((option) => option.value === rawStatus)) {
    return rawStatus;
  }

  const actionableStatus = getTaskActionableStatus(task);

  if (actionableStatus === "doing") {
    return "doing";
  }

  if (actionableStatus === "done") {
    return "done";
  }

  return "backlog";
};

const getTaskTicketStatusLabel = (status) => TASK_TICKET_STATUS_OPTIONS
  .find((option) => option.value === status)?.label ?? "未整理";

const getTaskTicketStatusClassName = (status) => {
  if (status === "ready") {
    return "ready";
  }

  return getTaskStatusClassName(status);
};

const getTaskDisplayValue = (value) => value || "-";

const buildTaskTicketFields = (task = {}) => ({
  assignee: getTaskAssignee(task),
  dueDate: getTaskDueDate(task),
  doneDefinition: getTaskDoneDefinition(task),
  ticketStatus: normalizeTaskTicketStatus(task),
  ticketNote: getTaskTicketNote(task)
});

const buildTaskTicketStatusUpdate = (ticketStatus) => {
  const normalizedTicketStatus = TASK_TICKET_STATUS_OPTIONS.some((option) => option.value === ticketStatus)
    ? ticketStatus
    : "backlog";
  const updatePayload = {
    ticketStatus: normalizedTicketStatus,
    updatedAt: serverTimestamp()
  };

  if (normalizedTicketStatus === "doing") {
    updatePayload.status = "doing";
    updatePayload.isCompleted = false;
    updatePayload.completedAt = null;
  } else if (normalizedTicketStatus === "done") {
    updatePayload.status = "done";
    updatePayload.isCompleted = true;
    updatePayload.completedAt = serverTimestamp();
  } else {
    updatePayload.status = "todo";
    updatePayload.isCompleted = false;
    updatePayload.completedAt = null;
  }

  return updatePayload;
};

const buildTaskGenerationRequestBody = (kpi) => ({
  kgiId,
  kgiName: currentKgiData?.name ?? "",
  kgiGoalText: currentKgiData?.goalText ?? "",
  kpiId: typeof kpi?.id === "string" ? kpi.id : "",
  kpiName: typeof kpi?.name === "string" ? kpi.name.trim() : "",
  kpiDescription: typeof kpi?.description === "string" ? kpi.description.trim() : "",
  kpiType: kpi?.kpiType === "action" ? "action" : "result",
  targetValue: parsePositiveNumber(kpi?.targetValue ?? kpi?.target, 0),
  phaseId: typeof kpi?.phaseId === "string" ? kpi.phaseId : "",
  phaseName: getPhaseLabel(kpi?.phaseId, currentRoadmapPhases),
  recentReflections: buildRecentReflections(latestRenderedKpis, { preferredKpiId: kpi?.id, limit: 5 })
});

const requestGeneratedTasksForKpi = async (kpi) => {
  const response = await fetch("/api/generate-tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildTaskGenerationRequestBody(kpi))
  });

  const responseText = await response.text();
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse /api/generate-tasks response as JSON", parseError, responseText);
    }
  }

  if (!response.ok) {
    const apiErrorMessage = typeof data?.error === "string" && data.error.trim()
      ? data.error.trim()
      : responseText.trim() || `HTTP ${response.status}`;
    throw new Error(apiErrorMessage);
  }

  return Array.isArray(data?.tasks) ? data.tasks : [];
};

const saveGeneratedTaskForKpi = async (kpiId, suggestion, order = 0) => {
  await addDoc(
    getTasksRef(kpiId),
    normalizeGeneratedTaskDraft(suggestion, kpiId, order, "AIが自動生成した最初のNext Actionです")
  );
};

const ensureMinimumTasksForKpis = async (kpis) => {
  const kpisNeedingTasks = (Array.isArray(kpis) ? kpis : []).filter((kpi) => !Array.isArray(kpi?.tasks) || kpi.tasks.length === 0);

  if (kpisNeedingTasks.length === 0) {
    return { generatedCount: 0, failedKpiNames: [] };
  }

  const failedKpiNames = [];
  let generatedCount = 0;

  for (const kpi of kpisNeedingTasks) {
    try {
      const suggestions = await requestGeneratedTasksForKpi(kpi);
      const firstSuggestion = Array.isArray(suggestions)
        ? suggestions.find((item) => [item?.title, item?.kpi, item?.text].some((value) => displaySuggestionText(value) !== "-"))
        : null;

      if (!firstSuggestion) {
        throw new Error("Task候補が空でした");
      }

      await saveGeneratedTaskForKpi(kpi.id, firstSuggestion, 0);
      const kpiSnapshot = await getDoc(getKpiRef(kpi.id));
      const kpiData = kpiSnapshot.exists() ? kpiSnapshot.data() : { target: 100 };
      await syncKpiProgressFromTasks(kpi.id, kpiData);
      generatedCount += 1;
    } catch (error) {
      console.error("Failed to auto-generate minimum task", {
        kpiId: kpi?.id,
        kpiName: typeof kpi?.name === "string" ? kpi.name.trim() : "",
        requestBody: buildTaskGenerationRequestBody(kpi),
        error
      });
      failedKpiNames.push(typeof kpi?.name === "string" && kpi.name.trim() ? kpi.name.trim() : "名称未設定KPI");
    }
  }

  return { generatedCount, failedKpiNames };
};

const getCandidateTasksForCurrentPhase = (kpis, phases = currentRoadmapPhases) => {
  const normalizedKpis = Array.isArray(kpis) ? kpis : [];
  const currentPhase = getCurrentRoadmapPhase(phases);
  const currentPhaseId = typeof currentPhase?.id === "string" ? currentPhase.id.trim() : "";

  const buildCandidates = (targetKpis, reason) => targetKpis.flatMap((kpi) => {
    const firstIncompleteTask = getFirstIncompleteTaskForKpi(kpi);
    const phaseId = typeof kpi?.phaseId === "string" ? kpi.phaseId.trim() : "";
    const phaseMeta = resolvePhaseMetadata(phaseId, phases);

    if (!firstIncompleteTask) {
      return [];
    }

    return [{
      task: firstIncompleteTask,
      kpiId: kpi.id,
      kpiName: kpi.name ?? "",
      kpiType: kpi?.kpiType === "action" ? "action" : "result",
      phaseId: phaseMeta.phaseId,
      phaseName: phaseMeta.phaseName || getPhaseLabel(phaseId, phases),
      phaseNumber: phaseMeta.phaseNumber,
      selectionReason: reason
    }];
  });

  if (currentPhaseId) {
    const currentPhaseKpis = normalizedKpis.filter((kpi) => String(kpi?.phaseId ?? "").trim() === currentPhaseId);
    const currentPhaseCandidates = buildCandidates(currentPhaseKpis, "current_phase");

    if (currentPhaseCandidates.length > 0) {
      return currentPhaseCandidates;
    }
  }

  return buildCandidates(normalizedKpis, currentPhaseId ? "fallback_all_phases" : "no_current_phase");
};

const getNextAction = (kpis, phases = currentRoadmapPhases) => {
  const candidates = getCandidateTasksForCurrentPhase(kpis, phases);
  return candidates.length > 0 ? candidates[0] : null;
};

const selectNextAction = (kpis, phases = currentRoadmapPhases) => getNextAction(kpis, phases);

const getTaskStatusLabel = (status) => {
  if (status === "doing") {
    return "実行中";
  }

  if (status === "done") {
    return "完了";
  }

  return "未着手";
};

const getTaskStatusClassName = (status) => {
  if (status === "doing") {
    return "doing";
  }

  if (status === "done") {
    return "done";
  }

  return "todo";
};

const getTaskActionableStatus = (task) => {
  const rawStatus = typeof task?.status === "string" ? task.status.trim().toLowerCase() : "";

  if (rawStatus === "doing") {
    return "doing";
  }

  if (rawStatus === "done" || rawStatus === "completed") {
    return "done";
  }

  return getTaskIsCompleted(task) ? "done" : "todo";
};

const getFirstIncompleteTaskForKpi = (kpi) => {
  const tasks = sortTasks(Array.isArray(kpi?.tasks) ? kpi.tasks : []);
  return tasks.find((task) => normalizeTaskTicketStatus(task) !== "done" && !getTaskIsCompleted(task)) ?? null;
};

const getKpiListStatus = (kpi) => {
  if (isCompletedKpi(kpi)) {
    return "completed";
  }

  const tasks = Array.isArray(kpi?.tasks) ? kpi.tasks : [];
  const hasDoingTask = tasks.some((task) => getTaskActionableStatus(task) === "doing");
  const hasCompletedTask = tasks.some((task) => getTaskIsCompleted(task));

  if (hasDoingTask || displayProgress(kpi) > 0 || hasCompletedTask) {
    return "in_progress";
  }

  return "not_started";
};

const getKpiListPriority = (kpi) => {
  const status = getKpiListStatus(kpi);

  if (status === "in_progress") {
    return 0;
  }

  if (status === "not_started") {
    return 1;
  }

  return 2;
};

const compareRecommendedKpis = (a, b) => {
  const aHasTasks = Array.isArray(a?.tasks) && a.tasks.length > 0 ? 0 : 1;
  const bHasTasks = Array.isArray(b?.tasks) && b.tasks.length > 0 ? 0 : 1;

  if (aHasTasks !== bHasTasks) {
    return aHasTasks - bHasTasks;
  }

  const aHasDoingTask = Array.isArray(a?.tasks) && a.tasks.some((task) => getTaskActionableStatus(task) === "doing") ? 0 : 1;
  const bHasDoingTask = Array.isArray(b?.tasks) && b.tasks.some((task) => getTaskActionableStatus(task) === "doing") ? 0 : 1;

  if (aHasDoingTask !== bHasDoingTask) {
    return aHasDoingTask - bHasDoingTask;
  }

  return getKpiListPriority(a) - getKpiListPriority(b);
};

const getPrimaryTaskButtonLabel = (kpi, isTaskFormOpen = false) => {
  const tasks = Array.isArray(kpi?.tasks) ? kpi.tasks : [];
  return tasks.length > 0
    ? "Taskを見る"
    : (isTaskFormOpen ? "Task入力を閉じる" : "最初のTaskを作る");
};

const renderPhaseRecommendedKpi = (kpis) => {
  if (!phaseRecommendedKpiContainer || !isPhasePage) {
    return;
  }

  const recommendedKpi = [...(Array.isArray(kpis) ? kpis : [])]
    .filter((kpi) => !isCompletedKpi(kpi))
    .sort(compareRecommendedKpis)[0] ?? null;

  if (!recommendedKpi) {
    phaseRecommendedKpiContainer.innerHTML = '<p class="next-action-empty">今おすすめできる未完了KPIはありません。</p>';
    return;
  }

  const tasks = Array.isArray(recommendedKpi.tasks) ? recommendedKpi.tasks : [];
  const simpleName = getSimpleName(recommendedKpi) || recommendedKpi.name || "-";
  const simpleDescription = getSimpleDescription(recommendedKpi) || recommendedKpi.description || "このKPIから着手すると進めやすいです。";
  const kpiStatus = getKpiListStatus(recommendedKpi);
  const statusLabel = kpiStatus === "in_progress" ? "進行中" : "未着手";
  const statusClassName = kpiStatus === "in_progress" ? "doing" : "todo";

  phaseRecommendedKpiContainer.innerHTML = `
    <p class="next-action-title">${escapeHtml(simpleName)}</p>
    <p class="next-action-inline-status">${escapeHtml(displayDescription(simpleDescription))}</p>
    <div class="next-action-status-row">
      <span class="status-badge ${statusClassName}">${statusLabel}</span>
      <span class="status-badge">Task ${tasks.length}件</span>
      <span class="status-badge">進捗 ${formatPercent(displayProgress(recommendedKpi))}</span>
    </div>
    <div class="next-action-actions">
      <button class="button" type="button" data-kpi-primary-action="${recommendedKpi.id}">${getPrimaryTaskButtonLabel(recommendedKpi)}</button>
    </div>
  `;
};

const NEXT_ACTION_STEP_LABELS = ["まずやる", "次にやる", "その次"];
const FALLBACK_NEXT_ACTION_STEPS = [
  "まずやる：Taskの内容を1回読み、最初に触る対象を1つ決める",
  "次にやる：必要な作業を3つの短い行動に分けて1行ずつメモする",
  "その次：分けた作業の1件目を5分だけ進める"
];

const sanitizeNextActionSteps = (steps) => {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step) => typeof step === "string" ? step.replace(/\s+/g, " ").trim() : "")
    .filter((step) => step.length > 0)
    .slice(0, 3);
};

const ensureNextActionStepLabel = (step, index) => {
  const normalizedStep = typeof step === "string" ? step.trim() : "";
  if (!normalizedStep) {
    return "";
  }

  if (/^(まずやる|次にやる|その次)[:：]/.test(normalizedStep)) {
    return normalizedStep;
  }

  return `${NEXT_ACTION_STEP_LABELS[index] || `手順${index + 1}`}：${normalizedStep}`;
};

const buildContextualFallbackNextActionSteps = (title) => {
  const normalizedTitle = typeof title === "string" ? title.trim().toLowerCase() : "";

  if (/(qa|テスト|試験|検証)/i.test(normalizedTitle)) {
    return [
      "まずやる：テスト対象を1件だけ決めて開く",
      "次にやる：再現手順を1回だけ試す",
      "その次：結果を1行メモする"
    ];
  }

  if (/(pr|実装|修正|開発)/i.test(normalizedTitle)) {
    return [
      "まずやる：対象ファイルを1つ開く",
      "次にやる：直す内容を1行でメモする",
      "その次：最初の修正を1つ入れる"
    ];
  }

  if (/(営業|顧客|商談|リード)/i.test(normalizedTitle)) {
    return [
      "まずやる：候補を5件だけ集める",
      "次にやる：候補を一覧に貼り付ける",
      "その次：1件だけ送る文を作る"
    ];
  }

  return FALLBACK_NEXT_ACTION_STEPS.slice();
};

const getFallbackNextActionSteps = (reason, taskTitle = currentNextAction?.task?.title ?? "") => {
  const fallbackSteps = buildContextualFallbackNextActionSteps(taskTitle);
  console.warn("Using fallback next action steps", { reason, taskTitle, fallbackSteps });
  return fallbackSteps;
};

const setNextActionState = ({
  nextAction = currentNextAction,
  loading = nextActionLoading,
  error = nextActionError,
  stepLoading = nextActionStepLoading,
  stepError = nextActionStepError,
  steps = nextActionSteps
} = {}) => {
  currentNextAction = nextAction ?? null;
  nextActionLoading = Boolean(loading);
  nextActionError = typeof error === "string" ? error : "";
  nextActionStepLoading = Boolean(stepLoading);
  nextActionStepError = typeof stepError === "string" ? stepError : "";
  nextActionSteps = sanitizeNextActionSteps(steps);
};

const renderNextAction = (nextAction) => {
  if (!nextActionContainer) {
    return;
  }

  if (nextAction !== undefined) {
    currentNextAction = nextAction ?? null;
  }

  if (!currentNextAction) {
    nextActionContainer.innerHTML = nextActionError
      ? `<p class="next-action-empty">${escapeHtml(nextActionError)}</p>`
      : '<p class="next-action-empty">今やるべきことを準備中です。KPIからNext Actionを作成しています...</p>';
    return;
  }

  const { task, kpiName, phaseName } = currentNextAction;
  const deadline = displayDeadline(getTaskDueDate(task) || task.deadline);
  const remaining = calcRemainingDays(deadline === "未設定" ? "" : deadline);
  const taskStatus = getTaskActionableStatus(task);
  const canStart = taskStatus === "todo" && !getTaskIsCompleted(task) && !nextActionLoading;
  const canComplete = (taskStatus === "todo" || taskStatus === "doing") && !getTaskIsCompleted(task) && !nextActionLoading;
  const loadingMarkup = nextActionLoading
    ? '<p class="next-action-inline-status">更新中...</p>'
    : taskStatus === "doing"
      ? '<p class="next-action-inline-status">実行中です。完了したら「完了する」を押してください。</p>'
      : "";
  const fallbackStepListMarkup = `<ol class="next-action-step-list">${getFallbackNextActionSteps(nextActionStepError ? "render_error" : "render_missing_steps", task.title ?? "").map((step) => `<li>${step}</li>`).join("")}</ol>`;
  const stepContent = nextActionStepLoading
    ? '<p class="hint">小ステップを準備中...</p>'
    : nextActionStepError
      ? `<div><p class="hint">${nextActionStepError}</p>${fallbackStepListMarkup}</div>`
      : nextActionSteps.length > 0
        ? `<ol class="next-action-step-list">${nextActionSteps.map((step, index) => `<li>${ensureNextActionStepLabel(step, index)}</li>`).join("")}</ol>`
        : fallbackStepListMarkup;
  const errorMarkup = nextActionError
    ? `<p class="hint error">${nextActionError}</p>`
    : "";

  nextActionContainer.innerHTML = `
    ${errorMarkup}
    <p class="next-action-title">${task.title ?? "-"}</p>
    <p class="next-action-inline-status">${displayDescription(task.description)}<br>対象KPI: ${kpiName || "-"} / フェーズ: ${phaseName || "未分類"} / ${remaining.remainingText}</p>
    <div class="next-action-status-row"><span class="status-badge ${getTaskStatusClassName(taskStatus)}">${getTaskStatusLabel(taskStatus)}</span></div>
    <div class="next-action-actions">
      ${canStart ? '<button class="button" type="button" data-next-action-action="start">実行する</button>' : ""}
      ${canComplete ? '<button class="button success" type="button" data-next-action-action="complete">完了する</button>' : ""}
      ${taskStatus === "doing" ? '<span class="status-badge doing">実行中</span>' : ""}
    </div>
    ${loadingMarkup}
    <div class="next-action-step-panel">
      <h3 class="next-action-step-title">今すぐやる小ステップ</h3>
      ${stepContent}
    </div>
  `;
};

const hashNextActionStepContext = (...parts) => parts
  .map((part) => typeof part === "string" ? part.trim() : "")
  .join("|")
  .split("")
  .reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) % 1000000007, 7)
  .toString(16);

const NEXT_ACTION_DIFFICULTY_KEYWORDS = ["難しい", "分からない", "わからない", "専門用語", "大変"];
const isNextActionCommentDifficult = (comment) => NEXT_ACTION_DIFFICULTY_KEYWORDS.some((keyword) => comment.includes(keyword));
const buildNextActionAdaptationHints = (recentReflections = []) => {
  const hintSet = new Set();

  (Array.isArray(recentReflections) ? recentReflections : []).forEach((reflection) => {
    const comment = typeof reflection?.comment === "string" ? reflection.comment.trim() : "";
    const result = typeof reflection?.result === "string" ? reflection.result : "";
    const hasDifficultySignal = result === "harder_than_expected" || isNextActionCommentDifficult(comment);

    if (hasDifficultySignal) {
      hintSet.add("専門用語を減らす");
      hintSet.add("小さなステップに分ける");
      hintSet.add("説明を増やす");
    }

    if (result === "could_not_do") {
      hintSet.add("準備タスクから始める");
      hintSet.add("一度に要求する作業量を減らす");
    }

    if (result === "needs_improvement") {
      hintSet.add("順番を明確にする");
      hintSet.add("曖昧な表現を避ける");
    }
  });

  return Array.from(hintSet).slice(0, 5);
};

const buildNextActionReflectionSignature = (recentReflections) => JSON.stringify(
  Array.isArray(recentReflections)
    ? recentReflections.map((reflection) => ({
      taskTitle: typeof reflection?.taskTitle === "string" ? reflection.taskTitle.trim() : "",
      result: typeof reflection?.result === "string" ? reflection.result : "",
      comment: typeof reflection?.comment === "string" ? reflection.comment.trim() : ""
    }))
    : []
);

const buildNextActionStepCacheContext = (nextAction, recentReflections = []) => {
  const taskId = typeof nextAction?.task?.id === "string" ? nextAction.task.id : "";
  const taskTitle = typeof nextAction?.task?.title === "string" ? nextAction.task.title.trim() : "";
  const taskDescription = typeof nextAction?.task?.description === "string" ? nextAction.task.description.trim() : "";
  const adaptationHints = buildNextActionAdaptationHints(recentReflections);
  const simpleHash = hashNextActionStepContext(taskTitle, taskDescription, adaptationHints.join("|"));
  const reflectionSignature = buildNextActionReflectionSignature(recentReflections);

  return {
    taskId,
    taskTitle,
    taskDescription,
    reflectionSignature,
    simpleHash,
    requestKey: taskId ? `${taskId}:${simpleHash}` : "",
    storageKey: taskId ? `nextActionMiniSteps:${taskId}:${simpleHash}` : ""
  };
};

const buildNextActionStepRequestKey = (nextAction, recentReflections = buildRecentReflections(latestRenderedKpis, { preferredKpiId: nextAction?.kpiId, limit: 5 })) => {
  const cacheContext = buildNextActionStepCacheContext(nextAction, recentReflections);
  return cacheContext.requestKey;
};


const isFallbackNextActionSteps = (steps) => {
  const normalizedSteps = sanitizeNextActionSteps(steps);
  return normalizedSteps.length === FALLBACK_NEXT_ACTION_STEPS.length
    && normalizedSteps.every((step, index) => step === FALLBACK_NEXT_ACTION_STEPS[index]);
};

const readCachedNextActionSteps = ({ storageKey, taskId }) => {
  if (!storageKey || !taskId) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);

    if (!raw) {
      console.log("[next-action-steps] cache miss", { taskId, storageKey, cacheSource: "none" });
      return null;
    }

    const parsed = JSON.parse(raw);
    const steps = sanitizeNextActionSteps(parsed?.steps);
    const cacheSource = parsed?.source === "normal" ? "normal" : parsed?.source === "fallback" ? "fallback" : "legacy";
    const fallbackCached = cacheSource === "fallback" || isFallbackNextActionSteps(steps);

    if (parsed?.taskId !== taskId || steps.length < 3) {
      window.sessionStorage.removeItem(storageKey);
      console.log("[next-action-steps] cache miss", { taskId, storageKey, cacheSource, reason: "invalid_payload" });
      return null;
    }

    if (fallbackCached) {
      window.sessionStorage.removeItem(storageKey);
      console.log("[next-action-steps] cache miss", { taskId, storageKey, cacheSource, reason: "fallback_cache_invalidated" });
      return null;
    }

    console.log("[next-action-steps] cache hit", { taskId, storageKey, cacheSource });
    return {
      taskId,
      steps,
      source: cacheSource,
      updatedAt: typeof parsed?.updatedAt === "number" ? parsed.updatedAt : Date.now()
    };
  } catch (error) {
    console.error("Failed to read next action steps cache", error);
    return null;
  }
};

const writeCachedNextActionSteps = ({ storageKey, taskId, steps, source = "normal" }) => {
  const normalizedSteps = sanitizeNextActionSteps(steps);
  const cacheSource = source === "fallback" ? "fallback" : "normal";

  if (!storageKey || !taskId || normalizedSteps.length < 3) {
    console.log("[next-action-steps] cache skip", { taskId, storageKey, cacheSource, reason: "invalid_payload" });
    return;
  }

  if (cacheSource === "fallback" || isFallbackNextActionSteps(normalizedSteps)) {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.error("Failed to clear fallback next action step cache", error);
    }
    console.log("[next-action-steps] cache skip", { taskId, storageKey, cacheSource, reason: "fallback_not_cached", stepsCount: normalizedSteps.length });
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({
      taskId,
      steps: normalizedSteps,
      source: cacheSource,
      updatedAt: Date.now()
    }));
    console.log("[next-action-steps] cache write", { taskId, storageKey, cacheSource, stepsCount: normalizedSteps.length });
  } catch (error) {
    console.error("Failed to persist next action step cache", error);
  }
};

const generateNextActionSteps = async (nextAction) => {
  const recentReflections = buildRecentReflections(latestRenderedKpis, { preferredKpiId: nextAction?.kpiId, limit: 5 });
  const cacheContext = buildNextActionStepCacheContext(nextAction, recentReflections);
  const { requestKey, storageKey, taskId } = cacheContext;

  if (!nextAction?.task?.title || !nextAction?.kpiName) {
    const fallbackSteps = getFallbackNextActionSteps("missing_task_context", nextAction?.task?.title ?? "");
    console.log("[next-action-steps] api call", { taskId, requestKey, willCallApi: false, reason: "missing_task_context" });
    setNextActionState({
      nextAction,
      stepLoading: false,
      stepError: "代替ステップを表示しています。",
      steps: fallbackSteps
    });
    renderNextAction();
    return;
  }

  const cached = readCachedNextActionSteps({ storageKey, taskId });

  if (cached?.steps?.length >= 3) {
    latestNextActionStepRequestKey = requestKey;
    setNextActionState({
      nextAction,
      stepLoading: false,
      stepError: isFallbackNextActionSteps(cached.steps) ? "代替ステップを表示しています。" : "",
      steps: cached.steps
    });
    console.log("[next-action-steps] received steps", { taskId, requestKey, stepsCount: cached.steps.length, source: cached.source || "normal", fromCache: true });
    renderNextAction();
    return;
  }

  if (requestKey && latestNextActionStepRequestKey === requestKey && (nextActionStepLoading || nextActionSteps.length > 0 || nextActionStepError)) {
    console.log("[next-action-steps] skip duplicate request", { taskId, requestKey });
    renderNextAction();
    return;
  }

  latestNextActionStepRequestKey = requestKey;
  setNextActionState({
    nextAction,
    stepLoading: true,
    stepError: "",
    steps: []
  });
  renderNextAction();

  console.log("[next-action-steps] api call", { taskId, requestKey, willCallApi: true, cacheSource: cached?.source ?? "none" });

  try {
    const response = await fetch("/api/generate-next-action-steps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        taskTitle: nextAction.task.title ?? "",
        taskDescription: nextAction.task.description ?? "",
        kpiName: nextAction.kpiName ?? "",
        recentReflections
      })
    });

    const responseText = await response.text();
    let data = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse /api/generate-next-action-steps response as JSON", parseError, responseText);
      }
    }

    if (latestNextActionStepRequestKey !== requestKey) {
      return;
    }

    const nextSteps = sanitizeNextActionSteps(data?.steps).map((step, index) => ensureNextActionStepLabel(step, index));
    const resolvedSteps = nextSteps.length >= 3 ? nextSteps : getFallbackNextActionSteps(response.ok ? "api_missing_steps" : `http_${response.status}`, nextAction.task.title ?? "");
    const cacheSource = isFallbackNextActionSteps(resolvedSteps) ? "fallback" : "normal";
    const fallbackMessage = cacheSource === "fallback"
      ? "小ステップの自動生成に失敗したため、代替ステップを表示しています。"
      : "";

    console.log("[next-action-steps] received steps", { taskId, requestKey, stepsCount: resolvedSteps.length, source: cacheSource, fromCache: false, responseOk: response.ok });

    if (storageKey && taskId) {
      writeCachedNextActionSteps({ storageKey, taskId, steps: resolvedSteps, source: cacheSource });
    }

    setNextActionState({
      nextAction,
      stepLoading: false,
      stepError: fallbackMessage,
      steps: resolvedSteps
    });
  } catch (error) {
    console.error(error);

    if (latestNextActionStepRequestKey !== requestKey) {
      return;
    }

    const fallbackSteps = getFallbackNextActionSteps("fetch_error", nextAction.task.title ?? "");
    console.log("[next-action-steps] received steps", { taskId, requestKey, stepsCount: fallbackSteps.length, source: "fallback", fromCache: false, responseOk: false });
    if (storageKey && taskId) {
      writeCachedNextActionSteps({ storageKey, taskId, steps: fallbackSteps, source: "fallback" });
    }
    setNextActionState({
      nextAction,
      stepLoading: false,
      stepError: "小ステップの自動生成に失敗したため、代替ステップを表示しています。",
      steps: fallbackSteps
    });
  }

  renderNextAction();
};

const getTaskProgressValue = (task) => parsePositiveNumber(task.progressValue, 0);

const getTaskCompletedCount = (task) => {
  const completedCount = parsePositiveNumber(task.completedCount, 0);
  return Math.floor(completedCount);
};

const getTaskIsCompleted = (task) => {
  if (typeof task.isCompleted === "boolean") {
    return task.isCompleted;
  }

  if (typeof task.isCompleted === "string") {
    return task.isCompleted === "true";
  }

  if (typeof task.completed === "boolean") {
    return task.completed;
  }

  if (typeof task.completionStatus === "string") {
    return task.completionStatus === "completed";
  }

  return task.status === "done" || task.status === "completed";
};

const normalizeTaskCheckStatus = (task) => task?.checkStatus === "checked" ? "checked" : "not_checked";

const normalizeTaskCheckResult = (task) => {
  const rawValue = typeof task?.checkResult === "string" ? task.checkResult.trim() : "";
  return TASK_CHECK_RESULT_OPTIONS.some((option) => option.value === rawValue) ? rawValue : "";
};

const getTaskCheckComment = (task) => typeof task?.checkComment === "string" ? task.checkComment : "";

const getTaskCheckRecordedAt = (task) => task?.checkRecordedAt ?? null;

const getComparableTimestamp = (value) => {
  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return 0;
};

const getReflectionSortTime = (task) => {
  const recordedAt = getComparableTimestamp(task?.checkRecordedAt ?? null);

  if (recordedAt > 0) {
    return recordedAt;
  }

  const updatedAt = getComparableTimestamp(task?.updatedAt ?? null);

  if (updatedAt > 0) {
    return updatedAt;
  }

  return getComparableTimestamp(task?.createdAt ?? null);
};

const buildRecentReflections = (kpis, options = {}) => {
  const preferredKpiId = typeof options?.preferredKpiId === "string" ? options.preferredKpiId : "";
  const normalizedKpis = Array.isArray(kpis) ? kpis : [];
  const matchedReflections = [];
  const fallbackReflections = [];

  normalizedKpis.forEach((kpi) => {
    const tasks = Array.isArray(kpi?.tasks) ? kpi.tasks : [];

    tasks.forEach((task) => {
      const result = normalizeTaskCheckResult(task);

      if (!getTaskIsCompleted(task) || normalizeTaskCheckStatus(task) !== "checked" || !result) {
        return;
      }

      const reflection = {
        taskTitle: typeof task?.title === "string" ? task.title.trim() : "",
        result,
        comment: getTaskCheckComment(task).trim(),
        sortTime: getReflectionSortTime(task)
      };

      if (!reflection.taskTitle) {
        return;
      }

      if (preferredKpiId && kpi?.id === preferredKpiId) {
        matchedReflections.push(reflection);
        return;
      }

      fallbackReflections.push(reflection);
    });
  });

  const sortByLatest = (items) => items.sort((left, right) => right.sortTime - left.sortTime);
  const primaryReflections = sortByLatest(matchedReflections).slice(0, 3);
  const fallbackLimit = primaryReflections.length > 0 ? 0 : 2;
  const secondaryReflections = sortByLatest(fallbackReflections).slice(0, fallbackLimit);

  return [...primaryReflections, ...secondaryReflections].map(({ taskTitle, result, comment }) => ({
    taskTitle,
    result,
    comment
  }));
};

const isTaskCheckAvailable = (task) => getTaskIsCompleted(task);

const getTaskCheckUiState = (task) => {
  const taskId = task?.id ?? "";
  const storedState = taskCheckUiState[taskId] ?? {};
  const hasSavedCheck = normalizeTaskCheckStatus(task) === "checked";
  const baseState = {
    isEditing: !hasSavedCheck,
    isSaving: false,
    error: "",
    result: normalizeTaskCheckResult(task),
    comment: getTaskCheckComment(task)
  };

  return {
    ...baseState,
    ...storedState,
    result: typeof storedState.result === "string" ? storedState.result : baseState.result,
    comment: typeof storedState.comment === "string" ? storedState.comment : baseState.comment
  };
};

const setTaskCheckUiState = (taskId, nextPartialState) => {
  taskCheckUiState = {
    ...taskCheckUiState,
    [taskId]: {
      ...(taskCheckUiState[taskId] ?? {}),
      ...nextPartialState
    }
  };
};

const clearTaskCheckUiState = (taskId) => {
  const nextState = { ...taskCheckUiState };
  delete nextState[taskId];
  taskCheckUiState = nextState;
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const getTaskCheckResultLabel = (result) => {
  const matched = TASK_CHECK_RESULT_OPTIONS.find((option) => option.value === result);
  return matched ? matched.label : "-";
};

const renderTaskCheckSection = (kpiIdForTask, task) => {
  if (!isTaskCheckAvailable(task)) {
    return "";
  }

  const taskId = task?.id ?? "";
  const checkStatus = normalizeTaskCheckStatus(task);
  const savedResult = normalizeTaskCheckResult(task);
  const savedComment = getTaskCheckComment(task).trim();
  const recordedAt = getTaskCheckRecordedAt(task);
  const uiState = getTaskCheckUiState(task);
  const resultOptionsMarkup = TASK_CHECK_RESULT_OPTIONS.map((option) => `
    <label class="task-check-option">
      <input
        type="radio"
        name="checkResult-${taskId}"
        value="${option.value}"
        ${uiState.result === option.value ? "checked" : ""}
        ${uiState.isSaving ? "disabled" : ""}
      />
      <span>${option.label}</span>
    </label>
  `).join("");
  const errorMarkup = uiState.error
    ? `<p class="hint error">${escapeHtml(uiState.error)}</p>`
    : "";
  const savedMarkup = checkStatus === "checked" && !uiState.isEditing
    ? `
      <div class="task-check-saved">
        <p class="task-check-badge">振り返り済み</p>
        <div class="task-check-saved-item"><strong>結果</strong><span>${escapeHtml(getTaskCheckResultLabel(savedResult))}</span></div>
        <div class="task-check-saved-item"><strong>改善メモ</strong><span>${escapeHtml(savedComment || "（未入力）")}</span></div>
        <div class="task-check-saved-item"><strong>記録日時</strong><span>${escapeHtml(formatDate(recordedAt))}</span></div>
        <button class="button ghost task-check-edit-button" type="button" data-task-check-edit="${taskId}">編集する</button>
      </div>
    `
    : "";
  const formMarkup = checkStatus !== "checked" || uiState.isEditing
    ? `
      <form class="task-check-form" data-kpi-id="${kpiIdForTask}" data-task-id="${taskId}">
        <div class="task-check-field">
          <span class="task-check-label">結果</span>
          <div class="task-check-options">
            ${resultOptionsMarkup}
          </div>
        </div>
        <label class="task-check-field">
          <span class="task-check-label">次に変えること</span>
          <textarea
            name="checkComment"
            rows="2"
            placeholder="例: 先に画面数を3枚に絞る"
            ${uiState.isSaving ? "disabled" : ""}
          >${escapeHtml(uiState.comment)}</textarea>
        </label>
        <p class="hint">結果は必須です。改善メモは任意です。</p>
        ${errorMarkup}
        <div class="task-check-actions">
          <button class="button" type="submit" ${uiState.isSaving ? "disabled" : ""}>${uiState.isSaving ? "保存中..." : "振り返りを保存"}</button>
        </div>
      </form>
    `
    : "";

  return `
    <div class="task-check-panel">
      <h4 class="task-check-title">完了メモ</h4>
      ${savedMarkup}
      ${formMarkup}
    </div>
  `;
};

const calculateTaskContributedValue = (task) => {
  const taskType = normalizeTaskType(task.type);
  const progressValue = getTaskProgressValue(task);

  if (taskType === "repeatable") {
    const contributedValue = getTaskCompletedCount(task) * progressValue;
    console.log("[task contributedValue]", {
      id: task.id ?? "",
      title: task.title ?? "",
      type: taskType,
      isCompleted: getTaskIsCompleted(task),
      progressValue,
      contributedValue
    });
    return contributedValue;
  }

  const isCompleted = getTaskIsCompleted(task);
  const contributedValue = isCompleted ? 1 : 0;

  console.log("[task contributedValue]", {
    id: task.id ?? "",
    title: task.title ?? "",
    type: taskType,
    isCompleted,
    progressValue,
    contributedValue
  });

  return contributedValue;
};

const displayProgress = (kpi) => {
  const progress = Number(kpi.progress ?? kpi.percentage);

  if (!Number.isFinite(progress)) {
    return 0;
  }

  return clampPercent(progress);
};

const isCompletedKpi = (kpi) => {
  if (!kpi || isArchivedKpi(kpi)) {
    return false;
  }

  if (displayProgress(kpi) >= 100) {
    return true;
  }

  const tasks = Array.isArray(kpi.tasks) ? kpi.tasks : [];
  return tasks.length > 0 && tasks.every((task) => getTaskIsCompleted(task));
};

const renderOverallProgress = (kpis) => {
  if (!overallProgressValue || !overallProgressFill || !overallProgressCaption) {
    return;
  }

  if (kpis.length === 0) {
    overallProgressValue.textContent = "0%";
    overallProgressFill.style.width = "0%";
    overallProgressCaption.textContent = "KPIがありません";
    return;
  }

  const total = kpis.reduce((sum, kpi) => sum + displayProgress(kpi), 0);
  const average = total / kpis.length;
  const safeAverage = clampPercent(average);

  overallProgressValue.textContent = formatPercent(safeAverage);
  overallProgressFill.style.width = `${safeAverage}%`;
  overallProgressCaption.textContent = `${kpis.length}件のKPI平均`;
};

const renderKpiSummary = (kpis = [], allKpis = kpis) => {
  if (!kpiSummaryStats) {
    return;
  }

  const visibleItems = Array.isArray(kpis) ? kpis : [];
  const sourceItems = Array.isArray(allKpis) ? allKpis : visibleItems;
  const activeCount = sourceItems.filter(isActiveKpi).length;
  const archivedCount = sourceItems.filter(isArchivedKpi).length;
  const taskCount = visibleItems.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0);
  const averageProgress = visibleItems.length > 0
    ? clampPercent(visibleItems.reduce((sum, kpi) => sum + displayProgress(kpi), 0) / visibleItems.length)
    : 0;

  kpiSummaryStats.innerHTML = `
    <div class="kpi-summary-stat">
      <strong>表示中KPI</strong>
      <span>${visibleItems.length}件</span>
    </div>
    <div class="kpi-summary-stat">
      <strong>進行中</strong>
      <span>${activeCount}件</span>
    </div>
    <div class="kpi-summary-stat">
      <strong>Task総数</strong>
      <span>${taskCount}件</span>
    </div>
    <div class="kpi-summary-stat">
      <strong>平均進捗</strong>
      <span>${formatPercent(averageProgress)}</span>
    </div>
    <div class="kpi-summary-stat">
      <strong>アーカイブ</strong>
      <span>${archivedCount}件</span>
    </div>
  `;
};

const getKgisRef = () => collection(db, "kgis");
const getKgiRef = () => doc(getKgisRef(), kgiId);
const getNestedKpisRef = () => collection(db, "kgis", kgiId, "kpis");
const getRoutineTasksRef = () => collection(getKgiRef(), "routineTasks");
const getKpisRef = () => collection(db, "kpis");
const getKpisQuery = () => query(getKpisRef(), where("kgiId", "==", kgiId));
const getTasksRef = (kpiId) => collection(getKpisRef(), kpiId, "tasks");
const getKpiRef = (kpiId) => doc(getKpisRef(), kpiId);
const getKgiListPageUrl = () => "./list.html";

const redirectToKgiList = () => {
  window.location.replace(getKgiListPageUrl());
};

const buildKgiDocPath = (targetKgiId) => `kgis/${targetKgiId}`;

const archiveCurrentKgi = async () => {
  const targetKgiId = String(currentKgiData?.id ?? kgiId ?? "").trim();
  const targetDocPath = targetKgiId ? buildKgiDocPath(targetKgiId) : "kgis/(missing-id)";
  let verificationStarted = false;

  logArchiveFlow("archiveCurrentKgi entered", {
    targetKgiId,
    targetDocPath,
    hasCurrentKgiData: Boolean(currentKgiData),
    hasDb: Boolean(db),
    kgiId,
    archived: isArchivedKgi(currentKgiData),
    archiveKgiInFlight
  });

  updateArchiveDebugState({
    targetKgiId,
    targetCollectionPath: targetDocPath,
    archiveWriteStarted: true,
    archiveWriteSucceeded: false,
    archiveVerifySucceeded: false,
    lastErrorMessage: ""
  });

  if (!currentKgiData || !db || !kgiId || isArchivedKgi(currentKgiData) || archiveKgiInFlight) {
    const guardMessage = "archiveCurrentKgi の事前条件を満たさなかったため中断しました。";
    updateArchiveDebugState({
      lastErrorMessage: guardMessage
    });
    logArchiveFlow("update failed", { reason: guardMessage }, "warn");
    return;
  }

  archiveKgiInFlight = true;
  if (archiveSuccessMessageTimer) {
    window.clearTimeout(archiveSuccessMessageTimer);
    archiveSuccessMessageTimer = null;
  }
  setArchiveKgiStatus("KGIをアーカイブしています...");
  updateArchiveKgiButtonState({ ...currentKgiData, archived: true, status: "archived" });

  if (confirmArchiveKgiButton instanceof HTMLButtonElement) {
    confirmArchiveKgiButton.disabled = true;
  }

  if (archiveKgiButton instanceof HTMLButtonElement) {
    archiveKgiButton.disabled = true;
  }

  try {
    if (!targetKgiId) {
      throw new Error("KGI document id を取得できませんでした。");
    }

    updateArchiveDebugState({
      targetKgiId,
      targetCollectionPath: targetDocPath,
      archiveWriteStarted: true,
      archiveWriteSucceeded: false,
      archiveVerifySucceeded: false,
      lastErrorMessage: ""
    });

    logArchiveFlow("updating path: kgis/{id}", { kgiId: targetKgiId, path: targetDocPath });

    const targetKgiRef = doc(getKgisRef(), targetKgiId);

    await updateDoc(targetKgiRef, {
      archived: true,
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    updateArchiveDebugState({
      archiveWriteSucceeded: true
    });
    logArchiveFlow("update success", { path: targetDocPath });

    verificationStarted = true;
    const verifySnapshot = await getDoc(targetKgiRef);

    if (!verifySnapshot.exists()) {
      throw new Error(`アーカイブ確認に失敗しました: ${targetDocPath} が再読込時に存在しません。`);
    }

    const verifyData = verifySnapshot.data();
    const archivedVerified = verifyData?.archived === true;
    const statusVerified = verifyData?.status === "archived";

    if (!archivedVerified || !statusVerified) {
      throw new Error(`アーカイブ確認に失敗しました: archived=${String(verifyData?.archived)} status=${String(verifyData?.status ?? "")}`);
    }

    updateArchiveDebugState({
      archiveVerifySucceeded: true
    });
    logArchiveFlow("verify success", { path: targetDocPath });

    currentKgiData = {
      ...currentKgiData,
      id: targetKgiId,
      archived: true,
      status: "archived",
      archivedAt: verifyData?.archivedAt ?? currentKgiData?.archivedAt,
      updatedAt: verifyData?.updatedAt ?? currentKgiData?.updatedAt
    };

    if (archiveKgiDialog instanceof HTMLDialogElement && archiveKgiDialog.open) {
      archiveKgiDialog.close();
    }

    showArchiveSuccessThenRedirect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    updateArchiveDebugState({
      archiveWriteSucceeded: false,
      archiveVerifySucceeded: false,
      lastErrorMessage: message
    });
    logArchiveFlow(verificationStarted ? "verify failed" : "update failed", { path: targetDocPath, message, error }, "error");
    setArchiveKgiStatus(message, true);
    updateArchiveKgiButtonState(currentKgiData);
  } finally {
    archiveKgiInFlight = false;

    if (confirmArchiveKgiButton instanceof HTMLButtonElement) {
      confirmArchiveKgiButton.disabled = false;
    }

    if (archiveKgiButton instanceof HTMLButtonElement) {
      updateArchiveKgiButtonState(currentKgiData);
    }
  }
};

const persistKgiScheduleIfNeeded = async (kgiData = {}) => {
  const normalizedPhases = normalizeRoadmapPhases(kgiData?.roadmapPhases);
  const schedule = buildKgiSchedule(kgiData, normalizedPhases);
  const phasesWithSchedule = applyScheduleToRoadmapPhases(normalizedPhases, schedule);
  const existingStartDate = typeof kgiData?.startDate === "string" ? kgiData.startDate : "";
  const existingDeadline = typeof kgiData?.deadline === "string" ? kgiData.deadline : "";
  const needsStartDate = schedule.startDate !== existingStartDate;
  const needsDeadline = schedule.deadline !== existingDeadline;
  const needsPhaseDeadline = phasesWithSchedule.some((phase, index) => phase.deadline !== (normalizedPhases[index]?.deadline ?? ""));

  if (!needsStartDate && !needsDeadline && !needsPhaseDeadline) {
    return {
      ...kgiData,
      startDate: schedule.startDate,
      deadline: schedule.deadline,
      roadmapPhases: phasesWithSchedule
    };
  }

  await updateDoc(getKgiRef(), {
    startDate: schedule.startDate,
    deadline: schedule.deadline,
    roadmapPhases: phasesWithSchedule,
    updatedAt: serverTimestamp()
  });

  return {
    ...kgiData,
    startDate: schedule.startDate,
    deadline: schedule.deadline,
    roadmapPhases: phasesWithSchedule
  };
};

const updateKgiDeadline = async (deadline) => {
  if (!currentKgiData || !db || !kgiId) {
    return;
  }

  const deadlineCandidate = parseDeadline(deadline)
    ? deadline
    : buildKgiSchedule(currentKgiData, currentRoadmapPhases).deadline;
  const schedule = buildKgiSchedule({ ...currentKgiData, deadline: deadlineCandidate }, currentRoadmapPhases);
  const phasesWithSchedule = applyScheduleToRoadmapPhases(currentRoadmapPhases, schedule);

  if (saveKgiDeadlineButton) {
    saveKgiDeadlineButton.disabled = true;
  }

  try {
    await updateDoc(getKgiRef(), {
      startDate: schedule.startDate,
      deadline: schedule.deadline,
      roadmapPhases: phasesWithSchedule,
      updatedAt: serverTimestamp()
    });

    renderKgiMeta({
      ...currentKgiData,
      startDate: schedule.startDate,
      deadline: schedule.deadline,
      roadmapPhases: phasesWithSchedule
    });
    setKgiDeadlineFormStatus("期限を保存しました。");
  } catch (error) {
    console.error(error);
    setKgiDeadlineFormStatus("期限の保存に失敗しました。", true);
  } finally {
    if (saveKgiDeadlineButton) {
      saveKgiDeadlineButton.disabled = false;
    }
  }
};

if (kgiDeadlineForm) {
  kgiDeadlineForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateKgiDeadline(kgiDeadlineEditInput?.value ?? "");
  });
}

const renderKgiMeta = (kgiData) => {
  currentKgiData = kgiData ?? null;
  const normalizedPhases = normalizeRoadmapPhases(kgiData?.roadmapPhases);
  const schedule = buildKgiSchedule(kgiData, normalizedPhases);
  currentKgiData = {
    id: kgiId,
    ...(kgiData ?? {}),
    startDate: schedule.startDate,
    deadline: schedule.deadline
  };
  resetArchiveDebugState(currentKgiData.id);
  currentRoadmapPhases = applyScheduleToRoadmapPhases(normalizedPhases, schedule);
  updateArchiveKgiButtonState(currentKgiData);
  roadmapPhaseOpenState = {};
  kpiDetailOpenState = {};
  taskSectionOpenState = {};
  reflectionSectionOpenState = {};
  const deadline = displayDeadline(currentKgiData.deadline);
  const deadlineInfo = calcRemainingDays(deadline === "未設定" ? "" : deadline);

  kgiMeta.hidden = false;
  if (kgiDeadlineForm && kgiDeadlineEditInput && !isPhasePage) {
    kgiDeadlineForm.hidden = false;
    kgiDeadlineEditInput.value = currentKgiData.deadline ?? "";
    setKgiDeadlineFormStatus("");
  }

  if (isPhasePage) {
    kgiMeta.innerHTML = `
      <div class="overview-item">
        <strong>紐づくKGI</strong>
        <div>${escapeHtml(kgiData.name ?? "未設定のKGI")}</div>
      </div>
    `;

    renderRoadmap(currentRoadmapPhases);
    renderCurrentLocation(currentRoadmapPhases);
    renderPhasePageMeta();
    updatePhasePageLinks();
    updateRoadmapKpiButtonState(latestRenderedKpis.length);
    return;
  }

  kgiMeta.innerHTML = `
    <div class="overview-grid">
      <div class="overview-item">
        <strong>KGI名</strong>
        <div>${escapeHtml(kgiData.name ?? "")}</div>
      </div>
      <div class="overview-item">
        <strong>ゴール説明</strong>
        <div>${escapeHtml(displayGoalText(kgiData.goalText))}</div>
      </div>
      <div class="overview-item">
        <strong>開始日</strong>
        <div>${escapeHtml(displayDeadline(currentKgiData.startDate))}</div>
      </div>
      <div class="overview-item">
        <strong>目標期限日</strong>
        <div>${escapeHtml(deadline)}</div>
      </div>
      <div class="overview-item">
        <strong>残り日数</strong>
        <div class="${deadlineInfo.isOverdue ? "overdue-text" : ""}">${escapeHtml(deadlineInfo.remainingText)}</div>
      </div>
      <div class="overview-item progress-item">
        <strong>全体進捗</strong>
        <p id="overallProgressValue" class="summary-value">0%</p>
        <div class="progress-wrap">
          <div class="progress-bar" aria-label="KGI全体進捗バー">
            <div id="overallProgressFill" class="progress-fill"></div>
          </div>
          <p id="overallProgressCaption" class="progress-label">KPIがありません</p>
        </div>
      </div>
    </div>
  `;

  overallProgressValue = document.getElementById("overallProgressValue");
  overallProgressFill = document.getElementById("overallProgressFill");
  overallProgressCaption = document.getElementById("overallProgressCaption");

  renderRoadmap(currentRoadmapPhases);
  renderCurrentLocation(currentRoadmapPhases);
  renderPhasePageMeta();
  updatePhasePageLinks();
  updateRoadmapKpiButtonState(latestRenderedKpis.length);
};

const renderRoutineTasks = (routineTasks = []) => {
  if (!routineTaskList) {
    return;
  }

  const activeTasks = (Array.isArray(routineTasks) ? routineTasks : [])
    .filter((task) => normalizeRoutineTaskStatus(task?.status) === ROUTINE_TASK_STATUS.ACTIVE);

  if (activeTasks.length === 0) {
    routineTaskList.innerHTML = '<p class="hint">active な運用タスクはまだありません。</p>';
    return;
  }

  routineTaskList.innerHTML = activeTasks.slice(0, 5).map((task) => {
    const title = typeof task?.title === "string" && task.title.trim() ? task.title.trim() : "名称未設定";
    const description = typeof task?.description === "string" ? task.description.trim() : "";
    const cadence = normalizeRoutineTaskCadence(task?.cadence ?? task?.frequency);
    const createdAt = formatDate(task?.createdAt);

    return `
      <article class="routine-task-item">
        <div class="routine-task-item-header">
          <strong>${escapeHtml(title)}</strong>
          <div class="routine-task-meta">
            <span class="routine-task-badge">${escapeHtml(ROUTINE_TASK_CADENCE_LABELS[cadence])}</span>
            <span class="routine-task-badge">${escapeHtml(normalizeRoutineTaskStatus(task?.status))}</span>
          </div>
        </div>
        ${description ? `<p class="hint">${escapeHtml(description)}</p>` : ""}
        <p class="hint">作成日: ${escapeHtml(createdAt)}</p>
      </article>
    `;
  }).join("");
};

const updateRoutineSuggestionActionState = () => {
  if (addSelectedRoutineSuggestionsButton instanceof HTMLButtonElement) {
    addSelectedRoutineSuggestionsButton.disabled = routineSuggestionSelections.size === 0;
  }
};

const renderRoutineSuggestionList = () => {
  if (!routineSuggestionList) {
    return;
  }

  if (!routineSuggestionsVisible) {
    routineSuggestionList.hidden = true;
    if (addSelectedRoutineSuggestionsButton) {
      addSelectedRoutineSuggestionsButton.hidden = true;
    }
    return;
  }

  routineSuggestionList.hidden = false;
  routineSuggestionList.innerHTML = getRoutineSuggestionTemplates().map((task) => `
    <label class="routine-task-suggestion-item">
      <input type="checkbox" data-routine-template-id="${escapeHtml(task.id)}" ${routineSuggestionSelections.has(task.id) ? "checked" : ""} />
      <span class="routine-task-suggestion-copy">
        <strong>${escapeHtml(task.title)}</strong>
        <span class="hint">${escapeHtml(ROUTINE_TASK_CADENCE_LABELS[normalizeRoutineTaskCadence(task.cadence)])}</span>
        ${task.description ? `<span class="hint">${escapeHtml(task.description)}</span>` : ""}
      </span>
    </label>
  `).join("");

  if (addSelectedRoutineSuggestionsButton) {
    addSelectedRoutineSuggestionsButton.hidden = false;
  }
  updateRoutineSuggestionActionState();
};

const buildExistingRoutineTaskTitleSet = () => new Set(
  latestRoutineTasks.map((task) => String(task?.title ?? "").trim()).filter(Boolean)
);

const getRoutineSuggestionTemplates = () => (
  Array.isArray(routineSuggestionTemplates) && routineSuggestionTemplates.length > 0
    ? routineSuggestionTemplates
    : DEFAULT_ROUTINE_TASK_TEMPLATES
);

const createRoutineTemplateId = (cadence, title, index = 0) => `${normalizeRoutineTaskCadence(cadence)}-${String(title ?? "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, "-")
  .replace(/[^\p{L}\p{N}-]+/gu, "")
  .slice(0, 40) || `task-${index + 1}`}`;

const normalizeRoutineSuggestionTemplate = (item, index = 0, cadenceFallback = "ad_hoc") => {
  const title = typeof item?.title === "string" ? item.title.trim() : "";
  const description = typeof item?.description === "string" ? item.description.trim() : "";
  const cadence = normalizeRoutineTaskCadence(item?.cadence ?? cadenceFallback);

  if (!title) {
    return null;
  }

  return {
    id: createRoutineTemplateId(cadence, title, index),
    title,
    description,
    cadence
  };
};

const buildRoutineIssueNotes = (kpis = [], maxItems = 3) => buildRecentReflections(kpis, { limit: 5 })
  .filter((reflection) => reflection?.comment || reflection?.result === "harder_than_expected" || reflection?.result === "could_not_do")
  .slice(0, maxItems)
  .map((reflection) => ({
    taskTitle: reflection.taskTitle,
    result: reflection.result,
    comment: reflection.comment
  }));

const buildRoutineSuggestionRequest = () => {
  const selectedPhase = getCurrentRoadmapPhase();
  const phaseScopedKpis = isPhasePage && selectedPhaseId
    ? latestRenderedKpis.filter((kpi) => String(kpi?.phaseId ?? "").trim() === selectedPhaseId)
    : latestRenderedKpis;
  const taskCount = phaseScopedKpis.reduce((total, kpi) => total + (Array.isArray(kpi?.tasks) ? kpi.tasks.length : 0), 0);
  const nextAction = currentNextAction ?? selectNextAction(latestRenderedKpis, currentRoadmapPhases);
  const focusTasks = [];

  if (typeof nextAction?.task?.title === "string" && nextAction.task.title.trim()) {
    focusTasks.push(nextAction.task.title.trim());
  }

  phaseScopedKpis.forEach((kpi) => {
    (Array.isArray(kpi?.tasks) ? kpi.tasks : []).forEach((task) => {
      const title = typeof task?.title === "string" ? task.title.trim() : "";
      if (title && !getTaskIsCompleted(task) && focusTasks.length < 3 && !focusTasks.includes(title)) {
        focusTasks.push(title);
      }
    });
  });

  return {
    kgiName: currentKgiData?.name ?? "",
    phaseName: selectedPhase?.title ?? getDefaultPhaseId(),
    phaseDescription: selectedPhase?.description ?? "",
    nowFocus: focusTasks,
    kpiCount: phaseScopedKpis.length,
    taskCount,
    recentIssues: buildRoutineIssueNotes(phaseScopedKpis)
  };
};

const requestRoutineSuggestions = async () => {
  const response = await fetch("/api/generate-routine-suggestions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildRoutineSuggestionRequest())
  });

  const responseText = await response.text();
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse /api/generate-routine-suggestions response as JSON", parseError, responseText);
    }
  }

  if (!response.ok) {
    const apiErrorMessage = typeof data?.error === "string" && data.error.trim()
      ? data.error.trim()
      : responseText.trim() || `HTTP ${response.status}`;
    throw new Error(apiErrorMessage);
  }

  const grouped = [
    ...(Array.isArray(data?.daily) ? data.daily.map((item, index) => normalizeRoutineSuggestionTemplate(item, index, "daily")) : []),
    ...(Array.isArray(data?.weekly) ? data.weekly.map((item, index) => normalizeRoutineSuggestionTemplate(item, index, "weekly")) : []),
    ...(Array.isArray(data?.adHoc) ? data.adHoc.map((item, index) => normalizeRoutineSuggestionTemplate(item, index, "ad_hoc")) : [])
  ]
    .filter(Boolean);
  const uniqueByTitle = new Set();

  return grouped.filter((item) => {
    if (uniqueByTitle.has(item.title)) {
      return false;
    }
    uniqueByTitle.add(item.title);
    return true;
  });
};


const renderPhasePageMeta = () => {
  if (!isPhasePage) {
    updatePhasePageLinks();
    return;
  }

  const selectedPhase = currentRoadmapPhases.find((phase) => phase.id === selectedPhaseId) ?? null;
  const fallbackPhaseId = getDefaultPhaseId();

  if (!selectedPhase && fallbackPhaseId) {
    selectedPhaseId = fallbackPhaseId;
  }

  const phase = currentRoadmapPhases.find((item) => item.id === selectedPhaseId) ?? null;
  const phaseIndex = currentRoadmapPhases.findIndex((item) => item.id === phase?.id);
  const phaseName = phase
    ? buildRoadmapPhaseTitle(phase.title, phaseIndex >= 0 ? phaseIndex : 0)
    : "フェーズ未設定";
  const normalizedStatus = phase ? normalizeRoadmapStatus(phase.status) : "";
  const statusLabel = phase
    ? ROADMAP_STATUS_LABELS[normalizedStatus] ?? "予定"
    : "";

  if (phaseTitle) {
    phaseTitle.textContent = phaseName;
  }
  if (phasePeriodBadge) {
    const periodLabel = getPhaseDeadlineDisplayLabel(phase);
    phasePeriodBadge.textContent = `期限目安: ${periodLabel}`;
    phasePeriodBadge.hidden = false;
  }
  isPhaseDescriptionExpanded = false;
  renderPhaseDescription(phase?.description);
  if (pageTitle) {
    pageTitle.textContent = "KPI一覧";
  }
  if (pageLead) {
    pageLead.textContent = "";
    pageLead.hidden = true;
  }
  if (isPhasePage) {
    document.title = `${phaseName} のKPI | KGI Firestore Minimal`;
  }
  if (phaseMetaText) {
    phaseMetaText.textContent = phase
      ? `フェーズ状況: ${statusLabel}`
      : "フェーズ未指定";
  }

  updatePhasePageLinks();
};

const normalizeKpis = (docs) => docs
  .map((kpiDoc) => {
    const data = kpiDoc.data();
    const phaseMeta = resolvePhaseMetadata(data?.phaseId);
    const storedPhaseName = typeof data?.phaseName === "string" && data.phaseName.trim() ? data.phaseName.trim() : "";
    const storedPhaseNumber = Number.isFinite(Number(data?.phaseNumber)) ? Number(data.phaseNumber) : null;
    return {
      id: kpiDoc.id,
      ...data,
      phaseId: phaseMeta.phaseId,
      phaseName: storedPhaseName || phaseMeta.phaseName,
      phaseNumber: storedPhaseNumber ?? phaseMeta.phaseNumber,
      category: normalizeKpiCategory(data?.category) || inferKpiCategory(data?.name, data?.description) || "",
      status: normalizeKpiStatus(data?.status)
    };
  })
  .sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return 0;
  });

const sortTasks = (tasks) => (Array.isArray(tasks) ? [...tasks] : []).sort((a, b) => {
  const stageRankA = getTaskStageRank(a);
  const stageRankB = getTaskStageRank(b);

  if (stageRankA !== stageRankB) {
    return stageRankA - stageRankB;
  }

  const priorityA = getComparablePriority(a?.priority);
  const priorityB = getComparablePriority(b?.priority);

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
  const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  const createdAtA = getComparableCreatedAt(a?.createdAt);
  const createdAtB = getComparableCreatedAt(b?.createdAt);

  if (createdAtA !== createdAtB) {
    return createdAtA - createdAtB;
  }

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), "ja");
});

const normalizeTasks = (docs) => sortTasks(docs
  .map((taskDoc) => ({
    id: taskDoc.id,
    ...taskDoc.data(),
    stage: normalizeTaskStage(taskDoc.data()?.stage),
    dependsOnTaskIds: normalizeDependsOnTaskIds(taskDoc.data()?.dependsOnTaskIds),
    ...buildTaskTicketFields(taskDoc.data())
  })));

const getOneTimeTaskContribution = (task) => {
  const isCompleted = getTaskIsCompleted(task);
  return {
    isCompleted,
    contributedValue: isCompleted ? 1 : 0,
    progressValue: isCompleted ? 1 : 0
  };
};

const calculateCurrentValueFromTasks = (tasks) => tasks
  .reduce((sum, task) => sum + calculateTaskContributedValue(task), 0);

const calculateOneTimeTaskSummary = (tasks) => {
  const totalTaskCount = tasks.length;
  const completedTaskCount = tasks.filter((task) => getTaskIsCompleted(task)).length;

  if (totalTaskCount === 0) {
    return {
      totalTaskCount,
      completedTaskCount,
      currentValue: 0,
      progress: 0
    };
  }

  return {
    totalTaskCount,
    completedTaskCount,
    currentValue: completedTaskCount,
    progress: clampPercent(Math.round((completedTaskCount / totalTaskCount) * 100))
  };
};

const isOneTimeTaskBasedKpi = (kpiDataForTarget, tasks) => {
  const progressType = String(kpiDataForTarget?.progressType ?? "").toLowerCase();
  const kpiType = String(kpiDataForTarget?.kpiType ?? "").toLowerCase();

  if (progressType === "one_time" || progressType === "one_time_task") {
    return true;
  }

  if (kpiType === "one_time") {
    return true;
  }

  if (tasks.length === 0) {
    return false;
  }

  return tasks.every((task) => normalizeTaskType(task.type) === "one_time");
};

const calculateProgressFromCurrentValue = (kpi, currentValue) => {
  const target = parsePositiveNumber(kpi.targetValue ?? kpi.target, 0);

  if (target <= 0) {
    return 0;
  }

  return clampPercent(Math.round((currentValue / target) * 100));
};

const syncKpiProgressFromTasks = async (kpiIdForTask, kpiDataForTarget) => {
  const tasksSnapshot = await getDocs(getTasksRef(kpiIdForTask));
  const tasks = normalizeTasks(tasksSnapshot.docs);

  await Promise.all(tasks.map(async (task) => {
    if (normalizeTaskType(task.type) !== "one_time") {
      return;
    }

    const normalized = getOneTimeTaskContribution(task);

    if (
      Number(task.contributedValue) === normalized.contributedValue
      && Number(task.progressValue) === normalized.progressValue
    ) {
      return;
    }

    await updateDoc(doc(getKpisRef(), kpiIdForTask, "tasks", task.id), {
      contributedValue: normalized.contributedValue,
      progressValue: normalized.progressValue,
      updatedAt: serverTimestamp()
    });

    task.contributedValue = normalized.contributedValue;
    task.progressValue = normalized.progressValue;
  }));

  const oneTimeTaskBasedKpi = isOneTimeTaskBasedKpi(kpiDataForTarget, tasks);
  const oneTimeSummary = oneTimeTaskBasedKpi
    ? calculateOneTimeTaskSummary(tasks)
    : null;
  const currentValue = oneTimeSummary
    ? oneTimeSummary.currentValue
    : calculateCurrentValueFromTasks(tasks);
  const progress = oneTimeSummary
    ? oneTimeSummary.progress
    : calculateProgressFromCurrentValue(kpiDataForTarget, currentValue);

  console.log("[kpi aggregation]", {
    kpiId: kpiIdForTask,
    relatedTaskCount: tasks.length,
    summedContributedValue: currentValue
  });

  await updateDoc(getKpiRef(kpiIdForTask), {
    currentValue,
    progress,
    percentage: progress,
    updatedAt: serverTimestamp()
  });

  return { currentValue, progress, tasks };
};

const renderTaskOutline = (tasks) => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return "";
  }

  const outlineItems = tasks.map((task, index) => {
    const taskTitle = typeof task?.title === "string" && task.title.trim() ? task.title.trim() : "-";
    const taskStatus = getTaskStatusLabel(getTaskActionableStatus(task));

    return `
      <li class="task-outline-item">
        <span class="task-outline-number">${index + 1}</span>
        <span class="task-outline-main">${escapeHtml(taskTitle)}</span>
        <span class="status-badge ${getTaskStatusClassName(getTaskActionableStatus(task))}">${escapeHtml(taskStatus)}</span>
      </li>
    `;
  }).join("");

  return `
    <section class="task-outline" aria-label="Task目次">
      <h4 class="task-outline-title">Task目次</h4>
      <ol class="task-outline-list">
        ${outlineItems}
      </ol>
    </section>
  `;
};


const renderReflectionRows = (kpiIdForTask, tasks) => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '<p class="hint">Taskがまだありません。</p>';
  }

  const reflectionItems = tasks
    .filter((task) => isTaskCheckAvailable(task))
    .map((task) => `
      <section class="task-reflection-item">
        <h4 class="task-reflection-item-title">${escapeHtml(task.title ?? "-")}</h4>
        ${renderTaskCheckSection(kpiIdForTask, task)}
      </section>
    `)
    .join("");

  return reflectionItems || '<p class="hint">振り返り対象のTaskはまだありません。</p>';
};

const renderTaskRows = (kpiIdForTask, tasks, options = {}) => {
  const showReflections = Boolean(options.showReflections);
  if (tasks.length === 0) {
    return '<p class="hint">Taskがまだありません。</p>';
  }

  const taskRows = tasks.map((task) => {
    const taskTitle = task.title ?? "";
    const taskDescription = displayDescription(task.description);
    const taskType = normalizeTaskType(task.type);
    const taskStage = getTaskStageLabel(task);
    const taskPriority = displayTaskPriority(task.priority);
    const taskDeadline = displayDeadline(task.deadline);
    const taskDueDate = displayDeadline(getTaskDueDate(task));
    const taskRemaining = calcRemainingDays(taskDueDate === "未設定" ? (taskDeadline === "未設定" ? "" : task.deadline) : getTaskDueDate(task));
    const contributedValue = calculateTaskContributedValue(task);
    const isCompleted = getTaskIsCompleted(task);
    const completedCount = getTaskCompletedCount(task);
    const ticketStatus = normalizeTaskTicketStatus(task);
    const ticketInfoMarkup = `
      <div class="task-ticket-meta">
        <div><strong>担当</strong><span>${escapeHtml(getTaskDisplayValue(getTaskAssignee(task)))}</span></div>
        <div><strong>完了条件</strong><span>${escapeHtml(getTaskDisplayValue(getTaskDoneDefinition(task)))}</span></div>
        <div><strong>メモ</strong><span>${escapeHtml(getTaskDisplayValue(getTaskTicketNote(task)))}</span></div>
      </div>
    `;
    const ticketStatusOptionsMarkup = TASK_TICKET_STATUS_OPTIONS.map((option) => `
      <option value="${option.value}" ${ticketStatus === option.value ? "selected" : ""}>${option.label}</option>
    `).join("");

    return `
      <tr id="task-${task.id}">
        <td data-label="Task名">${escapeHtml(taskTitle || "-")}</td>
        <td data-label="補足説明">${taskDescription}</td>
        <td data-label="stage">${taskStage}</td>
        <td data-label="タイプ">${taskType}</td>
        <td data-label="進捗値">${contributedValue}</td>
        <td data-label="達成入力">
          ${taskType === "one_time"
    ? `<label><input type="checkbox" class="task-completion-input" data-kpi-id="${kpiIdForTask}" data-task-id="${task.id}" data-task-type="one_time" ${isCompleted ? "checked" : ""} /> 完了</label>`
    : `<input type="number" min="0" step="1" class="task-completion-input" data-kpi-id="${kpiIdForTask}" data-task-id="${task.id}" data-task-type="repeatable" value="${completedCount}" aria-label="${taskTitle || "Task"}の完了回数" />`}
        </td>
        <td data-label="期限">${taskDeadline}</td>
        <td data-label="チケット期限">${taskDueDate}</td>
        <td data-label="残り日数" class="${taskRemaining.isOverdue ? "overdue-text" : ""}">${taskRemaining.remainingText}</td>
        <td data-label="優先度">${taskPriority}</td>
        <td data-label="チケット情報">${ticketInfoMarkup}</td>
        <td data-label="チケット状態">
          <div class="task-ticket-status-cell">
            <span class="status-badge ${getTaskTicketStatusClassName(ticketStatus)}">${getTaskTicketStatusLabel(ticketStatus)}</span>
            <select class="task-ticket-status-select" data-kpi-id="${kpiIdForTask}" data-task-id="${task.id}" aria-label="${escapeHtml(taskTitle || "Task")}のチケット状態">
              ${ticketStatusOptionsMarkup}
            </select>
          </div>
        </td>
      </tr>
      ${showReflections && isTaskCheckAvailable(task)
    ? `
        <tr class="task-check-row">
          <td colspan="12">
            ${renderTaskCheckSection(kpiIdForTask, task)}
          </td>
        </tr>
      `
    : ""}
    `;
  }).join("");

  return `
    <table class="task-table">
      <thead>
        <tr>
          <th>Task名</th>
          <th>補足説明</th>
          <th>stage</th>
          <th>タイプ</th>
          <th>進捗値</th>
          <th>達成入力</th>
          <th>期限</th>
          <th>チケット期限</th>
          <th>残り日数</th>
          <th>優先度</th>
          <th>チケット情報</th>
          <th>チケット状態</th>
        </tr>
      </thead>
      <tbody>
        ${taskRows}
      </tbody>
    </table>
  `;
};

const setMindmapStatus = (message, isError = false) => {
  if (!mindmapStatusText) {
    return;
  }

  mindmapStatusText.textContent = message;
  mindmapStatusText.classList.toggle("error", isError);
};

const getMindmapNodeStatus = (nodeType, item, context = {}) => {
  if (context.isNow) {
    return "now";
  }

  if (nodeType === "task") {
    if (getTaskIsCompleted(item)) {
      return "done";
    }

    return getTaskActionableStatus(item) === "doing" ? "doing" : "todo";
  }

  if (nodeType === "kpi") {
    if (isCompletedKpi(item)) {
      return "done";
    }

    const tasks = Array.isArray(item?.tasks) ? item.tasks : [];
    if (tasks.some((task) => getTaskActionableStatus(task) === "doing")) {
      return "doing";
    }

    return "todo";
  }

  const kpis = Array.isArray(context.kpis) ? context.kpis : [];

  if (kpis.length > 0 && kpis.every((kpi) => isCompletedKpi(kpi))) {
    return "done";
  }

  if (kpis.some((kpi) => Array.isArray(kpi?.tasks) && kpi.tasks.some((task) => getTaskActionableStatus(task) === "doing"))) {
    return "doing";
  }

  return "todo";
};

const getMindmapStatusLabel = (status) => ({
  todo: "未着手",
  doing: "進行中",
  done: "完了",
  now: "今やる1つ"
}[status] ?? "未着手");

const buildMindmapBadges = (nodeType, status, extra = []) => [nodeType, status, ...extra]
  .filter(Boolean)
  .map((badge) => {
    const normalized = String(badge).trim().toLowerCase();
    const labelMap = {
      kgi: "KGI",
      kpi: "KPI",
      task: "Task",
      todo: "未着手",
      doing: "進行中",
      done: "完了",
      now: "今やる1つ"
    };

    return `<span class="mindmap-badge ${escapeHtml(normalized)}">${escapeHtml(labelMap[normalized] ?? badge)}</span>`;
  }).join("");

const rememberMindmapState = () => {
  if (!mindmapTree) {
    return;
  }

  const nextState = {};
  mindmapTree.querySelectorAll("details[data-mindmap-key]").forEach((element) => {
    const key = element.dataset.mindmapKey;
    if (key) {
      nextState[key] = element.open;
    }
  });
  mindmapOpenState = nextState;
};

const renderMindmapNode = ({ key, title, meta = "", href = "#", nodeType = "task", status = "todo", isOpen = true, children = [] }) => {
  const hasChildren = Array.isArray(children) && children.length > 0;
  const childMarkup = hasChildren
    ? `<div class="mindmap-children">${children.join("")}</div>`
    : "";
  const lineMarkup = `
    <span class="mindmap-summary-line">
      ${hasChildren ? '<span class="mindmap-caret">›</span>' : '<span class="mindmap-leaf-spacer" aria-hidden="true"></span>'}
      <a class="mindmap-link ${href ? "is-clickable" : ""} status-${escapeHtml(status)}" href="${escapeHtml(href || "#")}">
        <span class="mindmap-link-title">${escapeHtml(title || "未設定")}</span>
        <span class="mindmap-badges">${buildMindmapBadges(nodeType, status)}</span>
        ${meta ? `<span class="mindmap-link-meta">${escapeHtml(meta)}</span>` : ""}
      </a>
    </span>
  `;

  if (!hasChildren) {
    return `<div class="mindmap-node level-${escapeHtml(nodeType)}">${lineMarkup}</div>`;
  }

  return `
    <div class="mindmap-node level-${escapeHtml(nodeType)}">
      <details class="mindmap-toggle" data-mindmap-key="${escapeHtml(key)}" ${isOpen ? "open" : ""}>
        <summary class="mindmap-summary">${lineMarkup}</summary>
        ${childMarkup}
      </details>
    </div>
  `;
};

const renderMindmap = (kgiData = currentKgiData, kpis = latestRenderedKpis) => {
  if (!mindmapTree || !mindmapSection) {
    return;
  }

  const normalizedKpis = Array.isArray(kpis) ? kpis : [];
  const nextActionTaskId = currentNextAction?.task?.id ?? "";

  if (!kgiData?.name) {
    mindmapTree.innerHTML = '<p class="mindmap-empty">KGIを読み込めると全体マップを表示します。</p>';
    setMindmapStatus("KGIの読み込み後に最新マップを生成します。");
    return;
  }

  const kpiNodes = normalizedKpis.map((kpi, index) => {
    const tasks = sortTasks(Array.isArray(kpi?.tasks) ? kpi.tasks : []);
    const kpiStatus = getMindmapNodeStatus("kpi", kpi);
    const kpiKey = `kpi:${kpi.id}`;
    const taskChildren = tasks.map((task, taskIndex) => {
      const isNow = task.id === nextActionTaskId;
      const taskStatus = getMindmapNodeStatus("task", task, { isNow });
      const taskMeta = `${taskIndex + 1}件目${task.deadline ? ` / 期限 ${task.deadline}` : ""}`;

      return renderMindmapNode({
        key: `task:${task.id}`,
        title: task.title ?? `Task ${taskIndex + 1}`,
        meta: taskMeta,
        href: `#task-${task.id}`,
        nodeType: "task",
        status: taskStatus,
        isOpen: mindmapOpenState[`task:${task.id}`] ?? false,
        children: []
      });
    });

    return renderMindmapNode({
      key: kpiKey,
      title: `${formatListOrderLabel(index)} ${getSimpleName(kpi) || kpi.name || "KPI"}`,
      meta: `${tasks.length}件のTask / 進捗 ${formatPercent(displayProgress(kpi))}`,
      href: `#kpi-${kpi.id}`,
      nodeType: "kpi",
      status: kpiStatus,
      isOpen: mindmapOpenState[kpiKey] ?? true,
      children: taskChildren
    });
  });

  const rootStatus = getMindmapNodeStatus("kgi", kgiData, { kpis: normalizedKpis });
  mindmapTree.innerHTML = renderMindmapNode({
    key: `kgi:${kgiId}`,
    title: kgiData.name ?? "未設定のKGI",
    meta: `${normalizedKpis.length}件のKPI / ${normalizedKpis.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0)}件のTask`,
    href: `#top`,
    nodeType: "kgi",
    status: rootStatus,
    isOpen: mindmapOpenState[`kgi:${kgiId}`] ?? true,
    children: kpiNodes
  });

  mindmapTree.querySelectorAll("details[data-mindmap-key]").forEach((element) => {
    element.addEventListener("toggle", rememberMindmapState);
  });

  const sourceLabel = isPhasePage ? "現在フェーズ表示中のKPI / Task" : "KGI配下のKPI / Task 全件";
  setMindmapStatus(`表示中の ${sourceLabel} から毎回マップを再生成しています。`);
};

const renderKpiTable = (kpis) => {
  latestRenderedKpis = Array.isArray(kpis) ? kpis : [];
  kpiTableBody.innerHTML = "";

  const phaseGroups = buildPhaseGroups(latestRenderedKpis, currentRoadmapPhases);
  ensurePhaseOpenState(phaseGroups, currentRoadmapPhases);

  phaseGroups.forEach((group) => {
    const isOpen = isPhaseGroupOpen(group.key);
    const section = document.createElement("section");
    section.className = `kpi-phase-group ${isOpen ? "open" : ""}`;
    section.dataset.phaseGroup = group.key;

    const groupHeader = document.createElement("button");
    groupHeader.type = "button";
    groupHeader.className = "kpi-phase-toggle";
    groupHeader.dataset.phaseToggle = group.key;
    groupHeader.setAttribute("aria-expanded", isOpen ? "true" : "false");
    groupHeader.innerHTML = `
      <span>
        <span class="kpi-phase-title">${escapeHtml(group.title)}</span>
        <span class="phase-kpi-badge">${escapeHtml(group.statusLabel)}</span>
      </span>
      <span class="kpi-phase-toggle-meta">${group.items.length}件 / ${isOpen ? "閉じる" : "開く"}</span>
    `;
    section.appendChild(groupHeader);

    const phaseBody = document.createElement("div");
    phaseBody.className = "kpi-phase-body";
    phaseBody.hidden = !isOpen;

    if (group.description) {
      const desc = document.createElement("p");
      desc.className = "hint";
      desc.textContent = group.description;
      phaseBody.appendChild(desc);
    }

    const sortedItems = [...group.items].sort((a, b) => {
      const priorityDiff = getKpiListPriority(a) - getKpiListPriority(b);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return compareRecommendedKpis(a, b);
    });

    sortedItems.forEach((kpi, kpiIndex) => {
      const progressPercent = displayProgress(kpi);
      const isCompleted = isCompletedKpi(kpi);
      const deadline = displayDeadline(kpi.deadline);
      const remaining = calcRemainingDays(deadline === "未設定" ? "" : deadline);
      const currentValue = parsePositiveNumber(kpi.currentValue, 0);
      const category = getKpiCategory(kpi);
      const simpleName = getSimpleName(kpi);
      const simpleDescription = getSimpleDescription(kpi);
      const originalName = typeof kpi.name === "string" && kpi.name.trim() ? kpi.name.trim() : "-";
      const originalDescription = displayDescription(kpi.description);
      const isOpen = Boolean(kpiDetailOpenState[kpi.id]);
      const isTaskFormOpen = Boolean(taskFormOpenState[kpi.id]);
      const isTaskSectionOpen = Boolean(taskSectionOpenState[kpi.id]);
      const isReflectionSectionOpen = Boolean(reflectionSectionOpenState[kpi.id]);
      const tasks = Array.isArray(kpi.tasks) ? kpi.tasks : [];
      const completedTaskCount = tasks.filter((task) => getTaskIsCompleted(task)).length;
      const firstIncompleteTask = getFirstIncompleteTaskForKpi(kpi);
      const shouldShowTaskEmptyState = tasks.length === 0;
      const taskSummaryText = firstIncompleteTask
        ? `最初の未完了Task: ${firstIncompleteTask.title ?? "-"}`
        : tasks.length > 0
          ? "未完了Taskはありません"
          : "まだTaskがありません";
      const kpiDisplayTitle = `${formatListOrderLabel(kpiIndex)} ${simpleName || "-"}`;

      const article = document.createElement("article");
      article.id = `kpi-${kpi.id}`;
      article.className = `kpi-card ${isOpen ? "open" : ""} ${isCompleted ? "completed" : ""}`.trim();
      article.innerHTML = `
        <div class="kpi-card-summary">
          <div class="kpi-card-main">
            <strong>${escapeHtml(kpiDisplayTitle)}</strong>
            ${isCompleted ? '<span class="kpi-complete-badge">完了</span>' : ""}
          </div>
          <div class="kpi-card-meta">
            <span>進捗 ${formatPercent(progressPercent)}</span>
            <span>タイプ ${escapeHtml(kpi.kpiType === "action" ? "action" : "result")}</span>
            <span class="kpi-category-badge">${escapeHtml(category)}</span>
            <span>${completedTaskCount} / ${tasks.length}件完了</span>
          </div>
          <div class="kpi-card-actions">
            <div class="kpi-card-actions-primary">
              <button class="button" type="button" data-kpi-primary-action="${kpi.id}" aria-expanded="${isTaskFormOpen ? "true" : "false"}">${getPrimaryTaskButtonLabel(kpi, isTaskFormOpen)}</button>
            </div>
            <div class="kpi-card-actions-secondary">
              <button class="button secondary kpi-detail-toggle" type="button" data-kpi-toggle="${kpi.id}" aria-expanded="${isOpen ? "true" : "false"}">${isOpen ? "閉じる" : "開く"}</button>
            </div>
          </div>
          ${shouldShowTaskEmptyState ? `
            <div class="kpi-empty-task-guide">
              <strong>まだTaskがありません</strong>
              <span class="hint">まず最初の1歩を作ってください</span>
            </div>
          ` : ""}
        </div>
        <div class="kpi-card-detail" ${isOpen ? "" : "hidden"}>
          <div class="kpi-card-detail-block">
            <div><strong>KPI名</strong><div>${escapeHtml(kpiDisplayTitle)}</div></div>
            ${simpleName && simpleName !== originalName ? `<div><strong>元のKPI</strong><div>${escapeHtml(originalName)}</div></div>` : ""}
            <div><strong>説明</strong><div>${escapeHtml(simpleDescription || "-")}</div></div>
            ${simpleDescription && simpleDescription !== originalDescription && originalDescription !== "-" ? `<div><strong>元の説明</strong><div>${escapeHtml(originalDescription)}</div></div>` : ""}
            <div><strong>カテゴリ</strong><div><span class="kpi-category-badge">${escapeHtml(category)}</span></div></div>
            <div><strong>状態</strong><div><span class="kpi-status-badge">${escapeHtml(normalizeKpiStatus(kpi.status))}</span></div></div>
            <div><strong>進捗</strong><div>${formatPercent(progressPercent)}</div></div>
            <div><strong>タイプ</strong><div>${escapeHtml(kpi.kpiType === "action" ? "action" : "result")}</div></div>
            <div><strong>現在値</strong><div>${currentValue}</div></div>
            <div><strong>Task件数</strong><div>${tasks.length}件</div></div>
            <div><strong>最初の一歩</strong><div>${escapeHtml(taskSummaryText)}</div></div>
            <div><strong>期限</strong><div>${escapeHtml(deadline)} / <span class="${remaining.isOverdue ? "overdue-text" : ""}">${escapeHtml(remaining.remainingText)}</span></div></div>
            <div class="progress-wrap">
              <div class="progress-bar" aria-label="${escapeHtml(simpleName || kpi.name || "KPI")}の進捗バー">
                <div class="progress-fill" style="width: ${progressPercent}%"></div>
              </div>
            </div>
          </div>
          <div class="task-panel">
            <div class="task-panel-header">
              <h3 class="task-panel-title">Task</h3>
              <button class="button secondary task-disclosure-toggle" type="button" data-task-section-toggle="${kpi.id}" aria-expanded="${isTaskSectionOpen ? "true" : "false"}">${isTaskSectionOpen ? "Taskを閉じる" : "Taskを見る"}</button>
            </div>
            <div class="task-panel-body" ${isTaskSectionOpen ? "" : "hidden"}>
              <div class="task-disclosure">
                <div class="task-disclosure-header">
                  <button class="button secondary task-disclosure-toggle" type="button" data-task-form-toggle="${kpi.id}" aria-expanded="${isTaskFormOpen ? "true" : "false"}">${isTaskFormOpen ? "Task入力を閉じる" : tasks.length === 0 ? "最初のTaskを追加" : "Taskを追加"}</button>
                  <span class="hint">${tasks.length === 0 ? "このKPIの最初の1歩を1件だけ手動追加できます" : "入力が必要なときだけ展開"}</span>
                </div>
                ${isTaskFormOpen ? `
                  <form class="task-form task-disclosure-body" data-kpi-id="${kpi.id}">
                    <div class="task-grid">
                      <label>Task名<input name="title" type="text" placeholder="例: LPの改善案を3つ作る" required /></label>
                      <label>補足説明<input name="description" type="text" placeholder="任意" /></label>
                      <label>stage<select name="stage"><option value="setup">setup</option><option value="research">research</option><option value="decision">decision</option><option value="build" selected>build</option><option value="launch">launch</option><option value="review">review</option></select></label>
                      <label>タイプ<select name="type" class="task-type-select"><option value="one_time">one_time</option><option value="repeatable">repeatable</option></select></label>
                      <label>進捗値<input name="progressValue" type="number" min="0" step="1" value="1" required /></label>
                      <label>期限<input name="deadline" type="date" /></label>
                      <label>優先度<input name="priority" type="number" min="1" step="1" value="2" /></label>
                      <label>担当<input name="assignee" type="text" placeholder="例: 自分、ナオキ、外注先A" /></label>
                      <label>完了条件<input name="doneDefinition" type="text" placeholder="例: PR作成まで、承認取得まで、初回送信20件完了まで" /></label>
                      <label>メモ<input name="ticketNote" type="text" placeholder="任意" /></label>
                    </div>
                    <button class="button task-add-button" type="submit">Taskを追加</button>
                  </form>
                ` : ""}
              </div>
              ${renderTaskOutline(tasks)}
              ${renderTaskSuggestionList(kpi)}
              <div class="task-list-wrap">${renderTaskRows(kpi.id, tasks, { showReflections: true })}</div>
            </div>
          </div>
        </div>
      `;
      phaseBody.appendChild(article);
    });

    section.appendChild(phaseBody);
    kpiTableBody.appendChild(section);
  });
};

const rerenderCurrentKpis = () => {
  renderKpiTable(latestRenderedKpis);
  renderPhaseRecommendedKpi(latestRenderedKpis);
};

const openTaskSectionForKpi = (kpiId) => {
  if (!kpiId) {
    return;
  }

  kpiDetailOpenState = { ...kpiDetailOpenState, [kpiId]: true };
  taskSectionOpenState = { ...taskSectionOpenState, [kpiId]: true };
  taskFormOpenState = { ...taskFormOpenState, [kpiId]: false };
  rerenderCurrentKpis();
};

const openTaskFormForKpi = (kpiId) => {
  if (!kpiId) {
    return;
  }

  kpiDetailOpenState = { ...kpiDetailOpenState, [kpiId]: true };
  taskSectionOpenState = { ...taskSectionOpenState, [kpiId]: true };
  taskFormOpenState = { ...taskFormOpenState, [kpiId]: true };
  rerenderCurrentKpis();

  window.requestAnimationFrame(() => {
    const taskTitleInput = document.querySelector(`form.task-form[data-kpi-id="${kpiId}"] input[name="title"]`);
    if (taskTitleInput instanceof HTMLInputElement) {
      taskTitleInput.focus();
    }
  });
};

const loadKpis = async () => {
  const snapshot = await getDocs(getKpisQuery());
  const allKpis = normalizeKpis(snapshot.docs);
  const phaseScopedKpis = isPhasePage && selectedPhaseId
    ? allKpis.filter((kpi) => String(kpi?.phaseId ?? "").trim() === selectedPhaseId)
    : allKpis;
  const visibleKpis = showArchivedKpis ? phaseScopedKpis : phaseScopedKpis.filter(isActiveKpi);

  if (phaseScopedKpis.length === 0) {
    updateRoadmapKpiButtonState(0);
    kpiTableBody.innerHTML = "";
    latestRenderedKpis = [];
    kpiTable.hidden = true;
    renderOverallProgress([]);
    renderKpiSummary([], []);
    existingKpiKeys = new Set();
    taskAiSavedByKpiId = {};
    taskAiSavingByKpiId = {};
    latestNextActionStepRequestKey = "";
    setNextActionState({
      nextAction: null,
      loading: false,
      error: "Taskがまだないため、Next Actionを表示できません。",
      stepLoading: false,
      stepError: "",
      steps: []
    });
    renderNextAction(null);
    renderAiSuggestions();
    renderPhaseRecommendedKpi([]);
    updateInitialRoadmapKpiGuide(allKpis.length);
    setKpiStatus(isPhasePage
      ? "このフェーズのKPIがまだありません。上のフォームから追加してください。"
      : (currentRoadmapPhases.length > 0 ? "KPIがまだありません。ロードマップから自動作成するか、上のフォームから追加してください。" : "KPIがまだありません。上のフォームから追加してください。"));
    setDebugSummary(`KGI読み込み成功: ${kgiId}`, "KPI 0件", "Task 0件");
    updateDebugPanel([]);
    return;
  }

  updateRoadmapKpiButtonState(allKpis.filter(isActiveKpi).length);
  updateInitialRoadmapKpiGuide(allKpis.length);
  existingKpiKeys = new Set(phaseScopedKpis.filter(isActiveKpi).map((kpi) => buildSavedSuggestionKeyFromKpi(kpi)));

  const kpisWithTasks = await Promise.all(
    visibleKpis.map(async (kpi) => {
      const kpiWithSimpleFields = await ensureSimpleKpiFields(kpi);
      const synced = await syncKpiProgressFromTasks(kpi.id, kpiWithSimpleFields);
      const tasks = synced.tasks;

      const taskDebugItems = synced.tasks.map((task) => ({
        id: task.id ?? "",
        title: task.title ?? "",
        type: normalizeTaskType(task.type),
        isCompleted: getTaskIsCompleted(task),
        progressValue: getTaskProgressValue(task),
        contributedValue: calculateTaskContributedValue(task)
      }));

      return {
        ...kpiWithSimpleFields,
        currentValue: synced.currentValue,
        progress: synced.progress,
        tasks,
        debug: {
          id: kpi.id,
          currentValue: synced.currentValue,
          relatedTaskCount: synced.tasks.length,
          summedContributedValue: synced.currentValue,
          tasks: taskDebugItems
        }
      };
    })
  );

  hydrateTaskAiSavedStateFromTasks(kpisWithTasks);

  const missingTaskKpis = kpisWithTasks.filter((kpi) => !Array.isArray(kpi.tasks) || kpi.tasks.length === 0);

  if (!autoTaskGenerationInFlight && missingTaskKpis.length > 0) {
    setKpiStatus(`Task未作成のKPIが ${missingTaskKpis.length}件あります。一覧表示を優先するため、自動生成は停止しています。`);
  }

  const totalTaskCount = kpisWithTasks.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0);
  setDebugSummary(
    `KGI読み込み成功: ${kgiId}`,
    totalTaskCount === 0 ? "Task 0件" : `Task ${totalTaskCount}件`,
    `KPI ${kpisWithTasks.length}件`
  );
  updateDebugPanel(kpisWithTasks.map((kpi) => kpi.debug));

  const nextAction = selectNextAction(kpisWithTasks, currentRoadmapPhases);

  renderKpiTable(kpisWithTasks);
  renderPhaseRecommendedKpi(kpisWithTasks);
  renderOverallProgress(kpisWithTasks);
  renderKpiSummary(kpisWithTasks, isPhasePage ? phaseScopedKpis : allKpis);

  if (!nextAction) {
    latestNextActionStepRequestKey = "";
    setNextActionState({
      nextAction: null,
      loading: false,
      error: totalTaskCount > 0 ? "未完了Taskがないため、今やるべきことはありません。" : "Taskがまだないため、Next Actionを表示できません。",
      stepLoading: false,
      stepError: "",
      steps: []
    });
    renderNextAction(null);
  } else {
    const currentKey = buildNextActionStepRequestKey(currentNextAction);
    const nextKey = buildNextActionStepRequestKey(nextAction);
    const shouldRegenerateSteps = currentKey !== nextKey;

    setNextActionState({
      nextAction,
      loading: false,
      error: "",
      stepLoading: shouldRegenerateSteps ? false : nextActionStepLoading,
      stepError: shouldRegenerateSteps ? "" : nextActionStepError,
      steps: shouldRegenerateSteps ? [] : nextActionSteps
    });
    renderNextAction();

    if (shouldRegenerateSteps) {
      await generateNextActionSteps(nextAction);
    }
  }

  renderAiSuggestions();
  kpiTable.hidden = false;
  const archivedCount = allKpis.filter(isArchivedKpi).length;
  const visibilitySuffix = showArchivedKpis && archivedCount > 0
    ? `（アーカイブ${archivedCount}件を含む）`
    : archivedCount > 0
      ? `（アーカイブ${archivedCount}件は非表示）`
      : "";
  setKpiStatus(`${visibleKpis.length}件のKPIを表示しています。必要なKPIだけ開いて確認できます。${visibilitySuffix}`);
};

const loadRoutineTasks = async () => {
  if (!db || !kgiId) {
    latestRoutineTasks = [];
    renderRoutineTasks([]);
    return;
  }

  const snapshot = await getDocs(getRoutineTasksRef());
  latestRoutineTasks = snapshot.docs
    .map((taskDoc) => ({
      id: taskDoc.id,
      ...taskDoc.data(),
      taskKind: String(taskDoc.data()?.taskKind ?? TASK_KIND.ROUTINE),
      status: normalizeRoutineTaskStatus(taskDoc.data()?.status),
      cadence: normalizeRoutineTaskCadence(taskDoc.data()?.cadence ?? taskDoc.data()?.frequency)
    }))
    .filter((task) => task.taskKind === TASK_KIND.ROUTINE)
    .sort((a, b) => {
      const createdAtA = getComparableTimestamp(a?.createdAt);
      const createdAtB = getComparableTimestamp(b?.createdAt);
      return createdAtB - createdAtA;
    });

  const activeCount = latestRoutineTasks.filter((task) => task.status === ROUTINE_TASK_STATUS.ACTIVE).length;
  renderRoutineTasks(latestRoutineTasks);
  setRoutineTaskStatus(`active な運用タスクを ${activeCount}件表示しています。`);
};

aiSuggestionsContainer?.addEventListener("click", async (event) => {
  const button = event.target instanceof HTMLElement ? event.target.closest(".ai-add-button") : null;

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const isSubKgiButton = Boolean(button.dataset.subKgiId);
  const rawSuggestion = isSubKgiButton ? button.dataset.subKgi : button.dataset.suggestion;

  if (!rawSuggestion) {
    return;
  }

  let payload;

  try {
    payload = JSON.parse(rawSuggestion);
  } catch (error) {
    console.error(error);
    alert(isSubKgiButton ? "サブKGI候補データの読み込みに失敗しました。" : "KPI候補データの読み込みに失敗しました。");
    return;
  }

  if (button.dataset.subKgiId) {
    const subKgiId = button.dataset.subKgiId;

    if (!payload?.title || !kgiId || !db) {
      subKgiSaveError = "サブKGI候補を保存するための情報が不足しています。";
      renderAiSuggestions();
      return;
    }

    if (subKgiSavedIds.has(subKgiId) || subKgiSavingIds.has(subKgiId)) {
      return;
    }

    subKgiSaveError = "";
    subKgiSavingIds.add(subKgiId);
    renderAiSuggestions();

    try {
      await addDoc(getKgisRef(), {
        name: payload.title,
        goalText: payload.description,
        deadline: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: "active",
        overallProgress: 0,
        nextActionText: "",
        nextActionReason: ""
      });

      subKgiSavedIds.add(subKgiId);
      persistSubKgiSavedState();
      renderAiSuggestions();
    } catch (error) {
      console.error(error);
      subKgiSaveError = "サブKGI候補の保存に失敗しました。もう一度お試しください。";
      renderAiSuggestions();
    } finally {
      subKgiSavingIds.delete(subKgiId);
      renderAiSuggestions();
    }

    return;
  }

  if (!payload?.name || !kgiId) {
    alert("KPI候補を保存するための情報が不足しています。");
    return;
  }

  const suggestionKey = buildSuggestionKey(payload);

  if (existingKpiKeys.has(suggestionKey) || aiSavingKey === suggestionKey) {
    return;
  }

  aiSavingKey = suggestionKey;
  renderAiSuggestions();

  try {
    const existingSnapshot = await getDocs(getKpisQuery());
    const existingKpis = normalizeKpis(existingSnapshot.docs);
    const duplicateDiagnostics = buildKpiDuplicateDiagnostics({
      name: payload.name,
      phaseId: getDefaultPhaseId(),
      category: payload.category
    }, existingKpis);

    if (duplicateDiagnostics.exactDuplicate || duplicateDiagnostics.nearDuplicate || duplicateDiagnostics.categoryOverflow) {
      await loadKpis();
      return;
    }

    await addDoc(getKpisRef(), await buildKpiSavePayload({
      name: payload.name,
      description: payload.description,
      kpiType: payload.type,
      targetValue: payload.target,
      phaseId: getDefaultPhaseId(),
      order: existingSnapshot.size + 1,
      category: payload.category,
      source: "ai"
    }));

    await loadKpis();
  } catch (error) {
    console.error(error);
    alert("KPI候補の保存に失敗しました。もう一度お試しください。");
  } finally {
    aiSavingKey = "";
    renderAiSuggestions();
  }
});

generateRoadmapKpisButton?.addEventListener("click", async () => {
  if (roadmapKpiLoading || !currentKgiData || currentRoadmapPhases.length === 0) {
    return;
  }

  if (initialDetailEntryState) {
    initialDetailEntryState = {
      ...initialDetailEntryState,
      roadmapKpiStarted: true
    };
    persistInitialDetailEntryState();
    updateInitialRoadmapKpiGuide(latestRenderedKpis.length);
  }

  setRoadmapKpiLoading(true);
  setRoadmapKpiError("");
  setKpiStatus("ロードマップからKPIを作成しています...");

  try {
    const generatedKpis = await requestRoadmapGeneratedKpis();
    const { savedCount, skippedCount } = await saveRoadmapGeneratedKpis(generatedKpis);
    await loadKpis();

    if (savedCount > 0 && skippedCount > 0) {
      setRoadmapKpiError(`新規に${savedCount}件のKPIを保存しました（${skippedCount}件は既存のためスキップ）。`, "info");
      setKpiStatus(`新規に${savedCount}件のKPIを保存しました（${skippedCount}件は既存のためスキップ）。`);
    } else if (savedCount > 0) {
      setRoadmapKpiError(`新規に${savedCount}件のKPIを保存しました。`, "info");
      setKpiStatus(`新規に${savedCount}件のKPIを保存しました。`);
    } else if (skippedCount > 0) {
      setRoadmapKpiError("新規保存はありませんでした（既存KPIを再利用しています）。", "info");
      setKpiStatus("新規保存はありませんでした（既存KPIを再利用しています）。");
    } else {
      setRoadmapKpiError("KPI候補はありましたが、保存対象はありませんでした。", "info");
      setKpiStatus("KPI候補はありましたが、保存対象はありませんでした。");
    }
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error && error.message ? error.message : "ロードマップからKPIを作成できませんでした";
    setRoadmapKpiError(errorMessage, "error");
    setKpiStatus(`ロードマップからのKPI作成に失敗しました: ${errorMessage}`, true);
  } finally {
    setRoadmapKpiLoading(false);
  }
});

generateAiKpisButton?.addEventListener("click", async () => {
  if (aiLoading) {
    return;
  }

  const goal = buildGoalForAi(currentKgiData);

  if (!goal) {
    setAiError("KPI案の生成に必要なKGI情報が不足しています");
    resetAiSuggestions();
    return;
  }

  setAiLoading(true);
  setAiError("");

  try {
    const response = await fetch("/api/generate-kpis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        goal,
        phase: getCurrentRoadmapPhase()?.title ?? getDefaultPhaseId(),
        existingKpis: latestRenderedKpis.map((kpi) => ({
          name: kpi?.name ?? "",
          description: kpi?.description ?? "",
          phaseId: kpi?.phaseId ?? "",
          category: getKpiCategory(kpi),
          status: normalizeKpiStatus(kpi?.status)
        }))
      })
    });

    const responseText = await response.text();
    let data = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse /api/generate-kpis response as JSON", parseError, responseText);
      }
    }

    if (!response.ok) {
      const apiErrorMessage = typeof data?.error === "string" && data.error.trim()
        ? data.error.trim()
        : responseText.trim() || `HTTP ${response.status}`;
      throw new Error(apiErrorMessage);
    }

    aiHasGenerated = true;
    subKgiSaveError = "";
    aiSuggestions = {
      resultKpis: Array.isArray(data?.resultKpis) ? data.resultKpis : [],
      actionKpis: Array.isArray(data?.actionKpis) ? data.actionKpis : [],
      subKgiCandidates: Array.isArray(data?.subKgiCandidates) ? data.subKgiCandidates : []
    };
    setAiError("");
    persistAiSuggestions();
    renderAiSuggestions();
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error && error.message ? error.message : "Unexpected server error";
    setAiError(`KPI案の生成に失敗しました: ${errorMessage}`);
    resetAiSuggestions();
  } finally {
    setAiLoading(false);
  }
});

addKpiButton.addEventListener("click", async () => {
  const name = kpiNameInput.value.trim();
  const description = kpiDescriptionInput.value.trim();
  const kpiType = kpiTypeInput.value === "action" ? "action" : "result";
  const category = normalizeKpiCategory(kpiCategoryInput?.value) || inferKpiCategory(name, description) || DEFAULT_KPI_CATEGORY;
  const deadline = kpiDeadlineInput.value.trim();

  if (!name) {
    alert("KPI名を入力してください。");
    return;
  }

  addKpiButton.disabled = true;

  try {
    const existingSnapshot = await getDocs(getKpisQuery());
    const existingKpis = normalizeKpis(existingSnapshot.docs);
    const duplicateDiagnostics = buildKpiDuplicateDiagnostics({ name, phaseId: getDefaultPhaseId(), category }, existingKpis);

    if (duplicateDiagnostics.exactDuplicate) {
      alert("同名のKPIが既に存在します。重複保存を停止しました。");
      return;
    }

    if (duplicateDiagnostics.nearDuplicate) {
      alert(`似たKPIが既にあります: ${duplicateDiagnostics.nearDuplicate.name}`);
      return;
    }

    if (duplicateDiagnostics.categoryOverflow) {
      alert(`同じフェーズ内の ${category} カテゴリKPIが多いため保存を停止しました。`);
      return;
    }

    await addDoc(getKpisRef(), await buildKpiSavePayload({
      name,
      description,
      kpiType,
      deadline,
      targetValue: 100,
      phaseId: getDefaultPhaseId(),
      order: existingSnapshot.size,
      category,
      source: "manual"
    }));

    kpiNameInput.value = "";
    kpiDescriptionInput.value = "";
    kpiTypeInput.value = "result";
    if (kpiCategoryInput) {
      kpiCategoryInput.value = "";
    }
    kpiDeadlineInput.value = "";

    await loadKpis();
  } catch (error) {
    console.error(error);
    alert("KPIの保存に失敗しました。");
    setKpiStatus("KPIの保存に失敗しました。Firestoreルールを確認してください。", true);
  } finally {
    addKpiButton.disabled = false;
  }
});

kpiTableBody.addEventListener("click", async (event) => {
  const primaryTaskActionButton = event.target instanceof HTMLElement ? event.target.closest("[data-kpi-primary-action]") : null;

  if (primaryTaskActionButton instanceof HTMLButtonElement) {
    const kpiId = primaryTaskActionButton.dataset.kpiPrimaryAction;
    const targetKpi = latestRenderedKpis.find((kpi) => kpi.id === kpiId);
    const taskCount = Array.isArray(targetKpi?.tasks) ? targetKpi.tasks.length : 0;

    if (kpiId) {
      if (taskCount > 0) {
        openTaskSectionForKpi(kpiId);
      } else if (taskFormOpenState[kpiId]) {
        taskFormOpenState = { ...taskFormOpenState, [kpiId]: false };
        rerenderCurrentKpis();
      } else {
        openTaskFormForKpi(kpiId);
      }
    }

    return;
  }

  const phaseToggleButton = event.target instanceof HTMLElement ? event.target.closest("[data-phase-toggle]") : null;

  if (phaseToggleButton instanceof HTMLButtonElement) {
    const groupKey = phaseToggleButton.dataset.phaseToggle;

    if (groupKey) {
      roadmapPhaseOpenState = { ...roadmapPhaseOpenState, [groupKey]: !isPhaseGroupOpen(groupKey) };
      rerenderCurrentKpis();
    }

    return;
  }

  const kpiToggleButton = event.target instanceof HTMLElement ? event.target.closest("[data-kpi-toggle]") : null;

  if (kpiToggleButton instanceof HTMLButtonElement) {
    const targetId = kpiToggleButton.dataset.kpiToggle;

    if (targetId) {
      kpiDetailOpenState = { ...kpiDetailOpenState, [targetId]: !kpiDetailOpenState[targetId] };
      rerenderCurrentKpis();
    }

    return;
  }

  const taskSectionToggleButton = event.target instanceof HTMLElement ? event.target.closest("[data-task-section-toggle]") : null;

  if (taskSectionToggleButton instanceof HTMLButtonElement) {
    const targetId = taskSectionToggleButton.dataset.taskSectionToggle;

    if (targetId) {
      taskSectionOpenState = { ...taskSectionOpenState, [targetId]: !taskSectionOpenState[targetId] };
      rerenderCurrentKpis();
    }

    return;
  }

  const reflectionSectionToggleButton = event.target instanceof HTMLElement ? event.target.closest("[data-reflection-section-toggle]") : null;

  if (reflectionSectionToggleButton instanceof HTMLButtonElement) {
    const targetId = reflectionSectionToggleButton.dataset.reflectionSectionToggle;

    if (targetId) {
      reflectionSectionOpenState = { ...reflectionSectionOpenState, [targetId]: !reflectionSectionOpenState[targetId] };
      rerenderCurrentKpis();
    }

    return;
  }

  const taskFormToggleButton = event.target instanceof HTMLElement ? event.target.closest("[data-task-form-toggle]") : null;

  if (taskFormToggleButton instanceof HTMLButtonElement) {
    const targetId = taskFormToggleButton.dataset.taskFormToggle;

    if (targetId) {
      if (taskFormOpenState[targetId]) {
        taskFormOpenState = { ...taskFormOpenState, [targetId]: false };
        rerenderCurrentKpis();
      } else {
        openTaskFormForKpi(targetId);
      }
    }

    return;
  }

  const taskAiToggleButton = event.target instanceof HTMLElement ? event.target.closest("[data-task-ai-toggle]") : null;

  if (taskAiToggleButton instanceof HTMLButtonElement) {
    const targetId = taskAiToggleButton.dataset.taskAiToggle;

    if (targetId) {
      taskAiPanelOpenState = { ...taskAiPanelOpenState, [targetId]: !taskAiPanelOpenState[targetId] };
      rerenderCurrentKpis();
    }

    return;
  }

  const generateButton = event.target instanceof HTMLElement ? event.target.closest("[data-task-ai-generate]") : null;
  const addButton = event.target instanceof HTMLElement ? event.target.closest(".task-ai-add-button") : null;

  if (!(generateButton instanceof HTMLButtonElement) && !(addButton instanceof HTMLButtonElement)) {
    return;
  }

  if (generateButton instanceof HTMLButtonElement) {
    const kpiTargetId = generateButton.dataset.taskAiGenerate;

    if (!kpiTargetId || taskAiLoadingByKpiId[kpiTargetId]) {
      return;
    }

    const kpiForAi = latestRenderedKpis.find((item) => item.id === kpiTargetId);
    const kpiName = typeof kpiForAi?.name === "string" ? kpiForAi.name.trim() : "";
    const kpiDescription = typeof kpiForAi?.description === "string" ? kpiForAi.description.trim() : "";
    const kpiType = kpiForAi?.kpiType === "action" ? "action" : "result";
    const targetValue = parsePositiveNumber(kpiForAi?.targetValue ?? kpiForAi?.target, 0);

    if (!currentKgiData?.name || !kpiName) {
      setTaskAiError(kpiTargetId, "Task案の生成に必要なKGIまたはKPI情報が不足しています。");
      rerenderCurrentKpis();
      return;
    }

    setTaskAiLoading(kpiTargetId, true);
    setTaskAiError(kpiTargetId, "");
    rerenderCurrentKpis();

    try {
      const nextSuggestions = await requestGeneratedTasksForKpi({
        ...kpiForAi,
        name: kpiName,
        description: kpiDescription === "-" ? "" : kpiDescription,
        kpiType,
        targetValue
      });
      setTaskAiSuggestions(kpiTargetId, nextSuggestions);
      setTaskAiError(kpiTargetId, "");
      taskAiPanelOpenState = { ...taskAiPanelOpenState, [kpiTargetId]: true };
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error && error.message ? error.message : "Unexpected server error";
      setTaskAiSuggestions(kpiTargetId, []);
      setTaskAiError(kpiTargetId, `Task案の生成に失敗しました: ${errorMessage}`);
    } finally {
      setTaskAiLoading(kpiTargetId, false);
      await loadKpis();
    }

    return;
  }

  if (addButton instanceof HTMLButtonElement) {
    const kpiTargetId = addButton.dataset.kpiId;
    const rawSuggestion = addButton.dataset.taskSuggestion;

    if (!kpiTargetId || !rawSuggestion) {
      return;
    }

    let suggestion;

    try {
      suggestion = JSON.parse(rawSuggestion);
    } catch (error) {
      console.error(error);
      setTaskAiError(kpiTargetId, "Task候補データの読み込みに失敗しました。");
      await loadKpis();
      return;
    }

    const suggestionKey = buildTaskSuggestionKey(suggestion);
    const savedSet = ensureTaskAiSavedSet(kpiTargetId);
    const savingSet = ensureTaskAiSavingSet(kpiTargetId);

    if (savedSet.has(suggestionKey) || savingSet.has(suggestionKey)) {
      return;
    }

    savingSet.add(suggestionKey);
    setTaskAiError(kpiTargetId, "");
    rerenderCurrentKpis();

    try {
      const taskSnapshot = await getDocs(getTasksRef(kpiTargetId));

      await addDoc(
        getTasksRef(kpiTargetId),
        normalizeGeneratedTaskDraft(suggestion, kpiTargetId, taskSnapshot.size)
      );

      savedSet.add(suggestionKey);
      const kpiSnapshot = await getDoc(getKpiRef(kpiTargetId));
      const kpiData = kpiSnapshot.exists() ? kpiSnapshot.data() : { target: 100 };
      await syncKpiProgressFromTasks(kpiTargetId, kpiData);
    } catch (error) {
      console.error(error);
      setTaskAiError(kpiTargetId, "Task候補の保存に失敗しました。もう一度お試しください。");
    } finally {
      savingSet.delete(suggestionKey);
      await loadKpis();
    }
  }
});

kpiTableBody.addEventListener("submit", async (event) => {
  const form = event.target.closest("form.task-form");
  if (!form) {
    return;
  }

  event.preventDefault();

  const kpiTargetId = form.dataset.kpiId;
  const formData = new FormData(form);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const priorityInput = Number(formData.get("priority"));
  const priority = Number.isFinite(priorityInput) ? priorityInput : 2;
  const assignee = String(formData.get("assignee") ?? "").trim();
  const doneDefinition = String(formData.get("doneDefinition") ?? "").trim();
  const ticketNote = String(formData.get("ticketNote") ?? "").trim();
  const taskStage = normalizeTaskStage(String(formData.get("stage") ?? "build"));
  const taskType = normalizeTaskType(String(formData.get("type") ?? "one_time"));
  const rawProgressValue = Number(formData.get("progressValue"));
  const progressValue = Number.isFinite(rawProgressValue) && rawProgressValue >= 0
    ? rawProgressValue
    : 1;

  if (!kpiTargetId || !title) {
    alert("Task名を入力してください。");
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const taskSnapshot = await getDocs(getTasksRef(kpiTargetId));
    const taskPayload = {
      title,
      description,
      kpiId: kpiTargetId,
      taskKind: TASK_KIND.KPI,
      type: taskType,
      stage: taskStage,
      dependsOnTaskIds: [],
      status: "todo",
      progressValue,
      deadline,
      dueDate: deadline,
      priority,
      assignee,
      doneDefinition,
      ticketStatus: "backlog",
      ticketNote,
      order: taskSnapshot.size,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isSuggestedByAI: false,
      checkStatus: "not_checked",
      checkComment: "",
      checkResult: "",
      checkRecordedAt: null
    };

    if (taskType === "repeatable") {
      taskPayload.completedCount = 0;
    } else {
      taskPayload.isCompleted = false;
      taskPayload.contributedValue = 0;
      taskPayload.progressValue = progressValue;
      taskPayload.completedAt = null;
    }

    await addDoc(getTasksRef(kpiTargetId), taskPayload);
    form.reset();

    const kpiSnapshot = await getDoc(getKpiRef(kpiTargetId));
    const kpiData = kpiSnapshot.exists() ? kpiSnapshot.data() : { target: 100 };
    await syncKpiProgressFromTasks(kpiTargetId, kpiData);
    await loadKpis();
  } catch (error) {
    console.error(error);
    alert("Taskの保存に失敗しました。");
    setKpiStatus("Taskの保存に失敗しました。", true);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

routineTaskForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!db || !kgiId || !routineTaskForm) {
    return;
  }

  const formData = new FormData(routineTaskForm);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const cadence = normalizeRoutineTaskCadence(formData.get("cadence"));

  if (!title) {
    alert("運用タスクのタイトルを入力してください。");
    return;
  }

  const submitButton = routineTaskForm.querySelector("button[type='submit']");
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = true;
  }

  try {
    await addDoc(getRoutineTasksRef(), {
      kgiId,
      title,
      description,
      cadence,
      frequency: cadence,
      status: ROUTINE_TASK_STATUS.ACTIVE,
      taskKind: TASK_KIND.ROUTINE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    routineTaskForm.reset();
    const cadenceInput = document.getElementById("routineTaskCadence");
    if (cadenceInput instanceof HTMLSelectElement) {
      cadenceInput.value = "daily";
    }
    await loadRoutineTasks();
  } catch (error) {
    console.error(error);
    setRoutineTaskStatus("運用タスクの保存に失敗しました。", true);
    alert("運用タスクの保存に失敗しました。");
  } finally {
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
    }
  }
});

generateRoutineSuggestionsButton?.addEventListener("click", async () => {
  if (routineSuggestionLoading) {
    return;
  }

  routineSuggestionLoading = true;
  generateRoutineSuggestionsButton.disabled = true;
  setRoutineTaskStatus("現在のKGI / フェーズ状況に合わせてルーティン案を生成しています...");

  try {
    const generatedTemplates = await requestRoutineSuggestions();
    routineSuggestionTemplates = generatedTemplates.length > 0 ? generatedTemplates : DEFAULT_ROUTINE_TASK_TEMPLATES;
    routineSuggestionsVisible = true;
    routineSuggestionSelections = new Set(getRoutineSuggestionTemplates().map((task) => task.id));
    renderRoutineSuggestionList();
    setRoutineTaskStatus(generatedTemplates.length > 0
      ? "現在フェーズ向けのルーティン候補を更新しました。"
      : "候補が少なかったため、既定の候補を表示しています。");
  } catch (error) {
    console.error(error);
    routineSuggestionTemplates = DEFAULT_ROUTINE_TASK_TEMPLATES;
    routineSuggestionsVisible = true;
    routineSuggestionSelections = new Set(getRoutineSuggestionTemplates().map((task) => task.id));
    renderRoutineSuggestionList();
    setRoutineTaskStatus("AI候補の生成に失敗したため、既定の候補を表示しています。", true);
  } finally {
    routineSuggestionLoading = false;
    generateRoutineSuggestionsButton.disabled = false;
  }
});

routineSuggestionList?.addEventListener("change", (event) => {
  const checkbox = event.target instanceof HTMLInputElement
    ? event.target
    : null;
  const templateId = checkbox?.dataset.routineTemplateId;

  if (!checkbox || !templateId) {
    return;
  }

  if (checkbox.checked) {
    routineSuggestionSelections.add(templateId);
  } else {
    routineSuggestionSelections.delete(templateId);
  }

  updateRoutineSuggestionActionState();
});

addSelectedRoutineSuggestionsButton?.addEventListener("click", async () => {
  if (!db || !kgiId || routineSuggestionSelections.size === 0) {
    return;
  }

  const submitButton = addSelectedRoutineSuggestionsButton;
  submitButton.disabled = true;

  try {
    const existingTitles = buildExistingRoutineTaskTitleSet();
    const selectedTemplates = getRoutineSuggestionTemplates().filter((task) => routineSuggestionSelections.has(task.id));
    const templatesToAdd = selectedTemplates.filter((task) => !existingTitles.has(task.title));

    await Promise.all(templatesToAdd.map((task) => addDoc(getRoutineTasksRef(), {
      kgiId,
      title: task.title,
      description: task.description,
      cadence: normalizeRoutineTaskCadence(task.cadence),
      frequency: normalizeRoutineTaskCadence(task.cadence),
      status: ROUTINE_TASK_STATUS.ACTIVE,
      taskKind: TASK_KIND.ROUTINE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })));

    await loadRoutineTasks();
    setRoutineTaskStatus(
      templatesToAdd.length > 0
        ? `AI候補から ${templatesToAdd.length}件の運用タスクを追加しました。`
        : "選択した候補はすでに追加済みです。"
    );
  } catch (error) {
    console.error(error);
    setRoutineTaskStatus("AI候補からの運用タスク追加に失敗しました。", true);
    alert("AI候補からの運用タスク追加に失敗しました。");
  } finally {
    updateRoutineSuggestionActionState();
  }
});

nextActionContainer?.addEventListener("click", async (event) => {
  const button = event.target instanceof HTMLElement ? event.target.closest("[data-next-action-action]") : null;

  if (!(button instanceof HTMLButtonElement) || !currentNextAction || nextActionLoading) {
    return;
  }

  const action = button.dataset.nextActionAction;
  const taskId = currentNextAction.task?.id;
  const kpiTargetId = currentNextAction.kpiId;

  if (!taskId || !kpiTargetId || (action !== "start" && action !== "complete")) {
    return;
  }

  setNextActionState({
    loading: true,
    error: ""
  });
  renderNextAction();

  try {
    const nowTimestamp = serverTimestamp();
    const updatePayload = {
      updatedAt: nowTimestamp
    };

    if (action === "start") {
      updatePayload.status = "doing";
      updatePayload.ticketStatus = "doing";
      updatePayload.isCompleted = false;
      updatePayload.completedAt = null;
    } else {
      updatePayload.status = "done";
      updatePayload.ticketStatus = "done";
      updatePayload.isCompleted = true;
      updatePayload.completedAt = nowTimestamp;
      updatePayload.contributedValue = 1;
      updatePayload.progressValue = 1;
    }

    await updateDoc(doc(getKpisRef(), kpiTargetId, "tasks", taskId), updatePayload);

    latestRenderedKpis = latestRenderedKpis.map((kpi) => {
      if (kpi.id !== kpiTargetId) {
        return kpi;
      }

      const tasks = Array.isArray(kpi.tasks)
        ? kpi.tasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          return {
            ...task,
            status: action === "start" ? "doing" : "done",
            ticketStatus: action === "start" ? "doing" : "done",
            isCompleted: action === "complete",
            completedAt: action === "complete" ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString(),
            contributedValue: action === "complete" ? 1 : task.contributedValue,
            progressValue: action === "complete" ? 1 : task.progressValue
          };
        })
        : [];

      return {
        ...kpi,
        tasks
      };
    });

    renderKpiTable(latestRenderedKpis);
    const immediateNextAction = selectNextAction(latestRenderedKpis, currentRoadmapPhases);
    const shouldRegenerateSteps = buildNextActionStepRequestKey(currentNextAction) !== buildNextActionStepRequestKey(immediateNextAction);

    setNextActionState({
      nextAction: immediateNextAction,
      loading: false,
      error: "",
      stepLoading: shouldRegenerateSteps ? false : nextActionStepLoading,
      stepError: shouldRegenerateSteps ? "" : nextActionStepError,
      steps: shouldRegenerateSteps ? [] : nextActionSteps
    });
    renderNextAction();

    if (shouldRegenerateSteps && immediateNextAction) {
      generateNextActionSteps(immediateNextAction);
    }

    const kpiSnapshot = await getDoc(getKpiRef(kpiTargetId));
    const kpiData = kpiSnapshot.exists() ? kpiSnapshot.data() : { target: 100 };
    await syncKpiProgressFromTasks(kpiTargetId, kpiData);
    await loadKpis();
  } catch (error) {
    console.error(error);
    setNextActionState({
      loading: false,
      error: action === "start"
        ? "Next Action の開始に失敗しました"
        : "Next Action の完了に失敗しました"
    });
    renderNextAction();
  }
});

kpiTableBody.addEventListener("change", async (event) => {
  const ticketStatusSelect = event.target instanceof HTMLElement
    ? event.target.closest(".task-ticket-status-select")
    : null;

  if (ticketStatusSelect instanceof HTMLSelectElement) {
    const kpiTargetId = ticketStatusSelect.dataset.kpiId;
    const taskId = ticketStatusSelect.dataset.taskId;
    const selectedTicketStatus = ticketStatusSelect.value;

    if (!kpiTargetId || !taskId) {
      return;
    }

    ticketStatusSelect.disabled = true;

    try {
      await updateDoc(doc(getKpisRef(), kpiTargetId, "tasks", taskId), buildTaskTicketStatusUpdate(selectedTicketStatus));

      const kpiSnapshot = await getDoc(getKpiRef(kpiTargetId));
      const kpiData = kpiSnapshot.exists() ? kpiSnapshot.data() : { target: 100 };
      await syncKpiProgressFromTasks(kpiTargetId, kpiData);
      await loadKpis();
    } catch (error) {
      console.error(error);
      alert("チケット状態の更新に失敗しました。");
      setKpiStatus("チケット状態の更新に失敗しました。", true);
      await loadKpis();
    } finally {
      ticketStatusSelect.disabled = false;
    }

    return;
  }

  const input = event.target.closest(".task-completion-input");

  if (!input) {
    const checkInput = event.target instanceof HTMLElement
      ? event.target.closest(".task-check-form input[type='radio'], .task-check-form textarea")
      : null;

    if (!(checkInput instanceof HTMLElement)) {
      return;
    }

    const form = checkInput.closest(".task-check-form");

    if (!form) {
      return;
    }

    const taskId = form.dataset.taskId;

    if (!taskId) {
      return;
    }

    const selectedResult = form.querySelector("input[type='radio']:checked");
    const commentInput = form.querySelector("textarea[name='checkComment']");

    setTaskCheckUiState(taskId, {
      result: selectedResult instanceof HTMLInputElement ? selectedResult.value : "",
      comment: commentInput instanceof HTMLTextAreaElement ? commentInput.value : "",
      error: ""
    });
    return;
  }

  const kpiTargetId = input.dataset.kpiId;
  const taskId = input.dataset.taskId;
  const taskType = normalizeTaskType(input.dataset.taskType);

  if (!kpiTargetId || !taskId) {
    return;
  }

  input.disabled = true;

  try {
    const updatePayload = {
      updatedAt: serverTimestamp()
    };

    if (taskType === "repeatable") {
      updatePayload.completedCount = parsePositiveNumber(input.value, 0);
    } else {
      const isCompleted = Boolean(input.checked);
      updatePayload.status = isCompleted ? "done" : "todo";
      updatePayload.ticketStatus = isCompleted ? "done" : "backlog";
      updatePayload.isCompleted = isCompleted;
      updatePayload.contributedValue = isCompleted ? 1 : 0;
      updatePayload.progressValue = isCompleted ? 1 : 0;
      updatePayload.completedAt = isCompleted ? serverTimestamp() : null;

      if (isCompleted) {
        setTaskCheckUiState(taskId, {
          isEditing: true,
          isSaving: false,
          error: "",
          result: normalizeTaskCheckResult({}),
          comment: ""
        });
      } else {
        clearTaskCheckUiState(taskId);
      }
    }

    await updateDoc(doc(getKpisRef(), kpiTargetId, "tasks", taskId), updatePayload);

    const kpiSnapshot = await getDoc(getKpiRef(kpiTargetId));
    const kpiData = kpiSnapshot.exists() ? kpiSnapshot.data() : { target: 100 };
    await syncKpiProgressFromTasks(kpiTargetId, kpiData);
    await loadKpis();
  } catch (error) {
    console.error(error);
    alert("Task達成値の更新に失敗しました。");
    setKpiStatus("Task達成値の更新に失敗しました。", true);
  } finally {
    input.disabled = false;
  }
});

kpiTableBody.addEventListener("click", (event) => {
  const button = event.target instanceof HTMLElement ? event.target.closest("[data-task-check-edit]") : null;

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const taskId = button.dataset.taskCheckEdit;

  if (!taskId) {
    return;
  }

  setTaskCheckUiState(taskId, {
    isEditing: true,
    error: ""
  });
  rerenderCurrentKpis();
});

kpiTableBody.addEventListener("submit", async (event) => {
  const form = event.target.closest("form.task-check-form");

  if (!form) {
    return;
  }

  event.preventDefault();

  const taskId = form.dataset.taskId;
  const kpiTargetId = form.dataset.kpiId;
  const selectedResult = form.querySelector("input[type='radio']:checked");
  const commentInput = form.querySelector("textarea[name='checkComment']");
  const checkResult = selectedResult instanceof HTMLInputElement ? selectedResult.value : "";
  const checkComment = commentInput instanceof HTMLTextAreaElement ? commentInput.value.trim() : "";

  if (!taskId || !kpiTargetId) {
    return;
  }

  if (!TASK_CHECK_RESULT_OPTIONS.some((option) => option.value === checkResult)) {
    setTaskCheckUiState(taskId, {
      isEditing: true,
      isSaving: false,
      result: checkResult,
      comment: checkComment,
      error: "結果を選択してください。"
    });
    rerenderCurrentKpis();
    return;
  }

  setTaskCheckUiState(taskId, {
    isEditing: true,
    isSaving: true,
    result: checkResult,
    comment: checkComment,
    error: ""
  });
  rerenderCurrentKpis();

  try {
    await updateDoc(doc(getKpisRef(), kpiTargetId, "tasks", taskId), {
      checkStatus: "checked",
      checkComment,
      checkResult,
      checkRecordedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    latestRenderedKpis = latestRenderedKpis.map((kpi) => {
      if (kpi.id !== kpiTargetId) {
        return kpi;
      }

      return {
        ...kpi,
        tasks: Array.isArray(kpi.tasks)
          ? kpi.tasks.map((task) => task.id === taskId
            ? {
              ...task,
              checkStatus: "checked",
              checkComment,
              checkResult,
              checkRecordedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
            : task)
          : []
      };
    });

    clearTaskCheckUiState(taskId);
    renderKpiTable(latestRenderedKpis);
    await loadKpis();
  } catch (error) {
    console.error(error);
    setTaskCheckUiState(taskId, {
      isEditing: true,
      isSaving: false,
      result: checkResult,
      comment: checkComment,
      error: "振り返りの保存に失敗しました。時間をおいて再度お試しください。"
    });
    rerenderCurrentKpis();
  }
});

const teardownRealtimeListeners = () => {
  realtimeUnsubscribers.forEach((entry) => {
    try {
      if (typeof entry === "function") {
        entry();
      } else if (typeof entry?.unsubscribe === "function") {
        entry.unsubscribe();
      }
    } catch (error) {
      console.error("Failed to unsubscribe realtime listener", error);
    }
  });
  realtimeUnsubscribers = [];
  latestKpiDocs = [];
  latestTaskDocsByKpiId = new Map();
  latestKgiSnapshotData = null;
};

const scheduleSnapshotRefresh = () => {
  if (scheduledSnapshotRefresh) {
    return;
  }

  scheduledSnapshotRefresh = Promise.resolve().then(async () => {
    scheduledSnapshotRefresh = null;

    if (!db || !kgiId) {
      return;
    }

    try {
      if (latestKgiSnapshotData) {
        if (isArchivedKgi(latestKgiSnapshotData)) {
          redirectToKgiList();
          return;
        }

        const hydratedKgiData = await persistKgiScheduleIfNeeded(latestKgiSnapshotData);
        renderKgiMeta(hydratedKgiData);
      }
      await loadRoutineTasks();
      await loadKpis();
    } catch (error) {
      console.error("Failed to refresh realtime snapshot state", error);
    }
  });
};

const syncTaskListeners = (kpiDocs = []) => {
  const nextKpiIds = new Set(kpiDocs.map((docItem) => docItem.id));
  realtimeUnsubscribers = realtimeUnsubscribers.filter((entry) => {
    if (entry?.type !== "task") {
      return true;
    }

    if (nextKpiIds.has(entry.kpiId)) {
      return true;
    }

    latestTaskDocsByKpiId.delete(entry.kpiId);
    entry.unsubscribe();
    return false;
  });

  kpiDocs.forEach((docItem) => {
    const kpiIdForTask = docItem.id;
    const alreadyWatching = realtimeUnsubscribers.some((entry) => entry?.type === "task" && entry.kpiId === kpiIdForTask);

    if (alreadyWatching) {
      return;
    }

    const unsubscribe = onSnapshot(getTasksRef(kpiIdForTask), (snapshot) => {
      latestTaskDocsByKpiId.set(kpiIdForTask, snapshot.docs);
      scheduleSnapshotRefresh();
    }, (error) => {
      console.error(`Task listener failed for ${kpiIdForTask}`, error);
    });

    realtimeUnsubscribers.push({ type: "task", kpiId: kpiIdForTask, unsubscribe });
  });
};

const setupRealtimeListeners = () => {
  teardownRealtimeListeners();

  const kgiUnsubscribe = onSnapshot(getKgiRef(), (snapshot) => {
    latestKgiSnapshotData = snapshot.exists() ? snapshot.data() : null;
    scheduleSnapshotRefresh();
  }, (error) => {
    console.error("KGI realtime listener failed", error);
  });

  const kpiUnsubscribe = onSnapshot(getKpisQuery(), (snapshot) => {
    latestKpiDocs = snapshot.docs;
    syncTaskListeners(snapshot.docs);
    scheduleSnapshotRefresh();
  }, (error) => {
    console.error("KPI realtime listener failed", error);
  });

  const routineUnsubscribe = onSnapshot(getRoutineTasksRef(), () => {
    scheduleSnapshotRefresh();
  }, (error) => {
    console.error("Routine task realtime listener failed", error);
  });

  realtimeUnsubscribers = [
    { type: "kgi", unsubscribe: kgiUnsubscribe },
    { type: "kpi", unsubscribe: kpiUnsubscribe },
    { type: "routine", unsubscribe: routineUnsubscribe }
  ];
};

window.addEventListener("beforeunload", teardownRealtimeListeners);

const resolveKgiIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get("id");
  return typeof rawId === "string" ? rawId.trim() : "";
};

const resolvePhaseIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const rawPhaseId = params.get("phaseId");
  return typeof rawPhaseId === "string" ? rawPhaseId.trim() : "";
};

const initializeDetailPage = async () => {
  resetKpiSection();
  disableKpiActions();
  aiHasGenerated = false;
  aiSuggestions = emptyAiSuggestions();
  subKgiSavingIds = new Set();
  subKgiSavedIds = new Set();
  subKgiSaveError = "";
  taskAiLoadingByKpiId = {};
  taskAiErrorByKpiId = {};
  taskAiSuggestionsByKpiId = {};
  taskAiSavedByKpiId = {};
  taskAiSavingByKpiId = {};
  taskCheckUiState = {};
  autoTaskGenerationInFlight = false;
  autoTaskGenerationPromise = null;
  latestRenderedKpis = [];
  roadmapPhaseOpenState = {};
  kpiDetailOpenState = {};
  taskSectionOpenState = {};
  reflectionSectionOpenState = {};
  setAiError("");
  setStatus("読み込み中...");
  setKpiStatus("KPIの読み込み待機中...");
  setRoutineTaskStatus("運用タスクの読み込み待機中...");

  kgiId = resolveKgiIdFromUrl();
  roadmapKpiLoading = restoreRoadmapKpiLoadingState();
  initialDetailEntryState = restoreInitialDetailEntryState();

  if (!kgiId) {
    setStatus("KGI ID が指定されていません", true);
    setKpiStatus("KPIを表示できません。", true);
    setDebugSummary("id なし");
    updateDebugPanel([]);
    return;
  }

  resetArchiveDebugState(kgiId);
  setDebugSummary(`取得したid: ${kgiId}`);
  restoreAiSuggestions();
  restoreSubKgiSavedState();
  renderAiSuggestions();

  try {
    db = await getDb();

    const kgiSnapshot = await getDoc(getKgiRef());

    if (!kgiSnapshot.exists()) {
      setStatus("KGIが見つかりません", true);
      setKpiStatus("KPIを表示できません。", true);
      setDebugSummary(`取得したid: ${kgiId}`, "KGIなし");
      updateDebugPanel([]);
      return;
    }

    if (isArchivedKgi(kgiSnapshot.data())) {
      updateArchiveDebugState({
        targetKgiId: kgiId,
        targetCollectionPath: buildKgiDocPath(kgiId),
        archiveVerifySucceeded: true
      });
      setArchiveKgiStatus("このKGIはアーカイブ済みです。一覧へ戻ります。");
      redirectToKgiList();
      return;
    }

    const hydratedKgiData = await persistKgiScheduleIfNeeded(kgiSnapshot.data());
    selectedPhaseId = resolvePhaseIdFromUrl();
    renderKgiMeta(hydratedKgiData);
    enableKpiActions();
    setupRealtimeListeners();
    setStatus("");
    setDebugSummary(`取得したid: ${kgiId}`, "KGI読み込み成功");
    await loadRoutineTasks();
    await loadKpis();
  } catch (error) {
    console.error(error);
    reportDebugError("initializeDetailPage", error);
    setStatus("KGIの読み込みに失敗しました", true);
    setKpiStatus("KPIを表示できません。", true);
    setRoutineTaskStatus("運用タスクを表示できません。", true);
    setDebugSummary(`取得したid: ${kgiId}`, "KGI読み込み失敗");
    updateDebugPanel([]);
  }
};

initializeDetailPage();
