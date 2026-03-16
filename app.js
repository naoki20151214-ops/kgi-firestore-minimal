import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase-config.js";

const nameInput = document.getElementById("kgiName");
const targetInput = document.getElementById("kgiTarget");
const emojiSelect = document.getElementById("kgiEmoji");
const saveButton = document.getElementById("saveButton");

saveButton.addEventListener("click", async () => {
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

    alert("FirestoreにKGIを保存しました。");
    nameInput.value = "";
    targetInput.value = "";
    emojiSelect.selectedIndex = 0;
  } catch (error) {
    console.error(error);
    alert("保存に失敗しました。Firebase設定とルールを確認してください。");
  } finally {
    saveButton.disabled = false;
  }
});
