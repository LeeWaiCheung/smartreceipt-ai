import sharp from "sharp";
import { PDFDocument,StandardFonts,rgb } from "pdf-lib";
import { mkdir,writeFile } from "node:fs/promises";
import path from "node:path";

const root=path.resolve("fixtures/generated");
await mkdir(root,{recursive:true});
const merchants=["Harbour Coffee","City Taxi","Paper & Ink","Cloud Studio","Home Internet","Garden Hotel","Corner Bakery","Metro Transit","Desk Supply","Design Toolkit","Electric Utility","Airport Shuttle","Morning Cafe","Island Ferry","Office Books","Workspace Software","Mobile Service","Travel Lodge","Lunch Kitchen","Station Bus"];
const categories=["food","transport","office","software","utilities","travel","food","transport","office","software","utilities","travel","food","transport","office","software","utilities","travel","food","transport"];
const escape=s=>String(s).replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"})[c]);
function receiptSvg({merchant,date,amount,currency,index,missing=false}) {
  const total=Number(amount),tax=(total*0.05).toFixed(2),subtotal=(total-Number(tax)).toFixed(2);
  const lines=["SELF-CREATED TEST RECEIPT",merchant,"RECEIPT #SR-"+index,"--------------------------------",...(missing?[]:["Date: "+date,"Currency: "+currency]),"","Goods / services       "+subtotal,"Tax (included)          "+tax,"--------------------------------","TOTAL "+(missing?"$":currency)+" "+amount,"Cash tendered          "+(total+20).toFixed(2),"Change                  20.00","","Thank you for your visit.","Synthetic fixture - no real purchase"];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100"><rect width="900" height="1100" fill="#faf9f5"/><rect x="40" y="40" width="820" height="1020" rx="5" fill="white" stroke="#dfdfdb"/>${lines.map((line,i)=>`<text x="85" y="${100+i*48}" fill="#20251f" font-size="${i===1?34:27}" font-family="Consolas, monospace" font-weight="${i===1||line.startsWith("TOTAL")?700:400}">${escape(line)}</text>`).join("")}</svg>`;
}
const cases=[];
for(let i=0;i<20;i++) {
  const currency=["HKD","USD","CNY"][i%3],amount=(35.5+i*17.23).toFixed(2),date=`2026-09-${String(i+1).padStart(2,"0")}`;
  const extension=i%2===0?"png":"jpg",file=`receipt-${String(i+1).padStart(2,"0")}.${extension}`;
  const image=sharp(Buffer.from(receiptSvg({merchant:merchants[i],date,amount,currency,index:i+1})));
  await (extension==="png"?image.png():image.jpeg({quality:91})).toFile(path.join(root,file));
  cases.push({id:`clear-${i+1}`,group:"clear",provenance:"self-created",pages:[file],expected:{merchant:merchants[i],transaction_date:date,amount,currency,tax:(Number(amount)*0.05).toFixed(2),category_id:categories[i]}});
}
await sharp(Buffer.from(receiptSvg({merchant:"Unknown Currency Cafe",date:"",amount:"68.00",currency:"",index:21,missing:true}))).png().toFile(path.join(root,"missing-fields.png"));
cases.push({id:"missing-fields",group:"uncertain",provenance:"self-created",pages:["missing-fields.png"],expected:{merchant:"Unknown Currency Cafe",transaction_date:null,amount:"68.00",currency:null}});
await sharp(path.join(root,cases[0].pages[0])).resize({width:200}).blur(2.5).resize({width:900}).png().toFile(path.join(root,"blurred.png"));
cases.push({id:"blurred",group:"uncertain",provenance:"self-created",pages:["blurred.png"],expected:{transaction_date:null,amount:null,currency:null},note:"Deliberately unreadable; inspect warnings and any confidently invented values manually."});

const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
for(let i=0;i<2;i++) {
  const page=pdf.addPage([420,595]);
  const lines=i===0?["SELF-CREATED TEST RECEIPT","Harbour Office Supply","Date: 2026-09-20","Currency: HKD","Page 1 / 2","Paper: HKD 60.00","Pens: HKD 40.00","Final total appears on page 2."]:["SELF-CREATED TEST RECEIPT","Harbour Office Supply","Date: 2026-09-20","Currency: HKD","Page 2 / 2","Paper + Pens: HKD 100.00","Tax included: HKD 0.00","TOTAL HKD 100.00","This is one receipt across two pages."];
  lines.forEach((line,n)=>page.drawText(line,{x:35,y:550-n*40,size:n===1?21:13,font:n===1?bold:font,color:rgb(.12,.17,.15)}));
  page.drawText("Synthetic fixture - no real purchase",{x:35,y:60,size:10,font,color:rgb(.5,.5,.5)});
}
await writeFile(path.join(root,"two-page-receipt.pdf"),await pdf.save());
await writeFile(path.join(root,"invalid.png"),"Intentionally invalid PNG for batch-isolation testing.\n");
await writeFile(path.join(root,"manifest.json"),JSON.stringify({description:"20 clear self-created receipts and two uncertainty cases. Not real-world accuracy evidence until an actual evaluation is run.",cases},null,2)+"\n");
await writeFile(path.join(root,"README.md"),"# 自製測試收據\n\n20 份清晰圖片（JPG/PNG）、1 份缺日期與幣種圖片、1 份模糊圖片，以及 1 份兩頁 PDF。全部為人工生成的虛構交易，沒有真實個人資料。manifest.json 的 expected 是標註答案，不是 AI 輸出。\n\nPDF 應只產生一筆 HKD 100.00 的記錄。AI 準確率需實際呼叫後才可報告，這套排版不能代表香港手寫或模糊真實小票。\n");
console.log("Generated 20 clear images, 2 uncertainty cases, manifest and a two-page PDF in fixtures/generated.");
