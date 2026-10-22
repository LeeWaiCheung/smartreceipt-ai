import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "./config";

export async function userClient() {
  const config = publicSupabaseConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url,config.key,{
    cookies: {
      getAll: () => jar.getAll(),
      setAll: updates => { try { updates.forEach(({name,value,options}) => jar.set(name,value,options)); } catch { /* Server component: proxy refreshes cookies. */ } }
    }
  });
}
export function adminClient() {
  const config = publicSupabaseConfig();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new Error("工作區尚未完成設定");
  return createClient(config.url,key,{ auth: { persistSession:false,autoRefreshToken:false } });
}
export async function currentUser() {
  const client = await userClient();
  if (!client) return null;
  const { data,error } = await client.auth.getUser();
  return error ? null : data.user;
}
