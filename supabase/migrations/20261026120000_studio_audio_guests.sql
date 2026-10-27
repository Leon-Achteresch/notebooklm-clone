alter type public.note_kind add value if not exists 'slides';
alter type public.note_kind add value if not exists 'table';

alter table public.users alter column email drop not null;

alter table public.notebooks add column featured boolean not null default false;

create index notebooks_featured_idx on public.notebooks (featured) where featured;

create or replace function public.guard_notebook_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;
  if new.is_public <> old.is_public and old.owner_id <> (select auth.uid()) then
    raise exception 'only the owner can change sharing';
  end if;
  if new.featured <> old.featured and (select auth.uid()) is not null then
    raise exception 'featured cannot be changed';
  end if;
  return new;
end;
$$;

create function public.guard_notebook_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.featured := false;
  end if;
  return new;
end;
$$;

create trigger guard_notebook_insert
  before insert on public.notebooks
  for each row execute function public.guard_notebook_insert();

create or replace function public.consume_ai_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_limit constant integer := case
    when coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then 40
    else 200
  end;
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio', 'studio', false, 26214400, array['audio/mpeg']);

create policy "Read studio files" on storage.objects for select to authenticated
  using (bucket_id = 'studio'
    and public.notebook_role(((storage.foldername(name))[1])::uuid) is not null);
create policy "Upload studio files" on storage.objects for insert to authenticated
  with check (bucket_id = 'studio'
    and public.can_edit_notebook(((storage.foldername(name))[1])::uuid));
create policy "Delete studio files" on storage.objects for delete to authenticated
  using (bucket_id = 'studio'
    and public.can_edit_notebook(((storage.foldername(name))[1])::uuid));

create table public.tts_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  notebook_id uuid references public.notebooks (id) on delete set null,
  characters integer not null check (characters > 0),
  credits integer not null check (credits >= 0),
  model text not null,
  created_at timestamptz not null default now()
);

create index tts_usage_user_created_idx on public.tts_usage (user_id, created_at);
create index tts_usage_notebook_id_idx on public.tts_usage (notebook_id);

alter table public.tts_usage enable row level security;

create function public.claim_tts(nid uuid, chars integer, credits integer, model text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  budget constant integer := 3000;
  per_claim constant integer := 2500;
  daily constant integer := case
    when coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then 3
    else 10
  end;
  claim uuid;
begin
  if public.notebook_role(nid) is null then
    raise exception 'Kein Zugriff auf dieses Notebook';
  end if;
  if chars < 1 or credits < 0 or credits > per_claim then
    raise exception 'Ungültige Audio-Anfrage';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.tts_usage'));
  if (select count(*) from public.tts_usage u
      where u.user_id = (select auth.uid()) and u.created_at > now() - interval '1 day') >= daily then
    return null;
  end if;
  if (select coalesce(sum(u.credits), 0) from public.tts_usage u) + credits > budget then
    return null;
  end if;
  insert into public.tts_usage (notebook_id, characters, credits, model)
  values (nid, chars, credits, model)
  returning id into claim;
  return claim;
end;
$$;

revoke execute on function public.claim_tts(uuid, integer, integer, text) from anon, public;
grant execute on function public.claim_tts(uuid, integer, integer, text) to authenticated;
revoke execute on function public.guard_notebook_insert() from anon, authenticated, public;
