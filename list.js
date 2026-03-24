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
const tableWrap = document.getElementById("tableWrap");
const tableBody = document.getElementById("kgiTableBody");
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

const formatTimestampToYmd = (value) => {
  if (!value || typeof value.toDate !== "function") {
    return "-";
  }

  const date = value.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
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

const normalizeTaskTicketStatus = (task) => {
  const rawStatus = String(task?.ticketStatus ?? task?.status ?? "").trim().toLowerCase();

  if (rawStatus === "done" || rawStatus === "completed") {
    return "done";
  }

  return getTaskIsCompleted(task) ? "done" : "todo";
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
  .find((task) => normalizeTaskTicketStatus(task) !== "done" && !getTaskIsCompleted(task)) ?? null;

const isArchivedKpi = (kpi) => String(kpi?.status ?? "").trim().toLowerCase() === "archived";
const isInactiveKgi = (kgi) => {
  const status = String(kgi?.status ?? "").trim().toLowerCase();
  if (status === "archived" || status === "deleted") {
    return true;
  }

  return kgi?.isArchived === true || kgi?.isDeleted === true || kgi?.isStale === true;
};

const isCompletedKpi = (kpi) => {
  if (!kpi || isArchivedKpi(kpi)) {
    return false;
  }

  const progress = Number(kpi?.progress ?? kpi?.overallProgress ?? 0);
  if (Number.isFinite(progress) && progress >= 100) {
    return true;
  }

  const tasks = Array.isArray(kpi?.tasks) ? kpi.tasks : [];
  return tasks.length > 0 && tasks.every((task) => getTaskIsCompleted(task));
};

const renderRows = (docs) => {
  tableBody.innerHTML = "";

  docs.forEach((docItem) => {
    const data = docItem.data();
    const row = document.createElement("tr");

    row.innerHTML = `
      <td data-label="作成日">${formatTimestampToYmd(data.createdAt)}</td>
      <td data-label="KGI名"><a href="./detail.html?id=${docItem.id}">${data.name ?? ""}</a></td>
      <td data-label="ゴール">${displayGoalText(data.goalText)}</td>
      <td data-label="期限">${displayDeadline(data.deadline)}</td>
    `;

    tableBody.appendChild(row);
  });
};

const renderListDebug = (debugRows) => {
  if (!listDebugPanel || !listDebugText) {
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
    const displayName = typeof data?.name === "string" ? data.name : "";
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

  console.table(checks.map((item) => ({
    title: item.title,
    hrefId: item.hrefId,
    firestoreDocId: item.firestoreDocId,
    exists: item.exists,
    inactive: item.inactive
  })));
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

const findTodayTask = async (db, kgis) => {
  const kgisById = new Map(kgis.map((docItem) => [docItem.id, docItem.data()]));
  const kpisSnapshot = await getDocs(query(collection(db, "kpis"), orderBy("createdAt", "asc")));

  const kpis = kpisSnapshot.docs
    .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
    .filter((kpi) => kgisById.has(kpi.kgiId) && !isArchivedKpi(kpi));

  for (const kpi of kpis) {
    const tasksSnapshot = await getDocs(collection(db, "kpis", kpi.id, "tasks"));
    const tasks = tasksSnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    const firstIncompleteTask = getFirstIncompleteTask(tasks);

    if (!firstIncompleteTask) {
      continue;
    }

    if (isCompletedKpi({ ...kpi, tasks })) {
      continue;
    }

    return {
      kgiId: kpi.kgiId,
      kpiName: typeof kpi.name === "string" && kpi.name.trim() ? kpi.name.trim() : "名称未設定KPI",
      taskTitle: typeof firstIncompleteTask.title === "string" && firstIncompleteTask.title.trim()
        ? firstIncompleteTask.title.trim()
        : "名称未設定Task"
    };
  }

  return null;
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

    renderRows(activeDocs);
    tableWrap.hidden = false;

    const todayTask = await findTodayTask(db, activeDocs);
    renderTodayTask(todayTask);

    setStatus(`${activeDocs.length}件のKGIを表示しています。`);
  } catch (error) {
    console.error(error);
    setStatus("一覧の読み込みに失敗しました。Firebase設定とルールを確認してください。", true);
  }
})();
