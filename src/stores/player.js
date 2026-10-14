import { defineStore } from 'pinia'
import { buildStore } from './modules/index'

// 全量定义按模块拆分在 ./modules/ 下，这里只做组装。
// 对外仍是同一个 usePlayerStore()，所以视图层无需改动。
export const usePlayerStore = defineStore('player', buildStore())
