-- Finish election-cycle scoping for activity tables that were not covered by
-- the initial pre-work migration.

alter table public."ElectionCycles" enable row level security;

drop policy if exists "election_cycles: active read / admin read all" on public."ElectionCycles";
create policy "election_cycles: active read / admin read all"
  on public."ElectionCycles" for select
  using (
    status = 'active'
    or public.has_role('Admin')
  );

drop policy if exists "election_cycles: admin write" on public."ElectionCycles";
create policy "election_cycles: admin write"
  on public."ElectionCycles" for all
  using (public.has_role('Admin'))
  with check (public.has_role('Admin'));

drop trigger if exists trg_election_cycles_updated on public."ElectionCycles";
create trigger trg_election_cycles_updated
  before update on public."ElectionCycles"
  for each row execute procedure public.handle_updated_at();

alter table public."Posts"
  add column if not exists election_cycle_id uuid
  references public."ElectionCycles"(id) on delete restrict;

alter table public."MitingQuestions"
  add column if not exists election_cycle_id uuid
  references public."ElectionCycles"(id) on delete restrict;

alter table public."AuditLogs"
  add column if not exists election_cycle_id uuid
  references public."ElectionCycles"(id) on delete set null;

update public."Posts"
set election_cycle_id = public.active_cycle_id()
where election_cycle_id is null;

update public."MitingQuestions"
set election_cycle_id = public.active_cycle_id()
where election_cycle_id is null;

alter table public."Posts"
  alter column election_cycle_id set not null;

alter table public."MitingQuestions"
  alter column election_cycle_id set not null;

create index if not exists posts_election_cycle_id_idx
  on public."Posts"(election_cycle_id);

create index if not exists miting_questions_election_cycle_id_idx
  on public."MitingQuestions"(election_cycle_id);

create index if not exists audit_logs_election_cycle_id_idx
  on public."AuditLogs"(election_cycle_id);

-- Directly cycle-scoped tables.
drop policy if exists "candidates: authenticated read" on public."Candidates";
drop policy if exists "candidates: active read / admin read all" on public."Candidates";
create policy "candidates: active read / admin read all"
  on public."Candidates" for select
  using (
    election_cycle_id = public.active_cycle_id()
    or public.has_role('Admin')
  );

drop policy if exists "candidates: admin write" on public."Candidates";
drop policy if exists "candidates: admin write non-archived cycle" on public."Candidates";
create policy "candidates: admin write non-archived cycle"
  on public."Candidates" for all
  using (
    public.has_role('Admin')
    and exists (
      select 1
      from public."ElectionCycles" ec
      where ec.id = "Candidates".election_cycle_id
        and ec.status <> 'archived'
    )
  )
  with check (
    public.has_role('Admin')
    and exists (
      select 1
      from public."ElectionCycles" ec
      where ec.id = "Candidates".election_cycle_id
        and ec.status <> 'archived'
    )
  );

drop policy if exists "posts: authenticated read" on public."Posts";
drop policy if exists "posts: active read / admin read all" on public."Posts";
create policy "posts: active read / admin read all"
  on public."Posts" for select
  using (
    election_cycle_id = public.active_cycle_id()
    or public.has_role('Admin')
  );

drop policy if exists "posts: admin write" on public."Posts";
drop policy if exists "posts: admin write non-archived cycle" on public."Posts";
create policy "posts: admin write non-archived cycle"
  on public."Posts" for all
  using (
    public.has_role('Admin')
    and exists (
      select 1
      from public."ElectionCycles" ec
      where ec.id = "Posts".election_cycle_id
        and ec.status <> 'archived'
    )
  )
  with check (
    public.has_role('Admin')
    and exists (
      select 1
      from public."ElectionCycles" ec
      where ec.id = "Posts".election_cycle_id
        and ec.status <> 'archived'
    )
  );

drop policy if exists "miting: student insert" on public."MitingQuestions";
drop policy if exists "miting: student insert active cycle" on public."MitingQuestions";
create policy "miting: student insert active cycle"
  on public."MitingQuestions" for insert
  with check (
    student_id = public.current_user_id()
    and election_cycle_id = public.active_cycle_id()
  );

drop policy if exists "miting: student reads approved / admin reads all" on public."MitingQuestions";
drop policy if exists "miting: student reads active approved / own pending, admin reads all" on public."MitingQuestions";
create policy "miting: student reads active approved / own pending, admin reads all"
  on public."MitingQuestions" for select
  using (
    public.has_role('Admin')
    or (
      election_cycle_id = public.active_cycle_id()
      and (
        is_approved = true
        or student_id = public.current_user_id()
      )
    )
  );

drop policy if exists "miting: admin update (approve/delete)" on public."MitingQuestions";
drop policy if exists "miting: admin update non-archived cycle" on public."MitingQuestions";
create policy "miting: admin update non-archived cycle"
  on public."MitingQuestions" for update
  using (
    public.has_role('Admin')
    and exists (
      select 1
      from public."ElectionCycles" ec
      where ec.id = "MitingQuestions".election_cycle_id
        and ec.status <> 'archived'
    )
  )
  with check (
    public.has_role('Admin')
    and exists (
      select 1
      from public."ElectionCycles" ec
      where ec.id = "MitingQuestions".election_cycle_id
        and ec.status <> 'archived'
    )
  );

drop policy if exists "miting: admin delete" on public."MitingQuestions";
drop policy if exists "miting: admin delete non-archived cycle" on public."MitingQuestions";
create policy "miting: admin delete non-archived cycle"
  on public."MitingQuestions" for delete
  using (
    public.has_role('Admin')
    and exists (
      select 1
      from public."ElectionCycles" ec
      where ec.id = "MitingQuestions".election_cycle_id
        and ec.status <> 'archived'
    )
  );

-- Tables whose cycle comes from a parent row.
drop policy if exists "poll_options: authenticated read" on public."PollOptions";
drop policy if exists "poll_options: active read / admin read all" on public."PollOptions";
create policy "poll_options: active read / admin read all"
  on public."PollOptions" for select
  using (
    public.has_role('Admin')
    or exists (
      select 1
      from public."Posts" p
      where p.id = "PollOptions".post_id
        and p.election_cycle_id = public.active_cycle_id()
    )
  );

drop policy if exists "poll_options: admin write" on public."PollOptions";
drop policy if exists "poll_options: admin write non-archived parent cycle" on public."PollOptions";
create policy "poll_options: admin write non-archived parent cycle"
  on public."PollOptions" for all
  using (
    public.has_role('Admin')
    and exists (
      select 1
      from public."Posts" p
      join public."ElectionCycles" ec on ec.id = p.election_cycle_id
      where p.id = "PollOptions".post_id
        and ec.status <> 'archived'
    )
  )
  with check (
    public.has_role('Admin')
    and exists (
      select 1
      from public."Posts" p
      join public."ElectionCycles" ec on ec.id = p.election_cycle_id
      where p.id = "PollOptions".post_id
        and ec.status <> 'archived'
    )
  );

drop policy if exists "poll_responses: authenticated read" on public."PollResponses";
drop policy if exists "poll_responses: active read / admin read all" on public."PollResponses";
create policy "poll_responses: active read / admin read all"
  on public."PollResponses" for select
  using (
    public.has_role('Admin')
    or exists (
      select 1
      from public."PollOptions" po
      join public."Posts" p on p.id = po.post_id
      where po.id = "PollResponses".poll_option_id
        and p.election_cycle_id = public.active_cycle_id()
    )
  );

drop policy if exists "poll_responses: student insert own" on public."PollResponses";
drop policy if exists "poll_responses: student insert own active cycle" on public."PollResponses";
create policy "poll_responses: student insert own active cycle"
  on public."PollResponses" for insert
  with check (
    student_id = public.current_user_id()
    and exists (
      select 1
      from public."PollOptions" po
      join public."Posts" p on p.id = po.post_id
      where po.id = "PollResponses".poll_option_id
        and p.election_cycle_id = public.active_cycle_id()
    )
  );

drop policy if exists "comments: authenticated read" on public."Comments";
drop policy if exists "comments: active read / admin read all" on public."Comments";
create policy "comments: active read / admin read all"
  on public."Comments" for select
  using (
    public.has_role('Admin')
    or exists (
      select 1
      from public."Posts" p
      where p.id = "Comments".post_id
        and p.election_cycle_id = public.active_cycle_id()
    )
  );

drop policy if exists "comments: student insert own" on public."Comments";
drop policy if exists "comments: student insert own active cycle" on public."Comments";
create policy "comments: student insert own active cycle"
  on public."Comments" for insert
  with check (
    student_id = public.current_user_id()
    and exists (
      select 1
      from public."Posts" p
      where p.id = "Comments".post_id
        and p.election_cycle_id = public.active_cycle_id()
    )
  );

drop policy if exists "comments: student update own" on public."Comments";
drop policy if exists "comments: student update own active cycle" on public."Comments";
create policy "comments: student update own active cycle"
  on public."Comments" for update
  using (
    student_id = public.current_user_id()
    and exists (
      select 1
      from public."Posts" p
      where p.id = "Comments".post_id
        and p.election_cycle_id = public.active_cycle_id()
    )
  )
  with check (
    student_id = public.current_user_id()
    and exists (
      select 1
      from public."Posts" p
      where p.id = "Comments".post_id
        and p.election_cycle_id = public.active_cycle_id()
    )
  );

drop policy if exists "comments: student or admin delete" on public."Comments";
drop policy if exists "comments: student active delete or admin non-archived delete" on public."Comments";
create policy "comments: student active delete or admin non-archived delete"
  on public."Comments" for delete
  using (
    (
      student_id = public.current_user_id()
      and exists (
        select 1
        from public."Posts" p
        where p.id = "Comments".post_id
          and p.election_cycle_id = public.active_cycle_id()
      )
    )
    or (
      public.has_role('Admin')
      and exists (
        select 1
        from public."Posts" p
        join public."ElectionCycles" ec on ec.id = p.election_cycle_id
        where p.id = "Comments".post_id
          and ec.status <> 'archived'
      )
    )
  );

drop policy if exists "upvotes: authenticated read" on public."QuestionUpvotes";
drop policy if exists "upvotes: active read / admin read all" on public."QuestionUpvotes";
create policy "upvotes: active read / admin read all"
  on public."QuestionUpvotes" for select
  using (
    public.has_role('Admin')
    or exists (
      select 1
      from public."MitingQuestions" mq
      where mq.id = "QuestionUpvotes".question_id
        and mq.election_cycle_id = public.active_cycle_id()
    )
  );

drop policy if exists "upvotes: student insert own" on public."QuestionUpvotes";
drop policy if exists "upvotes: student insert own active cycle" on public."QuestionUpvotes";
create policy "upvotes: student insert own active cycle"
  on public."QuestionUpvotes" for insert
  with check (
    student_id = public.current_user_id()
    and exists (
      select 1
      from public."MitingQuestions" mq
      where mq.id = "QuestionUpvotes".question_id
        and mq.election_cycle_id = public.active_cycle_id()
    )
  );

drop policy if exists "upvotes: student delete own (undo upvote)" on public."QuestionUpvotes";
drop policy if exists "upvotes: student delete own active cycle" on public."QuestionUpvotes";
create policy "upvotes: student delete own active cycle"
  on public."QuestionUpvotes" for delete
  using (
    student_id = public.current_user_id()
    and exists (
      select 1
      from public."MitingQuestions" mq
      where mq.id = "QuestionUpvotes".question_id
        and mq.election_cycle_id = public.active_cycle_id()
    )
  );
