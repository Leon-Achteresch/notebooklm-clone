create type public.source_kind as enum ('text', 'url', 'pdf');
create type public.note_kind as enum ('note', 'report', 'flashcards', 'quiz', 'mindmap', 'audio');
create type public.job_status as enum ('pending', 'ready', 'failed');
create type public.member_role as enum ('viewer', 'editor');
create type public.message_role as enum ('user', 'assistant');

alter table public.sources drop constraint sources_kind_check;
alter table public.sources alter column kind type public.source_kind using kind::public.source_kind;

alter table public.notes drop constraint notes_kind_check;
alter table public.notes drop constraint notes_status_check;
alter table public.notes alter column kind drop default;
alter table public.notes alter column status drop default;
alter table public.notes alter column kind type public.note_kind using kind::public.note_kind;
alter table public.notes alter column status type public.job_status using status::public.job_status;
alter table public.notes alter column kind set default 'note';
alter table public.notes alter column status set default 'ready';

alter table public.notebook_members drop constraint notebook_members_role_check;
alter table public.notebook_members alter column role type public.member_role using role::public.member_role;

alter table public.messages drop constraint messages_role_check;
alter table public.messages alter column role type public.message_role using role::public.message_role;

create or replace function public.invite_member(nid uuid, member_email text, member_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if public.notebook_role(nid) is distinct from 'owner' then
    raise exception 'Nur Eigentümer können einladen';
  end if;
  if member_role not in ('viewer', 'editor') then
    raise exception 'Ungültige Rolle';
  end if;
  select id into target from public.users where lower(email) = lower(trim(member_email));
  if target is null then
    raise exception 'Kein Konto mit dieser E-Mail gefunden';
  end if;
  if target = (select auth.uid()) then
    raise exception 'Du bist bereits Eigentümer';
  end if;
  insert into public.notebook_members (notebook_id, user_id, email, role)
  values (nid, target, lower(trim(member_email)), member_role::public.member_role)
  on conflict (notebook_id, user_id) do update set role = excluded.role;
end;
$$;
