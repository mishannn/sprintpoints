alter table public.issues
  add column archived_at timestamptz null;

create index issues_room_id_archived_at_position_idx
on public.issues(room_id, archived_at, position);
