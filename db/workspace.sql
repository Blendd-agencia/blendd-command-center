begin;
create table public.cc_workspace_states(scope text primary key check(scope in ('Blendd','UP','global','vault')),payload jsonb not null default '{}' check(octet_length(payload::text)<=2000000),revision int not null default 1,updated_at timestamptz not null default now());
create table public.cc_workspace_operations(id uuid primary key,actor uuid not null references auth.users on delete cascade,revisions jsonb not null,created_at timestamptz not null default now());
create index cc_workspace_operations_actor on public.cc_workspace_operations(actor);
create table public.cc_workspace_history(id bigint generated always as identity primary key,scope text not null,revision int not null,payload jsonb not null,actor uuid references auth.users on delete set null,at timestamptz not null default now());
create index cc_workspace_history_scope on public.cc_workspace_history(scope,revision desc);
create index cc_workspace_history_actor on public.cc_workspace_history(actor);
create function cc_private.is_workspace_admin() returns boolean language sql stable security invoker set search_path='' as $$select auth.uid() is not null and (select count(*) from public.cc_memberships where user_id=auth.uid() and role='admin' and company_id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002'))=2$$;
revoke all on function cc_private.is_workspace_admin() from public,anon; grant execute on function cc_private.is_workspace_admin() to authenticated;
alter table public.cc_workspace_states enable row level security;
alter table public.cc_workspace_operations enable row level security;
alter table public.cc_workspace_history enable row level security;
create policy workspace_read on public.cc_workspace_states for select to authenticated using(cc_private.is_workspace_admin());
create policy workspace_update on public.cc_workspace_states for update to authenticated using(cc_private.is_workspace_admin()) with check(cc_private.is_workspace_admin());
create policy operations_read on public.cc_workspace_operations for select to authenticated using(actor=(select auth.uid()) and cc_private.is_workspace_admin());
create policy operations_insert on public.cc_workspace_operations for insert to authenticated with check(actor=(select auth.uid()) and cc_private.is_workspace_admin());
create policy history_read on public.cc_workspace_history for select to authenticated using(cc_private.is_workspace_admin());
revoke all on public.cc_workspace_states,public.cc_workspace_operations,public.cc_workspace_history from anon,authenticated;
grant select on public.cc_workspace_states,public.cc_workspace_operations,public.cc_workspace_history to authenticated;
grant update(payload,revision) on public.cc_workspace_states to authenticated;
grant insert on public.cc_workspace_operations to authenticated;
create function cc_private.workspace_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.cc_memberships where user_id=auth.uid() and role='admin') then raise exception 'Authenticated administrator required'; end if;
 if new.revision<>old.revision+1 then raise exception 'Invalid revision'; end if;
 insert into public.cc_workspace_history(scope,revision,payload,actor) values(old.scope,old.revision,old.payload,auth.uid());
 new.updated_at:=now();return new;
end $$;
revoke all on function cc_private.workspace_history() from public,anon,authenticated;
create trigger workspace_history before update on public.cc_workspace_states for each row execute function cc_private.workspace_history();
create function public.cc_save_workspace(changes jsonb,operation_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; result jsonb:='{}'; rev int; prior jsonb;
begin
 if not cc_private.is_workspace_admin() then raise exception using errcode='42501',message='Administrator required'; end if;
 -- Serialize all workspace transactions, including retries of the same operation.
 perform 1 from public.cc_workspace_states where scope='global' for update;
 select revisions into prior from public.cc_workspace_operations where id=operation_id and actor=auth.uid();
 if prior is not null then return prior; end if;
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes) not between 1 and 4 then raise exception 'Invalid changes'; end if;
 if (select count(distinct x->>'scope') from jsonb_array_elements(changes) x)<>jsonb_array_length(changes) then raise exception 'Repeated scope'; end if;
 for item in select value from jsonb_array_elements(changes) order by value->>'scope' loop
  if item->>'scope' not in ('Blendd','UP','global','vault') or jsonb_typeof(item->'payload') not in ('object','null') then raise exception 'Invalid scope'; end if;
  update public.cc_workspace_states set payload=item->'payload',revision=revision+1 where scope=item->>'scope' and revision=(item->>'revision')::int returning revision into rev;
  if not found then raise exception using errcode='40001',message='Workspace changed; reload required'; end if;
  result:=result||jsonb_build_object(item->>'scope',rev);
 end loop;
 insert into public.cc_workspace_operations(id,actor,revisions) values(operation_id,auth.uid(),result);
 return result;
end $$;
revoke all on function public.cc_save_workspace(jsonb,uuid) from public,anon;grant execute on function public.cc_save_workspace(jsonb,uuid) to authenticated;
insert into public.cc_workspace_states(scope,payload) values('Blendd','{}'),('UP','{}'),('global','{}'),('vault','null');
commit;
