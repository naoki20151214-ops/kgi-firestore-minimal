import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDb } from "./firebase-config.js";

const nameInput = document.getElementById("kgiName");
const targetInput = document.getElementById("kgiTarget");
const emojiSelect = document.getElementById("kgiEmoji");
const saveButton = document.getElementById("saveButton");
const statusText = document.getElementById("statusText");

let db;

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

saveButton.disabled = true;
setStatus("Firebase接続を初期化しています...");

(async () => {
  try {
    db = await getDb();
    saveButton.disabled = false;
    setStatus("Firebase接続が完了しました。保存できます。");
  } catch (error) {
    console.error(error);
    setStatus("Firebase接続に失敗しました。設定を確認してください。", true);
  }
})();

saveButton.addEventListener("click", async () => {
  if (!db) {
    alert("Firebase接続を初期化中です。数秒後に再試行してください。");
    return;
  }

  const name = nameInput.value.trim();
  const target = Number(targetInput.value);
  const emoji = emojiSelect.value;

  if (!name) {
    alert("KGI名を入力してください。");
    return;
  }

  if (!Number.isFinite(target)) {
    alert("目標値を正しく入力してください。");
    return;
  }

  saveButton.disabled = true;

  try {
    await addDoc(collection(db, "kgis"), {
      name,
      target,
      emoji,
      createdAt: serverTimestamp()
    });

    location.href = "./list.html";
  } catch (error) {
    console.error(error);
    alert("保存に失敗しました。Firebase設定とルールを確認してください。");
    setStatus("保存に失敗しました。Firebase設定とルールを確認してください。", true);
    saveButton.disabled = false;
  }
});
