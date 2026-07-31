import { createRouter, createWebHashHistory } from 'vue-router'
import TodosView from '@/views/TodosView.vue'
import ArticlesView from '@/views/ArticlesView.vue'
import GraphView from '@/views/GraphView.vue'
import TagsView from '@/views/TagsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/todos' },
    { path: '/todos', name: 'todos', component: TodosView },
    { path: '/articles/:id?', name: 'articles', component: ArticlesView },
    { path: '/graph', name: 'graph', component: GraphView },
    { path: '/tags', name: 'tags', component: TagsView },
  ],
})
