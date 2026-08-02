import { createRouter, createWebHashHistory } from 'vue-router'
import TodosView from '@/views/TodosView.vue'
import ArticlesView from '@/views/ArticlesView.vue'
import ShareView from '@/views/ShareView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/todos' },
    { path: '/todos', name: 'todos', component: TodosView },
    { path: '/articles/:id?', name: 'articles', component: ArticlesView },
    { path: '/share/:id', name: 'share', component: ShareView },
  ],
})
