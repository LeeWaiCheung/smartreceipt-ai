import { z } from "zod";
import { ApiError,authenticatedUser,body,failure,json,sameOrigin } from "@/lib/api";
import { adminClient } from "@/lib/supabase/server";
import { transactionSchema,convertToHkd } from "@/lib/domain";
import { getFxQuote } from "@/lib/fx";
export async function POST(request:Request) {
  try {
    sameOrigin(request);
    const user=await authenticatedUser();
    const input=z.object({receipt_id:z.string().uuid(),fields:transactionSchema}).parse(await body(request));
    const db=adminClient();
    const {data:receipt}=await db.from("receipts").select("id,status").eq("id",input.receipt_id).eq("user_id",user.id).single();
    if(!receipt || !["needs_review","confirmed"].includes(receipt.status)) throw new ApiError(409,"請先完成收據辨識。");
    const {data:old}=await db.from("transactions").select("*").eq("receipt_id",input.receipt_id).eq("user_id",user.id).maybeSingle();
    const preserve=old && old.currency===input.fields.currency && old.transaction_date===input.fields.transaction_date;
    let quote;
    try {
      quote=preserve?{rate:String(old.exchange_rate),date:old.exchange_rate_date,source:old.exchange_rate_source}:
        await getFxQuote(input.fields.currency,input.fields.transaction_date);
    } catch { throw new ApiError(503,"暫時找不到參考匯率，你的覆核內容仍保留在畫面上，請稍後再試。"); }
    const payload={
      ...input.fields,exchange_rate:quote.rate,exchange_rate_date:quote.date,
      exchange_rate_source:quote.source,amount_hkd:convertToHkd(input.fields.amount,quote.rate)
    };
    const {data,error}=await db.rpc("confirm_transaction",{p_user_id:user.id,p_receipt_id:input.receipt_id,p_data:payload});
    if(error) throw new ApiError(503,"儲存未完成，請保留覆核畫面並重試。");
    return json({transaction:data});
  } catch(error) { return failure(error); }
}
