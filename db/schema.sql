begin;
create schema if not exists cc_private;
revoke all on schema cc_private from public, anon, authenticated;
grant usage on schema cc_private to authenticated;
create table public.cc_companies (
 id uuid primary key default gen_random_uuid(), name text not null unique
);
create table public.cc_clients (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.cc_companies,
 name text not null check(length(name) between 1 and 200), unique(id, company_id)
);
create table public.cc_memberships (
 user_id uuid not null references auth.users on delete cascade,
 company_id uuid not null references public.cc_companies,
 role text not null check(role in ('admin','editor','client')),
 client_id uuid, primary key(user_id,company_id),
 foreign key(client_id,company_id) references public.cc_clients(id,company_id),
 check((role='client')=(client_id is not null))
);
create table public.cc_records (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.cc_companies,
 client_id uuid, kind text not null check(kind in ('task','finance','debt','staff','lead','post','idea','request','report','kpi','document','vault_reference')),
 title text not null check(length(title) between 1 and 500),
 payload jsonb not null default '{}' check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=131072),
 visibility text not null default 'internal' check(visibility in ('internal','shared')),
 revision integer not null default 1 check(revision>0), archived boolean not null default false,
 created_by uuid not null default auth.uid() references auth.users,
 updated_at timestamptz not null default now(),
 foreign key(client_id,company_id) references public.cc_clients(id,company_id),
 check(visibility='internal' or (client_id is not null and kind in ('post','idea','request','report','kpi','document')))
);
create index cc_records_scope on public.cc_records(company_id,kind,client_id);
create index cc_memberships_client on public.cc_memberships(client_id,company_id);
create index cc_clients_company on public.cc_clients(company_id);
create table public.cc_integrations (
 company_id uuid not null references public.cc_companies,
 provider text not null check(provider in ('supabase','moloni','email','otp','google_ads','meta','whatsapp','google_voice')),
 enabled boolean not null default false, monthly_limit_cents integer not null default 0 check(monthly_limit_cents between 0 and 10000000),
 timeout_seconds integer not null default 10 check(timeout_seconds between 1 and 30),
 status text not null default 'not_configured' check(status in ('not_configured','configured','verified','error')),
 last_test_at timestamptz, last_error_code text, primary key(company_id,provider)
);
create table public.cc_audit (
 id bigint generated always as identity primary key, company_id uuid not null references public.cc_companies,
 actor uuid references auth.users, record_id uuid, operation text not null,
 revision integer, at timestamptz not null default now()
);
create index cc_audit_company on public.cc_audit(company_id,at desc);
create table cc_private.request_windows (user_id uuid primary key references auth.users on delete cascade, bucket timestamptz not null, requests int not null);
alter table cc_private.request_windows enable row level security;

create function cc_private.is_staff(company uuid, admin_only boolean default false) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.cc_memberships m where m.user_id=auth.uid() and m.company_id=company and (m.role='admin' or (not admin_only and m.role='editor')))
$$;
create function cc_private.is_client(company uuid, client uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.cc_memberships m where m.user_id=auth.uid() and m.company_id=company and m.client_id=client and m.role='client')
$$;
revoke all on function cc_private.is_staff(uuid,boolean), cc_private.is_client(uuid,uuid) from public;
grant execute on function cc_private.is_staff(uuid,boolean), cc_private.is_client(uuid,uuid) to authenticated;

alter table public.cc_companies enable row level security;
alter table public.cc_clients enable row level security;
alter table public.cc_memberships enable row level security;
alter table public.cc_records enable row level security;
alter table public.cc_integrations enable row level security;
alter table public.cc_audit enable row level security;
create policy memberships_self on public.cc_memberships for select to authenticated using(user_id=(select auth.uid()));
create policy companies_member on public.cc_companies for select to authenticated using(exists(select 1 from public.cc_memberships m where m.user_id=(select auth.uid()) and m.company_id=id));
create policy clients_read on public.cc_clients for select to authenticated using(cc_private.is_staff(company_id) or cc_private.is_client(company_id,id));
create policy clients_insert on public.cc_clients for insert to authenticated with check(cc_private.is_staff(company_id));
create policy clients_update on public.cc_clients for update to authenticated using(cc_private.is_staff(company_id)) with check(cc_private.is_staff(company_id));
create policy records_read on public.cc_records for select to authenticated using(
 cc_private.is_staff(company_id,kind in ('staff','vault_reference'))
 or (visibility='shared' and not archived and cc_private.is_client(company_id,client_id))
);
create policy records_insert on public.cc_records for insert to authenticated with check(cc_private.is_staff(company_id,kind in ('staff','vault_reference')) and created_by=(select auth.uid()) and revision=1);
create policy records_update on public.cc_records for update to authenticated using(cc_private.is_staff(company_id,kind in ('staff','vault_reference'))) with check(cc_private.is_staff(company_id,kind in ('staff','vault_reference')));
create policy integrations_read on public.cc_integrations for select to authenticated using(cc_private.is_staff(company_id,true));
create policy integrations_update on public.cc_integrations for update to authenticated using(cc_private.is_staff(company_id,true)) with check(cc_private.is_staff(company_id,true));
create policy audit_read on public.cc_audit for select to authenticated using(cc_private.is_staff(company_id,true));
revoke all on public.cc_companies,public.cc_memberships,public.cc_clients,public.cc_records,public.cc_integrations,public.cc_audit from anon,authenticated;
grant select on public.cc_companies,public.cc_memberships,public.cc_clients,public.cc_records,public.cc_integrations,public.cc_audit to authenticated;
grant insert on public.cc_clients,public.cc_records to authenticated;
grant update(name) on public.cc_clients to authenticated;
grant update(title,payload,visibility,revision,archived) on public.cc_records to authenticated;
grant update(monthly_limit_cents,timeout_seconds) on public.cc_integrations to authenticated;

create function cc_private.audit_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 if TG_OP='UPDATE' then
  if new.revision<>old.revision+1 then raise exception 'Revision must advance once'; end if;
  new.updated_at:=now();
 end if;
 insert into public.cc_audit(company_id,actor,record_id,operation,revision) values(new.company_id,auth.uid(),new.id,TG_OP,new.revision);
 return new;
end $$;
revoke all on function cc_private.audit_record() from public,anon,authenticated;
create trigger audit_records before insert or update on public.cc_records for each row execute function cc_private.audit_record();

create function public.cc_update_record(record_id uuid, expected_revision int, new_title text, new_payload jsonb, new_visibility text, new_archived boolean)
returns public.cc_records language plpgsql security invoker set search_path='' as $$
declare r public.cc_records;
begin
 update public.cc_records set title=new_title,payload=new_payload,visibility=new_visibility,archived=new_archived,revision=expected_revision+1
 where id=record_id and revision=expected_revision returning * into r;
 if r.id is null then raise exception using errcode='40001',message='Record changed or unavailable'; end if;
 return r;
end $$;
revoke all on function public.cc_update_record(uuid,int,text,jsonb,text,boolean) from public,anon;
grant execute on function public.cc_update_record(uuid,int,text,jsonb,text,boolean) to authenticated;

insert into public.cc_companies(id,name) values('b1000000-0000-4000-8000-000000000001','Blendd'),('b1000000-0000-4000-8000-000000000002','UP');
insert into public.cc_integrations(company_id,provider) select id,provider from public.cc_companies cross join unnest(array['supabase','moloni','email','otp','google_ads','meta','whatsapp','google_voice']) as provider;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cc-private','cc-private',false,5242880,array['application/pdf','image/jpeg','image/png']);
-- No object policies: uploads and downloads remain closed until the validated server pipeline is installed.
commit;
