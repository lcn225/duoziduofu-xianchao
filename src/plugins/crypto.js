// 使用 CryptoJS 进行数据加密和解密
import CryptoJS from "crypto-js";

// 数据加密
export function encryptData(data) {
  try {
    const jsonStr = JSON.stringify(data);
    return CryptoJS.AES.encrypt(jsonStr, "vue-idle-xiuxian").toString();
  } catch (error) {
    console.error("数据加密失败:", error);
    return null;
  }
}

// 数据解密
export function decryptData(encryptedData) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, "vue-idle-xiuxian");
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedStr);
  } catch (error) {
    console.error("数据解密失败:", error);
    return null;
  }
}

// 数据校验
export function validateData(data) {
  // 必要字段列表
  const requiredFields = [
    "name",
    "level",
    "realm",
    "spirit",
    "cultivation",
    // ... 其他必要字段
  ];
  // 检查所有必要字段是否存在
  for (const field of requiredFields) {
    if (data[field] === undefined) {
      console.error(`数据验证失败: 缺少必要字段 ${field}`);
      return false;
    }
  }
  // 检查数据类型和值的合法性
  if (typeof data.name !== "string" || data.name.length === 0) return false;
  if (typeof data.level !== "number" || data.level < 1) return false;
  if (typeof data.spirit !== "number" || data.spirit < 0) return false;
  if (typeof data.cultivation !== "number" || data.cultivation < 0)
    return false;
  return true;
}
