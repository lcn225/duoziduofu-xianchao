import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// 视觉层 V1.2：tokens.css = 唯一色源（--ui-*）；ui.css = 多页重复的排版原子
import './styles/tokens.css'
import './styles/ui.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
