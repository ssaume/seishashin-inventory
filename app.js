const STORAGE_KEY = "seishashin-inventory-demo-v1";
const SETTINGS_KEY = "seishashin-inventory-settings-v1";
const PLACEHOLDER = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
  <rect width="100%" height="100%" fill="#f7edf1"/>
  <text x="50%" y="47%" dominant-baseline="middle" text-anchor="middle"
    font-family="sans-serif" font-size="34" fill="#d194aa">生寫真</text>
  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
    font-family="sans-serif" font-size="18" fill="#a88994">PHOTO</text>
</svg>`);

const els = {
  gallery: document.querySelector("#gallery"),
  emptyState: document.querySelector("#emptyState"),
  cardTemplate: document.querySelector("#cardTemplate"),
  entryDialog: document.querySelector("#entryDialog"),
  entryForm: document.querySelector("#entryForm"),
  addBtn: document.querySelector("#addBtn"),
  cancelEntryBtn: document.querySelector("#cancelEntryBtn"),
  imageInput: document.querySelector("#imageInput"),
  imagePickerBtn: document.querySelector("#imagePickerBtn"),
  imagePreview: document.querySelector("#imagePreview"),
  uploadPlaceholder: document.querySelector("#uploadPlaceholder"),
  searchInput: document.querySelector("#searchInput"),
  typeFilter: document.querySelector("#typeFilter"),
  sellFilter: document.querySelector("#sellFilter"),
  statTotal: document.querySelector("#statTotal"),
  statUnique: document.querySelector("#statUnique"),
  statSellable: document.querySelector("#statSellable"),
  statValue: document.querySelector("#statValue"),
  resultCount: document.querySelector("#resultCount"),
  toast: document.querySelector("#toast"),
  settingsBtn: document.querySelector("#settingsBtn"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  apiUrl: document.querySelector("#apiUrl"),
  apiSecret: document.querySelector("#apiSecret"),
  connectionState: document.querySelector("#connectionState"),
  clearSettingsBtn: document.querySelector("#clearSettingsBtn"),
  memberSuggestions: document.querySelector("#memberSuggestions"),
  saveEntryBtn: document.querySelector("#saveEntryBtn")
};

let records = [];
let selectedImage = null;

function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}
function isRemoteMode() {
  const s = getSettings();
  return Boolean(s.apiUrl && s.apiSecret);
}
function getDemoRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {}
  const seed = [
    { id: crypto.randomUUID(), createdAt: new Date().toISOString(), photoName: "18th 制服生寫真", memberName: "松尾桜", type: "全身", quantity: 2, sellable: false, unitPrice: 250, imageUrl: PLACEHOLDER },
    { id: crypto.randomUUID(), createdAt: new Date().toISOString(), photoName: "18th 制服生寫真", memberName: "大田美月", type: "半身", quantity: 1, sellable: true, unitPrice: 300, imageUrl: PLACEHOLDER },
    { id: crypto.randomUUID(), createdAt: new Date().toISOString(), photoName: "五期生 LIVE", memberName: "大野愛実", type: "大頭", quantity: 3, sellable: true, unitPrice: 280, imageUrl: PLACEHOLDER }
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}
function saveDemoRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

async function api(action, payload = {}) {
  const { apiUrl, apiSecret } = getSettings();
  if (!apiUrl || !apiSecret) throw new Error("尚未設定後端");
  const res = await fetch(apiUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, secret: apiSecret, ...payload })
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API 發生錯誤");
  return data;
}

async function loadRecords() {
  try {
    if (isRemoteMode()) {
      const data = await api("list");
      records = data.items || [];
      setConnectionText("目前：Google Drive 模式");
    } else {
      records = getDemoRecords();
      setConnectionText("目前：Demo 模式");
    }
  } catch (err) {
    showToast(`讀取失敗：${err.message}`);
    records = getDemoRecords();
    setConnectionText("後端連線失敗，暫用 Demo 模式");
  }
  render();
}

function render() {
  const q = els.searchInput.value.trim().toLowerCase();
  const type = els.typeFilter.value;
  const sell = els.sellFilter.value;
  const filtered = records.filter(r => {
    const hitText = !q || `${r.photoName} ${r.memberName}`.toLowerCase().includes(q);
    const hitType = !type || r.type === type;
    const hitSell = !sell || String(Boolean(r.sellable)) === sell;
    return hitText && hitType && hitSell;
  });

  els.gallery.innerHTML = "";
  filtered.forEach(record => els.gallery.appendChild(buildCard(record)));
  els.emptyState.classList.toggle("hidden", filtered.length !== 0);
  els.resultCount.textContent = `${filtered.length} 筆`;
  updateStats();
  updateMemberSuggestions();
}

function buildCard(record) {
  const node = els.cardTemplate.content.cloneNode(true);
  const img = node.querySelector(".card-img");
  img.src = record.imageUrl || PLACEHOLDER;
  img.alt = `${record.memberName} ${record.photoName} ${record.type}`;
  img.onerror = () => { img.src = PLACEHOLDER; };

  node.querySelector(".card-name").textContent = record.photoName;
  node.querySelector(".card-member").textContent = record.memberName;
  node.querySelector(".type-chip").textContent = record.type;
  node.querySelector(".card-qty").textContent = record.quantity;
  node.querySelector(".card-price").textContent = `NT$ ${Number(record.unitPrice || 0).toLocaleString()}`;

  const badge = node.querySelector(".sale-badge");
  badge.textContent = record.sellable ? "可賣" : "非賣";
  badge.classList.add(record.sellable ? "yes" : "no");

  node.querySelector(".qty-minus").addEventListener("click", () => adjustQuantity(record, -1));
  node.querySelector(".qty-plus").addEventListener("click", () => adjustQuantity(record, 1));
  node.querySelector(".delete-btn").addEventListener("click", () => deleteRecord(record));
  return node;
}

function updateStats() {
  const total = records.reduce((s, r) => s + Number(r.quantity || 0), 0);
  const sellable = records.filter(r => r.sellable).reduce((s, r) => s + Number(r.quantity || 0), 0);
  const value = records.filter(r => r.sellable).reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unitPrice || 0), 0);
  els.statTotal.textContent = total.toLocaleString();
  els.statUnique.textContent = records.length.toLocaleString();
  els.statSellable.textContent = sellable.toLocaleString();
  els.statValue.textContent = `NT$ ${value.toLocaleString()}`;
}

function updateMemberSuggestions() {
  const names = [...new Set(records.map(r => r.memberName).filter(Boolean))].sort((a,b) => a.localeCompare(b, "zh-Hant"));
  els.memberSuggestions.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join("");
}

async function adjustQuantity(record, delta) {
  const next = Math.max(0, Number(record.quantity) + delta);
  if (next === 0) {
    if (!confirm("數量將變成 0。要直接刪除這筆紀錄嗎？")) return;
    return deleteRecord(record);
  }
  try {
    if (isRemoteMode()) await api("adjustQty", { id: record.id, quantity: next });
    record.quantity = next;
    if (!isRemoteMode()) saveDemoRecords();
    render();
  } catch (err) { showToast(`更新失敗：${err.message}`); }
}

async function deleteRecord(record) {
  if (!confirm(`確定刪除「${record.memberName}／${record.photoName}／${record.type}」？`)) return;
  try {
    if (isRemoteMode()) await api("delete", { id: record.id });
    records = records.filter(r => r.id !== record.id);
    if (!isRemoteMode()) saveDemoRecords();
    render();
    showToast("已刪除");
  } catch (err) { showToast(`刪除失敗：${err.message}`); }
}

els.addBtn.addEventListener("click", () => els.entryDialog.showModal());
els.cancelEntryBtn.addEventListener("click", () => els.entryDialog.close());
els.imagePickerBtn.addEventListener("click", () => els.imageInput.click());
els.imageInput.addEventListener("change", async () => {
  const file = els.imageInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return showToast("請選擇圖片檔");
  try {
    selectedImage = await compressImage(file, 1600, 0.82);
    els.imagePreview.src = selectedImage.dataUrl;
    els.imagePreview.classList.remove("hidden");
    els.uploadPlaceholder.classList.add("hidden");
  } catch (err) { showToast(`圖片處理失敗：${err.message}`); }
});

els.entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const photoName = document.querySelector("#photoName").value.trim();
  const memberName = document.querySelector("#memberName").value.trim();
  const type = document.querySelector("#photoType").value;
  const quantity = Number(document.querySelector("#quantity").value);
  const unitPrice = Number(document.querySelector("#unitPrice").value || 0);
  const sellable = document.querySelector("#sellable").checked;

  if (!photoName || !memberName || !quantity) return showToast("請填寫必填欄位");
  if (!selectedImage) return showToast("請先拍照或選擇圖片");

  const item = { photoName, memberName, type, quantity, unitPrice, sellable };
  els.saveEntryBtn.disabled = true;
  els.saveEntryBtn.textContent = "儲存中…";

  try {
    if (isRemoteMode()) {
      const data = await api("create", {
        item,
        image: {
          base64: selectedImage.base64,
          mimeType: "image/jpeg",
          filename: buildFilename(item)
        }
      });
      records.unshift(data.item);
    } else {
      records.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...item,
        imageUrl: selectedImage.dataUrl
      });
      try { saveDemoRecords(); }
      catch {
        records.shift();
        throw new Error("Demo 模式的瀏覽器空間不足，請改接 Google Drive 後端");
      }
    }
    resetEntryForm();
    els.entryDialog.close();
    render();
    showToast("已新增生寫真");
  } catch (err) {
    showToast(`儲存失敗：${err.message}`);
  } finally {
    els.saveEntryBtn.disabled = false;
    els.saveEntryBtn.textContent = "儲存";
  }
});

function resetEntryForm() {
  els.entryForm.reset();
  document.querySelector("#quantity").value = 1;
  document.querySelector("#unitPrice").value = 0;
  selectedImage = null;
  els.imageInput.value = "";
  els.imagePreview.removeAttribute("src");
  els.imagePreview.classList.add("hidden");
  els.uploadPlaceholder.classList.remove("hidden");
}

els.searchInput.addEventListener("input", render);
els.typeFilter.addEventListener("change", render);
els.sellFilter.addEventListener("change", render);

els.settingsBtn.addEventListener("click", () => {
  const s = getSettings();
  els.apiUrl.value = s.apiUrl || "";
  els.apiSecret.value = s.apiSecret || "";
  els.settingsDialog.showModal();
});
els.settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const apiUrl = els.apiUrl.value.trim();
  const apiSecret = els.apiSecret.value.trim();
  if (!apiUrl || !apiSecret) return showToast("請填入 API URL 與存取金鑰");
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiUrl, apiSecret }));
  setConnectionText("測試連線中…");
  try {
    await api("ping");
    els.settingsDialog.close();
    showToast("後端連線成功");
    await loadRecords();
  } catch (err) {
    setConnectionText(`連線失敗：${err.message}`);
    showToast("設定已保存，但連線測試失敗");
  }
});
els.clearSettingsBtn.addEventListener("click", async () => {
  localStorage.removeItem(SETTINGS_KEY);
  els.apiUrl.value = "";
  els.apiSecret.value = "";
  els.settingsDialog.close();
  await loadRecords();
  showToast("已切回 Demo 模式");
});

function setConnectionText(text) { els.connectionState.textContent = text; }

async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const dataUrl = await fileToDataURL(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const jpeg = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl: jpeg, base64: jpeg.split(",")[1] };
}
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function buildFilename(item) {
  const safe = s => String(s).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  return `${safe(item.memberName)}_${safe(item.photoName)}_${safe(item.type)}_${Date.now()}.jpg`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[ch]));
}
let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

loadRecords();
