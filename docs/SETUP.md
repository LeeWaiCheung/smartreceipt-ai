# 接入及上線指南

目前部署已完成：[SmartReceipt AI](https://smartreceipt-ai-lime.vercel.app)。Vercel 專案 smartreceipt-ai，Supabase 專案 yambnasdkrgmmjvkkgdk（Tokyo），兩份 migration、九張表及私人 receipts／trial-receipts buckets 已初始化。本人已確認電郵並登入。以下步驟供日後重建或交接，**不要在現有專案重跑初始 migration**。

Supabase Site URL 已設為正式網址；允許正式與 http://127.0.0.1:3000 的 /auth/confirm 回跳。本機只開發時啟動，正式網址獨立運作。

目前未設定自訂 SMTP。Supabase 預設郵件服務只寄給組織／專案成員，並有每小時 2 封限制；因此採邀請制。面試官可按「免註冊試用 AI」使用有限次數的真實辨識，不需要自己的帳號。若日後開放任意註冊，先配置 SMTP、核對寄信網域及供應商費用，再驗證完整註冊流程；不要關閉電郵確認來繞過此限制。

這份指南從目前的本機成品開始。帳戶登入、建立密碼及電郵驗證由本人完成；不要在聊天或 GitHub 貼密鑰。

## 1. 建立 Supabase 專案

1. 打開 https://supabase.com/dashboard ，用 GitHub 或電郵建立帳戶並完成驗證。
2. 如需建立 organization，選 Free 計劃，名稱可填個人開發工作區。
3. 建立新專案，名稱填 `smartreceipt-ai`，選 Free 組織及靠近香港的可用區域。
4. 自行設定並保存資料庫密碼，等候專案準備完成。應用以專案 API key 連線，毋須把資料庫密碼交給應用。
5. 在專案的 Connect / Project Settings / API Keys 取得專案網址、publishable key 及伺服器 secret key。新版 secret key 或舊版 service_role key 均可用。

控制台可能調整選單名稱，應以當前畫面的 Project URL 與 API Keys 為準。

## 2. 初始化資料庫

打開專案 SQL Editor，建立一個新查詢。貼入完整的 `supabase/migrations/202610210001_initial.sql` 並執行一次。此檔只應套用於本項目的新空白專案；會建立資料表、預設分類、RPC、RLS 及私人 `receipts` bucket。

成功後應見到 `categories`、`app_config`、`receipts`、`transactions`、`budgets`、`ai_runs` 六張表，以及私人 Storage bucket。腳本本身沒有刪除既有表的指令，但不是可反覆執行的 reset 腳本。部分成功或失敗時先查看錯誤，不要直接刪庫重來。

再套用新增的 `supabase/migrations/202610230001_guest_trial.sql` 一次，建立臨時帳簿、全站額度及試用 bucket。現有安裝只需這一份新增 migration，切勿重跑 initial。

## 3. 接通本機應用

1. 啟動應用，打開 http://127.0.0.1:3000/setup 。
2. 填入 Supabase URL、publishable key、server secret，以及現有的 DeepSeek key。
3. 儲存後重新整理登入頁；如果設定未更新，重啟開發服務。
4. Supabase 的 Authentication → URL Configuration：本機 Site URL 設為 `http://127.0.0.1:3000`，Redirect URLs 加入 `http://127.0.0.1:3000/auth/confirm`。
5. 從應用註冊自己的測試帳號，依控制台設定完成電郵確認，再登入私人工作區。

不要混用 `localhost` 與 `127.0.0.1` 的網址；登入 cookie 與確認回跳應使用一致的網域。

若自訂 Supabase 確認電郵模板，可採用官方 token hash 方式：

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=signup">確認電郵</a>
```

應用同時支援 PKCE `code` 與 `token_hash` 回跳。確認失敗可回登入頁重試；尚未實作忘記密碼／重設密碼介面。

## 4. 真實接入驗收

先執行 `npm.cmd run test:integration`。這項使用管理 key 建立兩個帶 `smartreceipt_qa` 標記的臨時用戶，且不寄出測試郵件。只清理本次建立的用戶 ID 及檔案路徑；若中斷或清理失敗，檢查報告後手動清理這些 QA 資料。

再從瀏覽器完成：

1. 上傳 `fixtures/generated/receipt-01.png`，確認實際 DeepSeek 辨識結果。
2. 對照原圖，修改金額，確認入帳；重新整理後核對看板與明細。
3. 上傳 JPG 及 `two-page-receipt.pdf`；PDF 應產生一份 HKD 100.00 的待覆核記錄。
4. 批量上傳三份不同文件，觀察各自狀態；對失敗文件單獨重試。
5. 再上傳完全相同原檔，確認提示重複且沒有新增交易。
6. 編輯、刪除交易及設定預算，核對重登後仍保留；篩選後匯出 CSV。

完成後執行 `npm.cmd run evaluate:ai`。這會對標註集實際呼叫 API，不走應用的每日額度；只應由開發者明確執行。自製票據的結果不能推論成真實香港收據準確率。報告需保留不正確與失敗案例，不能刪去失敗樣本來達到 95%。

## 5. 部署 Vercel

1. 在 https://vercel.com/signup 建立自己的帳戶，選擇適合個人非商業作品的 Hobby 計劃；以當前條款與限制為準。
2. 在專案目錄執行 `npx vercel@latest login`，依提示在瀏覽器完成本人登入。
3. 執行 `npx vercel@latest link`，連結或建立 `smartreceipt-ai` 專案，框架選 Next.js，專案根目錄選目前資料夾。
4. 在該 Vercel 專案的 Environment Variables 設定 `.env.example` 所列的實際服務值，至少包含 Supabase URL / publishable key / server secret、DeepSeek key，以及自行產生的隨機 CRON_SECRET。vercel.json 每天執行一次到期試用清理，請勿省略 secret。伺服器 secret 不能加 `NEXT_PUBLIC_`。
5. 執行 `npx vercel@latest --prod`。取得部署回傳的真實正式網址，再把 Supabase Site URL 改成該網址，Redirect URLs 加入該網址的 `/auth/confirm`。本機 redirect 可保留作開發。
6. 修改環境變數後重新部署。Next.js 的公開設定在建置時寫入前端，單改控制台不會更新既有 bundle。

正式網站的 `/` 是公開示範，`/workspace` 需要有效的私人或訪客臨時身份；`/setup` 與 `/api/local-setup` 均應返回 404。毋須購買網域。部署前確認服務配額、AI 餘額及函式最長執行時間足以容納 75 秒的模型 timeout；不要為了完成部署自行升級付費計劃。

## 6. 上線後最後一輪

在另一個瀏覽器開啟正式 HTTPS 網址，從註冊／登入到上傳、辨識、覆核、入帳、修改、預算、圖表與匯出完整走一次。再使用兩個帳號驗證私人資料隔離。更新 `docs/ACCEPTANCE.md`，附實際網址與日期；只有此時才可把「已上線」寫進 CV。

## 服務參考

- [DeepSeek Vision](https://api-docs.deepseek.com/guides/vision/)
- [Supabase Next.js SSR Auth](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase Storage 私人 bucket](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Vercel CLI 部署](https://vercel.com/docs/cli/deploy)
- [Frankfurter v2](https://frankfurter.dev/)


## 重跑正式 API 驗收

現有驗收報告已保留，無需反覆消耗 AI。需要回歸檢查時，在本資料夾依序執行：

```powershell
npx.cmd tsx scripts/browser-account.ts
npx.cmd tsx scripts/production-flow.ts
npx.cmd tsx scripts/browser-account.ts --cleanup
```

第一步建立有明確 QA metadata 的臨時帳號，憑證僅存 reports/private/browser-account.json。第二步會使用真實 API 額度並產生 CNY 測試收據／預算；同一 QA 身份不能盲目重跑相同 hash，應先檢查失敗報告再清理。最後一步只清理該 QA ID、其所有權已核對的 Storage 路徑及本機 QA 憑證；拒絕處理沒有測試標記的帳號。真正用戶帳號不受影響。

公開路由檢查可獨立執行：
`npm.cmd run test:public -- https://smartreceipt-ai-lime.vercel.app`。

## 日後更新

修改後先跑 `npm.cmd run verify`，再在此目錄執行 `npx.cmd vercel@65.0.0 deploy --prod`。既有 .vercel 連結指向本人的專案；正式 alias 不變。先看清結果再判定成功，不能只憑部署已送出。若更換服務密鑰，更新本機 .env.local 與 Vercel Production 環境變數，重新部署並做一次辨識核對。

## 訪客試用驗收

按 [GUEST_TRIAL.md](GUEST_TRIAL.md) 核對額度、隔離及清理。`npm run test:guest-live -- http://127.0.0.1:3000` 會實際使用一個新帳簿名額和三次額度預留（一次真實模型、兩次失敗 fixture），結束後只刪除自身測試帳號及檔案，額度不退回。建議在獨立的 Supabase 測試專案執行。
