#!/usr/bin/env python3
"""把「掌门路 xlsx + 生成器名录」合并进统一物品池。

输入（都不在运行时读取）：
  - src/plugins/items.base.json      现有手工池（81 件）
  - design/原作/zml_huiji_dataV7.xlsx  掌门路原始表（本地文件，不入 git）
  - design/灵物名录.json              外部生成器输出（按类别/阶）

输出：
  - src/plugins/items.data.js         运行时物品池（400 件）

口径：
  - 四池各目标 100 件；阶分布 30/30/20/14/6。
  - 掌门路优先使用带「品/介绍/价格/属性」的条目；超出目标的留作 reserve。
  - 灵植里的「灵果」按《物品池设计方案》§二 移到灵材（type=果）。
  - 新条目的 series 暂按「类别_名称首字」分组；手工池保留原 series。
  - 品（下/中/上/极）不进底材；它是掉落时 roll 的成色。

⚠ 这个脚本是**本地构建工具**，依赖未入库的 xlsx；游戏运行时只读 items.data.js。
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "src/plugins/items.base.json"
XLSX = ROOT / "design/原作/zml_huiji_dataV7.xlsx"
GENERATED = ROOT / "design/灵物名录.json"
OUT = ROOT / "src/plugins/items.data.js"
PILLS_OUT = ROOT / "design/30-数据与决议/掌门路丹药.json"
REPORT = ROOT / ".items.build-report.txt"

TARGET = {1: 30, 2: 30, 3: 20, 4: 14, 5: 6}
CAT_ORDER = ["灵器", "灵兽", "灵植", "灵材"]
CAT_KEY = {"灵器": "lingqi", "灵兽": "lingshou", "灵植": "lingzhi", "灵材": "lingcai"}
SHEET_CAT = {"法器": "灵器", "灵兽": "灵兽", "灵植": "灵植", "灵材": "灵材", "丹药": "丹药"}
TIER_MAP = {
    "一阶": 1, "二阶": 2, "三阶": 3, "四阶": 4, "五阶": 5,
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 5,
    "无": 1, "": 1, None: 1,
}
EL_LABEL = {"metal": "金", "wood": "木", "water": "水", "fire": "火", "earth": "土", "beast": "兽", "vessel": "器"}


def norm_text(value) -> str:
    return str(value).strip() if value is not None else ""


def clean_desc(value) -> str:
    text = norm_text(value)
    if not text:
        return ""
    text = re.sub(r"\{\{Ref\|[^}]*\}\}", "", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > 80:
        text = text[:80] + "…"
    return text


def first_char(name: str) -> str:
    for ch in name:
        if ch.strip():
            return ch
    return "misc"


def classify_lingzhi(name: str, kind: str) -> tuple[str, str]:
    k = norm_text(kind)
    if "果" in k or name.endswith(("果", "枣", "桃", "梨", "杏", "梅")):
        return "灵材", "果"
    if "花" in k or "花" in name or "莲" in name:
        return "灵植", "花"
    if "藤" in k or any(x in name for x in ("藤", "棘", "荆")):
        return "灵植", "藤"
    if any(x in k for x in ("树", "木", "植物", "木妖", "木精", "魔树", "异宝")) or any(
        x in name for x in ("树", "木", "竹")
    ):
        return "灵植", "树"
    return "灵植", "草"


def classify_lingcai(name: str, kind: str) -> str:
    k = norm_text(kind)
    if k == "金属" or any(x in name for x in ("金", "银", "铜", "铁", "钢", "精金")):
        return "金属"
    if k in ("内丹", "兽晶") or any(x in name for x in ("骨", "角", "丹", "兽晶")):
        return "骨材"
    if k in ("木心", "木") or any(x in name for x in ("木", "竹", "藤", "丝", "苔")):
        return "灵木"
    if k == "火晶" or any(x in name for x in ("玉", "晶", "钻", "珠", "宝")):
        return "宝晶"
    if k == "花" or "花" in name:
        return "花"
    if k == "果" or any(x in name for x in ("果", "枣", "桃", "梨", "杏", "梅")):
        return "果"
    if k == "叶" or "叶" in name:
        return "叶"
    if k == "土石" or any(x in name for x in ("土", "泥", "砂", "石", "岩")):
        return "灵土"
    return "灵土"


LINGQI_KIND = {
    "飞剑": "飞剑",
    "文玩": "牌",
    "刀": "刀",
    "服饰": "袍",
    "容器": "袋",
    "建筑": "塔",
    "钉": "刺",
    "其他武器": "器",
    "乐器": "铃",
    "旗帜": "幡",
    "盾牌": "盾",
    "飞行法器": "舟",
    "佛家法器": "珠",
    "图画": "图",
    "棍棒": "棍",
}
LINGQI_SUFFIX = [
    ("丹炉", "丹炉"), ("飞剑", "飞剑"), ("傀儡", "傀儡"),
    ("剑", "飞剑"), ("刀", "刀"), ("盾", "盾"), ("袍", "袍"), ("冠", "冠"),
    ("簪", "簪"), ("戒", "戒"), ("环", "环"), ("铃", "铃"), ("钟", "钟"),
    ("鼓", "鼓"), ("钹", "钹"), ("印", "印"), ("玺", "印"), ("塔", "塔"),
    ("幡", "幡"), ("旗", "幡"), ("镜", "镜"), ("珠", "珠"), ("琴", "琴"),
    ("笛", "笛"), ("笔", "笔"), ("砚", "砚"), ("弓", "弓"), ("弩", "弩"),
    ("鞭", "鞭"), ("锤", "锤"), ("斧", "斧"), ("钩", "钩"), ("叉", "叉"),
    ("锁", "锁"), ("索", "索"), ("图", "图"), ("符", "符"), ("舟", "舟"),
    ("袋", "袋"), ("杖", "杖"), ("棍", "棍"), ("矛", "矛"), ("枪", "枪"),
    ("戈", "戈"), ("镖", "镖"), ("网", "网"), ("伞", "伞"), ("轮", "轮"),
    ("盘", "盘"), ("简", "简"), ("梭", "梭"), ("刺", "刺"), ("匕", "匕"),
    ("牌", "牌"), ("仗", "杖"),
]


def classify_lingqi(name: str, kind: str) -> str:
    for suffix, typ in LINGQI_SUFFIX:
        if name.endswith(suffix):
            return typ
    return LINGQI_KIND.get(norm_text(kind), "器")


def classify_lingshou(name: str, kind: str, tier: int) -> str:
    k = norm_text(kind)
    if "凶" in k or any(x in name for x in ("凶", "魔", "鬼")):
        return "凶兽"
    if "异" in k or any(x in name for x in ("异", "魈", "魅")):
        return "异种"
    if "妖" in k or "妖" in name:
        return "妖兽"
    if tier >= 4:
        return "凶兽"
    if tier == 3:
        return "妖兽"
    return "灵兽"


def infer_element(cat: str, name: str, typ: str) -> str:
    if cat == "灵兽":
        return "beast"
    if cat == "灵器":
        if any(x in name for x in ("火", "炎", "赤", "朱", "阳", "日")):
            return "fire"
        if any(x in name for x in ("水", "冰", "寒", "泉", "霜", "雪")):
            return "water"
        if any(x in name for x in ("木", "藤", "竹", "青", "花", "草")):
            return "wood"
        if any(x in name for x in ("金", "铁", "铜", "银", "钢", "锋", "剑", "刀", "矛", "枪")):
            return "metal"
        if any(x in name for x in ("土", "石", "山", "岩", "重")):
            return "earth"
        if any(x in name for x in ("兽", "妖", "骨")):
            return "beast"
        return "vessel"
    if cat == "灵植":
        if any(x in name for x in ("火", "炎", "赤", "朱", "阳", "日")):
            return "fire"
        if any(x in name for x in ("水", "冰", "寒", "泉", "霜", "雪", "阴")):
            return "water"
        return "wood"
    # 灵材
    if typ == "金属":
        return "metal"
    if typ == "骨材":
        return "beast"
    if typ == "灵木":
        return "wood"
    if typ in ("花", "果", "叶"):
        return "fire" if any(x in name for x in ("火", "炎", "赤", "朱")) else "wood"
    if any(x in name for x in ("火", "炎", "赤", "朱")):
        return "fire"
    if any(x in name for x in ("水", "冰", "寒", "泉", "霜", "雪")):
        return "water"
    if any(x in name for x in ("金", "银", "铜", "铁", "钢")):
        return "metal"
    if any(x in name for x in ("木", "竹", "藤")):
        return "wood"
    return "earth"


TEMPLATES = {
    "灵植": [
        "{tier}{typ}，{el}灵气所钟，可入丹方。",
        "生于{el}属灵地的{tier}{typ}，根叶皆可入药。",
        "{tier}{typ}，性属{el}，炼药与布阵常用。",
    ],
    "灵兽": [
        "{tier}{typ}，{el}性凶悍，可驯为灵宠。",
        "出没于{el}属山野的{tier}{typ}。",
        "{tier}{typ}，{el}气缠身，颇具灵性。",
    ],
    "灵材": [
        "{tier}{typ}，炼器与炼丹的常见材料。",
        "{el}属{tier}{typ}，质地坚实。",
        "{tier}{typ}，可用来炼制{el}属法器。",
    ],
    "灵器": [
        "{tier}{typ}，{el}属性法器，修士常用。",
        "{el}属{tier}{typ}，攻守皆备。",
        "{tier}{typ}，以{el}属灵材炼成。",
    ],
}
TIER_LABEL = {1: "一阶", 2: "二阶", 3: "三阶", 4: "四阶", 5: "五阶"}
VESSEL_TEMPLATES = [
    "{tier}{typ}，修士常用法器。",
    "{tier}{typ}，攻守皆备。",
    "{tier}{typ}，以灵材炼成，颇为称手。",
]


def make_desc(cat: str, name: str, typ: str, tier: int, element: str, idx: int) -> str:
    if cat == "灵器" and element == "vessel":
        template = VESSEL_TEMPLATES[idx % len(VESSEL_TEMPLATES)]
        return template.format(tier=TIER_LABEL[tier], typ=typ)
    template = TEMPLATES[cat][idx % len(TEMPLATES[cat])]
    return template.format(tier=TIER_LABEL[tier], typ=typ, el=EL_LABEL[element])


def xlsx_rows(sheet: str):
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    hdr = {h: i for i, h in enumerate(rows[0]) if h}
    out = []
    for order, row in enumerate(rows[1:]):
        name = norm_text(row[hdr["名称"]]) if "名称" in hdr else ""
        if not name:
            continue
        # 掌门路有个单元格写了两个名字（巨角犀/土灵犀）
        names = [n.strip() for n in name.split("/") if n.strip()] if "/" in name else [name]
        for nm in names:
            out.append({
                "name": nm,
                "kind": norm_text(row[hdr["种类"]]) if "种类" in hdr else "",
                "tier_raw": row[hdr["阶"]] if "阶" in hdr else None,
                "quality": norm_text(row[hdr["品"]]) if "品" in hdr else "",
                "desc": row[hdr["介绍"]] if "介绍" in hdr else "",
                "price": norm_text(row[hdr["价格"]]) if "价格" in hdr else "",
                "attr": norm_text(row[hdr["属性"]]) if "属性" in hdr else "",
                "order": order,
            })
    return out


def score(item) -> int:
    return (
        (4 if item["quality"] else 0)
        + (2 if norm_text(item["desc"]) else 0)
        + (1 if item["price"] else 0)
        + (1 if item["attr"] else 0)
    )


base = json.loads(BASE.read_text(encoding="utf-8"))
gen = json.loads(GENERATED.read_text(encoding="utf-8"))
wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)

# 现有池与已用名字
pool = []
used = defaultdict(set)
counts = defaultdict(lambda: Counter())
for item in base:
    pool.append(dict(item))
    used[item["category"]].add(item["name"])
    counts[item["category"]][item["tier"]] += 1

# 生成器条目：全部使用（按类别/阶）
gen_seq = 0
for cat in ["灵植", "灵兽", "灵材", "灵器"]:
    for tier_key, names in gen.get(cat, {}).items():
        tier = TIER_MAP.get(tier_key, 1)
        for name in names:
            name = norm_text(name)
            if not name or name in used[cat]:
                continue
            # 生成器给的类别是权威的：灵植里的果名也仍按灵植处理；
            # 掌门路 xlsx 的「灵果」才按 §二 移到灵材。
            if cat == "灵植":
                _, typ = classify_lingzhi(name, "")
                cat2 = "灵植"
            elif cat == "灵兽":
                cat2 = cat
                typ = classify_lingshou(name, "", tier)
            elif cat == "灵材":
                cat2 = cat
                typ = classify_lingcai(name, "")
            else:
                cat2 = cat
                typ = classify_lingqi(name, "")
            element = infer_element(cat2, name, typ)
            gen_seq += 1
            item = {
                "id": f"g_{CAT_KEY[cat2]}_{gen_seq:04d}",
                "name": name,
                "category": cat2,
                "type": typ,
                "series": f"{CAT_KEY[cat2]}_{first_char(name)}",
                "tier": tier,
                "fateElement": element,
                "description": make_desc(cat2, name, typ, tier, element, gen_seq),
            }
            pool.append(item)
            used[cat2].add(name)
            counts[cat2][tier] += 1

# 掌门路：按类别/阶候选，按质量分排序
xlsx_candidates = defaultdict(lambda: defaultdict(list))
seen_xlsx = defaultdict(set)
for sheet, sheet_cat in SHEET_CAT.items():
    if sheet_cat == "丹药":
        continue
    for row in xlsx_rows(sheet):
        name = row["name"]
        if name in used[sheet_cat]:
            continue
        tier = TIER_MAP.get(norm_text(row["tier_raw"]), 1)
        if sheet_cat == "灵植":
            cat2, typ = classify_lingzhi(name, row["kind"])
        elif sheet_cat == "灵兽":
            cat2 = sheet_cat
            typ = classify_lingshou(name, row["kind"], tier)
        elif sheet_cat == "灵材":
            cat2 = sheet_cat
            typ = classify_lingcai(name, row["kind"])
        else:
            cat2 = sheet_cat
            typ = classify_lingqi(name, row["kind"])
        if name in seen_xlsx[cat2] or name in used[cat2]:
            continue
        seen_xlsx[cat2].add(name)
        xlsx_candidates[cat2][tier].append({**row, "cat": cat2, "type": typ})

selected_xlsx = []
reserve = []
for cat in ["灵植", "灵兽", "灵材", "灵器"]:
    for tier in range(1, 6):
        candidates = sorted(xlsx_candidates[cat][tier], key=lambda r: (-score(r), r["order"]))
        need = max(0, TARGET[tier] - counts[cat][tier])
        take = candidates[:need]
        selected_xlsx.extend(take)
        reserve.extend(candidates[need:])

# 掌门路的 3 个「灵果」按 §二 移到灵材后，灵植会少 3 件；
# 用 reserve 补齐到 400，优先灵材（保持四池总数不变）。
TOTAL_TARGET = 400
selected_keys = {(r["cat"], r["name"]) for r in selected_xlsx}
if len(pool) + len(selected_xlsx) < TOTAL_TARGET:
    fill_order = [r for r in reserve if r["cat"] in ("灵材", "灵植")] + reserve
    for row in sorted(fill_order, key=lambda r: (-score(r), r["order"])):
        if len(pool) + len(selected_xlsx) >= TOTAL_TARGET:
            break
        key = (row["cat"], row["name"])
        if key in selected_keys:
            continue
        selected_xlsx.append(row)
        selected_keys.add(key)

xlsx_seq = 0
for row in selected_xlsx:
    cat = row["cat"]
    name = row["name"]
    if name in used[cat]:
        continue
    tier = TIER_MAP.get(norm_text(row["tier_raw"]), 1)
    typ = row["type"]
    element = infer_element(cat, name, typ)
    desc = clean_desc(row["desc"])
    xlsx_seq += 1
    item = {
        "id": f"x_{CAT_KEY[cat]}_{xlsx_seq:04d}",
        "name": name,
        "category": cat,
        "type": typ,
        "series": f"{CAT_KEY[cat]}_{first_char(name)}",
        "tier": tier,
        "fateElement": element,
        "description": desc or make_desc(cat, name, typ, tier, element, xlsx_seq),
    }
    pool.append(item)
    used[cat].add(name)
    counts[cat][tier] += 1

# 稳定排序：保留现有池在前，新增按类别/阶/名字
base_ids = {i["id"] for i in base}
pool.sort(key=lambda i: (0 if i["id"] in base_ids else 1, CAT_ORDER.index(i["category"]), i["tier"], i["name"]))

# 掌门路丹药单独留档：不进四池（四池用于本命/同参/装备），等炼丹模块接。
pills = []
for i, row in enumerate(xlsx_rows("丹药")):
    tier = TIER_MAP.get(norm_text(row["tier_raw"]), 1)
    pills.append({
        "id": f"pill_{i + 1:03d}",
        "name": row["name"],
        "tier": tier,
        "quality": row["quality"] or "",
        "description": clean_desc(row["desc"]),
    })
PILLS_OUT.write_text(json.dumps(pills, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 输出 JS（JSON 兼容对象字面量）
lines = [
    "// ⚠ 自动生成，不要手改。",
    "// 来源：src/plugins/items.base.json（手工池）+ 掌门路 xlsx（本地，不入 git）+ design/灵物名录.json。",
    "// 重新生成：python scripts/build-items.py",
    "//",
    "// 字段仍是 8 个：id / name / category / type / series / tier / fateElement / description。",
    "// 品阶（下/中/上/极）不进底材，掉落时由 chest/rollItemQuality 决定。",
    "export const ITEM_POOL = [",
]
for item in pool:
    lines.append("  " + json.dumps(item, ensure_ascii=False) + ",")
lines.append("]")
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

# 报告
report = []
report.append(f"输出 {len(pool)} 件 → {OUT.relative_to(ROOT)}")
for cat in CAT_ORDER:
    report.append(
        f"{cat}: 总 {sum(counts[cat].values())}；阶 " +
        " / ".join(f"{t}:{counts[cat].get(t, 0)}" for t in range(1, 6))
    )
report.append(f"掌门路已选 {len(selected_xlsx)}，reserve {len(reserve)}")
report.append("reserve 按类别: " + str(Counter(r["cat"] for r in reserve)))
REPORT.write_text("\n".join(report) + "\n", encoding="utf-8")
print("\n".join(report))
