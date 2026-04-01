import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";
import { enhanceReadableText } from "./readable-text.js";
import { decideNowAction, getNowActionImportance } from "./now-action-engine.js";

const kgiNameElement = document.getElementById("kgiName");
const statusTextElement = document.getElementById("statusText");
const detailFieldsElement = document.getElementById("detailFields");
const goalDescriptionElement = document.getElementById("goalDescription");
const startDateElement = document.getElementById("startDate");
const targetDateElement = document.getElementById("targetDate");
const overviewSectionElement = document.getElementById("overviewSection");
const overviewSummaryGridElement = document.getElementById("overviewSummaryGrid");
const overviewDesignReasonElement = document.getElementById("overviewDesignReason");
const overviewDesignReasonListElement = document.getElementById("overviewDesignReasonList");
const nowActionCardElement = document.getElementById("nowActionCard");
const nowActionTypeBadgeElement = document.getElementById("nowActionTypeBadge");
const nowActionPriorityElement = document.getElementById("nowActionPriority");
const nowActionStageElement = document.getElementById("nowActionStage");
const nowActionTargetPhaseElement = document.getElementById("nowActionTargetPhase");
const nowActionTargetKpiElement = document.getElementById("nowActionTargetKpi");
const nowActionProgressListElement = document.getElementById("nowActionProgressList");
const nowActionTextElement = document.getElementById("nowActionText");
const nowActionLinkElement = document.getElementById("nowActionLink");
const roadmapSectionElement = document.getElementById("roadmapSection");
const roadmapListElement = document.getElementById("roadmapList");
const roadmapEmptyElement = document.getElementById("roadmapEmpty");
const kpiSummarySectionElement = document.getElementById("kpiSummarySection");
const kpiSummaryTextElement = document.getElementById("kpiSummaryText");

const setStatus = (text, isError = false) => {
  if (!statusTextElement) {
    return;
  }
  statusTextElement.textContent = text;
  statusTextElement.classList.toggle("error", isError);
};

const asDisplayText = (value, fallback = "-") => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const formatUnknownValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const fromUnixMs = new Date(value);
    if (!Number.isNaN(fromUnixMs.getTime())) {
      return fromUnixMs.toISOString().slice(0, 10);
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const pickFirstDisplayValue = (data, keys, fallback = "-") => {
  for (const key of keys) {
    const raw = data?.[key];
    const normalized = asDisplayText(formatUnknownValue(raw), "");
    if (normalized !== "") {
      return normalized;
    }
  }

  return fallback;
};

const toJapaneseDateLabel = (yearText, monthText, dayText) => {
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return `${yearText}-${monthText}-${dayText}`;
  }

  return `${year}年${month}月${day}日`;
};

const normalizeGoalDescription = (text) => {
  const raw = asDisplayText(text, "");
  if (!raw) {
    return "-";
  }

  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/(\d{4})\s*[./・\-年]\s*(\d{1,2})\s*[./・\-月]\s*(\d{1,2})\s*日?\s*までに/g, (match, year, month, day) =>
      `${toJapaneseDateLabel(year, month, day)}までに`
    )
    .replace(/\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*/g, "\n$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const normalizeRoadmapPhases = (phases) => {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases.map((phase, index) => {
    const phaseNumberRaw = Number(phase?.phaseNumber);
    const phaseNumber = Number.isFinite(phaseNumberRaw) ? phaseNumberRaw : index + 1;

    return {
      id: asDisplayText(phase?.id, `phase_${phaseNumber}`),
      title: pickFirstDisplayValue(phase, ["title", "name"], `フェーズ${index + 1}`),
      purpose: pickFirstDisplayValue(phase, ["description", "goal", "summary"], "説明は未設定です。"),
      deadline: pickFirstDisplayValue(phase, ["deadline", "targetDate", "dueDate"], "期限未設定"),
      kpiPlanningStatus: asDisplayText(phase?.kpiPlanningStatus, "draft"),
      phaseNumber
    };
  });
};

const PHASE_KPI_STATUS_LABELS = {
  no_kpi: "KPI未出力",
  draft: "KPI整理中",
  cleanup_needed: "KPI整理が必要",
  finalized: "KPI整理済み"
};

const PHASE_KPI_STATUS_CLASSES = {
  no_kpi: "is-empty",
  draft: "is-draft",
  cleanup_needed: "is-cleanup-needed",
  finalized: "is-finalized"
};

const ACTION_TYPE_META = {
  create_kpi: { label: "KPI作成", badgeClass: "is-kpi-create" },
  cleanup_kpi: { label: "KPI整理", badgeClass: "is-kpi-cleanup" },
  create_task: { label: "タスク作成", badgeClass: "is-task-create" },
  execute_task: { label: "タスク実行", badgeClass: "is-task-run" },
  resume_task: { label: "タスク再開", badgeClass: "is-task-run" },
  create_roadmap: { label: "ロードマップ作成", badgeClass: "is-kpi-create" },
  review: { label: "見直し", badgeClass: "is-review" }
};

const toStars = (level = 3) => {
  const safeLevel = Math.max(1, Math.min(5, Number(level) || 3));
  return `${"★".repeat(safeLevel)}${"☆".repeat(5 - safeLevel)}`;
};

const resolvePhaseKpiStatus = ({ phase, kpiCount = 0 }) => {
  if (!Number.isFinite(kpiCount) || kpiCount <= 0) {
    return { key: "no_kpi", label: PHASE_KPI_STATUS_LABELS.no_kpi };
  }

  const status = asDisplayText(phase?.kpiPlanningStatus, "draft");
  if (status === "cleanup_needed") {
    return { key: "cleanup_needed", label: PHASE_KPI_STATUS_LABELS.cleanup_needed };
  }
  if (status === "finalized") {
    return { key: "finalized", label: PHASE_KPI_STATUS_LABELS.finalized };
  }

  return { key: "draft", label: PHASE_KPI_STATUS_LABELS.draft };
};

const createSummaryIntro = (text, maxLength = 46) => {
  const normalized = asDisplayText(text, "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "説明は未設定です。";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
};

const buildPhaseProgressRows = ({ phases = [], kpiCountByPhaseId = new Map() }) => {
  return phases.map((phase, index) => {
    const kpiCount = Number(kpiCountByPhaseId.get(phase.id) ?? 0);
    const status = resolvePhaseKpiStatus({ phase, kpiCount });

    return {
      phase,
      index,
      kpiCount,
      status,
      deadline: asDisplayText(phase.deadline, "期限未設定")
    };
  });
};

const toTimestampMs = (value) => {
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : Number.POSITIVE_INFINITY;
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime()) ? value.getTime() : Number.POSITIVE_INFINITY;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
};

const createOverviewSummaryItems = (phaseRows = []) => {
  const counters = {
    total: phaseRows.length,
    finalized: 0,
    draft: 0,
    no_kpi: 0,
    cleanup_needed: 0
  };

  phaseRows.forEach((row) => {
    const key = row?.status?.key;
    if (Object.prototype.hasOwnProperty.call(counters, key)) {
      counters[key] += 1;
    }
  });

  return [
    { label: "全フェーズ", value: `${counters.total}` },
    { label: "KPI整理済み", value: `${counters.finalized}` },
    { label: "KPI整理中", value: `${counters.draft}` },
    { label: "KPI未出力", value: `${counters.no_kpi}` },
    { label: "KPI整理が必要", value: `${counters.cleanup_needed}` }
  ];
};

const createDesignReasonItems = (phaseRows = []) => {
  const hasEarlyPhaseInProgress = phaseRows.some((row) => row?.status?.key !== "finalized");
  const orderReason = hasEarlyPhaseInProgress
    ? "「考える → 作る → 公開する → 結果を見る」の順にすると、いま何を優先するかが見えやすく、迷いを減らせるからです。"
    : "「考える → 作る → 公開する → 結果を見る」の順にすると、各ステップの意味がつながり、振り返りもしやすくなるからです。";

  return [
    {
      title: "なぜこのフェーズ順なのか",
      body: orderReason
    },
    {
      title: "なぜこのフェーズにこのKPIを置くのか",
      body: "フェーズごとに見る数字を分けることで、設計では仮説の整理、公開では登録や継続利用のように、その時点で本当に必要な確認に集中できるからです。"
    },
    {
      title: "なぜKPI整理を先にやるのか",
      body: "KPIが曖昧なままタスクを増やすと、あとでやり直しが増えます。先にKPIをそろえると、無駄な作業を減らして前に進みやすくなるからです。"
    }
  ];
};

const renderDesignReasonBlock = (phaseRows = []) => {
  if (!overviewDesignReasonElement || !overviewDesignReasonListElement) {
    return;
  }

  overviewDesignReasonListElement.innerHTML = "";
  const items = createDesignReasonItems(phaseRows);

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const listItem = document.createElement("li");

    const title = document.createElement("p");
    title.className = "overview-design-item-title";
    title.textContent = asDisplayText(item.title, "この設計にした理由");

    const body = document.createElement("p");
    body.className = "overview-design-item-body";
    body.textContent = asDisplayText(item.body, "");

    listItem.append(title, body);
    fragment.appendChild(listItem);
  });

  overviewDesignReasonListElement.appendChild(fragment);
  overviewDesignReasonElement.hidden = items.length === 0;
};

const pickNowAction = ({ kgiId, phases = [], kpis = [], tasksByKpiId = new Map() }) => {
  const tasks = kpis.flatMap((kpi) => (tasksByKpiId.get(kpi.id) ?? []).map((task) => ({ ...task, kpiId: kpi.id })));
  const action = decideNowAction({
    kgis: [{ id: kgiId, name: "" }],
    phases: phases.map((phase) => ({ ...phase, kgiId })),
    kpis,
    tasks,
    scope: "kgi",
    kgiId
  });
  if (!action) {
    return null;
  }
  return {
    ...action,
    importanceLevel: getNowActionImportance(action.actionType)
  };
};

const renderNowActionCard = (action) => {
  if (
    !nowActionCardElement
    || !nowActionTypeBadgeElement
    || !nowActionPriorityElement
    || !nowActionStageElement
    || !nowActionTargetPhaseElement
    || !nowActionTargetKpiElement
    || !nowActionProgressListElement
    || !nowActionTextElement
    || !nowActionLinkElement
    || !action
  ) {
    if (nowActionCardElement) {
      nowActionCardElement.hidden = true;
    }
    return;
  }

  const actionMeta = ACTION_TYPE_META[action.actionType] ?? ACTION_TYPE_META.review;
  nowActionCardElement.hidden = false;
  nowActionTypeBadgeElement.textContent = actionMeta.label;
  nowActionTypeBadgeElement.className = `action-type-badge ${actionMeta.badgeClass}`;
  nowActionPriorityElement.innerHTML = `<span class="label">重要度</span><span class="stars">${toStars(action.importanceLevel)}</span>`;
  nowActionStageElement.textContent = `今いる段階: ${asDisplayText(action.stageLabel, "-")}`;
  nowActionTargetPhaseElement.textContent = `対象フェーズID: ${asDisplayText(action.targetPhaseId, "-")}`;
  nowActionTargetKpiElement.textContent = `対象KPIID: ${asDisplayText(action.targetKpiId, "-")}`;
  nowActionProgressListElement.innerHTML = "";
  const progressRows = [asDisplayText(action.progressSummary, "-")];
  progressRows.forEach((rowText) => {
    const item = document.createElement("li");
    item.textContent = asDisplayText(rowText, "-");
    nowActionProgressListElement.appendChild(item);
  });
  nowActionTextElement.textContent = asDisplayText(action.reason, "次にやることを確認してください。");
  nowActionLinkElement.textContent = asDisplayText(action.buttonLabel, "今やることへ進む");

  if (asDisplayText(action.href, "") !== "") {
    nowActionLinkElement.href = action.href;
    nowActionLinkElement.hidden = false;
  } else {
    nowActionLinkElement.hidden = true;
    nowActionLinkElement.removeAttribute("href");
  }
};

const renderOverviewPanel = ({
  kgiId,
  phases = [],
  kpis = [],
  tasksByKpiId = new Map(),
  kpiCountByPhaseId = new Map()
}) => {
  if (
    !overviewSectionElement
    || !overviewSummaryGridElement
  ) {
    return;
  }

  overviewSummaryGridElement.innerHTML = "";

  if (phases.length === 0) {
    overviewSectionElement.hidden = true;
    return;
  }

  const phaseRows = buildPhaseProgressRows({ phases, kpiCountByPhaseId });
  const summaryItems = createOverviewSummaryItems(phaseRows);
  const nowAction = pickNowAction({ kgiId, phaseRows, phases, kpis, tasksByKpiId });

  const summaryFragment = document.createDocumentFragment();
  summaryItems.forEach((item) => {
    const card = document.createElement("div");
    card.className = "overview-summary-card";

    const label = document.createElement("p");
    label.className = "overview-summary-label";
    label.textContent = item.label;

    const value = document.createElement("p");
    value.className = "overview-summary-value";
    value.textContent = item.value;

    card.append(label, value);
    summaryFragment.appendChild(card);
  });
  overviewSummaryGridElement.appendChild(summaryFragment);

  renderDesignReasonBlock(phaseRows);
  renderNowActionCard(nowAction);
  overviewSectionElement.hidden = false;
};

const renderRoadmap = ({ kgiId, phases = [], kpiCountByPhaseId = new Map() }) => {
  if (!roadmapSectionElement || !roadmapListElement || !roadmapEmptyElement) {
    return;
  }

  roadmapListElement.innerHTML = "";

  if (phases.length === 0) {
    roadmapSectionElement.hidden = false;
    roadmapEmptyElement.hidden = false;
    return;
  }

  const fragment = document.createDocumentFragment();

  phases.forEach((phase, index) => {
    const item = document.createElement("li");
    item.className = "roadmap-item";

    const details = document.createElement("details");
    details.open = false;

    const summary = document.createElement("summary");
    const summaryHeader = document.createElement("div");
    summaryHeader.className = "roadmap-summary-header";

    const summaryTitle = document.createElement("div");
    summaryTitle.className = "roadmap-summary-title";
    summaryTitle.textContent = `フェーズ${phase.phaseNumber ?? index + 1}: ${phase.title}`;

    const phaseKpiStatus = resolvePhaseKpiStatus({
      phase,
      kpiCount: Number(kpiCountByPhaseId.get(phase.id) ?? 0)
    });
    const statusBadge = document.createElement("span");
    statusBadge.className = `roadmap-status-badge ${PHASE_KPI_STATUS_CLASSES[phaseKpiStatus.key] ?? "is-draft"}`;
    statusBadge.textContent = phaseKpiStatus.label;

    const summaryIntro = document.createElement("p");
    summaryIntro.className = "roadmap-summary-intro";
    summaryIntro.textContent = createSummaryIntro(phase.purpose);

    const summaryDeadline = document.createElement("p");
    summaryDeadline.className = "roadmap-summary-deadline";
    summaryDeadline.textContent = `期限: ${asDisplayText(phase.deadline, "期限未設定")}`;

    summaryHeader.append(summaryTitle, statusBadge);
    summary.append(summaryHeader, summaryIntro, summaryDeadline);

    const titleLink = document.createElement("a");
    titleLink.className = "roadmap-title-link";
    titleLink.href = `./phase.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(phase.id)}`;
    titleLink.textContent = "このフェーズの詳細ページを開く";

    const purpose = document.createElement("p");
    purpose.className = "roadmap-description";
    purpose.textContent = asDisplayText(phase.purpose, "説明は未設定です。");
    enhanceReadableText(purpose, {
      lines: 5,
      formatAsSentenceBlocks: true
    });

    const body = document.createElement("div");
    body.className = "roadmap-body";
    body.append(purpose, titleLink);

    details.append(summary, body);
    item.appendChild(details);
    fragment.appendChild(item);
  });

  roadmapListElement.appendChild(fragment);
  roadmapEmptyElement.hidden = true;
  roadmapSectionElement.hidden = false;
};

const renderKpiSummary = ({ total = 0, completed = 0 } = {}) => {
  if (!kpiSummarySectionElement || !kpiSummaryTextElement) {
    return;
  }

  if (total <= 0) {
    kpiSummarySectionElement.hidden = true;
    return;
  }

  kpiSummaryTextElement.textContent = `このKGIには ${total}件のKPIがあり、完了は ${completed}件です。詳細は各フェーズページで確認します。`;
  kpiSummarySectionElement.hidden = false;
};

const loadKpiSummary = async (db, kgiId) => {
  try {
    const kpiSnapshot = await getDocs(query(collection(db, "kpis"), where("kgiId", "==", kgiId)));
    const kpiCountByPhaseId = new Map();
    const kpis = [];
    let total = 0;
    let completed = 0;

    kpiSnapshot.forEach((kpiDoc) => {
      total += 1;
      const data = kpiDoc.data();
      kpis.push({
        id: kpiDoc.id,
        phaseId: asDisplayText(data?.phaseId, ""),
        name: asDisplayText(data?.name, "名称未設定KPI"),
        createdAt: data?.createdAt,
        status: asDisplayText(data?.status, data?.isCompleted === true ? "completed" : "finalized")
      });

      if (data?.isCompleted === true) {
        completed += 1;
      }

      const phaseId = asDisplayText(data?.phaseId, "");
      if (!phaseId) {
        return;
      }
      kpiCountByPhaseId.set(phaseId, Number(kpiCountByPhaseId.get(phaseId) ?? 0) + 1);
    });

    renderKpiSummary({
      total,
      completed
    });
    const tasksByKpiId = new Map();
    const taskSnapshot = await getDocs(query(collection(db, "tasks"), where("kgiId", "==", kgiId)));
    taskSnapshot.forEach((taskDoc) => {
      const task = taskDoc.data();
      const kpiId = asDisplayText(task?.kpiId, "");
      if (!kpiId) {
        return;
      }
      const items = tasksByKpiId.get(kpiId) ?? [];
      items.push({
        id: taskDoc.id,
        status: asDisplayText(task?.status, "active"),
        isCompleted: task?.isCompleted === true
      });
      tasksByKpiId.set(kpiId, items);
    });

    return {
      kpiCountByPhaseId,
      kpis,
      tasksByKpiId
    };
  } catch (error) {
    console.warn("Failed to load KPI summary. Continue without summary.", {
      kgiId,
      error
    });
    kpiSummarySectionElement.hidden = true;
    return {
      kpiCountByPhaseId: new Map(),
      kpis: [],
      tasksByKpiId: new Map()
    };
  }
};

const renderDoc = ({ kgiId, data, kpiContext }) => {
  const titleCandidates = ["title", "name", "kgiName"];
  const goalCandidates = ["goalDescription", "goal", "description", "goalText"];
  const startDateCandidates = ["startDate", "createdDate", "createdAt"];
  const targetDateCandidates = ["targetDate", "deadline", "dueDate", "targetDeadline"];

  const name = pickFirstDisplayValue(data, titleCandidates, "KGI詳細");
  const description = normalizeGoalDescription(pickFirstDisplayValue(data, goalCandidates));
  const startDate = pickFirstDisplayValue(data, startDateCandidates);
  const targetDate = pickFirstDisplayValue(data, targetDateCandidates);
  const roadmapPhases = normalizeRoadmapPhases(data?.roadmapPhases);

  if (kgiNameElement) {
    kgiNameElement.textContent = name;
  }
  if (goalDescriptionElement) {
    goalDescriptionElement.textContent = description;
    enhanceReadableText(goalDescriptionElement, {
      lines: Number(goalDescriptionElement.dataset.lines) || 3,
      formatAsBulletSections: true,
      fallbackCharacterThreshold: 140
    });
  }
  if (startDateElement) {
    startDateElement.textContent = startDate;
  }
  if (targetDateElement) {
    targetDateElement.textContent = targetDate;
  }

  if (detailFieldsElement) {
    detailFieldsElement.hidden = false;
  }

  const kpiCountByPhaseId = kpiContext?.kpiCountByPhaseId ?? new Map();
  const kpis = Array.isArray(kpiContext?.kpis) ? kpiContext.kpis : [];
  const tasksByKpiId = kpiContext?.tasksByKpiId instanceof Map ? kpiContext.tasksByKpiId : new Map();

  renderOverviewPanel({ kgiId, phases: roadmapPhases, kpiCountByPhaseId, kpis, tasksByKpiId });
  renderRoadmap({ kgiId, phases: roadmapPhases, kpiCountByPhaseId });
  setStatus("");
};

const showLoadError = (message) => {
  if (detailFieldsElement) {
    detailFieldsElement.hidden = true;
  }
  if (roadmapSectionElement) {
    roadmapSectionElement.hidden = true;
  }
  if (overviewSectionElement) {
    overviewSectionElement.hidden = true;
  }
  if (nowActionCardElement) {
    nowActionCardElement.hidden = true;
  }
  if (kpiSummarySectionElement) {
    kpiSummarySectionElement.hidden = true;
  }
  setStatus(message, true);
};

const init = async () => {
  const searchParams = new URLSearchParams(window.location.search);
  const kgiId = searchParams.get("id")?.trim() ?? "";

  if (!kgiId) {
    showLoadError("読み込みに失敗しました。URLのKGI IDを確認してください。");
    return;
  }

  try {
    const db = await getDb();
    const kgiRef = doc(db, "kgis", kgiId);
    const kgiSnapshot = await getDoc(kgiRef);

    if (!kgiSnapshot.exists()) {
      showLoadError("このKGIは見つからないか、すでに存在しません");
      return;
    }

    const kpiContext = await loadKpiSummary(db, kgiId);
    renderDoc({ kgiId, data: kgiSnapshot.data(), kpiContext });
  } catch (error) {
    console.error("Failed to load detail document", {
      kgiId,
      error
    });
    showLoadError("読み込みに失敗しました。再読み込みしてください。");
  }
};

void init();
