-- YBAC Funds Portal: fixing (freezing) a venture's member shares from the app.
-- Run in Supabase → SQL Editor after 005_imports.sql.
-- A member's share = their balance on the start date ÷ all members' balances on that date
-- (contributions + reinvested earnings − withdrawals; sign-on fees excluded). Members with no balance get no share.

begin;

-- Preview: what each member's share would be if fixed on p_date. Changes nothing. Officers only.
create or replace function public.preview_venture_shares(p_date date)
returns table(member_id text, full_name text, balance numeric, share numeric)
language plpgsql stable security definer set search_path = public as
$$
begin
  if not is_staff() then raise exception 'Only officers can preview shares.'; end if;
  return query
  with b as (
    select m.id, m.full_name, coalesce(sum(t.amount), 0)::numeric(14,2) as bal
    from members m left join member_tx t on t.member_id = m.id and not t.voided and t.type <> 'signon' and t.tx_date <= p_date
    group by m.id, m.full_name)
  select b.id, b.full_name, b.bal, round(b.bal / nullif(sum(b.bal) over (), 0), 12)
  from b where b.bal > 0 order by b.bal desc;
end $$;

-- Fix the shares: admin only, venture must still be in Funding. All-or-nothing.
create or replace function public.fix_venture_shares(p_venture text, p_date date)
returns int language plpgsql security definer set search_path = public as
$$
declare v ventures; n int;
begin
  if not is_admin() then raise exception 'Only the admin can fix venture shares.'; end if;
  select * into v from ventures where id = p_venture for update;
  if v.id is null then raise exception 'Unknown venture %', p_venture; end if;
  if v.status <> 'Funding' then raise exception '% is %, not Funding: its shares are already fixed.', v.name, v.status; end if;
  if p_date > current_date then raise exception 'The start date cannot be in the future.'; end if;
  insert into venture_shares(venture_id, member_id, balance_at_start, share)
  select p_venture, p.member_id, p.balance, p.share from preview_venture_shares(p_date) p;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No member had a balance on %.', p_date; end if;
  update ventures set status = 'Active', shares_fixed_on = p_date where id = p_venture;
  return n;
end $$;

-- Undo a mistaken fix (admin only), allowed only while nothing has been declared for the venture.
create or replace function public.unfix_venture_shares(p_venture text, p_reason text)
returns void language plpgsql security definer set search_path = public as
$$
begin
  if not is_admin() then raise exception 'Only the admin can undo fixed shares.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason.'; end if;
  if exists (select 1 from declarations where venture_id = p_venture) then
    raise exception 'Profit has already been declared on this venture, so its shares can no longer be changed.';
  end if;
  if exists (select 1 from member_tx where venture_id = p_venture and not voided) then
    raise exception 'Members have already been credited from this venture, so its shares can no longer be changed.';
  end if;
  delete from venture_shares where venture_id = p_venture;
  update ventures set status = 'Funding', shares_fixed_on = null where id = p_venture;
  insert into audit_log(action, table_name, record_id, after)
  values ('UNFIX_SHARES', 'ventures', p_venture, jsonb_build_object('reason', p_reason));
end $$;

grant execute on function public.preview_venture_shares(date), public.fix_venture_shares(text, date),
  public.unfix_venture_shares(text, text) to authenticated;

commit;
