import { z } from "zod";
import { ApiError,authenticatedUser,failure,json } from "@/lib/api";
import { userClient } from "@/lib/supabase/server";
import { monthKey,validDate } from "@/lib/domain";
export async function GET(request:Request) {
  try {
    await authenticatedUser();
    const month=z.string().regex(/^\d{4}-\d{2}$/).refine(v=>validDate(v+"-01")&&v<=monthKey()).parse(new URL(request.url).searchParams.get("month"));
    const client=await userClient();
    const {data,error}=await client!.rpc("dashboard_summary",{p_month:month+"-01"});
    if(error||!data)throw new ApiError(503,"支出統計暫時無法更新，請重新整理。");
    return json(data);
  } catch(error) {return failure(error);}
}
