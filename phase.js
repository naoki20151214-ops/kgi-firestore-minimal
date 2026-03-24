import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const backToKgiLink = document.getElementById("backToKgiLink");
const phaseName = document.getElementById("phaseName");
const phaseStatus = document.getElementById("phaseStatus");
const phaseMeta = document.getElementById("phaseMeta");
const phasePurpose = document.getElementById("phasePurpose");
const phaseDeadline = document.getElementById("phaseDeadline");
const kpiStatus = document.getElementById("kpiStatus");
const kpiList = document.getElementById("kpiList");
const kpiNameInput = document.getElementById("kpiNameInput");
const kpiDescriptionInput = document.getElementById("kpiDescriptionInput");
const createKpiButton = document.getElementById("createKpiButton");

const params = new URLSearchParams(window.location.search);
const kgiId = params.get("id")?.trim() ?? "";
const phaseId = params.get("phaseId")?.trim() ?? "";

let db;
let currentPhase = null;

const asText = (value, fallback = "-") => {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const getPhaseFromKgi = (kgiData, phaseIdValue) => {
  const phases = Array.isArray(kgiData?.roadmapPhases) ? kgiData.roadmapPhases : [];
  const byId = phases.find((phase) => asText(phase?.id, "") === phaseIdValue);

  if (byId) {
    return byId;
  }

  return phases.find((phase, index) => `phase_${index + 1}` === phaseIdValue) ?? null;
};

const normalizePhase = (phase, index = 0) => {
  const phaseNumber = Number.isFinite(Number(phase?.phaseNumber)) ? Number(phase.phaseNumber) : index + 1;

  return {
    id: asText(phase?.id, `phase_${phaseNumber}`),
    name: asText(phase?.title ?? phase?.name, `フェーズ${phaseNumber}`),
    purpose: asText(phase?.description ?? phase?.goal ?? phase?.summary, "説明は未設定です。"),
    deadline: asText(phase?.deadline ?? phase?.targetDate ?? phase?.dueDate, "期限未設定"),
    phaseNumber
  };
};

const renderPhase = (phase) => {
  phaseName.textContent = `フェーズ${phase.phaseNumber}: ${phase.name}`;
  phasePurpose.textContent = phase.purpose;
  phaseDeadline.textContent = phase.deadline;
  phaseMeta.hidden = false;
  phaseStatus.textContent = "";
};

const renderKpis = (kpis) => {
  if (!kpis.length) {
    kpiStatus.textContent = "このフェーズのKPIはまだありません。下のフォームから追加してください。";
    kpiList.hidden = true;
    return;
  }

  kpiList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  kpis.forEach((kpi) => {
    const item = document.createElement("li");
    item.className = "kpi-item";

    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.className = "kpi-link";
    link.href = `./kpi.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(currentPhase.id)}&kpiId=${encodeURIComponent(kpi.id)}`;
    link.textContent = asText(kpi.name, "名称未設定KPI");
    title.appendChild(link);

    const description = document.createElement("p");
    description.textContent = asText(kpi.description, "説明は未設定です。");

    item.append(title, description);
    fragment.appendChild(item);
  });

  kpiList.appendChild(fragment);
  kpiList.hidden = false;
  kpiStatus.textContent = `${kpis.length}件のKPIを表示しています。`;
};

const loadPhaseAndKpis = async () => {
  const kgiRef = doc(db, "kgis", kgiId);
  const kgiSnapshot = await getDoc(kgiRef);

  if (!kgiSnapshot.exists()) {
    throw new Error("KGI_NOT_FOUND");
  }

  const rawPhase = getPhaseFromKgi(kgiSnapshot.data(), phaseId);

  if (!rawPhase) {
    throw new Error("PHASE_NOT_FOUND");
  }

  const phaseIndex = (Array.isArray(kgiSnapshot.data()?.roadmapPhases)
    ? kgiSnapshot.data().roadmapPhases.findIndex((phase) => asText(phase?.id, "") === phaseId)
    : -1);
  currentPhase = normalizePhase(rawPhase, phaseIndex >= 0 ? phaseIndex : 0);
  renderPhase(currentPhase);

  const kpisSnapshot = await getDocs(query(collection(db, "kpis"), where("kgiId", "==", kgiId), where("phaseId", "==", currentPhase.id)));
  const kpis = kpisSnapshot.docs.map((kpiDoc) => ({ id: kpiDoc.id, ...kpiDoc.data() }));
  renderKpis(kpis);
};

const createKpi = async () => {
  if (!currentPhase) {
    return;
  }

  const name = kpiNameInput.value.trim();
  const description = kpiDescriptionInput.value.trim();

  if (!name) {
    alert("KPI名を入力してください。");
    return;
  }

  createKpiButton.disabled = true;

  try {
    await addDoc(collection(db, "kpis"), {
      kgiId,
      phaseId: currentPhase.id,
      phaseName: currentPhase.name,
      phaseNumber: currentPhase.phaseNumber,
      name,
      description,
      progress: 0,
      isCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: "active"
    });

    kpiNameInput.value = "";
    kpiDescriptionInput.value = "";
    await loadPhaseAndKpis();
  } catch (error) {
    console.error(error);
    alert("KPI作成に失敗しました。再試行してください。");
  } finally {
    createKpiButton.disabled = false;
  }
};

const init = async () => {
  if (!kgiId || !phaseId) {
    phaseStatus.textContent = "URLが不正です。KGI ID と phaseId を確認してください。";
    phaseStatus.classList.add("error");
    kpiStatus.textContent = "";
    return;
  }

  backToKgiLink.href = `./detail.html?id=${encodeURIComponent(kgiId)}`;

  try {
    db = await getDb();
    await loadPhaseAndKpis();
  } catch (error) {
    console.error(error);
    phaseStatus.textContent = "フェーズの読み込みに失敗しました。";
    phaseStatus.classList.add("error");
    kpiStatus.textContent = "";
  }
};

createKpiButton.addEventListener("click", () => {
  void createKpi();
});

void init();
