create or replace function public.delete_participant_as_host(
  p_room_id uuid,
  p_participant_id uuid,
  p_host_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.rooms
    where id = p_room_id
      and host_token = p_host_token
  ) then
    raise exception 'Only room hosts can delete participants'
      using errcode = '42501';
  end if;

  delete from public.participants
  where id = p_participant_id
    and room_id = p_room_id;
end;
$$;

grant execute on function public.delete_participant_as_host(uuid, uuid, text)
to anon, authenticated;
