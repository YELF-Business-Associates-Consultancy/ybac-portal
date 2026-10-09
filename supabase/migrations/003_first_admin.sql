-- Make the first administrator. Run once, straight after you (the administrator) have
-- signed in to the app for the first time and before anyone else has.
-- It gives the admin role to the earliest login, then shows who that is so you can confirm.
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users order by created_at limit 1
on conflict (user_id) do update set role = 'admin';

-- Check: should show your email with role admin and your member ID.
select u.email, r.role, m.id as member_id
from public.user_roles r join auth.users u on u.id = r.user_id left join public.members m on m.user_id = u.id
where r.role = 'admin';
