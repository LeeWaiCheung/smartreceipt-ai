import { z } from "zod";
import { ApiError,authenticatedUser,failure,json } from "@/lib/api";
import { adminClient } from "@/lib/supabase/server";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const user=await authenticatedUser(),id=z.string().uuid().parse((await params).id),db=adminClient();
    const {data:receipt,error}=await db.from("receipts").select("storage_path,page_paths,mime_type,original_name").eq("id",id).eq("user_id",user.id).single();
    if(error || !receipt) throw new ApiError(404,"找不到這份收據。");
    const sign=async(path:string)=>{
      const {data,error}=await db.storage.from("receipts").createSignedUrl(path,600);
      if(error || !data) throw new ApiError(503,"暫時無法顯示憑證，請稍後再試。");
      return data.signedUrl;
    };
    return json({original:await sign(receipt.storage_path),pages:await Promise.all(receipt.page_paths.map(sign)),name:receipt.original_name});
  } catch(error) { return failure(error); }
}
