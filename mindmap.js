import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
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

let kgiId = "";
let mindmapOpenState = {};

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

const resolveKgiIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("id") ?? "").trim();
};

const getComparableCreatedAt = (value) => {
  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  return Number.MAX_SAFE_INTEGER;
};

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

const sortTasks = (tasks) => (Array.isArray(tasks) ? [...tasks] : []).sort((a, b) => {
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

const renderSummary = (kgi, kpis) => {
  if (!summaryGrid) {
    return;
  }

  const taskCount = kpis.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0);
  summaryGrid.innerHTML = `
    <div class="meta-item"><strong>KGI</strong><span>${escapeHtml(kgi?.name ?? "未設定")}</span></div>
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

const renderMindmap = (kgi, kpis) => {
  if (!mindmapTree) {
    return;
  }

  if (!kgi?.name) {
    renderEmptyMap("KGIを読み込めると全体マップを表示します。");
    setMindmapStatus("KGIの読み込み後にマップを生成します。");
    return;
  }

  const taskCount = kpis.reduce((sum, kpi) => sum + (Array.isArray(kpi.tasks) ? kpi.tasks.length : 0), 0);
  if (kpis.length === 0 || taskCount === 0) {
    renderEmptyMap("まだマップに表示する項目がありません");
    setMindmapStatus("KPI 0件 または Task 0件のため、案内メッセージを表示しています。");
    return;
  }

  const kpiNodes = kpis.map((kpi, index) => {
    const tasks = sortTasks(kpi.tasks);
    const kpiKey = `kpi:${kpi.id}`;
    const taskChildren = tasks.map((task, taskIndex) => renderMindmapNode({
      key: `task:${task.id}`,
      title: task.title ?? `Task ${taskIndex + 1}`,
      meta: `${taskIndex + 1}件目${task.deadline ? ` / 期限 ${task.deadline}` : ""}`,
      href: "",
      nodeType: "task",
      status: getMindmapNodeStatus("task", task),
      isOpen: false,
      children: []
    }));

    return renderMindmapNode({
      key: kpiKey,
      title: `${String(index + 1).padStart(2, "0")} ${getSimpleName(kpi) || "KPI"}`,
      meta: `${tasks.length}件のTask / 進捗 ${formatPercent(displayProgress(kpi))}`,
      href: "",
      nodeType: "kpi",
      status: getMindmapNodeStatus("kpi", kpi),
      isOpen: mindmapOpenState[kpiKey] ?? true,
      children: taskChildren
    });
  });

  mindmapTree.innerHTML = renderMindmapNode({
    key: `kgi:${kgiId}`,
    title: kgi.name,
    meta: `${kpis.length}件のKPI / ${taskCount}件のTask`,
    href: "",
    nodeType: "kgi",
    status: getMindmapNodeStatus("kgi", kgi, { kpis }),
    isOpen: mindmapOpenState[`kgi:${kgiId}`] ?? true,
    children: kpiNodes
  });

  mindmapTree.querySelectorAll("details[data-mindmap-key]").forEach((element) => {
    element.addEventListener("toggle", rememberMindmapState);
  });

  setMindmapStatus("保存済みマップは使わず、KGI → KPI → Task の最新状態から毎回生成しています。");
};

const loadMindmap = async () => {
  kgiId = resolveKgiIdFromUrl();

  if (!kgiId) {
    setStatus("KGI ID が指定されていません。", true);
    setMindmapStatus("表示するKGIを特定できません。", true);
    renderEmptyMap("まだマップに表示する項目がありません");
    return;
  }

  if (backToDetailLink instanceof HTMLAnchorElement) {
    backToDetailLink.href = `./detail.html?id=${encodeURIComponent(kgiId)}`;
  }

  const db = await getDb();
  const kgiSnapshot = await getDoc(doc(db, "kgis", kgiId));

  if (!kgiSnapshot.exists()) {
    setStatus("指定されたKGIが見つかりません。", true);
    setMindmapStatus("KGIを取得できませんでした。", true);
    renderEmptyMap("まだマップに表示する項目がありません");
    return;
  }

  const kgi = { id: kgiSnapshot.id, ...kgiSnapshot.data() };
  const kpisSnapshot = await getDocs(query(collection(db, "kpis"), where("kgiId", "==", kgiId), orderBy("createdAt", "asc")));
  const kpis = await Promise.all(kpisSnapshot.docs
    .map(async (kpiDoc) => {
      const taskSnapshot = await getDocs(query(collection(db, "kpis", kpiDoc.id, "tasks"), orderBy("createdAt", "asc")));
      return {
        id: kpiDoc.id,
        ...kpiDoc.data(),
        tasks: taskSnapshot.docs.map((taskDoc) => ({ id: taskDoc.id, ...taskDoc.data() }))
      };
    }));

  if (pageTitle) {
    pageTitle.textContent = `${kgi.name ?? "KGI"} の全体マップ`;
  }

  if (pageLead) {
    pageLead.textContent = "このページを開いた時だけ、元データから全体像を自動生成します。";
  }

  renderSummary(kgi, kpis);
  renderMindmap(kgi, kpis);
  setStatus(`KGI 1件 / KPI ${kpis.length}件 を読み込みました。`);
};

loadMindmap().catch((error) => {
  console.error(error);
  setStatus("マップの読み込みに失敗しました。Firebase設定とルールを確認してください。", true);
  setMindmapStatus("元データの取得に失敗したため、マップを生成できませんでした。", true);
  renderEmptyMap("まだマップに表示する項目がありません");
});
