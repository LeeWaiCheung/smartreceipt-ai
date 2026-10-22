import { describe,it,expect } from "vitest";
import { convertToHkd,validDate,hongKongDate,previousMonths,transactionSchema,normalizeExtraction,filterTransactions,sumHkd,validateUpload } from "./domain";
import { demoSnapshot } from "./demo";
const valid={merchant:"測試商家",transaction_date:"2026-01-02",amount:"10.00",currency:"USD",tax:null,category_id:"food"};
describe("monetary correctness",()=>{
  it("converts USD and CNY with decimal arithmetic",()=>{expect(convertToHkd("10","7.8")).toBe("78.00");expect(convertToHkd("100","1.1")).toBe("110.00");});
  it("rounds half up at the final monetary boundary",()=>{expect(convertToHkd("3.45","1.1")).toBe("3.80");expect(convertToHkd("0.01","1.5")).toBe("0.02");});
  it("rejects zero, negative and non-finite rates",()=>{for(const rate of ["0","-1","NaN","Infinity"])expect(()=>convertToHkd("10",rate)).toThrow();});
  it("retains large supported decimal amounts",()=>expect(convertToHkd("123456789012.34","1")).toBe("123456789012.34"));
  it("validates totals and tax without adding tax twice",()=>{expect(transactionSchema.safeParse(valid).success).toBe(true);expect(transactionSchema.safeParse({...valid,tax:"11"}).success).toBe(false);expect(transactionSchema.safeParse({...valid,amount:"-3"}).success).toBe(false);expect(transactionSchema.safeParse({...valid,amount:"1.001"}).success).toBe(false);});
  it("returns validation errors for non-numeric amount and tax without throwing",()=>{for(const fields of [{amount:"cash 20",tax:"1"},{amount:"20",tax:"unreadable"},{amount:"unknown",tax:"?"}])expect(transactionSchema.safeParse({...valid,...fields}).success).toBe(false);});
});
describe("dates and extraction",()=>{
  it("uses Hong Kong date at the UTC midnight boundary",()=>expect(hongKongDate(new Date("2026-10-20T16:01:00Z"))).toBe("2026-10-21"));
  it("recognizes real calendar dates",()=>{expect(validDate("2024-02-29")).toBe(true);for(const value of ["2026-02-29","2026-02-31","2026-13-01","2026-1-2","bad"])expect(validDate(value)).toBe(false);});
  it("builds a six-month window crossing the year boundary",()=>expect(previousMonths("2026-02")).toEqual(["2025-09","2025-10","2025-11","2025-12","2026-01","2026-02"]));
  it("retains uncertainty instead of inventing currency or date",()=>{const result=normalizeExtraction({merchant:null,transaction_date:"2026-02-31",amount:"cash 20",currency:null,tax:null,category_id:"other",warnings:[]});expect(result.transaction_date).toBeNull();expect(result.currency).toBeNull();expect(result.amount).toBeNull();expect(result.warnings).toHaveLength(2);});
  it("requires critical fields when confirming a draft",()=>{expect(transactionSchema.safeParse({...valid,currency:null}).success).toBe(false);expect(transactionSchema.safeParse({...valid,merchant:" "}).success).toBe(false);expect(transactionSchema.safeParse({...valid,transaction_date:"2099-01-01"}).success).toBe(false);});
});
describe("filters, totals and uploads",()=>{
  const demo=demoSnapshot(new Date("2026-10-21T04:00:00Z"));
  it("applies intersecting search, category and inclusive dates",()=>{const result=filterTransactions(demo.transactions,{search:"  ADOBE ",category:"software",start:"2026-10-21",end:"2026-10-21"});expect(result).toHaveLength(1);expect(result[0].merchant).toBe("Adobe Creative Cloud");});
  it("does not include pending receipts in the monthly ledger",()=>{const rows=demo.transactions.filter(t=>t.transaction_date.startsWith("2026-10"));expect(rows).toHaveLength(18);expect(sumHkd(rows)).toBe("7603.14");expect(demo.receipts.filter(r=>r.status==="needs_review")).toHaveLength(2);});
  it("represents an empty ledger as zero",()=>expect(sumHkd([])).toBe("0.00"));
  it("enforces format, extension and size boundaries",()=>{expect(()=>validateUpload({name:"ticket.PNG",type:"image/png",size:10485760})).not.toThrow();expect(()=>validateUpload({name:"ticket.html",type:"image/png",size:10})).toThrow();expect(()=>validateUpload({name:"ticket.pdf",type:"application/pdf",size:10485761})).toThrow();expect(()=>validateUpload({name:"ticket.jpg",type:"image/jpeg",size:0})).toThrow();});
});
