import { z } from "zod";
import { ApiError,authenticatedUser,failure,json } from "@/lib/api";
import { getFxQuote } from "@/lib/fx";
import { CURRENCIES } from "@/lib/types";
import { validDate,hongKongDate } from "@/lib/domain";
export async function GET(request:Request) {
  try {
    await authenticatedUser();
    const params=new URL(request.url).searchParams;
    const currency=z.enum(CURRENCIES).parse(params.get("currency"));
    const date=z.string().refine(validDate).refine(v=>v<=hongKongDate()).parse(params.get("date"));
    try { return json(await getFxQuote(currency,date)); }
    catch { throw new ApiError(503,"參考匯率暫時無法取得，請稍後再試。"); }
  } catch(error) { return failure(error); }
}
