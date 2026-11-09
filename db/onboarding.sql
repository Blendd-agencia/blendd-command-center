-- Capability-authenticated employee intake. No direct guest table access.
create table cc_private.staff_invites (
 id uuid primary key default gen_random_uuid(), scope text not null check(scope in ('Blendd','UP')),
 staff_id text not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '48 hours',
 token_hash text not null unique, code_hash text not null,
 status text not null default 'pending' check(status in ('pending','opened','submitted','applied','revoked')),
 failed_attempts integer not null default 0, reads integer not null default 0,
 session_hash text unique, session_expires timestamptz,
 prefill jsonb not null, submission jsonb, submitted_at timestamptz, applied_at timestamptz,
 delivery_code text
);
alter table cc_private.staff_invites enable row level security;
revoke all on cc_private.staff_invites from public,anon,authenticated;

create function cc_private.staff_fields(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p)
 where key=any(array['name','address','postal','city','birth','nif','niss','iban','bank','maritalStatus','dependants','email','phone']);
$$;
revoke all on function cc_private.staff_fields(jsonb) from public;

create function cc_private.staff_valid(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>6000 then return false; end if;
 if p<>cc_private.staff_fields(p) or length(trim(coalesce(p->>'name','')))<2 then return false; end if;
 for k,v in select key,value from jsonb_each(p) loop
  if k='dependants' then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text!~'^[0-9]{1,2}$') then return false; end if;
  elsif jsonb_typeof(v)<>'string' or length(v#>>'{}')>300 then return false;
  end if;
 end loop;
 if coalesce(p->>'nif','')<>'' and p->>'nif'!~'^[0-9]{9}$' then return false; end if;
 if coalesce(p->>'niss','')<>'' and p->>'niss'!~'^[0-9]{11}$' then return false; end if;
 if coalesce(p->>'iban','')<>'' and p->>'iban'!~'^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then return false; end if;
 if coalesce(p->>'birth','')<>'' then
  if p->>'birth'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  perform (p->>'birth')::date;
 end if;
 return true;
exception when others then return false;
end $$;
revoke all on function cc_private.staff_valid(jsonb) from public;

create function cc_private.staff_admin(action text, args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare inv cc_private.staff_invites%rowtype; token text; code text; rec jsonb; p jsonb; r int; result jsonb;
begin
 if auth.uid() is null or not cc_private.is_workspace_admin() then raise exception using errcode='42501',message='Administrator required'; end if;
 if not cc_private.consume_request() then return jsonb_build_object('error','Limite de pedidos atingido.'); end if;
 if action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'scope',scope,'staffId',staff_id,'name',prefill->>'name','status',status,'expiresAt',expires_at,'submittedAt',submitted_at,'submission',submission,'canReveal',delivery_code is not null) order by created_at desc),'[]'::jsonb) into result from cc_private.staff_invites;
  return result;
 end if;
 -- Workspace mutations always lock global first, as cc_save_workspace does.
 perform 1 from public.cc_workspace_states where scope='global' for update;
 if action='create' then
  if args->>'scope' not in ('Blendd','UP') then raise exception 'Invalid company'; end if;
  select s into rec from public.cc_workspace_states w,jsonb_array_elements(w.payload->'staff') s where w.scope=args->>'scope' and s->>'id'=args->>'staffId';
  if rec is null then raise exception 'Staff record missing'; end if;
  update cc_private.staff_invites set status='revoked',session_hash=null,delivery_code=null where scope=args->>'scope' and staff_id=args->>'staffId' and status in ('pending','opened');
  token:=encode(extensions.gen_random_bytes(32),'hex'); code:=upper(encode(extensions.gen_random_bytes(6),'hex'));
  insert into cc_private.staff_invites(scope,staff_id,created_by,token_hash,code_hash,prefill,delivery_code)
  values(args->>'scope',args->>'staffId',auth.uid(),encode(sha256(convert_to(token,'UTF8')),'hex'),encode(sha256(convert_to(token||':'||code,'UTF8')),'hex'),cc_private.staff_fields(rec),code) returning * into inv;
  return jsonb_build_object('id',inv.id,'token',token,'expiresAt',inv.expires_at);
 end if;
 select * into inv from cc_private.staff_invites where id=(args->>'id')::uuid for update;
 if not found then raise exception 'Invite missing'; end if;
 if action='reveal' then
  if inv.created_by<>auth.uid() or inv.status<>'pending' or inv.expires_at<=now() or inv.delivery_code is null then return jsonb_build_object('error','Código indisponível. Gere um novo convite.'); end if;
  code:=inv.delivery_code;
  update cc_private.staff_invites set delivery_code=null where id=inv.id;
  return jsonb_build_object('code',code);
 elsif action='revoke' then
  if inv.status in ('pending','opened') then update cc_private.staff_invites set status='revoked',session_hash=null,delivery_code=null where id=inv.id; end if;
  return jsonb_build_object('ok',true);
 elsif action='apply' then
  if inv.status='applied' then return jsonb_build_object('ok',true); end if;
  if inv.status<>'submitted' then raise exception 'Submission missing'; end if;
  select payload,revision into p,r from public.cc_workspace_states where scope=inv.scope for update;
  select s into rec from jsonb_array_elements(p->'staff') s where s->>'id'=inv.staff_id;
  if rec is null then raise exception 'Staff record missing'; end if;
  if cc_private.staff_fields(rec)<>inv.prefill then return jsonb_build_object('error','A ficha mudou depois do convite. Reveja as diferenças antes de importar.'); end if;
  select jsonb_agg(case when s->>'id'=inv.staff_id then s||inv.submission||jsonb_build_object('personalDataConfirmed',true,'onboardingStatus','Confirmado','personalDataConfirmedAt',inv.submitted_at) else s end order by ord) into rec from jsonb_array_elements(p->'staff') with ordinality a(s,ord);
  perform public.cc_save_workspace(jsonb_build_array(jsonb_build_object('scope',inv.scope,'revision',r,'payload',jsonb_set(p,'{staff}',rec))),gen_random_uuid());
  update cc_private.staff_invites set status='applied',applied_at=now() where id=inv.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Invalid action';
end $$;
revoke all on function cc_private.staff_admin(text,jsonb) from public;
grant execute on function cc_private.staff_admin(text,jsonb) to authenticated;
create function public.cc_staff_admin(action text,args jsonb default '{}') returns jsonb language sql set search_path='' as $$select cc_private.staff_admin(action,args)$$;
revoke all on function public.cc_staff_admin(text,jsonb) from public,anon;
grant execute on function public.cc_staff_admin(text,jsonb) to authenticated;

-- Guest access is authorised ONLY by unguessable capabilities plus a separate code.
-- No auth.uid impersonation and no access to the shared workspace from this function.
create function cc_private.staff_guest(action text, token text, code text, session_token text, fields jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  update cc_private.staff_invites set status='opened',session_hash=encode(sha256(convert_to(session_token,'UTF8')),'hex'),session_expires=least(now()+interval '15 minutes',expires_at),delivery_code=null where id=inv.id;
  return jsonb_build_object('fields',inv.prefill,'expiresAt',least(now()+interval '15 minutes',inv.expires_at));
 end if;
 if session_token is null or session_token!~'^[a-f0-9]{64}$' then return invalid; end if;
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
  return jsonb_build_object('ok',true);
 end if;
 return invalid;
end $$;
revoke all on function cc_private.staff_guest(text,text,text,text,jsonb) from public;
grant usage on schema cc_private to anon;
grant execute on function cc_private.staff_guest(text,text,text,text,jsonb) to anon,authenticated;
create function public.cc_staff_guest(action text,token text default null,code text default null,session_token text default null,fields jsonb default null) returns jsonb language sql set search_path='' as $$select cc_private.staff_guest(action,token,code,session_token,fields)$$;
revoke all on function public.cc_staff_guest(text,text,text,text,jsonb) from public;
grant execute on function public.cc_staff_guest(text,text,text,text,jsonb) to anon,authenticated;
