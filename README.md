# 我的放置仙途
<p align="center">
    <img src="https://i0.hdslb.com/bfs/article/c5bd547efa79470ccaab206c22b694c48941412.png" width="400">
</p>
<p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license MIT"></a>
    <a href="https://qm.qq.com/q/iifNs5qukg"><img src="https://img.shields.io/badge/QQ%E7%BE%A4-920930589-green" alt="QQ群：920930589"></a>
</p>

## 技术栈

- **前端框架**: [Vue.js](https://cn.vuejs.org)
- **构建工具**: [Vite](https://cn.vite.dev)
- **状态管理** [Pinia](https://pinia.vuejs.org/zh)
- **UI组件库** [Naive UI](https://www.naiveui.com/zh-CN)

## 主要功能
- [x] 角色系统
- [x] 奇遇系统
- [x] 探索系统
- [x] 背包系统
- [x] 成就系统
- [x] 灵宠系统
- [x] 灵宠养成系统
- [x] 装备系统
- [x] 装备养成系统
- [x] 抽奖系统
- [x] 炼丹系统 
- [x] 设置系统
- [x] 数据管理系统
- [x] GM系统

## Docker-Compose安装部署
```bash
version: '3.9'
services:
    vue-idle-xiuxian:
        image: kowming/vue-idle-xiuxian:latest
        container_name: xiuxian
        restart: unless-stopped
        ports:
            - 8183:8080
        tty: true
        stdin_open: true
```

## NPM部署
```bash
# 安装依赖
npm install

# 开发环境运行
npm run dev

# 构建生产版本
npm run build
```

## 鸣谢

感谢以下开源项目的支持：

- Vue.js - 渐进式JavaScript框架
- Vite - 下一代前端构建工具
- Naive UI - Vue3组件库
- Pinia - Vue状态管理库

## 版权声明

Copyright © 2025 我的放置仙途

本项目采用MIT许可证。详情请参阅LICENSE文件。

```
MIT License

版权所有 (c) 2025 我的放置仙途

特此免费授予任何获得本软件和相关文档文件（"软件"）副本的人不受限制地处理本软件的权利，
包括但不限于使用、复制、修改、合并、发布、分发、再许可和/或出售本软件副本的权利，
以及允许获得本软件的人这样做，但须符合以下条件：

上述版权声明和本许可声明应包含在本软件的所有副本或重要部分中。

本软件按"原样"提供，不提供任何形式的明示或暗示的保证，包括但不限于对适销性、特定用途的
适用性和非侵权性的保证。在任何情况下，作者或版权持有人均不对任何索赔、损害或其他责任负责，
无论是在合同诉讼、侵权行为或其他方面，由软件或软件的使用或其他交易引起、产生或与之相关。
```
