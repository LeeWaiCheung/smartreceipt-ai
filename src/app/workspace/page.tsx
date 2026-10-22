import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { snapshot } from "@/lib/repository";
import { SmartReceiptApp } from "@/components/smart-receipt-app";
import { StatusScreen } from "@/components/status-screen";
export const dynamic="force-dynamic";
export default async function WorkspacePage() {
  const user=await currentUser();
  if(!user) redirect("/auth");
  try {
    const initial=await snapshot();
    return <SmartReceiptApp mode="live" initial={initial} email={user.email || "我的工作區"} today={new Date().toISOString()}/>;
  } catch {
    return <StatusScreen title="工作區正在準備中" message="資料服務尚未接通。你可以先看看完整的示範工作區，稍後再回來。" action="查看示範" href="/"/>;
  }
}
