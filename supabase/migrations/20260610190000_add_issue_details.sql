alter table public.issues
  add column if not exists description text not null default '',
  add column if not exists link text not null default '';
