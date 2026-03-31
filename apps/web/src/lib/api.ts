import axios from 'axios'
import { type Category, type Expense, type User } from '@/data/mock'

const client = axios.create({
  baseURL: 'http://localhost:8080/api',
  withCredentials: true,
})

export const api = {
  async getUser() {
    const { data } = await client.get<User>('/me')
    return data
  },
  
  async login(code: string) {
    const { data } = await client.post('/auth/code', { code })
    return data
  },

  async getCategories() {
    const { data } = await client.get<Category[]>('/categories')
    return data
  },

  async addCategory(cat: Partial<Category>) {
    const { data } = await client.post<Category>('/categories', cat)
    return data
  },

  async deleteCategory(id: number) {
    const { data } = await client.delete(`/categories?id=${id}`)
    return data
  },

  async getExpenses(start?: string, end?: string) {
    // Default to a wide range if not provided
    if (!start) start = '2020-01-01'
    if (!end) end = '2030-12-31'
    const { data } = await client.get<Expense[]>(`/expenses?start=${start}&end=${end}`)
    return data
  },

  async deleteExpense(_id: number) {
    // Backend doesn't support this yet, so we just resolve
    return { success: true }
  }
}
