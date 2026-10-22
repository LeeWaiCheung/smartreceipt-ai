import { convertToHkd } from "./domain";
import type { Receipt,Snapshot,Transaction } from "./types";

// Manually checked photographs, not AI results. Real dates are preserved.
export function demoSnapshot(_now?:Date): Snapshot {
  const transactions:Transaction[]=[{
    id:"demo-hk-restaurant",user_id:"demo",receipt_id:"demo-hk-restaurant",
    merchant:"食神麗宮（西環）",transaction_date:"2026-01-11",amount:"985.00",currency:"HKD",tax:null,
    category_id:"food",exchange_rate:"1",exchange_rate_date:"2026-01-11",exchange_rate_source:"HKD 本位幣",
    amount_hkd:"985.00",created_at:"2026-01-11T05:00:00Z"
  },{
    id:"demo-us-store",user_id:"demo",receipt_id:"demo-us-store",
    merchant:"99 Cents Only Stores",transaction_date:"2021-08-18",amount:"23.17",currency:"USD",tax:"0.67",
    category_id:"other",exchange_rate:"7.7966",exchange_rate_date:"2021-08-18",
    exchange_rate_source:"Frankfurter v2 · 綜合參考匯率",amount_hkd:convertToHkd("23.17","7.7966"),created_at:"2021-08-18T17:33:00Z"
  }];
  const sources=[{
    url:"https://commons.wikimedia.org/wiki/File:HK_SYP_%E8%A5%BF%E7%92%B0_Sai_Ying_Pun_%E5%BE%B7%E8%BC%94%E9%81%93%E8%A5%BF_308_Des_Voeux_Road_West_%E9%A3%9F%E7%A5%9E%E9%BA%97%E5%AE%AE%E9%85%92%E5%AE%B6_Chinese_Banquet_Seafood_Restaurant_bill_receipt_January_2026_N13P_02.jpg",
    author:"EVOW Sahgyune Paiem KAASEI 02238",license:"CC0 1.0",license_url:"https://creativecommons.org/publicdomain/zero/1.0/"
  },{
    url:"https://commons.wikimedia.org/wiki/File:99_cents_only_store_receipt_2021.jpg",
    author:"Downtowngal",license:"CC BY-SA 4.0",license_url:"https://creativecommons.org/licenses/by-sa/4.0/"
  }];
  const receipts:Receipt[]=transactions.map((tx,i)=>({
    id:tx.receipt_id,user_id:"demo",original_name:i===0?"香港酒樓收據.jpg":"99-cents-only-2021.jpg",
    storage_path:"",page_paths:[],file_hash:"",mime_type:"image/jpeg",file_size:i===0?4196345:694806,
    status:"confirmed",extraction:{merchant:tx.merchant,transaction_date:tx.transaction_date,amount:tx.amount,
      currency:tx.currency,tax:tx.tax,category_id:tx.category_id,warnings:[]},
    model:null,error_message:null,created_at:tx.created_at,
    preview_url:i===0?"/demo/receipts/hk-restaurant-2026.jpg":"/demo/receipts/us-store-2021.jpg",source:sources[i]
  }));
  return {transactions,receipts,budgets:[],recognizedCount:receipts.length,aiAttemptsToday:0,dailyLimit:20};
}
