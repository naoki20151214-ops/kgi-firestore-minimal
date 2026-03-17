import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp
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

const displayProgress = (kpi) => {
  const progress = Number(kpi.progress);

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

const renderKpiTable = (kpis) => {
  kpiTableBody.innerHTML = "";

  kpis.forEach((kpi) => {
    const row = document.createElement("tr");
    const progressPercent = displayProgress(kpi);
    const deadline = displayDeadline(kpi.deadline);
    const remaining = calcRemainingDays(deadline === "未設定" ? "" : deadline);

    row.innerHTML = `
      <td>${kpi.name ?? ""}</td>
      <td>${displayDescription(kpi.description)}</td>
      <td>${kpi.kpiType === "action" ? "action" : "result"}</td>
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

    kpiTableBody.appendChild(row);
  });
};

const loadKpis = async () => {
  const snapshot = await getDocs(getKpisRef());

  if (snapshot.empty) {
    kpiTableBody.innerHTML = "";
    kpiTable.hidden = true;
    renderOverallProgress([]);
    setKpiStatus("KPIがまだありません。上のフォームから追加してください。");
    return;
  }

  const kpis = normalizeKpis(snapshot.docs);
  renderKpiTable(kpis);
  renderOverallProgress(kpis);
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
      current: 0,
      unit: "%",
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
