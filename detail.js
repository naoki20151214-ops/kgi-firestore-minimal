import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const kgiMeta = document.getElementById("kgiMeta");
const kpiStatusText = document.getElementById("kpiStatusText");
const nextActionContainer = document.getElementById("nextActionContainer");
const kpiTable = document.getElementById("kpiTable");
const kpiTableBody = document.getElementById("kpiTableBody");
const kpiNameInput = document.getElementById("kpiName");
const kpiDescriptionInput = document.getElementById("kpiDescription");
const kpiTypeInput = document.getElementById("kpiType");
const kpiDeadlineInput = document.getElementById("kpiDeadline");
const addKpiButton = document.getElementById("addKpiButton");
const overallProgressValue = document.getElementById("overallProgressValue");
const overallProgressFill = document.getElementById("overallProgressFill");
const overallProgressCaption = document.getElementById("overallProgressCaption");
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
let currentKgiData = null;
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
let taskCheckUiState = {};
const getAiSuggestionStorageKey = () => kgiId ? `kgi-detail-ai-suggestions:${kgiId}` : "";
const getSubKgiSavedStorageKey = () => kgiId ? `kgi-detail-subkgi-saved:${kgiId}` : "";
const TASK_CHECK_RESULT_OPTIONS = [
  { value: "as_planned", label: "予定通りできた" },
  { value: "harder_than_expected", label: "思ったより大変だった" },
  { value: "needs_improvement", label: "完了したがやり方を見直したい" },
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

const disableKpiActions = () => {
  addKpiButton.disabled = true;
  if (generateAiKpisButton) {
    generateAiKpisButton.disabled = true;
  }
};

const enableKpiActions = () => {
  addKpiButton.disabled = false;
  if (generateAiKpisButton) {
    generateAiKpisButton.disabled = false;
  }
};

const resetKpiSection = () => {
  currentKgiData = null;
  kgiMeta.hidden = true;
  kgiMeta.innerHTML = "";
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
  type: normalizeSuggestionType(item?.type, fallbackType)
});

const buildTaskSuggestionKey = (item) => JSON.stringify({
  title: displaySuggestionText(item?.title),
  description: displaySuggestionText(item?.description),
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

  const loadingMarkup = isLoading
    ? '<p class="hint">AIがTask案を作成中...</p>'
    : "";
  const errorMarkup = errorMessage
    ? `<p class="hint error">${errorMessage}</p>`
    : "";

  let listMarkup = "";

  if (!isLoading && suggestions.length === 0) {
    listMarkup = '<p class="hint">候補なし</p>';
  } else if (suggestions.length > 0) {
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
      <div class="ai-actions task-ai-actions">
        <button
          class="button"
          type="button"
          data-task-ai-generate="${kpi.id}"
          ${isLoading ? "disabled" : ""}
        >AIでTask案を作る</button>
        ${loadingMarkup}
      </div>
      <p class="hint">過去の振り返りを反映して提案しています。</p>
      ${errorMarkup}
      <div class="task-ai-suggestions">${listMarkup}</div>
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
        ${targetValue}
      </li>
    `;
  }).join("");

  container.innerHTML = `<ul class="ai-suggestion-list">${listMarkup}</ul>`;
};

renderAiSuggestions();

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

const displayGoalText = (goalText) => {
  if (typeof goalText !== "string") {
    return "-";
  }

  const trimmed = goalText.trim();
  return trimmed || "-";
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

const formatPercent = (value) => `${Math.round(value)}%`;

const clampPercent = (value) => Math.max(0, Math.min(100, value));

const displayDescription = (description) => {
  if (typeof description !== "string") {
    return "-";
  }

  const trimmed = description.trim();
  return trimmed || "-";
};

const parsePositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

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

const selectNextAction = (kpis) => {
  const candidates = (Array.isArray(kpis) ? kpis : []).flatMap((kpi) => {
    const tasks = Array.isArray(kpi?.tasks) ? kpi.tasks : [];

    return tasks
      .filter((task) => !getTaskIsCompleted(task))
      .map((task) => ({
        task,
        kpiId: kpi.id,
        kpiName: kpi.name ?? "",
        ticketStatusRank: ["doing", "ready", "backlog", "done"].indexOf(normalizeTaskTicketStatus(task)),
        priorityRank: getComparablePriority(task.priority),
        deadlineRank: getComparableDeadline(getTaskDueDate(task) || task.deadline),
        createdAtRank: getComparableCreatedAt(task.createdAt)
      }));
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.ticketStatusRank !== b.ticketStatusRank) {
      return a.ticketStatusRank - b.ticketStatusRank;
    }

    if (a.priorityRank !== b.priorityRank) {
      return a.priorityRank - b.priorityRank;
    }

    if (a.deadlineRank !== b.deadlineRank) {
      return a.deadlineRank - b.deadlineRank;
    }

    if (a.createdAtRank !== b.createdAtRank) {
      return a.createdAtRank - b.createdAtRank;
    }

    return String(a.task.id ?? "").localeCompare(String(b.task.id ?? ""), "ja");
  });

  return candidates[0];
};

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

const FALLBACK_NEXT_ACTION_STEPS = [
  "タスク内容を読み直す",
  "必要な作業を3つに分ける",
  "最初の1つをすぐ始める"
];

const sanitizeNextActionSteps = (steps) => {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((step) => typeof step === "string" ? step.trim() : "")
    .filter((step) => step.length > 0)
    .slice(0, 5);
};

const getFallbackNextActionSteps = (reason) => {
  console.warn("Using fallback next action steps", { reason, fallbackSteps: FALLBACK_NEXT_ACTION_STEPS });
  return FALLBACK_NEXT_ACTION_STEPS.slice();
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
    nextActionContainer.innerHTML = '<p class="next-action-empty">今やるべき未完了Taskはありません</p>';
    return;
  }

  const { task, kpiName } = currentNextAction;
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
  const fallbackStepListMarkup = `<ol class="next-action-step-list">${getFallbackNextActionSteps(nextActionStepError ? "render_error" : "render_missing_steps").map((step) => `<li>${step}</li>`).join("")}</ol>`;
  const stepContent = nextActionStepLoading
    ? '<p class="hint">小ステップを準備中...</p>'
    : nextActionStepError
      ? `<div><p class="hint">${nextActionStepError}</p>${fallbackStepListMarkup}</div>`
      : nextActionSteps.length > 0
        ? `<ol class="next-action-step-list">${nextActionSteps.map((step) => `<li>${step}</li>`).join("")}</ol>`
        : fallbackStepListMarkup;
  const errorMarkup = nextActionError
    ? `<p class="hint error">${nextActionError}</p>`
    : "";

  nextActionContainer.innerHTML = `
    ${errorMarkup}
    <p class="next-action-title">${task.title ?? "-"}</p>
    <div class="row"><strong>補足説明</strong><span>${displayDescription(task.description)}</span></div>
    <div class="row"><strong>所属KPI名</strong><span>${kpiName || "-"}</span></div>
    <div class="row"><strong>優先度</strong><span>${displayTaskPriority(task.priority)}</span></div>
    <div class="row"><strong>期限</strong><span>${deadline}</span></div>
    <div class="row"><strong>残り日数</strong><span class="${remaining.isOverdue ? "overdue-text" : ""}">${remaining.remainingText}</span></div>
    <div class="row"><strong>状態</strong><span class="next-action-status-row"><span class="status-badge ${getTaskStatusClassName(taskStatus)}">${getTaskStatusLabel(taskStatus)}</span></span></div>
    <div class="row"><strong>チケット状態</strong><span class="next-action-status-row"><span class="status-badge ${getTaskTicketStatusClassName(normalizeTaskTicketStatus(task))}">${getTaskTicketStatusLabel(normalizeTaskTicketStatus(task))}</span></span></div>
    <div class="next-action-actions">
      ${canStart ? '<button class="button" type="button" data-next-action-action="start">開始する</button>' : ""}
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
  const reflectionSignature = buildNextActionReflectionSignature(recentReflections);
  const simpleHash = hashNextActionStepContext(taskTitle, taskDescription, reflectionSignature);

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
      console.log("[next-action-steps] cache miss", { taskId, storageKey });
      return null;
    }

    const parsed = JSON.parse(raw);
    const steps = sanitizeNextActionSteps(parsed?.steps);

    if (parsed?.taskId !== taskId || steps.length < 3) {
      console.log("[next-action-steps] cache miss", { taskId, storageKey, reason: "invalid_payload" });
      return null;
    }

    console.log("[next-action-steps] cache hit", { taskId, storageKey });
    return {
      taskId,
      steps,
      updatedAt: typeof parsed?.updatedAt === "number" ? parsed.updatedAt : Date.now()
    };
  } catch (error) {
    console.error("Failed to read next action steps cache", error);
    return null;
  }
};

const writeCachedNextActionSteps = ({ storageKey, taskId, steps }) => {
  const normalizedSteps = sanitizeNextActionSteps(steps);

  if (!storageKey || !taskId || normalizedSteps.length < 3) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({
      taskId,
      steps: normalizedSteps,
      updatedAt: Date.now()
    }));
    console.log("[next-action-steps] cache write", { taskId, storageKey, stepsCount: normalizedSteps.length });
  } catch (error) {
    console.error("Failed to persist next action step cache", error);
  }
};

const generateNextActionSteps = async (nextAction) => {
  const recentReflections = buildRecentReflections(latestRenderedKpis, { preferredKpiId: nextAction?.kpiId, limit: 5 });
  const cacheContext = buildNextActionStepCacheContext(nextAction, recentReflections);
  const { requestKey, storageKey, taskId } = cacheContext;

  if (!nextAction?.task?.title || !nextAction?.kpiName) {
    const fallbackSteps = getFallbackNextActionSteps("missing_task_context");
    if (storageKey && taskId) {
      writeCachedNextActionSteps({ storageKey, taskId, steps: fallbackSteps });
    }
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

  console.log("[next-action-steps] api call", { taskId, requestKey, willCallApi: true });

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

    const nextSteps = sanitizeNextActionSteps(data?.steps);
    const resolvedSteps = nextSteps.length >= 3 ? nextSteps : getFallbackNextActionSteps(response.ok ? "api_missing_steps" : `http_${response.status}`);
    const fallbackMessage = isFallbackNextActionSteps(resolvedSteps)
      ? "小ステップの自動生成に失敗したため、代替ステップを表示しています。"
      : "";

    if (storageKey && taskId) {
      writeCachedNextActionSteps({ storageKey, taskId, steps: resolvedSteps });
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

    const fallbackSteps = getFallbackNextActionSteps("fetch_error");
    if (storageKey && taskId) {
      writeCachedNextActionSteps({ storageKey, taskId, steps: fallbackSteps });
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
        <div class="task-check-saved-item"><strong>コメント</strong><span>${escapeHtml(savedComment || "（コメントなし）")}</span></div>
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
          <span class="task-check-label">コメント</span>
          <textarea
            name="checkComment"
            rows="3"
            placeholder="やってみて気づいたこと・次回の改善点"
            ${uiState.isSaving ? "disabled" : ""}
          >${escapeHtml(uiState.comment)}</textarea>
        </label>
        <p class="hint">結果は必須です。コメントは空でも保存できます。</p>
        ${errorMarkup}
        <div class="task-check-actions">
          <button class="button" type="submit" ${uiState.isSaving ? "disabled" : ""}>${uiState.isSaving ? "保存中..." : "振り返りを保存"}</button>
        </div>
      </form>
    `
    : "";

  return `
    <div class="task-check-panel">
      <h4 class="task-check-title">振り返り</h4>
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

const renderOverallProgress = (kpis) => {
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

const getKgisRef = () => collection(db, "kgis");
const getKgiRef = () => doc(getKgisRef(), kgiId);
const getKpisRef = () => collection(db, "kpis");
const getKpisQuery = () => query(getKpisRef(), where("kgiId", "==", kgiId));
const getTasksRef = (kpiId) => collection(getKpisRef(), kpiId, "tasks");
const getKpiRef = (kpiId) => doc(getKpisRef(), kpiId);

const renderKgiMeta = (kgiData) => {
  currentKgiData = kgiData ?? null;
  const deadline = displayDeadline(kgiData.deadline);
  const deadlineInfo = calcRemainingDays(deadline === "未設定" ? "" : deadline);

  kgiMeta.hidden = false;
  kgiMeta.innerHTML = `
    <div class="deadline-highlight">
      <p class="deadline-label">残り日数</p>
      <p class="deadline-value ${deadlineInfo.isOverdue ? "overdue" : ""}">${deadlineInfo.remainingText}</p>
      <p class="deadline-date">期限: ${deadline}</p>
    </div>
    <div class="row"><strong>KGI名</strong><span>${kgiData.name ?? ""}</span></div>
    <div class="row"><strong>ゴール説明</strong><span>${displayGoalText(kgiData.goalText)}</span></div>
    <div class="row"><strong>期限</strong><span>${deadline}</span></div>
    <div class="row"><strong>作成日時</strong><span>${formatDate(kgiData.createdAt)}</span></div>
  `;
};

const normalizeKpis = (docs) => docs
  .map((kpiDoc) => ({ id: kpiDoc.id, ...kpiDoc.data() }))
  .sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return 0;
  });

const normalizeTasks = (docs) => docs
  .map((taskDoc) => ({ id: taskDoc.id, ...taskDoc.data(), ...buildTaskTicketFields(taskDoc.data()) }))
  .sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return 0;
  });

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

const renderTaskRows = (kpiIdForTask, tasks) => {
  if (tasks.length === 0) {
    return '<p class="hint">Taskがまだありません。</p>';
  }

  const taskRows = tasks.map((task) => {
    const taskTitle = task.title ?? "";
    const taskDescription = displayDescription(task.description);
    const taskType = normalizeTaskType(task.type);
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
      <tr>
        <td>${escapeHtml(taskTitle || "-")}</td>
        <td>${taskDescription}</td>
        <td>${taskType}</td>
        <td>${contributedValue}</td>
        <td>
          ${taskType === "one_time"
    ? `<label><input type="checkbox" class="task-completion-input" data-kpi-id="${kpiIdForTask}" data-task-id="${task.id}" data-task-type="one_time" ${isCompleted ? "checked" : ""} /> 完了</label>`
    : `<input type="number" min="0" step="1" class="task-completion-input" data-kpi-id="${kpiIdForTask}" data-task-id="${task.id}" data-task-type="repeatable" value="${completedCount}" aria-label="${taskTitle || "Task"}の完了回数" />`}
        </td>
        <td>${taskDeadline}</td>
        <td>${taskDueDate}</td>
        <td class="${taskRemaining.isOverdue ? "overdue-text" : ""}">${taskRemaining.remainingText}</td>
        <td>${taskPriority}</td>
        <td>${ticketInfoMarkup}</td>
        <td>
          <div class="task-ticket-status-cell">
            <span class="status-badge ${getTaskTicketStatusClassName(ticketStatus)}">${getTaskTicketStatusLabel(ticketStatus)}</span>
            <select class="task-ticket-status-select" data-kpi-id="${kpiIdForTask}" data-task-id="${task.id}" aria-label="${escapeHtml(taskTitle || "Task")}のチケット状態">
              ${ticketStatusOptionsMarkup}
            </select>
          </div>
        </td>
      </tr>
      ${isTaskCheckAvailable(task)
    ? `
        <tr class="task-check-row">
          <td colspan="10">
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

const renderKpiTable = (kpis) => {
  latestRenderedKpis = Array.isArray(kpis) ? kpis : [];
  kpiTableBody.innerHTML = "";

  kpis.forEach((kpi) => {
    const row = document.createElement("tr");
    const progressPercent = displayProgress(kpi);
    const deadline = displayDeadline(kpi.deadline);
    const remaining = calcRemainingDays(deadline === "未設定" ? "" : deadline);
    const currentValue = parsePositiveNumber(kpi.currentValue, 0);

    row.innerHTML = `
      <td>${kpi.name ?? ""}</td>
      <td>${displayDescription(kpi.description)}</td>
      <td>${kpi.kpiType === "action" ? "action" : "result"}</td>
      <td>${currentValue}</td>
      <td class="kpi-progress-cell">
        <div class="progress-wrap">
          <div class="progress-bar" aria-label="${kpi.name ?? "KPI"}の進捗バー">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
          </div>
          <p class="progress-label">${formatPercent(progressPercent)}</p>
        </div>
      </td>
      <td>${deadline}</td>
      <td class="${remaining.isOverdue ? "overdue-text" : ""}">${remaining.remainingText}</td>
    `;

    const taskPanelRow = document.createElement("tr");
    const tasks = Array.isArray(kpi.tasks) ? kpi.tasks : [];
    taskPanelRow.className = "task-panel-row";
    taskPanelRow.innerHTML = `
      <td colspan="7">
        <div class="task-panel">
          <h3 class="task-panel-title">Task</h3>
          <form class="task-form" data-kpi-id="${kpi.id}">
            <div class="task-grid">
              <label>
                Task名
                <input name="title" type="text" placeholder="例: LPの改善案を3つ作る" required />
              </label>
              <label>
                補足説明
                <input name="description" type="text" placeholder="任意" />
              </label>
              <label>
                タイプ
                <select name="type" class="task-type-select">
                  <option value="one_time">one_time</option>
                  <option value="repeatable">repeatable</option>
                </select>
              </label>
              <label>
                進捗値
                <input name="progressValue" type="number" min="0" step="1" value="1" required />
              </label>
              <label>
                期限
                <input name="deadline" type="date" />
              </label>
              <label>
                優先度
                <input name="priority" type="number" min="1" step="1" value="2" />
              </label>
              <label>
                担当
                <input name="assignee" type="text" placeholder="例: 自分、ナオキ、外注先A" />
              </label>
              <label>
                完了条件
                <input name="doneDefinition" type="text" placeholder="例: PR作成まで、承認取得まで、初回送信20件完了まで" />
              </label>
              <label>
                メモ
                <input name="ticketNote" type="text" placeholder="任意" />
              </label>
            </div>
            <button class="button task-add-button" type="submit">Taskを追加</button>
          </form>
          ${renderTaskSuggestionList(kpi)}
          <div class="task-list-wrap">
            ${renderTaskRows(kpi.id, tasks)}
          </div>
        </div>
      </td>
    `;

    kpiTableBody.appendChild(row);
    kpiTableBody.appendChild(taskPanelRow);
  });
};

const rerenderCurrentKpis = () => {
  renderKpiTable(latestRenderedKpis);
};

const loadKpis = async () => {
  const snapshot = await getDocs(getKpisQuery());

  if (snapshot.empty) {
    kpiTableBody.innerHTML = "";
    latestRenderedKpis = [];
    kpiTable.hidden = true;
    renderOverallProgress([]);
    existingKpiKeys = new Set();
    taskAiSavedByKpiId = {};
    taskAiSavingByKpiId = {};
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
    renderAiSuggestions();
    setKpiStatus("KPIがまだありません。上のフォームから追加してください。");
    setDebugSummary(`KGI読み込み成功: ${kgiId}`, "KPI 0件", "Task 0件");
    updateDebugPanel([]);
    return;
  }

  const kpis = normalizeKpis(snapshot.docs);
  existingKpiKeys = new Set(kpis.map((kpi) => buildSavedSuggestionKeyFromKpi(kpi)));

  const kpisWithTasks = await Promise.all(
    kpis.map(async (kpi) => {
      const synced = await syncKpiProgressFromTasks(kpi.id, kpi);
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
        ...kpi,
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

  const totalTaskCount = kpisWithTasks.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0);
  setDebugSummary(
    `KGI読み込み成功: ${kgiId}`,
    totalTaskCount === 0 ? "Task 0件" : `Task ${totalTaskCount}件`,
    `KPI ${kpisWithTasks.length}件`
  );
  updateDebugPanel(kpisWithTasks.map((kpi) => kpi.debug));

  const nextAction = selectNextAction(kpisWithTasks);

  renderKpiTable(kpisWithTasks);
  renderOverallProgress(kpisWithTasks);

  if (!nextAction) {
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
  setKpiStatus(`${snapshot.size}件のKPIを表示しています。`);
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
    await addDoc(getKpisRef(), {
      kgiId: payload.kgiId,
      name: payload.name,
      description: payload.description,
      target: payload.target,
      targetValue: payload.target,
      type: payload.type,
      kpiType: payload.type,
      progressType: "task_based",
      currentValue: 0,
      unit: "pt",
      progress: 0,
      percentage: 0,
      order: existingKpiKeys.size + 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await loadKpis();
  } catch (error) {
    console.error(error);
    alert("KPI候補の保存に失敗しました。もう一度お試しください。");
  } finally {
    aiSavingKey = "";
    renderAiSuggestions();
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
      body: JSON.stringify({ goal })
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
  const deadline = kpiDeadlineInput.value.trim();

  if (!name) {
    alert("KPI名を入力してください。");
    return;
  }

  addKpiButton.disabled = true;

  try {
    const existingSnapshot = await getDocs(getKpisQuery());

    await addDoc(getKpisRef(), {
      kgiId,
      name,
      description,
      type: kpiType,
      kpiType,
      progressType: "task_based",
      target: 100,
      targetValue: 100,
      currentValue: 0,
      unit: "pt",
      deadline,
      progress: 0,
      percentage: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: "active",
      priority: 2,
      order: existingSnapshot.size
    });

    kpiNameInput.value = "";
    kpiDescriptionInput.value = "";
    kpiTypeInput.value = "result";
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
      const response = await fetch("/api/generate-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kgiName: currentKgiData.name ?? "",
          kgiGoalText: currentKgiData.goalText ?? "",
          kpiName,
          kpiDescription: kpiDescription === "-" ? "" : kpiDescription,
          kpiType,
          targetValue,
          recentReflections: buildRecentReflections(latestRenderedKpis, { preferredKpiId: kpiTargetId, limit: 5 })
        })
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

      const nextSuggestions = Array.isArray(data?.tasks) ? data.tasks : [];
      setTaskAiSuggestions(kpiTargetId, nextSuggestions);
      setTaskAiError(kpiTargetId, "");
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

      await addDoc(getTasksRef(kpiTargetId), {
        title: displaySuggestionText(suggestion?.title) === "-" ? "" : displaySuggestionText(suggestion?.title),
        description: displaySuggestionText(suggestion?.description) === "-" ? "" : displaySuggestionText(suggestion?.description),
        status: "todo",
        deadline: "",
        assignee: "",
        dueDate: "",
        doneDefinition: "",
        ticketStatus: "backlog",
        ticketNote: "",
        priority: Number.isFinite(Number(suggestion?.priority)) ? Number(suggestion.priority) : 2,
        order: taskSnapshot.size,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null,
        isSuggestedByAI: true,
        type: "one_time",
        progressValue: 1,
        contributedValue: 0,
        isCompleted: false,
        kpiId: kpiTargetId,
        checkStatus: "not_checked",
        checkComment: "",
        checkResult: "",
        checkRecordedAt: null
      });

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
      type: taskType,
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
      taskPayload.progressValue = 0;
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
    const immediateNextAction = selectNextAction(latestRenderedKpis);
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

const resolveKgiIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get("id");
  return typeof rawId === "string" ? rawId.trim() : "";
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
  latestRenderedKpis = [];
  setAiError("");
  setStatus("読み込み中...");
  setKpiStatus("KPIの読み込み待機中...");

  kgiId = resolveKgiIdFromUrl();

  if (!kgiId) {
    setStatus("KGI ID が指定されていません", true);
    setKpiStatus("KPIを表示できません。", true);
    setDebugSummary("id なし");
    updateDebugPanel([]);
    return;
  }

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

    renderKgiMeta(kgiSnapshot.data());
    enableKpiActions();
    setStatus("KGI詳細を表示しています。");
    setDebugSummary(`取得したid: ${kgiId}`, "KGI読み込み成功");
    await loadKpis();
  } catch (error) {
    console.error(error);
    reportDebugError("initializeDetailPage", error);
    setStatus("KGIの読み込みに失敗しました", true);
    setKpiStatus("KPIを表示できません。", true);
    setDebugSummary(`取得したid: ${kgiId}`, "KGI読み込み失敗");
    updateDebugPanel([]);
  }
};

initializeDetailPage();
