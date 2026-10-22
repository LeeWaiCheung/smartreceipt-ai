import { receiptBucket } from "@/lib/trial";
import { z } from "zod";
import { ApiError,authenticatedUser,failure,json,sameOrigin } from "@/lib/api";
import { adminClient,userClient } from "@/lib/supabase/server";
import { extractReceipt } from "@/lib/ai";
export const maxDuration=120;
export async function POST(request: Request,{params}:{params:Promise<{id:string}>}) {
  let runId: string | null=null;
  let receiptId="",ownerId="";
  try {
    sameOrigin(request);
    const user=await authenticatedUser();
    ownerId=user.id;
    receiptId=z.string().uuid().parse((await params).id);
    if(!process.env.DEEPSEEK_API_KEY) throw new ApiError(503,"辨識服務尚未接通，請稍後重試。");
    const db=adminClient(),client=await userClient();
    const {data:receipt,error}=await db.from("receipts").select("*").eq("id",receiptId).eq("user_id",user.id).single();
    if(error || !receipt) throw new ApiError(404,"找不到這份收據。");
    if(["confirmed","needs_review"].includes(receipt.status)) return json({receipt});
    const folder=user.id+"/"+receiptId;
    const {data:objects,error:storageError}=await db.storage.from(receiptBucket(user)).list(folder,{limit:20});
    if(storageError || !objects || !receipt.page_paths.every((path:string)=>objects.some(obj=>obj.name===path.split("/").pop()))) {
      throw new ApiError(409,"文件尚未完整上傳，請重新選取原檔上傳。");
    }
    const pageObjects=objects.filter(obj=>obj.name.startsWith("page-"));
    if(pageObjects.some(obj=>Number(obj.metadata?.size || 0)>2*1024*1024)) throw new ApiError(413,"辨識圖片過大，請重新上傳原檔讓系統壓縮。");
    const reserved=await client!.rpc("reserve_ai_run",{p_receipt_id:receiptId});
    if(reserved.error) {
      const code=reserved.error.message;
      if(code.includes("TRIAL_GLOBAL_LIMIT"))throw new ApiError(429,"今日公開 AI 試用額度已用完，請明天再試。");
      if(code.includes("TRIAL_LIMIT"))throw new ApiError(429,"這個試用工作區已用完 3 次辨識額度。");
      if(code.includes("TRIAL_EXPIRED"))throw new ApiError(401,"試用工作區已到期，請返回首頁重新開始。");
      if(code.includes("DAILY_LIMIT")) throw new ApiError(429,"已達今日辨識額度，請明天再試。");
      if(code.includes("ALREADY_PROCESSING")) throw new ApiError(409,"這份收據正在辨識，請稍候。");
      if(code.includes("RETRY_LIMIT")) throw new ApiError(429,"這份收據已達重試上限，請以更清晰的照片重新上傳。");
      throw new ApiError(409,"暫時無法開始辨識，請重新整理收件匣。");
    }
    runId=reserved.data;
    const urls=await Promise.all(receipt.page_paths.map(async(path:string)=>{
      const signed=await db.storage.from(receiptBucket(user)).createSignedUrl(path,300);
      if(signed.error || !signed.data) throw new Error("STORAGE_SIGNING_FAILED");
      return signed.data.signedUrl;
    }));
    const result=await extractReceipt(urls);
    const complete=await db.rpc("complete_ai_run",{
      p_user_id:user.id,p_receipt_id:receiptId,p_run_id:runId,p_extraction:result.extraction,
      p_model:result.model,p_elapsed_ms:result.elapsedMs,p_input_tokens:result.inputTokens,
      p_output_tokens:result.outputTokens,p_error:null
    });
    if(complete.error || !complete.data) throw new Error("EXTRACTION_SAVE_FAILED");
    return json({extraction:result.extraction});
  } catch(error) {
    if(runId) {
      const code=error instanceof Error?error.message:"AI_UNKNOWN_ERROR";
      const safeCode=/^[A-Z_]+$/.test(code)?code:"AI_PROCESSING_ERROR";
      try {
        await adminClient().rpc("complete_ai_run",{
          p_user_id:ownerId,p_receipt_id:receiptId,p_run_id:runId,p_extraction:null,
          p_model:process.env.DEEPSEEK_MODEL || "deepseek-flash",p_elapsed_ms:null,
          p_input_tokens:null,p_output_tokens:null,p_error:safeCode
        });
      } catch { /* Lease expiry permits a bounded retry if the database is unavailable. */ }
      return failure(new ApiError(502,code==="AI_CREDENTIAL_ERROR"?"辨識服務連線需要更新，請聯絡工作區管理者。":"辨識暫時未能完成，原檔已保留，請稍後重試。"));
    }
    return failure(error);
  }
}
