create policy "Anyone can delete issues"
on public.issues for delete
to anon, authenticated
using (true);
