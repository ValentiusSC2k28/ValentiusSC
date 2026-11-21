-- ════════════════════════════════════════════════════════════════════════════
-- Hue & Harmony — Supabase setup
-- Run this whole file ONCE in Supabase → SQL Editor → New query → Run.
-- It is safe to run again after an update: it never deletes your data.
-- Everything is prefixed hh_ .
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─── TABLES ─────────────────────────────────────────────────────────────────
create table if not exists hh_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Live state that admins switch: scoreboard freeze/reveal, hunt start/stop
create table if not exists hh_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists hh_teams (
  id serial primary key,
  name text not null,
  color text not null default '#888888',
  motto text not null default '',
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists hh_players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,
  team_id int references hh_teams(id) on delete set null,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists hh_sessions (
  token_hash text primary key,
  player_id uuid not null references hh_players(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists hh_admins (
  user_id uuid primary key,
  email text not null,
  added_at timestamptz not null default now()
);

create table if not exists hh_points (
  id bigserial primary key,
  team_id int not null references hh_teams(id) on delete cascade,
  player_id uuid references hh_players(id) on delete set null,
  amount int not null,
  reason text not null default '',
  game text not null default '',
  source text not null default 'admin',
  created_by text not null default '',
  undo_of bigint,
  created_at timestamptz not null default now()
);
create index if not exists hh_points_team on hh_points(team_id);
create index if not exists hh_points_player on hh_points(player_id);

create table if not exists hh_games (
  id serial primary key,
  name text not null,
  description text not null default '',
  points jsonb not null default '[30,20,10,5]'::jsonb,
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists hh_activities (
  id serial primary key,
  title text not null,
  details text not null default '',
  time_label text not null default '',
  status text not null default 'upcoming',   -- upcoming | live | done
  visible boolean not null default true,
  sort int not null default 0
);

create table if not exists hh_announcements (
  id bigserial primary key,
  body text not null,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists hh_rooms (
  id serial primary key,
  code text not null unique,
  game text not null default 'lms',
  name text not null default 'Room',
  is_public boolean not null default true,
  status text not null default 'lobby',      -- lobby | live | ended | closed
  host_player_id uuid references hh_players(id) on delete set null,
  max_players int not null default 50,
  rules jsonb not null default '{}'::jsonb,
  round int not null default 0,
  winner_player_id uuid references hh_players(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table if not exists hh_room_players (
  room_id int not null references hh_rooms(id) on delete cascade,
  player_id uuid not null references hh_players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  role text not null default 'player',       -- player | bad
  lives int not null default 3,
  alive boolean not null default true,
  kills int not null default 0,
  last_attack_at timestamptz,
  eliminated_at timestamptz,
  primary key (room_id, player_id)
);

create table if not exists hh_room_events (
  id bigserial primary key,
  room_id int not null references hh_rooms(id) on delete cascade,
  kind text not null default 'info',
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists hh_room_events_room on hh_room_events(room_id, id);

create table if not exists hh_chat (
  id bigserial primary key,
  room_id int not null references hh_rooms(id) on delete cascade,
  player_id uuid references hh_players(id) on delete set null,
  name text not null,
  team_id int,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists hh_chat_room on hh_chat(room_id, id);

create table if not exists hh_hunt_stations (
  id serial primary key,
  name text not null,
  place text not null default '',            -- admin-only note: where it is hidden
  clue text not null default '',             -- shown to the team to find this station
  challenge text not null default '',        -- shown after the scan
  answer text not null default '',           -- accepted answers separated by |
  check_mode text not null default 'text',   -- text | none | admin
  hint text not null default '',
  is_decoy boolean not null default false,
  is_final boolean not null default false,
  qr_token text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  short_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6)),
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists hh_hunt_progress (
  team_id int primary key references hh_teams(id) on delete cascade,
  route int[] not null default '{}',
  step int not null default 0,               -- stations completed
  stage text not null default 'find',        -- find | challenge | waiting
  hints_used int not null default 0,
  hint_shown boolean not null default false,
  frozen_until timestamptz,
  finished_at timestamptz,
  place int,
  last_message text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists hh_audit (
  id bigserial primary key,
  actor text not null default '',
  action text not null,
  target text not null default '',
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ─── HELPERS ────────────────────────────────────────────────────────────────
create or replace function hh_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hh_admins where user_id = auth.uid());
$$;

create or replace function hh_cfg() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from hh_settings where key = 'app'), '{}'::jsonb);
$$;

create or replace function hh_cfg_num(p text[], d numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v text := hh_cfg() #>> p;
begin
  if v is null or v = '' then return d; end if;
  return v::numeric;
exception when others then return d;
end $$;

create or replace function hh_cfg_bool(p text[], d boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v text := hh_cfg() #>> p;
begin
  if v is null or v = '' then return d; end if;
  return v::boolean;
exception when others then return d;
end $$;

create or replace function hh_state_get(k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from hh_state where key = k), '{}'::jsonb);
$$;

create or replace function hh_hash(t text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(t, 'sha256'), 'hex');
$$;

-- The signed-in player for a token, or an error
create or replace function hh_me(p_token text) returns hh_players
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players;
begin
  select p.* into me from hh_sessions s join hh_players p on p.id = s.player_id
   where s.token_hash = hh_hash(coalesce(p_token, ''));
  if not found then raise exception 'Please sign in again.' using hint = 'AUTH'; end if;
  return me;
end $$;

create or replace function hh_team_totals() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('team_id', t.id, 'total', coalesce(s.total, 0)) order by t.sort, t.id), '[]'::jsonb)
    from hh_teams t
    left join (select team_id, sum(amount)::int as total from hh_points group by team_id) s on s.team_id = t.id
   where t.active;
$$;

create or replace function hh_add_points(p_team int, p_player uuid, p_amount int, p_reason text, p_game text, p_source text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_team is null or coalesce(p_amount, 0) = 0 then return; end if;
  insert into hh_points(team_id, player_id, amount, reason, game, source, created_by)
  values (p_team, p_player, p_amount, coalesce(p_reason, ''), coalesce(p_game, ''), coalesce(p_source, 'game'), 'game');
end $$;

-- ─── PLAYER SIGN-IN (name + PIN) ────────────────────────────────────────────
create or replace function hh_join(p_name text, p_pin text, p_team int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_key text;
  me hh_players;
  v_token text;
  v_max int := hh_cfg_num(array['signin','maxTries'], 5)::int;
  v_lock int := hh_cfg_num(array['signin','lockMinutes'], 5)::int;
begin
  if length(v_name) < 2 or length(v_name) > 30 then
    return jsonb_build_object('ok', false, 'error', 'Your name should be 2 to 30 characters.');
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,8}$' then
    return jsonb_build_object('ok', false, 'error', 'Your PIN should be 4 to 8 digits.');
  end if;
  v_key := lower(v_name);
  select * into me from hh_players where name_key = v_key for update;

  if found then
    if me.locked_until is not null and me.locked_until > now() then
      return jsonb_build_object('ok', false, 'error',
        'Too many wrong PINs for this name. Try again in ' || ceil(extract(epoch from me.locked_until - now()) / 60)::int || ' minute(s), or ask an admin.');
    end if;
    if extensions.crypt(p_pin, me.pin_hash) <> me.pin_hash then
      update hh_players set
        locked_until = case when failed_attempts + 1 >= v_max then now() + make_interval(mins => v_lock) else locked_until end,
        failed_attempts = case when failed_attempts + 1 >= v_max then 0 else failed_attempts + 1 end
       where id = me.id;
      return jsonb_build_object('ok', false, 'error',
        'That name is already taken and the PIN does not match. If it is you, check your PIN. If not, add your surname.');
    end if;
    update hh_players set failed_attempts = 0, locked_until = null, last_seen = now() where id = me.id;
  else
    if not hh_cfg_bool(array['signin','allowNew'], true) then
      return jsonb_build_object('ok', false, 'error', 'New sign-ups are closed. Ask an admin.');
    end if;
    if p_team is null or not exists (select 1 from hh_teams where id = p_team and active) then
      return jsonb_build_object('ok', false, 'error', 'Pick your team.');
    end if;
    insert into hh_players(name, name_key, team_id, pin_hash)
    values (v_name, v_key, p_team, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
    returning * into me;
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into hh_sessions(token_hash, player_id) values (hh_hash(v_token), me.id);
  return jsonb_build_object('ok', true, 'token', v_token,
    'player', jsonb_build_object('id', me.id, 'name', me.name, 'team_id', me.team_id));
end $$;

create or replace function hh_signout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from hh_sessions where token_hash = hh_hash(coalesce(p_token, ''));
$$;

-- ─── THE MAIN POLL (home, scoreboard, activity centre) ─────────────────────
create or replace function hh_poll(p_token text, p_since_ann bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  me hh_players;
  v_me jsonb := null;
  sb jsonb := hh_state_get('scoreboard');
  v_frozen boolean := coalesce((sb->>'frozen')::boolean, false);
  v_reveal_at timestamptz := nullif(sb->>'reveal_at', '')::timestamptz;
  v_live boolean;
  v_totals jsonb;
  v_feed jsonb := '[]'::jsonb;
  v_people jsonb := '[]'::jsonb;
  v_feed_n int := hh_cfg_num(array['scoreboard','feedCount'], 8)::int;
  v_people_n int := hh_cfg_num(array['scoreboard','individualCount'], 10)::int;
begin
  if p_token is not null and p_token <> '' then
    select p.* into me from hh_sessions s join hh_players p on p.id = s.player_id where s.token_hash = hh_hash(p_token);
    if found then
      if me.last_seen < now() - interval '45 seconds' then
        update hh_players set last_seen = now() where id = me.id;
      end if;
      v_me := jsonb_build_object('id', me.id, 'name', me.name, 'team_id', me.team_id,
        'points', (select coalesce(sum(amount), 0) from hh_points where player_id = me.id));
    else
      v_me := jsonb_build_object('signed_out', true);
    end if;
  end if;

  v_live := (not v_frozen) or (v_reveal_at is not null and now() >= v_reveal_at);
  if v_live then
    v_totals := hh_team_totals();
    select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) into v_feed from (
      select jsonb_build_object('id', pt.id, 'team_id', pt.team_id, 'amount', pt.amount, 'reason', pt.reason,
             'game', pt.game, 'name', pl.name, 'at', pt.created_at) as x
        from hh_points pt left join hh_players pl on pl.id = pt.player_id
       order by pt.id desc limit greatest(v_feed_n, 0)) f;
    if hh_cfg_bool(array['scoreboard','showIndividuals'], true) then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into v_people from (
        select jsonb_build_object('id', pl.id, 'name', pl.name, 'team_id', pl.team_id, 'total', sum(pt.amount)::int) as x
          from hh_points pt join hh_players pl on pl.id = pt.player_id
         group by pl.id, pl.name, pl.team_id
        having sum(pt.amount) > 0
         order by sum(pt.amount) desc, pl.name limit greatest(v_people_n, 0)) f;
    end if;
  else
    v_totals := case when hh_cfg_bool(array['scoreboard','showSnapshotWhenFrozen'], true) then coalesce(sb->'snapshot', '[]'::jsonb) else null end;
  end if;

  return jsonb_build_object(
    'now', now(),
    'me', v_me,
    'settings_at', (select updated_at from hh_settings where key = 'app'),
    'teams', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color, 'motto', motto, 'sort', sort) order by sort, id), '[]'::jsonb) from hh_teams where active),
    'scoreboard', jsonb_build_object('frozen', v_frozen and not v_live, 'totals', v_totals, 'feed', v_feed, 'people', v_people,
                    'reveal_at', v_reveal_at, 'reveal_id', sb->'reveal_id'),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'details', details, 'time', time_label, 'status', status) order by sort, id), '[]'::jsonb) from hh_activities where visible),
    'announcements', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'at', created_at) order by id desc), '[]'::jsonb)
                        from (select * from hh_announcements where visible order by id desc limit 5) a),
    'hunt', jsonb_build_object('status', coalesce(hh_state_get('hunt')->>'status', 'off'))
  );
end $$;

-- ─── ADMINS ─────────────────────────────────────────────────────────────────
create or replace function hh_claim_first_admin() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from hh_admins) then return hh_is_admin(); end if;
  insert into hh_admins(user_id, email) select id, email from auth.users where id = auth.uid();
  return true;
end $$;

create or replace function hh_admin_add(p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text; v_max int := hh_cfg_num(array['admins','max'], 5)::int;
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  if (select count(*) from hh_admins) >= v_max then
    raise exception 'The admin limit (%) is reached. Remove one first, or raise the limit in Settings.', v_max;
  end if;
  select id, email into v_id, v_email from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_id is null then
    raise exception 'No account uses that email yet. Ask them to open the site, tap "Admin" and create an account first.';
  end if;
  insert into hh_admins(user_id, email) values (v_id, v_email) on conflict (user_id) do nothing;
  return jsonb_build_object('user_id', v_id, 'email', v_email);
end $$;

create or replace function hh_admin_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  if (select count(*) from hh_admins) <= 1 then raise exception 'You cannot remove the last admin.'; end if;
  delete from hh_admins where user_id = p_user;
end $$;

create or replace function hh_admin_reset_pin(p_player uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,8}$' then raise exception 'The PIN should be 4 to 8 digits.'; end if;
  update hh_players set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), failed_attempts = 0, locked_until = null where id = p_player;
  delete from hh_sessions where player_id = p_player;
end $$;

create or replace function hh_admin_freeze(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare sb jsonb := hh_state_get('scoreboard');
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  if p_on then
    sb := sb || jsonb_build_object('frozen', true, 'snapshot', hh_team_totals(), 'reveal_at', null);
  else
    sb := sb || jsonb_build_object('frozen', false, 'reveal_at', null);
  end if;
  insert into hh_state(key, value, updated_at) values ('scoreboard', sb, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- Starts the synchronised winner reveal p_seconds from now
create or replace function hh_admin_reveal(p_seconds int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare sb jsonb := hh_state_get('scoreboard'); v_at timestamptz := now() + make_interval(secs => greatest(coalesce(p_seconds, 10), 3));
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  if not coalesce((sb->>'frozen')::boolean, false) then
    sb := sb || jsonb_build_object('frozen', true, 'snapshot', hh_team_totals());
  end if;
  sb := sb || jsonb_build_object('reveal_at', v_at, 'reveal_id', coalesce((sb->>'reveal_id')::int, 0) + 1);
  insert into hh_state(key, value, updated_at) values ('scoreboard', sb, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_at;
end $$;

create or replace function hh_admin_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  return jsonb_build_object(
    'now', now(),
    'players', (select count(*) from hh_players),
    'online', (select count(*) from hh_players where last_seen > now() - interval '90 seconds'),
    'teams', (select coalesce(jsonb_agg(jsonb_build_object('team_id', t.id, 'players', (select count(*) from hh_players p where p.team_id = t.id),
                 'online', (select count(*) from hh_players p where p.team_id = t.id and p.last_seen > now() - interval '90 seconds')) order by t.sort, t.id), '[]'::jsonb) from hh_teams t where t.active),
    'totals', hh_team_totals(),
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name, 'status', r.status, 'is_public', r.is_public,
                 'players', (select count(*) from hh_room_players rp where rp.room_id = r.id),
                 'alive', (select count(*) from hh_room_players rp where rp.room_id = r.id and rp.alive and rp.role = 'player')) order by r.id desc), '[]'::jsonb)
                from hh_rooms r where r.status in ('lobby', 'live') or r.ended_at > now() - interval '30 minutes'),
    'hunt', (select coalesce(jsonb_agg(jsonb_build_object('team_id', h.team_id, 'step', h.step, 'total', coalesce(array_length(h.route, 1), 0),
                 'stage', h.stage, 'place', h.place, 'hints', h.hints_used, 'frozen_until', h.frozen_until)), '[]'::jsonb) from hh_hunt_progress h),
    'hunt_state', hh_state_get('hunt'),
    'scoreboard', hh_state_get('scoreboard'),
    'log', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
              select jsonb_build_object('at', at, 'text', txt) as x from (
                select created_at as at, actor || ': ' || action || ' ' || target as txt from hh_audit
                union all
                select e.created_at, '[' || r.code || '] ' || e.body from hh_room_events e join hh_rooms r on r.id = e.room_id
                union all
                select created_at, 'Points ' || case when amount > 0 then '+' else '' end || amount || ' to ' ||
                       (select name from hh_teams where id = team_id) || coalesce(' (' || nullif(reason, '') || ')', '') from hh_points where source <> 'admin'
              ) u order by at desc limit 40) l)
  );
end $$;

-- Wipe parts of the event. p_what: points | rooms | hunt | players | announcements
create or replace function hh_admin_reset(p_what text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  if p_what = 'points' then
    delete from hh_points where true;
    delete from hh_state where key = 'scoreboard';
  elsif p_what = 'rooms' then delete from hh_rooms where true;
  elsif p_what = 'hunt' then
    update hh_hunt_progress set step = 0, stage = 'find', hints_used = 0, hint_shown = false, frozen_until = null,
      finished_at = null, place = null, last_message = '', updated_at = now();
    delete from hh_state where key = 'hunt';
  elsif p_what = 'players' then delete from hh_players where true;
  elsif p_what = 'announcements' then delete from hh_announcements where true;
  else raise exception 'Unknown reset: %', p_what;
  end if;
  insert into hh_audit(actor, action, target) values ((select email from hh_admins where user_id = auth.uid()), 'reset', p_what);
end $$;

-- ─── LAST MAN STANDING ──────────────────────────────────────────────────────
create or replace function hh_lms_rules(p_rules jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lives', 3, 'bad_eggs', 0, 'bad_ratio', 8, 'cooldown', 0, 'show_attacker', true,
                            'show_bad_count', true, 'chat', true, 'ghost_chat', false, 'late_join', false,
                            'win_points', 50, 'kill_points', 0, 'backfire_points', 0, 'reveal_roles_at_end', true)
         || coalesce(hh_cfg() #> '{lms,defaults}', '{}'::jsonb)
         || coalesce(p_rules, '{}'::jsonb);
$$;

create or replace function hh_room_code() returns text
language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'; c text; i int;
begin
  loop
    c := '';
    for i in 1..4 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from hh_rooms where code = c);
  end loop;
  return c;
end $$;

create or replace function hh_room_event(p_room int, p_kind text, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into hh_room_events(room_id, kind, body) values (p_room, p_kind, p_body);
$$;

-- Creates a room. p_token null = an admin creating it (no host).
create or replace function hh_room_create(p_token text, p_name text, p_public boolean, p_max int, p_rules jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; r hh_rooms; v_cap int := hh_cfg_num(array['lms','maxPlayers'], 50)::int; v_rules jsonb;
begin
  if p_token is null then
    if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  else
    me := hh_me(p_token);
    if not hh_cfg_bool(array['lms','enabled'], true) then raise exception 'Last Man Standing is closed right now.'; end if;
    if not hh_cfg_bool(array['lms','playersCanCreate'], true) then raise exception 'Only admins can create rooms right now.'; end if;
  end if;
  v_rules := case when p_token is null or hh_cfg_bool(array['lms','playersCanSetRules'], true) then hh_lms_rules(p_rules) else hh_lms_rules(null) end;
  insert into hh_rooms(code, name, is_public, host_player_id, max_players, rules)
  values (hh_room_code(), coalesce(nullif(trim(p_name), ''), 'Last Man Standing'), coalesce(p_public, true),
          case when p_token is null then null else me.id end,
          least(greatest(coalesce(p_max, v_cap), 3), v_cap), v_rules)
  returning * into r;
  if p_token is not null then
    delete from hh_room_players rp using hh_rooms x where x.id = rp.room_id and rp.player_id = me.id and x.status = 'lobby';
    insert into hh_room_players(room_id, player_id) values (r.id, me.id);
  end if;
  perform hh_room_event(r.id, 'info', 'Room created' || coalesce(' by ' || me.name, '') || '.');
  return jsonb_build_object('code', r.code);
end $$;

create or replace function hh_room_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players;
begin
  me := hh_me(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name, 'status', r.status, 'is_public', r.is_public,
            'max', r.max_players, 'host', (select name from hh_players where id = r.host_player_id),
            'count', (select count(*) from hh_room_players rp where rp.room_id = r.id),
            'mine', exists (select 1 from hh_room_players rp where rp.room_id = r.id and rp.player_id = me.id)) order by r.id desc), '[]'::jsonb)
            from hh_rooms r
           where r.status in ('lobby', 'live')
             and (r.is_public or exists (select 1 from hh_room_players rp where rp.room_id = r.id and rp.player_id = me.id)));
end $$;

create or replace function hh_room_join(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; r hh_rooms; n int;
begin
  me := hh_me(p_token);
  select * into r from hh_rooms where code = upper(trim(p_code)) for update;
  if not found or r.status not in ('lobby', 'live') then raise exception 'No open room has that code.'; end if;
  if exists (select 1 from hh_room_players where room_id = r.id and player_id = me.id) then
    return jsonb_build_object('code', r.code);
  end if;
  if r.status = 'live' and not coalesce((r.rules->>'late_join')::boolean, false) then
    raise exception 'That game has already started. Wait for the next round.';
  end if;
  select count(*) into n from hh_room_players where room_id = r.id;
  if n >= r.max_players then raise exception 'That room is full (% players).', r.max_players; end if;
  delete from hh_room_players rp using hh_rooms x where x.id = rp.room_id and rp.player_id = me.id and x.status = 'lobby';
  insert into hh_room_players(room_id, player_id, lives, alive)
  values (r.id, me.id, coalesce((r.rules->>'lives')::int, 3), true);
  perform hh_room_event(r.id, 'join', me.name || ' joined.');
  return jsonb_build_object('code', r.code);
end $$;

create or replace function hh_room_finish(p_room int) returns void
language plpgsql security definer set search_path = public as $$
declare r hh_rooms; n int; w uuid; wname text; wteam int;
begin
  select * into r from hh_rooms where id = p_room;
  if r.status <> 'live' then return; end if;
  select count(*) into n from hh_room_players where room_id = p_room and role = 'player' and alive;
  if n > 1 then return; end if;
  select rp.player_id, p.name, p.team_id into w, wname, wteam
    from hh_room_players rp join hh_players p on p.id = rp.player_id
   where rp.room_id = p_room and rp.role = 'player' and rp.alive limit 1;
  update hh_rooms set status = 'ended', ended_at = now(), winner_player_id = w where id = p_room;
  if w is not null then
    perform hh_room_event(p_room, 'win', wname || ' is the last one standing and wins!');
    perform hh_add_points(wteam, w, coalesce((r.rules->>'win_points')::int, 0), 'Last Man Standing winner', 'Last Man Standing', 'lms');
  else
    perform hh_room_event(p_room, 'win', 'Nobody is left standing. No winner this round.');
  end if;
end $$;

create or replace function hh_room_leave(p_token text, p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; r hh_rooms; rp hh_room_players;
begin
  me := hh_me(p_token);
  select * into r from hh_rooms where code = upper(trim(p_code)) for update;
  if not found then return; end if;
  select * into rp from hh_room_players where room_id = r.id and player_id = me.id;
  if not found then return; end if;
  if r.status = 'live' and rp.role = 'player' and rp.alive then
    update hh_room_players set alive = false, lives = 0, eliminated_at = now() where room_id = r.id and player_id = me.id;
    perform hh_room_event(r.id, 'out', me.name || ' left the game.');
    perform hh_room_finish(r.id);
  elsif r.status <> 'live' then
    delete from hh_room_players where room_id = r.id and player_id = me.id;
    perform hh_room_event(r.id, 'leave', me.name || ' left the room.');
    if r.host_player_id = me.id then
      update hh_rooms set host_player_id = (select player_id from hh_room_players where room_id = r.id order by joined_at limit 1) where id = r.id;
    end if;
    if not exists (select 1 from hh_room_players where room_id = r.id) and r.host_player_id is not null then
      update hh_rooms set status = 'closed', ended_at = now() where id = r.id;
    end if;
  end if;
end $$;

-- Deals roles and starts. Called by the host (token) or an admin (token null).
create or replace function hh_room_start(p_token text, p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; r hh_rooms; n int; bad int; v_min int := hh_cfg_num(array['lms','minPlayers'], 3)::int;
begin
  select * into r from hh_rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Room not found.'; end if;
  if p_token is null then
    if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  else
    me := hh_me(p_token);
    if r.host_player_id is distinct from me.id and not hh_is_admin() then raise exception 'Only the moderator can start the game.'; end if;
  end if;
  if r.status not in ('lobby', 'ended') then raise exception 'This game is already running.'; end if;
  select count(*) into n from hh_room_players where room_id = r.id;
  if n < v_min then raise exception 'You need at least % players to start.', v_min; end if;
  bad := coalesce((r.rules->>'bad_eggs')::int, 0);
  if bad <= 0 then bad := greatest(1, floor(n / greatest(coalesce((r.rules->>'bad_ratio')::numeric, 8), 1))::int); end if;
  if n - bad < 2 then bad := greatest(n - 2, 0); end if;
  with ranked as (select player_id, row_number() over (order by random()) as rn from hh_room_players where room_id = r.id)
  update hh_room_players rp set role = case when ranked.rn <= bad then 'bad' else 'player' end,
         lives = coalesce((r.rules->>'lives')::int, 3), alive = true, kills = 0, last_attack_at = null, eliminated_at = null
    from ranked where rp.room_id = r.id and rp.player_id = ranked.player_id;
  update hh_rooms set status = 'live', started_at = now(), ended_at = null, winner_player_id = null, round = round + 1 where id = r.id;
  perform hh_room_event(r.id, 'start', 'Round ' || (r.round + 1) || ' has started with ' || n || ' players' ||
    case when coalesce((r.rules->>'show_bad_count')::boolean, true) then ' and ' || bad || ' bad egg' || case when bad = 1 then '' else 's' end else '' end || '. Good luck!');
end $$;

create or replace function hh_room_attack(p_token text, p_code text, p_target uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; r hh_rooms; a hh_room_players; t hh_room_players; tname text; tteam int;
        v_cd numeric; v_msg text; v_res text;
begin
  me := hh_me(p_token);
  select * into r from hh_rooms where code = upper(trim(p_code)) for update;
  if not found or r.status <> 'live' then raise exception 'The game is not running.'; end if;
  select * into a from hh_room_players where room_id = r.id and player_id = me.id;
  if not found then raise exception 'You are not in this room.'; end if;
  if not a.alive then raise exception 'You are out of this round.'; end if;
  if p_target = me.id then raise exception 'You cannot attack yourself.'; end if;
  select * into t from hh_room_players where room_id = r.id and player_id = p_target;
  if not found then raise exception 'That player is not in this room.'; end if;
  if not t.alive then raise exception 'That player is already out.'; end if;
  select name, team_id into tname, tteam from hh_players where id = p_target;
  v_cd := greatest(coalesce((r.rules->>'cooldown')::numeric, 0), 1);
  if a.last_attack_at is not null and a.last_attack_at > now() - make_interval(secs => v_cd) then
    raise exception 'Wait % more second(s) before attacking again.', ceil(extract(epoch from a.last_attack_at + make_interval(secs => v_cd) - now()));
  end if;
  update hh_room_players set last_attack_at = now() where room_id = r.id and player_id = me.id;

  if t.role = 'bad' then
    if a.role = 'bad' then
      return jsonb_build_object('result', 'nothing', 'message', 'Nothing happened.');
    end if;
    update hh_room_players set lives = lives - 1 where room_id = r.id and player_id = me.id returning * into a;
    perform hh_add_points(tteam, p_target, coalesce((r.rules->>'backfire_points')::int, 0), 'Backfire in Last Man Standing', 'Last Man Standing', 'lms');
    if a.lives <= 0 then
      update hh_room_players set alive = false, eliminated_at = now() where room_id = r.id and player_id = me.id;
      perform hh_room_event(r.id, 'out', me.name || ' attacked a bad egg and is out!');
      v_res := 'out'; v_msg := tname || ' is a bad egg! It backfired and you are out.';
    else
      v_res := 'backfire'; v_msg := tname || ' is a bad egg! It backfired: you lost a life (' || a.lives || ' left).';
    end if;
  else
    update hh_room_players set lives = lives - 1 where room_id = r.id and player_id = p_target returning * into t;
    if t.lives <= 0 then
      update hh_room_players set alive = false, eliminated_at = now() where room_id = r.id and player_id = p_target;
      update hh_room_players set kills = kills + 1 where room_id = r.id and player_id = me.id;
      perform hh_add_points(me.team_id, me.id, coalesce((r.rules->>'kill_points')::int, 0), 'Elimination in Last Man Standing', 'Last Man Standing', 'lms');
      perform hh_room_event(r.id, 'out',
        case when coalesce((r.rules->>'show_attacker')::boolean, true) then me.name || ' eliminated ' || tname || '!' else tname || ' has been eliminated!' end);
      v_res := 'eliminated'; v_msg := 'You eliminated ' || tname || '!';
    else
      v_res := 'hit'; v_msg := 'Hit! ' || tname || ' lost a life.';
    end if;
  end if;
  perform hh_room_finish(r.id);
  return jsonb_build_object('result', v_res, 'message', v_msg);
end $$;

-- Moderator or admin: end without a winner, or reset to the lobby for another round
create or replace function hh_room_control(p_token text, p_code text, p_action text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; r hh_rooms;
begin
  select * into r from hh_rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Room not found.'; end if;
  if p_token is null then
    if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  else
    me := hh_me(p_token);
    if r.host_player_id is distinct from me.id and not hh_is_admin() then raise exception 'Only the moderator can do that.'; end if;
  end if;
  if p_action = 'end' then
    update hh_rooms set status = 'ended', ended_at = now() where id = r.id and status = 'live';
    perform hh_room_event(r.id, 'win', 'The moderator ended this round.');
  elsif p_action = 'again' then
    update hh_rooms set status = 'lobby', winner_player_id = null, started_at = null, ended_at = null where id = r.id;
    update hh_room_players set role = 'player', lives = coalesce((r.rules->>'lives')::int, 3), alive = true, kills = 0,
           last_attack_at = null, eliminated_at = null where room_id = r.id;
    perform hh_room_event(r.id, 'info', 'Back in the lobby. Waiting for the moderator to start the next round.');
  elsif p_action = 'close' then
    update hh_rooms set status = 'closed', ended_at = now() where id = r.id;
    perform hh_room_event(r.id, 'info', 'This room has been closed.');
  else raise exception 'Unknown action.';
  end if;
end $$;

create or replace function hh_room_poll(p_token text, p_code text, p_since_event bigint, p_since_chat bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; r hh_rooms; mine hh_room_players; v_in boolean; v_cd numeric;
begin
  me := hh_me(p_token);
  select * into r from hh_rooms where code = upper(trim(p_code));
  if not found then raise exception 'Room not found.'; end if;
  select * into mine from hh_room_players where room_id = r.id and player_id = me.id;
  v_in := found;
  v_cd := coalesce((r.rules->>'cooldown')::numeric, 0);
  return jsonb_build_object(
    'now', now(),
    'room', jsonb_build_object('code', r.code, 'name', r.name, 'status', r.status, 'is_public', r.is_public, 'max', r.max_players,
              'round', r.round, 'rules', r.rules, 'host_id', r.host_player_id,
              'host', (select name from hh_players where id = r.host_player_id),
              'winner', (select name from hh_players where id = r.winner_player_id)),
    'me', case when v_in then jsonb_build_object('in', true, 'role', mine.role, 'lives', mine.lives, 'alive', mine.alive,
              'kills', mine.kills, 'is_host', r.host_player_id = me.id,
              'next_attack_at', case when mine.last_attack_at is null then null else mine.last_attack_at + make_interval(secs => greatest(v_cd, 1)) end)
              else jsonb_build_object('in', false, 'is_host', false) end,
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'team_id', p.team_id,
                  'alive', rp.alive or rp.role = 'bad',
                  'role', case when r.status = 'ended' and coalesce((r.rules->>'reveal_roles_at_end')::boolean, true) then rp.role else null end)
                  order by (rp.alive or rp.role = 'bad') desc, p.name), '[]'::jsonb)
                  from hh_room_players rp join hh_players p on p.id = rp.player_id where rp.room_id = r.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'body', body, 'at', created_at) order by id), '[]'::jsonb)
                 from (select * from hh_room_events where room_id = r.id and id > coalesce(p_since_event, 0) order by id desc limit 60) e),
    'chat', case when v_in then (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'team_id', team_id, 'body', body, 'at', created_at, 'mine', player_id = me.id) order by id), '[]'::jsonb)
                 from (select * from hh_chat where room_id = r.id and id > coalesce(p_since_chat, 0) order by id desc limit 60) c) else '[]'::jsonb end
  );
end $$;

create or replace function hh_chat_send(p_token text, p_code text, p_body text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; r hh_rooms; mine hh_room_players; v_gap numeric := hh_cfg_num(array['lms','chatGapSeconds'], 2);
        v_body text := left(trim(coalesce(p_body, '')), 300);
begin
  me := hh_me(p_token);
  if v_body = '' then return; end if;
  select * into r from hh_rooms where code = upper(trim(p_code));
  if not found then raise exception 'Room not found.'; end if;
  if not coalesce((r.rules->>'chat')::boolean, true) then raise exception 'Chat is off in this room.'; end if;
  select * into mine from hh_room_players where room_id = r.id and player_id = me.id;
  if not found then raise exception 'Join the room to chat.'; end if;
  if r.status = 'live' and not mine.alive and not coalesce((r.rules->>'ghost_chat')::boolean, false) then
    raise exception 'You are out, so you can read the chat but not send.';
  end if;
  if exists (select 1 from hh_chat where room_id = r.id and player_id = me.id and created_at > now() - make_interval(secs => v_gap)) then
    raise exception 'Slow down a little.';
  end if;
  insert into hh_chat(room_id, player_id, name, team_id, body) values (r.id, me.id, me.name, me.team_id, v_body);
end $$;

-- Admin view of a room: every role and life
create or replace function hh_admin_room_view(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r hh_rooms;
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  select * into r from hh_rooms where code = upper(trim(p_code));
  if not found then raise exception 'Room not found.'; end if;
  return jsonb_build_object('room', to_jsonb(r),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'team_id', p.team_id, 'role', rp.role,
                 'lives', rp.lives, 'alive', rp.alive, 'kills', rp.kills) order by rp.role, rp.alive desc, p.name), '[]'::jsonb)
                 from hh_room_players rp join hh_players p on p.id = rp.player_id where rp.room_id = r.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('body', body, 'at', created_at) order by id desc), '[]'::jsonb)
                 from (select * from hh_room_events where room_id = r.id order by id desc limit 30) e));
end $$;

-- ─── TREASURE HUNT ──────────────────────────────────────────────────────────
create or replace function hh_hunt_row(p_team int) returns hh_hunt_progress
language plpgsql security definer set search_path = public as $$
declare h hh_hunt_progress;
begin
  insert into hh_hunt_progress(team_id) values (p_team) on conflict (team_id) do nothing;
  select * into h from hh_hunt_progress where team_id = p_team for update;
  return h;
end $$;

create or replace function hh_hunt_advance(p_team int, p_player uuid) returns text
language plpgsql security definer set search_path = public as $$
declare h hh_hunt_progress; v_total int; v_place int; v_pts int; v_station int := hh_cfg_num(array['hunt','stationPoints'], 0)::int;
begin
  h := hh_hunt_row(p_team);
  v_total := coalesce(array_length(h.route, 1), 0);
  if h.finished_at is not null then return 'Your team has already finished.'; end if;
  perform hh_add_points(p_team, p_player, v_station, 'Treasure hunt station', 'Treasure Hunt', 'hunt');
  if h.step + 1 >= v_total then
    select count(*) + 1 into v_place from hh_hunt_progress where finished_at is not null;
    update hh_hunt_progress set step = v_total, stage = 'find', hint_shown = false, finished_at = now(), place = v_place,
           last_message = 'Finished!', updated_at = now() where team_id = p_team;
    v_pts := coalesce((hh_cfg() #>> array['hunt','placePoints', (v_place - 1)::text])::int, (array[100,70,50,30])[v_place], 0);
    perform hh_add_points(p_team, null, v_pts, 'Treasure hunt: finished #' || v_place, 'Treasure Hunt', 'hunt');
    return 'You finished the hunt in place ' || v_place || '!';
  end if;
  update hh_hunt_progress set step = step + 1, stage = 'find', hint_shown = false, last_message = 'Station complete!', updated_at = now()
   where team_id = p_team;
  return 'Correct! Your next clue is unlocked.';
end $$;

create or replace function hh_hunt_view(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; h hh_hunt_progress; st hh_state; s jsonb := hh_state_get('hunt'); cur hh_hunt_stations; v_started boolean;
begin
  me := hh_me(p_token);
  h := hh_hunt_row(me.team_id);
  v_started := coalesce(s->>'status', 'off') = 'live' and (s->>'starts_at' is null or now() >= (s->>'starts_at')::timestamptz);
  if v_started and h.finished_at is null and h.step < coalesce(array_length(h.route, 1), 0) then
    select * into cur from hh_hunt_stations where id = h.route[h.step + 1];
  end if;
  return jsonb_build_object(
    'now', now(),
    'state', s,
    'started', v_started,
    'team_id', me.team_id,
    'step', h.step, 'total', coalesce(array_length(h.route, 1), 0), 'stage', h.stage,
    'finished', h.finished_at is not null, 'place', h.place, 'frozen_until', h.frozen_until,
    'hints_used', h.hints_used, 'message', h.last_message,
    'station', case when cur.id is null then null else jsonb_build_object(
        'name', case when h.stage = 'find' then null else cur.name end,
        'clue', cur.clue,
        'challenge', case when h.stage in ('challenge', 'waiting') then cur.challenge else null end,
        'check_mode', cur.check_mode,
        'has_hint', cur.hint <> '',
        'hint', case when h.hint_shown then cur.hint else null end) end,
    'hint_cost', hh_cfg_num(array['hunt','hintCost'], 10),
    'race', (select coalesce(jsonb_agg(jsonb_build_object('team_id', t.id, 'step', coalesce(p.step, 0), 'total', coalesce(array_length(p.route, 1), 0),
               'place', p.place) order by t.sort, t.id), '[]'::jsonb)
               from hh_teams t left join hh_hunt_progress p on p.team_id = t.id where t.active)
  );
end $$;

create or replace function hh_hunt_scan(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; h hh_hunt_progress; s jsonb := hh_state_get('hunt'); st hh_hunt_stations; v_code text := trim(coalesce(p_code, ''));
        v_freeze int := hh_cfg_num(array['hunt','decoyFreezeSeconds'], 120)::int; v_msg text;
begin
  me := hh_me(p_token);
  if coalesce(s->>'status', 'off') <> 'live' or (s->>'starts_at' is not null and now() < (s->>'starts_at')::timestamptz) then
    raise exception 'The treasure hunt has not started.';
  end if;
  if s->>'ends_at' is not null and now() > (s->>'ends_at')::timestamptz then raise exception 'The treasure hunt is over.'; end if;
  -- accept a full link too: take what follows s=
  if v_code ~ '[?&]s=' then v_code := substring(v_code from '[?&]s=([A-Za-z0-9]+)'); end if;
  select * into st from hh_hunt_stations where active and (qr_token = lower(v_code) or short_code = upper(v_code)) limit 1;
  if not found then return jsonb_build_object('ok', false, 'message', 'That code was not recognised.'); end if;
  h := hh_hunt_row(me.team_id);
  if h.finished_at is not null then return jsonb_build_object('ok', false, 'message', 'Your team has already finished.'); end if;
  if h.frozen_until is not null and h.frozen_until > now() then
    return jsonb_build_object('ok', false, 'message', 'Your team is frozen for a little longer.');
  end if;
  if st.is_decoy then
    update hh_hunt_progress set frozen_until = now() + make_interval(secs => v_freeze),
           last_message = 'Decoy! Frozen by ' || me.name || '.', updated_at = now() where team_id = me.team_id;
    return jsonb_build_object('ok', false, 'message', 'Decoy! Your team is frozen for ' || ceil(v_freeze / 60.0) || ' minute(s).');
  end if;
  if h.step >= coalesce(array_length(h.route, 1), 0) then
    return jsonb_build_object('ok', false, 'message', 'Your team has no route yet. Ask an admin.');
  end if;
  if st.id <> h.route[h.step + 1] then
    if st.id = any (h.route[1:h.step]) then
      return jsonb_build_object('ok', false, 'message', 'Your team has already done this station.');
    end if;
    return jsonb_build_object('ok', false, 'message', 'This is not your team''s next station. Keep looking!');
  end if;
  if h.stage <> 'find' then
    return jsonb_build_object('ok', true, 'message', 'Station found. Complete the challenge.');
  end if;
  if st.check_mode = 'none' then
    v_msg := hh_hunt_advance(me.team_id, me.id);
    return jsonb_build_object('ok', true, 'message', 'Station found! ' || v_msg);
  end if;
  update hh_hunt_progress set stage = case when st.check_mode = 'admin' then 'waiting' else 'challenge' end,
         last_message = me.name || ' found ' || st.name || '.', updated_at = now() where team_id = me.team_id;
  return jsonb_build_object('ok', true, 'message', 'You found ' || st.name || '! ' ||
    case when st.check_mode = 'admin' then 'Do the task and show an admin.' else 'Answer the challenge.' end);
end $$;

create or replace function hh_norm(t text) returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function hh_hunt_answer(p_token text, p_answer text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; h hh_hunt_progress; st hh_hunt_stations; ok boolean;
begin
  me := hh_me(p_token);
  h := hh_hunt_row(me.team_id);
  if h.stage <> 'challenge' then return jsonb_build_object('ok', false, 'message', 'Find the station first.'); end if;
  select * into st from hh_hunt_stations where id = h.route[h.step + 1];
  select exists (select 1 from unnest(string_to_array(st.answer, '|')) a where hh_norm(a) <> '' and hh_norm(a) = hh_norm(p_answer)) into ok;
  if not ok then return jsonb_build_object('ok', false, 'message', 'Not quite. Try again.'); end if;
  return jsonb_build_object('ok', true, 'message', hh_hunt_advance(me.team_id, me.id));
end $$;

create or replace function hh_hunt_hint(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me hh_players; h hh_hunt_progress; v_cost int := hh_cfg_num(array['hunt','hintCost'], 10)::int;
begin
  me := hh_me(p_token);
  h := hh_hunt_row(me.team_id);
  if h.hint_shown then return jsonb_build_object('ok', true); end if;
  if h.finished_at is not null then return jsonb_build_object('ok', false); end if;
  update hh_hunt_progress set hint_shown = true, hints_used = hints_used + 1, updated_at = now() where team_id = me.team_id;
  perform hh_add_points(me.team_id, null, -abs(v_cost), 'Treasure hunt hint', 'Treasure Hunt', 'hunt');
  return jsonb_build_object('ok', true);
end $$;

-- Admin: build routes. p_mode 'rotate' (each team starts at a different station) or 'shuffle'
create or replace function hh_admin_hunt_routes(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare base int[]; fin int[]; t record; i int := 0; n int; rt int[];
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  select coalesce(array_agg(id order by sort, id), '{}') into base from hh_hunt_stations where active and not is_decoy and not is_final;
  select coalesce(array_agg(id order by sort, id), '{}') into fin from hh_hunt_stations where active and not is_decoy and is_final;
  n := coalesce(array_length(base, 1), 0);
  for t in select id from hh_teams where active order by sort, id loop
    if n = 0 then rt := '{}';
    elsif p_mode = 'shuffle' then select array_agg(x order by random()) into rt from unnest(base) x;
    else rt := base[(i % n) + 1 : n] || base[1 : (i % n)];
    end if;
    insert into hh_hunt_progress(team_id, route) values (t.id, rt || fin)
    on conflict (team_id) do update set route = excluded.route, step = 0, stage = 'find', hints_used = 0, hint_shown = false,
      frozen_until = null, finished_at = null, place = null, last_message = '', updated_at = now();
    i := i + 1;
  end loop;
end $$;

create or replace function hh_admin_hunt_state(p_status text, p_delay int, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_start timestamptz := now() + make_interval(secs => greatest(coalesce(p_delay, 0), 0));
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  if p_status = 'live' then
    v := jsonb_build_object('status', 'live', 'starts_at', v_start,
           'ends_at', case when coalesce(p_minutes, 0) > 0 then v_start + make_interval(mins => p_minutes) else null end);
  else
    v := hh_state_get('hunt') || jsonb_build_object('status', p_status);
  end if;
  insert into hh_state(key, value, updated_at) values ('hunt', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- Admin: approve a task / skip a team past its current station
create or replace function hh_admin_hunt_advance(p_team int) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not hh_is_admin() then raise exception 'Only admins can do that.'; end if;
  return hh_hunt_advance(p_team, null);
end $$;

-- ─── AUDIT LOG (every admin change) ─────────────────────────────────────────
create or replace function hh_audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text; v_row jsonb; v_target text;
begin
  select email into v_actor from hh_admins where user_id = auth.uid();
  if v_actor is null then return coalesce(new, old); end if;
  v_row := to_jsonb(coalesce(new, old));
  v_target := tg_table_name || coalesce(' #' || (v_row->>'id'), '') ||
              coalesce(' "' || left(coalesce(v_row->>'name', v_row->>'title', v_row->>'reason', v_row->>'key', v_row->>'body'), 40) || '"', '');
  if tg_table_name = 'hh_points' and tg_op = 'INSERT' then
    v_target := (case when new.amount > 0 then '+' else '' end) || new.amount || ' to ' || coalesce((select name from hh_teams where id = new.team_id), '?') ||
                coalesce(' (' || nullif(new.reason, '') || ')', '');
  end if;
  insert into hh_audit(actor, action, target, detail)
  values (v_actor, lower(tg_op), v_target, case when tg_table_name in ('hh_settings', 'hh_players') then null else v_row end);
  return coalesce(new, old);
end $$;

create or replace function hh_points_bi() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  select email into v_actor from hh_admins where user_id = auth.uid();
  if v_actor is not null and coalesce(new.created_by, '') in ('', 'admin') then new.created_by := v_actor; end if;
  return new;
end $$;

create or replace function hh_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['hh_settings','hh_state','hh_teams','hh_games','hh_activities','hh_announcements','hh_points','hh_players','hh_hunt_stations','hh_admins','hh_rooms']
  loop
    execute format('drop trigger if exists hh_audit on %I', t);
    execute format('create trigger hh_audit after insert or update or delete on %I for each row execute function hh_audit_trg()', t);
  end loop;
end $$;
drop trigger if exists hh_points_bi on hh_points;
create trigger hh_points_bi before insert on hh_points for each row execute function hh_points_bi();
drop trigger if exists hh_touch on hh_settings;
create trigger hh_touch before update on hh_settings for each row execute function hh_touch();

-- ─── SECURITY RULES ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['hh_settings','hh_state','hh_teams','hh_players','hh_sessions','hh_admins','hh_points','hh_games','hh_activities',
                           'hh_announcements','hh_rooms','hh_room_players','hh_room_events','hh_chat','hh_hunt_stations','hh_hunt_progress','hh_audit']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
    execute format('drop policy if exists hh_admin_all on %I', t);
    execute format('create policy hh_admin_all on %I for all to authenticated using (hh_is_admin()) with check (hh_is_admin())', t);
  end loop;
  -- Public read for what everyone may see
  foreach t in array array['hh_settings','hh_state','hh_teams','hh_games'] loop
    execute format('drop policy if exists hh_public_read on %I', t);
    execute format('create policy hh_public_read on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
drop policy if exists hh_public_read on hh_activities;
create policy hh_public_read on hh_activities for select to anon, authenticated using (visible);
drop policy if exists hh_public_read on hh_announcements;
create policy hh_public_read on hh_announcements for select to anon, authenticated using (visible);

grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
-- Internal helpers: only the game functions may call these
do $$
declare f text;
begin
  foreach f in array array['hh_me(text)','hh_add_points(integer,uuid,integer,text,text,text)','hh_room_finish(integer)',
    'hh_room_event(integer,text,text)','hh_hunt_row(integer)','hh_hunt_advance(integer,uuid)','hh_audit_trg()','hh_points_bi()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ─── STARTING DATA (only added when empty) ──────────────────────────────────
insert into hh_settings(key, value) values ('app', '{}'::jsonb) on conflict (key) do nothing;

insert into hh_teams(name, color, motto, sort)
select * from (values ('Red', '#E23B3B', '', 1), ('Green', '#1E9E4A', '', 2), ('Blue', '#2F7BEA', '', 3), ('Purple', '#8B46E0', '', 4)) v(name, color, motto, sort)
where not exists (select 1 from hh_teams);

insert into hh_games(name, description, points, sort)
select * from (values ('Tug of war', '', '[40,30,20,10]'::jsonb, 1), ('Charades', '', '[30,20,10,5]'::jsonb, 2)) v(name, description, points, sort)
where not exists (select 1 from hh_games);

insert into hh_activities(title, details, time_label, status, sort)
select * from (values ('Arrival and sign-in', 'Open the site, pick your team and set your PIN.', '', 'live', 1),
                      ('Games', '', '', 'upcoming', 2), ('Winner reveal', '', '', 'upcoming', 3)) v(title, details, time_label, status, sort)
where not exists (select 1 from hh_activities);

select 'Hue & Harmony setup complete' as result;
