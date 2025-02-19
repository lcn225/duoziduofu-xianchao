import { createRouter, createWebHistory } from 'vue-router'
import { usePlayerStore } from '../stores/player'

const routes = [
    {
        path: '/',
        name: 'Home',
        component: () => import('../views/Home.vue')
    },
    {
        path: '/cultivation',
        name: 'Cultivation',
        component: () => import('../views/Cultivation.vue')
    },
    {
        path: '/inventory',
        name: 'Inventory',
        component: () => import('../views/Inventory.vue')
    },
    {
        path: '/exploration',
        name: 'Exploration',
        component: () => import('../views/Exploration.vue')
    },
    {
        path: '/achievements',
        name: 'Achievements',
        component: () => import('../views/Achievements.vue')
    },
    {
        path: '/settings',
        name: 'Settings',
        component: () => import('../views/Settings.vue')
    },
    {
        path: '/gm',
        name: 'gm',
        component: () => import('../views/GM.vue'),
        beforeEnter: (to, from, next) => {
            const playerStore = usePlayerStore()
            if (!playerStore.isGMMode) {
                next('/cultivation')
            } else {
                next()
            }
        }
    },
    { 
        path: '/alchemy', 
        name: 'alchemy', 
        component: () => import('../views/Alchemy.vue') 
    },
    { 
        path: '/dungeon', 
        name: 'Dungeon', 
        component: () => import('../views/Dungeon.vue') 
    },
    {
        path: '/pet-gacha',
        name: 'PetGacha',
        component: () => import('../views/PetGacha.vue')
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

export default router