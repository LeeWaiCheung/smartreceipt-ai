import { beforeAll,beforeEach,afterAll,describe,it,expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
let db:PGlite;
async function admin(){await db.exec("reset role");}
async function asUser(id:string){await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");}
async function guest(network="a".repeat(64)) {
  await admin();
  const session=(await db.query<{id:string}>("select (public.reserve_guest_session($1)).id",[network])).rows[0].id;
  const id=randomUUID();
  await db.query("insert into auth.users(id,raw_app_meta_data) values($1,$2)",[id,JSON.stringify({smartreceipt_guest:true,smartreceipt_guest_session:session})]);
  await db.query("update public.guest_sessions set user_id=$1 where id=$2",[id,session]);return {id,session};
}
async function receipt(user:string,hash=randomUUID().replaceAll("-","").padEnd(64,"0"),pages=1,size=100) {
  await admin();
  return (await db.query<{id:string}>("select (public.register_guest_receipt($1,$2,'test.jpg',$3,'image/jpeg',$4,$5)).id",[user,randomUUID(),hash,size,pages])).rows[0].id;
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage; create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,storage,public to authenticated,service_role; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant select on storage.objects to authenticated;");
  for(const file of ["202610210001_initial.sql","202610230001_guest_trial.sql"])await db.exec(await readFile("supabase/migrations/"+file,"utf8"));
},60_000);
beforeEach(async()=>{await admin();await db.exec("truncate auth.users cascade; truncate public.guest_sessions,public.guest_daily_usage,public.guest_network_usage; truncate storage.objects;");});
afterAll(async()=>{await db?.close();});
describe("guest trial database boundaries",()=>{
  it("reserves a daily global admission cap and does not reset it after deleting users",async()=>{
    for(let i=0;i<5;i++){const g=await guest(String(i).repeat(64));await db.query("delete from auth.users where id=$1",[g.id]);}
    await expect(guest("f".repeat(64))).rejects.toThrow(/TRIAL_ADMISSION_LIMIT/);
    expect((await db.query<{admissions:number}>("select admissions from public.guest_daily_usage")).rows[0].admissions).toBe(5);
  });
  it("bounds network admissions without consuming global slots on rejected reservations",async()=>{
    await guest();await guest();await expect(guest()).rejects.toThrow(/TRIAL_NETWORK_LIMIT/);
    expect((await db.query<{admissions:number}>("select admissions from public.guest_daily_usage")).rows[0].admissions).toBe(2);
  });
  it("denies direct admission and receipt RPC calls from browser identities",async()=>{
    const g=await guest();await asUser(g.id);
    await expect(db.query("select public.reserve_guest_session($1)",["b".repeat(64)])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.register_guest_receipt($1,$2,'x.jpg',$3,'image/jpeg',1,1)",[g.id,randomUUID(),"0".repeat(64)])).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.guest_daily_usage")).rejects.toThrow(/permission denied/);
  });
  it("registers exact owner paths idempotently and caps uploads at three even before scanning",async()=>{
    const g=await guest(),hash="1".repeat(64),first=await receipt(g.id,hash);
    expect(await receipt(g.id,hash)).toBe(first);await receipt(g.id);await receipt(g.id);
    await expect(receipt(g.id)).rejects.toThrow(/TRIAL_FILES_LIMIT/);
    const row=(await db.query<{storage_path:string,page_paths:string[]}>("select storage_path,page_paths from public.receipts where id=$1",[first])).rows[0];
    expect(row.storage_path).toBe(g.id+"/"+first+"/original.jpg");expect(row.page_paths).toEqual([g.id+"/"+first+"/page-01.jpg"]);
  });
  it("enforces page and byte limits in SQL and the trial Storage bucket",async()=>{
    const g=await guest();await expect(receipt(g.id,undefined,3)).rejects.toThrow(/TRIAL_FILE_SIZE/);
    await expect(receipt(g.id,undefined,1,5242881)).rejects.toThrow(/TRIAL_FILE_SIZE/);
    const row=(await db.query<{public:boolean,file_size_limit:number}>("select public,file_size_limit from storage.buckets where id='trial-receipts'")).rows[0];
    expect(row.public).toBe(false);expect(Number(row.file_size_limit)).toBe(5242880);
  });
  it("counts failed attempts for a guest's lifetime, with an independent global daily budget",async()=>{
    const g=await guest();
    for(let i=0;i<3;i++) {
      const id=await receipt(g.id);await asUser(g.id);const run=(await db.query<{id:string}>("select public.reserve_ai_run($1) as id",[id])).rows[0].id;
      await admin();await db.query("select public.complete_ai_run($1,$2,$3,null,'test',1,0,0,'TEST_FAILED')",[g.id,id,run]);
    }
    const id=(await db.query<{id:string}>("select id from public.receipts where user_id=$1 limit 1",[g.id])).rows[0].id;
    await db.query("update public.ai_runs set created_at=now()-interval '2 days' where user_id=$1",[g.id]);
    await asUser(g.id);await expect(db.query("select public.reserve_ai_run($1)",[id])).rejects.toThrow(/TRIAL_LIMIT/);
    await admin();await db.query("delete from auth.users where id=$1",[g.id]);
    expect((await db.query<{ai_attempts:number}>("select ai_attempts from public.guest_daily_usage")).rows[0].ai_attempts).toBe(3);
  });
  it("allows the twentieth global attempt, rejects the next, and leaves private users unaffected",async()=>{
    const a=await guest(),b=await guest("b".repeat(64)),ra=await receipt(a.id),rb=await receipt(b.id);
    await db.exec("update public.guest_daily_usage set ai_attempts=19");
    await asUser(a.id);await db.query("select public.reserve_ai_run($1)",[ra]);
    await asUser(b.id);await expect(db.query("select public.reserve_ai_run($1)",[rb])).rejects.toThrow(/TRIAL_GLOBAL_LIMIT/);
    await admin();const owner=randomUUID(),r=randomUUID();await db.query("insert into auth.users(id) values($1)",[owner]);
    await db.query("insert into public.receipts(id,user_id,original_name,storage_path,page_paths,file_hash,mime_type,file_size) values($1,$2,'o.jpg',$3,$4,$5,'image/jpeg',100)",[r,owner,owner+'/o/original.jpg',[owner+'/o/page-01.jpg'],'f'.repeat(64)]);
    await asUser(owner);await expect(db.query("select public.reserve_ai_run($1)",[r])).resolves.toBeDefined();
  });
  it("isolates two guests and removes DB and Storage read access on expiry",async()=>{
    const a=await guest(),b=await guest("b".repeat(64));await receipt(a.id);await receipt(b.id);
    await db.query("insert into storage.objects(bucket_id,name) values('trial-receipts',$1),('trial-receipts',$2)",[a.id+'/r/original.jpg',b.id+'/r/original.jpg']);
    await asUser(a.id);expect((await db.query("select * from public.receipts")).rows).toHaveLength(1);expect((await db.query("select * from storage.objects")).rows).toHaveLength(1);
    await admin();await db.query("update public.guest_sessions set expires_at=now()-interval '1 second' where id=$1",[a.session]);
    await expect(receipt(a.id)).rejects.toThrow(/TRIAL_EXPIRED/);await asUser(a.id);
    expect((await db.query("select * from public.receipts")).rows).toHaveLength(0);expect((await db.query("select * from storage.objects")).rows).toHaveLength(0);
  });
});
