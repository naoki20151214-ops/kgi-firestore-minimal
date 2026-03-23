import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const pageTitle = document.getElementById("pageTitle");
const pageLead = document.getElementById("pageLead");
const summaryGrid = document.getElementById("summaryGrid");
const backToDetailLink = document.getElementById("backToDetailLink");
const mindmapStatusText = document.getElementById("mindmapStatusText");
const mindmapTree = document.getElementById("mindmapTree");
const debugInfo = document.getElementById("debugInfo");

let kgiId = "";
let mindmapOpenState = {};

const debugState = {
  kgiId: "",
  firebaseConfigImport: "ok",
  loadState: "initializing",
  kgiFetch: "pending",
  kpiCount: 0,
  taskCount: 0,
  errorCode: "-",
  errorMessage: "-"
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const formatPercent = (value) => `${Math.round(value)}%`;
const clampPercent = (value) => Math.max(0, Math.min(100, value));

const setStatus = (message, isError = false) => {
  if (!statusText) {
    return;
  }

  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const setMindmapStatus = (message, isError = false) => {
  if (!mindmapStatusText) {
    return;
  }

  mindmapStatusText.textContent = message;
  mindmapStatusText.classList.toggle("error", isError);
};

const renderDebugInfo = () => {
  if (!debugInfo) {
    return;
  }

  debugInfo.innerHTML = `
    <div class="meta-item"><strong>取得した kgiId</strong><span>${escapeHtml(debugState.kgiId || "(未指定)")}</span></div>
    <div class="meta-item"><strong>KGI取得</strong><span>${escapeHtml(debugState.kgiFetch)}</span></div>
    <div class="meta-item"><strong>KPI件数</strong><span>${escapeHtml(`${debugState.kpiCount}件`)}</span></div>
    <div class="meta-item"><strong>Task件数</strong><span>${escapeHtml(`${debugState.taskCount}件`)}</span></div>
    <div class="meta-item"><strong>firebase-config.js import</strong><span>${escapeHtml(debugState.firebaseConfigImport)}</span></div>
    <div class="meta-item"><strong>読み込み状態</strong><span>${escapeHtml(debugState.loadState)}</span></div>
    <div class="meta-item"><strong>error.code</strong><span>${escapeHtml(debugState.errorCode)}</span></div>
    <div class="meta-item"><strong>error.message</strong><span>${escapeHtml(debugState.errorMessage)}</span></div>
  `;
};

const updateDebugState = (patch = {}) => {
  Object.assign(debugState, patch);
  renderDebugInfo();
};

const resolveKgiIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get("id");
  return typeof rawId === "string" ? rawId.trim() : "";
};

const getComparableCreatedAt = (value) => {
  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  return Number.MAX_SAFE_INTEGER;
};

const sortByCreatedAt = (items) => (Array.isArray(items) ? [...items] : []).sort((a, b) => {
  const createdAtA = getComparableCreatedAt(a?.createdAt);
  const createdAtB = getComparableCreatedAt(b?.createdAt);

  if (createdAtA !== createdAtB) {
    return createdAtA - createdAtB;
  }

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), "ja");
});

const getTaskIsCompleted = (task) => {
  if (typeof task?.isCompleted === "boolean") {
    return task.isCompleted;
  }

  if (typeof task?.isCompleted === "string") {
    return task.isCompleted === "true";
  }

  if (typeof task?.completed === "boolean") {
    return task.completed;
  }

  if (typeof task?.completionStatus === "string") {
    return task.completionStatus === "completed";
  }

  return task?.status === "done" || task?.status === "completed";
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

const isArchivedKpi = (kpi) => String(kpi?.status ?? "").trim().toLowerCase() === "archived";

const displayProgress = (kpi) => {
  const progress = Number(kpi?.progress ?? kpi?.percentage ?? kpi?.overallProgress ?? 0);
  return Number.isFinite(progress) ? clampPercent(progress) : 0;
};

const isCompletedKpi = (kpi) => {
  if (!kpi || isArchivedKpi(kpi)) {
    return false;
  }

  if (displayProgress(kpi) >= 100) {
    return true;
  }

  const tasks = Array.isArray(kpi?.tasks) ? kpi.tasks : [];
  return tasks.length > 0 && tasks.every((task) => getTaskIsCompleted(task));
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

const sortTasks = (tasks) => sortByCreatedAt(tasks).sort((a, b) => {
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

const buildMindmapBadges = (nodeType, status) => [nodeType, status]
  .filter(Boolean)
  .map((badge) => {
    const normalized = String(badge).trim().toLowerCase();
    const labelMap = {
      kgi: "KGI",
      phase: "フェーズ",
      kpi: "KPI",
      task: "Task",
      todo: "未着手",
      doing: "進行中",
      done: "完了"
    };

    return `<span class="mindmap-badge ${escapeHtml(normalized)}">${escapeHtml(labelMap[normalized] ?? badge)}</span>`;
  }).join("");

const getMindmapNodeStatus = (nodeType, item, context = {}) => {
  if (nodeType === "task") {
    return getTaskActionableStatus(item);
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

  if (nodeType === "phase") {
    if (kpis.length > 0 && kpis.every((kpi) => isCompletedKpi(kpi))) {
      return "done";
    }

    if (kpis.some((kpi) => Array.isArray(kpi?.tasks) && kpi.tasks.some((task) => getTaskActionableStatus(task) === "doing"))) {
      return "doing";
    }

    return "todo";
  }

  if (kpis.length > 0 && kpis.every((kpi) => isCompletedKpi(kpi))) {
    return "done";
  }

  if (kpis.some((kpi) => Array.isArray(kpi?.tasks) && kpi.tasks.some((task) => getTaskActionableStatus(task) === "doing"))) {
    return "doing";
  }

  return "todo";
};

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

const renderMindmapNode = ({ key, title, meta = "", href = "", nodeType = "task", status = "todo", isOpen = true, children = [] }) => {
  const hasChildren = Array.isArray(children) && children.length > 0;
  const childMarkup = hasChildren ? `<div class="mindmap-children">${children.join("")}</div>` : "";
  const tagName = href ? "a" : "div";
  const hrefAttr = href ? ` href="${escapeHtml(href)}"` : "";
  const clickableClass = href ? " is-clickable" : "";
  const lineMarkup = `
    <span class="mindmap-summary-line">
      ${hasChildren ? '<span class="mindmap-caret">›</span>' : '<span class="mindmap-leaf-spacer" aria-hidden="true"></span>'}
      <${tagName} class="mindmap-link${clickableClass} status-${escapeHtml(status)}"${hrefAttr}>
        <span class="mindmap-link-title">${escapeHtml(title || "未設定")}</span>
        <span class="mindmap-badges">${buildMindmapBadges(nodeType, status)}</span>
        ${meta ? `<span class="mindmap-link-meta">${escapeHtml(meta)}</span>` : ""}
      </${tagName}>
    </span>
  `;

  if (!hasChildren) {
    return `<div class="mindmap-node level-${escapeHtml(nodeType)}">${lineMarkup}</div>`;
  }

  return `
    <div class="mindmap-node ${nodeType === "kgi" ? "level-root" : `level-${escapeHtml(nodeType)}`}">
      <details class="mindmap-toggle" data-mindmap-key="${escapeHtml(key)}" ${isOpen ? "open" : ""}>
        <summary class="mindmap-summary">${lineMarkup}</summary>
        ${childMarkup}
      </details>
    </div>
  `;
};

const normalizeRoadmapStatus = (status) => (status === "done" || status === "current" || status === "next" || status === "future" ? status : "future");

const normalizeRoadmapPhases = (phases) => {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases.map((phase, index) => ({
    id: typeof phase?.id === "string" && phase.id.trim() ? phase.id.trim() : `phase_${index + 1}`,
    title: typeof phase?.title === "string" && phase.title.trim() ? phase.title.trim() : `フェーズ${index + 1}`,
    description: typeof phase?.description === "string" && phase.description.trim() ? phase.description.trim() : "説明はまだありません",
    status: normalizeRoadmapStatus(phase?.status),
    phaseNumber: Number.isFinite(Number(phase?.phaseNumber)) ? Number(phase.phaseNumber) : index + 1
  }));
};

const resolvePhaseMetaForKpi = (kpi, phases = []) => {
  const phaseId = typeof kpi?.phaseId === "string" ? kpi.phaseId.trim() : "";
  const phaseById = phases.find((phase) => phase.id === phaseId) ?? null;
  const storedPhaseName = typeof kpi?.phaseName === "string" && kpi.phaseName.trim() ? kpi.phaseName.trim() : "";
  const storedPhaseNumber = Number.isFinite(Number(kpi?.phaseNumber)) ? Number(kpi.phaseNumber) : null;

  if (phaseById) {
    return {
      phaseId: phaseById.id,
      phaseName: phaseById.title,
      phaseNumber: Number.isFinite(Number(phaseById.phaseNumber)) ? Number(phaseById.phaseNumber) : null,
      phaseStatus: phaseById.status
    };
  }

  if (phaseId || storedPhaseName || storedPhaseNumber) {
    return {
      phaseId,
      phaseName: storedPhaseName || "未分類",
      phaseNumber: storedPhaseNumber,
      phaseStatus: "future"
    };
  }

  return {
    phaseId: "",
    phaseName: "未分類",
    phaseNumber: null,
    phaseStatus: "future"
  };
};

const renderSummary = (kgi, phases, kpis) => {
  if (!summaryGrid) {
    return;
  }

  const taskCount = kpis.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0);
  summaryGrid.innerHTML = `
    <div class="meta-item"><strong>KGI</strong><span>${escapeHtml(kgi?.name ?? "未設定")}</span></div>
    <div class="meta-item"><strong>フェーズ</strong><span>${phases.length}件</span></div>
    <div class="meta-item"><strong>KPI</strong><span>${kpis.length}件</span></div>
    <div class="meta-item"><strong>Task</strong><span>${taskCount}件</span></div>
  `;
};

const renderEmptyMap = (message) => {
  if (!mindmapTree) {
    return;
  }

  mindmapTree.innerHTML = `<p class="mindmap-empty">${escapeHtml(message)}</p>`;
};

const renderMindmap = (kgi, phases, kpis) => {
  if (!mindmapTree) {
    return;
  }

  if (!kgi?.name) {
    renderEmptyMap("KGIを読み込めると全体マップを表示します。");
    setMindmapStatus("KGIの読み込み後にマップを生成します。");
    return;
  }

  const taskCount = kpis.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0);
  renderSummary(kgi, phases, kpis);

  const phaseBuckets = (Array.isArray(phases) ? phases : []).map((phase) => ({
    ...phase,
    kpis: []
  }));
  const unclassifiedKpis = [];

  kpis.forEach((kpi) => {
    const resolvedPhase = resolvePhaseMetaForKpi(kpi, phases);
    const enrichedKpi = { ...kpi, ...resolvedPhase };
    const bucket = resolvedPhase.phaseId
      ? phaseBuckets.find((phase) => phase.id === resolvedPhase.phaseId)
      : null;

    if (bucket) {
      bucket.kpis.push(enrichedKpi);
      return;
    }

    unclassifiedKpis.push(enrichedKpi);
  });

  const buildKpiNode = (kpi, index) => {
    const tasks = sortTasks(kpi.tasks);
    const kpiKey = `kpi:${kpi.id}`;
    const taskChildren = tasks.map((task, taskIndex) => renderMindmapNode({
      key: `task:${kpi.id}:${task.id ?? taskIndex}`,
      title: task.title ?? `Task ${taskIndex + 1}`,
      meta: task.description ? String(task.description).trim() : `${taskIndex + 1}件目`,
      href: `./detail.html?id=${encodeURIComponent(kgiId)}#task-${encodeURIComponent(task.id ?? `${taskIndex}`)}`,
      nodeType: "task",
      status: getMindmapNodeStatus("task", task),
      isOpen: false
    }));

    return renderMindmapNode({
      key: kpiKey,
      title: `${String(index + 1).padStart(2, "0")} ${getSimpleName(kpi) || "KPI"}`,
      meta: `${tasks.length}件のTask / 進捗 ${formatPercent(displayProgress(kpi))}`,
      href: `./detail.html?id=${encodeURIComponent(kgiId)}#kpi-${encodeURIComponent(kpi.id)}`,
      nodeType: "kpi",
      status: getMindmapNodeStatus("kpi", kpi),
      isOpen: mindmapOpenState[kpiKey] ?? true,
      children: taskChildren
    });
  };

  const phaseNodes = phaseBuckets.map((phase, phaseIndex) => {
    const phaseKpis = phase.kpis;
    const phaseTaskCount = phaseKpis.reduce((sum, kpi) => sum + (Array.isArray(kpi?.tasks) ? kpi.tasks.length : 0), 0);
    const phaseLabel = Number.isFinite(Number(phase.phaseNumber)) ? `フェーズ${phase.phaseNumber}` : `フェーズ${phaseIndex + 1}`;
    const phaseKey = `phase:${phase.id}`;

    return renderMindmapNode({
      key: phaseKey,
      title: `${phaseLabel} ${phase.title}`.trim(),
      meta: `${phaseKpis.length}件のKPI / ${phaseTaskCount}件のTask`,
      href: `./phase.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(phase.id)}`,
      nodeType: "phase",
      status: getMindmapNodeStatus("phase", phase, { kpis: phaseKpis }),
      isOpen: mindmapOpenState[phaseKey] ?? true,
      children: phaseKpis.map((kpi, index) => buildKpiNode(kpi, index))
    });
  });

  if (unclassifiedKpis.length > 0) {
    const phaseKey = "phase:unclassified";
    const unclassifiedTaskCount = unclassifiedKpis.reduce((sum, kpi) => sum + (Array.isArray(kpi?.tasks) ? kpi.tasks.length : 0), 0);
    phaseNodes.push(renderMindmapNode({
      key: phaseKey,
      title: "未分類",
      meta: `${unclassifiedKpis.length}件のKPI / ${unclassifiedTaskCount}件のTask`,
      nodeType: "phase",
      status: getMindmapNodeStatus("phase", null, { kpis: unclassifiedKpis }),
      isOpen: mindmapOpenState[phaseKey] ?? true,
      children: unclassifiedKpis.map((kpi, index) => buildKpiNode(kpi, index))
    }));
  }

  mindmapTree.innerHTML = renderMindmapNode({
    key: `kgi:${kgiId}`,
    title: kgi.name,
    meta: `${phases.length}件のフェーズ / ${kpis.length}件のKPI / ${taskCount}件のTask`,
    href: `./detail.html?id=${encodeURIComponent(kgiId)}`,
    nodeType: "kgi",
    status: getMindmapNodeStatus("kgi", kgi, { kpis }),
    isOpen: mindmapOpenState[`kgi:${kgiId}`] ?? true,
    children: phaseNodes
  });

  mindmapTree.querySelectorAll("details[data-mindmap-key]").forEach((element) => {
    element.addEventListener("toggle", rememberMindmapState);
  });

  setMindmapStatus("保存済みマップは使わず、KGI → フェーズ → KPI → Task の最新状態から毎回生成しています。KPIやTaskが0件でもフェーズ階層は表示します。");
};

const loadTasksForKpi = async (db, kpiDoc) => {
  const taskSnapshot = await getDocs(collection(db, "kpis", kpiDoc.id, "tasks"));
  return sortTasks(taskSnapshot.docs.map((taskDoc) => ({ id: taskDoc.id, ...taskDoc.data() })));
};

const loadMindmap = async () => {
  kgiId = resolveKgiIdFromUrl();
  updateDebugState({ kgiId, loadState: "url parsed" });

  if (!kgiId) {
    setStatus("KGI ID が指定されていません。", true);
    setMindmapStatus("表示するKGIを特定できません。", true);
    renderEmptyMap("まだマップに表示する項目がありません");
    updateDebugState({ loadState: "missing kgi id", kgiFetch: "failed", errorMessage: "URL の id パラメータが空です。" });
    return;
  }

  if (backToDetailLink instanceof HTMLAnchorElement) {
    backToDetailLink.href = `./detail.html?id=${encodeURIComponent(kgiId)}`;
  }

  const db = await getDb();
  updateDebugState({ loadState: "firebase ready" });

  const kgiSnapshot = await getDoc(doc(db, "kgis", kgiId));

  if (!kgiSnapshot.exists()) {
    setStatus("指定されたKGIが見つかりません。", true);
    setMindmapStatus("KGIを取得できませんでした。", true);
    renderEmptyMap("まだマップに表示する項目がありません");
    updateDebugState({ loadState: "kgi not found", kgiFetch: "not_found", errorMessage: "kgis/{id} に対象ドキュメントがありません。" });
    return;
  }

  updateDebugState({ kgiFetch: "success", loadState: "loading kpis" });

  const kgi = { id: kgiSnapshot.id, ...kgiSnapshot.data() };
  const kpisSnapshot = await getDocs(query(collection(db, "kpis"), where("kgiId", "==", kgiId)));
  const sortedKpiDocs = sortByCreatedAt(kpisSnapshot.docs.map((kpiDoc) => ({ id: kpiDoc.id, ref: kpiDoc.ref, data: kpiDoc.data() })));
  const phases = normalizeRoadmapPhases(kgi?.roadmapPhases);
  const kpis = await Promise.all(sortedKpiDocs.map(async ({ id, data }) => ({
    id,
    ...data,
    ...resolvePhaseMetaForKpi(data, phases),
    tasks: await loadTasksForKpi(db, { id })
  })));

  const taskCount = kpis.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0);
  updateDebugState({ loadState: "rendering", kpiCount: kpis.length, taskCount });

  if (pageTitle) {
    pageTitle.textContent = `${kgi.name ?? "KGI"} の全体マップ`;
  }

  if (pageLead) {
    pageLead.textContent = "KGI → フェーズ → KPI → Task の最新状態から毎回自動生成します。";
  }

  renderMindmap(kgi, phases, kpis);
  setStatus(`KGI 1件 / KPI ${kpis.length}件 / Task ${taskCount}件 を読み込みました。`);
  updateDebugState({ loadState: "completed" });
};

renderDebugInfo();

loadMindmap().catch((error) => {
  const errorCode = typeof error?.code === "string" ? error.code : "-";
  const errorMessage = error instanceof Error ? error.message : String(error ?? "Unknown error");

  console.error("[mindmap] load failed", {
    kgiId,
    errorCode,
    errorMessage,
    error
  });

  setStatus("マップの読み込みに失敗しました。Firebase設定とルールを確認してください。", true);
  setMindmapStatus("元データの取得に失敗したため、マップを生成できませんでした。", true);
  renderEmptyMap("まだマップに表示する項目がありません");
  updateDebugState({
    loadState: "failed",
    kgiFetch: debugState.kgiFetch === "pending" ? "failed" : debugState.kgiFetch,
    errorCode,
    errorMessage
  });
});
