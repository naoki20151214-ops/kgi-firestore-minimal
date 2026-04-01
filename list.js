import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const pageMode = document.body?.dataset?.pageMode || "home";
const statusText = document.getElementById("statusText");
const cardsContainer = document.getElementById("kgiCards");
const inProgressEmptyState = document.getElementById("inProgressEmptyState") || document.getElementById("emptyState");
const todayTaskSection = document.getElementById("todayTaskSection");
const todayTaskEmpty = document.getElementById("todayTaskEmpty");
const todayTaskName = document.getElementById("todayTaskName");
const todayTaskKpi = document.getElementById("todayTaskKpi");
const todayTaskKgi = document.getElementById("todayTaskKgi");
const todayTaskPriority = document.getElementById("todayTaskPriority");
const todayTaskLink = document.getElementById("todayTaskLink");
const listDebugPanel = document.getElementById("listDebugPanel");
const listDebugText = document.getElementById("listDebugText");

const setStatus = (message, isError = false) => {
  if (!statusText) {
    return;
  }

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

const getKpiStatus = (kpi) => asText(kpi?.status, "draft").toLowerCase();
const isKpiFinalized = (kpi) => getKpiStatus(kpi) === "finalized";
const isKpiPendingCleanup = (kpi) => {
  const status = getKpiStatus(kpi);
  return status === "draft" || status === "cleanup_needed";
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
    if (todayTaskEmpty) {
      todayTaskEmpty.hidden = false;
    }
    return;
  }

  todayTaskName.textContent = todayTask.isTaskAction
    ? `今日やること: ${todayTask.nextActionText}`
    : `次にやること: ${todayTask.nextActionText}`;
  todayTaskKpi.innerHTML = `<span class="inline-icon" aria-hidden="true">📈</span>段階: ${todayTask.stageLabel}`;
  if (todayTaskKgi) {
    todayTaskKgi.innerHTML = `<span class="inline-icon" aria-hidden="true">🎯</span>${todayTask.contextText}: ${todayTask.contextName} / 対象KGI: ${todayTask.kgiName}`;
  }
  if (todayTaskPriority) {
    todayTaskPriority.innerHTML = `<span class="label">重要度</span><span class="stars">${toStars(todayTask.importanceLevel)}</span>`;
  }
  todayTaskLink.textContent = todayTask.buttonText;
  todayTaskLink.href = todayTask.link;
  todayTaskSection.hidden = false;
  if (todayTaskEmpty) {
    todayTaskEmpty.hidden = true;
  }
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

const getStagePriority = (stageCode) => {
  const priorities = { E: 70, F: 60, D: 50, C: 40, B: 30, A: 20, G: 0 };
  return priorities[stageCode] ?? 0;
};

const getImportanceLevelByStage = (stageCode) => {
  const map = { A: 4, B: 4, C: 4, D: 3, E: 5, F: 4, G: 2 };
  return map[stageCode] ?? 3;
};

const toStars = (level = 3) => {
  const safeLevel = Math.max(1, Math.min(5, Number(level) || 3));
  return `${"★".repeat(safeLevel)}${"☆".repeat(5 - safeLevel)}`;
};

const decideTodayActionForKgi = ({ kgiId, kgiName, phaseRows, kpis, tasksByKpiId }) => {
  const firstPhase = phaseRows[0];
  const hasNoKpiPhase = phaseRows.some((row) => row.planningStatus === "no_kpi");
  const hasDraftPhase = phaseRows.some((row) => row.planningStatus === "draft" || row.planningStatus === "cleanup_needed");
  const pendingKpis = kpis.filter((kpi) => isKpiPendingCleanup(kpi));
  const finalizedKpis = kpis.filter((kpi) => isKpiFinalized(kpi));

  if (phaseRows.length === 0) {
    return { stageCode: "A", stageLabel: "ロードマップ作成", nextActionText: "ロードマップを作る", nextActionCardText: "次: ロードマップを作る", buttonText: "このKGIを開く", link: `./detail.html?id=${kgiId}`, kgiName, contextText: "対象KGI", contextName: kgiName, isTaskAction: false };
  }

  if (hasNoKpiPhase || kpis.length === 0) {
    const phaseText = `フェーズ${firstPhase?.phaseNumber ?? 1}`;
    return { stageCode: "B", stageLabel: "KPI作成", nextActionText: `${phaseText}でKPIを作る`, nextActionCardText: `次: ${phaseText}でKPIを作る`, buttonText: "このフェーズを開く", link: `./detail.html?id=${kgiId}`, kgiName, contextText: "対象フェーズ", contextName: phaseText, isTaskAction: false };
  }

  if (hasDraftPhase || pendingKpis.length > 0) {
    const targetKpi = pendingKpis[0] ?? kpis[0];
    return { stageCode: "C", stageLabel: "KPI整理", nextActionText: "KPIを整理して確定する", nextActionCardText: "次: KPIを整理して確定する", buttonText: "このフェーズを開く", link: `./detail.html?id=${kgiId}`, kgiName, contextText: "対象KPI", contextName: asText(targetKpi?.name, "名称未設定KPI"), isTaskAction: false };
  }

  const finalizedKpisWithTasks = finalizedKpis.map((kpi) => {
    const tasks = sortTasks(tasksByKpiId.get(kpi.id) ?? []);
    return {
      kpi,
      tasks,
      inProgressTask: tasks.find((task) => getTaskIsInProgress(task)) ?? null,
      firstIncompleteTask: tasks.find((task) => !getTaskIsCompleted(task)) ?? null
    };
  });

  if (!finalizedKpisWithTasks.some((row) => row.tasks.length > 0)) {
    const targetKpi = finalizedKpisWithTasks[0]?.kpi ?? finalizedKpis[0] ?? kpis[0];
    return { stageCode: "D", stageLabel: "タスク作成", nextActionText: "最初のタスクを1件作る", nextActionCardText: "次: 最初のタスクを1件作る", buttonText: "このKPIを見る", link: `./detail.html?id=${kgiId}`, kgiName, contextText: "対象KPI", contextName: asText(targetKpi?.name, "名称未設定KPI"), isTaskAction: false };
  }

  const inProgressRow = finalizedKpisWithTasks.find((row) => row.inProgressTask);
  if (inProgressRow) {
    return { stageCode: "E", stageLabel: "タスク実行", nextActionText: asText(inProgressRow.inProgressTask?.title, "名称未設定Task"), nextActionCardText: "次: 進行中タスクを進める", buttonText: "このTaskを見る", link: `./detail.html?id=${kgiId}`, kgiName, contextText: "対象KPI", contextName: asText(inProgressRow.kpi?.name, "名称未設定KPI"), isTaskAction: true };
  }

  const incompleteRow = finalizedKpisWithTasks.find((row) => row.firstIncompleteTask);
  if (incompleteRow) {
    return { stageCode: "F", stageLabel: "タスク実行", nextActionText: asText(incompleteRow.firstIncompleteTask?.title, "名称未設定Task"), nextActionCardText: "次: 未完了タスクに着手する", buttonText: "このTaskを見る", link: `./detail.html?id=${kgiId}`, kgiName, contextText: "対象KPI", contextName: asText(incompleteRow.kpi?.name, "名称未設定KPI"), isTaskAction: true };
  }

  return { stageCode: "G", stageLabel: "次フェーズ", nextActionText: "次のKPIまたは次のフェーズへ進む", nextActionCardText: "次: 次のKPIまたは次のフェーズへ進む", buttonText: "このKGIを開く", link: `./detail.html?id=${kgiId}`, kgiName, contextText: "対象KGI", contextName: kgiName, isTaskAction: false };
};

const renderCards = (items) => {
  if (!cardsContainer) {
    return;
  }

  cardsContainer.innerHTML = "";

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "kgi-card";

    card.innerHTML = `
      <header class="kgi-card-head">
        <h2 class="kgi-name"><span class="inline-icon" aria-hidden="true">🎯</span>${item.name}</h2>
        <p class="kgi-summary">${item.summary}</p>
      </header>
      <section class="progress-group" aria-label="進捗サマリー">
        <span class="progress-item ${item.progress.phaseClass}"><span class="inline-icon" aria-hidden="true">🗺️</span>${item.progress.phaseText}</span>
        <span class="progress-item ${item.progress.kpiClass}"><span class="inline-icon" aria-hidden="true">📈</span>${item.progress.kpiText}</span>
        <span class="progress-item ${item.progress.taskClass}"><span class="inline-icon" aria-hidden="true">☑️</span>${item.progress.taskText}</span>
      </section>
      <p class="card-priority priority-rating"><span class="label">重要度</span><span class="stars">${toStars(item.importanceLevel)}</span></p>
      <p class="next-action"><span class="inline-icon" aria-hidden="true">⚡</span>${item.nextAction}</p>
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
      if (inProgressEmptyState) {
        inProgressEmptyState.hidden = false;
      }
      renderTodayTask(null);
      return;
    }

    const activeDocs = await validateKgiDocs(db, snapshot.docs);
    if (activeDocs.length === 0) {
      setStatus("表示可能なKGIが見つかりませんでした。", true);
      if (inProgressEmptyState) {
        inProgressEmptyState.hidden = false;
      }
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
      const kgiName = asText(data.name, "名称未設定KGI");
      const todayAction = decideTodayActionForKgi({ kgiId, kgiName, phaseRows, kpis, tasksByKpiId });
      const nextAction = todayAction.nextActionCardText;
      todayAction.importanceLevel = getImportanceLevelByStage(todayAction.stageCode);
      const updatedAtMs = getComparableCreatedAt(data.updatedAt);
      const createdAtMs = getComparableCreatedAt(data.createdAt);
      const priorityScore = computePriorityScore({
        taskStats,
        hasNextAction: Boolean(nextAction),
        updatedAtMs,
        createdAtMs
      }) + getStagePriority(todayAction.stageCode);

      return {
        id: kgiId,
        name: kgiName,
        summary: `${createGoalSummary(data.goalText)} / 📅 期限: ${displayDeadline(data.deadline)}`,
        progress,
        nextAction,
        importanceLevel: todayAction.importanceLevel,
        priorityScore,
        isInProgressCandidate: todayAction.stageCode !== "G",
        todayAction
      };
    });

    cards.sort((a, b) => b.priorityScore - a.priorityScore);

    const homeCandidates = cards.filter((card) => card.isInProgressCandidate);
    const todayTask = homeCandidates[0]?.todayAction ?? null;
    renderTodayTask(todayTask);

    const cardsToRender = pageMode === "home"
      ? homeCandidates.slice(0, 3)
      : cards;

    if (cardsToRender.length === 0) {
      if (inProgressEmptyState) {
        inProgressEmptyState.hidden = false;
      }
      setStatus("進行中のKGIはありません。新しいKGIを追加してください。");
      return;
    }

    renderCards(cardsToRender);
    if (cardsContainer) {
      cardsContainer.hidden = false;
    }

    if (pageMode === "home") {
      setStatus(`今日進めるKGIを${cardsToRender.length}件表示しています。`);
    } else {
      setStatus(`${cardsToRender.length}件のKGIを表示しています。`);
    }
  } catch (error) {
    console.error(error);
    setStatus("一覧の読み込みに失敗しました。Firebase設定とルールを確認してください。", true);
  }
})();
