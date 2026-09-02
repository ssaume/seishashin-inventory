const STORAGE_KEY = "seishashin-inventory-demo-v2";
const SETTINGS_KEY = "seishashin-inventory-settings-v1";
const PAGE_PARAMS = new URLSearchParams(window.location.search);
const SHARE_TOKEN = PAGE_PARAMS.get("share") || "";
const SHARE_API_URL = PAGE_PARAMS.get("api") || "";
const IS_SHARE_MODE = Boolean(SHARE_TOKEN && SHARE_API_URL);
const CSV_COLUMNS = [
  ["id", "ID"],
  ["createdAt", "建立時間"],
  ["updatedAt", "更新時間"],
  ["seriesName", "生寫真系列"],
  ["memberName", "成員名"],
  ["type", "類型1"],
  ["type2", "類型2"],
  ["quantity", "數量"],
  ["tradeStatus", "狀態"],
  ["unitPrice", "單價"],
  ["imageFileId", "圖片File ID"],
  ["imageUrl", "圖片URL"],
  ["reservedExchange", "預約交換"],
  ["reservedPurchase", "預約購買"]
];
const PLACEHOLDER = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
  <rect width="100%" height="100%" fill="#edf8fe"/>
  <text x="50%" y="47%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#72bde8">生寫真</text>
  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#6e97af">PHOTO</text>
</svg>`);

const els = {
  seriesContainer: document.querySelector("#seriesContainer"),
  emptyState: document.querySelector("#emptyState"),
  cardTemplate: document.querySelector("#cardTemplate"),
  seriesTemplate: document.querySelector("#seriesTemplate"),
  entryDialog: document.querySelector("#entryDialog"),
  entryForm: document.querySelector("#entryForm"),
  addBtn: document.querySelector("#addBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  uploadBtn: document.querySelector("#uploadBtn"),
  csvInput: document.querySelector("#csvInput"),
  cancelEntryBtn: document.querySelector("#cancelEntryBtn"),
  entryCloseBtn: document.querySelector("#entryCloseBtn"),
  imageInput: document.querySelector("#imageInput"),
  imagePickerBtn: document.querySelector("#imagePickerBtn"),
  imagePreview: document.querySelector("#imagePreview"),
  uploadPlaceholder: document.querySelector("#uploadPlaceholder"),
  searchInput: document.querySelector("#searchInput"),
  typeFilter: document.querySelector("#typeFilter"),
  type2Filter: document.querySelector("#type2Filter"),
  statusFilter: document.querySelector("#statusFilter"),
  statTotal: document.querySelector("#statTotal"),
  statUnique: document.querySelector("#statUnique"),
  statSeries: document.querySelector("#statSeries"),
  resultCount: document.querySelector("#resultCount"),
  toast: document.querySelector("#toast"),
  settingsBtn: document.querySelector("#settingsBtn"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  apiUrl: document.querySelector("#apiUrl"),
  apiSecret: document.querySelector("#apiSecret"),
  connectionState: document.querySelector("#connectionState"),
  clearSettingsBtn: document.querySelector("#clearSettingsBtn"),
  settingsCloseBtn: document.querySelector("#settingsCloseBtn"),
  seriesSuggestions: document.querySelector("#seriesSuggestions"),
  memberSuggestions: document.querySelector("#memberSuggestions"),
  type2Suggestions: document.querySelector("#type2Suggestions"),
  saveEntryBtn: document.querySelector("#saveEntryBtn"),
  shareBtn: document.querySelector("#shareBtn"),
  shareDialog: document.querySelector("#shareDialog"),
  shareCloseBtn: document.querySelector("#shareCloseBtn"),
  shareLinkInput: document.querySelector("#shareLinkInput"),
  copyShareBtn: document.querySelector("#copyShareBtn"),
  generateShareBtn: document.querySelector("#generateShareBtn"),
  revokeShareBtn: document.querySelector("#revokeShareBtn"),
  shareState: document.querySelector("#shareState"),
  shareModeBadge: document.querySelector("#shareModeBadge"),
  shareBanner: document.querySelector("#shareBanner"),
  collectionTitle: document.querySelector("#collectionTitle")
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
function normalizeRecord(r) {
  return {
    ...r,
    seriesName: r.seriesName || r.photoName || "",
    type2: r.type2 || "",
    tradeStatus: r.tradeStatus || (r.sellable === true ? "可賣" : "非賣"),
    reservedExchange: Math.max(0, Number(r.reservedExchange || 0)),
    reservedPurchase: Math.max(0, Number(r.reservedPurchase || 0))
  };
}
function getDemoRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved.map(normalizeRecord);
  } catch {}
  const seed = [
    { id: crypto.randomUUID(), createdAt: new Date().toISOString(), seriesName: "18th 制服生寫真", memberName: "松尾桜", type: "全身", type2: "", quantity: 2, tradeStatus: "非賣", unitPrice: 250, imageUrl: PLACEHOLDER, reservedExchange: 0, reservedPurchase: 0 },
    { id: crypto.randomUUID(), createdAt: new Date().toISOString(), seriesName: "18th 制服生寫真", memberName: "大田美月", type: "半身", type2: "ヨリ", quantity: 1, tradeStatus: "可換", unitPrice: 300, imageUrl: PLACEHOLDER, reservedExchange: 0, reservedPurchase: 0 },
    { id: crypto.randomUUID(), createdAt: new Date().toISOString(), seriesName: "五期生 LIVE", memberName: "大野愛実", type: "大頭", type2: "特典", quantity: 1, tradeStatus: "求", unitPrice: 0, imageUrl: PLACEHOLDER, reservedExchange: 0, reservedPurchase: 0 },
    { id: crypto.randomUUID(), createdAt: new Date().toISOString(), seriesName: "五期生 LIVE", memberName: "松尾桜", type: "坐姿", type2: "", quantity: 3, tradeStatus: "可賣", unitPrice: 280, imageUrl: PLACEHOLDER, reservedExchange: 0, reservedPurchase: 0 }
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
async function publicApi(action, payload = {}) {
  if (!SHARE_API_URL || !SHARE_TOKEN) throw new Error("分享連結資訊不完整");
  const res = await fetch(SHARE_API_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, shareToken: SHARE_TOKEN, ...payload })
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "分享連結無法讀取");
  return data;
}

function buildShareUrl(token) {
  const { apiUrl } = getSettings();
  if (!apiUrl) throw new Error("尚未設定 Apps Script API URL");
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("share", token);
  url.searchParams.set("api", apiUrl);
  return url.toString();
}

function applyShareModeUI() {
  if (!IS_SHARE_MODE) return;
  document.body.classList.add("share-mode");
  els.shareModeBadge?.classList.remove("hidden");
  els.shareBanner?.classList.remove("hidden");
  if (els.collectionTitle) els.collectionTitle.textContent = "收藏檢視";
  document.title = "生寫真收藏檢視";
}
async function loadRecords() {
  try {
    if (IS_SHARE_MODE) {
      const data = await publicApi("publicList");
      records = (data.items || []).map(normalizeRecord);
    } else if (isRemoteMode()) {
      const data = await api("list");
      records = (data.items || []).map(normalizeRecord);
      setConnectionText("目前：Google Drive 模式");
    } else {
      records = getDemoRecords();
      setConnectionText("目前：Demo 模式");
    }
  } catch (err) {
    if (IS_SHARE_MODE) {
      records = [];
      render();
      showToast(`分享連結讀取失敗：${err.message}`);
      if (els.emptyState) {
        els.emptyState.querySelector("h3").textContent = "分享連結無效或已失效";
        els.emptyState.querySelector("p").textContent = "請向分享者索取新的檢視連結。";
        els.emptyState.classList.remove("hidden");
      }
      return;
    }
    showToast(`讀取失敗：${err.message}`);
    records = getDemoRecords();
    setConnectionText("後端連線失敗，暫用 Demo 模式");
  }
  render();
}
function render() {
  const q = els.searchInput.value.trim().toLowerCase();
  const type = els.typeFilter.value;
  const type2 = els.type2Filter.value;
  const status = els.statusFilter.value;

  const filtered = records.filter(r => {
    const searchable = `${r.seriesName} ${r.memberName} ${r.type2 || ""}`.toLowerCase();
    return (!q || searchable.includes(q))
      && (!type || r.type === type)
      && (!type2 || r.type2 === type2)
      && (!status || r.tradeStatus === status);
  });

  renderSeriesGroups(filtered);
  els.emptyState.classList.toggle("hidden", filtered.length !== 0);
  els.resultCount.textContent = `${filtered.length} 筆`;
  updateStats();
  updateSuggestions();
  updateType2Filter();
}
function renderSeriesGroups(filtered) {
  els.seriesContainer.innerHTML = "";
  const groups = new Map();
  filtered.forEach(record => {
    const key = record.seriesName || "未命名系列";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  [...groups.entries()]
    .sort(([a],[b]) => a.localeCompare(b, "zh-Hant"))
    .forEach(([seriesName, items]) => {
      const node = els.seriesTemplate.content.cloneNode(true);
      const section = node.querySelector(".series-section");
      const header = node.querySelector(".series-header");
      const gallery = node.querySelector(".gallery");

      node.querySelector(".series-title").textContent = seriesName;
      const totalQty = items.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
      node.querySelector(".series-count").textContent = `${items.length} 款・${totalQty} 張`;

      items
        .sort((a,b) => {
          const m = String(a.memberName).localeCompare(String(b.memberName), "zh-Hant");
          return m !== 0 ? m : String(a.type).localeCompare(String(b.type), "zh-Hant");
        })
        .forEach(record => gallery.appendChild(buildCard(record)));

      header.addEventListener("click", () => {
        const collapsed = section.classList.toggle("collapsed");
        header.setAttribute("aria-expanded", String(!collapsed));
      });
      els.seriesContainer.appendChild(node);
    });
}
function buildCard(record) {
  const node = els.cardTemplate.content.cloneNode(true);

  const img = node.querySelector(".card-img");
  img.src = record.imageUrl || PLACEHOLDER;
  img.alt = `${record.memberName} ${record.seriesName} ${record.type}`;
  img.onerror = () => { img.src = PLACEHOLDER; };

  node.querySelector(".card-member").textContent = record.memberName;
  node.querySelector(".card-series").textContent = record.seriesName;
  node.querySelector(".type-chip").textContent = record.type;
  node.querySelector(".card-qty").textContent = record.quantity;
  node.querySelector(".card-price").textContent = Number(record.unitPrice || 0).toLocaleString();

  const reservedExchange = Number(record.reservedExchange || 0);
  const reservedPurchase = Number(record.reservedPurchase || 0);
  const available = Math.max(0, Number(record.quantity || 0) - reservedExchange - reservedPurchase);

  node.querySelector(".card-available").textContent = available.toLocaleString();
  node.querySelector(".reserve-exchange-count").textContent = reservedExchange.toLocaleString();
  node.querySelector(".reserve-purchase-count").textContent = reservedPurchase.toLocaleString();
  node.querySelector(".exchange-label").textContent = reservedExchange > 0 ? "已有交換預約" : "尚無交換預約";
  node.querySelector(".purchase-label").textContent = reservedPurchase > 0 ? "已有購買預約" : "尚無購買預約";

  const stockBadge = node.querySelector(".stock-state-badge");
  stockBadge.textContent = available > 0 ? `尚有庫存 ${available}` : "目前無可用庫存";
  stockBadge.classList.add(available > 0 ? "in-stock" : "out-of-stock");

  const badge = node.querySelector(".status-badge");
  badge.textContent = record.tradeStatus;
  badge.classList.add(`status-${record.tradeStatus}`);

  if (record.type2) {
    const row = node.querySelector(".type2-row");
    row.classList.remove("hidden");
    node.querySelector(".type2-chip").textContent = `類型2：${record.type2}`;
  }

  const typeSelect = node.querySelector(".card-type-select");
  if (typeSelect) typeSelect.value = record.type;

  const statusSelect = node.querySelector(".card-status-select");
  statusSelect.value = record.tradeStatus;

  if (!IS_SHARE_MODE) {
    const qtyMinus = node.querySelector(".qty-minus");
    const qtyPlus = node.querySelector(".qty-plus");
    qtyMinus.addEventListener("click", () => adjustQuantity(record, -1));
    qtyPlus.addEventListener("click", () => adjustQuantity(record, 1));
    qtyMinus.disabled = Number(record.quantity) <= reservedExchange + reservedPurchase;

    if (typeSelect) {
      typeSelect.addEventListener("change", async () => {
        const oldType = record.type;
        const nextType = typeSelect.value;
        if (oldType === nextType) return;
        try {
          await updatePhotoType(record, nextType);
        } catch (err) {
          typeSelect.value = oldType;
          showToast(`類型1更新失敗：${err.message}`);
        }
      });
    }

    statusSelect.addEventListener("change", async () => {
      const oldStatus = record.tradeStatus;
      const nextStatus = statusSelect.value;
      if (oldStatus === nextStatus) return;
      try {
        await updateTradeStatus(record, nextStatus);
      } catch (err) {
        statusSelect.value = oldStatus;
        showToast(`狀態更新失敗：${err.message}`);
      }
    });

    const exMinus = node.querySelector(".reserve-exchange-minus");
    const exPlus = node.querySelector(".reserve-exchange-plus");
    const buyMinus = node.querySelector(".reserve-purchase-minus");
    const buyPlus = node.querySelector(".reserve-purchase-plus");

    exMinus.disabled = reservedExchange <= 0;
    buyMinus.disabled = reservedPurchase <= 0;
    exPlus.disabled = available <= 0;
    buyPlus.disabled = available <= 0;

    exMinus.addEventListener("click", () => adjustReservation(record, "exchange", -1));
    exPlus.addEventListener("click", () => adjustReservation(record, "exchange", 1));
    buyMinus.addEventListener("click", () => adjustReservation(record, "purchase", -1));
    buyPlus.addEventListener("click", () => adjustReservation(record, "purchase", 1));

    node.querySelector(".delete-btn").addEventListener("click", () => deleteRecord(record));
  }

  return node;
}
function updateStats() {
  const total = records.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  const seriesCount = new Set(records.map(r => r.seriesName).filter(Boolean)).size;
  els.statTotal.textContent = total.toLocaleString();
  els.statUnique.textContent = records.length.toLocaleString();
  els.statSeries.textContent = seriesCount.toLocaleString();
}
function updateSuggestions() {
  const seriesNames = [...new Set(records.map(r => r.seriesName).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "zh-Hant"));
  if (els.seriesSuggestions) {
    els.seriesSuggestions.innerHTML = seriesNames.map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
  }

  const members = [...new Set(records.map(r => r.memberName).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "zh-Hant"));
  els.memberSuggestions.innerHTML = members.map(v => `<option value="${escapeHtml(v)}"></option>`).join("");

  const type2Values = [...new Set(records.map(r => r.type2).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "zh-Hant"));
  els.type2Suggestions.innerHTML = type2Values.map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
}
function updateType2Filter() {
  const current = els.type2Filter.value;
  const values = [...new Set(records.map(r => r.type2).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "zh-Hant"));
  els.type2Filter.innerHTML =
    `<option value="">全部類型2</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if (values.includes(current)) els.type2Filter.value = current;
}
async function adjustQuantity(record, delta) {
  const reservedTotal = Number(record.reservedExchange || 0) + Number(record.reservedPurchase || 0);
  const next = Math.max(0, Number(record.quantity) + delta);

  if (next < reservedTotal) {
    return showToast(`在庫數量不可低於已預約數量 ${reservedTotal}`);
  }

  if (next === 0) {
    if (!confirm("數量將變成 0。要直接刪除這筆紀錄嗎？")) return;
    return deleteRecord(record);
  }

  try {
    if (isRemoteMode()) {
      const data = await api("adjustQty", { id: record.id, quantity: next });
      Object.assign(record, normalizeRecord(data.item));
    } else {
      record.quantity = next;
      saveDemoRecords();
    }
    render();
  } catch (err) {
    showToast(`更新失敗：${err.message}`);
  }
}

async function updatePhotoType(record, nextType) {
  if (!["全身", "半身", "大頭", "坐姿"].includes(nextType)) {
    throw new Error("類型1不正確");
  }

  if (isRemoteMode()) {
    const data = await api("updateType", { id: record.id, type: nextType });
    Object.assign(record, normalizeRecord(data.item));
  } else {
    record.type = nextType;
    saveDemoRecords();
  }

  render();
  showToast("類型1已更新");
}

async function updateTradeStatus(record, nextStatus) {
  if (!["非賣", "可換", "可賣", "求"].includes(nextStatus)) {
    throw new Error("狀態不正確");
  }

  if (isRemoteMode()) {
    const data = await api("updateStatus", { id: record.id, tradeStatus: nextStatus });
    Object.assign(record, normalizeRecord(data.item));
  } else {
    record.tradeStatus = nextStatus;
    saveDemoRecords();
  }
  render();
  showToast("狀態已更新");
}

async function adjustReservation(record, reservationType, delta) {
  const field = reservationType === "exchange" ? "reservedExchange" : "reservedPurchase";
  const label = reservationType === "exchange" ? "交換" : "購買";

  const current = Number(record[field] || 0);
  const next = current + delta;
  const reservedTotal = Number(record.reservedExchange || 0) + Number(record.reservedPurchase || 0);
  const available = Number(record.quantity || 0) - reservedTotal;

  if (next < 0) return;
  if (delta > 0 && available <= 0) {
    return showToast("目前沒有可用庫存可新增預約");
  }

  try {
    if (isRemoteMode()) {
      const data = await api("adjustReservation", {
        id: record.id,
        reservationType,
        delta
      });
      Object.assign(record, normalizeRecord(data.item));
    } else {
      record[field] = next;
      saveDemoRecords();
    }
    render();
    showToast(delta > 0 ? `已新增 1 筆${label}預約` : `已取消 1 筆${label}預約`);
  } catch (err) {
    showToast(`預約更新失敗：${err.message}`);
  }
}
async function deleteRecord(record) {
  if (!confirm(`確定刪除「${record.memberName}／${record.seriesName}／${record.type}」？`)) return;
  try {
    if (isRemoteMode()) await api("delete", { id: record.id });
    records = records.filter(r => r.id !== record.id);
    if (!isRemoteMode()) saveDemoRecords();
    render();
    showToast("已刪除");
  } catch (err) {
    showToast(`刪除失敗：${err.message}`);
  }
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function recordsToCsv(items) {
  const header = CSV_COLUMNS.map(([, label]) => csvEscape(label)).join(",");
  const rows = items.map(item =>
    CSV_COLUMNS.map(([key]) => csvEscape(item[key] ?? "")).join(",")
  );
  return "\uFEFF" + [header, ...rows].join("\r\n");
}
function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function formatFileTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}
function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ""; }
      else if (ch === '\n') {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = []; field = "";
      } else field += ch;
    }
  }
  if (quoted) throw new Error("CSV 引號格式不完整");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ""));
}
function csvRowsToRecords(rows) {
  if (!rows.length) throw new Error("CSV 沒有欄位標題");
  const labels = CSV_COLUMNS.map(([, label]) => label);
  const header = rows[0].map(v => String(v).trim());
  const missing = labels.filter(label => !header.includes(label));
  if (missing.length) throw new Error(`模板欄位不完整：缺少 ${missing.join("、")}`);
  const index = Object.fromEntries(header.map((label, i) => [label, i]));
  const result = [];
  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    if (!values.some(v => String(v).trim() !== "")) continue;
    const item = {};
    CSV_COLUMNS.forEach(([key, label]) => item[key] = values[index[label]] ?? "");
    item.seriesName = String(item.seriesName).trim();
    item.memberName = String(item.memberName).trim();
    item.type = String(item.type).trim();
    item.type2 = String(item.type2 || "").trim();
    item.tradeStatus = String(item.tradeStatus).trim();
    item.quantity = Number(item.quantity);
    item.unitPrice = item.unitPrice === "" ? 0 : Number(item.unitPrice);
    item.reservedExchange = item.reservedExchange === "" ? 0 : Number(item.reservedExchange);
    item.reservedPurchase = item.reservedPurchase === "" ? 0 : Number(item.reservedPurchase);
    if (!item.seriesName) throw new Error(`第 ${r + 1} 列：生寫真系列不可空白`);
    if (!item.memberName) throw new Error(`第 ${r + 1} 列：成員名不可空白`);
    if (!["全身", "半身", "大頭", "坐姿"].includes(item.type)) throw new Error(`第 ${r + 1} 列：類型1必須為全身、半身、大頭或坐姿`);
    if (!["非賣", "可換", "可賣", "求"].includes(item.tradeStatus)) throw new Error(`第 ${r + 1} 列：狀態必須為非賣、可換、可賣或求`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error(`第 ${r + 1} 列：數量必須為 1 以上整數`);
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error(`第 ${r + 1} 列：單價不可小於 0`);
    if (!Number.isInteger(item.reservedExchange) || item.reservedExchange < 0) throw new Error(`第 ${r + 1} 列：預約交換必須為 0 以上整數`);
    if (!Number.isInteger(item.reservedPurchase) || item.reservedPurchase < 0) throw new Error(`第 ${r + 1} 列：預約購買必須為 0 以上整數`);
    if (item.reservedExchange + item.reservedPurchase > item.quantity) throw new Error(`第 ${r + 1} 列：預約總數不可大於在庫數量`);
    result.push(item);
  }
  return result;
}

async function refreshShareDialog() {
  if (!isRemoteMode()) {
    els.shareState.textContent = "請先連接 Google Drive 後端，才能建立分享連結。";
    els.shareLinkInput.value = "";
    els.copyShareBtn.disabled = true;
    els.revokeShareBtn.disabled = true;
    return;
  }
  els.shareState.textContent = "讀取分享狀態中…";
  try {
    const info = await api("getShareInfo");
    if (info.enabled && info.token) {
      els.shareLinkInput.value = buildShareUrl(info.token);
      els.copyShareBtn.disabled = false;
      els.revokeShareBtn.disabled = false;
      els.generateShareBtn.textContent = "重新產生連結";
      els.shareState.textContent = info.createdAt
        ? `分享中・建立時間 ${new Date(info.createdAt).toLocaleString()}`
        : "分享中";
    } else {
      els.shareLinkInput.value = "";
      els.copyShareBtn.disabled = true;
      els.revokeShareBtn.disabled = true;
      els.generateShareBtn.textContent = "產生分享連結";
      els.shareState.textContent = "目前沒有有效的分享連結。";
    }
  } catch (err) {
    els.shareState.textContent = `讀取失敗：${err.message}`;
  }
}

els.shareBtn.addEventListener("click", async () => {
  if (!isRemoteMode()) return showToast("請先連接 Google Drive 後端");
  els.shareDialog.showModal();
  await refreshShareDialog();
});

els.shareCloseBtn.addEventListener("click", () => els.shareDialog.close());

els.generateShareBtn.addEventListener("click", async () => {
  if (!isRemoteMode()) return showToast("請先連接 Google Drive 後端");
  const replacing = Boolean(els.shareLinkInput.value);
  if (replacing && !confirm("重新產生後，舊的分享連結會立即失效。確定繼續嗎？")) return;
  els.generateShareBtn.disabled = true;
  els.generateShareBtn.textContent = "產生中…";
  try {
    const data = await api("rotateShareToken");
    els.shareLinkInput.value = buildShareUrl(data.token);
    els.copyShareBtn.disabled = false;
    els.revokeShareBtn.disabled = false;
    els.shareState.textContent = "新的唯讀分享連結已建立。";
    els.generateShareBtn.textContent = "重新產生連結";
    showToast("已產生分享連結");
  } catch (err) {
    showToast(`產生失敗：${err.message}`);
  } finally {
    els.generateShareBtn.disabled = false;
    if (!els.shareLinkInput.value) els.generateShareBtn.textContent = "產生分享連結";
  }
});

els.copyShareBtn.addEventListener("click", async () => {
  const value = els.shareLinkInput.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    els.shareLinkInput.focus();
    els.shareLinkInput.select();
    document.execCommand("copy");
  }
  showToast("分享連結已複製");
});

els.revokeShareBtn.addEventListener("click", async () => {
  if (!confirm("停用後，目前的分享連結會立即失效。確定停用嗎？")) return;
  els.revokeShareBtn.disabled = true;
  try {
    await api("revokeShareToken");
    els.shareLinkInput.value = "";
    els.copyShareBtn.disabled = true;
    els.generateShareBtn.textContent = "產生分享連結";
    els.shareState.textContent = "分享已停用。";
    showToast("分享連結已停用");
  } catch (err) {
    showToast(`停用失敗：${err.message}`);
  } finally {
    els.revokeShareBtn.disabled = !els.shareLinkInput.value;
  }
});

els.downloadBtn.addEventListener("click", async () => {
  try {
    if (!isRemoteMode()) {
      downloadTextFile("生寫真匯入模板.csv", recordsToCsv([]));
      return showToast("尚未連接後端，已下載 CSV 模板");
    }
    els.downloadBtn.disabled = true;
    els.downloadBtn.textContent = "下載中…";
    const data = await api("exportData");
    const items = (data.items || []).map(normalizeRecord);
    if (!items.length) {
      downloadTextFile("生寫真匯入模板.csv", recordsToCsv([]));
      showToast("後端目前沒有資料，已下載模板");
    } else {
      downloadTextFile(`生寫真收藏_${formatFileTimestamp()}.csv`, recordsToCsv(items));
      showToast(`已下載 ${items.length} 筆資料`);
    }
  } catch (err) {
    showToast(`下載失敗：${err.message}`);
  } finally {
    els.downloadBtn.disabled = false;
    els.downloadBtn.textContent = "⇩ 下載 CSV";
  }
});

els.uploadBtn.addEventListener("click", () => {
  if (!isRemoteMode()) return showToast("請先連接 Google Drive 後端再上傳");
  els.csvInput.value = "";
  els.csvInput.click();
});

els.csvInput.addEventListener("change", async () => {
  const file = els.csvInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = csvRowsToRecords(parseCsv(text));
    if (!confirm(`即將用 CSV 的 ${imported.length} 筆資料覆蓋後端目前資料。\n\n覆蓋前系統會先自動備份。確定繼續嗎？`)) return;
    els.uploadBtn.disabled = true;
    els.uploadBtn.textContent = "上傳中…";
    const data = await api("replaceAll", { items: imported });
    await loadRecords();
    showToast(`已覆蓋 ${data.count} 筆；備份：${data.backupFileName}`);
  } catch (err) {
    showToast(`上傳失敗：${err.message}`);
  } finally {
    els.uploadBtn.disabled = false;
    els.uploadBtn.textContent = "⇧ 上傳 CSV";
    els.csvInput.value = "";
  }
});

els.addBtn.addEventListener("click", () => els.entryDialog.showModal());
els.cancelEntryBtn.addEventListener("click", () => els.entryDialog.close());
els.entryCloseBtn.addEventListener("click", () => els.entryDialog.close());
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
  } catch (err) {
    showToast(`圖片處理失敗：${err.message}`);
  }
});

els.entryForm.addEventListener("submit", async e => {
  e.preventDefault();
  const item = {
    seriesName: document.querySelector("#seriesName").value.trim(),
    memberName: document.querySelector("#memberName").value.trim(),
    type: document.querySelector("#photoType").value,
    type2: document.querySelector("#photoType2").value.trim(),
    tradeStatus: document.querySelector("#tradeStatus").value,
    quantity: Number(document.querySelector("#quantity").value),
    unitPrice: Number(document.querySelector("#unitPrice").value || 0)
  };

  if (!item.seriesName || !item.memberName || !item.quantity) return showToast("請填寫必填欄位");
  if (!selectedImage) return showToast("請先拍照或選擇圖片");

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
      records.unshift(normalizeRecord(data.item));
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
  document.querySelector("#tradeStatus").value = "非賣";
  selectedImage = null;
  els.imageInput.value = "";
  els.imagePreview.removeAttribute("src");
  els.imagePreview.classList.add("hidden");
  els.uploadPlaceholder.classList.remove("hidden");
}

els.searchInput.addEventListener("input", render);
els.typeFilter.addEventListener("change", render);
els.type2Filter.addEventListener("change", render);
els.statusFilter.addEventListener("change", render);

els.settingsCloseBtn.addEventListener("click", () => els.settingsDialog.close());

els.settingsBtn.addEventListener("click", () => {
  const s = getSettings();
  els.apiUrl.value = s.apiUrl || "";
  els.apiSecret.value = s.apiSecret || "";
  els.settingsDialog.showModal();
});
els.settingsForm.addEventListener("submit", async e => {
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
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  const jpeg = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl: jpeg, base64: jpeg.split(",")[1] };
}
function fileToDataURL(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve,reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function buildFilename(item) {
  const safe = s => String(s).replace(/[\\/:*?"<>|]/g, "_").slice(0,60);
  return `${safe(item.memberName)}_${safe(item.seriesName)}_${safe(item.type)}${item.type2 ? "_" + safe(item.type2) : ""}_${Date.now()}.jpg`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}
let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

applyShareModeUI();
loadRecords();
