begin;
create table public.cc_workspace_files(id text primary key check(id ~ '^[A-Za-z0-9_-]{1,100}$'),company_id uuid not null references public.cc_companies,name text not null check(length(name) between 1 and 200),mime text not null check(mime in ('application/pdf','image/png','image/jpeg')),size integer not null check(size between 1 and 3145728),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),path text not null unique,ready boolean not null default false,created_by uuid not null references auth.users,created_at timestamptz not null default now());
create index cc_workspace_files_company on public.cc_workspace_files(company_id);
create index cc_workspace_files_user on public.cc_workspace_files(created_by);
alter table public.cc_workspace_files enable row level security;
revoke all on public.cc_workspace_files from public,anon,authenticated;
grant select on public.cc_workspace_files to authenticated;
grant all on public.cc_workspace_files to service_role;
create policy workspace_files_read on public.cc_workspace_files for select to authenticated using(cc_private.is_workspace_admin());
create function cc_private.reserve_file(file_id text,company uuid,file_name text,file_mime text,file_size int,file_hash text) returns public.cc_workspace_files language plpgsql security definer set search_path='' as $$
declare r public.cc_workspace_files;
begin
 if auth.uid() is null or not cc_private.is_workspace_admin() then raise exception using errcode='42501',message='Administrator required'; end if;
 perform 1 from public.cc_workspace_states where scope='global' for update;
 select * into r from public.cc_workspace_files where id=file_id;
 if r.id is not null then
  if r.sha256<>file_hash or r.company_id<>company then raise exception using errcode='40001',message='File ID already used'; end if;
  return r;
 end if;
 if (select coalesce(sum(size),0) from public.cc_workspace_files)+file_size>104857600 then raise exception 'File quota reached'; end if;
 insert into public.cc_workspace_files(id,company_id,name,mime,size,sha256,path,created_by) values(file_id,company,file_name,file_mime,file_size,file_hash,company::text||'/'||file_id,auth.uid()) returning * into r;
 return r;
end $$;
revoke all on function cc_private.reserve_file(text,uuid,text,text,int,text) from public,anon;grant execute on function cc_private.reserve_file(text,uuid,text,text,int,text) to authenticated;
create function public.cc_reserve_file(file_id text,company uuid,file_name text,file_mime text,file_size int,file_hash text) returns public.cc_workspace_files language sql security invoker set search_path='' as $$select cc_private.reserve_file(file_id,company,file_name,file_mime,file_size,file_hash)$$;
revoke all on function public.cc_reserve_file(text,uuid,text,text,int,text) from public,anon;grant execute on function public.cc_reserve_file(text,uuid,text,text,int,text) to authenticated;
commit;
