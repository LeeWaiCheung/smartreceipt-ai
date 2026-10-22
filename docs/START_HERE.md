# 先從這裏開始

## 你的網站已可使用

- 給面試官看的公開示範：https://smartreceipt-ai-lime.vercel.app
- 你自己的私人帳簿：https://smartreceipt-ai-lime.vercel.app/workspace
- 登入頁：https://smartreceipt-ai-lime.vercel.app/auth

使用剛才在 SmartReceipt 設定的電郵與密碼登入。這與 Vercel／Supabase 後台帳號是不同的登入系統。本人註冊、電郵確認及登入已核對成功；不用保持電腦或本機開發服務開着，正式網站仍獨立運作。

## 中文／English

網站右上角的 English／繁體中文按鈕可切換介面；覆核視窗底部與預算視窗內也有切換按鈕。網站會記住選擇，切換時保留目前的表單、篩選及憑證縮放。收據原圖、商家名稱及 AI 提示保留原文；提示會標示「原文」。CSV 使用當前語言的欄名、分類與已知匯率來源說明，金額及日期不變。

## 第一次試用

1. 進私人工作區，按「上傳收據」。
2. 先選 fixtures/generated/receipt-01.png 這份自製測試票據，等候辨識。
3. 對照原圖，核對商家、日期、金額與幣種，再確認入帳。
4. 測試文件日期為 2026 年 9 月；在看板選 2026-09 才會看到對應支出。
5. 去交易明細修改一筆資料、按條件篩選，再匯出 CSV。

可再試 receipt-02.jpg（USD）與 two-page-receipt.pdf。所有測試文件均非真實交易；正式使用前先核對自己的資料。AI 分類與模糊字可能讀錯，人工確認也不保證零錯誤。每天每帳號預設 20 次辨識，失敗亦計次。

## 展示專案

公開範例使用有授權來源的真實照片。面試官可按「免註冊試用 AI」建立 24 小時獨立帳簿，選檔／拍照或直接辨識香港範例，每個試用工作區 3 次辨識（失敗及重試亦計次）。資料流與設計取捨見 [架構說明](ARCHITECTURE.md)，已完成的測試及未覆蓋範圍見 [驗收報告](ACCEPTANCE.md)。

GitHub 儲存庫已按要求刪除，現有原始碼與實際修改紀錄保存在本機。待本輪修改完成後再重新發佈；目前 CV 先使用網站網址。預定 GitHub 地址為 https://github.com/LeeWaiCheung/smartreceipt-ai 。Git 保存本機版本，GitHub 保存可供面試官閱讀的遠端副本；之後修改仍在目前的專案資料夾進行，不需要重新下載 ZIP。整個 reports、.env.local、.vercel 及依賴／建置產物已排除版本控制。

## 現有限制

私人註冊採邀請制：預設郵件服務只寄給 Supabase 專案／組織成員。訪客可看真實照片範例並免註冊試用有限次數 AI；全面開放註冊需再配置郵件服務。沒有付款訂閱、銀行對帳、忘記密碼、自助刪除原檔或法定報稅功能。詳見 [驗收報告](ACCEPTANCE.md) 及 [設計與限制](ARCHITECTURE.md)。

## 帳戶與費用

Vercel、Supabase 使用已建立的免費方案；未購買網域或升級付費。真實 AI 辨識使用你的 DeepSeek 額度，實際花費以供應商帳單為準。

密鑰不要貼在聊天、CV 或 GitHub。若曾貼出，建議在供應商後台換新，再更新本機 .env.local 及 Vercel Production 設定並重新部署。由你本人處理新密鑰，操作方法見 [接入指南](SETUP.md)。
