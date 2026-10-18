#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成《数值真值表.xlsx》—— 只含「输入格 + 公式」的计算器。

用法（只在需要重建骨架时跑）：
    python scripts/build-truth-table.py

⚠ 本脚本会**覆盖** xlsx。日常改数请直接在 xlsx 的黄底输入格里改、看公式联动，
  **不要**再跑脚本（会把你的手改值冲掉）。
⚠ 参考表（22 级静态表 / 六道门槛 / 轮次表 / P1-P13 月饷 / 秘境层表 / 14 岗位 …）
  只留在 `数值真值表.md`，本工作簿不重复。xlsx 只回答「改这个数会发生什么」。

口径以 Markdown 为准；本脚本只负责写一次骨架。
"""

from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "design" / "00-总览与状态" / "数值真值表.xlsx"

# ---------- 样式 ----------
TITLE = Font(name="等线", size=15, bold=True, color="1F3864")
SUB = Font(name="等线", size=10, color="666666")
SECTION = Font(name="等线", size=11, bold=True, color="FFFFFF")
SECTION_FILL = PatternFill("solid", fgColor="1F3864")
HEADER = Font(name="等线", size=10, bold=True, color="1F3864")
HEADER_FILL = PatternFill("solid", fgColor="D9E2F3")
INPUT_FILL = PatternFill("solid", fgColor="FFF2CC")
GOOD_FILL = PatternFill("solid", fgColor="E2EFDA")
BAD_FILL = PatternFill("solid", fgColor="FCE4D6")
NOTE = Font(name="等线", size=9, color="7F7F7F")
BOLD = Font(name="等线", size=10, bold=True)
NORMAL = Font(name="等线", size=10)
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)


def title(ws, text, sub=""):
    ws["A1"] = text
    ws["A1"].font = TITLE
    ws.merge_cells("A1:Q1")
    if sub:
        ws["A2"] = sub
        ws["A2"].font = SUB
        ws.merge_cells("A2:Q2")


def section(ws, row, text, span=17):
    c = ws.cell(row=row, column=1, value=text)
    c.font = SECTION
    c.fill = SECTION_FILL
    c.alignment = LEFT
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
    ws.row_dimensions[row].height = 20


def note(ws, row, text, span=17):
    c = ws.cell(row=row, column=1, value=text)
    c.font = NOTE
    c.alignment = LEFT
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
    ws.row_dimensions[row].height = 28


def kv(ws, row, label, value, fmt=None, note_text=""):
    ws.cell(row=row, column=1, value=label).font = BOLD
    c = ws.cell(row=row, column=2, value=value)
    c.font = NORMAL
    c.fill = INPUT_FILL
    c.border = BORDER
    c.alignment = CENTER
    if fmt:
        c.number_format = fmt
    if note_text:
        n = ws.cell(row=row, column=3, value=note_text)
        n.font = NOTE
        n.alignment = LEFT
        ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=10)


def result_row(ws, row, label, formula, fmt="0.00", fill=GOOD_FILL):
    """公式结果行：A 标签、B 公式。"""
    ws.cell(row=row, column=1, value=label).font = NORMAL
    ws.cell(row=row, column=1).border = BORDER
    c = ws.cell(row=row, column=2, value=formula)
    c.font = BOLD
    c.fill = fill
    c.border = BORDER
    c.alignment = CENTER
    c.number_format = fmt


# ---------- 数据（只用于生成初始值；之后以 xlsx 里的手改值为准） ----------
NAMES = [
    "练气一层", "练气二层", "练气三层", "练气四层", "练气五层",
    "练气六层", "练气七层", "练气八层", "练气九层", "练气十层",
    "筑基初期", "筑基中期", "筑基后期", "筑基圆满",
    "结丹初期", "结丹中期", "结丹后期", "结丹圆满",
    "元婴初期", "元婴中期", "元婴后期", "元婴圆满",
]
BASE = [100, 150, 300, 450, 700, 1300, 2000, 3000, 5600, 8500,
        18000, 27000, 40000, 60000, 120000, 160000, 200000, 240000,
        360000, 540000, 810000, 1215000]
FIT = {1: .08, 2: .08, 3: .16, 4: .16, 5: .16, 6: .27, 7: .27, 8: .27,
       9: .48, 10: .48, 11: .56, 12: .56, 13: .56, 14: .56,
       15: .80, 16: .80, 17: .80, 18: .80, 19: 1.0, 20: 1.0, 21: 1.0, 22: 1.0}
LAND = {**{i: 30 for i in range(1, 11)}, **{i: 60 for i in range(11, 15)},
        **{i: 100 for i in range(15, 19)}, **{i: 150 for i in range(19, 23)}}
TARGET = {1: 60, 2: 180, 5: 1080, 9: 6000, 10: 10800, 13: 43200, 14: 86400, 17: 259200}


def _interp(a, b, n):
    r = (TARGET[b] / TARGET[a]) ** (1 / n)
    return [TARGET[a] * (r ** i) for i in range(1, n)]


for _a, _b in [(2, 5), (5, 9), (10, 13), (14, 17)]:
    for _i, _v in enumerate(_interp(_a, _b, _b - _a)):
        TARGET[_a + 1 + _i] = _v

# 裸公式（无 K），用于反推 K
K = {}
for L in range(1, 23):
    R0 = LAND[L] * (0.5 + 1.5 * FIT[L]) * 0.8 * (1.1 ** (L - 1))
    k0 = 0.1 * (0.8 ** (L - 1)) * 1.3
    naked = BASE[L - 1] / (R0 * k0)
    K[L] = TARGET[L] / naked if L in TARGET else K.get(17, 2.963534699041294)
for L in range(18, 23):
    K[L] = K[17]

# ---------- 工作簿 ----------
wb = Workbook()

# ============================================================
# Sheet 1 · 修行与突破
# ============================================================
ws = wb.active
ws.title = "1-修行与突破"
title(
    ws,
    "Sheet 1 · 修行与突破公式（配平层）",
    "黄底是可改输入，改完下面的 22 级表立刻重算。参考表（时间换算 / 四阶段 / 静态境界表）见 数值真值表.md §0~§1。",
)

section(ws, 4, "1.1 输入（黄底可改）")
kv(ws, 5, "参考 Land（表内 F 列逐行）", 30, "0.0", "16 档：20~160；基准路线练气 30")
kv(ws, 6, "参考 Fit（表内按级取值）", 0.16, "0.00", "连乘：功法×同参×灵地；每行的 F/G 列可直接改")
kv(ws, 7, "本命数量系数", 0.8, "0.00", "单 1.0 / 双单根 0.9 / 双双根 0.8 / 三 0.7 / 四+ 0.6")
kv(ws, 8, "spiritRate 基数", 1.1, "0.00", "每次内功突破 ×1.1")
kv(ws, 9, "子嗣加成 Child", 0.0, "0.0%", "无上限；本表演示用 0")
kv(ws, 10, "其他加成 Other", 0.0, "0.0%", "散功重修、丹药等；不含熟练度/英烈祠")
kv(ws, 11, "打坐转化基数", 0.1, "0.000", "k = 0.1 × 0.8^(L-1) × 暴击 × 英烈祠")
kv(ws, 12, "每级转化衰减", 0.8, "0.000", "1.2/1.5 = 0.8")
kv(ws, 13, "暴击期望", 1.3, "0.00", "30%×luck 翻倍 → 1+0.3")
kv(ws, 14, "英烈祠倍率", 1.0, "0.00", "1 + min(1%×牌位, 10%)")

section(ws, 16, "1.2 22 级验算表（黄色列是输入，其余是公式）")
headers = ["级", "境界", "Base_Exp", "K", "有效上限", "灵地", "Fit", "本命",
           "spiritRate", "灵力/秒", "打坐 k", "修为/秒", "校准后耗时", "裸耗时", "目标", "偏差", "累计(h)"]
for j, h in enumerate(headers, 1):
    c = ws.cell(row=17, column=j, value=h)
    c.font = HEADER
    c.fill = HEADER_FILL
    c.alignment = CENTER
    c.border = BORDER

for i in range(22):
    L = i + 1
    r = 18 + i
    vals = [L, NAMES[i], BASE[i], round(K[L], 6), None, LAND[L], FIT[L], None,
            None, None, None, None, None, None, TARGET.get(L, ""), None, None]
    for j, v in enumerate(vals, 1):
        c = ws.cell(row=r, column=j, value=v)
        c.font = NORMAL
        c.border = BORDER
        c.alignment = CENTER
        # C=Base_Exp / D=K / F=灵地 / G=Fit / O=目标 —— 都是可改输入
        if j in (3, 4, 6, 7, 15):
            c.fill = INPUT_FILL
    ws.cell(row=r, column=5, value=f"=C{r}*D{r}*(1+$B$9)")
    ws.cell(row=r, column=8, value="=$B$7")
    ws.cell(row=r, column=9, value=f"=$B$8^(A{r}-1)")
    ws.cell(row=r, column=10, value=f"=F{r}*(0.5+1.5*G{r})*H{r}*I{r}*(1+$B$9)*(1+$B$10)")
    ws.cell(row=r, column=11, value=f"=$B$11*$B$12^(A{r}-1)*$B$13*$B$14")
    ws.cell(row=r, column=12, value=f"=J{r}*K{r}")
    ws.cell(row=r, column=13, value=f"=E{r}/L{r}")
    ws.cell(row=r, column=14, value=f"=M{r}/D{r}")
    ws.cell(row=r, column=16, value=f'=IF(O{r}="","",M{r}/O{r})')
    ws.cell(row=r, column=17, value=0 if i == 0 else f"=Q{r-1}+M{r-1}/3600")
    for j in (5, 10, 12, 13, 14):
        ws.cell(row=r, column=j).number_format = "#,##0"
    for j in (4, 6, 11):
        ws.cell(row=r, column=j).number_format = "0.000"
    for j in (7, 8, 9, 16):
        ws.cell(row=r, column=j).number_format = "0.00"
    ws.cell(row=r, column=15).number_format = "#,##0"
    ws.cell(row=r, column=17).number_format = "0.00"

for j, w in enumerate([5, 12, 11, 8, 11, 7, 6, 6, 8, 9, 9, 9, 11, 10, 9, 7, 9], 1):
    ws.column_dimensions[get_column_letter(j)].width = w

note(ws, 41, "读法：校准后耗时 = 有效上限 / 修为每秒；裸耗时 = 校准后 / K（没校准的公式结果）。")
note(ws, 42, "子嗣加成同时乘在有效上限和灵力/秒上，所以在「校准后耗时」里精确对消；改 B9 看这一列不变。")
note(ws, 43, "K 是按基准路线反推的（md §2.4）。改 C/D/F/G/O 后，K 要按新基准重算；L18~22 的 K 暂沿用 L17。")
note(ws, 44, "宪法锚点在本行的「下一级」：第 2 行 180s 才是「练气三层 3 分钟」，第 5 行 1080s 才是「练气六层 18 分钟」。")
note(ws, 45, "静态 22 级表（含门槛 / 灵地要求 / 累计时间）见 md §1.2 与 §2.5，本表不重复。")
ws.freeze_panes = "C18"

# ============================================================
# Sheet 2 · 破槛路线
# ============================================================
ws = wb.create_sheet("2-破槛路线")
title(
    ws,
    "Sheet 2 · 破槛路线 · 熟练度与 Fit",
    "只保留会重算的部分。六道门槛、动作验证、灵地敏感度是静态参考表，见 数值真值表.md §3.1~§3.4。",
)

section(ws, 4, "2.1 熟练度与门槛（L6 / L9）")
kv(ws, 5, "功法契合（同系列）", 0.40, "0.00", "先用元氏 0.4")
kv(ws, 6, "同参契合", 0.60, "0.00", "同系列")
kv(ws, 7, "L6 门槛", 0.25, "0.00", "")
result_row(ws, 8, "L6 需要的最低熟练度 = 门槛/同参 − 功法", "=B7/B6-B5", "0.00%")
kv(ws, 9, "到达 L6 累计（分钟）", 37.4, "0.0", "来自 md §2.5 的累计时间")
result_row(ws, 10, "到达时练功小时 = 分钟×60/4×10/24", "=B9*60/4*10/24", "0.00")
result_row(ws, 11, "到达时熟练度 = 练功小时/100×1%", "=B10/100*0.01", "0.00%")
result_row(ws, 12, "L6 结果", '=IF(B11>=B8,"到点就够","要等")', "@", BAD_FILL)
result_row(ws, 13, "L9 需要的最低熟练度（功法 0.6 / 同参 0.6）", "=0.4/0.6-0.6", "0.00%")
kv(ws, 14, "到达 L9 时熟练度（约）", 0.1075, "0.00%", "")
result_row(ws, 15, "L9 结果", '=IF(B14>=B13,"同系列也能过（准正主非必须）","必须换准正主")', "@", BAD_FILL)

section(ws, 17, "2.2 Fit 连乘验证（功法 × 同参 × 灵地 vs 门槛）")
kv(ws, 18, "功法契合", 0.40, "0.00", "同常驻功法")
kv(ws, 19, "同参契合", 0.60, "0.00", "六档：1.0/0.8/0.6/0.4/0.25/0.1")
kv(ws, 20, "灵地契合", 1.00, "0.00", "完全匹配 = 1.0")
kv(ws, 21, "门槛", 0.25, "0.00", "练气六层 = 0.25")
result_row(ws, 22, "综合 Fit = 功法 × 同参 × 灵地", "=B18*B19*B20", "0.000")
result_row(ws, 23, "差额 = Fit − 门槛", "=B22-B21", "0.000")
result_row(ws, 24, "结果", '=IF(B22>=B21,"可突破","差 "&TEXT(B21-B22,"0.000"))', "@", BAD_FILL)

note(ws, 26, "2026-10-17 拍板：×2 + B（GateFit/SpeedFit 拆分）。熟练度 1%/50h；门槛用不含熟练度的 GateFit。")
note(ws, 27, "六道门槛 0.15/0.25/0.40/0.55/0.80（元婴 0.95 未启用）与每道门槛要求换什么，见 md §3.1~§3.2。")

# ============================================================
# Sheet 3 · 镇守时间体力
# ============================================================
ws = wb.create_sheet("3-镇守时间体力")
title(
    ws,
    "Sheet 3 · 镇守的时间与体力（博弈层）",
    "黄底可改。默认 = 巡视 2h、不炼体、不选百艺。五策略静态对照表见 数值真值表.md §4.4。",
)

section(ws, 4, "3.1 输入")
kv(ws, 5, "巡视时长 S", 2, "0", "1~5 小时")
kv(ws, 6, "勾选炼体 B", 0, "0", "0/1")
kv(ws, 7, "勾选百艺数 N", 0, "0", "0~4")
kv(ws, 8, "体力上限", 145, "0", "145 + 外功加成")
kv(ws, 9, "炼丹（30 精力/天）", 0, "0", "0/1")
kv(ws, 10, "炼符（30 精力/天）", 0, "0", "0/1")
kv(ws, 11, "炼阵（35 精力/天）", 0, "0", "0/1")
kv(ws, 12, "炼器（35 精力/天）", 0, "0", "0/1")
kv(ws, 13, "灵地基础产出", 30, "0.0", "与 Sheet 1 同口径")
kv(ws, 14, "Fit", 0.16, "0.00", "与 Sheet 1 同口径")
kv(ws, 15, "本命系数", 0.8, "0.00", "")
kv(ws, 16, "spiritRate", 1.21, "0.00", "当前境界的累计倍率")
kv(ws, 17, "子嗣加成", 0.0, "0.0%", "")
kv(ws, 18, "当前等级 L", 3, "0", "算打坐转化率用")
kv(ws, 19, "互动体力/次", 20, "0", "已拍板：15 → 20")
ws["K5"] = "互动时长（小时）"
ws["M5"] = 1.0
ws["K6"] = "体力阈值（0=去掉）"
ws["M6"] = 0
for cell in ("K5", "K6"):
    ws[cell].font = BOLD
for cell in ("M5", "M6"):
    ws[cell].font = NORMAL
    ws[cell].fill = INPUT_FILL
    ws[cell].border = BORDER
    ws[cell].alignment = CENTER

section(ws, 20, "3.2 结算（公式实时）")
calc_rows = [
    ("小循环可用 L = 12 − S", "=12-B5", "0.00"),
    ("周期 C = 1 + B + 0.75N", "=1+B6+0.75*B7", "0.00"),
    ("完整周期 k", "=INT(B21/B22)", "0"),
    ("余时 r", "=B21-B23*B22", "0.00"),
    ("练功轮次", "=B23+IF(B24>=1,1,0)", "0"),
    ("炼体轮次", "=IF(B6=1,B23+IF(B24-1>=1,1,0),0)", "0"),
    ("每种百艺轮次（基础）", "=B23", "0"),
    ("体力消耗", "=B5*10+B25*3+B26*15+(B9+B10)*B27*0.75*5+(B11+B12)*B27*0.75*6", "0.0"),
    ("下班剩余体力", "=MAX(0,B8-B28)", "0.0"),
    ("互动次数 = min(floor(剩余/互动成本), 12/时长)", "=MIN(INT(MAX(0,B29-$M$6)/B19),INT(12/$M$5))", "0"),
    ("睡觉时长 = 12 − 时长×互动", "=12-$M$5*B30", "0.0"),
    ("次日体力 = min(睡觉×上限/4, 上限)", "=MIN(B31*B8/4,B8)", "0.0"),
    ("精力消耗", "=(B9+B10)*30+(B11+B12)*35", "0"),
    ("当日精力（含练功 +10/h）", "=MAX(0,MIN(100,100+B25*10-B33))", "0.0"),
    ("次日精力（睡觉 +5/h）", "=MAX(0,MIN(100,B34+B31*5))", "0.0"),
    ("每日灵力", "=B25*9.6*B13*(0.5+1.5*B14)*B15*B16*(1+B17)", "0"),
    ("每日修为", "=B36*(0.1*0.8^(B18-1)*1.3)", "0"),
]
for i, (label, formula, fmt) in enumerate(calc_rows):
    result_row(ws, 21 + i, label, formula, fmt)

note(ws, 39, "百艺轮次这里只算基础 k；余时的 45m 补位没展开，精确值见 md §4.3。")
note(ws, 40, "精力是「每种百艺每天」固定扣，不是每轮扣。四艺术全选 = 130/天，直接打穿 100 上限。")

# ============================================================
# Sheet 4 · 子嗣家族经济
# ============================================================
ws = wb.create_sheet("4-子嗣家族经济")
title(
    ws,
    "Sheet 4 · 子嗣、家族与经济（计算器）",
    "只保留输入 + 公式。加成系数 / P1-P13 月饷 / 子嗣月钱 / 14 岗位是静态参考表，见 数值真值表.md §5.1~§5.4。",
)

section(ws, 4, "4.1 战力计算器（设计 / 代码两套口径，别混用）")
kv(ws, 5, "设计·境界系数", 5.0, "0.00", "练气十 = 5.0；筑基初 = 10.0")
kv(ws, 6, "设计·灵根系数", 2.0, "0.00", "单灵根 2.0")
kv(ws, 7, "设计·本命系数", 1.2, "0.00", "灵兽 1.2")
kv(ws, 8, "设计·词条和", 0.10, "0.00", "稀有 +0.10")
result_row(ws, 9, "设计战力 = 10 × 境界 × 灵根 × 本命 × (1+词条)", "=10*B5*B6*B7*(1+B8)", "0")
kv(ws, 11, "代码·等级", 10, "0", "1 + 年龄×0.5")
kv(ws, 12, "代码·品质", 1.15, "0.00", "high")
kv(ws, 13, "代码·灵根", 1.8, "0.00", "1 灵根")
kv(ws, 14, "代码·本命", 1.15, "0.00", "灵兽")
kv(ws, 15, "代码·词条和", 0.07, "0.00", "rare")
result_row(ws, 16, "代码 mult", "=B12*B13*B14*(1+B15)", "0.00")
result_row(ws, 17, "代码生命", "=60*B11*B16", "0.00")
result_row(ws, 18, "代码攻击", "=6*B11*B16", "0.00")
result_row(ws, 19, "代码防御", "=3*B11*B16", "0.00")

section(ws, 21, "4.2 管理岗位")
kv(ws, 22, "有灵根成年子嗣", 5, "0", "")
kv(ws, 23, "无灵根成年子嗣", 50, "0", "")
kv(ws, 24, "门人", 3, "0", "")
result_row(ws, 25, "岗位总数 = 10 + 有灵根×2 + 无灵根×0.5 + 门人×0.3",
           "=10+B22*2+B23*0.5+B24*0.3", "0")

section(ws, 27, "4.3 怀孕率（×0.6，2026-10-17 拍板）")
kv(ws, 28, "位阶怀孕系数", 1.0, "0.00", "P1~P6 = 1.0；P13 = 0.2")
kv(ws, 29, "好感", 60, "0", "0~100")
result_row(ws, 30, "基础值 10% × 系数", "=0.1*B28", "0.0%")
result_row(ws, 31, "好感加成 min(好感×0.001, 10%)", "=MIN(B29*0.001,0.1)", "0.0%")
result_row(ws, 32, "怀孕率（正向部分 ×0.6）", "=(B30+B31)*0.6", "0.0%")

note(ws, 34, "助孕丹 +20%、自动模式 -5% 另算；本格只算正向部分 ×0.6（疲劳惩罚已于 2026-10-18 废除）。")
note(ws, 35, "P1-P13 位阶表与子嗣月钱见 md §5.2~§5.3；14 岗位见 §5.4。想算月饷总额，在 md 表里填人数即可。")

# ============================================================
# Sheet 5 · 三大系统产出
# ============================================================
ws = wb.create_sheet("5-三大系统产出")
title(
    ws,
    "Sheet 5 · 三大系统产出（冲突检查）",
    "只保留冲突检查。互补矩阵 / 镇守日产出 / 探索 EV / 秘境层表见 数值真值表.md §6.1~§6.4。",
)

section(ws, 4, "5.1 冲突检查")
kv(ws, 5, "镇守每日修为（筑基初期）", 224, "0", "md §6.2；填你当前想对比的境界值")
kv(ws, 6, "探索每日修为（已拍板删除）", 0, "0", "决策前凤凰谷 572；决策后 0")
result_row(ws, 7, "探索 / 镇守 倍数", "=B6/B5", "0.00")
note(ws, 8, "2026-10-17 拍板：删除探索修为。修为回归镇守唯一主源，冲突已消除。")

kv(ws, 10, "秘境 30 层灵石/现实小时（÷3 后）", 14550, "#,##0", "1,940 / 8 分钟 × 60")
kv(ws, 11, "探索 龙渊灵石/现实小时", 23160, "#,##0", "617.6 × 37.5")
result_row(ws, 12, "秘境 / 探索 倍数", "=B10/B11", "0.00")
note(ws, 13, "2026-10-17 拍板：秘境灵石 ÷3。现在探索是秘境的 1.6 倍，符合「探索给基础灵石」。")
note(ws, 15, "改完这三个比值，记得把结果回填《产出登记表》的变更记录（宪法第七章）。")

# ---------- 保存 ----------
for sheet in wb.worksheets:
    sheet.sheet_view.showGridLines = False
    sheet.freeze_panes = sheet.freeze_panes or "A3"

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.calculation.fullCalcOnLoad = True
wb.save(OUT)
print(f"written: {OUT}")
