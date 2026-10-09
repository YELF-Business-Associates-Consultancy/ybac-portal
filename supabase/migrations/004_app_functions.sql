-- YBAC Funds Portal: functions used by the app.
-- Run in Supabase → SQL Editor after 001_schema.sql (and after the seed data).
-- Each function is one all-or-nothing step and checks the caller's role inside the database.

begin;

-- Only people on the member list (or already given a staff role) can create a login.
create or replace function public.gate_signup() returns trigger
  language plpgsql security definer set search_path = public as
$$ begin
  if not exists (select 1 from members where lower(email) = lower(new.email)) then
    raise exception 'This email is not on the YBAC member list. Ask the administrator to add it.';
  end if;
  return new;
end $$;
drop trigger if exists gate_signup on auth.users;
create trigger gate_signup before insert on auth.users for each row execute function public.gate_signup();

-- Receipt numbers: YBAC-<year>-<6 digits>, never reused.
create sequence if not exists public.receipt_seq start 1;
create or replace function public.next_receipt_no(p_kind text default 'R') returns text
  language sql volatile security definer set search_path = public as
$$ select 'YBAC-' || case when p_kind = 'PV' then 'PV-' else '' end
          || to_char(now(), 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0') $$;

-- Record a member payment: cashbook entry + member ledger line + receipt number, together.
create or replace function public.record_member_payment(
  p_member text, p_type text, p_amount numeric, p_date date, p_account text,
  p_method text, p_reference text default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as
$$
declare v_cash bigint; v_rcpt text; v_desc text; v_name text;
begin
  if not is_staff() then raise exception 'Only the admin or assistant can record payments.'; end if;
  if p_type not in ('dues','bra','other','signon') then raise exception 'Unknown payment type %', p_type; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero.'; end if;
  select full_name into v_name from members where id = p_member;
  if v_name is null then raise exception 'Unknown member %', p_member; end if;
  v_desc := case p_type when 'dues' then 'Monthly dues' when 'bra' then 'BRA Contribution'
                        when 'other' then 'Additional investment' else 'Membership sign-on fee (to association)' end
            || coalesce(' – ' || nullif(p_note, ''), '');
  v_rcpt := next_receipt_no();
  insert into cash_entries(entry_date, account, direction, amount, charged_to, category, description, reference)
  values (p_date, p_account, 'in', p_amount, case when p_type = 'signon' then 'association' else 'members' end,
          case when p_type = 'signon' then 'Sign-on fees' else 'Member contributions' end,
          v_desc || ' from ' || v_name || ' (' || v_rcpt || ')', p_reference)
  returning id into v_cash;
  insert into member_tx(member_id, tx_date, type, amount, description, receipt_no, method, reference, cash_entry_id)
  values (p_member, p_date, p_type, p_amount, v_desc, v_rcpt, p_method, p_reference, v_cash);
  return v_rcpt;
end $$;

-- Admin decision on a withdrawal request.
create or replace function public.decide_withdrawal(p_id bigint, p_approve boolean, p_amount numeric default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as
$$
begin
  if not is_admin() then raise exception 'Only the admin can decide withdrawals.'; end if;
  update withdrawal_requests
     set status = case when p_approve then 'Approved' else 'Rejected' end,
         amount_approved = case when p_approve then coalesce(p_amount, amount) end,
         admin_note = p_note, decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'Pending';
  if not found then raise exception 'That request is no longer pending.'; end if;
end $$;

-- Mark an approved withdrawal paid: cashbook out + member ledger + payment voucher.
create or replace function public.pay_withdrawal(p_id bigint, p_reference text, p_date date default current_date)
returns text language plpgsql security definer set search_path = public as
$$
declare r withdrawal_requests; v_cash bigint; v_pv text; v_name text; v_bal numeric;
begin
  if not is_admin() then raise exception 'Only the admin can pay withdrawals.'; end if;
  select * into r from withdrawal_requests where id = p_id for update;
  if r.status <> 'Approved' then raise exception 'Only approved requests can be paid.'; end if;
  select balance into v_bal from member_balances where member_id = r.member_id;
  if v_bal < r.amount_approved then raise exception 'The member''s balance (%) is below the approved amount.', v_bal; end if;
  select full_name into v_name from members where id = r.member_id;
  v_pv := next_receipt_no('PV');
  insert into cash_entries(entry_date, account, direction, amount, charged_to, category, description, reference)
  values (p_date, 'bank', 'out', r.amount_approved, 'members', 'Withdrawals', 'Withdrawal paid to ' || v_name || ' (' || v_pv || ')', p_reference)
  returning id into v_cash;
  insert into member_tx(member_id, tx_date, type, amount, description, receipt_no, method, reference, cash_entry_id)
  values (r.member_id, p_date, 'withdrawal', -r.amount_approved, 'Withdrawal (' || r.method || ')', v_pv, r.method, p_reference, v_cash);
  update withdrawal_requests set status = 'Paid', payment_reference = p_reference where id = p_id;
  return v_pv;
end $$;

-- Record bank interest and share it to members by balance on that date (levy-free); rounding to the association.
create or replace function public.share_bank_interest(p_date date, p_amount numeric, p_account text default 'bank')
returns numeric language plpgsql security definer set search_path = public as
$$
declare v_total numeric; v_given numeric := 0; v_cash bigint; m record; v_amt numeric;
begin
  if not is_admin() then raise exception 'Only the admin can share bank interest.'; end if;
  if p_amount <= 0 then raise exception 'Enter an amount greater than zero.'; end if;
  insert into cash_entries(entry_date, account, direction, amount, charged_to, category, description)
  values (p_date, p_account, 'in', p_amount, 'bankint', 'Bank interest', 'Interest on savings')
  returning id into v_cash;
  select sum(amount) into v_total from member_tx where not voided and type <> 'signon' and tx_date <= p_date;
  for m in select member_id, sum(amount) as bal from member_tx
           where not voided and type <> 'signon' and tx_date <= p_date group by member_id having sum(amount) > 0 loop
    v_amt := floor(p_amount * m.bal / v_total * 100) / 100;
    if v_amt > 0 then
      insert into member_tx(member_id, tx_date, type, amount, description, cash_entry_id)
      values (m.member_id, p_date, 'bankint', v_amt, 'Bank interest, shared by balance', v_cash);
      v_given := v_given + v_amt;
    end if;
  end loop;
  if p_amount - v_given > 0 then
    insert into association_credits(credit_date, kind, amount, description)
    values (p_date, 'rounding', p_amount - v_given, 'Rounding: bank interest ' || to_char(p_date, 'Mon YYYY'));
  end if;
  return p_amount - v_given;
end $$;

-- Month-end balance and money contributed, for the dashboard chart.
-- p_member null = whole group (totals only); otherwise the caller's own record (or any, for staff).
create or replace function public.monthly_series(p_member text default null)
returns table(month_end date, contributed numeric, balance numeric)
language plpgsql stable security definer set search_path = public as
$$
begin
  if p_member is not null and p_member is distinct from my_member_id() and not is_staff() then
    raise exception 'not allowed';
  end if;
  return query
  with months as (
    select (date_trunc('month', g) + interval '1 month - 1 day')::date as me
    from generate_series(date '2023-08-01', current_date, interval '1 month') g
  )
  select least(m.me, current_date),
         coalesce(sum(t.amount) filter (where t.type in ('dues','bra','other','withdrawal')), 0)::numeric(14,2),
         coalesce(sum(t.amount), 0)::numeric(14,2)
  from months m
  left join member_tx t on not t.voided and t.type <> 'signon' and t.tx_date <= m.me
                        and (p_member is null or t.member_id = p_member)
  group by m.me order by m.me;
end $$;

grant execute on function public.next_receipt_no(text), public.record_member_payment(text,text,numeric,date,text,text,text,text),
  public.decide_withdrawal(bigint,boolean,numeric,text), public.pay_withdrawal(bigint,text,date),
  public.share_bank_interest(date,numeric,text), public.monthly_series(text) to authenticated;
revoke execute on function public.next_receipt_no(text) from anon;

commit;
