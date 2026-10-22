import { z } from "zod";
import { ApiError,authenticatedUser,body,failure,json,sameOrigin } from "@/lib/api";
import { adminClient } from "@/lib/supabase/server";
import { moneyString } from "@/lib/domain";
export async function POST(request:Request) {
  try {
    sameOrigin(request);
    const user=await authenticatedUser();
    const input=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),amount_hkd:moneyString}).parse(await body(request));
    const {error}=await adminClient().from("budgets").upsert({...input,user_id:user.id},{onConflict:"user_id,month"});
    if(error) throw new ApiError(503,"預算儲存未完成，請稍後再試。");
    return json({ok:true});
  } catch(error) { return failure(error); }
}
