# 生寫真收藏庫 — V1 Prototype

這是一個 **GitHub Pages 靜態前端 + Google Apps Script API + Google Drive 儲存** 的單人收藏管理原型。

## V1 已包含

- 手機直接拍照 / 相簿選圖
- 圖片上傳前自動縮圖與 JPEG 壓縮
- 生寫真名
- 成員名
- 類型：全身 / 半身 / 大頭 / 坐姿
- 數量
- 可賣 / 非賣
- 單價
- 收藏總張數、不同款式、可售張數、可售總額
- 名稱 / 成員搜尋
- 類型與販售狀態篩選
- 數量 +1 / -1
- 刪除
- 未設定後端時可用 Demo 模式

## 架構

```text
Browser / Mobile
     |
     | HTTPS
     v
GitHub Pages
(index.html / styles.css / app.js)
     |
     | POST text/plain JSON
     v
Google Apps Script Web App
     |
     +---- Google Drive / 生寫真網站資料 / images
     |
     +---- Google Sheet / 生寫真庫存資料
```

> Google Sheet 本身也是 Google Drive 裡的檔案，這裡把它當 metadata index 使用。
> 圖片本體全部放 Google Drive。

---

# A. 建立 Google Drive 後端

## 1. 建立 Apps Script

1. 前往 https://script.google.com/
2. 建立「新專案」
3. 將 `backend/Code.gs` 全部貼進預設的 `Code.gs`
4. 儲存

## 2. 初始化 Drive / Sheet

在 Apps Script 上方函式選單選 `setupStorage`，按「執行」。

第一次會要求 Google Drive / Spreadsheet 權限，完成授權。

它會自動建立：

```text
我的雲端硬碟
└─ 生寫真網站資料
   ├─ images/
   └─ 生寫真庫存資料（Google Sheet）
```

並把檔案 ID 放進 Apps Script 的 Script Properties。

## 3. 設定 APP_SECRET

不要把 secret 寫進 GitHub。

Apps Script：

**Project Settings → Script Properties → Add script property**

新增：

```text
Property: APP_SECRET
Value:    自己產生一段長的隨機字串
```

建議至少 32 字元。

例如可以由密碼管理器產生，不要使用範例字串。

## 4. 發布 Apps Script Web App

Apps Script 右上：

**Deploy → New deployment → Select type: Web app**

設定：

```text
Execute as: Me
Who has access: Anyone
```

部署後複製結尾為 `/exec` 的 Web App URL。

> 注意：這個 API 雖然是 Anyone 可呼叫，但所有 POST 動作仍需通過 APP_SECRET。
> APP_SECRET 不會存在 GitHub repo；只會在你使用網站時存在瀏覽器 localStorage。

---

# B. GitHub Pages 部署

## 最簡單版本

建立一個 GitHub repository，例如：

```text
seishashin-inventory
```

把以下 3 個檔案放在 repository 根目錄：

```text
index.html
styles.css
app.js
```

`backend/` 與 README 可以一起放，但不是網站執行必要檔案。

然後：

1. GitHub repository → **Settings**
2. 左側 **Pages**
3. Build and deployment → Source 選 **Deploy from a branch**
4. Branch 選 `main`
5. Folder 選 `/(root)`
6. Save

之後 GitHub 會產生 Pages 網址。

---

# C. 第一次打開網站

1. 打開 GitHub Pages 網址
2. 點右上角齒輪
3. 貼上 Apps Script `/exec` URL
4. 輸入 APP_SECRET
5. 「儲存並測試」

連線成功後，網站會切換成 Google Drive 模式。

若沒有設定，會使用 Demo 模式，資料只存在該瀏覽器。

---

# V1 的資料表

| 欄位 | 說明 |
|---|---|
| id | UUID |
| createdAt | 建立時間 |
| updatedAt | 更新時間 |
| photoName | 生寫真名 |
| memberName | 成員名 |
| type | 全身 / 半身 / 大頭 / 坐姿 |
| quantity | 數量 |
| sellable | TRUE / FALSE |
| unitPrice | 單價 |
| imageFileId | Google Drive File ID |
| imageUrl | 前端顯示縮圖 URL |

---

# 重要限制 / V2 建議

## 圖片公開層級

目前 V1 為了讓 GitHub Pages 可以直接載入 Drive 圖片，Apps Script 會嘗試把上傳圖片設成：

**Anyone with the link / Viewer**

也就是「知道圖片連結的人可以看到」。

這適合先做個人收藏 MVP，但若你希望圖片維持完全私人，V2 應改成：

- GitHub Pages 前端
- Google OAuth 登入
- 私有 Apps Script / Google Cloud API
- 由授權 API 代理圖片，不使用公開 Drive thumbnail URL

## API 安全性

目前 APP_SECRET 是「單一使用者存取金鑰」：
- 不放在 GitHub
- 放在 Apps Script Script Properties
- 使用者端只存在 localStorage

如果之後要多人共用，應升級為 Google Login / OAuth，而不是共用 APP_SECRET。

## 建議的 V2 功能

- 編輯完整資料
- 成員主檔 / 團別 / 期別
- 生寫真系列主檔
- 同系列四種 pose 自動分組
- 缺圖提示（全身、半身、大頭、坐姿缺哪張）
- 重複張數 / 可交換數量
- 販售狀態與成交紀錄
- 批次上傳
- CSV 匯入 / 匯出
- PWA 安裝到手機桌面
