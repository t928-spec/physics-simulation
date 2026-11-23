# 光學實驗室班級邀請

教師在私人 Google 試算表使用 Apps Script 寄出專屬邀請。Supabase Auth 驗證連結並保存密碼。學生啟用後以學校 Email 和實驗室密碼登入，班級依已驗證的 Email 和教師名單綁定。已啟用的學生收到登入通知，便能用原帳號進入新班級。

## 部署

1. 確認專案沒有同名的資料表及 RPC，依序執行 `optics/supabase-setup.sql` 和 `supabase/optics-invitations.sql`。共用專案保留原有公開註冊設定。學生開啟已驗證信箱的邀請後，才建立光學測驗的名單身分。舊版班級已存在的成員會保留。
2. 從 Supabase 管理介面建立已確認的教師帳號，或選用該教師既有且已確認的 Auth 帳號。在 SQL Editor 以其 Auth 使用者 ID、Email 與姓名建立對應的 `public.profiles`，並設 `is_teacher` 為 `true`。
3. 在 `optics/supabase-config.js` 填專案 URL 與 publishable key（或舊版 anon key），發布前端。Edge Function 部署 `supabase/functions/optics-invite`，設定 `OPTICS_SITE_URL` 為完整 HTTPS 光學實驗室網址（結尾為 `/optics/`），`OPTICS_SCHOOL_DOMAINS` 為學校信箱網域，若有多個用逗號分隔。將同一 HTTPS 網址加到 Supabase Auth 的 Site URL 和允許的重新導向網址。管理金鑰僅由 Edge Function 使用。
4. 在教師專用試算表中開啟「擴充功能 → Apps Script」，貼上 `supabase/optics-invite-mail.gs`。在 Apps Script 的「專案設定 → 指令碼屬性」新增 `OPTICS_SUPABASE_URL` 和 `OPTICS_SUPABASE_PUBLISHABLE_KEY`。填入與網頁相同的公開設定。
5. 重新開啟試算表，從「光學實驗室」選單建立名單工作表。填班級代碼、學號、姓名、學校信箱。班級代碼可在網站教師班級卡片點「複製班級代碼」取得。點「寄送班級邀請」，自行登入實驗室教師帳號並授權 Google 寄信。

寄送狀態記錄 Google 接受寄送或失敗。成功的列會跳過；要重寄時可清空該列的狀態。每次最多處理 30 筆，剩餘名單可再執行。啟用連結由系統寄給個別學生，試算表不存密碼、管理金鑰或連結。

## 試跑

先用虛擬名單和自己能收信的測試信箱驗證。教師建立班級並寄出邀請後，學生以獨立瀏覽器設定檔打開信件，設定密碼並確認出現正確班級。登出後，再用學校 Email 和新密碼登入，完成作答、交卷和教師批改。用另一個沒有列在名單的帳號試班級代碼，確認它無法加入。
