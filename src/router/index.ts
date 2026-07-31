import { createRouter, createWebHashHistory } from 'vue-router'
import TodosView from '@/views/TodosView.vue'
import NotesView from '@/views/NotesView.vue'
import GraphView from '@/views/GraphView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/todos' },
    { path: '/todos', name: 'todos', component: TodosView },
    { path: '/notes/:id?', name: 'notes', component: NotesView },
    { path: '/graph', name: 'graph', component: GraphView },
  ],
})
