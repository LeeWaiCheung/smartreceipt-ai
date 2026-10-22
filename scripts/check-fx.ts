import { mkdir,writeFile } from "node:fs/promises";
import { getFxQuote } from "../src/lib/fx";
import { hongKongDate,convertToHkd } from "../src/lib/domain";
async function main() {
  const date=hongKongDate();
  const quotes=await Promise.all((["USD","CNY"] as const).map(async currency=>{
    const quote=await getFxQuote(currency,date);
    return {currency,requestedDate:date,...quote,testAmount:"10.00",convertedHkd:convertToHkd("10.00",quote.rate)};
  }));
  await mkdir("reports",{recursive:true});
  await writeFile("reports/fx-smoke.json",JSON.stringify({checkedAt:new Date().toISOString(),status:"passed",quotes,note:"Public reference-rate connectivity only. Bank/card settlement rates may differ."},null,2)+"\n");
  console.log("Live USD/HKD and CNY/HKD reference-rate checks passed; reports/fx-smoke.json");
}
main().catch(()=>{console.error("Live reference-rate check failed; no fallback rates were invented.");process.exitCode=1;});
