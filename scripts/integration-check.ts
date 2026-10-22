import { createClient,type SupabaseClient } from "@supabase/supabase-js";
import { createHash,randomUUID } from "node:crypto";
import { mkdir,writeFile } from "node:fs/promises";
import { loadLocalEnv } from "./env";
loadLocalEnv();
const checks:{name:string;passed:boolean}[]=[];
function assert(condition:unknown,name:string):asserts condition {
  checks.push({name,passed:!!condition});
  if(!condition)throw new Error(name);
  console.log("PASS: "+name);
}
async function main() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||!secret) {
    console.log("NOT RUN: Supabase URL, publishable key and server secret are required. Local PostgreSQL tests are separate.");
    process.exitCode=2;return;
  }
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,secret,options),anon=createClient(url,key,options);
  const createdUsers:string[]=[],storagePaths:string[]=[];
  let status="failed";
  try {
    async function testUser() {
      const email="smartreceipt-qa-"+randomUUID()+"@example.com",password=randomUUID()+"Aa9!";
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{smartreceipt_qa:true}});
      assert(!created.error&&created.data.user,"create disposable confirmed QA account without sending email");
      createdUsers.push(created.data.user.id);
      const client=createClient(url!,key!,options);
      const login=await client.auth.signInWithPassword({email,password});
      assert(!login.error&&login.data.session,"sign in through Supabase Auth");
      return {id:created.data.user.id,client};
    }
    const a=await testUser(),b=await testUser();
    async function receipt(user:string,label:string) {
      const id=randomUUID(),file=`${user}/${id}/original.png`;
      const inserted=await admin.from("receipts").insert({id,user_id:user,original_name:"qa.png",storage_path:file,page_paths:[file],file_hash:createHash("sha256").update(id).digest("hex"),mime_type:"image/png",file_size:68,status:"uploaded"});
      assert(!inserted.error,"create isolated "+label+" test receipt");
      return {id,file};
    }
    const ra=await receipt(a.id,"A"),rb=await receipt(b.id,"B");
    const visible=await a.client.from("receipts").select("id").in("id",[ra.id,rb.id]);
    assert(!visible.error&&visible.data?.length===1&&visible.data[0].id===ra.id,"receipt reads enforce ownership through PostgREST/RLS");
    const anonymous=await anon.from("receipts").select("id").eq("id",ra.id);
    assert(!!anonymous.error||anonymous.data?.length===0,"anonymous caller cannot read private receipts");
    const spoof=await a.client.from("receipts").update({status:"confirmed"}).eq("id",ra.id);
    assert(!!spoof.error,"browser account cannot bypass server confirmation with direct write");
    const reserveForeign=await b.client.rpc("reserve_ai_run",{p_receipt_id:ra.id});
    assert(!!reserveForeign.error,"cannot reserve another account's receipt");
    const reserve=await a.client.rpc("reserve_ai_run",{p_receipt_id:ra.id});
    assert(!reserve.error&&typeof reserve.data==="string","owner can reserve an AI run atomically");
    const busy=await a.client.rpc("reserve_ai_run",{p_receipt_id:ra.id});
    assert(!!busy.error&&busy.error.message.includes("ALREADY_PROCESSING"),"processing lease prevents simultaneous extraction");
    const completion={p_user_id:a.id,p_receipt_id:ra.id,p_run_id:reserve.data,p_extraction:{merchant:"QA Store",transaction_date:"2026-09-20",amount:"10.00",currency:"USD",tax:null,category_id:"office",warnings:[]},p_model:"integration-fixture-not-ai",p_elapsed_ms:0,p_input_tokens:0,p_output_tokens:0,p_error:null};
    const fake=await a.client.rpc("complete_ai_run",completion);
    assert(!!fake.error,"browser cannot forge a completed AI run");
    const done=await admin.rpc("complete_ai_run",completion);
    assert(!done.error&&done.data===true,"service finalizes the reserved run (fixture, no model call)");
    const fields={merchant:"QA Store",transaction_date:"2026-09-20",amount:"10.00",currency:"USD",tax:null,category_id:"office",exchange_rate:"7.8",exchange_rate_date:"2026-09-20",exchange_rate_source:"integration test fixture",amount_hkd:"78.00"};
    const confirmed=await admin.rpc("confirm_transaction",{p_user_id:a.id,p_receipt_id:ra.id,p_data:fields});
    assert(!confirmed.error,"confirm transaction through service RPC");
    const again=await admin.rpc("confirm_transaction",{p_user_id:a.id,p_receipt_id:ra.id,p_data:{...fields,amount:"20.00",amount_hkd:"156.00"}});
    assert(!again.error,"repeated confirmation updates the same receipt");
    const transactions=await a.client.from("transactions").select("id,amount_hkd").eq("receipt_id",ra.id);
    assert(!transactions.error&&transactions.data?.length===1&&Number(transactions.data[0].amount_hkd)===156,"one persisted transaction with correct decimal amount");
    const foreignTx=await b.client.from("transactions").select("id").eq("receipt_id",ra.id);
    assert(!foreignTx.error&&foreignTx.data?.length===0,"another account cannot read the transaction");
    const budgets=await admin.from("budgets").insert({user_id:a.id,month:"2026-09",amount_hkd:10000});
    assert(!budgets.error,"persist test budget");
    const privateBudget=await b.client.from("budgets").select("user_id").eq("user_id",a.id);
    assert(!privateBudget.error&&privateBudget.data?.length===0,"budgets enforce account isolation");
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=","base64");
    const signed=await admin.storage.from("receipts").createSignedUploadUrl(ra.file);
    assert(!signed.error&&signed.data,"generate exact-path signed upload URL");
    storagePaths.push(ra.file);
    const upload=await a.client.storage.from("receipts").uploadToSignedUrl(ra.file,signed.data.token,png,{contentType:"image/png"});
    assert(!upload.error,"upload synthetic PNG via signed Storage token");
    const ownImage=await a.client.storage.from("receipts").download(ra.file);
    assert(!ownImage.error&&ownImage.data,"owner can read the private original");
    const otherImage=await b.client.storage.from("receipts").download(ra.file);
    assert(!!otherImage.error,"other account cannot download the private original");
    const anonImage=await anon.storage.from("receipts").download(ra.file);
    assert(!!anonImage.error,"anonymous caller cannot download the private original");
    const removed=await admin.rpc("remove_transaction",{p_user_id:a.id,p_transaction_id:transactions.data![0].id});
    assert(!removed.error&&removed.data===true,"delete ledger entry through owner-scoped RPC");
    const retained=await a.client.from("receipts").select("status").eq("id",ra.id).single();
    assert(!retained.error&&retained.data?.status==="needs_review","deleting transaction preserves original receipt for review");
    status="passed";
  } finally {
    // Only exact paths and user IDs created by this run are eligible for cleanup.
    let cleaned=true;
    if(storagePaths.length)cleaned=!(await admin.storage.from("receipts").remove(storagePaths)).error;
    for(const id of createdUsers)if((await admin.auth.admin.deleteUser(id)).error)cleaned=false;
    await mkdir("reports/private",{recursive:true});
    await writeFile("reports/private/integration.json",JSON.stringify({createdAt:new Date().toISOString(),status,checks,cleaned,note:"Actual Supabase Auth/PostgREST/Storage. No AI request; server completion uses a labelled fixture. Next.js browser flow is a separate check."},null,2)+"\n");
    if(!cleaned){console.log("QA cleanup needs attention; inspect only smartreceipt_qa accounts and this run's assets.");process.exitCode=1;}
  }
  console.log("Supabase integration report: reports/private/integration.json");
}
main().catch(error=>{console.error("Integration did not pass: "+(checks.at(-1)?.passed===false?checks.at(-1)!.name:"check local configuration and network"));process.exitCode=1;});
