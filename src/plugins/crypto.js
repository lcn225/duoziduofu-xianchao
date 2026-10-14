// 使用 CryptoJS 进行数据加密和解密
import CryptoJS from 'crypto-js'

// 数据加密
export const encryptData = data => {
  try {
    const jsonStr = JSON.stringify(data)
    return CryptoJS.AES.encrypt(jsonStr, 'vue-idle-xiuxian').toString()
  } catch (error) {
    console.error('数据加密失败:', error)
    return null
  }
}

// 数据解密
export const decryptData = encryptedData => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, 'vue-idle-xiuxian')
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8)
    return JSON.parse(decryptedStr)
  } catch (error) {
    console.error('数据解密失败:', error)
    return null
  }
}

// 存档版本号
// 与旧存档结构不兼容时递增，旧版本存档会被直接丢弃并重开新档
export const SAVE_VERSION = 2

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
