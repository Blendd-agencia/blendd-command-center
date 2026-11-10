# Session lifecycle

Application access is limited to 600 seconds after token issuance. Both access and refresh tokens are stored in host-only Secure, HttpOnly, SameSite=Strict cookies, never browser storage or JSON responses. Refresh cookies have a rolling 12-hour browser lifetime; provider revocation still governs validity. Refresh requests enforce the configured exact application origin and validate membership before issuing cookies. Logout revokes the current provider session.

The client checks/renews before expiry and on returning to the window. Concurrent requests share a renewal promise; Web Locks serialize refresh-cookie rotation between tabs. A 401 write is retried with its original body and operation ID. Server revision checks remain authoritative: a 409 never becomes an automatic overwrite.

When renewal fails, a modal blocks interaction without rendering over the existing form or replacing workspace data. Reauthentication must use the same email, including on retried API requests. A transient outage does not delete cookies. The connection retry button allows recovery without password entry when the session remains valid.

Pending work stays in this window's memory. This does not guarantee recovery after closing the browser, reloading or a device crash. Existing workspace autosave and unload warnings remain; check “Guardado no servidor” before closing.

## Deployment setting still required

Set Supabase project opdkslnhmvvmgymenetb JWT expiry to **600 seconds** under Settings > JWT Keys > Legacy JWT Secret. The connected Supabase tools do not expose Auth configuration, and the dashboard requires a separate login. Application-side age checks are already enforced, but they do not shorten a JWT's cryptographic expiry for direct calls to Supabase. Do not describe issuer-level expiry as complete until the setting and a newly issued token have been verified.

Existing sessions created before refresh support must reauthenticate once. Staff onboarding uses its own 30-minute session and is not changed.

## Verification

`npm test` includes server auth/cookie tests plus client lifecycle simulations: 401 recovery, modal retention, same-account reauthentication, simultaneous requests, revoked refresh, network outages, CSRF, and conflict preservation. `npm run build` validates generated scripts. Tests mock authentication responses; a real authenticated production test is still needed after the issuer setting changes.
