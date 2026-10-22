import { describe,it,expect } from "vitest";
import { transactionsCsv } from "./csv";
import { demoSnapshot } from "./demo";
describe("Excel-compatible CSV",()=>{
  it("uses English headers and categories while preserving original merchant and amounts",()=>{
    const row={...transaction,merchant:"海港茶餐廳",category_id:"food" as const};
    const csv=transactionsCsv([row],"en");
    expect(csv).toContain('"Transaction date","Merchant","Category"');
    expect(csv).toContain('"海港茶餐廳","Food & drinks"');
    expect(csv).toContain('"'+row.amount_hkd+'"');
    expect(transactionsCsv([row])).toContain('"海港茶餐廳","餐飲"');
  });
  const transaction=demoSnapshot(new Date("2026-10-21T00:00:00Z")).transactions[0];
  it("includes BOM, Chinese headers and CRLF",()=>{const csv=transactionsCsv([transaction]);expect(csv.startsWith("\uFEFF")).toBe(true);expect(csv).toContain('"交易日期","商家"');expect(csv.endsWith("\r\n")).toBe(true);});
  it("escapes punctuation, quotes and embedded newlines",()=>{expect(transactionsCsv([{...transaction,merchant:'茶餐廳, "中環"\n分店'}])).toContain('"茶餐廳, ""中環""\n分店"');});
  it("neutralizes formula-leading merchant names",()=>{for(const merchant of ["=HYPERLINK(1)","+cmd","-2+3","@SUM(A1)","  =2+2","\t=5"])expect(transactionsCsv([{...transaction,merchant}])).toContain('"\''+merchant+'"');});
  it("exports only the records supplied by the active filter",()=>{const csv=transactionsCsv([transaction]);expect(csv.split("\r\n")).toHaveLength(3);expect(csv).toContain(transaction.merchant);});
});
