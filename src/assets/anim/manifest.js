// 自动生成，勿手改。重新生成：python scripts/import-anims.py
// 键 = DayAnimation 的 kind；值里的 webp/poster 是 Vite 处理后的指纹 URL。

import patrol from './patrol.webp'
import patrolPoster from './patrol-poster.webp'
import forge from './forge.webp'
import forgePoster from './forge-poster.webp'
import sleep from './sleep.webp'
import sleepPoster from './sleep-poster.webp'
import practice from './practice.webp'
import practicePoster from './practice-poster.webp'

export default {
  "patrol": { webp: patrol, poster: patrolPoster, frames: 44, durationMs: 4400, width: 398, height: 300, bytes: 921044 },
  "forge": { webp: forge, poster: forgePoster, frames: 24, durationMs: 2400, width: 300, height: 300, bytes: 182242 },
  "sleep": { webp: sleep, poster: sleepPoster, frames: 27, durationMs: 2700, width: 300, height: 300, bytes: 123716 },
  "practice": { webp: practice, poster: practicePoster, frames: 28, durationMs: 2800, width: 300, height: 300, bytes: 316584 },
}
