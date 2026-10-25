create or replace function public.notebook_role(nid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when n.owner_id = (select auth.uid()) then 'owner'
    else coalesce(
      (select m.role::text from public.notebook_members m
        where m.notebook_id = n.id and m.user_id = (select auth.uid())),
      case when n.is_public then 'viewer' end
    )
  end
  from public.notebooks n
  where n.id = nid
$$;
