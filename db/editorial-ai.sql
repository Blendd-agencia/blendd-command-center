begin;
create table public.cc_ai_jobs (
 id uuid primary key, actor uuid not null references auth.users, client_id text not null,
 post_id text not null, context_hash text not null, model text not null,
 status text not null default 'running' check(status in ('running','complete','failed')),
 result jsonb, error text, usage jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.cc_ai_jobs enable row level security;
revoke all on public.cc_ai_jobs from public,anon,authenticated;
grant select on public.cc_ai_jobs to authenticated;
create policy ai_jobs_admin_read on public.cc_ai_jobs for select to authenticated using(cc_private.is_workspace_admin());
create index cc_ai_jobs_created on public.cc_ai_jobs(created_at);
create index cc_ai_jobs_actor on public.cc_ai_jobs(actor);
create function cc_private.reserve_ai(job_id uuid,client text,post text,context text,model_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cc_ai_jobs;
begin
 if auth.uid() is null or not cc_private.is_workspace_admin() then raise exception using errcode='42501',message='Administrator required'; end if;
 if length(client)>100 or length(post)>100 or context !~ '^[a-f0-9]{64}$' or model_name<>'openai/gpt-4.1' then raise exception 'Invalid request'; end if;
 perform 1 from public.cc_workspace_states where scope='global' for update;
 select * into r from public.cc_ai_jobs where id=job_id;
 if found then
  if r.actor<>auth.uid() or r.client_id<>client or r.post_id<>post or r.context_hash<>context then raise exception using errcode='40001',message='Request changed'; end if;
  return jsonb_build_object('fresh',false,'job',to_jsonb(r));
 end if;
 select * into r from public.cc_ai_jobs where post_id=post and client_id=client and status='running' and created_at>now()-interval '2 minutes' order by created_at desc limit 1;
 if found then return jsonb_build_object('fresh',false,'job',to_jsonb(r)); end if;
 if (select count(*) from public.cc_ai_jobs where created_at>=date_trunc('month',now()))>=20 then raise exception using errcode='P0001',message='Monthly AI test limit reached'; end if;
 if (select count(*) from public.cc_ai_jobs where created_at>now()-interval '1 minute')>=3 then raise exception using errcode='P0001',message='AI rate limit reached'; end if;
 insert into public.cc_ai_jobs(id,actor,client_id,post_id,context_hash,model) values(job_id,auth.uid(),client,post,context,model_name) returning * into r;
 return jsonb_build_object('fresh',true,'job',to_jsonb(r));
end $$;
create function public.cc_reserve_ai(job_id uuid,client text,post text,context text,model_name text) returns jsonb language sql security invoker set search_path='' as $$select cc_private.reserve_ai(job_id,client,post,context,model_name)$$;
create function cc_private.finish_ai(job_id uuid,output jsonb,failure text,metrics jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not cc_private.is_workspace_admin() then raise exception using errcode='42501',message='Administrator required'; end if;
 if length(coalesce(output::text,''))>60000 or length(coalesce(failure,''))>1000 or length(coalesce(metrics::text,''))>2000 then raise exception 'Result too large'; end if;
 update public.cc_ai_jobs set status=case when failure is null then 'complete' else 'failed' end,result=output,error=failure,usage=metrics,completed_at=now() where id=job_id and actor=auth.uid() and status='running';
end $$;
create function public.cc_finish_ai(job_id uuid,output jsonb,failure text,metrics jsonb) returns void language sql security invoker set search_path='' as $$select cc_private.finish_ai(job_id,output,failure,metrics)$$;
revoke all on function cc_private.reserve_ai(uuid,text,text,text,text),public.cc_reserve_ai(uuid,text,text,text,text),cc_private.finish_ai(uuid,jsonb,text,jsonb),public.cc_finish_ai(uuid,jsonb,text,jsonb) from public,anon;
grant execute on function cc_private.reserve_ai(uuid,text,text,text,text),public.cc_reserve_ai(uuid,text,text,text,text),cc_private.finish_ai(uuid,jsonb,text,jsonb),public.cc_finish_ai(uuid,jsonb,text,jsonb) to authenticated;
commit;
