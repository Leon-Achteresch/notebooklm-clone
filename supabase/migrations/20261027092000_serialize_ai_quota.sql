create or replace function public.consume_ai_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  guest constant boolean := coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
  daily_limit constant integer := case when guest then 40 else 200 end;
  used integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.ai_usage'));
  if (select coalesce(sum(a.requests), 0) from public.ai_usage a where a.day = current_date) >= 2000 then
    raise exception 'Folio ist für heute ausgelastet. Morgen geht es weiter.';
  end if;
  if guest and (select coalesce(sum(a.requests), 0) from public.ai_usage a
      join auth.users u on u.id = a.user_id
      where a.day = current_date and u.is_anonymous) >= 500 then
    raise exception 'Der Gastzugang ist für heute ausgelastet. Mit einem kostenlosen Konto geht es weiter.';
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
