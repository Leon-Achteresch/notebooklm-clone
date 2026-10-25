alter table public.notes
  add column status text not null default 'ready' check (status in ('pending', 'ready', 'failed')),
  add column error text;

alter publication supabase_realtime add table public.notes, public.sources;

create table public.ai_usage (
  user_id uuid not null references public.users (id) on delete cascade,
  day date not null default current_date,
  requests integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

create policy "Read own usage" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

create function public.consume_ai_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_limit constant integer := 200;
  used integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.ai_usage (user_id, day, requests)
  values ((select auth.uid()), current_date, 1)
  on conflict (user_id, day) do update set requests = public.ai_usage.requests + 1
  returning requests into used;
  if used > daily_limit then
    raise exception 'Tageslimit von % KI-Anfragen erreicht. Morgen geht es weiter.', daily_limit;
  end if;
  return daily_limit - used;
end;
$$;

revoke execute on function public.consume_ai_quota() from anon, public;
grant execute on function public.consume_ai_quota() to authenticated;
