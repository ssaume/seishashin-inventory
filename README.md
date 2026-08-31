# 生寫真收藏庫 — V3

V3 在 V2.1 基礎上新增 CSV 匯出 / 覆蓋匯入 / 自動備份。

## 新功能

- **下載 CSV**：每次從 Google Drive 後端重新讀取資料後下載。
- 若後端是空的，下載 `生寫真匯入模板.csv`。
- **上傳 CSV**：只能使用本系統模板欄位；匯入後會**覆蓋**目前後端資料。
- 覆蓋前，Apps Script 會先將原資料另存成 CSV 到：

```text
生寫真網站資料/
├─ images/
├─ backups/
│  └─ 生寫真資料備份_YYYYMMDD_HHMMSS.csv
└─ 生寫真庫存資料 (Google Sheet)
```

- 圖片檔在 CSV 覆蓋時**不會被刪除**。匯出檔會保留 `圖片File ID` 與 `圖片URL`，因此舊資料備份仍能指回原圖片。

## CSV 欄位

```text
ID,建立時間,更新時間,生寫真系列,成員名,類型1,類型2,數量,狀態,單價,圖片File ID,圖片URL
```

### 手動建立新資料時

必填：
- 生寫真系列
- 成員名
- 類型1：全身 / 半身 / 大頭 / 坐姿
- 數量：1 以上整數
- 狀態：非賣 / 可換 / 可賣 / 求

可留白：
- ID（後端自動產生）
- 建立時間（後端自動產生）
- 更新時間（後端自動更新）
- 類型2
- 單價（空白視為 0）
- 圖片File ID
- 圖片URL

> CSV 建議用 Excel 的 **CSV UTF-8** 格式儲存。

## 從 V2.1 升級

1. GitHub Pages 覆蓋 `index.html`、`styles.css`、`app.js`。
2. Apps Script 用新的 `backend/Code.gs` 覆蓋舊版本。
3. 不需要執行資料遷移，V2 資料表格式沒有改變。
4. Apps Script：`Deploy → Manage deployments → Edit → New version → Deploy`。
5. 保持原本 `/exec` URL 與 `APP_SECRET` 即可。

第一次執行 CSV 覆蓋時，`backups` 資料夾會自動建立。
