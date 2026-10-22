"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "./config";
let client: ReturnType<typeof createBrowserClient> | undefined;
export function browserClient() {
  const config = publicSupabaseConfig();
  if (!config) return null;
  return client ??= createBrowserClient(config.url,config.key);
}
