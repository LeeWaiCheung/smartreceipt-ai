import { readFile,mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { extractReceipt } from "../src/lib/ai-core";
import { loadLocalEnv } from "./env";
loadLocalEnv();
const manifestSchema=z.object({cases:z.array(z.object({
  id:z.string(),group:z.enum(["clear","uncertain"]),provenance:z.enum(["self-created","authorized"]),
  pages:z.array(z.string()).min(1).max(10),
  expected:z.record(z.string(),z.union([z.string(),z.null()])),note:z.string().optional()
})).min(1)});
function equal(field:string,a:unknown,b:unknown) {
  if(a===null||b===null)return a===b;
  if(field==="amount"||field==="tax") {try{return new Decimal(String(a)).eq(String(b));}catch{return false;}}
  return String(a).trim()===String(b).trim();
}
async function main() {
  if(!process.env.DEEPSEEK_API_KEY) {
    console.log("NOT RUN: DEEPSEEK_API_KEY is missing. No API calls or accuracy claims were made.");
    process.exitCode=2;return;
  }
  const manifestFile=path.resolve(process.argv[2]||"fixtures/generated/manifest.json");
  const manifestBytes=await readFile(manifestFile),manifest=manifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  const results:Record<string,unknown>[]=[];
  console.log(`Evaluating ${manifest.cases.length} cases with the configured DeepSeek account. This uses API credit.`);
  for(const sample of manifest.cases) {
    const images: string[]=[],inputHashes:string[]=[];
    for(const page of sample.pages) {
      const extension=path.extname(page).toLowerCase();
      if(![".png",".jpg",".jpeg"].includes(extension))throw new Error("Evaluation pages must be PNG or JPEG; render PDFs to pages first.");
      const bytes=await readFile(path.resolve(path.dirname(manifestFile),page));
      if(bytes.length>2*1024*1024)throw new Error("Evaluation images must be <= 2 MB, matching the application.");
      inputHashes.push(createHash("sha256").update(bytes).digest("hex"));
      images.push(`data:${extension===".png"?"image/png":"image/jpeg"};base64,${bytes.toString("base64")}`);
    }
    try {
      const result=await extractReceipt(images);
      const matches=Object.fromEntries(Object.entries(sample.expected).map(([field,expected])=>[field,equal(field,result.extraction[field as keyof typeof result.extraction],expected)]));
      results.push({id:sample.id,group:sample.group,provenance:sample.provenance,inputHashes,...result,expected:sample.expected,matches,manualCorrection:null});
      console.log(`${sample.id}: ${Object.values(matches).every(Boolean)?"MATCH":"REVIEW"} (${result.elapsedMs} ms)`);
    } catch(error) {
      const message=error instanceof Error?error.message:"AI_PROCESSING_ERROR";
      results.push({id:sample.id,group:sample.group,provenance:sample.provenance,inputHashes,error:/^[A-Z_]+$/.test(message)?message:"AI_PROCESSING_ERROR",expected:sample.expected,matches:{},manualCorrection:null});
      console.log(`${sample.id}: FAILED (kept in denominator)`);
      if(message==="AI_CREDENTIAL_ERROR")break;
    }
    // Persist each completed case so an interrupted run still retains failures and usage.
    if(results.length!==manifest.cases.length)await save();
  }
  await save();
  if(results.length!==manifest.cases.length)process.exitCode=1;
  async function save() {
    const clear=manifest.cases.filter(c=>c.group==="clear");
    const accuracy=Object.fromEntries(["transaction_date","amount","currency"].map(field=>{
      const correct=results.filter(r=>r.group==="clear"&&(r.matches as Record<string,boolean>)?.[field]===true).length;
      return [field,{correct,total:clear.length,ratio:clear.length?correct/clear.length:null}];
    }));
    const complete=results.length===manifest.cases.length;
    const passed=complete&&clear.length>=20&&Object.values(accuracy).every(a=>a.ratio!==null&&a.ratio>=.95);
    const report={createdAt:new Date().toISOString(),status:complete?"completed":"partial",model:process.env.DEEPSEEK_MODEL||"deepseek-flash",manifestHash:createHash("sha256").update(manifestBytes).digest("hex"),
      scope:"Only this labelled test set; synthetic cases do not establish real-world accuracy.",accuracy,clearCaseTargetPassed:passed,
      inputTokens:results.reduce((n,r)=>n+Number(r.inputTokens||0),0),outputTokens:results.reduce((n,r)=>n+Number(r.outputTokens||0),0),
      cost:"Token counts retained. Actual billed cost must be read from the provider account; no price is assumed.",results};
    await mkdir("reports/private",{recursive:true});
    await writeFile("reports/private/ai-evaluation.json",JSON.stringify(report,null,2)+"\n");
    if(complete)console.log("Report: reports/private/ai-evaluation.json; A05 target "+(passed?"passed for this set":"not passed"));
    if(complete&&!passed)process.exitCode=1;
  }
}
main().catch(()=>{console.error("Evaluation could not finish. Check local credentials, manifest and network. Private values were not printed.");process.exitCode=1;});
