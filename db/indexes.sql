create index cc_audit_actor on public.cc_audit(actor);
create index cc_memberships_company on public.cc_memberships(company_id);
create index cc_records_client_company on public.cc_records(client_id,company_id);
create index cc_records_created_by on public.cc_records(created_by);
-- Deny direct access to the private rate-limit table. Only consume_request may update it.
create policy request_windows_deny on cc_private.request_windows for all to authenticated using(false) with check(false);
