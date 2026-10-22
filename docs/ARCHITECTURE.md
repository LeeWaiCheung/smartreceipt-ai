# 系統設計與已知限制

## 一份文件的生命週期

```mermaid
flowchart LR
  A[登入或建立訪客試用並選檔] --> B[驗證大小、計算 SHA-256]
  B --> C[圖片壓縮或 PDF 逐頁轉圖]
  C --> D[伺服器驗證身份並註冊收據]
  D --> E[以限定路徑 token 直接上傳私人 Storage]
  E --> F[資料庫原子預留辨識額度]
  F --> G[短效圖片網址送 DeepSeek]
  G --> H[驗證 JSON、保存草稿與用量]
  H --> I[原圖對照及人工覆核]
  I --> J[伺服器查歷史匯率、十進位折算]
  J --> K[原子入帳或更新同一交易]
  K --> L[SQL 聚合、明細、預算與 CSV]
```

`uploaded → processing → needs_review → confirmed` 是正常路徑。辨識失敗進 `failed`；可以有上限地重試。刪除正式交易後，原檔與提取結果保留，收據回到 `needs_review`。

## 資料表及邊界

| 表 | 責任與限制 |
| --- | --- |
| categories | 七個固定分類；用戶可讀、不可更改全域分類 |
| receipts | 原檔 object path、hash、頁面、狀態及 AI 草稿；同用戶／同 hash 唯一 |
| transactions | 已確認帳目；receipt_id 唯一，以複合外鍵強制收據與交易擁有人一致 |
| budgets | 每用戶、每月份一個正數 HKD 預算 |
| ai_runs | 每次預留呼叫、狀態、模型、耗時、token 用量及安全錯誤碼 |
| app_config | 伺服器讀取的每日辨識上限，預設 20 次 |

用戶與相關表以 `auth.users.id` 關聯。交易、收據、預算及用量的讀取經 RLS 限定 `auth.uid()`。客戶端沒有一般 INSERT / UPDATE / DELETE 權限。伺服器使用 `getUser()` 驗證身份，再帶用戶 ID 執行限定用途的服務 RPC；管理 key 不會出現在客戶端。

## 四項值得解釋的取捨

**草稿與帳目分開。** AI 的結果可能不正確，`receipts.extraction` 保存可覆核的草稿，只有用戶確認才寫入 `transactions`，所以待覆核資料不會混進支出。

**保留十進位及歷史匯率。** API 使用字串表示金額，Decimal.js 在最後一步以 half-up 保留兩位，PostgreSQL numeric 再驗證 `amount_hkd = round(amount * exchange_rate, 2)`。同幣種、同日期的編輯沿用已入帳匯率；換日期或幣種才重查。圖表使用 Number 只是繪圖，交易寫入不使用浮點計算。

**預留額度需要原子操作。** `reserve_ai_run` 在資料庫按用戶取得 advisory transaction lock，再檢查今日呼叫次數與收據狀態，防止平行請求同時通過檢查。每份最多三次嘗試，處理 lease 為三分鐘；失敗也計入額度，避免失敗重試無限制花費。

**大文件直接上傳 Storage。** 伺服器只收 metadata，簽發確定擁有人與路徑的上傳 token，避免 Vercel API body 限制。原檔最多 10 MB，模型輸入每頁 JPEG 最多 2 MB；預覽／辨識才生成短效讀取網址。

## 查詢與前端

`dashboard_summary` 以呼叫者權限執行 `SUM` / `GROUP BY`，回傳當月總額、上月總額、分類及六個曆月；使用 generate_series 補齊零支出月份。數值以 JSON 字串回傳。公開示範使用本機固定資料；私人看板載入 SQL 統計前暫以已載入的資料計算，讀取失敗會提示。

工作區明細目前會分批讀取所有帳目及收據，再在前端篩選、排序和分頁。這讓 CSV 可匯出所有符合條件的記錄，實作容易核對；資料量增大時應改成伺服器分頁、帶相同條件的匯出查詢及索引調優。現有版本不聲稱支援百萬筆帳目。

## 介面語言

LanguageProvider 在客戶端提供繁體中文／English 字典與切換狀態，初次預設繁體中文，載入後套用 localStorage 的 smartreceipt.locale 偏好。語言切換只更新文字，不重新建立帳目、改動業務分類 ID、金額或人工輸入；不新增語言網址或改動登入回跳。HTML lang、頁面標題、月份圖表、日期、狀態、分類及 CSV 欄名同步更新。

收據原文、商家名稱與 AI 警告保留原樣；AI 警告有原文標籤。伺服器安全錯誤在介面轉為當前語言，未知內部訊息使用通用提示。瀏覽器內建日期挑選器與選檔視窗仍依裝置語言。字典集中於 src/lib/i18n.ts。

## AI 接入

DeepSeek 的 Chat Completions JSON mode 加本機 schema 驗證，**不是供應商保證遵守 JSON Schema 的 strict structured outputs**。提示詞要求無法確認的資訊留 null，並把收據內的指令當成文件文字。這不能保證完全阻止 prompt injection 或幻覺，因此保留原圖、欄位驗證及人工覆核。

模型 timeout 為 75 秒。每頁圖片可能產生額外 token；報告保存模型、輸入／輸出 token 及耗時，不把 token 估算冒充帳戶實際扣費。辨識失敗時原檔保留；長時間中斷由 lease 控制重試。

## 已知限制

- 已接通真實 Supabase、DeepSeek 及 Vercel；公開網址及證據見 [驗收報告](ACCEPTANCE.md)。Supabase 預設郵件只寄給組織／專案成員，未設定自訂 SMTP，私人註冊目前採邀請制。
- 自製清晰票據不是真實香港手寫收據測試集。20 份的日期／總額／幣種各 20/20，分類有 3 份與標註不同；模糊案例未達保守留空預期，不能外推為所有收據的準確率。
- 一份文件一張收據；不支援一頁多張收據拆分、逐項商品記帳、信用單／負數退款或多組織協作。
- SHA-256 只防完全相同原檔；重新拍照、壓縮或修改後的重複文件未必能識別。
- 匯率是交易日或之前最近可得的參考值，與銀行實際扣帳可能不同；現階段沒有手動輸入銀行結算金額功能。
- 沒有 durable background job queue；批量由瀏覽器最多兩個 worker 進行。關閉頁面可能中斷尚未開始的文件，已儲存的收據可回收件匣重試。
- 未完成且保留的原檔目前沒有用戶自助刪除入口；移除交易只刪帳目。私人長期帳號尚未實作資料保留到期、自助刪號或備份還原驗證；臨時試用帳簿則有到期與清理機制。
- 公開試用有全站每日辨識及新帳簿限制；私人帳號額度另外計算，未設兩者合計的供應商花費上限。網絡限制不能完全阻止換 IP 的濫用，仍依靠全站原子額度控制試用成本。
- 尚未實作密碼重設、付款訂閱、銀行對帳、複式簿記或法定稅務報告。
- Private bucket 與短效連結保護存取；文件處理仍依賴 Supabase 與 DeepSeek，不應描述成只在使用者電腦運行。

## 測試的邊界

本機 58 項測試檢查日期、十進位、提取異常、CSV、匯率、adapter 及 SQL／權限；其中 adapter 錯誤測試使用模擬回應。另有 27 項真實 Supabase 檢查、14 項正式公開 HTTP 檢查、32 項正式私人 API 流程檢查、22 份真實 AI 評測輸入及瀏覽器驗收。各層責任及未覆蓋的故障／裝置邊界見驗收報告；未做負載測試或備份還原演練。

## 免註冊試用

詳見 [GUEST_TRIAL.md](GUEST_TRIAL.md)。新增 guest_sessions、guest_daily_usage、guest_network_usage 三張表，與原有六張表分開。伺服器預留有限名額後建立暫存 Auth 身份；immutable app_metadata 標記試用身份，沿用相同擁有人 RLS，另在 SQL 檢查有效期限。試用獨立使用私人 trial-receipts bucket，bucket 本身限制 5 MB。額度與上傳名額在 SQL 鎖內預留，不能依靠前端或刪除用戶重置。
