-- Golem initial schema. Tenant isolation: RLS on every table, owner scoping.
-- The Worker also filters by owner id from the verified JWT on every query.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free','pro')),
  is_admin boolean not null default false,
  training_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  place_name text,
  place_id bigint,
  memory_summary text,
  memory_facts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz
);
create index projects_owner_idx on public.projects (owner_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  mode text check (mode in ('clay','stone','rune')),
  content text not null,
  tool_trace jsonb,
  created_at timestamptz not null default now()
);
create index messages_project_idx on public.messages (project_id, created_at);

create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('auto','manual','pre_agent')),
  r2_key text not null,
  script_count int not null default 0,
  instance_count int not null default 0,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index checkpoints_project_idx on public.checkpoints (project_id, created_at desc);

create table public.usage_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid,
  kind text not null,
  sparks int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  model text,
  created_at timestamptz not null default now()
);
create index usage_owner_idx on public.usage_events (owner_id, created_at desc);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'feedback' check (kind in ('feedback','bug','support')),
  content text not null check (char_length(content) between 1 and 5000),
  page text,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table public.studio_pairings (
  code text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz
);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.checkpoints enable row level security;
alter table public.usage_events enable row level security;
alter table public.feedback enable row level security;
alter table public.studio_pairings enable row level security;
alter table public.waitlist enable row level security;

create policy "own profile read" on public.profiles for select using ((select auth.uid()) = id);
create policy "own profile update" on public.profiles for update
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- users may edit display_name/training_opt_in, never their own plan or admin flag
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    new.is_admin := old.is_admin;
    new.plan := old.plan;
  end if;
  return new;
end $fn$;
create trigger protect_profile_fields before update on public.profiles
  for each row execute procedure public.protect_profile_fields();

create policy "own projects" on public.projects for all
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "own messages read" on public.messages for select using ((select auth.uid()) = owner_id);

create policy "own checkpoints read" on public.checkpoints for select using ((select auth.uid()) = owner_id);

create policy "own usage read" on public.usage_events for select using ((select auth.uid()) = owner_id);

create policy "own feedback insert" on public.feedback for insert with check ((select auth.uid()) = owner_id or owner_id is null);
create policy "own feedback read" on public.feedback for select using ((select auth.uid()) = owner_id);

-- pairings and waitlist are managed via the Worker (service role); no direct client access policies.
