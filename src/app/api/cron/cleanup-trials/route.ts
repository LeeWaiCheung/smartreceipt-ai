import { timingSafeEqual } from "node:crypto";
import { cleanupTrials } from "@/lib/trial-server";
import { failure,json } from "@/lib/api";
export const maxDuration=60;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET,provided=request.headers.get("authorization") || "";
  const expected=secret?"Bearer "+secret:"";
  if(!secret || Buffer.byteLength(provided)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return json({error:"Unauthorized"},401);
  try {return json({deleted:await cleanupTrials()});}catch(error){return failure(error);}
}
