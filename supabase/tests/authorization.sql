do $$
declare
  owner uuid := (select id from auth.users where email = 'owner@nbtest.dev');
  other uuid := (select id from auth.users where email = 'viewer@nbtest.dev');
  nb uuid;
  featured_nb uuid;
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

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    update public.notebooks set featured = true where id = nb;
    assert false, 'owners must not feature notebooks';
  exception when raise_exception then null;
  end;
  insert into public.notebooks (owner_id, title, featured) values (owner, 'featured attempt', true) returning id into featured_nb;
  assert not (select featured from public.notebooks where id = featured_nb), 'insert cannot feature a notebook';

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  delete from public.ai_usage where user_id = other;
  select public.consume_ai_quota() into remaining;
  assert remaining = 39, 'guests get 40 requests per day';

  delete from public.tts_usage where user_id = other;
  assert public.claim_tts(nb, 10, 1, 'test') is not null, 'guest audio claim';
  assert public.claim_tts(nb, 10, 1, 'test') is not null, 'second guest audio claim';
  assert public.claim_tts(nb, 10, 1, 'test') is not null, 'third guest audio claim';
  assert public.claim_tts(nb, 10, 1, 'test') is null, 'guests get three audio claims per day';
  begin
    perform public.claim_tts(nb, 10, 2501, 'test');
    assert false, 'oversized audio claim must fail';
  exception when raise_exception then null;
  end;
  begin
    perform public.claim_tts(gen_random_uuid(), 10, 1, 'test');
    assert false, 'audio claim needs notebook access';
  exception when raise_exception then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  insert into public.tts_usage (user_id, notebook_id, characters, credits, model)
  values (other, nb, 1, greatest(0, 3000 - (select coalesce(sum(credits), 0) from public.tts_usage)), 'test');
  assert public.claim_tts(nb, 10, 1, 'test') is null, 'global budget caps audio';

  update auth.users set is_anonymous = true where id = owner;
  insert into public.ai_usage (user_id, requests) values (owner, 500)
    on conflict (user_id, day) do update set requests = public.ai_usage.requests + 500;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    perform public.consume_ai_quota();
    assert false, 'guests share a daily cap';
  exception when raise_exception then
    assert sqlerrm like 'Der Gastzugang%', sqlerrm;
  end;
  update public.ai_usage set requests = requests + 2000 where user_id = owner and day = current_date;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  begin
    perform public.consume_ai_quota();
    assert false, 'all users share a daily cap';
  exception when raise_exception then
    assert sqlerrm like 'Folio ist%', sqlerrm;
  end;

  delete from public.users where id = other;
  assert (select sum(credits) from public.tts_usage) >= 3000, 'deleting a user keeps the audio ledger';

  raise exception 'ALL_OK';
end $$;
