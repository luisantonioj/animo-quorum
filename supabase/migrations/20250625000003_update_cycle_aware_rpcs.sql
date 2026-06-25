-- Replace election RPCs so vote writes and result reads are scoped by
-- ElectionCycles instead of the legacy SystemSettings singleton.

create or replace function public.cast_vote(
  p_candidate_id uuid,
  p_position_id  uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id  uuid;
  v_vote_id  uuid;
  v_cycle    public."ElectionCycles"%rowtype;
begin
  v_user_id := public.current_user_id();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'User profile not found');
  end if;

  select *
    into v_cycle
  from public."ElectionCycles"
  where status = 'active'
  limit 1;

  if v_cycle.id is null then
    return json_build_object('success', false, 'error', 'No active election cycle');
  end if;

  if (v_cycle.voting_start_time is not null and now() < v_cycle.voting_start_time)
     or (v_cycle.voting_end_time is not null and now() > v_cycle.voting_end_time)
  then
    return json_build_object('success', false, 'error', 'Voting is not currently open');
  end if;

  if exists (
    select 1
    from public."Votes"
    where student_id = v_user_id
      and position_id = p_position_id
      and election_cycle_id = v_cycle.id
      and is_valid = true
  ) then
    return json_build_object('success', false, 'error', 'Already voted for this position');
  end if;

  if p_candidate_id is not null and not exists (
    select 1
    from public."Candidates"
    where id = p_candidate_id
      and position_id = p_position_id
      and election_cycle_id = v_cycle.id
  ) then
    return json_build_object('success', false, 'error', 'Candidate does not belong to this position');
  end if;

  insert into public."Votes" (
    student_id,
    candidate_id,
    position_id,
    election_cycle_id
  )
  values (
    v_user_id,
    p_candidate_id,
    p_position_id,
    v_cycle.id
  )
  returning id into v_vote_id;

  return json_build_object('success', true, 'vote_id', v_vote_id);

exception
  when unique_violation then
    return json_build_object('success', false, 'error', 'Duplicate vote blocked by constraint');
  when others then
    return json_build_object('success', false, 'error', sqlerrm);
end;
$$;

create or replace function public.invalidate_vote(p_vote_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_admin_id uuid;
  v_cycle_id uuid;
begin
  if not public.has_role('Admin') then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;

  v_admin_id := public.current_user_id();

  update public."Votes"
  set is_valid = false
  where id = p_vote_id
  returning election_cycle_id into v_cycle_id;

  if not found then
    return json_build_object('success', false, 'error', 'Vote not found');
  end if;

  insert into public."AuditLogs" (
    admin_id,
    action_type,
    target_id,
    election_cycle_id
  )
  values (
    v_admin_id,
    'INVALIDATE_VOTE',
    p_vote_id,
    v_cycle_id
  );

  return json_build_object('success', true);
end;
$$;

create or replace function public.delete_candidate(p_candidate_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_admin_id uuid;
  v_cycle_id uuid;
  v_cycle_status text;
begin
  if not public.has_role('Admin') then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;

  v_admin_id := public.current_user_id();

  select c.election_cycle_id, ec.status
    into v_cycle_id, v_cycle_status
  from public."Candidates" c
  join public."ElectionCycles" ec on ec.id = c.election_cycle_id
  where c.id = p_candidate_id;

  if v_cycle_id is null then
    return json_build_object('success', false, 'error', 'Candidate not found');
  end if;

  if v_cycle_status = 'archived' then
    return json_build_object('success', false, 'error', 'Archived cycle candidates cannot be deleted');
  end if;

  delete from public."Candidates"
  where id = p_candidate_id;

  insert into public."AuditLogs" (
    admin_id,
    action_type,
    target_id,
    election_cycle_id
  )
  values (
    v_admin_id,
    'DELETE_CANDIDATE',
    p_candidate_id,
    v_cycle_id
  );

  return json_build_object('success', true);
end;
$$;

drop function if exists public.get_vote_tally();
drop function if exists public.get_vote_tally(uuid);

create or replace function public.get_vote_tally(p_cycle_id uuid default null)
returns table (
  position_id    uuid,
  position_name  text,
  candidate_id   uuid,
  candidate_name text,
  partylist      text,
  vote_count     bigint
)
language sql
security definer
stable
as $$
  with selected_cycle as (
    select coalesce(p_cycle_id, public.active_cycle_id()) as id
  )
  select
    p.id,
    p.position_name,
    c.id,
    c.name,
    c.partylist,
    count(v.id) filter (where v.is_valid = true) as vote_count
  from selected_cycle sc
  join public."Candidates" c
    on c.election_cycle_id = sc.id
  join public."Positions" p
    on p.id = c.position_id
  left join public."Votes" v
    on v.candidate_id = c.id
   and v.position_id = p.id
   and v.election_cycle_id = sc.id
  group by p.id, p.position_name, p.display_order, c.id, c.name, c.partylist
  order by p.display_order, vote_count desc;
$$;

drop function if exists public.get_live_results();
drop function if exists public.get_live_results(uuid);

create or replace function public.get_live_results(p_cycle_id uuid default null)
returns table (
  position_id   uuid,
  position_name text,
  candidate_id  uuid,
  percentage    numeric
)
language plpgsql
security definer
stable
as $$
declare
  v_cycle_id uuid;
  v_show_live_results boolean;
begin
  v_cycle_id := coalesce(p_cycle_id, public.active_cycle_id());

  select ec.show_live_results
    into v_show_live_results
  from public."ElectionCycles" ec
  where ec.id = v_cycle_id;

  if v_cycle_id is null or v_show_live_results is null then
    raise exception 'Election cycle not found';
  end if;

  if not v_show_live_results then
    raise exception 'Live results are not currently available';
  end if;

  return query
  select
    p.id,
    p.position_name,
    c.id,
    round(
      count(v.id) filter (where v.is_valid = true) * 100.0
      / nullif(sum(count(v.id) filter (where v.is_valid = true)) over (partition by p.id), 0),
      1
    )
  from public."Candidates" c
  join public."Positions" p
    on p.id = c.position_id
  left join public."Votes" v
    on v.candidate_id = c.id
   and v.position_id = p.id
   and v.election_cycle_id = v_cycle_id
  where c.election_cycle_id = v_cycle_id
  group by p.id, p.position_name, p.display_order, c.id
  order by p.display_order;
end;
$$;
