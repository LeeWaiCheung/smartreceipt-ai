import { AuthForm } from "@/components/auth-form";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isTrialUser } from "@/lib/trial";
export const dynamic="force-dynamic";
export default async function AuthPage() {
  const user=await currentUser();
  if(user&&!isTrialUser(user))redirect("/workspace");
  return <AuthForm configured={!!publicSupabaseConfig()} localSetup={process.env.NODE_ENV==="development"&&!process.env.VERCEL}/>;
}
