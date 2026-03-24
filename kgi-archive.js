import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const kgiName = document.getElementById("kgiName");
const resultText = document.getElementById("resultText");
const archiveButton = document.getElementById("archiveButton");
const cancelButton = document.getElementById("cancelButton");

const archiveDebugTargetKgiId = document.getElementById("archiveDebugTargetKgiId");
const archiveDebugTargetCollectionPath = document.getElementById("archiveDebugTargetCollectionPath");
const archiveDebugWriteStarted = document.getElementById("archiveDebugWriteStarted");
const archiveDebugWriteSucceeded = document.getElementById("archiveDebugWriteSucceeded");
const archiveDebugVerifySucceeded = document.getElementById("archiveDebugVerifySucceeded");
const archiveDebugLastErrorMessage = document.getElementById("archiveDebugLastErrorMessage");

let db;
let targetKgiId = "";
let targetKgiRef = null;
let archiveInFlight = false;

const debugState = {
  targetKgiId: "",
  targetCollectionPath: "kgis",
  archiveWriteStarted: false,
  archiveWriteSucceeded: false,
  archiveVerifySucceeded: false,
  lastErrorMessage: ""
};

const isArchivedKgi = (kgi) => kgi?.archived === true || String(kgi?.status ?? "").trim().toLowerCase() === "archived";

const renderDebugState = () => {
  archiveDebugTargetKgiId.textContent = debugState.targetKgiId || "-";
  archiveDebugTargetCollectionPath.textContent = debugState.targetCollectionPath || "kgis";
  archiveDebugWriteStarted.textContent = String(debugState.archiveWriteStarted);
  archiveDebugWriteSucceeded.textContent = String(debugState.archiveWriteSucceeded);
  archiveDebugVerifySucceeded.textContent = String(debugState.archiveVerifySucceeded);
  archiveDebugLastErrorMessage.textContent = debugState.lastErrorMessage || "-";
};

const updateDebugState = (partial = {}) => {
  Object.assign(debugState, partial);
  renderDebugState();
};

const setResult = (message = "", isError = false) => {
  resultText.textContent = message;
  resultText.classList.toggle("error", isError);
};

const parseKgiId = () => {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("id");
  return typeof raw === "string" ? raw.trim() : "";
};

const navigateList = () => {
  window.location.href = "./list.html";
};

const navigateDetail = () => {
  if (!targetKgiId) {
    window.location.href = "./list.html";
    return;
  }
  window.location.href = `./detail.html?id=${encodeURIComponent(targetKgiId)}`;
};

const loadKgi = async () => {
  targetKgiId = parseKgiId();
  updateDebugState({ targetKgiId, targetCollectionPath: targetKgiId ? `kgis/${targetKgiId}` : "kgis/(missing-id)" });

  if (!targetKgiId) {
    statusText.textContent = "KGI ID が指定されていません。";
    statusText.classList.add("error");
    archiveButton.disabled = true;
    return;
  }

  cancelButton.href = `./detail.html?id=${encodeURIComponent(targetKgiId)}`;

  db = await getDb();
  targetKgiRef = doc(db, "kgis", targetKgiId);
  const snapshot = await getDoc(targetKgiRef);

  if (!snapshot.exists()) {
    statusText.textContent = "KGIが見つかりません。";
    statusText.classList.add("error");
    archiveButton.disabled = true;
    return;
  }

  const data = snapshot.data();
  kgiName.textContent = typeof data?.name === "string" && data.name.trim() ? data.name : "(名称なし)";

  if (isArchivedKgi(data)) {
    statusText.textContent = "このKGIはすでにアーカイブ済みです。";
    archiveButton.disabled = true;
    setResult("一覧へ戻ります。", false);
    window.setTimeout(navigateList, 500);
    return;
  }

  statusText.textContent = "このページで削除（アーカイブ）を実行できます。";
};

const archiveKgi = async () => {
  if (archiveInFlight) {
    return;
  }

  if (!targetKgiRef || !targetKgiId) {
    setResult("KGI参照の初期化に失敗しました。", true);
    return;
  }

  archiveInFlight = true;
  archiveButton.disabled = true;
  setResult("削除処理を開始しています...");

  updateDebugState({
    archiveWriteStarted: true,
    archiveWriteSucceeded: false,
    archiveVerifySucceeded: false,
    lastErrorMessage: ""
  });

  try {
    await updateDoc(targetKgiRef, {
      archived: true,
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    updateDebugState({ archiveWriteSucceeded: true });

    const verifySnapshot = await getDoc(targetKgiRef);
    if (!verifySnapshot.exists()) {
      throw new Error("更新後の再取得でKGIが見つかりませんでした。");
    }

    const verifyData = verifySnapshot.data();
    if (verifyData?.archived !== true || verifyData?.status !== "archived") {
      throw new Error(`アーカイブ確認に失敗しました: archived=${String(verifyData?.archived)} status=${String(verifyData?.status ?? "")}`);
    }

    updateDebugState({ archiveVerifySucceeded: true });
    setResult("アーカイブしました。一覧へ戻ります。");
    window.setTimeout(navigateList, 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    updateDebugState({
      archiveWriteSucceeded: false,
      archiveVerifySucceeded: false,
      lastErrorMessage: message
    });
    setResult(message, true);
    archiveButton.disabled = false;
  } finally {
    archiveInFlight = false;
  }
};

archiveButton?.addEventListener("click", archiveKgi);
cancelButton?.addEventListener("click", (event) => {
  if (!targetKgiId) {
    return;
  }
  event.preventDefault();
  navigateDetail();
});

(async () => {
  try {
    renderDebugState();
    await loadKgi();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    updateDebugState({ lastErrorMessage: message });
    statusText.textContent = message;
    statusText.classList.add("error");
    setResult(message, true);
    archiveButton.disabled = true;
  }
})();
