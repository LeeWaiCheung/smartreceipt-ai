import { demoSnapshot } from "@/lib/demo";
import { SmartReceiptApp } from "@/components/smart-receipt-app";
export const dynamic="force-dynamic";
export default function Home() {
  return <SmartReceiptApp mode="demo" initial={demoSnapshot()} email="訪客" today={new Date().toISOString()}/>;
}
