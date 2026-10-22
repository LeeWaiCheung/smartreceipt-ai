import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser } from "./supabase/server";
import { isSameOrigin } from "./request-origin";
export class ApiError extends Error {
  constructor(public status: number,message: string) { super(message); }
}
export async function authenticatedUser() {
  const user = await currentUser();
  if (!user) throw new ApiError(401,"請先登入，再管理你的收據。");
  return user;
}
export function json(data: unknown,status=200) {
  return NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});
}
export async function body(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 100_000) throw new ApiError(413,"請透過指定上傳連結傳送文件。");
  const text = await request.text();
  if (text.length > 100_000) throw new ApiError(413,"請求內容過大。");
  try { return JSON.parse(text); } catch { throw new ApiError(400,"請求格式不正確。"); }
}
export function sameOrigin(request: Request) {
  if (!isSameOrigin(request)) throw new ApiError(403,"此請求來源不受支援。");
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({error:error.message},error.status);
  if (error instanceof ZodError) return json({error:error.issues[0]?.message || "資料格式不正確。"},400);
  console.error("[SmartReceipt] Request failed:",error instanceof Error ? error.name : "UnknownError");
  return json({error:"暫時無法完成操作，請稍後再試。"},500);
}
