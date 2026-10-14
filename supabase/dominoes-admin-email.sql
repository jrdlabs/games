-- One-time upgrade after dominoes-admin.sql; preserves the existing approved-email data.
begin;
alter table dominoes_private.admin_google_allowlist rename to admin_email_allowlist;
create table dominoes_private.admin_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null references dominoes_private.admin_email_allowlist(email)
);
alter table dominoes_private.admin_accounts enable row level security;
revoke all on dominoes_private.admin_accounts from public,anon,authenticated;
-- Bind identity only on creation. Later profile/email changes cannot enroll an account.
create function dominoes_private.provision_admin_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.is_anonymous,false)=false and exists(
  select 1 from dominoes_private.admin_email_allowlist where email=lower(new.email)
 ) then
  insert into dominoes_private.admin_accounts(user_id,email) values(new.id,lower(new.email)) on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke all on function dominoes_private.provision_admin_account() from public,anon,authenticated;
create trigger dominoes_provision_admin after insert on auth.users
for each row execute function dominoes_private.provision_admin_account();
insert into dominoes_private.admin_accounts(user_id,email)
select u.id,a.email from auth.users u join dominoes_private.admin_email_allowlist a on a.email=lower(u.email)
where coalesce(u.is_anonymous,false)=false on conflict do nothing;

create function dominoes_private.admin_account() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((
  select jsonb_build_object('approved',true,'needsPassword',coalesce(u.encrypted_password,'')='')
  from auth.users u join dominoes_private.admin_accounts a on a.user_id=u.id
  join dominoes_private.admin_email_allowlist e on e.email=a.email
  where u.id=auth.uid() and lower(u.email)=a.email
   and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false
 ),'{"approved":false,"needsPassword":false}'::jsonb);
$$;
revoke all on function dominoes_private.admin_account() from public,anon;
grant execute on function dominoes_private.admin_account() to authenticated;
create function public.dominoes_admin_account() returns jsonb
language sql security invoker set search_path='' as $$ select dominoes_private.admin_account(); $$;
revoke all on function public.dominoes_admin_account() from public,anon;
grant execute on function public.dominoes_admin_account() to authenticated;
create or replace function dominoes_private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select (dominoes_private.admin_account()->>'approved')::boolean
  and not (dominoes_private.admin_account()->>'needsPassword')::boolean;
$$;
-- Replace only the old sign-in guidance in the otherwise unchanged test dispatcher.
do $$
declare definition text;
begin
 select pg_get_functiondef('dominoes_private.admin_action(text,uuid,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'Admin access requires the approved verified Google account','Admin access requires the approved verified email/password account');
 execute definition;
end $$;
commit;
