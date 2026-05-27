alter table public.scrutiny_cases enable row level security;
alter table public.swift_drafts enable row level security;

drop policy if exists "Allow authenticated read scrutiny cases" on public.scrutiny_cases;
drop policy if exists "Allow authenticated update scrutiny cases" on public.scrutiny_cases;
drop policy if exists "Allow authenticated insert swift drafts" on public.swift_drafts;
drop policy if exists "Allow authenticated read swift drafts" on public.swift_drafts;

create policy "Allow authenticated read scrutiny cases"
on public.scrutiny_cases
for select
to authenticated
using (true);

create policy "Allow authenticated update scrutiny cases"
on public.scrutiny_cases
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated insert swift drafts"
on public.swift_drafts
for insert
to authenticated
with check (true);

create policy "Allow authenticated read swift drafts"
on public.swift_drafts
for select
to authenticated
using (true);
