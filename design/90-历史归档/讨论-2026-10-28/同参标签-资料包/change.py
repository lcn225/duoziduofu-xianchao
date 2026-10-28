import csv

SRC = 'tags_all_468.csv'
DST = 'tags_all_468_final.csv'

PATCH = {
    'x_lingshou_0035': ('锋锐', '灵长', '灵兽'),
    'x_lingshou_0032': ('破甲|锋锐', '獾', '灵兽'),
    'x_lingshou_0059': ('坚固', '龟', '灵兽'),
    'x_lingshou_0074': ('日光', '狐', '灵兽'),
}

rows = []
changed = []
with open(SRC, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    for r in reader:
        if r['id'] in PATCH:
            old = (r['顶层'], r['中层'], r['底层'])
            new = PATCH[r['id']]
            if old != new:
                changed.append((r['id'], old, new))
            r['顶层'], r['中层'], r['底层'] = new
        rows.append(r)

with open(DST, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)

print('写出', DST, '行数', len(rows))
print('实际改动:')
for i, old, new in changed:
    print(f'  {i}: {old} -> {new}')