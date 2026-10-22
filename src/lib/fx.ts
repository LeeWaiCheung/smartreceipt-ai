import { Decimal } from "decimal.js";
import { validDate } from "./domain";
import type { Currency,FxQuote } from "./types";

export async function getFxQuote(currency: Currency,date: string,fetcher: typeof fetch = fetch): Promise<FxQuote> {
  if (!validDate(date)) throw new Error("匯率日期無效");
  if (currency === "HKD") return {rate:"1",date,source:"HKD 本位幣"};
  // Query the requested day and preceding 10 days; never use a future quote.
  const from = new Date(date + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate()-10);
  const params = new URLSearchParams({base:currency,quotes:"HKD",from:from.toISOString().slice(0,10),to:date});
  const response = await fetcher("https://api.frankfurter.dev/v2/rates?" + params,{
    signal:AbortSignal.timeout(12_000),cache:"no-store"
  });
  if (!response.ok) throw new Error("匯率服務暫時無法使用");
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("匯率回應格式不正確");
  const quotes = payload.filter((row): row is {date:string;rate:number;quote:string;base:string} => {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string,unknown>;
    return typeof r.date === "string" && validDate(r.date) && r.date <= date &&
      r.base === currency && r.quote === "HKD" && typeof r.rate === "number" && Number.isFinite(r.rate) && r.rate>0;
  }).sort((a,b) => b.date.localeCompare(a.date));
  if (!quotes.length) throw new Error("未找到該日期附近的參考匯率");
  return {rate:new Decimal(quotes[0].rate).toDecimalPlaces(10).toString(),date:quotes[0].date,source:"Frankfurter v2 · 綜合參考匯率"};
}
