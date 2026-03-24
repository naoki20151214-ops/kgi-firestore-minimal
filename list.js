import {
  collection,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const statusText = document.getElementById("statusText");
const tableWrap = document.getElementById("tableWrap");
const tableBody = document.getElementById("kgiTableBody");
const emptyState = document.getElementById("emptyState");
const reloadButton = document.getElementById("reloadButton");
const debugCurrentPage = document.getElementById("debugCurrentPage");
const debugInitStarted = document.getElementById("debugInitStarted");
const debugInitSucceeded = document.getElementById("debugInitSucceeded");
const debugRedirectFrom = document.getElementById("debugRedirectFrom");
const debugRedirectTo = document.getElementById("debugRedirectTo");
const debugLastErrorMessage = document.getElementById("debugLastErrorMessage");
const LIST_REDIRECT_TRACE_KEY = "kgi_redirect_trace";
const PAGE_NAME = "list.html";

const uiState = {
  currentPage: PAGE_NAME,
  initStarted: false,
  initSucceeded: false,
  redirectFrom: "",
  redirectTo: "",
  lastErrorMessage: ""
};

const renderUiState = () => {
  if (debugCurrentPage) {
    debugCurrentPage.textContent = uiState.currentPage;
  }
  if (debugInitStarted) {
    debugInitStarted.textContent = String(uiState.initStarted);
  }
  if (debugInitSucceeded) {
    debugInitSucceeded.textContent = String(uiState.initSucceeded);
  }
  if (debugRedirectFrom) {
    debugRedirectFrom.textContent = uiState.redirectFrom || "-";
  }
  if (debugRedirectTo) {
    debugRedirectTo.textContent = uiState.redirectTo || "-";
  }
  if (debugLastErrorMessage) {
    debugLastErrorMessage.textContent = uiState.lastErrorMessage || "-";
  }
};

const updateUiState = (partial = {}) => {
  Object.assign(uiState, partial);
  renderUiState();
};

const readRedirectTrace = () => {
  try {
    const raw = window.sessionStorage.getItem(LIST_REDIRECT_TRACE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn("Failed to read redirect trace", error);
    return null;
  }
};

const logListInitStart = () => {
  const trace = readRedirectTrace();
  window.sessionStorage.removeItem(LIST_REDIRECT_TRACE_KEY);
  updateUiState({
    initStarted: true,
    initSucceeded: false,
    redirectFrom: trace?.fromHref ?? "",
    redirectTo: trace?.toHref ?? window.location.href,
    lastErrorMessage: ""
  });
  console.info("list page init start", {
    href: window.location.href,
    redirectTrace: trace
  });
};

const logListInitSuccess = (visibleCount) => {
  updateUiState({ initSucceeded: true });
  console.info("list page init success", {
    href: window.location.href,
    visibleCount
  });
};

window.addEventListener("error", (event) => {
  updateUiState({
    initStarted: true,
    initSucceeded: false,
    lastErrorMessage: event.message || "Runtime error"
  });
  console.error("list page runtime error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

window.addEventListener("unhandledrejection", (event) => {
  updateUiState({
    initStarted: true,
    initSucceeded: false,
    lastErrorMessage: event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Unhandled rejection")
  });
  console.error("list page unhandled rejection", event.reason);
});

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const renderSkeletonRow = (message) => {
  tableBody.innerHTML = `<tr><td data-label="状態" colspan="4">${message}</td></tr>`;
};

const showInitFailureFallback = (message) => {
  renderSkeletonRow("一覧の描画に失敗しました。再読み込みしてください。");
  tableWrap.hidden = false;
  emptyState.hidden = true;
  setStatus(message, true);
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

const isArchivedKgi = (kgi) => kgi?.archived === true || String(kgi?.status ?? "").trim().toLowerCase() === "archived";

const filterVisibleKgiDocs = (docs = []) => docs.filter((docItem) => !isArchivedKgi(docItem.data()));

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

(async () => {
  renderUiState();
  reloadButton?.addEventListener("click", () => window.location.reload());
  logListInitStart();

  try {
    renderSkeletonRow("読み込み中...");
    const db = await getDb();
    const kgisRef = collection(db, "kgis");
    const kgisQuery = query(kgisRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(kgisQuery);
    const visibleKgiDocs = filterVisibleKgiDocs(snapshot.docs);

    if (visibleKgiDocs.length === 0) {
      setStatus("データは0件です。");
      emptyState.hidden = false;
      tableWrap.hidden = true;
      logListInitSuccess(0);
      return;
    }

    renderRows(visibleKgiDocs);
    tableWrap.hidden = false;
    emptyState.hidden = true;

    setStatus(`${visibleKgiDocs.length}件のKGIを表示しています。`);
    logListInitSuccess(visibleKgiDocs.length);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    updateUiState({
      initStarted: true,
      initSucceeded: false,
      lastErrorMessage: message
    });
    showInitFailureFallback("一覧の読み込みに失敗しました。Firebase設定とルールを確認してください。");
  }
})();
