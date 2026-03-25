import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const params = new URLSearchParams(window.location.search);
const kgiId = params.get("id")?.trim() ?? "";
const phaseId = params.get("phaseId")?.trim() ?? "";
const kpiId = params.get("kpiId")?.trim() ?? "";

const backToPhaseLink = document.getElementById("backToPhaseLink");
const kpiTitle = document.getElementById("kpiTitle");
const kpiStatus = document.getElementById("kpiStatus");
const kpiMeta = document.getElementById("kpiMeta");
const kpiName = document.getElementById("kpiName");
const kpiDescription = document.getElementById("kpiDescription");
const kpiType = document.getElementById("kpiType");
const kpiTargetValue = document.getElementById("kpiTargetValue");
const kpiProgress = document.getElementById("kpiProgress");
const kpiDocStatus = document.getElementById("kpiDocStatus");
const taskTitleInput = document.getElementById("taskTitleInput");
const taskDescriptionInput = document.getElementById("taskDescriptionInput");
const createTaskButton = document.getElementById("createTaskButton");
const taskCreateStatus = document.getElementById("taskCreateStatus");
const taskStatus = document.getElementById("taskStatus");
const taskList = document.getElementById("taskList");

let db;
let currentKpi = null;
const japaneseTextPattern = /[ぁ-んァ-ヶ一-龠々ー]/;

const asText = (value, fallback = "-") => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const toDateText = (timestamp) => {
  if (timestamp && typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleString("ja-JP");
  }
  return "-";
};

const formatTaskStatus = (task) => {
  if (task.isCompleted) {
    return "完了";
  }
  const statusValue = asText(task.status, "active");
  if (statusValue === "active") {
    return "進行中";
  }
  if (statusValue === "completed") {
    return "完了";
  }
  return statusValue;
};

const renderTasks = (tasks) => {
  if (!tasks.length) {
    taskStatus.textContent = "タスクはまだありません。上のフォームから追加してください。";
    taskList.hidden = true;
    taskList.innerHTML = "";
    return;
  }

  taskList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  tasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = "task-item";

    const title = document.createElement("h3");
    title.textContent = asText(task.title, "名称未設定タスク");

    const description = document.createElement("p");
    description.textContent = asText(task.description, "説明は未設定です。");

    const meta = document.createElement("p");
    meta.className = "task-meta";
    meta.textContent = `status: ${formatTaskStatus(task)} / 作成: ${toDateText(task.createdAt)} / 更新: ${toDateText(task.updatedAt)}`;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (!task.isCompleted) {
      const completeButton = document.createElement("button");
      completeButton.type = "button";
      completeButton.className = "secondary";
      completeButton.textContent = "完了にする";
      completeButton.addEventListener("click", () => {
        void completeTask(task.id, completeButton);
      });
      actions.appendChild(completeButton);
    }

    item.append(title, description, meta, actions);
    fragment.appendChild(item);
  });

  taskList.appendChild(fragment);
  taskList.hidden = false;
  taskStatus.textContent = `${tasks.length}件のタスクを表示しています。`;
};

const loadKpiAndTasks = async () => {
  const kpiSnapshot = await getDoc(doc(db, "kpis", kpiId));
  if (!kpiSnapshot.exists()) {
    throw new Error("KPI_NOT_FOUND");
  }

  const data = kpiSnapshot.data();
  currentKpi = { id: kpiSnapshot.id, ...data };
  const displayKpiName = asText(data?.name, "名称未設定KPI");
  kpiTitle.textContent = displayKpiName;
  kpiName.textContent = displayKpiName;
  kpiDescription.textContent = asText(data?.description, "説明は未設定です。");
  kpiType.textContent = asText(data?.type, "action");
  kpiTargetValue.textContent = Number.isFinite(Number(data?.targetValue)) ? String(Number(data.targetValue)) : "-";
  const progressRaw = Number(data?.progress ?? data?.overallProgress ?? 0);
  const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : 0;
  kpiProgress.textContent = `${Math.round(progress)}%`;
  kpiDocStatus.textContent = asText(data?.status, "active");

  const taskQuery = query(
    collection(db, "tasks"),
    where("kpiId", "==", kpiId),
    where("kgiId", "==", kgiId),
    where("phaseId", "==", phaseId),
    orderBy("createdAt", "desc")
  );
  const taskSnapshot = await getDocs(taskQuery);
  const tasks = taskSnapshot.docs.map((taskDoc) => ({ id: taskDoc.id, ...taskDoc.data() }));
  renderTasks(tasks);

  kpiMeta.hidden = false;
  kpiStatus.textContent = "";
};

const createTask = async () => {
  if (!currentKpi) {
    return;
  }

  const title = taskTitleInput.value.trim();
  const description = taskDescriptionInput.value.trim();
  if (!title) {
    taskCreateStatus.textContent = "タスク名を入力してください。";
    return;
  }
  if (!japaneseTextPattern.test(title)) {
    taskCreateStatus.textContent = "タスク名は日本語で入力してください。";
    return;
  }

  createTaskButton.disabled = true;
  taskCreateStatus.textContent = "保存中...";

  try {
    await addDoc(collection(db, "tasks"), {
      title,
      description,
      status: "active",
      isCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      kpiId,
      kgiId,
      phaseId
    });

    taskTitleInput.value = "";
    taskDescriptionInput.value = "";
    taskCreateStatus.textContent = "タスクを追加しました。";
    await loadKpiAndTasks();
  } catch (error) {
    console.error(error);
    taskCreateStatus.textContent = "タスクの追加に失敗しました。";
  } finally {
    createTaskButton.disabled = false;
  }
};

const completeTask = async (taskId, completeButton) => {
  completeButton.disabled = true;

  try {
    await updateDoc(doc(db, "tasks", taskId), {
      status: "completed",
      isCompleted: true,
      updatedAt: serverTimestamp()
    });
    await loadKpiAndTasks();
  } catch (error) {
    console.error(error);
    alert("タスク完了の更新に失敗しました。");
    completeButton.disabled = false;
  }
};

const init = async () => {
  if (!kgiId || !phaseId || !kpiId) {
    kpiStatus.textContent = "URLが不正です。id / phaseId / kpiId を確認してください。";
    return;
  }

  backToPhaseLink.href = `./phase.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(phaseId)}`;

  try {
    db = await getDb();
    await loadKpiAndTasks();
  } catch (error) {
    console.error(error);
    kpiStatus.textContent = "KPI詳細の読み込みに失敗しました。";
    taskStatus.textContent = "";
  }
};

createTaskButton.addEventListener("click", () => {
  void createTask();
});

void init();
