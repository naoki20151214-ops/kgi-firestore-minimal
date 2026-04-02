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
import { decideNowAction, getNowActionImportance, getNowActionStageWeight } from "./now-action-engine.js";

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
const createKgiSection = document.getElementById("create-kgi");

const setStatus = (message, isError = false) => {
  if (!statusText) {
    return;
  }

  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const focusCreateKgiSection = () => {
  if (!createKgiSection) {
    return;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const focusTarget = searchParams.get("focus");
  const hashTarget = window.location.hash.replace(/^#/, "");
  const shouldFocus = focusTarget === "create-kgi" || hashTarget === "create-kgi";

  if (!shouldFocus) {
    return;
  }

  window.requestAnimationFrame(() => {
    createKgiSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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

  return kgi?.isArchived === true || kgi?.isDeleted === true || kgi?.isStale === true || kgi?.excludedFromNowAction === true;
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

  todayTaskName.textContent = `今日やること: ${todayTask.title}`;
  todayTaskKpi.innerHTML = `<span class="inline-icon" aria-hidden="true">📈</span>段階: ${todayTask.stageLabel}`;
  if (todayTaskKgi) {
    const targetKgiName = asText(todayTask.targetKgiName, "このKGI");
    todayTaskKgi.innerHTML = `<span class="inline-icon" aria-hidden="true">🎯</span>対象KGI: <strong>${targetKgiName}</strong>`;
  }
  if (todayTaskPriority) {
    todayTaskPriority.innerHTML = `<span class="label">重要度</span><span class="stars">${toStars(todayTask.importanceLevel)}</span>`;
  }
  todayTaskLink.textContent = todayTask.buttonLabel;
  todayTaskLink.href = todayTask.href;
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

focusCreateKgiSection();

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

const toStars = (level = 3) => {
  const safeLevel = Math.max(1, Math.min(5, Number(level) || 3));
  return `${"★".repeat(safeLevel)}${"☆".repeat(5 - safeLevel)}`;
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
      renderTodayTask({
        title: "新しいKGIを作成する",
        stageLabel: "KGI未作成",
        reason: "まず目標がないため、最初のKGI作成が必要です",
        buttonLabel: "KGIを作成する",
        href: "./index.html",
        progressSummary: "KGI未作成",
        importanceLevel: 5
      });
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
      const tasksSnapshot = await getDocs(query(collection(db, "tasks"), where("kpiId", "==", kpi.id)));
      tasksByKpiId.set(kpi.id, tasksSnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    }));

    const kpisByKgiId = new Map();
    activeKpiDocs.forEach((kpi) => {
      const rows = kpisByKgiId.get(kpi.kgiId) ?? [];
      rows.push(kpi);
      kpisByKgiId.set(kpi.kgiId, rows);
    });

    const allKgis = activeDocs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    const allPhases = allKgis.flatMap((kgi) => getPhaseRows(kgi).map((phase) => ({ ...phase, kgiId: kgi.id })));
    const allTasks = activeKpiDocs.flatMap((kpi) => (tasksByKpiId.get(kpi.id) ?? []).map((task) => ({ ...task, kpiId: kpi.id })));

    const cards = activeDocs.map((docItem) => {
      const data = docItem.data();
      const kgiId = docItem.id;
      const phaseRows = getPhaseRows(data);
      const kpis = kpisByKgiId.get(kgiId) ?? [];
      const tasks = kpis.flatMap((kpi) => tasksByKpiId.get(kpi.id) ?? []);
      const taskStats = buildTaskStats(tasks);
      const progress = buildProgressMeta({ phaseRows, kpis, taskStats });
      const kgiName = asText(data.name, "名称未設定KGI");
      const todayAction = decideNowAction({
        kgis: allKgis,
        phases: allPhases,
        kpis: activeKpiDocs,
        tasks: allTasks,
        scope: "kgi",
        kgiId
      });
      const nextAction = todayAction?.title ?? "次の行動を確認する";
      const importanceLevel = getNowActionImportance(todayAction?.actionType);
      const updatedAtMs = getComparableCreatedAt(data.updatedAt);
      const createdAtMs = getComparableCreatedAt(data.createdAt);
      const priorityScore = computePriorityScore({
        taskStats,
        hasNextAction: Boolean(nextAction),
        updatedAtMs,
        createdAtMs
      }) + getNowActionStageWeight(todayAction?.actionType);

      return {
        id: kgiId,
        name: kgiName,
        summary: `${createGoalSummary(data.goalText)} / 📅 期限: ${displayDeadline(data.deadline)}`,
        progress,
        nextAction,
        importanceLevel,
        priorityScore,
        isInProgressCandidate: todayAction?.actionType !== "review",
        todayAction
      };
    });

    cards.sort((a, b) => b.priorityScore - a.priorityScore);

    const homeCandidates = cards.filter((card) => card.isInProgressCandidate);
    const todayTask = decideNowAction({
      kgis: allKgis,
      phases: allPhases,
      kpis: activeKpiDocs,
      tasks: allTasks,
      scope: "global"
    });
    if (todayTask) {
      todayTask.importanceLevel = getNowActionImportance(todayTask.actionType);
      const matchedKgi = allKgis.find((kgi) => kgi.id === todayTask.targetKgiId);
      const targetKgiName = asText(matchedKgi?.name, "");
      if (targetKgiName) {
        todayTask.targetKgiName = targetKgiName;
      }
      if (todayTask.actionType === "create_roadmap" && targetKgiName) {
        todayTask.buttonLabel = `${targetKgiName}のロードマップを作る`;
      }
    }
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
