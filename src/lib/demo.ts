import Decimal from "decimal.js";
import { monthKey,previousMonths,hongKongDate,convertToHkd } from "./domain";
import type { CategoryId,Currency,Receipt,Snapshot,Transaction } from "./types";

const merchants: [string,CategoryId,Currency,string][] = [
  ["Blue Bottle Coffee","food","HKD","78.00"],["港鐵 MTR","transport","HKD","46.50"],
  ["Adobe Creative Cloud","software","USD","29.99"],["誠品生活 eslite","office","HKD","268.00"],
  ["WeWork Hong Kong","office","HKD","2680.00"],["太興 Tai Hing","food","HKD","126.00"],
  ["中國移動香港","utilities","HKD","198.00"],["Figma","software","USD","15.00"],
  ["MUJI 無印良品","office","CNY","348.00"],["HK Express","travel","HKD","1680.00"],
  ["% Arabica","food","HKD","96.00"],["Uber","transport","HKD","142.00"],
  ["香港電燈","utilities","HKD","586.40"],["大快活 Fairwood","food","HKD","64.00"],
  ["Logitech 羅技","office","HKD","729.00"],["天星小輪","transport","HKD","10.00"],
  ["八方雲集","food","HKD","72.00"],["Dropbox","software","USD","11.99"]
];
export function demoSnapshot(now = new Date()): Snapshot {
  const current=monthKey(now),months=previousMonths(current),today=hongKongDate(now);
  const transactions:Transaction[]=[];
  months.forEach((month,mi)=>merchants.forEach(([merchant,category,currency,base],i)=>{
    const maxDay=month===current?Number(today.slice(8)):27;
    const date=month+"-"+String(Math.max(1,Math.min(maxDay,26-i))).padStart(2,"0");
    const amount=new Decimal(base).times([0.82,0.89,1.04,0.91,1.12,1][mi]).toFixed(2);
    const rate=currency==="USD"?"7.8":currency==="CNY"?"1.1":"1";
    const id="demo-"+month+"-"+String(i).padStart(2,"0");
    transactions.push({
      id,user_id:"demo",receipt_id:"receipt-"+id,merchant,transaction_date:date,amount,currency,tax:null,
      category_id:category,exchange_rate:rate,exchange_rate_date:date,
      exchange_rate_source:"示範固定匯率 · 非實際報價",amount_hkd:convertToHkd(amount,rate),
      created_at:date+"T05:30:00Z"
    });
  }));
  transactions.sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date));
  const receipts:Receipt[]=transactions.map(tx=>({
    id:tx.receipt_id,user_id:"demo",original_name:tx.merchant.replace(/\s/g,"-")+".jpg",
    storage_path:"",page_paths:[],file_hash:"",mime_type:"image/jpeg",file_size:138240,
    status:"confirmed",extraction:{
      merchant:tx.merchant,transaction_date:tx.transaction_date,amount:tx.amount,currency:tx.currency,
      tax:tx.tax,category_id:tx.category_id,warnings:[]
    },model:null,error_message:null,created_at:tx.created_at,
    preview_url:"/demo/receipt/"+tx.receipt_id
  }));
  const draft:Receipt={
    id:"demo-draft-cafe",user_id:"demo",original_name:"中環咖啡收據.jpg",storage_path:"",page_paths:[],
    file_hash:"",mime_type:"image/jpeg",file_size:154624,status:"needs_review",model:null,
    extraction:{merchant:"NOC Coffee Co.",transaction_date:today,amount:"148.00",currency:"HKD",tax:null,category_id:"food",warnings:["示範覆核畫面；此資料為預先準備，未呼叫 AI。"]},
    error_message:null,created_at:today+"T07:45:00Z",preview_url:"/demo/receipt/demo-draft-cafe"
  };
  receipts.unshift(draft,{
    ...draft,id:"demo-draft-stationery",original_name:"辦公用品收據.pdf",mime_type:"application/pdf",
    extraction:{merchant:"城市文具",transaction_date:today,amount:"236.00",currency:null,tax:null,category_id:"office",warnings:["原圖只印有 $，請確認實際幣種。","此資料為示範，未呼叫 AI。"]},
    preview_url:"/demo/receipt/demo-draft-stationery"
  });
  return {transactions,receipts,budgets:months.map(month=>({month,amount_hkd:"10000.00"})),
    recognizedCount:receipts.length,aiAttemptsToday:0,dailyLimit:20};
}
