import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {loadLocalEnv} from './env';
loadLocalEnv();
// Run against a separate configured project: this consumes one admission and three quota reservations.
const base=process.argv[2]||'http://127.0.0.1:3000';
const checks:{name:string;passed:boolean}[]=[];const evidence:Record<string,unknown>={base};
function ok(condition:unknown,name:string):asserts condition {checks.push({name,passed:!!condition});console.log((condition?'PASS: ':'FAIL: ')+name);if(!condition)throw new Error(name);}
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const jar=new Map<string,string>();let guestId:string|null=null;const uploads:string[]=[];
const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:values=>{for(const item of values)jar.set(item.name,item.value);}}});
async function api(path:string,method='GET',data?:unknown,expected=200,origin=base){
 const response=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:Array.from(jar,([k,v])=>k+'='+v).join('; ')},...(data===undefined?{}:{body:JSON.stringify(data)}),redirect:'manual',signal:AbortSignal.timeout(110000)});
 for(const cookie of response.headers.getSetCookie()){const part=cookie.split(';')[0],i=part.indexOf('=');jar.set(part.slice(0,i),part.slice(i+1));}
 const result=await response.json();if(response.status!==expected)console.log('Safe API error:',result.error);
 ok(response.status===expected,method+' '+path+' -> '+expected);return result;
}
async function main(){
let status='failed';
try{
 await api('/api/workspace','GET',undefined,401);
 await api('/api/guest-session','POST',undefined,403,'https://attacker.example');
 await api('/api/guest-session','POST');
 const user=await client.auth.getUser();ok(!user.error&&user.data.user?.app_metadata.smartreceipt_guest===true,'server provisions a verified temporary identity without email or registration');guestId=user.data.user!.id;
 let snap=await api('/api/workspace');ok(snap.receipts.length===0&&snap.transactions.length===0&&snap.trial.limit===3,'new guest has an empty isolated ledger and three attempts');
 await api('/api/guest-session','POST');const reused=await client.auth.getUser();ok(reused.data.user?.id===guestId,'repeated entry reuses the same workspace');
 const original=await readFile('public/demo/receipts/us-store-2021.jpg');const page=await sharp(original).jpeg({quality:88}).toBuffer();
 const metadata={name:'real-us-receipt.jpg',type:'image/jpeg',size:original.length,hash:createHash('sha256').update(original).digest('hex'),pages:1};
 await api('/api/receipts','POST',{...metadata,size:5242881},400);await api('/api/receipts','POST',{...metadata,pages:3},400);
 const registered=await api('/api/receipts','POST',metadata);evidence.receiptId=registered.id;
 ok(registered.bucket==='trial-receipts'&&registered.uploads.length===2,'signed uploads use the isolated capped trial bucket');
 for(const [i,bytes] of [original,page].entries()){const dest=registered.uploads[i];uploads.push(dest.path);const result=await client.storage.from(registered.bucket).uploadToSignedUrl(dest.path,dest.token,bytes,{contentType:'image/jpeg'});ok(!result.error,'upload '+(i?'prepared page':'original photograph'));}
 const parsed=await api('/api/receipts/'+registered.id+'/extract','POST');evidence.extraction=parsed.extraction;
 ok(parsed.extraction.transaction_date==='2021-08-18'&&Number(parsed.extraction.amount)===23.17&&parsed.extraction.currency==='USD','real AI reads date, total and USD from the licensed US photograph');
 snap=await api('/api/workspace');ok(snap.transactions.length===0&&snap.trial.attempts===1,'AI draft does not enter totals before review');
 const fields={merchant:'99 Cents Only Stores',transaction_date:'2021-08-18',amount:'23.17',currency:'USD',tax:'0.67',category_id:'other'};
 await api('/api/transactions','POST',{receipt_id:registered.id,fields});await api('/api/transactions','POST',{receipt_id:registered.id,fields});
 snap=await api('/api/workspace');ok(snap.transactions.length===1&&Number(snap.transactions[0].amount_hkd)===180.65,'review saves exactly one expense with historical HKD conversion');
 const summary=await api('/api/analytics?month=2021-08');ok(Number(summary.total)===180.65,'SQL dashboard reflects the confirmed guest expense');
 const preview=await api('/api/receipts/'+registered.id+'/preview');ok((await fetch(preview.original)).ok,'guest can preview their own original');
 const duplicate=await api('/api/receipts','POST',metadata);ok(duplicate.duplicate===true&&duplicate.receipt.id===registered.id,'duplicate file does not create another receipt');
 for(let i=0;i<2;i++){const meta={...metadata,hash:createHash('sha256').update(randomUUID()).digest('hex')};const r=await api('/api/receipts','POST',meta);const run=await client.rpc('reserve_ai_run',{p_receipt_id:r.id});ok(!run.error,'reserve a bounded fixture attempt, without a model call');await admin.rpc('complete_ai_run',{p_user_id:guestId,p_receipt_id:r.id,p_run_id:run.data,p_extraction:null,p_model:'quota-fixture-not-ai',p_elapsed_ms:0,p_input_tokens:0,p_output_tokens:0,p_error:'TEST_FAILED'});}
 const last=await api('/api/workspace');ok(last.trial.attempts===3,'failed fixture attempts count toward the lifetime quota');
 const failed=last.receipts.find((r:any)=>r.status==='failed');const fourth=await client.rpc('reserve_ai_run',{p_receipt_id:failed.id});ok(fourth.error?.message.includes('TRIAL_LIMIT'),'fourth attempt is rejected in SQL before any model call');
 await api('/api/receipts','POST',{...metadata,hash:'f'.repeat(64)},429);
 await admin.from('guest_sessions').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('user_id',guestId);
 await api('/api/workspace','GET',undefined,401);const hidden=await client.from('receipts').select('id');ok(!hidden.error&&hidden.data?.length===0,'expired guest sees no receipts through direct RLS reads');
 const denied=await client.storage.from('trial-receipts').download(uploads[0]);ok(!!denied.error,'expired guest cannot directly read trial Storage');
 status='passed';
}finally{
 if(guestId){const verified=await admin.auth.admin.getUserById(guestId);if(verified.data.user?.app_metadata.smartreceipt_guest===true){const rows=await admin.from('receipts').select('storage_path,page_paths').eq('user_id',guestId);const paths=(rows.data||[]).flatMap(r=>[r.storage_path,...r.page_paths]);if(paths.length)await admin.storage.from('trial-receipts').remove(paths);await admin.auth.admin.deleteUser(guestId);}}
 await writeFile('reports/private/guest-flow-'+(base.includes('127.0.0.1')?'local':'production')+'.json',JSON.stringify({status,checkedAt:new Date().toISOString(),checks,evidence},null,2));
}

}
main().catch(()=>{console.error("Guest flow failed; inspect the named check and private report.");process.exitCode=1;});
