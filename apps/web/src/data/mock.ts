export interface Category {
  id: number
  user_id: number
  name: string
  emoji: string
  sort_order: number
}

export interface Expense {
  id: number
  user_id: number
  category_id: number
  amount: number
  note: string | null
  created_at: string
  category_name: string
  category_emoji: string
}

export interface User {
  id: number
  name: string
}

export const MOCK_USER: User = { id: 1, name: 'Somya' }

export const MOCK_CATEGORIES: Category[] = [
  { id: 1, user_id: 1, name: 'Food', emoji: '🍔', sort_order: 0 }
]

export const MOCK_EXPENSES: Expense[] = []

export function getCategoryBreakdown(expenses: Expense[], categories: Category[]) {
  const total = expenses.reduce((s, e) => s + e.amount, 0)
  return categories
    .map(cat => {
      const catExpenses = expenses.filter(e => e.category_id === cat.id)
      const catTotal = catExpenses.reduce((s, e) => s + e.amount, 0)
      return {
        ...cat,
        total: catTotal,
        count: catExpenses.length,
        pct: total > 0 ? (catTotal / total) * 100 : 0,
      }
    })
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
}

export function groupByDay(expenses: Expense[]): Record<string, Expense[]> {
  return expenses.reduce<Record<string, Expense[]>>((acc, e) => {
    const day = e.created_at.split('T')[0]
    ;(acc[day] ??= []).push(e)
    return acc
  }, {})
}
