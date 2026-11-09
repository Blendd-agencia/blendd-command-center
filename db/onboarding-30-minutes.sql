create or replace function cc_private.staff_fields(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p)
 where key=any(array['name','address','postal','city','birth','nif','niss','iban','bank','maritalStatus','dependants','email','phone','cc','ccExpiry']);
$$;

create or replace function cc_private.staff_valid(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
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
 if coalesce(p->>'ccExpiry','')<>'' then
  if p->>'ccExpiry'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  perform (p->>'ccExpiry')::date;
 end if;
 return true;
exception when others then return false;
end $$;

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
