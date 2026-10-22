import { AuthForm } from "@/components/auth-form";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export const dynamic="force-dynamic";
export default async function AuthPage() {
  if(await currentUser())redirect("/workspace");
  return <AuthForm configured={!!publicSupabaseConfig()} localSetup={process.env.NODE_ENV==="development"&&!process.env.VERCEL}/>;
}
