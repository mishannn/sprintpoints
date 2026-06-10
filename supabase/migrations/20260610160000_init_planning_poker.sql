create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_room_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i integer;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return code;
end;
$$;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_room_code(),
  name text not null check (char_length(name) between 1 and 120),
  host_token text not null,
  card_set text[] not null default array['0', '1', '2', '3', '5', '8', '13', '21', '?', 'Coffee'],
  revealed boolean not null default false,
  active_issue_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token text not null,
  is_spectator boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (room_id, token)
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '',
  link text not null default '',
  position integer not null default 1,
  estimate text null,
  created_at timestamptz not null default now()
);

alter table public.rooms
  add constraint rooms_active_issue_id_fkey
  foreign key (active_issue_id)
  references public.issues(id)
  on delete set null;

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  value text not null check (char_length(value) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (issue_id, participant_id)
);

create index participants_room_id_idx on public.participants(room_id);
create index issues_room_id_position_idx on public.issues(room_id, position);
create index votes_room_id_idx on public.votes(room_id);
create index votes_issue_id_idx on public.votes(issue_id);

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

create trigger votes_set_updated_at
before update on public.votes
for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.issues enable row level security;
alter table public.votes enable row level security;

create policy "Anyone can read rooms"
on public.rooms for select
to anon, authenticated
using (true);

create policy "Anyone can create rooms"
on public.rooms for insert
to anon, authenticated
with check (true);

create policy "Anyone with room access can update rooms"
on public.rooms for update
to anon, authenticated
using (true)
with check (true);

create policy "Anyone can read participants"
on public.participants for select
to anon, authenticated
using (true);

create policy "Anyone can join rooms"
on public.participants for insert
to anon, authenticated
with check (true);

create policy "Participants can refresh themselves"
on public.participants for update
to anon, authenticated
using (true)
with check (true);

create policy "Anyone can read issues"
on public.issues for select
to anon, authenticated
using (true);

create policy "Anyone can create issues"
on public.issues for insert
to anon, authenticated
with check (true);

create policy "Anyone can update issues"
on public.issues for update
to anon, authenticated
using (true)
with check (true);

create policy "Anyone can read votes"
on public.votes for select
to anon, authenticated
using (true);

create policy "Anyone can cast votes"
on public.votes for insert
to anon, authenticated
with check (true);

create policy "Anyone can update votes"
on public.votes for update
to anon, authenticated
using (true)
with check (true);

create policy "Anyone can reset votes"
on public.votes for delete
to anon, authenticated
using (true);

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.issues;
alter publication supabase_realtime add table public.votes;
