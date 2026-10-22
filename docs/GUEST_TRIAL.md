# Guest trial

Visitors select **Try AI without signing up** on the homepage. A temporary ledger
supports real upload, extraction, human review, posting, analytics, budgets and CSV.
No visitor email, password or verification message is required. Documents are sent
to DeepSeek for extraction. Use non-sensitive receipts for this public trial.

## Limits

| Boundary | Enforced value |
| --- | --- |
| Lifetime per temporary workspace | 3 AI reservations, including failures and retries |
| Uploads per workspace | 3 distinct file hashes; deleting a ledger entry does not release a slot |
| File size / PDF | 5 MB enforced by trial Storage bucket / 2 prepared pages |
| Public AI reservations | 20 per Hong Kong calendar day, across all guests |
| New trial workspaces | 5 per Hong Kong day globally; 2 per network per day |
| Workspace access | 24 hours; previously issued signed preview links retain their short TTL |

The counters are intentionally separate from `auth.users`: deleting a temporary
identity cannot refund global admissions or AI attempts. Existing trial entry
reuses its identity. A signed-in personal account keeps its own workspace.
Private accounts retain the existing 20/day quota; the public cap does not cover
their combined provider spend. These limits are portfolio defaults, not a claim
of comprehensive abuse protection. Shared office networks can share a limit.

## Identity and isolation

1. Same-origin POST reserves admission atomically in SQL, before provisioning Auth.
2. The server creates a temporary identity with a random internal email and password,
   and an immutable `app_metadata.smartreceipt_guest` flag plus session ID.
3. Server-side sign-in sets the usual Supabase cookies. Credentials are never returned
   to the visitor. No public anonymous-signup toggle or SMTP change is required.
4. Requests verify `getUser()`, trial session ownership and expiry. Owner RLS still
   applies to receipts, transactions, budgets and AI runs. SQL also removes access
   after expiry, including direct Storage reads. User-editable metadata is not trusted.
5. Only the server allocates exact upload paths. Guest receipt registration and quota
   reservations use database locks. The guest bucket is private and separate from
   personal-account originals. Model pages must also pass the existing 2 MB check.

Network counters use a purpose-separated HMAC of the Hong Kong day and Vercel's
platform-supplied IP header; raw IPs are not stored by this feature. Local development
uses one shared development network bucket. Counter rows are pruned after seven days.
Hosting providers may maintain their own access logs.

## Expiry and cleanup

The daily Vercel job calls `/api/cron/cleanup-trials` using a random `CRON_SECRET`
bearer value. Unauthenticated calls return 401. New admissions also run bounded
cleanup. The cleanup verifies the immutable guest flag and matching session, removes
only that user's known trial paths, then deletes that temporary identity and its
cascaded ledger records. Personal accounts are never cleanup candidates.

Cleanup waits two additional hours after access expiry so outstanding signed-upload
capabilities expire before deletion. With a daily Hobby schedule, deletion normally
occurs on the next cleanup cycle after that grace period (roughly 26–51 hours after
creation); provider outages can delay it. This is not immediate deletion at hour 24.
There is no transfer of trial records into a subsequently registered personal account.

## Validation

Eight additional local PostgreSQL tests cover admission caps, counter persistence,
RPC privileges, idempotent path allocation, file bounds, lifetime failure accounting,
global AI limits, private-user independence, guest isolation and expiry.
`npm run test:guest-live -- <application-url>` exercises the HTTP flow with a real
licensed US photograph and one model call. Two additional quota reservations are
failed fixtures, not AI-quality samples. Run it with a separate test project: its
admission and reservations count and are not refunded. Reports stay in ignored
`reports/private/`; its own test identity and files are cleaned up.
