import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const cardsContainer = document.getElementById("kgiCards");
const emptyState = document.getElementById("emptyState");
const todayTaskSection = document.getElementById("todayTaskSection");
const todayTaskName = document.getElementById("todayTaskName");
const todayTaskKpi = document.getElementById("todayTaskKpi");
const todayTaskLink = document.getElementById("todayTaskLink");
const listDebugPanel = document.getElementById("listDebugPanel");
const listDebugText = document.getElementById("listDebugText");

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const asText = (value, fallback = "") => {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
};

const displayDeadline = (deadline) => {
  const deadlineText = asText(deadline, "");
  return deadlineText || "期限未設定";
};

const createGoalSummary = (goalText) => {
  const normalized = asText(goalText, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, " ")
    .trim();

  if (!normalized) {
    return "ゴール説明は未設定です。";
  }

  if (normalized.length <= 58) {
    return normalized;
  }

  return `${normalized.slice(0, 58)}…`;
};

const getComparableCreatedAt = (value) => {
  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  return Number.MAX_SAFE_INTEGER;
};

const isArchivedKpi = (kpi) => String(kpi?.status ?? "").trim().toLowerCase() === "archived";
const isInactiveKgi = (kgi) => {
  const status = String(kgi?.status ?? "").trim().toLowerCase();
  if (status === "archived" || status === "deleted") {
    return true;
  }

  return kgi?.isArchived === true || kgi?.isDeleted === true || kgi?.isStale === true;
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

  const status = String(task?.ticketStatus ?? task?.status ?? "").trim().toLowerCase();
  return status === "done" || status === "completed";
};

const getTaskIsInProgress = (task) => {
  if (getTaskIsCompleted(task)) {
    return false;
  }

  const status = String(task?.ticketStatus ?? task?.status ?? "").trim().toLowerCase();
  return status === "in_progress" || status === "progress" || status === "doing" || status === "active";
};

const getPhaseRows = (kgiData) => {
  const phases = Array.isArray(kgiData?.roadmapPhases) ? kgiData.roadmapPhases : [];
  return phases.map((phase, index) => {
    const phaseNumber = Number.isFinite(Number(phase?.phaseNumber)) ? Number(phase.phaseNumber) : index + 1;
    const phaseId = asText(phase?.id, `phase_${phaseNumber}`);
    const planningStatus = asText(phase?.kpiPlanningStatus, "draft");

    return {
      id: phaseId,
      phaseNumber,
      planningStatus
    };
  });
};

const buildProgressMeta = ({ phaseRows, kpis, taskStats }) => {
  const totalPhase = phaseRows.length;
  const activePhase = phaseRows.filter((row) => row.planningStatus !== "finalized").length;

  const totalKpi = kpis.length;
  const finalizedKpi = phaseRows.filter((row) => row.planningStatus === "finalized").length;

  const totalTasks = taskStats.total;
  const doneTasks = taskStats.done;
  const inProgressTasks = taskStats.inProgress;

  return {
    phaseText: totalPhase > 0
      ? `フェーズ ${totalPhase}件中 ${activePhase === 0 ? "完了" : `${activePhase}件進行`}`
      : "フェーズ未作成",
    phaseClass: totalPhase === 0 ? "is-pending" : activePhase === 0 ? "is-done" : "is-active",
    kpiText: `KPI ${totalKpi}件 / 整理済み ${finalizedKpi}件`,
    kpiClass: totalKpi === 0 ? "is-pending" : finalizedKpi === totalKpi ? "is-done" : "is-active",
    taskText: `タスク 進行中 ${inProgressTasks}件 / 完了 ${doneTasks}件`,
    taskClass: totalTasks === 0 ? "is-pending" : doneTasks === totalTasks ? "is-done" : "is-active"
  };
};

const decideNextAction = ({ phaseRows, kpis, taskStats }) => {
  if (phaseRows.length === 0) {
    return "次: ロードマップを作る";
  }

  const hasNoKpiPhase = phaseRows.some((row) => row.planningStatus === "no_kpi");
  if (hasNoKpiPhase || kpis.length === 0) {
    return "次: フェーズ1でKPIを作る";
  }

  const hasDraftPhase = phaseRows.some((row) => row.planningStatus === "draft" || row.planningStatus === "cleanup_needed");
  if (hasDraftPhase) {
    return "次: KPIを整理して確定する";
  }

  if (taskStats.total === 0) {
    return "次: KPIのタスクを1件作る";
  }

  if (taskStats.inProgress > 0) {
    return "次: 進行中タスクを進める";
  }

  if (taskStats.done < taskStats.total) {
    return "次: 未完了タスクを1件進める";
  }

  return "次: 完了内容を見直して次のKGIを決める";
};

const renderListDebug = (debugRows) => {
  if (!listDebugPanel || !listDebugText) {
    return;
  }

  const isDebugMode = new URLSearchParams(window.location.search).get("debug") === "1";
  if (!isDebugMode) {
    listDebugPanel.hidden = true;
    return;
  }

  const lines = debugRows.map((row) => (
    `title="${row.title}" / href.id="${row.hrefId}" / firestore.doc.id="${row.firestoreDocId}" / exists=${row.exists}`
  ));

  listDebugText.textContent = lines.length > 0 ? lines.join("\n") : "debug rows: 0";
  listDebugPanel.hidden = false;
};

const validateKgiDocs = async (db, docs) => {
  const checks = await Promise.all(docs.map(async (docItem) => {
    const data = docItem.data();
    const displayName = asText(data?.name, "");
    const hrefId = docItem.id;
    const snapshot = await getDoc(doc(db, "kgis", hrefId));
    const exists = snapshot.exists();
    const inactive = isInactiveKgi(data);

    return {
      docItem,
      title: displayName,
      hrefId,
      firestoreDocId: snapshot.id,
      exists,
      inactive
    };
  }));

  renderListDebug(checks);

  return checks
    .filter((item) => item.exists && !item.inactive && item.hrefId === item.firestoreDocId)
    .map((item) => item.docItem);
};

const renderTodayTask = (todayTask) => {
  if (!todayTaskSection || !todayTaskName || !todayTaskKpi || !todayTaskLink) {
    return;
  }

  if (!todayTask) {
    todayTaskSection.hidden = true;
    return;
  }

  todayTaskName.textContent = todayTask.taskTitle;
  todayTaskKpi.textContent = `対象KPI: ${todayTask.kpiName}`;
  todayTaskLink.href = `./detail.html?id=${todayTask.kgiId}`;
  todayTaskSection.hidden = false;
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

const getFirstIncompleteTask = (tasks) => sortTasks(tasks)
  .find((task) => !getTaskIsCompleted(task)) ?? null;

const findTodayTask = ({ kgiById, kpisByKgiId, tasksByKpiId }) => {
  const orderedKgiIds = Array.from(kgiById.keys());

  for (const kgiId of orderedKgiIds) {
    const kpis = kpisByKgiId.get(kgiId) ?? [];
    for (const kpi of kpis) {
      const tasks = tasksByKpiId.get(kpi.id) ?? [];
      const firstIncompleteTask = getFirstIncompleteTask(tasks);

      if (!firstIncompleteTask) {
        continue;
      }

      return {
        kgiId,
        kpiName: asText(kpi.name, "名称未設定KPI"),
        taskTitle: asText(firstIncompleteTask.title, "名称未設定Task")
      };
    }
  }

  return null;
};

const buildTaskStats = (tasks = []) => {
  let done = 0;
  let inProgress = 0;

  tasks.forEach((task) => {
    if (getTaskIsCompleted(task)) {
      done += 1;
      return;
    }

    if (getTaskIsInProgress(task)) {
      inProgress += 1;
    }
  });

  return {
    total: tasks.length,
    done,
    inProgress
  };
};

const computePriorityScore = ({ taskStats, hasNextAction, updatedAtMs, createdAtMs }) => {
  let score = 0;

  score += taskStats.inProgress * 20;
  score += (taskStats.total - taskStats.done) * 4;
  score += hasNextAction ? 8 : 0;

  const latestMs = Number.isFinite(updatedAtMs) ? updatedAtMs : createdAtMs;
  if (Number.isFinite(latestMs)) {
    const days = Math.max(0, (Date.now() - latestMs) / (1000 * 60 * 60 * 24));
    score += Math.max(0, 12 - days * 0.3);
  }

  return score;
};

const renderCards = (items) => {
  cardsContainer.innerHTML = "";

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = `kgi-card${item.isLowPriority ? " is-low-priority" : ""}`;

    card.innerHTML = `
      <header class="kgi-card-head">
        <h2 class="kgi-name">${item.name}</h2>
        <p class="kgi-summary">${item.summary}</p>
        <p class="meta-row${item.deadline === "期限未設定" ? " is-empty" : ""}">期限: ${item.deadline}</p>
      </header>
      <section class="progress-group" aria-label="進捗サマリー">
        <span class="progress-item ${item.progress.phaseClass}">${item.progress.phaseText}</span>
        <span class="progress-item ${item.progress.kpiClass}">${item.progress.kpiText}</span>
        <span class="progress-item ${item.progress.taskClass}">${item.progress.taskText}</span>
      </section>
      <p class="next-action">${item.nextAction}</p>
      <a class="button kgi-open" href="./detail.html?id=${item.id}">このKGIを開く</a>
    `;

    fragment.appendChild(card);
  });

  cardsContainer.appendChild(fragment);
};

(async () => {
  try {
    const db = await getDb();
    const kgisRef = collection(db, "kgis");
    const kgisQuery = query(kgisRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(kgisQuery);

    if (snapshot.empty) {
      setStatus("データは0件です。");
      emptyState.hidden = false;
      renderTodayTask(null);
      return;
    }

    const activeDocs = await validateKgiDocs(db, snapshot.docs);
    if (activeDocs.length === 0) {
      setStatus("表示可能なKGIが見つかりませんでした。");
      emptyState.hidden = false;
      renderTodayTask(null);
      return;
    }

    const kgiById = new Map(activeDocs.map((docItem) => [docItem.id, docItem.data()]));

    const kpisSnapshot = await getDocs(collection(db, "kpis"));
    const activeKpiDocs = kpisSnapshot.docs
      .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
      .filter((kpi) => !isArchivedKpi(kpi) && kgiById.has(kpi.kgiId));

    const tasksByKpiId = new Map();
    await Promise.all(activeKpiDocs.map(async (kpi) => {
      const tasksSnapshot = await getDocs(collection(db, "kpis", kpi.id, "tasks"));
      tasksByKpiId.set(kpi.id, tasksSnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    }));

    const kpisByKgiId = new Map();
    activeKpiDocs.forEach((kpi) => {
      const rows = kpisByKgiId.get(kpi.kgiId) ?? [];
      rows.push(kpi);
      kpisByKgiId.set(kpi.kgiId, rows);
    });

    const cards = activeDocs.map((docItem) => {
      const data = docItem.data();
      const kgiId = docItem.id;
      const phaseRows = getPhaseRows(data);
      const kpis = kpisByKgiId.get(kgiId) ?? [];
      const tasks = kpis.flatMap((kpi) => tasksByKpiId.get(kpi.id) ?? []);
      const taskStats = buildTaskStats(tasks);
      const progress = buildProgressMeta({ phaseRows, kpis, taskStats });
      const nextAction = decideNextAction({ phaseRows, kpis, taskStats });
      const updatedAtMs = getComparableCreatedAt(data.updatedAt);
      const createdAtMs = getComparableCreatedAt(data.createdAt);
      const priorityScore = computePriorityScore({
        taskStats,
        hasNextAction: Boolean(nextAction),
        updatedAtMs,
        createdAtMs
      });

      return {
        id: kgiId,
        name: asText(data.name, "名称未設定KGI"),
        summary: createGoalSummary(data.goalText),
        deadline: displayDeadline(data.deadline),
        progress,
        nextAction,
        priorityScore,
        isLowPriority: taskStats.total > 0 && taskStats.done === taskStats.total
      };
    });

    cards.sort((a, b) => b.priorityScore - a.priorityScore);

    renderCards(cards);
    cardsContainer.hidden = false;

    const todayTask = findTodayTask({ kgiById, kpisByKgiId, tasksByKpiId });
    renderTodayTask(todayTask);

    setStatus(`${cards.length}件のKGIを表示しています。進捗が高い順に並べています。`);
  } catch (error) {
    console.error(error);
    setStatus("一覧の読み込みに失敗しました。Firebase設定とルールを確認してください。", true);
  }
})();
