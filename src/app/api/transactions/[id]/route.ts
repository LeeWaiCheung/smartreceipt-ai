import { z } from "zod";
import { ApiError,authenticatedUser,failure,json,sameOrigin } from "@/lib/api";
import { adminClient } from "@/lib/supabase/server";
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    sameOrigin(request);
    const user=await authenticatedUser(),id=z.string().uuid().parse((await params).id);
    const {data,error}=await adminClient().rpc("remove_transaction",{p_user_id:user.id,p_transaction_id:id});
    if(error) throw new ApiError(503,"暫時未能刪除，請稍後再試。");
    if(!data) throw new ApiError(404,"找不到這筆交易。");
    return json({ok:true});
  } catch(error) { return failure(error); }
}
