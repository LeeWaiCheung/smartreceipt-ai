import "server-only";
import { adminClient,userClient } from "./supabase/server";
import { hongKongDate } from "./domain";
import { ApiError } from "./api";
import type { Snapshot,Transaction,Receipt } from "./types";

async function allRows(table: "transactions"|"receipts") {
  const client = await userClient();
  if (!client) throw new ApiError(503,"工作區尚未開放。");
  const result: Record<string,unknown>[] = [];
  for (let start=0; ; start+=1000) {
    const {data,error} = await client.from(table).select("*").order("created_at",{ascending:false}).range(start,start+999);
    if (error) throw new ApiError(503,"資料服務尚未準備完成，請稍後再試。");
    result.push(...(data || []));
    if (!data || data.length<1000) break;
  }
  return result;
}
export async function snapshot(): Promise<Snapshot> {
  const client = await userClient();
  if (!client) throw new ApiError(503,"工作區尚未開放。");
  const [tx,receipts,budgetResult,usageResult,configResult] = await Promise.all([
    allRows("transactions"),allRows("receipts"),
    client.from("budgets").select("month,amount_hkd"),
    client.from("ai_runs").select("id",{count:"exact",head:true}).gte("created_at",hongKongDate()+"T00:00:00+08:00"),
    adminClient().from("app_config").select("daily_ai_limit").eq("id",true).single()
  ]);
  if (budgetResult.error || usageResult.error || configResult.error) throw new ApiError(503,"無法讀取工作區資料。");
  return {
    transactions:tx.map(row => ({
      ...row,amount:String(row.amount),tax:row.tax===null?null:String(row.tax),
      exchange_rate:String(row.exchange_rate),amount_hkd:String(row.amount_hkd)
    })) as unknown as Transaction[],
    receipts:receipts as unknown as Receipt[],
    budgets:(budgetResult.data || []).map(row => ({month:row.month,amount_hkd:String(row.amount_hkd)})),
    recognizedCount:receipts.filter(row => row.extraction!==null).length,
    aiAttemptsToday:usageResult.count || 0,dailyLimit:configResult.data.daily_ai_limit
  };
}
