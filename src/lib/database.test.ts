import { beforeAll,beforeEach,afterAll,describe,it,expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DashboardSummary } from "./types";
const USER_A="00000000-0000-4000-8000-000000000001",USER_B="00000000-0000-4000-8000-000000000002",USER_C="00000000-0000-4000-8000-000000000003";
const RECEIPT_A="10000000-0000-4000-8000-000000000001",RECEIPT_B="10000000-0000-4000-8000-000000000002";
let db:PGlite;
async function asUser(id:string) {await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");}
async function admin() {await db.exec("reset role");}
async function addReceipt(id:string,user:string,status="needs_review") {
  await admin();
  await db.query("insert into public.receipts(id,user_id,original_name,storage_path,page_paths,file_hash,mime_type,file_size,status,extraction) values($1,$2,'test.jpg',$3,$4,$5,'image/jpeg',100,$6,$7)",[
    id,user,user+"/"+id+"/original.jpg",[user+"/"+id+"/page-01.jpg"],id.replaceAll("-","").padEnd(64,"0"),status,JSON.stringify({merchant:"Test",amount:"10.00"})
  ]);
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,storage,public to authenticated,service_role; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant select on storage.objects to authenticated;");
  await db.exec(await readFile(path.join(process.cwd(),"supabase/migrations/202610210001_initial.sql"),"utf8"));
  await db.query("insert into auth.users values($1),($2),($3)",[USER_A,USER_B,USER_C]);
  await addReceipt(RECEIPT_A,USER_A);await addReceipt(RECEIPT_B,USER_B);
},60_000);
beforeEach(admin);
afterAll(async()=>{await db?.close();});
describe("PostgreSQL ownership, quota and transaction invariants",()=>{
  it("isolates records at the database layer",async()=>{await asUser(USER_A);const result=await db.query<{id:string}>("select id from public.receipts");expect(result.rows.map(row=>row.id)).toEqual([RECEIPT_A]);expect((await db.query("select id from public.receipts where id=$1",[RECEIPT_B])).rows).toHaveLength(0);});
  it("denies direct writes and category changes from a browser account",async()=>{await asUser(USER_A);await expect(db.query("update public.categories set name='tampered' where id='food'")).rejects.toThrow();await expect(db.query("update public.receipts set status='confirmed' where id=$1",[RECEIPT_A])).rejects.toThrow();});
  it("prevents ordinary users from finalizing raw AI results",async()=>{await asUser(USER_A);await expect(db.query("select public.complete_ai_run($1,$2,$3,null,'fake',0,0,0,null)",[USER_A,RECEIPT_A,RECEIPT_A])).rejects.toThrow(/permission denied/);});
  it("does not reserve another account's receipt",async()=>{await asUser(USER_A);await expect(db.query("select public.reserve_ai_run($1)",[RECEIPT_B])).rejects.toThrow(/RECEIPT_NOT_FOUND/);});
  it("confirms idempotently and maintains exact conversion",async()=>{
    const fields={merchant:"Verified Store",transaction_date:"2026-10-01",amount:"10.00",currency:"USD",tax:null,category_id:"office",exchange_rate:"7.8",exchange_rate_date:"2026-10-01",exchange_rate_source:"test",amount_hkd:"78.00"};
    await db.query("select * from public.confirm_transaction($1,$2,$3)",[USER_A,RECEIPT_A,JSON.stringify(fields)]);
    await db.query("select * from public.confirm_transaction($1,$2,$3)",[USER_A,RECEIPT_A,JSON.stringify({...fields,amount:"20",amount_hkd:"156"})]);
    const result=await db.query<{amount_hkd:string}>("select amount_hkd from public.transactions where receipt_id=$1",[RECEIPT_A]);
    expect(result.rows).toHaveLength(1);expect(Number(result.rows[0].amount_hkd)).toBe(156);
    await expect(db.query("update public.transactions set amount_hkd=156.01 where receipt_id=$1",[RECEIPT_A])).rejects.toThrow(/check constraint/);
  });
  it("aggregates monthly totals, categories and six calendar months under caller RLS",async()=>{
    await asUser(USER_A);
    const summary=(await db.query<{summary:DashboardSummary}>("select public.dashboard_summary('2026-10-01') as summary")).rows[0].summary;
    expect(Number(summary.total)).toBe(156);expect(Number(summary.previous_total)).toBe(0);
    expect(Number(summary.categories.find(c=>c.id==="office")!.amount_hkd)).toBe(156);
    expect(summary.trends.map(t=>t.month)).toEqual(["2026-05","2026-06","2026-07","2026-08","2026-09","2026-10"]);
    expect(summary.trends.slice(0,5).every(t=>Number(t.amount_hkd)===0)).toBe(true);
    await asUser(USER_B);
    const empty=(await db.query<{summary:DashboardSummary}>("select public.dashboard_summary('2026-10-01') as summary")).rows[0].summary;
    expect(Number(empty.total)).toBe(0);
  });
  it("keeps the original receipt when a transaction is removed",async()=>{await db.query("select public.remove_transaction($1,id) from public.transactions where receipt_id=$2",[USER_A,RECEIPT_A]);const result=await db.query<{status:string}>("select status from public.receipts where id=$1",[RECEIPT_A]);expect(result.rows[0].status).toBe("needs_review");});
  it("enforces atomic per-day reservations and processing locks",async()=>{
    await db.exec("update public.app_config set daily_ai_limit=2");
    const ids=["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002","20000000-0000-4000-8000-000000000003"];
    for(const id of ids)await addReceipt(id,USER_C,"uploaded");
    await asUser(USER_C);
    await db.query("select public.reserve_ai_run($1)",[ids[0]]);
    await expect(db.query("select public.reserve_ai_run($1)",[ids[0]])).rejects.toThrow(/ALREADY_PROCESSING/);
    await db.query("select public.reserve_ai_run($1)",[ids[1]]);
    await expect(db.query("select public.reserve_ai_run($1)",[ids[2]])).rejects.toThrow(/DAILY_LIMIT/);
    await admin();
    expect(Number((await db.query<{count:string}>("select count(*) from public.ai_runs where user_id=$1",[USER_C])).rows[0].count)).toBe(2);
  });
  it("restricts storage paths to the owner",async()=>{await db.query("insert into storage.objects(bucket_id,name) values('receipts',$1),('receipts',$2)",[USER_A+"/a/original.jpg",USER_B+"/b/original.jpg"]);await asUser(USER_A);const result=await db.query<{name:string}>("select name from storage.objects");expect(result.rows.map(row=>row.name)).toEqual([USER_A+"/a/original.jpg"]);});
});
