import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "./lib/supabase/config";
export async function proxy(request: NextRequest) {
  const config = publicSupabaseConfig();
  if (!config) return NextResponse.next();
  let response = NextResponse.next({request});
  const client = createServerClient(config.url,config.key,{
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(updates) {
        updates.forEach(({name,value}) => request.cookies.set(name,value));
        response = NextResponse.next({request});
        updates.forEach(({name,value,options}) => response.cookies.set(name,value,options));
        response.headers.set("Cache-Control","private, no-store, max-age=0");
      }
    }
  });
  await client.auth.getClaims();
  return response;
}
export const config = { matcher: ["/workspace/:path*","/api/:path*","/auth/:path*"] };
