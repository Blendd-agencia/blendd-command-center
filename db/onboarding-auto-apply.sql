-- Audit anonymous intake without impersonating an administrator. Validate the exact permitted delta.
create or replace function cc_private.workspace_history() returns trigger language plpgsql security definer set search_path='' as $$
declare inv cc_private.staff_invites%rowtype; people jsonb; intake text;
begin
 intake:=nullif(current_setting('cc.staff_submission',true),'');
 if intake is not null then
  select * into inv from cc_private.staff_invites where id=intake::uuid and scope=old.scope and status='submitted';
  if not found or not cc_private.staff_valid(inv.submission) then raise exception 'Invalid intake'; end if;
  if not exists(select 1 from jsonb_array_elements(old.payload->'staff') s where s->>'id'=inv.staff_id) then raise exception 'Staff missing'; end if;
  select jsonb_agg(case when s->>'id'=inv.staff_id then s||cc_private.staff_fields(inv.submission)||jsonb_build_object('personalDataConfirmed',true,'onboardingStatus','Confirmado','personalDataConfirmedAt',inv.submitted_at) else s end order by ord)
  into people from jsonb_array_elements(old.payload->'staff') with ordinality a(s,ord);
  if new.scope<>old.scope or new.payload<>jsonb_set(old.payload,'{staff}',people) then raise exception 'Invalid intake changes'; end if;
 elsif auth.uid() is null or not exists(select 1 from public.cc_memberships where user_id=auth.uid() and role='admin') then
  raise exception 'Authenticated administrator required';
 end if;
 if new.revision<>old.revision+1 then raise exception 'Invalid revision'; end if;
 insert into public.cc_workspace_history(scope,revision,payload,actor) values(old.scope,old.revision,old.payload,auth.uid());
 new.updated_at:=now();return new;
end $$;
revoke all on function cc_private.workspace_history() from public,anon,authenticated;

-- Apply only allowlisted personal fields; never salary, role, company or permissions.
-- Internal invoker helper: not callable by API roles, reached only after capability validation.
create or replace function cc_private.staff_apply_submission(invite_id uuid) returns void
language plpgsql set search_path='' as $$
declare inv cc_private.staff_invites%rowtype; p jsonb; people jsonb;
begin
 perform 1 from public.cc_workspace_states where scope='global' for update;
 select * into inv from cc_private.staff_invites where id=invite_id for update;
 if not found then raise exception 'Invite missing'; end if;
 if inv.status='applied' then return; end if;
 if inv.status<>'submitted' or not cc_private.staff_valid(inv.submission) then raise exception 'Valid submission required'; end if;
 select payload into p from public.cc_workspace_states where scope=inv.scope for update;
 if not exists(select 1 from jsonb_array_elements(p->'staff') s where s->>'id'=inv.staff_id) then raise exception 'Staff record missing'; end if;
 select jsonb_agg(case when s->>'id'=inv.staff_id then s||cc_private.staff_fields(inv.submission)||jsonb_build_object('personalDataConfirmed',true,'onboardingStatus','Confirmado','personalDataConfirmedAt',inv.submitted_at) else s end order by ord)
 into people from jsonb_array_elements(p->'staff') with ordinality a(s,ord);
 perform set_config('cc.staff_submission',inv.id::text,true);
 update public.cc_workspace_states set payload=jsonb_set(p,'{staff}',people),revision=revision+1 where scope=inv.scope;
 perform set_config('cc.staff_submission','',true);
 update cc_private.staff_invites set status='applied',applied_at=now(),delivery_code=null where id=inv.id;
end $$;
revoke all on function cc_private.staff_apply_submission(uuid) from public,anon,authenticated;

create or replace function cc_private.staff_guest(action text, token text, code text, session_token text, fields jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare inv cc_private.staff_invites%rowtype; invalid jsonb:='{"error":"Acesso indisponível. Confirme o código ou peça um novo convite."}';
begin
 if action='open' then
  if token is null or token!~'^[a-f0-9]{64}$' or session_token is null or session_token!~'^[a-f0-9]{64}$' then return invalid; end if;
  select * into inv from cc_private.staff_invites where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') for update;
  if not found or inv.status<>'pending' or inv.expires_at<=now() or inv.failed_attempts>=5 then return invalid; end if;
  if code is null or length(code)>40 or inv.code_hash<>encode(sha256(convert_to(token||':'||upper(code),'UTF8')),'hex') then
   update cc_private.staff_invites set failed_attempts=failed_attempts+1,status=case when failed_attempts>=4 then 'revoked' else status end,delivery_code=case when failed_attempts>=4 then null else delivery_code end where id=inv.id;
   return invalid;
  end if;
  update cc_private.staff_invites set status='opened',session_hash=encode(sha256(convert_to(session_token,'UTF8')),'hex'),session_expires=least(now()+interval '30 minutes',expires_at),delivery_code=null where id=inv.id;
  return jsonb_build_object('fields',inv.prefill,'expiresAt',least(now()+interval '30 minutes',inv.expires_at));
 end if;
 if session_token is null or session_token!~'^[a-f0-9]{64}$' then return invalid; end if;
 -- Same lock order as administrator writes: workspace, then invitation.
 if action='submit' then perform 1 from public.cc_workspace_states where scope='global' for update; end if;
 select * into inv from cc_private.staff_invites where session_hash=encode(sha256(convert_to(session_token,'UTF8')),'hex') for update;
 if not found then return invalid; end if;
 if action='submit' and inv.status in ('submitted','applied') and inv.session_expires>now() then return jsonb_build_object('ok',true); end if;
 if inv.status<>'opened' or inv.session_expires<=now() or inv.expires_at<=now() or inv.reads>=60 then return invalid; end if;
 if action='read' then
  update cc_private.staff_invites set reads=reads+1 where id=inv.id;
  return jsonb_build_object('fields',inv.prefill,'expiresAt',inv.session_expires);
 elsif action='submit' then
  if not cc_private.staff_valid(fields) then return jsonb_build_object('error','Verifique os dados preenchidos.'); end if;
  update cc_private.staff_invites set submission=fields,status='submitted',submitted_at=now(),delivery_code=null where id=inv.id;
  perform cc_private.staff_apply_submission(inv.id);
  return jsonb_build_object('ok',true);
 end if;
 return invalid;
end $$;
revoke all on function cc_private.staff_guest(text,text,text,text,jsonb) from public;
grant usage on schema cc_private to anon;
grant execute on function cc_private.staff_guest(text,text,text,text,jsonb) to anon,authenticated;
create or replace function public.cc_staff_guest(action text,token text default null,code text default null,session_token text default null,fields jsonb default null) returns jsonb language sql set search_path='' as $$select cc_private.staff_guest(action,token,code,session_token,fields)$$;
revoke all on function public.cc_staff_guest(text,text,text,text,jsonb) from public;
grant execute on function public.cc_staff_guest(text,text,text,text,jsonb) to anon,authenticated;
