#!/usr/bin/env python3
"""把 素材/SS 里的精灵图集（PNG + JSON atlas）打包成页面用的 WebM 动画。

用法（在仓库根目录）：
    python scripts/import-anims.py
    python scripts/import-anims.py --height 300 --fps 10 --crf 32
    python scripts/import-anims.py --src 素材/SS --out src/assets/anim

输入：
    - 每个 .zip 里要有 spritesheet_*.png + *.json（TexturePacker / Phaser 格式）
    - 或者一个已解压的目录，里面同样有 png + json
输出：
    src/assets/anim/<kind>.webm          动态 WebM（VP9 + alpha，页面用 <video loop> 播）
    src/assets/anim/<kind>-poster.webp   首帧静态海报（prefers-reduced-motion / 加载兜底）
    src/assets/anim/manifest.js          给 DayAnimation.vue 用的静态 import 表

为什么 2026-10-20 从动态 WebP 换成 WebM：
    动态 WebP 在 Chrome 里走图片解码，300px 素材一多就吃内存、掉帧；
    WebM/VP9 走视频解码管线，体积也更小。alpha 用 yuva420p 保留透明背景。

ffmpeg 查找顺序：`--ffmpeg` 参数 → 环境变量 FFMPEG → PATH 里的 ffmpeg
→ `imageio_ffmpeg` 自带的二进制（pip install imageio-ffmpeg）。

新增动画：把 zip 丢进 素材/SS，在 ANIM_KINDS 里加一行（或直接把 zip 命名成英文 kind），
重跑本脚本即可；组件不需要改。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
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

# `素材/webm` 里已经编码好的成片 → kind（2026-10-21 新增 `--from-webm` 模式）。
# 命名和 SS 目录不完全一致（「乡间巡视」vs「巡视乡间」、「修炼」vs「练功」），
# 这里统一兜住；不认识的仍按 ASCII 名当 kind，中文名会被跳过。
WEBM_KINDS = {
    "乡间巡视": "patrol",
    "巡视乡间": "patrol",
    "修炼": "practice",
    "练功": "practice",
    "炼器": "forge",
    "睡觉": "sleep",
    "炼体": "body",
    "妻妾互动": "evening",
    "互动": "interact",
    "炼丹": "alchemy",
    "制符": "talisman",
    "炼符": "talisman",
    "药浴": "bath",
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


def find_ffmpeg(explicit: str | None) -> str:
    """找 ffmpeg：参数 → 环境变量 → PATH → imageio-ffmpeg 自带。"""
    if explicit:
        return explicit
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    raise SystemExit(
        "找不到 ffmpeg。装一个（winget install Gyan.FFmpeg）或 "
        "`pip install imageio-ffmpeg`，也可以用 --ffmpeg=路径 指定。"
    )


def import_one(
    kind: str,
    folder: Path,
    out_dir: Path,
    ffmpeg: str,
    height: int,
    quality: int,
    fps: int,
    frame_ms: int | None,
    crf: int,
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
    webm = out_dir / f"{kind}.webm"
    poster = out_dir / f"{kind}-poster.webp"

    # 先把帧写成 PNG 序列，再交给 ffmpeg —— VP9 只吃视频流，Pillow 不能直接写 WebM
    with tempfile.TemporaryDirectory(prefix=f"anim-{kind}-") as tmp:
        for i, frame in enumerate(frames):
            frame.save(Path(tmp) / f"frame_{i:05d}.png")
        cmd = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-framerate",
            str(fps if not frame_ms else round(1000 / frame_ms, 4)),
            "-i",
            str(Path(tmp) / "frame_%05d.png"),
            "-c:v",
            "libvpx-vp9",
            # alpha 通道：yuva420p + 关闭 alt-ref（VP9 alpha 的已知要求）
            "-pix_fmt",
            "yuva420p",
            "-auto-alt-ref",
            "0",
            "-b:v",
            "0",
            "-crf",
            str(crf),
            "-an",
            str(webm),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise SystemExit(f"[{kind}] ffmpeg 失败：\n{result.stderr.strip()}")

    frames[0].save(poster, format="WEBP", quality=quality, method=6)
    return {
        "webm": f"./{kind}.webm",
        "poster": f"./{kind}-poster.webp",
        "frames": len(frames),
        "durationMs": duration * len(frames),
        "width": frames[0].width,
        "height": frames[0].height,
        "bytes": webm.stat().st_size,
    }


def probe_duration_ms(ffmpeg: str, src: Path) -> int:
    """用 ffmpeg -i 的 stderr 拿时长（有的机器没有 ffprobe）。"""
    # Windows 默认用 GBK 解码子进程输出，而 ffmpeg 的 stderr 带 UTF-8 文件名 —— 必须显式指定
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(src)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
    if not m:
        return 0
    h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
    return round((h * 3600 + mi * 60 + s) * 1000)


def import_webm_one(
    kind: str,
    src: Path,
    out_dir: Path,
    ffmpeg: str,
    height: int,
    quality: int,
    crf: int,
) -> dict:
    """把已经编码好的 webm 接到项目里：缩放/转码 + 抽首帧海报。

    ⚠ 这是**二次编码**（源成片 → 300px VP9），和 SS 直出的画质会有细微差别；
    能拿到 SS 时优先走 SS。
    """
    webm = out_dir / f"{kind}.webm"
    poster = out_dir / f"{kind}-poster.webp"
    scale = f"scale=-1:{height}:flags=lanczos"

    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(src),
        "-vf", scale,
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0",
        "-b:v", "0",
        "-crf", str(crf),
        "-an",
        str(webm),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"[{kind}] ffmpeg 转码失败：\n{result.stderr.strip()}")

    with tempfile.TemporaryDirectory(prefix=f"anim-{kind}-") as tmp:
        frame_path = Path(tmp) / "poster.png"
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(src),
            "-vf", scale,
            "-frames:v", "1",
            str(frame_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise SystemExit(f"[{kind}] 抽首帧失败：\n{result.stderr.strip()}")
        img = Image.open(frame_path).convert("RGBA")
        img.save(poster, format="WEBP", quality=quality, method=6)

    duration_ms = probe_duration_ms(ffmpeg, src)
    return {
        "webm": f"./{kind}.webm",
        "poster": f"./{kind}-poster.webp",
        "frames": max(1, round(duration_ms / 100)) if duration_ms else 0,
        "durationMs": duration_ms,
        "width": img.width,
        "height": img.height,
        "bytes": webm.stat().st_size,
    }


def write_manifest(entries: dict[str, dict], out_dir: Path) -> None:
    lines = [
        "// 自动生成，勿手改。重新生成：python scripts/import-anims.py",
        "// 键 = DayAnimation 的 kind；值里的 webm/poster 是 Vite 处理后的指纹 URL。",
        "",
    ]
    names = {}
    for kind in entries:
        ident = "".join(ch if ch.isalnum() else "_" for ch in kind)
        names[kind] = ident
        lines.append(f"import {ident} from './{kind}.webm'")
        lines.append(f"import {ident}Poster from './{kind}-poster.webp'")
    lines.append("")
    lines.append("export default {")
    for kind, meta in entries.items():
        ident = names[kind]
        fields = ", ".join(
            f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in meta.items() if k not in ("webm", "poster")
        )
        lines.append(f"  {json.dumps(kind, ensure_ascii=False)}: {{ webm: {ident}, poster: {ident}Poster, {fields} }},")
    lines.append("}")
    (out_dir / "manifest.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out_dir / "manifest.json").write_text(
        json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="素材/SS", help="SS 素材目录（zip 或已解压目录）")
    ap.add_argument(
        "--from-webm",
        default=None,
        help="改成从已编码的 webm 目录导入（如 素材/webm）；会与现有 manifest 合并",
    )
    ap.add_argument(
        "--only",
        default=None,
        help="只导入这些 kind（逗号分隔），配合 --from-webm 用，避免动到已有动画",
    )
    ap.add_argument("--out", default="src/assets/anim", help="输出目录")
    ap.add_argument("--height", type=int, default=300, help="输出高度（px）")
    ap.add_argument("--quality", type=int, default=80, help="海报 WebP 质量")
    ap.add_argument("--fps", type=int, default=10, help="帧率（GIF/SS 通常是 10fps）")
    ap.add_argument("--frame-ms", type=int, default=None, help="每帧毫秒；给了就覆盖 --fps")
    ap.add_argument("--crf", type=int, default=32, help="VP9 质量（数值越小越清晰/越大）")
    ap.add_argument("--ffmpeg", default=None, help="ffmpeg 可执行文件路径")
    ap.add_argument("--max-total-mb", type=float, default=3.0, help="总量上限（MB），超过则报错")
    ap.add_argument("--allow-oversize", action="store_true", help="超过上限也继续")
    args = ap.parse_args()

    src = Path(args.src)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg(args.ffmpeg)

    # ---- 模式 A：已有成片 webm，直接接入（2026-10-21）----
    if args.from_webm:
        webm_src = Path(args.from_webm)
        if not webm_src.exists():
            raise SystemExit(f"找不到 webm 目录：{webm_src}")
        only = {s.strip() for s in (args.only or "").split(",") if s.strip()}
        manifest_path = out_dir / "manifest.json"
        entries: dict[str, dict] = (
            json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
        )

        targets: list[tuple[str, Path]] = []
        for f in sorted(webm_src.glob("*.webm")):
            kind = WEBM_KINDS.get(f.stem) or (f.stem if f.stem.isascii() else None)
            if not kind:
                print(f"跳过（不认识的中文名）：{f.name}", file=sys.stderr)
                continue
            if only and kind not in only:
                continue
            targets.append((kind, f))

        if not targets:
            raise SystemExit(f"在 {webm_src} 里没找到可导入的 webm（--only 可能过滤光了）")

        for kind, f in targets:
            meta = import_webm_one(kind, f, out_dir, ffmpeg, args.height, args.quality, args.crf)
            entries[kind] = meta
            print(
                f"[{kind:10s}] {meta['durationMs'] / 1000:5.1f}s  {meta['width']}x{meta['height']}  "
                f"{meta['bytes'] / 1024:7.1f} KB"
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
            meta = import_one(
                kind,
                folder,
                out_dir,
                ffmpeg,
                args.height,
                args.quality,
                args.fps,
                args.frame_ms,
                args.crf,
            )
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
