"""Build supabase/migrations/002_seed.sql from the reconciled preview data and the member contact list."""
import json, csv, sys
data_path, contacts_path, out_path = sys.argv[1:4]
D = json.load(open(data_path)); C = {r['member_id']: r for r in csv.DictReader(open(contacts_path))}
q = lambda v: 'null' if v in (None, '') else "'" + str(v).replace("'", "''") + "'"
n = lambda v: 'null' if v is None else f"{float(v):.2f}"
L = ["-- YBAC seed data: reconciled records Aug 2023 – 6 Oct 2026 (bank balance GHS 204,249.27).", "begin;"]
# members
for m in D['members']:
    c = C[m['id']]
    L.append(f"insert into members(id,title,full_name,email,phone,phone2,join_date) values ({q(m['id'])},{q(c['title'])},{q(m['name'])},{q(c['email'].lower())},{q(c['phone'])},{q(c['second_phone'])},'2023-08-01');")
# resolutions
ridx = {}
for i, r in enumerate(D['resolutions'], 1):
    ridx[r['rule']] = i
    L.append(f"insert into resolutions(id,reference,meeting_date,rule,value,effective_from,note) overriding system value values ({i},{q(r['id'])},{q(r['meeting'])},{q(r['rule'])},{'null' if r['value'] is None else r['value']},{q(r['from_'])},{q(r['note'])});")
L.append(f"select setval('resolutions_id_seq',{len(D['resolutions'])});")
# ventures
L += ["insert into ventures(id,name,description,status,shares_fixed_on,closed_on) values "
      "('tbill','Treasury bill 2024–25','GHS 100,000 Government of Ghana Treasury bill','Closed','2024-09-06','2025-06-10'),"
      "('ppe1','PPE Business 1','Import and sale of PPEs to COE. A further COE payment is expected; amount to be agreed.','Active','2025-12-31',null),"
      "('ppe2','PPE Business 2','Second order of PPEs (USD 75,000 first payment). Still collecting money for other costs.','Funding',null,null);"]
def bal(m, upto): return round(sum(t['amt'] for t in m['tx'] if t['t'] != 'admin' and t['d'] <= upto), 2)
for m in D['members']:
    L.append(f"insert into venture_shares values ('tbill',{q(m['id'])},{n(m['tbillBase'])},{m['tbillShare']:.12f});")
    L.append(f"insert into venture_shares values ('ppe1',{q(m['id'])},{n(bal(m,'2025-12-31'))},{m['ppeShare']:.12f});")
# declarations
L.append("insert into declarations(id,venture_id,declared_on,kind,profit,levy_rate,levy,resolution_id,note) overriding system value values "
         "(1,'tbill','2025-06-10','Final',17835.51,0,0,null,'Before the venture levy existed'),"
         f"(2,'ppe1','2026-04-30','Interim',496442.46,0.05,{D['levy']:.2f},{ridx['levy']},'Interim; further COE payment to be declared when agreed');")
L.append("select setval('declarations_id_seq',2);")
# association credits
rest = round(D['assocRounding'] - 0.10 - 0.13 - 0.14, 2)
L.append("insert into association_credits(credit_date,kind,amount,description,declaration_id) values "
         f"('2026-04-30','levy',{D['levy']:.2f},'Venture levy 5%: PPE Business 1 interim profit',2),"
         "('2025-06-10','rounding',0.10,'Rounding: Treasury bill interest',1),"
         "('2025-12-31','rounding',0.13,'Rounding: bank interest Aug 2023 – Dec 2025',null),"
         "('2026-04-30','rounding',0.14,'Rounding: PPE Business 1 interim profit',2),"
         f"('2026-09-30','rounding',{rest:.2f},'Rounding: bank interest Jan – Sep 2026',null);")
# cash entries
for e in D['cashbook']:
    to = e['to']; vid = side = None
    if to.startswith('v:'): vid, side, to = to[2:], e['kind'], 'venture'
    L.append(f"insert into cash_entries(entry_date,account,direction,amount,charged_to,venture_id,venture_side,category,description) values "
             f"({q(e['d'])},{q(e['acct'])},{q(e['dir'])},{n(e['amt'])},{q(to)},{q(vid)},{q(side)},{q(e.get('cat'))},{q(e['desc'])});")
# member transactions
tmap = {'admin': 'signon'}
for m in D['members']:
    for t in m['tx']:
        typ = tmap.get(t['t'], t['t'])
        vid = 'ppe1' if typ == 'profit' else ('tbill' if typ == 'tbill' else None)
        dec = 2 if typ == 'profit' else (1 if typ == 'tbill' else None)
        L.append(f"insert into member_tx(member_id,tx_date,type,amount,description,receipt_no,method,venture_id,declaration_id) values "
                 f"({q(m['id'])},{q(t['d'])},{q(typ)},{n(t['amt'])},{q(t['desc'])},{q(t.get('r'))},{q(t.get('method'))},{q(vid)},{'null' if dec is None else dec});")
# non-cash and payables
L.append("insert into noncash_settlements(venture_id,settled_on,amount,category,description) values "
         "('ppe1','2026-04-30',19200,'Management fee','Management fee: Fred, Joseph, Opare (GHS 6,400 each, credited to their balances)');")
L.append("insert into payables(venture_id,payee,description,amount,incurred_on,status) values "
         "('ppe1','Endowment fund','Endowment fund contribution from PPE Business 1',50000,'2026-04-20','Open');")
L.append("delete from audit_log;  -- start the audit trail clean after the import")
L.append("commit;")
open(out_path, 'w').write('\n'.join(L) + '\n')
print('lines', len(L))
