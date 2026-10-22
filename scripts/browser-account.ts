import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir,readFile,writeFile,unlink } from "node:fs/promises";
import { loadLocalEnv } from "./env";
loadLocalEnv();
const file="reports/private/browser-account.json";
async function main() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Missing configuration");
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  if(process.argv.includes("--cleanup")) {
    if(!existsSync(file)){console.log("No browser QA account to clean up.");return;}
    const saved=JSON.parse(await readFile(file,"utf8"));
    if(saved.projectUrl!==url)throw new Error("Project mismatch");
    const owner=await admin.auth.admin.getUserById(saved.id);
    if(owner.error||!owner.data.user?.user_metadata.smartreceipt_browser_qa)throw new Error("Refusing to delete a non-QA account");
    const receipts=await admin.from("receipts").select("storage_path,page_paths").eq("user_id",saved.id);
    if(receipts.error)throw new Error("Unable to list QA assets");
    const paths=[...new Set((receipts.data||[]).flatMap(r=>[r.storage_path,...r.page_paths]))] as string[];
    if(paths.some(p=>!p.startsWith(saved.id+"/")))throw new Error("QA path ownership mismatch");
    if(paths.length&&(await admin.storage.from("receipts").remove(paths)).error)throw new Error("Unable to remove QA assets");
    if((await admin.auth.admin.deleteUser(saved.id)).error)throw new Error("Unable to remove QA account");
    await unlink(file);console.log("Removed this run's browser QA account and exact Storage assets.");return;
  }
  if(existsSync(file)){console.log("Browser QA account file already exists; reuse it or clean it up first.");return;}
  const email="smartreceipt-browser-qa-"+randomUUID()+"@example.com",password=randomUUID()+"Aa9!";
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{smartreceipt_browser_qa:true}});
  if(result.error||!result.data.user)throw new Error("Unable to create browser QA account");
  await mkdir("reports/private",{recursive:true});
  await writeFile(file,JSON.stringify({id:result.data.user.id,email,password,projectUrl:url},null,2),{mode:0o600});
  console.log("Disposable browser QA account prepared in ignored local file. No credentials printed.");
}
main().catch(()=>{console.error("Browser QA account setup/cleanup could not complete. Check private local configuration.");process.exitCode=1;});
