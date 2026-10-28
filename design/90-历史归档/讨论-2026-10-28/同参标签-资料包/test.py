import csv, json
from collections import defaultdict, Counter

# ===== 配置：按你的实际文件名改 =====
TAGS_CSV = 'tags_all_468.csv'
ITEMS_CSV = '06-物品清单.csv'      # 没有就注释掉，脚本会跳过品阶统计
REL_JSON = 'top_relations.json'    # 没有就注释掉，脚本会跳过关系表对比

# ===== 读标签 =====
tags = {}
with open(TAGS_CSV, encoding='utf-8') as f:
    for row in csv.DictReader(f):
        tags[row['id']] = {
            'top': [x for x in row['顶层'].split('|') if x],
            'mid': [x for x in row['中层'].split('|') if x],
            'base': [x for x in row['底层'].split('|') if x],
        }

# ===== 读物品（取 tier / category） =====
items = {}
try:
    with open(ITEMS_CSV, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            items[row['id']] = row
except FileNotFoundError:
    print(f'[warn] {ITEMS_CSV} 不存在，品阶/类别统计将为空')
    items = {}

def get_tier(row):
    for k in ('tier', '阶', 'tier_num'):
        v = row.get(k)
        if v:
            try: return int(v)
            except ValueError: pass
    return None

def get_cat(row):
    for k in ('category', '大类'):
        if row.get(k): return row[k]
    return '?'

# ===== 汇总 =====
top_stat  = defaultdict(lambda: {'count':0,'tiers':Counter(),'cats':Counter(),'ids':[]})
mid_stat  = defaultdict(lambda: {'count':0,'tiers':Counter(),'cats':Counter()})
base_stat = defaultdict(lambda: {'count':0,'tiers':Counter(),'cats':Counter()})

missing = []
for tid, t in tags.items():
    if tid not in items:
        missing.append(tid); continue
    row = items[tid]; tier = get_tier(row); cat = get_cat(row)
    for w in t['top']:
        top_stat[w]['count'] += 1
        top_stat[w]['tiers'][tier] += 1
        top_stat[w]['cats'][cat] += 1
        top_stat[w]['ids'].append(tid)
    for w in t['mid']:
        mid_stat[w]['count'] += 1
        mid_stat[w]['tiers'][tier] += 1
        mid_stat[w]['cats'][cat] += 1
    for w in t['base']:
        base_stat[w]['count'] += 1
        base_stat[w]['tiers'][tier] += 1
        base_stat[w]['cats'][cat] += 1

def fmt_tiers(c):
    return ','.join(str(k) for k in sorted(k for k in c if k is not None))

def fmt_cats(c):
    return ' '.join(f'{k}:{v}' for k, v in c.most_common())

def grade(n):
    return 'HIGH' if n >= 5 else ('MID' if n >= 3 else 'LOW')

print(f'标签行: {len(tags)}  06 匹配: {len(tags)-len(missing)}  06 缺失: {len(missing)}')
if missing: print('缺失 id:', missing[:30])
print()

# ===== 顶层 =====
print('='*72)
print('顶层词统计（件数降序）')
print('='*72)
print(f"{'词':<10}{'件数':>4}  {'档':<5}{'品阶':<12}{'类别分布':<28}")
top_order = sorted(top_stat.items(), key=lambda x: (-x[1]['count'], x[0]))
for w, s in top_order:
    print(f"{w:<10}{s['count']:>4}  {grade(s['count']):<5}{fmt_tiers(s['tiers']):<12}{fmt_cats(s['cats']):<28}")

high = sum(1 for _, s in top_order if s['count'] >= 5)
mid  = sum(1 for _, s in top_order if 3 <= s['count'] < 5)
low  = sum(1 for _, s in top_order if s['count'] < 3)
print(f'\n分层：HIGH(>=5)={high}  MID(3-4)={mid}  LOW(<3)={low}  合计={len(top_order)}')

print('\n单类集中（>=3 件但只在一个 category）：')
for w, s in top_order:
    if s['count'] >= 3 and sum(1 for v in s['cats'].values() if v) == 1:
        print(f"  {w}: {s['count']} 件 {fmt_cats(s['cats'])}")

print('\n单阶集中（>=3 件但只覆盖一个 tier）：')
for w, s in top_order:
    if s['count'] >= 3 and len([k for k in s['tiers'] if k is not None]) == 1:
        print(f"  {w}: {s['count']} 件 品阶 {fmt_tiers(s['tiers'])}")

# ===== 中层低频 =====
print('\n' + '='*72)
print('中层词（<5 件的低频）')
print('='*72)
for w, s in sorted([(w,s) for w,s in mid_stat.items() if s['count'] < 5],
                   key=lambda x: (x[1]['count'], x[0])):
    print(f"  {w}: {s['count']} 件 品阶 {fmt_tiers(s['tiers'])} {fmt_cats(s['cats'])}")

# ===== 底层 =====
print('\n' + '='*72)
print('底层词分布')
print('='*72)
for w, s in sorted(base_stat.items(), key=lambda x: -x[1]['count']):
    print(f"  {w}: {s['count']} 件 {fmt_cats(s['cats'])}")

# ===== 三阶以上顶层缺失 =====
print('\n' + '='*72)
print('三阶以上顶层缺失')
print('='*72)
bad = [tid for tid, t in tags.items()
       if tid in items and (get_tier(items[tid]) or 0) >= 3 and not t['top']]
print(f'共 {len(bad)} 件: {bad[:20]}')

# ===== 关系表覆盖 =====
try:
    with open(REL_JSON, encoding='utf-8') as f:
        rel = json.load(f)
    used = set(top_stat.keys())
    keys = set(rel.keys())
    print('\n' + '='*72)
    print('关系表覆盖')
    print('='*72)
    print(f'  表键: {len(keys)}  实打标: {len(used)}')
    print(f'  表中有未用（示例词/未打标）: {sorted(keys - used)}')
    print(f'  用了不在表里（需补关系键）: {sorted(used - keys)}')
except FileNotFoundError:
    print('\n[skip] 未找到 top_relations.json')