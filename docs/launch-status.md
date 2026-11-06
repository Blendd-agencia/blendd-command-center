# Current release: internal administration recovery

Recovered original modules and light Blendd interface. Supabase workspace states are partitioned by company, with a global configuration and a separately encrypted vault envelope. Access requires administrator membership of BOTH companies. This compatibility layer deliberately does not grant client/editor access. External client portal remains an internal simulation, not a released customer portal.

Private source data imported directly into Supabase: 34 finance records, 14 client profiles, 9 tasks. Original data files and editorial reference were excluded from the public repository. Later edits made in an original browser require its export.

Implemented server session validation, RLS, optimistic revisions, idempotent operation receipts, snapshot history, HTML sanitation, request budgets, bounded uploads/timeouts, private file proxy and encrypted vault storage. Files limited to PDF/PNG/JPEG, 3 MB each, 100 MB total. File content signatures checked; no malware scanning claim. Vault master phrase is never sent to server and is unrecoverable.

Verification: automated auth/origin/model tests; Supabase transactional checks for idempotency, stale write rejection and snapshot generation; browser navigation and task creation with synthetic data/mock transport. This is NOT an end-to-end authenticated production upload test. Production login was confirmed by the user before this release.

Still pending release gates: external client authorization/portal, end-to-end file/vault/restore tests with real sessions, actual simultaneous browser load tests, automated off-project backups and full disaster restore, monitoring alert destinations, complete dependency/security review. Moloni, email, OTP and external paid APIs remain inactive. Integration controls save limits only; Supabase has a session-scoped connectivity test. No claim of completed external integrations.
