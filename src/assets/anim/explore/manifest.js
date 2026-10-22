// 探索场景（P28.2 横版卷轴）专用素材表，手写，**不要**并进 ../manifest.js
// （那份是 scripts/import-anims.py 自动生成的，重跑会覆盖）。
//
// 素材源在 素材/探索动画/（gitignore），这里放的是复制进来的发布用副本：
//   far.png           长岭乡远景 4066×1152（源图 4096，左边缘 30 列是纯白杂边，已裁掉；
//                     裁完首尾色差 2.7，可正常拼接，不需要镜像）
//   near.png          长岭乡近景 2048×1152 RGBA（底部 15% 有内容，首尾基本相接）
//   walk-alpha.webm   桂冈走路抠图.mp4 colorkey(0.02) 重编码 640×360（真 alpha 通道）
//
// ⚠ 2026-10-22 两条踩过的坑，别走回头路：
// 1. 「最终人物_完美透明.webm」不能用：容器写着 alpha_mode:1，但 alpha 面实际是空的，
//    浏览器里整个视频全透明（不是黑底）。
// 2. 黑底视频 + `mix-blend-mode: screen` 也不行：Chrome 把 <video> 提升成独立合成层，
//    混合模式不生效，只会留下一个黑方块。**所以人物必须走真 alpha 的 webm。**
// 3. colorkey 的相似度别开大：0.12 / 0.04 都会把人物的深色衣服/头发一起抠掉（人物能透出背景），
//    **0.02:0.01** 才是合适的（背景是纯黑，只够吃掉压缩噪声；matte 验证过人物内部全实心）。

import far from './far.png'
import near from './near.png'
import walkAlpha from './walk-alpha.webm'

/** 图层宽高比，算循环时长用（宽 / 高） */
export const FAR_RATIO = 4066 / 1152
export const NEAR_RATIO = 2048 / 1152

export default { far, near, walkAlpha }
