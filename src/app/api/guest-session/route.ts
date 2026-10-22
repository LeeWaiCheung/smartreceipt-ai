import { randomBytes } from "node:crypto";
import { ApiError,failure,json,sameOrigin } from "@/lib/api";
import { adminClient,currentUser,userClient } from "@/lib/supabase/server";
import { isTrialUser } from "@/lib/trial";
import { cleanupTrials,trialNetworkHash } from "@/lib/trial-server";
export const maxDuration=60;
export async function POST(request:Request) {
  let createdUserId:string|null=null;
  try {
    sameOrigin(request);
    const existing=await currentUser(),client=await userClient();
    if(!client)throw new ApiError(503,"試用服務暫時無法使用，請稍後再試。");
    if(existing) {
      if(!isTrialUser(existing))return json({url:"/workspace?view=receipts"});
      const active=await client.rpc("workspace_access_active");
      if(active.error)throw new ApiError(503,"試用服務暫時無法使用，請稍後再試。");
      if(active.data)return json({url:"/workspace?view=receipts"});
      await client.auth.signOut();
    }
    await cleanupTrials();
    const db=adminClient();
    const reserved=await db.rpc("reserve_guest_session",{p_ip_hash:trialNetworkHash(request)});
    if(reserved.error || !reserved.data) {
      if(reserved.error?.message.includes("TRIAL_NETWORK_LIMIT"))throw new ApiError(429,"此網絡今日已達試用工作區上限，請明天再試。");
      if(reserved.error?.message.includes("TRIAL_ADMISSION_LIMIT"))throw new ApiError(429,"今日試用工作區已額滿，請明天再試。公開範例仍可查看。");
      throw new ApiError(503,"試用服務暫時無法使用，請稍後再試。");
    }
    const session=reserved.data;
    const email="trial-"+session.id+"@guest.smartreceipt.invalid",password=randomBytes(32).toString("base64url");
    const created=await db.auth.admin.createUser({email,password,email_confirm:true,
      app_metadata:{smartreceipt_guest:true,smartreceipt_guest_session:session.id}});
    if(created.error || !created.data.user)throw new ApiError(503,"試用服務暫時無法使用，請稍後再試。");
    createdUserId=created.data.user.id;
    const activated=await db.from("guest_sessions").update({user_id:createdUserId}).eq("id",session.id).is("user_id",null).select("id").single();
    if(activated.error)throw new Error("TRIAL_ACTIVATION_FAILED");
    const signedIn=await client.auth.signInWithPassword({email,password});
    if(signedIn.error)throw new ApiError(503,"試用服務暫時無法使用，請稍後再試。");
    createdUserId=null;
    return json({url:"/workspace?view=receipts"});
  } catch(error) {
    // This ID comes only from this request's successful createUser call.
    if(createdUserId)await adminClient().auth.admin.deleteUser(createdUserId);
    return failure(error);
  }
}
