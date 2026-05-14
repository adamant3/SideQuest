-- Automatically create a profile row whenever a new auth user is created.
-- The client-side sign-up flow also inserts with ignoreDuplicates as a fallback,
-- so either path guarantees a profile row exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, total_xp)
  values (
    new.id,
    'user_' || substr(new.id::text, 1, 8),
    0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop and recreate so this migration is idempotent
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
