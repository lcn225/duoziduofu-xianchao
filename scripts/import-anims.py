#!/usr/bin/env python3
"""把 素材/SS 里的精灵图集（PNG + JSON atlas）打包成页面用的动态 WebP。

用法（在仓库根目录）：
    python scripts/import-anims.py
    python scripts/import-anims.py --height 300 --quality 80 --fps 10
    python scripts/import-anims.py --src 素材/SS --out src/assets/anim

输入：
    - 每个 .zip 里要有 spritesheet_*.png + *.json（TexturePacker / Phaser 格式）
    - 或者一个已解压的目录，里面同样有 png + json
输出：
    src/assets/anim/<kind>.webp          动态 WebP（原生循环，10fps）
    src/assets/anim/<kind>-poster.webp   首帧静态海报（prefers-reduced-motion / 加载兜底）
    src/assets/anim/manifest.js          给 DayAnimation.vue 用的静态 import 表

新增动画：把 zip 丢进 素材/SS，在 ANIM_KINDS 里加一行（或直接把 zip 命名成英文 kind），
重跑本脚本即可；组件不需要改。
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path

from PIL import Image

# 中文 SS 名 → 组件里的 kind。新增动画在这里加一行；也可以直接把 zip 命名成英文 kind。
ANIM_KINDS = {
    "巡视乡间": "patrol",
    "练功": "practice",
    "炼器": "forge",
    "睡觉": "sleep",
    "炼丹": "alchemy",
    "炼符": "talisman",
    "炼阵": "array",
    "互动": "interact",
}


def find_atlas(folder: Path) -> tuple[Path, Path] | None:
    """在目录里找 atlas 的 png + json。"""
    jsons = sorted(folder.glob("*.json"))
    pngs = sorted(folder.glob("*.png"))
    if not jsons or not pngs:
        return None
    # 优先 spritesheet_1.*，否则取第一个
    j = next((p for p in jsons if p.stem.startswith("spritesheet_1")), jsons[0])
    p = next((p for p in pngs if p.stem.startswith("spritesheet_1")), pngs[0])
    return j, p


def discover(src: Path) -> list[tuple[str, Path, bool]]:
    """返回 [(kind, 路径, 是否 zip)]。"""
    items: list[tuple[str, Path, bool]] = []
    if not src.exists():
        raise SystemExit(f"找不到素材目录：{src}")
    for entry in sorted(src.iterdir()):
        if entry.is_dir():
            kind = ANIM_KINDS.get(entry.name) or (entry.name if entry.name.isascii() else None)
            if kind and find_atlas(entry):
                items.append((kind, entry, False))
        elif entry.suffix.lower() == ".zip":
            stem = entry.stem
            kind = ANIM_KINDS.get(stem) or (stem if stem.isascii() else None)
            if kind:
                items.append((kind, entry, True))
    return items


def load_frames(atlas_path: Path) -> list[dict]:
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    raw = atlas["frames"]
    # TexturePacker 的 dict 格式；也兼容数组格式
    if isinstance(raw, dict):
        entries = sorted(raw.items(), key=lambda kv: kv[0])
        return [m for _, m in entries]
    return sorted(raw, key=lambda m: m.get("filename", ""))


def frame_image(sheet: Image.Image, meta: dict) -> Image.Image:
    f = meta["frame"]
    img = sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    if meta.get("rotated"):
        # TexturePacker 的 rotated 帧是顺时针存进去的，转回来
        img = img.transpose(Image.ROTATE_90)
    if meta.get("trimmed"):
        src = meta.get("sourceSize") or {}
        off = meta.get("spriteSourceSize") or {}
        w = int(src.get("w") or img.width)
        h = int(src.get("h") or img.height)
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        canvas.paste(img, (int(off.get("x") or 0), int(off.get("y") or 0)))
        return canvas
    return img


def import_one(
    kind: str,
    folder: Path,
    out_dir: Path,
    height: int,
    quality: int,
    fps: int,
    frame_ms: int | None,
) -> dict:
    atlas = find_atlas(folder)
    if not atlas:
        raise SystemExit(f"[{kind}] 目录里没有 png + json：{folder}")
    json_path, png_path = atlas
    metas = load_frames(json_path)
    if not metas:
        raise SystemExit(f"[{kind}] atlas 里没有帧：{json_path}")

    sheet = Image.open(png_path).convert("RGBA")
    frames: list[Image.Image] = []
    for meta in metas:
        img = frame_image(sheet, meta)
        out_w = max(1, round(img.width * height / img.height))
        frames.append(img.resize((out_w, height), Image.LANCZOS))

    duration = frame_ms or max(1, round(1000 / fps))
    webp = out_dir / f"{kind}.webp"
    poster = out_dir / f"{kind}-poster.webp"
    frames[0].save(
        webp,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        quality=quality,
        method=6,
    )
    frames[0].save(poster, format="WEBP", quality=quality, method=6)
    return {
        "webp": f"./{kind}.webp",
        "poster": f"./{kind}-poster.webp",
        "frames": len(frames),
        "durationMs": duration * len(frames),
        "width": frames[0].width,
        "height": frames[0].height,
        "bytes": webp.stat().st_size,
    }


def write_manifest(entries: dict[str, dict], out_dir: Path) -> None:
    lines = [
        "// 自动生成，勿手改。重新生成：python scripts/import-anims.py",
        "// 键 = DayAnimation 的 kind；值里的 webp/poster 是 Vite 处理后的指纹 URL。",
        "",
    ]
    names = {}
    for kind in entries:
        ident = "".join(ch if ch.isalnum() else "_" for ch in kind)
        names[kind] = ident
        lines.append(f"import {ident} from './{kind}.webp'")
        lines.append(f"import {ident}Poster from './{kind}-poster.webp'")
    lines.append("")
    lines.append("export default {")
    for kind, meta in entries.items():
        ident = names[kind]
        fields = ", ".join(
            f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in meta.items() if k not in ("webp", "poster")
        )
        lines.append(f"  {json.dumps(kind, ensure_ascii=False)}: {{ webp: {ident}, poster: {ident}Poster, {fields} }},")
    lines.append("}")
    (out_dir / "manifest.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out_dir / "manifest.json").write_text(
        json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="素材/SS", help="SS 素材目录（zip 或已解压目录）")
    ap.add_argument("--out", default="src/assets/anim", help="输出目录")
    ap.add_argument("--height", type=int, default=300, help="输出高度（px）")
    ap.add_argument("--quality", type=int, default=80, help="WebP 质量")
    ap.add_argument("--fps", type=int, default=10, help="帧率（GIF/SS 通常是 10fps）")
    ap.add_argument("--frame-ms", type=int, default=None, help="每帧毫秒；给了就覆盖 --fps")
    ap.add_argument("--max-total-mb", type=float, default=3.0, help="总量上限（MB），超过则报错")
    ap.add_argument("--allow-oversize", action="store_true", help="超过上限也继续")
    args = ap.parse_args()

    src = Path(args.src)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    items = discover(src)
    if not items:
        raise SystemExit(f"在 {src} 里没找到可导入的 SS（zip 或解压目录）")

    entries: dict[str, dict] = {}
    with tempfile.TemporaryDirectory(prefix="anim-import-") as tmp:
        for kind, path, is_zip in items:
            if is_zip:
                work = Path(tmp) / kind
                work.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(path) as zf:
                    zf.extractall(work)
                folder = work
            else:
                folder = path
            meta = import_one(kind, folder, out_dir, args.height, args.quality, args.fps, args.frame_ms)
            entries[kind] = meta
            print(
                f"[{kind:10s}] {meta['frames']:3d} 帧  {meta['width']}x{meta['height']}  "
                f"{meta['bytes'] / 1024:7.1f} KB  {meta['durationMs'] / 1000:.1f}s"
            )

    write_manifest(entries, out_dir)
    total = sum(m["bytes"] for m in entries.values())
    print(f"\n合计：{total / 1024 / 1024:.2f} MB（{len(entries)} 段）")
    print(f"输出：{out_dir}/  + manifest.js")
    if total > args.max_total_mb * 1024 * 1024 and not args.allow_oversize:
        print(
            f"⚠ 超过 {args.max_total_mb} MB 预算。降 --height / --quality，"
            f"或显式加 --allow-oversize。",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
