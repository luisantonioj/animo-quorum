-- Annual election-cycle pre-work.
-- Adds the active cycle anchor needed before app queries can safely filter
-- candidates and votes by academic year.

create table if not exists public."ElectionCycles" (
  id                uuid primary key default gen_random_uuid(),
  label             text not null unique,
  status            text not null default 'draft'
                      check (status in ('draft', 'active', 'closed', 'archived')),
  voting_start_time timestamptz,
  voting_end_time   timestamptz,
  is_miting_active  boolean default false,
  show_live_results boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create unique index if not exists one_active_cycle
  on public."ElectionCycles" (status)
  where status = 'active';

create or replace function public.active_cycle_id()
returns uuid
language sql
security definer
stable
as $$
  select id
  from public."ElectionCycles"
  where status = 'active'
  limit 1;
$$;

insert into public."ElectionCycles" (
  label,
  status,
  voting_start_time,
  voting_end_time,
  is_miting_active,
  show_live_results
)
select
  'SY 2025-2026',
  'active',
  s.voting_start_time,
  s.voting_end_time,
  coalesce(s.is_miting_active, false),
  coalesce(s.show_live_results, false)
from public."SystemSettings" s
where not exists (
  select 1 from public."ElectionCycles" where status = 'active'
)
and not exists (
  select 1 from public."ElectionCycles" where label = 'SY 2025-2026'
)
limit 1;

insert into public."ElectionCycles" (label, status)
select 'SY 2025-2026', 'active'
where not exists (
  select 1 from public."ElectionCycles" where status = 'active'
)
on conflict (label) do update
set status = 'active'
where not exists (
  select 1 from public."ElectionCycles" where status = 'active'
);

alter table public."Candidates"
  add column if not exists election_cycle_id uuid
  references public."ElectionCycles"(id) on delete restrict;

alter table public."Votes"
  add column if not exists election_cycle_id uuid
  references public."ElectionCycles"(id) on delete restrict;

update public."Candidates"
set election_cycle_id = public.active_cycle_id()
where election_cycle_id is null;

update public."Votes"
set election_cycle_id = public.active_cycle_id()
where election_cycle_id is null;

alter table public."Candidates"
  alter column election_cycle_id set not null;

alter table public."Votes"
  alter column election_cycle_id set not null;

-- Abstain submissions intentionally keep candidate_id null while preserving
-- one ballot decision per student/position/cycle.
alter table public."Votes"
  alter column candidate_id drop not null;

do $$
declare
  constraint_to_drop text;
begin
  select con.conname
    into constraint_to_drop
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'Votes'
    and con.contype = 'u'
    and array(
      select att.attname::text
      from unnest(con.conkey) with ordinality as cols(attnum, ord)
      join pg_attribute att
        on att.attrelid = rel.oid
       and att.attnum = cols.attnum
      order by cols.ord
    ) = array['student_id', 'position_id'];

  if constraint_to_drop is not null then
    execute format('alter table public."Votes" drop constraint %I', constraint_to_drop);
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'Votes'
      and con.conname = 'votes_student_id_position_id_cycle_key'
  ) then
    alter table public."Votes"
      add constraint votes_student_id_position_id_cycle_key
      unique (student_id, position_id, election_cycle_id);
  end if;
end $$;

drop policy if exists "votes: student insert own" on public."Votes";
drop policy if exists "votes: student insert own active cycle" on public."Votes";
create policy "votes: student insert own active cycle"
  on public."Votes" for insert
  with check (
    student_id = public.current_user_id()
    and election_cycle_id = public.active_cycle_id()
  );

drop policy if exists "votes: student read own / admin read all" on public."Votes";
drop policy if exists "votes: student read own active cycle / admin read all" on public."Votes";
create policy "votes: student read own active cycle / admin read all"
  on public."Votes" for select
  using (
    (
      student_id = public.current_user_id()
      and election_cycle_id = public.active_cycle_id()
    )
    or public.has_role('Admin')
  );
