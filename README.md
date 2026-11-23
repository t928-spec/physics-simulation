# 物理互動模擬實驗室

適合課堂投影與學生自主操作的靜態網頁模擬。直接開啟 `index.html`，即可從首頁進入各個主題。

## 模擬內容

- [BJT：小電流控制大電流](./BJT.html)
- [雙狹縫干涉：旋轉狹縫與屏幕](./double-slit-interference.html)
- [雙狹縫：兩道光為什麼近似平行？](./double-slit-parallel-rays.html)
- [橢圓軌道力學能：兩種半徑](./elliptical-orbit-energy.html)
- [雙繩交界的繩波：反射、透射與能量守恆](./string-wave-boundary.html)
- [雙繩交界繩波的公式推導](./string-wave-derivation.html)
- [分子自由度：把運動拆開看](./molecular-degrees-of-freedom.html)
- [聲音偵探：從頻譜推論振動系統](./air-column-spectrum.html)
- [光學實驗室](./optics/)：折射率的測定、薄透鏡成像、光的干涉與繞射。支援散布圖、趨勢線、預習考和教師批改。

## GitHub Pages

這個專案不需要建置步驟。上傳到 GitHub 後，在儲存庫的 `Settings > Pages` 將部署來源設為 `Deploy from a branch`，再選擇預設分支的根目錄 `/ (root)` 即可。

## 光學實驗室

另有 [Supabase 測驗與 Google 試算表寄送班級邀請](./supabase/README-optics-invitations.md) 的部署方式。這條路線使用 Email 和實驗室專用密碼。

光學練習頁可用 GitHub Pages。若在本機試用，請用 Node.js 24 執行 `node optics/server.mjs`，再開啟 [光學實驗室](http://localhost:3000/optics/)。

登入、收卷與批改使用同一個 Node 服務和 SQLite。正式使用時透過 HTTPS 反向代理部署，並讓 `OPTICS_DB` 指向有持久儲存與備份的路徑。正式部署使用 OAuth 的 Web 應用程式憑證，並在 Google Cloud Console 登記完整的回呼網址 `https://你的平台網址/optics/auth/callback`。

| 環境變數 | 用途 |
|---|---|
| `OPTICS_ORIGIN` | 公開 HTTPS 來源，包含通訊協定與主機 |
| `OPTICS_TEACHERS` | 可建立班級的教師 Google 電子郵件，使用逗號分隔 |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | Google OAuth 網頁用憑證，設定於服務端 |
| `OPTICS_DB` | SQLite 檔案路徑，預設為專案根目錄的 `optics-data.sqlite` |
| `PORT`、`OPTICS_HOST` | 服務監聽設定，預設為 `127.0.0.1:3000` |

教師登入後建立班級，可填入學校的 Workspace 網域；需要時也可核准個別 Google 帳號。將班級加入連結與測驗連結貼到 Classroom。學生交卷後，從教師的測驗頁進入「檢視與批改」，儲存或發布成績。

### 啟用公開測驗

本儲存庫提供 [Render Blueprint](./render.yaml)，會啟動 Node.js 24 網頁服務，並將 SQLite 放在持久磁碟的 `/var/data/optics-data.sqlite`。Blueprint 使用付費網頁服務及磁碟。學校已有主機時，也可以依上表設定環境變數、啟動相同的 Node 服務並由 HTTPS 反向代理對外。

1. 在 Render 匯入此 GitHub 儲存庫的 Blueprint，指定 `OPTICS_TEACHERS` 為可建立班級的教師 Google 帳號。確認方案後建立服務。服務就緒後，記下實際的 HTTPS 網址。Render 預設用服務的公開網址作為 OAuth 來源。若使用自訂網域，將 `OPTICS_ORIGIN` 設為該網域的 HTTPS 來源。
2. 在 Google Cloud 設定 OAuth 同意畫面，建立「網頁應用程式」用戶端。把實際測驗服務網址加上 `/optics/auth/callback` 登記為授權重新導向 URI。若 OAuth 設為測試，先把教師與試作學生加入測試使用者。學校管理的帳號如顯示存取遭封鎖，請由校方 Workspace 管理員核准該應用程式。
3. 在主機的環境變數中填入 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 並讓服務重新部署。憑證由主機保管，請勿貼到聊天室、GitHub 或網頁檔案。
4. 在測驗主機的 `/optics/` 用教師帳號登入，建立測試班級與測驗。用另一個獲准的 Google 帳號加入、儲存草稿並交卷。教師確認能看到作答、給分並發布，學生能讀到已公布的結果後，再將正式連結貼到 Classroom。

本機 OAuth 試跑使用相同環境變數，授權重新導向 URI 填 `http://localhost:3000/optics/auth/callback`，再執行 `node optics/server.mjs`。本機網址只用來在這台電腦測試。
