# 生寫真收藏庫 — V2

## 本次變更

1. 前端主色改為天藍色。
2. 移除「可售張數」與「可售總額」統計。
3. 生寫真狀態改為四種：
   - 非賣
   - 可換
   - 可賣
   - 求
4. 「生寫真名」改為「生寫真系列」。
5. 「我的收藏」依生寫真系列分區顯示，各系列可收合。
6. 新增「類型2」：
   - 非必填
   - 自由輸入
   - 曾輸入過的值會自動成為 datalist 建議值
   - 首頁「類型2」篩選器會根據現有資料自動產生分類

## V2 資料結構

| 欄位 | 說明 |
|---|---|
| id | UUID |
| createdAt | 建立時間 |
| updatedAt | 修改時間 |
| seriesName | 生寫真系列 |
| memberName | 成員名 |
| type | 類型1：全身 / 半身 / 大頭 / 坐姿 |
| type2 | 類型2，自由輸入，可空白 |
| quantity | 數量 |
| tradeStatus | 非賣 / 可換 / 可賣 / 求 |
| unitPrice | 單價 |
| imageFileId | Drive 圖片 ID |
| imageUrl | 顯示縮圖 URL |

## 首頁統計

只保留：

- 總張數
- 不同款式
- 生寫真系列數

不再計算：

- 可售張數
- 可售總額

## 我的收藏分區

第一層固定依 `seriesName` 分區：

```text
18th 制服生寫真
├─ 松尾桜 / 全身
├─ 松尾桜 / 半身 / ヨリ
└─ 大田美月 / 大頭

五期生 LIVE
├─ 大野愛実 / 大頭 / 特典
└─ 松尾桜 / 坐姿
```

每一個系列區塊可以點擊標題收合。

## 類型2

類型1仍固定為：

- 全身
- 半身
- 大頭
- 坐姿

類型2則可以自由輸入，例如：

- ヨリ
- チュウ
- ヒキ
- 特典
- 会場限定
- 制服

當資料庫中存在某個類型2，首頁會自動把它加入「全部類型2」旁的篩選選項，因此可直接按照自由輸入的值分類檢視。

---

# 如果已經部署 V1

## Google Apps Script

1. 用 V2 `backend/Code.gs` 覆蓋原本 Code.gs。
2. 儲存。
3. 在函式下拉選單執行：

```text
migrateToV2
```

這會把 V1：

```text
photoName -> seriesName
sellable = TRUE  -> tradeStatus = 可賣
sellable = FALSE -> tradeStatus = 非賣
```

並增加：

```text
type2
tradeStatus
```

原本圖片與紀錄會保留。

接著重新發布：

```text
Deploy
→ Manage deployments
→ Edit
→ Version: New version
→ Deploy
```

既有 `/exec` URL 通常可以繼續使用。

## GitHub Pages

用 V2 覆蓋 repository 根目錄：

```text
index.html
styles.css
app.js
.nojekyll
```

commit / push 後，GitHub Pages 會更新。

---

# 第一次部署

前端仍採：

```text
GitHub Pages
      ↓
Google Apps Script Web App
      ↓
Google Drive images + Google Sheet metadata
```

Apps Script 先執行 `setupStorage()`，並在 Script Properties 設定：

```text
APP_SECRET
```

部署 Web App 後，把 `/exec` URL 與 APP_SECRET 填入網站右上角設定即可。
