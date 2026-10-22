import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError,authenticatedUser,body,failure,json,sameOrigin } from "@/lib/api";
import { adminClient } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/domain";

const uploadSchema = z.object({
  name:z.string().trim().min(1).max(200),size:z.number().int().positive().max(10485760),
  type:z.enum(["image/jpeg","image/png","application/pdf"]),
  hash:z.string().regex(/^[a-f0-9]{64}$/),pages:z.number().int().min(1).max(10)
});
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user=await authenticatedUser(),input=uploadSchema.parse(await body(request));
    validateUpload(input);
    const db=adminClient();
    const {data:existing,error:lookupError}=await db.from("receipts").select("*").eq("user_id",user.id).eq("file_hash",input.hash).maybeSingle();
    if (lookupError) throw new ApiError(503,"收據儲存服務尚未準備完成。");
    if (existing && !["uploaded","failed"].includes(existing.status)) return json({duplicate:true,receipt:existing});
    const id=existing?.id || randomUUID();
    const prefix=user.id+"/"+id;
    const extension=input.type==="application/pdf"?"pdf":input.type==="image/png"?"png":"jpg";
    const pagePaths=Array.from({length:input.pages},(_,i)=>prefix+"/page-"+String(i+1).padStart(2,"0")+".jpg");
    const originalPath=prefix+"/original."+extension;
    if (existing && (existing.page_paths.length!==input.pages || existing.mime_type!==input.type)) {
      throw new ApiError(400,"原檔與上次上傳不一致，請重新選取。");
    }
    if (!existing) {
      const {error}=await db.from("receipts").insert({
        id,user_id:user.id,original_name:input.name,storage_path:originalPath,page_paths:pagePaths,
        file_hash:input.hash,mime_type:input.type,file_size:input.size
      });
      if(error) {
        if(error.code==="23505") throw new ApiError(409,"這份收據正在上傳，請稍後查看收件匣。");
        throw new ApiError(503,"無法建立收據記錄。");
      }
    }
    const paths=[originalPath,...pagePaths];
    const uploads=await Promise.all(paths.map(async path=>{
      const {data,error}=await db.storage.from("receipts").createSignedUploadUrl(path,{upsert:true});
      if(error || !data) throw new ApiError(503,"暫時無法產生上傳連結。");
      return {path,token:data.token};
    }));
    return json({id,uploads,duplicate:false});
  } catch(error) { return failure(error); }
}
