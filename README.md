# 生寫真收藏庫 V5

本版新增：

1. 管理畫面每張卡可直接修改狀態：非賣 / 可換 / 可賣 / 求
2. 生寫真系列、成員名、類型2都會提供既有字串建議
3. 新增預約交換 / 預約購買維護
4. 在庫數量與可用數量分離
5. 分享畫面同步顯示預約狀態與是否仍有可用庫存
6. CSV 新增「預約交換」「預約購買」欄位，備份也會包含這兩欄

## 數量邏輯

- 在庫數量：實際持有張數
- 預約交換：已被預約交換的張數
- 預約購買：已被預約購買的張數
- 可用數量 = 在庫數量 - 預約交換 - 預約購買

系統不允許：
- 預約總數 > 在庫數量
- 將在庫數量減到低於已預約總數

## 從 V4 升級

1. GitHub Pages 更新：
   - index.html
   - styles.css
   - app.js
2. Apps Script 用 V5 `backend/Code.gs` 覆蓋
3. 儲存後建議執行一次 `migrateToV5()`
4. Deploy → Manage deployments → Edit → New version → Deploy

V5 的 `getSheet_()` 也會自動補上 V5 新欄位標題，因此即使忘了先執行 migrateToV5，後端仍會嘗試相容 V4 資料；但正式升級仍建議執行一次 migration。

## CSV 模板欄位

ID, 建立時間, 更新時間, 生寫真系列, 成員名, 類型1, 類型2, 數量, 狀態, 單價, 圖片File ID, 圖片URL, 預約交換, 預約購買

「預約交換」「預約購買」可留空，匯入時會視為 0。


## V5.1 修正：舊版資料表自動升級

V5.1 不再要求既有 `photos` 工作表的欄位順序與 V5 完全一致。

支援辨識：
- V1：`photoName` + `sellable`
- V2/V3/V4：`seriesName` + `tradeStatus`
- 過渡格式：`seriesName` + `sellable`

升級時會：
1. 先把目前資料表完整備份成 CSV 到 `生寫真網站資料/backups`
2. 依欄位名稱而不是欄位位置讀取舊資料
3. 自動轉換 `photoName -> seriesName`
4. 自動轉換 `sellable -> tradeStatus`
5. 自動新增 `reservedExchange = 0`
6. 自動新增 `reservedPurchase = 0`
7. 若寫入新格式失敗，會立即把原工作表內容還原

### 升級步驟

1. 用 V5.1 的 `backend/Code.gs` 覆蓋 Apps Script
2. 儲存
3. 手動執行一次 `migrateToV5()`
4. 確認執行成功
5. Deploy → Manage deployments → Edit → New version → Deploy
6. 回網站重新整理

正常情況下，原本的圖片、ID、數量、系列、成員、狀態、單價都會保留。


## V5.2 小更新

管理端已新增「類型1」直接修改功能。

每張已新增的生寫真卡片可以在管理模式直接切換：
- 全身
- 半身
- 大頭
- 坐姿

修改後會即時寫回 Google Sheet。

分享檢視模式仍為唯讀，只顯示更新後的類型1，不提供修改功能。

### 升級方式

前端更新：
- index.html
- app.js

後端更新：
- backend/Code.gs

資料表 schema 沒有改，不需要執行 migration。
重新發布 Apps Script 新版本即可。


## V5.3 — 修正庫存更新錯誤與讀取速度優化

### 修正
V5.2 的部分更新函式仍呼叫已淘汰的 `ensureV5Headers_()`，會造成：
`更新失敗：ensureV5Headers_ is not defined`

V5.3 已移除所有殘留呼叫。Schema 驗證統一由 V5.1 的 `getSheet_()` / `ensureCompatibleSchema_()` 處理。

### 效能
- Apps Script `list` 使用短期 Script Cache（120 秒）。
- 新增、刪除、修改數量、類型1、狀態、預約、CSV 覆蓋時立即清除後端 cache。
- 管理端會保存最近一次成功讀取資料。
- 重新整理時先顯示最近資料，再背景同步 Google Sheet。
- 暫時連不到 Apps Script 時，優先顯示最近資料，不直接跳 Demo。

### 升級
資料表欄位沒有改，不需要 migration。

更新：
- `app.js`
- `backend/Code.gs`

完整 ZIP 也包含其他檔案。

Apps Script 更新後必須重新發布：
Deploy → Manage deployments → Edit → New version → Deploy
