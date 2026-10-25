do $$
declare
  owner uuid := (select id from auth.users where email = 'owner@nbtest.dev');
  other uuid := (select id from auth.users where email = 'viewer@nbtest.dev');
  nb uuid;
  remaining int;
  visible int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  insert into public.notebooks (owner_id, title) values (owner, 'authz test') returning id into nb;
  insert into public.sources (notebook_id, kind, title, content) values (nb, 'text', 't', 'x');

  assert public.notebook_role(nb) = 'owner', 'owner role';
  assert public.can_edit_notebook(nb), 'owner can edit';

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  assert public.notebook_role(nb) is null, 'stranger has no role';
  assert not public.can_edit_notebook(nb), 'stranger cannot edit';

  set local role authenticated;
  select count(*) into visible from public.sources where notebook_id = nb;
  assert visible = 0, 'RLS hides sources from strangers';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform public.invite_member(nb, 'viewer@nbtest.dev', 'viewer');

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  assert public.notebook_role(nb) = 'viewer', 'invited viewer';
  assert not public.can_edit_notebook(nb), 'viewer cannot edit';

  set local role authenticated;
  select count(*) into visible from public.sources where notebook_id = nb;
  assert visible = 1, 'viewer reads sources';
  begin
    perform public.invite_member(nb, 'owner@nbtest.dev', 'editor');
    assert false, 'viewer must not invite';
  exception when raise_exception then null;
  end;
  reset role;

  update public.notebook_members set role = 'editor' where notebook_id = nb and user_id = other;
  assert public.can_edit_notebook(nb), 'editor can edit';

  delete from public.ai_usage where user_id = other;
  select public.consume_ai_quota() into remaining;
  assert remaining = 199, 'quota counts down';
  update public.ai_usage set requests = 200 where user_id = other;
  begin
    perform public.consume_ai_quota();
    assert false, 'quota must block request 201';
  exception when raise_exception then null;
  end;

  raise exception 'ALL_OK';
end $$;
