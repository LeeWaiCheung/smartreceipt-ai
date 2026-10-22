# Public demo receipt photographs

The read-only ledger contains two manually checked photographs of paper receipts.
Dates and totals are preserved. These are public source documents, not our customers' expenses or live AI results.

- HK restaurant: source and author are linked in the preview. CC0 1.0. Total HKD 985.00 on 2026-01-11. The 89.50 service charge is not tax. HKD is established manually from the Hong Kong venue; the paper has no explicit currency code.
- US store: [99 cents only store receipt 2021](https://commons.wikimedia.org/wiki/File:99_cents_only_store_receipt_2021.jpg), Downtowngal, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). USD 23.17 including tax 0.67, dated 2021-08-18. USD follows the Los Angeles address and dollar notation.

Both photographs are unmodified originals. Their licenses apply to the image assets. Full source, author and license links appear in src/lib/demo.ts and in the receipt preview.
SHA-1 HK: 59fedb6705f354706561dd5657d78d3f9597d1be; US: 15cf10204b8bdc9e99b0164baba322863acfba4d.

The USD example uses [Frankfurter v2's historical rate](https://api.frankfurter.dev/v2/rates?date=2021-08-18&base=USD&quotes=HKD), 7.7966 HKD per USD, retrieved 2026-10-23. The examples appear in their actual months. Synthetic test fixtures remain separate.
