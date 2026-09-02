# 生寫真收藏庫 — V4

V4 在 V3 的個人管理功能上新增「唯讀分享連結」。

## V4 新功能

- 管理端新增「🔗 分享檢視」按鈕
- 可建立一組唯讀分享連結
- 分享者不需要 APP_SECRET
- 分享畫面只能：
  - 瀏覽收藏
  - 搜尋
  - 依類型1、類型2、狀態篩選
  - 收合 / 展開系列
- 分享畫面不能：
  - 新增照片
  - 修改數量
  - 刪除資料
  - 上傳 / 下載 CSV
  - 開啟後端設定
- 同一時間只有一組有效 Share Token
- 「重新產生連結」會讓舊網址立即失效
- 「停用分享」會讓目前網址立即失效
- 分享網址會直接讀取目前後端最新資料，因此新增或 CSV 覆蓋後不必重新產生網址

## 分享連結架構

```text
管理者 GitHub Pages
        │
        │ APP_SECRET
        ▼
Google Apps Script
        │
        ├─ rotateShareToken
        ├─ revokeShareToken
        └─ 管理 API

分享者 GitHub Pages
?share=<ShareToken>&api=<AppsScriptURL>
        │
        │ ShareToken（不含 APP_SECRET）
        ▼
Google Apps Script / publicList
        │
        ▼
唯讀後端資料
```

Share Token 儲存在 Apps Script Script Properties：

```text
SHARE_TOKEN
SHARE_CREATED_AT
```

不需要手動建立這兩個欄位，第一次按「產生分享連結」時會自動建立。

## 分享模式後端只回傳

- 生寫真系列
- 成員名
- 類型1
- 類型2
- 數量
- 狀態
- 單價
- 圖片 URL

不會回傳：

- APP_SECRET
- 資料 ID
- 建立時間
- 更新時間
- Google Drive imageFileId

## 使用方式

### 1. 更新 GitHub Pages

用 V4 覆蓋：

```text
index.html
styles.css
app.js
.nojekyll
```

commit / push 後等 GitHub Pages 更新。

### 2. 更新 Apps Script

用：

```text
backend/Code.gs
```

覆蓋現有 Apps Script。

不需要修改 Google Sheet，也不需要重新執行 migration。

重新發布：

```text
Deploy
→ Manage deployments
→ Edit
→ New version
→ Deploy
```

請維持原本的 `/exec` URL。

### 3. 產生分享網址

回到管理網站：

```text
🔗 分享檢視
→ 產生分享連結
→ 複製
```

得到類似：

```text
https://你的帳號.github.io/seishashin-inventory/?share=xxxxxxxx&api=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2F...%2Fexec
```

把這個網址傳給別人即可。

## 分享連結與資料更新

例如你先建立分享網址 A，之後：

- 新增生寫真
- 修改數量
- CSV 批次覆蓋

網址 A 不需要重建。分享者重新整理後就會看到最新後端資料。

只有以下情況才會讓網址 A 失效：

- 管理者按「重新產生連結」
- 管理者按「停用分享」

## V3 功能全部保留

- Google Drive 圖片
- Google Sheet metadata
- CSV 下載
- 無資料時下載模板
- CSV 覆蓋匯入
- 覆蓋前自動備份
- 匯入錯誤時自動還原
- 生寫真系列分區
- 類型2自由輸入與篩選
- 非賣 / 可換 / 可賣 / 求
