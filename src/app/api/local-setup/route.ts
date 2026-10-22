import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ApiError,body,failure,json,sameOrigin } from "@/lib/api";
export async function POST(request:Request) {
  try {
    if(process.env.NODE_ENV!=="development"||process.env.VERCEL)throw new ApiError(404,"找不到頁面。");
    const url=new URL(request.url);
    if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname))throw new ApiError(403,"只可在本機設定。");
    sameOrigin(request);
    if(request.headers.get("X-SmartReceipt-Setup")!=="1")throw new ApiError(403,"請使用本機設定頁。");
    const token=z.string().trim().min(20).max(2048).refine(value=>!/[\r\n]/.test(value));
    const input=z.object({
      url:z.url().refine(value=>{const parsed=new URL(value);return parsed.protocol==="https:"&&parsed.hostname.endsWith(".supabase.co");},"請填寫 Supabase 專案的 HTTPS 網址"),
      publishable:token,secret:token,deepseek:token
    }).parse(await body(request));
    const destination=path.resolve(process.cwd(),".env.local");
    const keys:Record<string,string>={
      NEXT_PUBLIC_SUPABASE_URL:input.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:input.publishable,
      SUPABASE_SECRET_KEY:input.secret,DEEPSEEK_API_KEY:input.deepseek,
      DEEPSEEK_MODEL:"deepseek-flash",DEEPSEEK_BASE_URL:"https://api.deepseek.com",NEXT_PUBLIC_SITE_URL:url.origin
    };
    let existing="";
    try {existing=await readFile(destination,"utf8");} catch { /* First local configuration. */ }
    const remaining=existing.split(/\r?\n/).filter(line=>!Object.keys(keys).some(key=>line.startsWith(key+"="))).filter(Boolean);
    await writeFile(destination,[...remaining,...Object.entries(keys).map(([key,value])=>key+"="+JSON.stringify(value)),""].join("\n"),{encoding:"utf8",mode:0o600});
    return json({ok:true,message:"本機設定已儲存，請重新整理登入頁。"});
  } catch(error) {return failure(error);}
}
