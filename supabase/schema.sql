-- PulseChat database schema for Supabase
-- ---------------------------------------------------------------------------
-- Run this file once in the Supabase SQL editor (Dashboard → SQL → New query).
-- It is safe to re-run: tables, indexes, functions, triggers and policies are
-- created with IF NOT EXISTS / CREATE OR REPLACE guards.
--
-- After running it, enable email auth in Authentication → Providers and add
-- your project URL + anon key to the app's .env file.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'New member',
  handle text not null unique,
  avatar_url text,
  status_message text,
  presence text not null default 'online'
    check (presence in ('online', 'away', 'dnd', 'offline')),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  icon_emoji text,
  accent text default 'violet',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null
    constraint workspace_members_workspace_id_fkey
    references public.workspaces (id) on delete cascade,
  user_id uuid not null
    constraint workspace_members_user_id_fkey
    references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  topic text,
  is_private boolean not null default false,
  is_dm boolean not null default false,
  dm_key text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text
);

create unique index if not exists channels_workspace_name_unique
  on public.channels (workspace_id, lower(name))
  where is_dm = false;

create unique index if not exists channels_workspace_dm_key_unique
  on public.channels (workspace_id, dm_key)
  where dm_key is not null;

create index if not exists channels_workspace_idx on public.channels (workspace_id);

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists public.channel_reads (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  parent_id uuid references public.messages (id) on delete cascade,
  sender_id uuid not null
    constraint messages_sender_id_fkey
    references public.profiles (id) on delete cascade,
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  is_edited boolean not null default false,
  is_pinned boolean not null default false,
  reply_count integer not null default 0,
  last_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at);
create index if not exists messages_parent_idx
  on public.messages (parent_id, created_at);
create index if not exists messages_pinned_idx
  on public.messages (channel_id, is_pinned)
  where is_pinned = true;
create index if not exists messages_content_search_idx
  on public.messages using gin (to_tsvector('simple', content));

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists reactions_message_idx on public.reactions (message_id);

-- Realtime needs full row images so updates and deletes render cleanly.
alter table public.messages replica identity full;
alter table public.reactions replica identity full;
alter table public.channels replica identity full;

-- ---------------------------------------------------------------------------
-- Access helpers (security definer avoids recursive RLS checks)
-- ---------------------------------------------------------------------------

create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id
  );
$$;

create or replace function public.is_workspace_admin(
  p_workspace_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id
      and wm.role = 'admin'
  );
$$;

create or replace function public.is_channel_member(
  p_channel_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.channel_members cm
    where cm.channel_id = p_channel_id
      and cm.user_id = p_user_id
  );
$$;

create or replace function public.channel_workspace(p_channel_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.workspace_id from public.channels c where c.id = p_channel_id;
$$;

create or replace function public.can_access_channel(
  p_channel_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.channels c
    where c.id = p_channel_id
      and public.is_workspace_member(c.workspace_id, p_user_id)
      and (c.is_private = false or public.is_channel_member(c.id, p_user_id))
  );
$$;

create or replace function public.can_manage_channel(
  p_channel_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_workspace_admin(public.channel_workspace(p_channel_id), p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- Profile creation trigger
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  base_handle text;
  final_handle text;
  suffix integer := 0;
begin
  base_handle := lower(
    regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1), 'member'),
      '[^a-z0-9_]',
      '',
      'g'
    )
  );

  if length(base_handle) < 3 then
    base_handle := 'member';
  end if;

  base_handle := left(base_handle, 20);
  final_handle := base_handle;

  while exists (select 1 from public.profiles where handle = final_handle) loop
    suffix := suffix + 1;
    final_handle := base_handle || suffix::text;
  end loop;

  insert into public.profiles (
    id,
    display_name,
    handle,
    status_message,
    presence,
    email
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1),
      'New member'
    ),
    final_handle,
    'Available',
    'online',
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any existing auth users who registered before the trigger was created
insert into public.profiles (id, display_name, handle, status_message, presence, email)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1), 'New member'),
  lower(regexp_replace(coalesce(u.raw_user_meta_data ->> 'handle', split_part(u.email, '@', 1), 'member'), '[^a-z0-9_]', '', 'g')) || '_' || substr(u.id::text, 1, 4),
  'Available',
  'online',
  u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Message aggregates: thread counts, channel previews
-- ---------------------------------------------------------------------------

create or replace function public.refresh_channel_preview(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  latest_at timestamptz;
  latest_preview text;
begin
  select
    m.created_at,
    left(
      btrim(regexp_replace(m.content, '[*_`#>~]+', '', 'g')),
      140
    )
  into latest_at, latest_preview
  from public.messages m
  where m.channel_id = p_channel_id
    and m.parent_id is null
  order by m.created_at desc
  limit 1;

  update public.channels
  set last_message_at = latest_at,
      last_message_preview = nullif(latest_preview, '')
  where id = p_channel_id;
end;
$$;

create or replace function public.handle_message_aggregates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      update public.messages
      set reply_count = reply_count + 1,
          last_reply_at = new.created_at
      where id = new.parent_id;
    else
      perform public.refresh_channel_preview(new.channel_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.parent_id is not null then
      update public.messages
      set reply_count = greatest(reply_count - 1, 0)
      where id = old.parent_id;
    else
      perform public.refresh_channel_preview(old.channel_id);
    end if;
    return old;
  else
    if new.parent_id is null then
      perform public.refresh_channel_preview(new.channel_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists on_message_aggregates on public.messages;
create trigger on_message_aggregates
  after insert or delete or update of content on public.messages
  for each row execute function public.handle_message_aggregates();

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists on_messages_updated on public.messages;
create trigger on_messages_updated
  before update on public.messages
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- RPCs used by the app
-- ---------------------------------------------------------------------------

create or replace function public.get_unread_counts(p_workspace_id uuid)
returns table (
  channel_id uuid,
  unread_count bigint,
  mention_count bigint,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select
      auth.uid() as uid,
      coalesce(
        (select p.handle from public.profiles p where p.id = auth.uid()),
        ''
      ) as handle
  )
  select
    c.id as channel_id,
    count(m.id) filter (
      where m.id is not null
        and m.sender_id <> me.uid
        and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
    ) as unread_count,
    count(m.id) filter (
      where m.id is not null
        and m.sender_id <> me.uid
        and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
        and me.handle <> ''
        and m.content ~* ('@' || me.handle || '($|[^a-zA-Z0-9_])')
    ) as mention_count,
    r.last_read_at
  from public.channels c
  cross join me
  left join public.channel_reads r
    on r.channel_id = c.id and r.user_id = me.uid
  left join public.messages m
    on m.channel_id = c.id and m.parent_id is null
  where c.workspace_id = p_workspace_id
    and public.can_access_channel(c.id, me.uid)
  group by c.id, r.last_read_at;
$$;

create or replace function public.set_message_pin(
  p_message_id uuid,
  p_pinned boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.messages
  set is_pinned = p_pinned
  where id = p_message_id
    and public.can_access_channel(channel_id, auth.uid());

  if not found then
    raise exception 'Message not found or access denied';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_reads enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;

-- Profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Workspaces ----------------------------------------------------------------
drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner on public.workspaces
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists workspaces_update_admin on public.workspaces;
create policy workspaces_update_admin on public.workspaces
  for update to authenticated
  using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces
  for delete to authenticated
  using (owner_id = auth.uid());

-- Workspace members ---------------------------------------------------------
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_workspace_admin(workspace_id)
  );

drop policy if exists workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_workspace_admin(workspace_id));

-- Channels ------------------------------------------------------------------
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select to authenticated
  using (public.can_access_channel(id));

drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists channels_delete on public.channels;
create policy channels_delete on public.channels
  for delete to authenticated
  using (public.can_manage_channel(id));

-- Channel members -----------------------------------------------------------
drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members
  for select to authenticated
  using (public.can_access_channel(channel_id));

drop policy if exists channel_members_insert on public.channel_members;
create policy channel_members_insert on public.channel_members
  for insert to authenticated
  with check (public.is_workspace_member(public.channel_workspace(channel_id)));

drop policy if exists channel_members_delete on public.channel_members;
create policy channel_members_delete on public.channel_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.can_manage_channel(channel_id)
  );

-- Channel reads -------------------------------------------------------------
drop policy if exists channel_reads_select on public.channel_reads;
create policy channel_reads_select on public.channel_reads
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists channel_reads_insert on public.channel_reads;
create policy channel_reads_insert on public.channel_reads
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_access_channel(channel_id)
  );

drop policy if exists channel_reads_update on public.channel_reads;
create policy channel_reads_update on public.channel_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Messages ------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.can_access_channel(channel_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_channel(channel_id)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (
    sender_id = auth.uid()
    or public.can_manage_channel(channel_id)
  )
  with check (
    sender_id = auth.uid()
    or public.can_manage_channel(channel_id)
  );

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (
    sender_id = auth.uid()
    or public.can_manage_channel(channel_id)
  );

-- Reactions -----------------------------------------------------------------
drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions
  for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.can_access_channel(m.channel_id)
    )
  );

drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.can_access_channel(m.channel_id)
    )
  );

drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: public bucket for message attachments and avatars
-- ---------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('chat-attachments', 'chat-attachments', true)
  on conflict (id) do update set public = true;
exception when others then null;
end $$;

do $$
begin
  drop policy if exists chat_attachments_read on storage.objects;
  create policy chat_attachments_read on storage.objects
    for select using (bucket_id = 'chat-attachments');
exception when others then null;
end $$;

do $$
begin
  drop policy if exists chat_attachments_insert on storage.objects;
  create policy chat_attachments_insert on storage.objects
    for insert with check (bucket_id = 'chat-attachments');
exception when others then null;
end $$;

do $$
begin
  drop policy if exists chat_attachments_update on storage.objects;
  create policy chat_attachments_update on storage.objects
    for update using (bucket_id = 'chat-attachments');
exception when others then null;
end $$;

do $$
begin
  drop policy if exists chat_attachments_delete on storage.objects;
  create policy chat_attachments_delete on storage.objects
    for delete using (bucket_id = 'chat-attachments');
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table public.reactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channels'
  ) then
    alter publication supabase_realtime add table public.channels;
  end if;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- Starter content helper
-- ---------------------------------------------------------------------------
-- New workspaces are created by the app itself (with a general + random
-- channel). To invite teammates, they can sign up and be added to
-- workspace_members, or you can insert rows directly:
--
-- insert into public.workspace_members (workspace_id, user_id, role)
-- values ('<workspace-id>', '<profile-id>', 'member');
-- ---------------------------------------------------------------------------
