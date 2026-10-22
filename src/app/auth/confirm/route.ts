import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
export async function GET(request:Request) {
  const url=new URL(request.url),client=await userClient();
  if(client) {
    const code=url.searchParams.get("code"),hash=url.searchParams.get("token_hash"),type=url.searchParams.get("type");
    if(code) {
      const {error}=await client.auth.exchangeCodeForSession(code);
      if(!error) return NextResponse.redirect(new URL("/workspace",url));
    }
    if(hash && type && ["signup","magiclink","email","recovery","invite"].includes(type)) {
      const {error}=await client.auth.verifyOtp({token_hash:hash,type:type as EmailOtpType});
      if(!error) return NextResponse.redirect(new URL("/workspace",url));
    }
  }
  return NextResponse.redirect(new URL("/auth?message=confirmation_failed",url));
}
