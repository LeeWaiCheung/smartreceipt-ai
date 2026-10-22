import { describe,it,expect } from "vitest";
import { isSameOrigin } from "./request-origin";
describe("same-origin mutations behind Next.js",()=>{
  it("allows browser Host when the internal URL was normalized to localhost",()=>{
    expect(isSameOrigin(new Request("http://localhost:3001/api/receipts",{headers:{Host:"127.0.0.1:3001",Origin:"http://127.0.0.1:3001"}}))).toBe(true);
  });
  it("allows the production HTTPS origin",()=>expect(isSameOrigin(new Request("https://smartreceipt.example/api/receipts",{headers:{Host:"smartreceipt.example",Origin:"https://smartreceipt.example"}}))).toBe(true));
  it("rejects cross-site origins and spoofed forwarded hosts",()=>expect(isSameOrigin(new Request("https://smartreceipt.example/api/receipts",{headers:{Host:"smartreceipt.example",Origin:"https://attacker.example","X-Forwarded-Host":"attacker.example"}}))).toBe(false));
  it("rejects a different scheme or port",()=>{
    expect(isSameOrigin(new Request("https://smartreceipt.example/api/receipts",{headers:{Origin:"http://smartreceipt.example"}}))).toBe(false);
    expect(isSameOrigin(new Request("http://localhost:3000/api/receipts",{headers:{Origin:"http://localhost:4000"}}))).toBe(false);
  });
  it("permits non-browser requests without Origin but rejects a malformed Origin",()=>{
    expect(isSameOrigin(new Request("https://smartreceipt.example/api/receipts"))).toBe(true);
    expect(isSameOrigin(new Request("https://smartreceipt.example/api/receipts",{headers:{Origin:"null"}}))).toBe(false);
  });
});
