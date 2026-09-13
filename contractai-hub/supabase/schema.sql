-- =============================================================================
-- EnContract — Complete Supabase Database & Storage Setup
-- Run this SQL in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqmtpizpukqrxwezlfea/sql/new
-- =============================================================================

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Automatically create profile on new user registration
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    name = coalesce(excluded.name, public.profiles.name),
    email = coalesce(excluded.email, public.profiles.email),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. WORKSPACES TABLE
create table if not exists public.workspaces (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

alter table public.workspaces enable row level security;

drop policy if exists "Users can view own workspaces" on public.workspaces;
create policy "Users can view own workspaces"
  on public.workspaces for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own workspaces" on public.workspaces;
create policy "Users can insert own workspaces"
  on public.workspaces for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own workspaces" on public.workspaces;
create policy "Users can update own workspaces"
  on public.workspaces for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own workspaces" on public.workspaces;
create policy "Users can delete own workspaces"
  on public.workspaces for delete
  using (auth.uid() = user_id);


-- 3. CONTRACTS TABLE
create table if not exists public.contracts (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id text references public.workspaces(id) on delete cascade,
  title text not null,
  file_key text not null,
  size bigint default 0,
  status text default 'uploaded',
  created_at timestamptz default now(),
  text text,
  analysis jsonb,
  actions jsonb default '{}'::jsonb
);

alter table public.contracts enable row level security;

drop policy if exists "Users can view own contracts" on public.contracts;
create policy "Users can view own contracts"
  on public.contracts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own contracts" on public.contracts;
create policy "Users can insert own contracts"
  on public.contracts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own contracts" on public.contracts;
create policy "Users can update own contracts"
  on public.contracts for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own contracts" on public.contracts;
create policy "Users can delete own contracts"
  on public.contracts for delete
  using (auth.uid() = user_id);


-- 4. CONTRACT CHAT MESSAGES TABLE
create table if not exists public.chat_messages (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  contract_id text references public.contracts(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;

drop policy if exists "Users can view own chat messages" on public.chat_messages;
create policy "Users can view own chat messages"
  on public.chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own chat messages" on public.chat_messages;
create policy "Users can insert own chat messages"
  on public.chat_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own chat messages" on public.chat_messages;
create policy "Users can update own chat messages"
  on public.chat_messages for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own chat messages" on public.chat_messages;
create policy "Users can delete own chat messages"
  on public.chat_messages for delete
  using (auth.uid() = user_id);


-- 5. GENERAL CHAT MESSAGES TABLE
create table if not exists public.general_chat_messages (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.general_chat_messages enable row level security;

drop policy if exists "Users can view own general chat" on public.general_chat_messages;
create policy "Users can view own general chat"
  on public.general_chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own general chat" on public.general_chat_messages;
create policy "Users can insert own general chat"
  on public.general_chat_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own general chat" on public.general_chat_messages;
create policy "Users can update own general chat"
  on public.general_chat_messages for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own general chat" on public.general_chat_messages;
create policy "Users can delete own general chat"
  on public.general_chat_messages for delete
  using (auth.uid() = user_id);


-- 6. STORAGE BUCKET & POLICIES FOR CONTRACT FILES
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', true)
on conflict (id) do update set public = true;

drop policy if exists "Users can upload own contract files" on storage.objects;
create policy "Users can upload own contract files"
  on storage.objects for insert
  with check (
    bucket_id = 'contracts' and
    (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can view and download own contract files" on storage.objects;
create policy "Users can view and download own contract files"
  on storage.objects for select
  using (
    bucket_id = 'contracts' and
    (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own contract files" on storage.objects;
create policy "Users can update own contract files"
  on storage.objects for update
  using (
    bucket_id = 'contracts' and
    (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own contract files" on storage.objects;
create policy "Users can delete own contract files"
  on storage.objects for delete
  using (
    bucket_id = 'contracts' and
    (auth.uid())::text = (storage.foldername(name))[1]
  );

