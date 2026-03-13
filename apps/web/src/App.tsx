import { useState, useEffect } from 'react'
import { format, isToday, isYesterday, startOfWeek, startOfMonth, subDays } from 'date-fns'
import {
  Wallet, Plus, Trash2, TrendingUp, Calendar, Settings,
  X, BarChart3,
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const FONT_IMPORT = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,400;0,500;0,700&display=swap');
  * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
  input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.4); }
`

const EMOJI_ROWS = [
  ['🍔','🍕','🍜','🧃','🍺','🍰','☕','🍱'],
  ['🚗','🚌','🛵','✈️','🚕','⛽','🚲','🏍️'],
  ['🛒','🛍️','👗','👟','📦','🎁','💄','🧴'],
  ['🏠','💡','💻','📱','🎮','📺','🔧','🏋️'],
  ['💊','🏥','💉','🧪','🩺','💆','🦷','🩻'],
  ['🎬','🎵','🎭','🎪','🎨','🎸','🎯','🏆'],
  ['💰','💳','🏦','💵','📊','🤑','💸','💹'],
]

const PRESETS = ['Today', 'This Week', 'This Month', 'Last 30 Days'] as const

interface Category { id: number; user_id: number; name: string; emoji: string; sort_order: number }
interface Expense { id: number; user_id: number; category_id: number; amount: number; note: string | null; created_at: string; category_name: string; category_emoji: string }
interface User { id: number; name: string }

// ─── Bar gradient colours cycling through blue → indigo → violet ─────────────
const BAR_GRADIENTS = [
  ['#3b82f6','#60a5fa'],
  ['#6366f1','#818cf8'],
  ['#8b5cf6','#a78bfa'],
  ['#06b6d4','#67e8f9'],
  ['#10b981','#34d399'],
  ['#f59e0b','#fbbf24'],
]

function App() {
  const [user, setUser]           = useState<User | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses]   = useState<Expense[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [newCat, setNewCat]       = useState({ name: '', emoji: '💰' })
  const [activePreset, setActivePreset] = useState<string>('Today')
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end:   format(new Date(), 'yyyy-MM-dd'),
  })
  const [total, setTotal] = useState(0)

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { if (user) { fetchCategories(); fetchExpenses() } }, [user, dateRange])

  const checkAuth = async () => {
    try {
      const res = await fetch(`${API_URL}/api/me`, { credentials: 'include' })
      if (res.ok) setUser(await res.json())
    } catch { /* not authed */ }
    finally { setLoading(false) }
  }

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/api/categories`, { credentials: 'include' })
      if (res.ok) setCategories(await res.json())
    } catch { /**/ }
  }

  const fetchExpenses = async () => {
    try {
      const res = await fetch(`${API_URL}/api/expenses?start=${dateRange.start}&end=${dateRange.end}`, { credentials: 'include' })
      if (res.ok) {
        const data: Expense[] = await res.json()
        setExpenses(data)
        setTotal(data.reduce((s, e) => s + e.amount, 0))
      }
    } catch { /**/ }
  }

  const handleTelegramAuth = async (userData: unknown) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/telegram`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData), credentials: 'include',
      })
      if (res.ok) setUser(await res.json())
    } catch { /**/ }
  }

  const applyPreset = (preset: string) => {
    const today = new Date()
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
    setActivePreset(preset)
    const map: Record<string, { start: string; end: string }> = {
      'Today':       { start: fmt(today), end: fmt(today) },
      'This Week':   { start: fmt(startOfWeek(today, { weekStartsOn: 1 })), end: fmt(today) },
      'This Month':  { start: fmt(startOfMonth(today)), end: fmt(today) },
      'Last 30 Days':{ start: fmt(subDays(today, 30)), end: fmt(today) },
    }
    if (map[preset]) setDateRange(map[preset])
  }

  const addCategory = async () => {
    if (!newCat.name.trim()) return
    try {
      const res = await fetch(`${API_URL}/api/categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCat), credentials: 'include',
      })
      if (res.ok) { fetchCategories(); setNewCat({ name: '', emoji: '💰' }); setShowAdd(false) }
    } catch { /**/ }
  }

  const deleteCategory = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/categories?id=${id}`, { method: 'DELETE', credentials: 'include' })
      fetchCategories()
    } catch { /**/ }
  }

  // ── derived data ──────────────────────────────────────────────────────────
  const categoryBreakdown = categories
    .map(cat => {
      const catExpenses = expenses.filter(e => e.category_id === cat.id)
      const catTotal = catExpenses.reduce((s, e) => s + e.amount, 0)
      return { ...cat, total: catTotal, count: catExpenses.length, pct: total > 0 ? (catTotal / total) * 100 : 0 }
    })
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)

  const groupedExpenses = expenses.reduce<Record<string, Expense[]>>((acc, e) => {
    const day = e.created_at.split('T')[0]
    ;(acc[day] ??= []).push(e)
    return acc
  }, {})

  const formatDayHeader = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    if (isToday(d))     return 'Today'
    if (isYesterday(d)) return 'Yesterday'
    return format(d, 'EEEE, MMM d')
  }

  // ── loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center">
      <style>{FONT_IMPORT}</style>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center animate-pulse">
          <Wallet className="w-5 h-5 text-blue-400" />
        </div>
        <p className="text-xs font-mono text-white/20 tracking-widest">LOADING</p>
      </div>
    </div>
  )

  if (!user) return <LoginPage onAuth={handleTelegramAuth} />

  // ── dashboard ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080810] text-gray-100" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <style>{FONT_IMPORT}</style>

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#080810]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Wallet className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-[15px] tracking-tight">TrackDown</span>
          </div>
          <span className="text-xs px-3 py-1 rounded-full border border-white/[0.07] bg-white/[0.03] text-white/40 font-mono">
            {user.name}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Total */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#0e1528] to-[#09091a] p-5">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="w-3 h-3 text-white/25" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Total Spent</span>
            </div>
            <p className="font-bold leading-none text-white" style={{ fontFamily: "'DM Mono', monospace", fontSize: 'clamp(1.6rem, 4vw, 2.4rem)' }}>
              <span className="text-blue-400 mr-0.5" style={{ fontSize: '60%' }}>$</span>
              {total.toFixed(2)}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-400">
                {expenses.length} txn{expenses.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Date Range */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0c0c18] p-5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Calendar className="w-3 h-3 text-white/25" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Date Range</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date" value={dateRange.start}
                onChange={e => { setDateRange(p => ({ ...p, start: e.target.value })); setActivePreset('') }}
                className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs text-gray-400 outline-none focus:border-blue-500/40 transition-colors min-w-0"
              />
              <span className="text-white/20 text-xs">→</span>
              <input
                type="date" value={dateRange.end}
                onChange={e => { setDateRange(p => ({ ...p, end: e.target.value })); setActivePreset('') }}
                className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs text-gray-400 outline-none focus:border-blue-500/40 transition-colors min-w-0"
              />
            </div>
          </div>

          {/* Categories count */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0c0c18] p-5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Settings className="w-3 h-3 text-white/25" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Categories</span>
            </div>
            <p className="font-bold leading-none text-white" style={{ fontFamily: "'DM Mono', monospace", fontSize: 'clamp(1.6rem, 4vw, 2.4rem)' }}>
              {categories.length}
            </p>
            <p className="text-[10px] font-mono text-white/20 mt-2">configured</p>
          </div>
        </div>

        {/* ── Quick Presets ── */}
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map(preset => (
            <button
              key={preset}
              onClick={() => applyPreset(preset)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                activePreset === preset
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/35 shadow-sm shadow-blue-500/10'
                  : 'bg-white/[0.03] text-white/30 border border-white/[0.06] hover:border-white/10 hover:text-white/60'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* ── Expenses + Breakdown ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Expense list – 3 cols */}
          <div className="lg:col-span-3 rounded-2xl border border-white/[0.07] bg-[#0c0c18] overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Expenses</span>
                {expenses.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-400">
                    {expenses.length}
                  </span>
                )}
              </div>
            </div>

            {expenses.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 gap-2">
                <span className="text-4xl opacity-40">🤖</span>
                <p className="text-sm text-white/25 text-center">No expenses in this range.</p>
                <p className="text-xs text-white/15 text-center">Send an amount to your Telegram bot to log one.</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[500px] flex-1">
                {Object.entries(groupedExpenses).map(([date, dayExpenses]) => (
                  <div key={date}>
                    <div className="px-5 py-2 sticky top-0 bg-[#0a0a16]/95 backdrop-blur-sm z-10">
                      <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
                        {formatDayHeader(date)}
                      </span>
                    </div>
                    {dayExpenses.map(expense => (
                      <div
                        key={expense.id}
                        className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.015] transition-colors border-b border-white/[0.03] last:border-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[18px] flex-shrink-0">
                            {expense.category_emoji}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-300 truncate">{expense.category_name}</p>
                            <p className="text-[10px] font-mono text-white/20">
                              {format(new Date(expense.created_at), 'h:mm a')}
                            </p>
                          </div>
                        </div>
                        <p className="font-bold text-white flex-shrink-0 ml-3" style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.95rem' }}>
                          <span className="text-blue-400/70 mr-0.5 text-[10px]">$</span>
                          {expense.amount.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Breakdown – 2 cols */}
          <div className="lg:col-span-2 rounded-2xl border border-white/[0.07] bg-[#0c0c18] overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center gap-2 flex-shrink-0">
              <BarChart3 className="w-3.5 h-3.5 text-white/20" />
              <span className="text-sm font-semibold">Breakdown</span>
            </div>

            {categoryBreakdown.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-white/20 text-center">No data for this period.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4 overflow-y-auto">
                {categoryBreakdown.map((cat, i) => {
                  const [from, to] = BAR_GRADIENTS[i % BAR_GRADIENTS.length]
                  return (
                    <div key={cat.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base flex-shrink-0">{cat.emoji}</span>
                          <span className="text-xs font-medium text-gray-400 truncate">{cat.name}</span>
                          <span className="text-[10px] font-mono text-white/20 flex-shrink-0">×{cat.count}</span>
                        </div>
                        <span className="text-xs font-bold text-white ml-2 flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace" }}>
                          ${cat.total.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${cat.pct}%`,
                            background: `linear-gradient(90deg, ${from} 0%, ${to} 100%)`,
                            transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                          }}
                        />
                      </div>
                      <p className="text-[10px] font-mono text-white/20 mt-0.5 text-right">{cat.pct.toFixed(1)}%</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Categories Management ── */}
        <div className="rounded-2xl border border-white/[0.07] bg-[#0c0c18] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Categories</span>
              <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono text-white/30">
                {categories.length}
              </span>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/35 px-3 py-1.5 rounded-lg transition-all"
            >
              <Plus className="w-3 h-3" />
              Add Category
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-white/20">No categories yet.</p>
              <p className="text-xs text-white/10 mt-1">Add one above to start logging expenses via Telegram.</p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className="bg-white/[0.025] hover:bg-white/[0.045] border border-white/[0.06] rounded-xl px-3 py-2.5 flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg flex-shrink-0">{cat.emoji}</span>
                    <span className="text-xs font-medium text-gray-400 truncate">{cat.name}</span>
                  </div>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400/50 hover:text-red-400 transition-all flex-shrink-0 ml-1"
                    title="Delete category"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Add Category Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f0f1c] border border-white/[0.09] rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-sm">New Category</h3>
              <button onClick={() => setShowAdd(false)} className="text-white/20 hover:text-white/60 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-white/25 mb-2">Pick an Emoji</label>
                <div className="space-y-1.5 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                  {EMOJI_ROWS.map((row, ri) => (
                    <div key={ri} className="flex gap-1">
                      {row.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => setNewCat(p => ({ ...p, emoji }))}
                          className={`flex-1 aspect-square rounded-lg text-lg flex items-center justify-center transition-all duration-150 ${
                            newCat.emoji === emoji
                              ? 'bg-blue-500/20 border border-blue-500/40 scale-110 shadow-sm shadow-blue-500/20'
                              : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.07]'
                          }`}
                          style={{ fontSize: 'clamp(0.8rem, 2.5vw, 1.1rem)' }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-white/25 mb-2">Name</label>
                <input
                  type="text"
                  value={newCat.name}
                  onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder="e.g., Food, Transport, Shopping…"
                  className="w-full bg-white/[0.04] border border-white/[0.07] focus:border-blue-500/35 rounded-xl px-4 py-2.5 text-sm outline-none placeholder-white/15 text-gray-200 transition-colors"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 px-4 py-2.5 text-xs text-white/30 hover:text-white/60 border border-white/[0.06] hover:border-white/10 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addCategory}
                  disabled={!newCat.name.trim()}
                  className="flex-1 px-4 py-2.5 text-xs bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/25 hover:border-blue-500/40 rounded-xl transition-all font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {newCat.emoji} Add {newCat.name.trim() || 'Category'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Login Page ───────────────────────────────────────────────────────────────
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || ''

function LoginPage({ onAuth }: { onAuth: (data: unknown) => void }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const trimmed = code.trim()
    if (trimmed.length !== 6) { setError('Enter the 6-digit code from Telegram.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/auth/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
        credentials: 'include',
      })
      if (res.ok) {
        onAuth(await res.json())
      } else {
        setError('Invalid or expired code. Send /login to the bot again.')
      }
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center p-4 relative overflow-hidden"
      style={{ fontFamily: "'Outfit', sans-serif" }}>
      <style>{FONT_IMPORT}</style>

      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-[340px] relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-2xl shadow-blue-600/30 mb-4">
            <Wallet className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">TrackDown</h1>
          <p className="text-white/30 text-sm mt-1">Expense tracking, straight from Telegram.</p>
        </div>

        {/* Card */}
        <div className="bg-[#0d0d1a] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-5">

          {/* Steps */}
          <div className="space-y-3">
            {[
              <>Open <span className="text-blue-400 font-mono">@{BOT_USERNAME || 'your_bot'}</span> on Telegram</>,
              <>Send <span className="text-blue-400 font-mono">/login</span> to the bot</>,
              'Paste the 6-digit code below',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-mono text-blue-400">{i + 1}</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          {/* Code input */}
          <div className="space-y-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="_ _ _ _ _ _"
              className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-blue-500/40 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] outline-none placeholder-white/10 text-gray-200 transition-colors"
              autoFocus
            />
            {error && <p className="text-xs text-red-400/80 text-center font-mono">{error}</p>}
          </div>

          <button
            onClick={submit}
            disabled={loading || code.length !== 6}
            className="w-full py-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/25 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying…' : 'Log in'}
          </button>

          <p className="text-[10px] font-mono text-white/15 text-center">
            code expires in 5 minutes · your data is never shared
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
