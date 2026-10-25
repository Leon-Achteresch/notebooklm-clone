alter table public.notebooks add column guide jsonb;
alter table public.sources add column summary text;

create function public.reset_notebook_guide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notebooks set guide = null
  where id = coalesce(new.notebook_id, old.notebook_id) and guide is not null;
  return null;
end;
$$;

revoke execute on function public.reset_notebook_guide() from anon, authenticated, public;

create trigger reset_notebook_guide
  after insert or delete or update of selected, content on public.sources
  for each row execute function public.reset_notebook_guide();
