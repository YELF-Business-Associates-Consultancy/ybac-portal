-- YBAC Funds Portal: database schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Money is numeric(14,2). Every movement is a row; balances are always computed, never stored.

begin;

-- ───────────────────────── Members and roles ─────────────────────────
create table public.members (
  id          text primary key,                       -- e.g. YBAC-001 (permanent)
  title       text,
  full_name   text not null,
  email       text unique,
  phone       text,
  phone2      text,
  join_date   date not null,
  status      text not null default 'active' check (status in ('active','inactive')),
  photo_path  text,                                   -- Supabase Storage path
  user_id     uuid unique references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.user_roles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  role     text not null check (role in ('member','assistant','admin'))
);

create or replace function public.my_role() returns text
  language sql stable security definer set search_path = public as
$$ select coalesce((select role from user_roles where user_id = auth.uid()), 'member') $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select my_role() = 'admin' $$;

create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path = public as
$$ select my_role() in ('admin','assistant') $$;

create or replace function public.my_member_id() returns text
  language sql stable security definer set search_path = public as
$$ select id from members where user_id = auth.uid() $$;


-- When someone signs in for the first time, link their login to the member with the same email.
create or replace function public.link_member_on_signup() returns trigger
  language plpgsql security definer set search_path = public as
$$ begin
  update members set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.link_member_on_signup();

-- ───────────────────────── Rates and resolutions ─────────────────────────
create table public.resolutions (
  id              bigserial primary key,
  reference       text not null,                      -- minute / resolution number
  meeting_date    date not null,
  rule            text not null check (rule in ('levy','dues','signon','bra','interest','deduction','minbal')),
  value           numeric(14,4),                      -- levy as a fraction (0.05); others in GHS
  effective_from  date not null,
  note            text not null,
  minutes_path    text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);

-- ───────────────────────── Ventures ─────────────────────────
create table public.ventures (
  id               text primary key,                  -- e.g. ppe1
  name             text not null,
  description      text,
  status           text not null check (status in ('Funding','Active','Closed')),
  shares_fixed_on  date,
  closed_on        date,
  created_at       timestamptz not null default now(),
  check ((status = 'Funding') = (shares_fixed_on is null))
);

create table public.venture_shares (
  venture_id        text references public.ventures(id) on delete restrict,
  member_id         text references public.members(id) on delete restrict,
  balance_at_start  numeric(14,2) not null,
  share             numeric(14,12) not null check (share >= 0 and share <= 1),
  primary key (venture_id, member_id)
);

create table public.declarations (
  id             bigserial primary key,
  venture_id     text not null references public.ventures(id),
  declared_on    date not null,
  kind           text not null check (kind in ('Interim','Final')),
  profit         numeric(14,2) not null,
  levy_rate      numeric(6,4) not null default 0,
  levy           numeric(14,2) not null default 0,
  resolution_id  bigint references public.resolutions(id),
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

-- ───────────────────────── Cashbook (bank and petty cash) ─────────────────────────
create table public.cash_entries (
  id            bigserial primary key,
  entry_date    date not null,
  account       text not null check (account in ('bank','petty')),
  direction     text not null check (direction in ('in','out')),
  amount        numeric(14,2) not null check (amount > 0),
  charged_to    text not null check (charged_to in ('members','association','suspense','bankint','venture','transfer')),
  venture_id    text references public.ventures(id),
  venture_side  text check (venture_side in ('in','back')),   -- money into the venture / money back from it
  category      text,
  description   text not null,
  reference     text,
  document_path text,
  voided        boolean not null default false,
  void_reason   text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  check ((charged_to = 'venture') = (venture_id is not null and venture_side is not null))
);

-- ───────────────────────── Member ledger ─────────────────────────
create table public.member_tx (
  id              bigserial primary key,
  member_id       text not null references public.members(id),
  tx_date         date not null,
  type            text not null check (type in ('dues','bra','other','signon','tbill','bankint','profit','loss','withdrawal')),
  amount          numeric(14,2) not null,
  description     text not null,
  receipt_no      text unique,
  method          text,
  reference       text,
  venture_id      text references public.ventures(id),
  declaration_id  bigint references public.declarations(id),
  cash_entry_id   bigint references public.cash_entries(id),
  reverses        bigint references public.member_tx(id),
  voided          boolean not null default false,
  void_reason     text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create index on public.member_tx (member_id, tx_date);

-- Non-cash credits to the association (venture levies, rounding remainders)
create table public.association_credits (
  id              bigserial primary key,
  credit_date     date not null,
  kind            text not null check (kind in ('levy','rounding')),
  amount          numeric(14,2) not null,
  description     text not null,
  declaration_id  bigint references public.declarations(id),
  created_at      timestamptz not null default now()
);

-- Venture costs settled without cash (e.g. a fee credited to members' balances)
create table public.noncash_settlements (
  id           bigserial primary key,
  venture_id   text not null references public.ventures(id),
  settled_on   date not null,
  amount       numeric(14,2) not null check (amount > 0),
  category     text not null,
  description  text not null,
  created_at   timestamptz not null default now()
);

create table public.payables (
  id           bigserial primary key,
  venture_id   text references public.ventures(id),          -- null = association
  payee        text not null,
  description  text not null,
  amount       numeric(14,2) not null check (amount > 0),
  incurred_on  date not null,
  due_on       date,
  status       text not null default 'Open' check (status in ('Open','Part-paid','Paid','Written off')),
  paid_entry_id bigint references public.cash_entries(id),
  created_at   timestamptz not null default now()
);

create table public.receivables (
  id           bigserial primary key,
  venture_id   text references public.ventures(id),
  payer        text not null,
  description  text not null,
  amount       numeric(14,2) not null check (amount > 0),
  agreed_on    date not null,
  due_on       date,
  status       text not null default 'Open' check (status in ('Open','Part-received','Received','Written off')),
  created_at   timestamptz not null default now()
);

create table public.withdrawal_requests (
  id               bigserial primary key,
  member_id        text not null references public.members(id),
  requested_at     timestamptz not null default now(),
  amount           numeric(14,2) not null check (amount > 0),
  amount_approved  numeric(14,2),
  method           text not null check (method in ('Mobile Money','Bank account')),
  reason           text,
  status           text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Paid','Cancelled')),
  admin_note       text,
  payment_reference text,
  decided_by       uuid,
  decided_at       timestamptz
);

-- ───────────────────────── Audit log ─────────────────────────
create table public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  action      text not null,
  table_name  text not null,
  record_id   text,
  before      jsonb,
  after       jsonb
);

create or replace function public.audit() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  insert into audit_log(action, table_name, record_id, before, after)
  values (tg_op, tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', ''),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['members','user_roles','resolutions','ventures','venture_shares','declarations','cash_entries',
                           'member_tx','association_credits','noncash_settlements','payables','receivables','withdrawal_requests']
  loop execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit()', t);
  end loop; end $$;

-- ───────────────────────── Views (computed balances) ─────────────────────────
create or replace view public.member_balances with (security_invoker = true) as
select m.id as member_id, m.full_name,
       coalesce(sum(t.amount) filter (where t.type <> 'signon' and not t.voided), 0)::numeric(14,2)                         as balance,
       coalesce(sum(t.amount) filter (where t.type in ('dues','bra','other') and not t.voided), 0)::numeric(14,2)          as contributed,
       coalesce(sum(t.amount) filter (where t.type in ('tbill','bankint','profit','loss') and not t.voided), 0)::numeric(14,2) as earned,
       coalesce(-sum(t.amount) filter (where t.type = 'withdrawal' and not t.voided), 0)::numeric(14,2)                    as withdrawn
from public.members m left join public.member_tx t on t.member_id = m.id
group by m.id, m.full_name;

create or replace view public.account_balances with (security_invoker = true) as
select account, sum(case when direction='in' then amount else -amount end)::numeric(14,2) as balance
from public.cash_entries where not voided group by account;

create or replace view public.venture_books with (security_invoker = true) as
select v.id as venture_id, v.name, v.status,
  coalesce((select sum(amount) from cash_entries c where c.venture_id=v.id and c.venture_side='in'   and not c.voided),0)  as money_in_paid_cash,
  coalesce((select sum(amount) from noncash_settlements n where n.venture_id=v.id),0)                                       as money_in_noncash,
  coalesce((select sum(amount) from payables p where p.venture_id=v.id and p.status in ('Open','Part-paid')),0)             as payables_open,
  coalesce((select sum(amount) from cash_entries c where c.venture_id=v.id and c.venture_side='back' and not c.voided),0)  as money_back,
  coalesce((select sum(amount) from receivables r where r.venture_id=v.id and r.status in ('Open','Part-received')),0)      as receivables_open,
  coalesce((select sum(profit) from declarations d where d.venture_id=v.id),0)                                              as declared
from public.ventures v;

create or replace view public.association_balance with (security_invoker = true) as
select ( coalesce((select sum(case when direction='in' then amount else -amount end) from cash_entries where charged_to='association' and not voided),0)
       + coalesce((select sum(amount) from association_credits),0)
       )::numeric(14,2) as balance;

-- Reconciliation: cash the books say we hold vs bank + petty cash
create or replace view public.reconciliation with (security_invoker = true) as
with v as (select sum(money_back - money_in_paid_cash - money_in_noncash - declared) as net from venture_books),
     s as (select coalesce(sum(case when direction='in' then amount else -amount end),0) as amt from cash_entries where charged_to='suspense' and not voided)
select (select sum(balance) from member_balances)        as members_funds,
       (select balance from association_balance)          as association,
       (select amt from s)                                as suspense,
       (select net from v)                                as ventures_net,
       ((select sum(balance) from member_balances) + (select balance from association_balance) + (select amt from s) + (select net from v))::numeric(14,2) as books_cash,
       (select coalesce(sum(balance),0) from account_balances)::numeric(14,2) as bank_plus_petty;


-- Performance for a period: contributed, earned, time-weighted average balance and return.
-- p_member null = whole group (totals only, open to every signed-in member);
-- a member id = that member only (allowed for the member themself and for staff).
create or replace function public.performance(p_from date, p_to date, p_member text default null)
returns table(contributed numeric, earned numeric, withdrawn numeric, avg_balance numeric, return_pct numeric, annual_pct numeric)
language plpgsql stable security definer set search_path = public as
$$
declare days int := (p_to - p_from) + 1;
begin
  if p_member is not null and p_member is distinct from my_member_id() and not is_staff() then
    raise exception 'not allowed';
  end if;
  return query
  with t as (
    select amount, type, tx_date from member_tx
    where not voided and type <> 'signon' and tx_date <= p_to and (p_member is null or member_id = p_member)
  ), agg as (
    select coalesce(sum(amount) filter (where type in ('dues','bra','other') and tx_date >= p_from),0) as c,
           coalesce(sum(amount) filter (where type in ('tbill','bankint','profit','loss') and tx_date >= p_from),0) as e,
           coalesce(-sum(amount) filter (where type = 'withdrawal' and tx_date >= p_from),0) as w,
           coalesce(sum(amount * (p_to + 1 - greatest(tx_date, p_from))),0)::numeric / days as avgb
    from t)
  select round(c,2), round(e,2), round(w,2), round(avgb,2),
         case when avgb > 0 then round(e / avgb * 100, 2) end,
         case when avgb > 0 then round(e / avgb * 365.0 / days * 100, 2) end
  from agg;
end $$;
grant execute on function public.performance(date, date, text) to authenticated;

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.members              enable row level security;
alter table public.user_roles           enable row level security;
alter table public.resolutions          enable row level security;
alter table public.ventures             enable row level security;
alter table public.venture_shares       enable row level security;
alter table public.declarations         enable row level security;
alter table public.cash_entries         enable row level security;
alter table public.member_tx            enable row level security;
alter table public.association_credits  enable row level security;
alter table public.noncash_settlements  enable row level security;
alter table public.payables             enable row level security;
alter table public.receivables          enable row level security;
alter table public.withdrawal_requests  enable row level security;
alter table public.audit_log            enable row level security;

-- Members: see own row; staff see all; only admin changes.
create policy members_read  on public.members for select to authenticated using (user_id = auth.uid() or is_staff());
create policy members_admin on public.members for all    to authenticated using (is_admin()) with check (is_admin());
create policy members_staff_insert on public.members for insert to authenticated with check (is_staff());

create policy roles_read  on public.user_roles for select to authenticated using (user_id = auth.uid() or is_admin());
create policy roles_admin on public.user_roles for all    to authenticated using (is_admin()) with check (is_admin());

-- Member ledger: own rows; staff read all; assistant may only add payments; admin everything.
create policy tx_read   on public.member_tx for select to authenticated using (member_id = my_member_id() or is_staff());
create policy tx_staff_insert on public.member_tx for insert to authenticated
  with check (is_admin() or (is_staff() and type in ('dues','bra','other','signon')));
create policy tx_admin_update on public.member_tx for update to authenticated using (is_admin()) with check (is_admin());

-- Group-wide reference data: every signed-in member can read (transparency); only admin writes.
create policy res_read    on public.resolutions    for select to authenticated using (true);
create policy res_admin   on public.resolutions    for all    to authenticated using (is_admin()) with check (is_admin());
create policy ven_read    on public.ventures       for select to authenticated using (true);
create policy ven_admin   on public.ventures       for all    to authenticated using (is_admin()) with check (is_admin());
create policy dec_read    on public.declarations   for select to authenticated using (true);
create policy dec_admin   on public.declarations   for all    to authenticated using (is_admin()) with check (is_admin());

-- Shares: own share visible; staff see all.
create policy vs_read  on public.venture_shares for select to authenticated using (member_id = my_member_id() or is_staff());
create policy vs_admin on public.venture_shares for all    to authenticated using (is_admin()) with check (is_admin());

-- Books: staff read; assistant may add cashbook entries; admin everything.
create policy cash_read   on public.cash_entries for select to authenticated using (is_staff());
create policy cash_insert on public.cash_entries for insert to authenticated with check (is_staff());
create policy cash_admin  on public.cash_entries for update to authenticated using (is_admin()) with check (is_admin());
create policy ac_read  on public.association_credits for select to authenticated using (is_staff());
create policy ac_admin on public.association_credits for all    to authenticated using (is_admin()) with check (is_admin());
create policy nc_read  on public.noncash_settlements for select to authenticated using (is_staff());
create policy nc_admin on public.noncash_settlements for all    to authenticated using (is_admin()) with check (is_admin());
create policy pay_read  on public.payables    for select to authenticated using (is_staff());
create policy pay_admin on public.payables    for all    to authenticated using (is_admin()) with check (is_admin());
create policy rec_read  on public.receivables for select to authenticated using (is_staff());
create policy rec_admin on public.receivables for all    to authenticated using (is_admin()) with check (is_admin());

-- Withdrawals: member creates and sees own; admin decides.
create policy wr_read   on public.withdrawal_requests for select to authenticated using (member_id = my_member_id() or is_staff());
create policy wr_create on public.withdrawal_requests for insert to authenticated with check (member_id = my_member_id() and status = 'Pending');
create policy wr_cancel on public.withdrawal_requests for update to authenticated
  using (member_id = my_member_id() and status = 'Pending') with check (status = 'Cancelled');
create policy wr_admin  on public.withdrawal_requests for update to authenticated using (is_admin()) with check (is_admin());

create policy audit_read on public.audit_log for select to authenticated using (is_admin());

-- No deletes anywhere except by admin through voids/reversals; hard deletes are blocked for everyone via the API.
revoke delete on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;

commit;
