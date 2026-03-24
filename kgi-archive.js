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
const reloadButton = document.getElementById("reloadButton");

const archiveDebugTargetKgiId = document.getElementById("archiveDebugTargetKgiId");
const archiveDebugTargetCollectionPath = document.getElementById("archiveDebugTargetCollectionPath");
const archiveDebugWriteStarted = document.getElementById("archiveDebugWriteStarted");
const archiveDebugWriteSucceeded = document.getElementById("archiveDebugWriteSucceeded");
const archiveDebugVerifySucceeded = document.getElementById("archiveDebugVerifySucceeded");
const archiveDebugCurrentPage = document.getElementById("archiveDebugCurrentPage");
const archiveDebugInitStarted = document.getElementById("archiveDebugInitStarted");
const archiveDebugInitSucceeded = document.getElementById("archiveDebugInitSucceeded");
const archiveDebugRedirectFrom = document.getElementById("archiveDebugRedirectFrom");
const archiveDebugRedirectTo = document.getElementById("archiveDebugRedirectTo");
const archiveDebugLastErrorMessage = document.getElementById("archiveDebugLastErrorMessage");
const LIST_REDIRECT_TRACE_KEY = "kgi_redirect_trace";
const LIST_PAGE_ABSOLUTE_URL = new URL("./list.html", window.location.href).href;

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
  currentPage: "kgi-archive.html",
  initStarted: false,
  initSucceeded: false,
  redirectFrom: "",
  redirectTo: "",
  lastErrorMessage: ""
};

const isArchivedKgi = (kgi) => kgi?.archived === true || String(kgi?.status ?? "").trim().toLowerCase() === "archived";

const renderDebugState = () => {
  archiveDebugTargetKgiId.textContent = debugState.targetKgiId || "-";
  archiveDebugTargetCollectionPath.textContent = debugState.targetCollectionPath || "kgis";
  archiveDebugWriteStarted.textContent = String(debugState.archiveWriteStarted);
  archiveDebugWriteSucceeded.textContent = String(debugState.archiveWriteSucceeded);
  archiveDebugVerifySucceeded.textContent = String(debugState.archiveVerifySucceeded);
  archiveDebugCurrentPage.textContent = debugState.currentPage || "kgi-archive.html";
  archiveDebugInitStarted.textContent = String(debugState.initStarted);
  archiveDebugInitSucceeded.textContent = String(debugState.initSucceeded);
  archiveDebugRedirectFrom.textContent = debugState.redirectFrom || "-";
  archiveDebugRedirectTo.textContent = debugState.redirectTo || "-";
  archiveDebugLastErrorMessage.textContent = debugState.lastErrorMessage || "-";
};

const updateDebugState = (partial = {}) => {
  Object.assign(debugState, partial);
  renderDebugState();
};

window.addEventListener("error", (event) => {
  updateDebugState({
    initStarted: true,
    initSucceeded: false,
    lastErrorMessage: event.message || "Runtime error"
  });
});

window.addEventListener("unhandledrejection", (event) => {
  updateDebugState({
    initStarted: true,
    initSucceeded: false,
    lastErrorMessage: event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Unhandled rejection")
  });
});

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
  const trace = {
    at: new Date().toISOString(),
    source: "kgi-archive.js:navigateList",
    count: 1,
    fromHref: window.location.href,
    toHref: LIST_PAGE_ABSOLUTE_URL
  };
  updateDebugState({ redirectFrom: trace.fromHref, redirectTo: trace.toHref });
  try {
    window.sessionStorage.setItem(LIST_REDIRECT_TRACE_KEY, JSON.stringify(trace));
  } catch (error) {
    console.warn("Failed to write redirect trace", error);
  }
  window.location.assign(LIST_PAGE_ABSOLUTE_URL);
};

const navigateDetail = () => {
  if (!targetKgiId) {
    window.location.href = "./list.html";
    return;
  }
  window.location.href = `./detail.html?id=${encodeURIComponent(targetKgiId)}`;
};

const loadKgi = async () => {
  updateDebugState({
    initStarted: true,
    initSucceeded: false,
    redirectFrom: "",
    redirectTo: "",
    lastErrorMessage: ""
  });
  targetKgiId = parseKgiId();
  updateDebugState({ targetKgiId, targetCollectionPath: targetKgiId ? `kgis/${targetKgiId}` : "kgis/(missing-id)" });

  if (!targetKgiId) {
    statusText.textContent = "KGI ID が指定されていません。";
    statusText.classList.add("error");
    archiveButton.disabled = true;
    updateDebugState({ initSucceeded: false, lastErrorMessage: "KGI ID が指定されていません。" });
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
    updateDebugState({ initSucceeded: false, lastErrorMessage: "KGIが見つかりません。" });
    return;
  }

  const data = snapshot.data();
  kgiName.textContent = typeof data?.name === "string" && data.name.trim() ? data.name : "(名称なし)";

  if (isArchivedKgi(data)) {
    statusText.textContent = "このKGIはすでにアーカイブ済みです。";
    archiveButton.disabled = true;
    setResult("一覧へ戻ります。", false);
    updateDebugState({ initSucceeded: true });
    window.setTimeout(navigateList, 500);
    return;
  }

  statusText.textContent = "このページで削除（アーカイブ）を実行できます。";
  updateDebugState({ initSucceeded: true });
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
reloadButton?.addEventListener("click", () => window.location.reload());
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
    updateDebugState({ initStarted: true, initSucceeded: false, lastErrorMessage: message });
    statusText.textContent = message;
    statusText.classList.add("error");
    setResult(message, true);
    archiveButton.disabled = true;
  }
})();
