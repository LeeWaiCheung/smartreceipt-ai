import { createServerClient } from "@supabase/ssr";
import { readFile,mkdir,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import Decimal from "decimal.js";
import { loadLocalEnv } from "./env";
import { convertToHkd,sumHkd } from "../src/lib/domain";
import { transactionsCsv } from "../src/lib/csv";
import type { Snapshot,Extraction,Transaction,DashboardSummary } from "../src/lib/types";
loadLocalEnv();
const base=(process.argv[2]||"https://smartreceipt-ai-lime.vercel.app").replace(/\/$/,"");
const checks:{name:string;passed:boolean}[]=[];
const evidence:Record<string,unknown>={base,input:"self-created receipt-03.png",scope:"Authenticated production HTTP APIs and real Storage/DeepSeek. Browser UI is checked separately."};
function assert(condition:unknown,name:string):asserts condition {
  checks.push({name,passed:!!condition});
  if(!condition)throw new Error(name);
  console.log("PASS: "+name);
}
async function main() {
  const credentials=JSON.parse(await readFile("reports/private/browser-account.json","utf8"));
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  if(credentials.projectUrl!==url)throw new Error("QA project mismatch");
  let jar=new Map<string,string>();
  function client() {
    return createServerClient(url,key,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:updates=>{
      for(const cookie of updates)if(cookie.value)jar.set(cookie.name,cookie.value);else jar.delete(cookie.name);
    }}});
  }
  let auth=client();
  async function api<T>(route:string,method="GET",payload?:unknown,expected=200,origin=base):Promise<T> {
    const response=await fetch(base+route,{method,headers:{"Content-Type":"application/json",Origin:origin,Cookie:Array.from(jar,([n,v])=>n+"="+v).join("; ")},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(110000),redirect:"manual"});
    assert(response.status===expected,`${method} ${route} returns ${expected}`);
    return await response.json() as T;
  }
  let status="failed";
  try {
    const signedIn=await auth.auth.signInWithPassword({email:credentials.email,password:credentials.password});
    assert(!signedIn.error&&signedIn.data.user?.id===credentials.id,"sign in with isolated QA identity");
    const before=await api<Snapshot>("/api/workspace");
    const original=await readFile("fixtures/generated/receipt-03.png");
    const page=await sharp(original).jpeg({quality:88}).toBuffer();
    const registered=await api<{id:string;duplicate:boolean;uploads:{path:string;token:string}[]}>("/api/receipts","POST",{
      name:"production-qa-cny.png",size:original.length,type:"image/png",pages:1,hash:createHash("sha256").update(original).digest("hex")
    });
    assert(!registered.duplicate&&registered.uploads?.length===2,"register a new original plus prepared page");
    evidence.receiptId=registered.id;
    for(const [i,bytes] of [original,page].entries()) {
      const upload=registered.uploads[i];
      const result=await auth.storage.from("receipts").uploadToSignedUrl(upload.path,upload.token,bytes,{contentType:i===0?"image/png":"image/jpeg"});
      assert(!result.error,i===0?"upload original to private Storage":"upload prepared JPEG with path-scoped token");
    }
    const parsed=await api<{extraction:Extraction}>(`/api/receipts/${registered.id}/extract`,"POST");
    assert(parsed.extraction.currency==="CNY"&&new Decimal(parsed.extraction.amount!).eq("69.96")&&parsed.extraction.transaction_date==="2026-09-03","production DeepSeek returns expected date, total and currency");
    evidence.extraction=parsed.extraction;
    const draft=await api<Snapshot>("/api/workspace");
    assert(draft.transactions.length===before.transactions.length&&draft.receipts.some(r=>r.id===registered.id&&r.status==="needs_review"),"unreviewed receipt stays outside ledger totals");
    const fields={...parsed.extraction,merchant:parsed.extraction.merchant!,amount:"100.00",tax:parsed.extraction.tax,currency:"CNY",transaction_date:"2026-09-03"};
    await api("/api/transactions","POST",{receipt_id:registered.id,fields:{...fields,amount:"-1"}},400);
    const first=await api<{transaction:Transaction}>("/api/transactions","POST",{receipt_id:registered.id,fields});
    assert(first.transaction.receipt_id===registered.id,"confirm one persisted transaction");
    const updated=await api<{transaction:Transaction}>("/api/transactions","POST",{receipt_id:registered.id,fields:{...fields,amount:"120.00"}});
    assert(String(updated.transaction.exchange_rate)===String(first.transaction.exchange_rate),"editing preserves the historical exchange rate");
    assert(new Decimal(updated.transaction.amount_hkd).eq(convertToHkd("120.00",String(first.transaction.exchange_rate))),"server computes exact HKD result after 100 to 120 edit");
    await api("/api/transactions","POST",{receipt_id:registered.id,fields:{...fields,amount:"120.00"}});
    await api("/api/budgets","POST",{month:"2026-09",amount_hkd:"1000.00"});
    jar=new Map();auth=client();
    const relogin=await auth.auth.signInWithPassword({email:credentials.email,password:credentials.password});
    assert(!relogin.error,"fresh login after saving");
    const persisted=await api<Snapshot>("/api/workspace");
    const own=persisted.transactions.filter(t=>t.receipt_id===registered.id);
    assert(own.length===1&&new Decimal(own[0].amount).eq(120),"fresh session sees exactly one transaction with amount 120");
    assert(persisted.budgets.some(b=>b.month==="2026-09"&&new Decimal(b.amount_hkd).eq(1000)),"budget persists across sessions");
    const summary=await api<DashboardSummary>("/api/analytics?month=2026-09");
    const rows=persisted.transactions.filter(t=>t.transaction_date.startsWith("2026-09"));
    assert(new Decimal(summary.total).eq(sumHkd(rows)),"production SQL total matches the persisted ledger");
    assert(summary.trends.length===6&&summary.categories.reduce((n,c)=>n.plus(c.amount_hkd),new Decimal(0)).eq(summary.total),"six calendar months and category totals agree");
    const preview=await api<{original:string;pages:string[]}>(`/api/receipts/${registered.id}/preview`);
    const image=await fetch(preview.original);
    assert(image.ok&&(await image.arrayBuffer()).byteLength===original.length,"private original is accessible using the short-lived preview URL");
    await api("/api/budgets","POST",{month:"2026-09",amount_hkd:"1"},403,"https://attacker.example");
    await mkdir("reports/private",{recursive:true});
    await writeFile("reports/private/production-flow.csv",transactionsCsv(rows));
    evidence.transaction=own[0];evidence.summary=summary;
    await api(`/api/transactions/${own[0].id}`,"DELETE");
    const removed=await api<Snapshot>("/api/workspace");
    assert(!removed.transactions.some(t=>t.id===own[0].id)&&removed.receipts.some(r=>r.id===registered.id&&r.status==="needs_review"),"deleting transaction preserves the receipt for review");
    await auth.auth.signOut({scope:"local"});jar.clear();
    await api("/api/workspace","GET",undefined,401);
    status="passed";
  } finally {
    await mkdir("reports/private",{recursive:true});
    await writeFile("reports/private/production-flow.json",JSON.stringify({checkedAt:new Date().toISOString(),status,checks,evidence},null,2)+"\n");
  }
}
main().catch(()=>{console.error("Production flow did not pass; see the last named check and private report. No credentials were printed.");process.exitCode=1;});
