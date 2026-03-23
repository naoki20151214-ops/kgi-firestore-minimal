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

const isArchivedKgi = (kgi) => kgi?.archived === true || String(kgi?.status ?? "").trim().toLowerCase() === "archived";

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
  try {
    const db = await getDb();
    const kgisRef = collection(db, "kgis");
    const kgisQuery = query(kgisRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(kgisQuery);
    const visibleKgiDocs = snapshot.docs.filter((docItem) => !isArchivedKgi(docItem.data()));

    if (visibleKgiDocs.length === 0) {
      setStatus("データは0件です。");
      emptyState.hidden = false;
      return;
    }

    renderRows(visibleKgiDocs);
    tableWrap.hidden = false;
    emptyState.hidden = true;

    setStatus(`${visibleKgiDocs.length}件のKGIを表示しています。`);
  } catch (error) {
    console.error(error);
    setStatus("一覧の読み込みに失敗しました。Firebase設定とルールを確認してください。", true);
  }
})();
