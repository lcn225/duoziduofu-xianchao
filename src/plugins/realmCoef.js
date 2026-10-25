// 境界系数（2026-10-21 Q3 定稿；**2026-10-25 P43 从 secretRealm 抽出来**）
//
// 为什么单独一个文件：灵兽面板要跟子嗣共用同一套系数，但 `items.js` 不能 import
// `secretRealm.js` —— 后者 import `innerCourt.js`、后者又 import `items.js`，会成环。
// 这里只放纯系数，不依赖任何其它插件。
//
// 真源：《三大挂机》§4.8 /《数值真值表》§5.5、§5.8、§6.4b。
// 调参仍在 `secretRealm.TUNING.offspring.realmCoef`（它指向下面的 REALM_COEF），
// 断言与模拟器可以继续从 secretRealm 读 `realmCoefOf` / `realmCoefAt`（那边有薄包装）。

/** 境界系数基准（练气线性 1.0→5.0；筑基 10；结丹 30） */
export const REALM_COEF = { qiStart: 1.0, qiEnd: 5.0, qiLevels: 10, foundation: 10.0, core: 30.0 }

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

/**
 * **整数层**境界系数：练气一~十层 1.0→5.0 线性；11~20 一律 10（筑基）、21+ 一律 30（结丹）。
 * 子嗣/灵兽的面板都走它（灵兽同修后的等级也是整数层）。
 */
export const realmCoefOf = (level, spec = REALM_COEF) => {
  const lv = Math.max(Math.floor(num(level, 1)), 1)
  const qiLevels = Math.max(num(spec.qiLevels, 10), 1)
  if (lv <= qiLevels) {
    return num(spec.qiStart, 1) + ((lv - 1) * (num(spec.qiEnd, 5) - num(spec.qiStart, 1))) / (qiLevels - 1)
  }
  if (lv <= qiLevels * 2) return num(spec.foundation, 10)
  return num(spec.core, 30)
}

/**
 * **连续版**境界系数：把「等效层数」（可带小数）映射成战力系数，供敌人曲线用。
 *
 * 练气 1~10 层 1.0 → 5.0（与 Q3 完全一致，线性）；
 * 筑基 11~20 层 10.0 → 20.0、结丹 21~30 层 30.0 → 60.0 —— Q3 只给了
 * 「筑基 10.0 / 结丹 30.0」两个点，境界内部的爬升是**占位**，等筑基落地再定；
 * 30 层以上按每 10 层 ×3 继续外推，同样是占位。
 *
 * ⚠ 与 `realmCoefOf`（整数层、筑基/结丹给平值）在 11 层以后不一致 ——
 * 子嗣现在封顶练气九层，碰不到，等筑基实现时要把两者合并成一个函数。
 */
export const realmCoefAt = (level, spec = REALM_COEF) => {
  const qiLevels = Math.max(num(spec.qiLevels, 10), 2)
  const foundation = num(spec.foundation, 10)
  const core = num(spec.core, 30)
  const lv = num(level, 1)
  if (lv <= qiLevels) {
    return num(spec.qiStart, 1) + ((lv - 1) * (num(spec.qiEnd, 5) - num(spec.qiStart, 1))) / (qiLevels - 1)
  }
  if (lv <= qiLevels * 2) return foundation * (1 + (lv - qiLevels - 1) / (qiLevels - 1))
  if (lv <= qiLevels * 3) return core * (1 + (lv - qiLevels * 2 - 1) / (qiLevels - 1))
  return core * 2 * Math.pow(3, (lv - qiLevels * 3) / 10)
}
