import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const kgiMeta = document.getElementById("kgiMeta");
const kpiStatusText = document.getElementById("kpiStatusText");
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
const debugPanel = document.getElementById("debugPanel");
const debugPanelContent = document.getElementById("debugPanelContent");

const debugMode = true;
let latestDebugState = [];

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

  if (kpiDebugItems.length === 0) {
    debugPanelContent.textContent = "KPI / Task データなし";
    return;
  }

  const lines = kpiDebugItems.flatMap((kpiItem, index) => {
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

  debugPanelContent.textContent = lines.join("\n").trim();
};

updateDebugPanel([]);

let db;
let kgiId;

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const setKpiStatus = (message, isError = false) => {
  kpiStatusText.textContent = message;
  kpiStatusText.classList.toggle("error", isError);
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

const getKpisRef = () => collection(db, "kgis", kgiId, "kpis");

const getTasksRef = (kpiId) => collection(db, "kgis", kgiId, "kpis", kpiId, "tasks");

const getKpiRef = (kpiId) => doc(db, "kgis", kgiId, "kpis", kpiId);

const renderKgiMeta = (kgiData) => {
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
  .map((taskDoc) => ({ id: taskDoc.id, ...taskDoc.data() }))
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

const syncKpiProgressFromTasks = async (kpiId, kpiDataForTarget) => {
  const tasksSnapshot = await getDocs(getTasksRef(kpiId));
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

    await updateDoc(doc(db, "kgis", kgiId, "kpis", kpiId, "tasks", task.id), {
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
    kpiId,
    relatedTaskCount: tasks.length,
    summedContributedValue: currentValue
  });

  await updateDoc(getKpiRef(kpiId), {
    currentValue,
    progress,
    percentage: progress,
    updatedAt: serverTimestamp()
  });

  return { currentValue, progress, tasks };
};

const renderTaskRows = (kpiId, tasks) => {
  if (tasks.length === 0) {
    return '<p class="hint">Taskがまだありません。</p>';
  }

  const taskRows = tasks.map((task) => {
    const taskTitle = task.title ?? "";
    const taskDescription = displayDescription(task.description);
    const taskType = normalizeTaskType(task.type);
    const taskPriority = displayTaskPriority(task.priority);
    const taskDeadline = displayDeadline(task.deadline);
    const taskRemaining = calcRemainingDays(taskDeadline === "未設定" ? "" : taskDeadline);
    const contributedValue = calculateTaskContributedValue(task);
    const isCompleted = getTaskIsCompleted(task);
    const completedCount = getTaskCompletedCount(task);

    return `
      <tr>
        <td>${taskTitle}</td>
        <td>${taskDescription}</td>
        <td>${taskType}</td>
        <td>${contributedValue}</td>
        <td>
          ${taskType === "one_time"
    ? `<label><input type="checkbox" class="task-completion-input" data-kpi-id="${kpiId}" data-task-id="${task.id}" data-task-type="one_time" ${isCompleted ? "checked" : ""} /> 完了</label>`
    : `<input type="number" min="0" step="1" class="task-completion-input" data-kpi-id="${kpiId}" data-task-id="${task.id}" data-task-type="repeatable" value="${completedCount}" aria-label="${taskTitle || "Task"}の完了回数" />`}
        </td>
        <td>${taskDeadline}</td>
        <td class="${taskRemaining.isOverdue ? "overdue-text" : ""}">${taskRemaining.remainingText}</td>
        <td>${taskPriority}</td>
      </tr>
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
          <th>残り日数</th>
          <th>優先度</th>
        </tr>
      </thead>
      <tbody>
        ${taskRows}
      </tbody>
    </table>
  `;
};

const renderKpiTable = (kpis) => {
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
            </div>
            <button class="button task-add-button" type="submit">Taskを追加</button>
          </form>
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

const loadKpis = async () => {
  const snapshot = await getDocs(getKpisRef());

  if (snapshot.empty) {
    kpiTableBody.innerHTML = "";
    kpiTable.hidden = true;
    renderOverallProgress([]);
    setKpiStatus("KPIがまだありません。上のフォームから追加してください。");
    updateDebugPanel([]);
    return;
  }

  const kpis = normalizeKpis(snapshot.docs);
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

  updateDebugPanel(kpisWithTasks.map((kpi) => kpi.debug));

  renderKpiTable(kpisWithTasks);
  renderOverallProgress(kpisWithTasks);
  kpiTable.hidden = false;
  setKpiStatus(`${snapshot.size}件のKPIを表示しています。`);
};

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
    const existingSnapshot = await getDocs(getKpisRef());

    await addDoc(getKpisRef(), {
      name,
      description,
      kpiType,
      progressType: "task_based",
      target: 100,
      currentValue: 0,
      unit: "pt",
      deadline,
      progress: 0,
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
      progressValue,
      deadline,
      priority,
      order: taskSnapshot.size,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isSuggestedByAI: false
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

kpiTableBody.addEventListener("change", async (event) => {
  const input = event.target.closest(".task-completion-input");

  if (!input) {
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
      updatePayload.isCompleted = isCompleted;
      updatePayload.contributedValue = isCompleted ? 1 : 0;
      updatePayload.progressValue = isCompleted ? 1 : 0;
      updatePayload.completedAt = isCompleted ? serverTimestamp() : null;
    }

    await updateDoc(doc(db, "kgis", kgiId, "kpis", kpiTargetId, "tasks", taskId), updatePayload);

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

(async () => {
  const params = new URLSearchParams(location.search);
  kgiId = params.get("id");

  if (!kgiId) {
    setStatus("URLにKGI IDがありません。list.htmlから開いてください。", true);
    addKpiButton.disabled = true;
    setKpiStatus("KPIを表示できません。", true);
    return;
  }

  try {
    db = await getDb();

    const kgiRef = doc(db, "kgis", kgiId);
    const kgiSnapshot = await getDoc(kgiRef);

    if (!kgiSnapshot.exists()) {
      setStatus("指定されたKGIが見つかりません。", true);
      addKpiButton.disabled = true;
      setKpiStatus("KPIを表示できません。", true);
      return;
    }

    renderKgiMeta(kgiSnapshot.data());
    setStatus("KGIを読み込みました。");
    await loadKpis();
  } catch (error) {
    console.error(error);
    setStatus("KGI詳細の読み込みに失敗しました。", true);
    addKpiButton.disabled = true;
    setKpiStatus("KPIの読み込みに失敗しました。", true);
  }
})();
