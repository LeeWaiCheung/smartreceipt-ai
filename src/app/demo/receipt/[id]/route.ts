import { demoSnapshot } from "@/lib/demo";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const receipt=demoSnapshot().receipts.find(row=>row.id===id);
  if(!receipt?.preview_url)return new Response("Not found",{status:404});
  return Response.redirect(new URL(receipt.preview_url,request.url));
}
