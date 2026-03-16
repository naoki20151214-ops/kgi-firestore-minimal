import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
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
const kpiTargetInput = document.getElementById("kpiTarget");
const kpiProgressInput = document.getElementById("kpiProgress");
const addKpiButton = document.getElementById("addKpiButton");

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

const formatDate = (timestamp) => {
  if (!timestamp) {
    return "-";
  }

  return timestamp.toDate().toLocaleString("ja-JP");
};

const getKpisRef = () => collection(db, "kgis", kgiId, "kpis");

const renderKgiMeta = (kgiData) => {
  kgiMeta.hidden = false;
  kgiMeta.innerHTML = `
    <div class="row"><strong>ID</strong><span>${kgiId}</span></div>
    <div class="row"><strong>絵文字</strong><span>${kgiData.emoji ?? ""}</span></div>
    <div class="row"><strong>KGI名</strong><span>${kgiData.name ?? ""}</span></div>
    <div class="row"><strong>目標値</strong><span>${kgiData.target ?? ""}</span></div>
    <div class="row"><strong>作成日時</strong><span>${formatDate(kgiData.createdAt)}</span></div>
  `;
};

const loadKpis = async () => {
  const kpisQuery = query(getKpisRef(), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(kpisQuery);

  kpiTableBody.innerHTML = "";

  if (snapshot.empty) {
    kpiTable.hidden = true;
    setKpiStatus("KPIはまだありません。上のフォームから追加してください。");
    return;
  }

  snapshot.docs.forEach((kpiDoc) => {
    const kpi = kpiDoc.data();
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${kpi.name ?? ""}</td>
      <td>${kpi.target ?? ""}</td>
      <td>
        <div class="progress-cell">
          <input class="progress-input" type="number" value="${kpi.progress ?? 0}" />
          <button class="button save-progress-button" type="button" data-kpi-id="${kpiDoc.id}">進捗保存</button>
        </div>
      </td>
      <td>${formatDate(kpi.updatedAt ?? kpi.createdAt)}</td>
    `;

    kpiTableBody.appendChild(row);
  });

  kpiTable.hidden = false;
  setKpiStatus(`${snapshot.size}件のKPIを表示しています。`);
};

const validateNumber = (value) => Number.isFinite(Number(value));

addKpiButton.addEventListener("click", async () => {
  const name = kpiNameInput.value.trim();
  const target = Number(kpiTargetInput.value);
  const progress = Number(kpiProgressInput.value);

  if (!name) {
    alert("KPI名を入力してください。");
    return;
  }

  if (!validateNumber(kpiTargetInput.value) || !validateNumber(kpiProgressInput.value)) {
    alert("目標値と進捗は数値で入力してください。");
    return;
  }

  addKpiButton.disabled = true;

  try {
    await addDoc(getKpisRef(), {
      name,
      target,
      progress,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    kpiNameInput.value = "";
    kpiTargetInput.value = "";
    kpiProgressInput.value = "0";

    await loadKpis();
  } catch (error) {
    console.error(error);
    alert("KPIの保存に失敗しました。");
    setKpiStatus("KPIの保存に失敗しました。Firestoreルールを確認してください。", true);
  } finally {
    addKpiButton.disabled = false;
  }
});

kpiTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest(".save-progress-button");

  if (!button) {
    return;
  }

  const cell = button.closest(".progress-cell");
  const input = cell?.querySelector(".progress-input");
  const progress = Number(input?.value);

  if (!Number.isFinite(progress)) {
    alert("進捗は数値で入力してください。");
    return;
  }

  button.disabled = true;

  try {
    const kpiRef = doc(db, "kgis", kgiId, "kpis", button.dataset.kpiId);
    await updateDoc(kpiRef, {
      progress,
      updatedAt: serverTimestamp()
    });

    await loadKpis();
  } catch (error) {
    console.error(error);
    setKpiStatus("進捗の更新に失敗しました。", true);
  } finally {
    button.disabled = false;
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
