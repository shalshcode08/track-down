import axios from 'axios'
import { type Category, type Expense, type User } from '@/data/mock'

const ORIGIN = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080'

const client = axios.create({
  baseURL: ORIGIN,
  withCredentials: true,
})

export const api = {
  async getUser() {
    const { data } = await client.get<User>('/api/me')
    return data
  },

  async login(code: string) {
    const { data } = await client.post('/api/auth/code', { code })
    return data
  },

  async getCategories() {
    const { data } = await client.get<Category[]>('/api/categories')
    return data
  },

  async addCategory(cat: { name: string; emoji: string; sort_order?: number }) {
    const { data } = await client.post<Category>('/api/categories', cat)
    return data
  },

  async deleteCategory(id: number) {
    await client.delete(`/api/categories?id=${id}`)
  },

  async getExpenses(start?: string, end?: string) {
    const today = new Date().toISOString().split('T')[0]
    if (!start) start = today.slice(0, 7) + '-01'
    if (!end) end = today
    const { data } = await client.get<Expense[]>(`/api/expenses?start=${start}&end=${end}`)
    return data
  },

  async createExpense(payload: { category_id: number; amount: number; note?: string }) {
    const { data } = await client.post<Expense>('/api/expenses', payload)
    return data
  },

  async deleteExpense(id: number) {
    await client.delete(`/api/expenses?id=${id}`)
  },
}
