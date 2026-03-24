import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const params = new URLSearchParams(window.location.search);
const kgiId = params.get("id")?.trim() ?? "";
const phaseId = params.get("phaseId")?.trim() ?? "";
const kpiId = params.get("kpiId")?.trim() ?? "";

const backToPhaseLink = document.getElementById("backToPhaseLink");
const kpiTitle = document.getElementById("kpiTitle");
const kpiStatus = document.getElementById("kpiStatus");
const kpiMeta = document.getElementById("kpiMeta");
const kpiDescription = document.getElementById("kpiDescription");
const kpiProgress = document.getElementById("kpiProgress");
const taskManageLink = document.getElementById("taskManageLink");

const asText = (value, fallback = "-") => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const init = async () => {
  if (!kgiId || !phaseId || !kpiId) {
    kpiStatus.textContent = "URLが不正です。id / phaseId / kpiId を確認してください。";
    return;
  }

  backToPhaseLink.href = `./phase.html?id=${encodeURIComponent(kgiId)}&phaseId=${encodeURIComponent(phaseId)}`;
  taskManageLink.href = `./detail.html?id=${encodeURIComponent(kgiId)}#kpi-${encodeURIComponent(kpiId)}`;

  try {
    const db = await getDb();
    const kpiSnapshot = await getDoc(doc(db, "kpis", kpiId));

    if (!kpiSnapshot.exists()) {
      kpiStatus.textContent = "KPIが見つかりません。";
      return;
    }

    const data = kpiSnapshot.data();
    kpiTitle.textContent = asText(data?.name, "名称未設定KPI");
    kpiDescription.textContent = asText(data?.description, "説明は未設定です。");

    const progressRaw = Number(data?.progress ?? data?.overallProgress ?? 0);
    const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : 0;
    kpiProgress.textContent = `${Math.round(progress)}%`;

    kpiMeta.hidden = false;
    kpiStatus.textContent = "";
  } catch (error) {
    console.error(error);
    kpiStatus.textContent = "KPI詳細の読み込みに失敗しました。";
  }
};

void init();
