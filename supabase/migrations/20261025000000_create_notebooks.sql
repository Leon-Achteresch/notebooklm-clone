create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  title text not null default 'Unbenanntes Notebook',
  instructions text not null default '',
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create index notebooks_owner_id_idx on public.notebooks (owner_id);

create table public.notebook_members (
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer', 'editor')),
  primary key (notebook_id, user_id)
);

create index notebook_members_user_id_idx on public.notebook_members (user_id);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  kind text not null check (kind in ('text', 'url', 'pdf')),
  title text not null,
  content text not null default '',
  url text,
  storage_path text,
  selected boolean not null default true,
  created_at timestamptz not null default now()
);

create index sources_notebook_id_idx on public.sources (notebook_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  kind text not null default 'note'
    check (kind in ('note', 'report', 'flashcards', 'quiz', 'mindmap', 'audio')),
  title text not null,
  content text not null default '',
  data jsonb,
  created_by uuid default auth.uid() references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index notes_notebook_id_idx on public.notes (notebook_id);
create index notes_created_by_idx on public.notes (created_by);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index messages_notebook_user_idx on public.messages (notebook_id, user_id, created_at);
create index messages_user_id_idx on public.messages (user_id);

create function public.notebook_role(nid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when n.owner_id = (select auth.uid()) then 'owner'
    else coalesce(
      (select m.role from public.notebook_members m
        where m.notebook_id = n.id and m.user_id = (select auth.uid())),
      case when n.is_public then 'viewer' end
    )
  end
  from public.notebooks n
  where n.id = nid
$$;

create function public.can_edit_notebook(nid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.notebook_role(nid) in ('owner', 'editor'), false)
$$;

create function public.guard_notebook_update()
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
  return new;
end;
$$;

create trigger guard_notebook_update
  before update on public.notebooks
  for each row execute function public.guard_notebook_update();

create function public.invite_member(nid uuid, member_email text, member_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if public.notebook_role(nid) is distinct from 'owner' then
    raise exception 'only the owner can invite';
  end if;
  if member_role not in ('viewer', 'editor') then
    raise exception 'invalid role';
  end if;
  select id into target from public.users where lower(email) = lower(trim(member_email));
  if target is null then
    raise exception 'Kein Konto mit dieser E-Mail gefunden';
  end if;
  if target = (select auth.uid()) then
    raise exception 'Du bist bereits Eigentümer';
  end if;
  insert into public.notebook_members (notebook_id, user_id, email, role)
  values (nid, target, lower(trim(member_email)), member_role)
  on conflict (notebook_id, user_id) do update set role = excluded.role;
end;
$$;

revoke execute on function public.notebook_role(uuid) from anon, public;
revoke execute on function public.can_edit_notebook(uuid) from anon, public;
revoke execute on function public.invite_member(uuid, text, text) from anon, public;
grant execute on function public.notebook_role(uuid) to authenticated;
grant execute on function public.can_edit_notebook(uuid) to authenticated;
grant execute on function public.invite_member(uuid, text, text) to authenticated;

alter table public.notebooks enable row level security;
alter table public.notebook_members enable row level security;
alter table public.sources enable row level security;
alter table public.notes enable row level security;
alter table public.messages enable row level security;

create policy "Read accessible notebooks" on public.notebooks for select to authenticated
  using (owner_id = (select auth.uid()) or public.notebook_role(id) is not null);
create policy "Create own notebooks" on public.notebooks for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Editors update notebooks" on public.notebooks for update to authenticated
  using (public.can_edit_notebook(id));
create policy "Owners delete notebooks" on public.notebooks for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owner and self read members" on public.notebook_members for select to authenticated
  using (user_id = (select auth.uid()) or public.notebook_role(notebook_id) = 'owner');
create policy "Owner removes members, members leave" on public.notebook_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.notebook_role(notebook_id) = 'owner');

create policy "Read sources" on public.sources for select to authenticated
  using (public.notebook_role(notebook_id) is not null);
create policy "Insert sources" on public.sources for insert to authenticated
  with check (public.can_edit_notebook(notebook_id));
create policy "Update sources" on public.sources for update to authenticated
  using (public.can_edit_notebook(notebook_id));
create policy "Delete sources" on public.sources for delete to authenticated
  using (public.can_edit_notebook(notebook_id));

create policy "Read notes" on public.notes for select to authenticated
  using (public.notebook_role(notebook_id) is not null);
create policy "Insert notes" on public.notes for insert to authenticated
  with check (public.can_edit_notebook(notebook_id));
create policy "Update notes" on public.notes for update to authenticated
  using (public.can_edit_notebook(notebook_id));
create policy "Delete notes" on public.notes for delete to authenticated
  using (public.can_edit_notebook(notebook_id));

create policy "Read own messages" on public.messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Insert own messages" on public.messages for insert to authenticated
  with check (user_id = (select auth.uid()) and public.notebook_role(notebook_id) is not null);
create policy "Delete own messages" on public.messages for delete to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 31457280, array['application/pdf']);

create policy "Read source files" on storage.objects for select to authenticated
  using (bucket_id = 'sources'
    and public.notebook_role(((storage.foldername(name))[1])::uuid) is not null);
create policy "Upload source files" on storage.objects for insert to authenticated
  with check (bucket_id = 'sources'
    and public.can_edit_notebook(((storage.foldername(name))[1])::uuid));
create policy "Delete source files" on storage.objects for delete to authenticated
  using (bucket_id = 'sources'
    and public.can_edit_notebook(((storage.foldername(name))[1])::uuid));

revoke execute on function public.handle_new_user() from anon, authenticated, public;
