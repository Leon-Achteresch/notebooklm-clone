alter table public.notebooks
  add constraint notebooks_featured_public check (not featured or is_public);
