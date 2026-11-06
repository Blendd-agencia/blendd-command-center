begin;
insert into auth.users(id,email) values('a1000000-0000-4000-8000-000000000001','admin@cc-test.invalid'),('a1000000-0000-4000-8000-000000000002','client@cc-test.invalid'),('a1000000-0000-4000-8000-000000000003','outsider@cc-test.invalid');
insert into public.cc_clients(id,company_id,name) values('c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Temporary RLS client');
insert into public.cc_memberships(user_id,company_id,role,client_id) values('a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','admin',null),('a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','client','c1000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.cc_records(id,company_id,kind,title,payload) values('d1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','task','RLS private task','{}');
insert into public.cc_records(id,company_id,client_id,kind,title,visibility) values('d1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','report','RLS shared report','shared');
do $$ begin
 if (select count(*) from public.cc_companies)<>1 then raise exception 'Company isolation failed'; end if;
 begin
  insert into public.cc_records(company_id,kind,title) values('b1000000-0000-4000-8000-000000000002','task','Forbidden');
  raise exception 'Cross-company write was allowed';
 exception when insufficient_privilege then null; end;
 perform public.cc_update_record('d1000000-0000-4000-8000-000000000001',1,'Changed','{}','internal',false);
 begin
  perform public.cc_update_record('d1000000-0000-4000-8000-000000000001',1,'Stale','{}','internal',false);
  raise exception 'Stale update was allowed';
 exception when serialization_failure then null; end;
 if (select count(*) from public.cc_audit)<>3 then raise exception 'Audit missing'; end if;
 if not public.cc_consume_request() then raise exception 'Rate limiter failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.cc_records)<>1 then raise exception 'Client data leak'; end if;
 if (select count(*) from public.cc_integrations)<>0 then raise exception 'Integration leak'; end if;
 if (select count(*) from public.cc_audit)<>0 then raise exception 'Audit leak'; end if;
 begin
  perform public.cc_update_record('d1000000-0000-4000-8000-000000000002',1,'Forbidden','{}','shared',false);
  raise exception 'Client write allowed';
 exception when serialization_failure then null; end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
do $$ begin
 if (select count(*) from public.cc_records)<>0 then raise exception 'Outsider data leak'; end if;
 if public.cc_consume_request() then raise exception 'Outsider request allowed'; end if;
end $$;
reset role;
select 'PASS: company isolation, client isolation, denied writes, optimistic concurrency, audit and request limiter' as result;
rollback;
