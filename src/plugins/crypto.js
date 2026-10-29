// 存档加解密。
//
// 两条通路（2026-10-29 P58）：
//   · **新档** = WebCrypto AES-GCM —— 原生实现，2MB 明文 20~40ms
//   · **老档** = CryptoJS AES —— 纯 JS，2MB 要 400~700ms，**只读不写**
//
// 为什么换：P58 实测「时钟在走 = 主线程 100%」，其中纯 JS 加密占 976ms/次
// （见《下一步》P58 微基准）。换成原生实现后同样的档位一次只要几十毫秒。
//
// 格式：`vux2:` + base64( iv(12 字节) + 密文与 tag )
//   前缀不只是版本号 —— `decryptText` 靠它判断走哪条通路。
//   老档（CryptoJS 输出的 base64、没有前缀）永远能解，所以**不需要 SAVE_VERSION 升版**：
//   加密格式与存档结构是两件事，读老档 → 下一次落盘自动写成新格式（就在原地迁移）。
//
// ⚠ `crypto.subtle` 只在**安全上下文**可用（https / localhost）。
//   file:// 直接打开页面时拿不到，会退回 CryptoJS 通路 —— 慢，但写得出来、读得回去。
//   真遇到「打开就卡」，先看是不是双击 index.html 打开的。
import CryptoJS from 'crypto-js'

/** 存档口令。老档 CryptoJS 直接拿它当 passphrase；新档拿它过 PBKDF2。 */
const PASSPHRASE = 'vue-idle-xiuxian'
/**
 * PBKDF2 的固定盐。
 * 本地单机游戏没有服务器来存「每档一盐」，所以盐只能是常量 ——
 * 它的作用只是让口令不能直接被当密钥用，不是防离线爆破。
 */
const KDF_SALT = 'vue-idle-xiuxian/v2'
/** 迭代次数：一个会话只派生一次（CryptoKey 缓存），一次性 30~60ms */
const KDF_ITERATIONS = 120000
/** AES-GCM 的 IV 长度（标准 96 位） */
const IV_BYTES = 12

/** 新格式的密文前缀 */
export const SAVE_FORMAT_V2 = 'vux2:'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const subtleOf = () => (globalThis.crypto && globalThis.crypto.subtle) || null

/** 派生好的 AES-GCM 密钥（Promise 缓存：同一个会话只算一次） */
let keyPromise = null
const deriveKey = () => {
  if (keyPromise) return keyPromise
  const subtle = subtleOf()
  if (!subtle) {
    keyPromise = Promise.resolve(null)
    return keyPromise
  }
  keyPromise = (async () => {
    const baseKey = await subtle.importKey('raw', textEncoder.encode(PASSPHRASE), 'PBKDF2', false, [
      'deriveKey'
    ])
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: textEncoder.encode(KDF_SALT), iterations: KDF_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  })().catch(error => {
    // 派生失败不能把整个存档锁死：退回 CryptoJS 通路（慢但可用）
    console.error('WebCrypto 密钥派生失败，退回 CryptoJS：', error)
    return null
  })
  return keyPromise
}

/** 分块拼二进制串 —— `String.fromCharCode(...arr)` 直接上 2MB 会爆调用栈 */
const B64_CHUNK = 0x8000
const bytesToBase64 = bytes => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + B64_CHUNK))
  }
  return btoa(binary)
}
const base64ToBytes = text => {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 加密一段**明文文本**。
 * @returns 密文字符串；失败返回 null（调用方据此报错，不要把 null 写进库）
 */
export const encryptText = async text => {
  try {
    const subtle = subtleOf()
    const key = subtle ? await deriveKey() : null
    if (key) {
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
      const body = new Uint8Array(
        await subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(text))
      )
      const packed = new Uint8Array(iv.length + body.length)
      packed.set(iv, 0)
      packed.set(body, iv.length)
      return SAVE_FORMAT_V2 + bytesToBase64(packed)
    }
    return CryptoJS.AES.encrypt(text, PASSPHRASE).toString()
  } catch (error) {
    console.error('数据加密失败:', error)
    return null
  }
}

/**
 * 解密一段密文文本（新老两种格式都能吃）。
 * @returns 明文；失败返回 null（含口令错、格式坏、被截断）
 */
export const decryptText = async encrypted => {
  if (typeof encrypted !== 'string' || !encrypted) return null
  try {
    if (encrypted.startsWith(SAVE_FORMAT_V2)) {
      const subtle = subtleOf()
      const key = subtle ? await deriveKey() : null
      if (!key) {
        console.error('当前环境不支持 WebCrypto，解不开 v2 格式存档')
        return null
      }
      const packed = base64ToBytes(encrypted.slice(SAVE_FORMAT_V2.length))
      if (packed.length <= IV_BYTES) return null
      const plain = await subtle.decrypt(
        { name: 'AES-GCM', iv: packed.subarray(0, IV_BYTES) },
        key,
        packed.subarray(IV_BYTES)
      )
      return textDecoder.decode(plain)
    }
    // 老档：CryptoJS（纯 JS，只在读到老档的那一刻付一次这个钱）
    const bytes = CryptoJS.AES.decrypt(encrypted, PASSPHRASE)
    return bytes.toString(CryptoJS.enc.Utf8) || null
  } catch (error) {
    console.error('数据解密失败:', error)
    return null
  }
}

/** 加密整个存档对象（序列化在这里，调用方负责先 toRaw） */
export const encryptData = async data => {
  try {
    return await encryptText(JSON.stringify(data))
  } catch (error) {
    console.error('数据序列化失败:', error)
    return null
  }
}

/** 解密整个存档对象 */
export const decryptData = async encryptedData => {
  const plain = await decryptText(encryptedData)
  if (!plain) return null
  try {
    return JSON.parse(plain)
  } catch (error) {
    console.error('存档解析失败:', error)
    return null
  }
}

// 存档版本号
// 与旧存档结构不兼容时递增，旧版本存档会被直接丢弃并重开新档。
//
// v3：契合度体系整体重做（四维加权、灵气扩到 7 类、同参改接近度×品阶、
//     灵地改纯匹配、门槛改 55/60/70/80/85、祭炼取消、entry 去掉 level
//     与 refineSeconds、开局灵地改快子峰顶木屋）。旧档数值全部作废，直接清档。
//
// ⚠ 2026-10-29 P58 换了**加密格式**（AES-GCM/`vux2:`），**没有**升 SAVE_VERSION：
//   加密是外层包装，老档照样解得开，升版反而会把玩家档全清掉。
export const SAVE_VERSION = 3

// 数据校验
export const validateData = data => {
  // 检查必要的数据字段
  const requiredFields = ['name', 'level', 'realm', 'cultivation', 'maxCultivation', 'spirit', 'baseAttributes']

  for (const field of requiredFields) {
    if (!(field in data)) {
      console.error(`数据验证失败: 缺少必要字段 ${field}`)
      return false
    }
  }

  // 存档版本校验（旧档没有 saveVersion 字段，undefined !== SAVE_VERSION，直接判废）
  if (data.saveVersion !== SAVE_VERSION) {
    console.warn(`存档版本不符: 期望 ${SAVE_VERSION}，实际 ${data.saveVersion ?? '无'}`)
    return false
  }

  // 检查数值的合理性
  if (data.level < 1 || data.cultivation < 0 || data.spirit < 0) {
    console.error('数据验证失败: 数值异常')
    return false
  }

  return true
}
