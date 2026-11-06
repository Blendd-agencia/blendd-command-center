begin;
create function cc_private.consume_request() returns boolean language plpgsql security definer set search_path='' as $$
declare count_used int; window_start timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if auth.uid() is null or not exists(select 1 from public.cc_memberships where user_id=auth.uid()) then return false; end if;
 insert into cc_private.request_windows(user_id,bucket,requests) values(auth.uid(),window_start,1)
 on conflict(user_id) do update set bucket=excluded.bucket,requests=case when request_windows.bucket=excluded.bucket then request_windows.requests+1 else 1 end returning requests into count_used;
 return count_used<=120;
end $$;
revoke all on function cc_private.consume_request() from public,anon;
grant execute on function cc_private.consume_request() to authenticated;
create function public.cc_consume_request() returns boolean language sql security invoker set search_path='' as $$select cc_private.consume_request()$$;
revoke all on function public.cc_consume_request() from public,anon;
grant execute on function public.cc_consume_request() to authenticated;
commit;
