import "server-only";
import { createHmac } from "node:crypto";
import { adminClient } from "./supabase/server";
import { hongKongDate } from "./domain";
import { isTrialUser } from "./trial";

export function trialNetworkHash(request:Request):string {
  const secret=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw new Error("TRIAL_NOT_CONFIGURED");
  // Vercel overwrites this platform header. Never trust arbitrary forwarding headers locally.
  const ip=process.env.VERCEL?request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim():"local-development";
  if(!ip)throw new Error("TRIAL_NETWORK_UNAVAILABLE");
  return createHmac("sha256",secret).update("smartreceipt-trial:"+hongKongDate()+":"+ip).digest("hex");
}

export async function deleteTrial(userId:string,sessionId:string):Promise<void> {
  const db=adminClient();
  const {data,error}=await db.auth.admin.getUserById(userId);
  if(error || !data.user || !isTrialUser(data.user) || data.user.app_metadata.smartreceipt_guest_session!==sessionId)throw new Error("TRIAL_IDENTITY_MISMATCH");
  const session=await db.from("guest_sessions").select("id").eq("id",sessionId).eq("user_id",userId).maybeSingle();
  if(session.error || !session.data)throw new Error("TRIAL_SESSION_MISMATCH");
  const {data:receipts,error:lookup}=await db.from("receipts").select("storage_path,page_paths").eq("user_id",userId);
  if(lookup)throw new Error("TRIAL_CLEANUP_LOOKUP_FAILED");
  const paths=(receipts || []).flatMap(row=>[row.storage_path,...row.page_paths] as string[]);
  if(paths.some(path=>!path.startsWith(userId+"/")))throw new Error("TRIAL_PATH_MISMATCH");
  if(paths.length) {
    const removed=await db.storage.from("trial-receipts").remove(paths);
    if(removed.error)throw new Error("TRIAL_CLEANUP_STORAGE_FAILED");
  }
  const removed=await db.auth.admin.deleteUser(userId);
  if(removed.error)throw new Error("TRIAL_CLEANUP_AUTH_FAILED");
}

export async function cleanupTrials():Promise<number> {
  const db=adminClient();
  // Signed upload capabilities last up to two hours. Wait them out before deletion.
  const {data,error}=await db.from("guest_sessions").select("id,user_id").lt("expires_at",new Date(Date.now()-2*3600_000).toISOString()).order("expires_at").limit(20);
  if(error)throw new Error("TRIAL_CLEANUP_UNAVAILABLE");
  let count=0;
  for(const session of data || []) {
    if(session.user_id)await deleteTrial(session.user_id,session.id);
    else {
      const removed=await db.from("guest_sessions").delete().eq("id",session.id).is("user_id",null);
      if(removed.error)throw new Error("TRIAL_CLEANUP_RESERVATION_FAILED");
    }
    count++;
  }
  // Retain only seven days of daily pseudonymous network counters.
  const cutoff=new Date(Date.now()-7*86400_000).toISOString().slice(0,10);
  await db.from("guest_network_usage").delete().lt("day",cutoff);
  await db.from("guest_daily_usage").delete().lt("day",cutoff);
  return count;
}
