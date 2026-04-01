import { useState } from 'react'
import { format, startOfWeek, startOfMonth, subDays, addDays, differenceInDays, getDaysInMonth } from 'date-fns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus, Download } from 'lucide-react'
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { getCategoryBreakdown, groupByDay, type Expense, type Category } from '@/data/mock'
import { T, CURRENCY, PRESETS, formatDay } from '@/lib/theme'
import { api } from '@/lib/api'
import { useCountUp } from '@/lib/useCountUp'
import { toast } from 'sonner'

function getDateRange(preset: string): { start: string; end: string } {
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  switch (preset) {
    case 'Today':
      return { start: today, end: today }
    case 'This Week': {
      const monday = startOfWeek(now, { weekStartsOn: 1 })
      return { start: format(monday, 'yyyy-MM-dd'), end: today }
    }
    case 'This Month': {
      const first = startOfMonth(now)
      return { start: format(first, 'yyyy-MM-dd'), end: today }
    }
    case 'Last 30 Days': {
      return { start: format(subDays(now, 30), 'yyyy-MM-dd'), end: today }
    }
    default:
      return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: today }
  }
}

function getPeriodDays(preset: string): number {
  const now = new Date()
  switch (preset) {
    case 'Today': return 1
    case 'This Week': return 7
    case 'This Month': return now.getDate()
    case 'Last 30 Days': return 30
    default: return now.getDate()
  }
}

function getPreviousDateRange(preset: string): { start: string; end: string } | null {
  const now = new Date()
  switch (preset) {
    case 'Today': {
      const d = format(subDays(now, 1), 'yyyy-MM-dd')
      return { start: d, end: d }
    }
    case 'This Week': {
      const monday = startOfWeek(now, { weekStartsOn: 1 })
      const elapsed = differenceInDays(now, monday)
      const prevMonday = subDays(monday, 7)
      return { start: format(prevMonday, 'yyyy-MM-dd'), end: format(addDays(prevMonday, elapsed), 'yyyy-MM-dd') }
    }
    case 'This Month': {
      const lastMonthEnd = subDays(startOfMonth(now), 1)
      const lastMonthStart = startOfMonth(lastMonthEnd)
      const sameDay = Math.min(now.getDate(), getDaysInMonth(lastMonthEnd))
      const prevEnd = new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth(), sameDay)
      return { start: format(lastMonthStart, 'yyyy-MM-dd'), end: format(prevEnd, 'yyyy-MM-dd') }
    }
    case 'Last 30 Days':
      return { start: format(subDays(now, 60), 'yyyy-MM-dd'), end: format(subDays(now, 31), 'yyyy-MM-dd') }
    default: return null
  }
}

function getPrevLabel(preset: string): string {
  switch (preset) {
    case 'Today':        return 'vs yesterday'
    case 'This Week':    return 'vs last week'
    case 'This Month':   return 'vs last month'
    case 'Last 30 Days': return 'vs prev 30d'
    default:             return 'vs prev period'
  }
}

function TrendBadge({ current, previous, label }: { current: number; previous: number | undefined; label: string }) {
  if (previous === undefined) {
    return <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{label}</span>
  }
  if (previous === 0 && current === 0) {
    return <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{label}</span>
  }
  if (previous === 0) {
    return <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>new · {label}</span>
  }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) {
    return <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>flat · {label}</span>
  }
  const up = pct > 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        fontSize: 11, fontFamily: T.fontMono, fontWeight: 600,
        color: up ? '#ef4444' : '#22c55e',
        background: up ? '#450a0a' : '#052e16',
        padding: '2px 7px', borderRadius: 5,
      }}>
        {up ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}%
      </span>
      <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{label}</span>
    </span>
  )
}

function exportCSV(expenses: Expense[], preset: string) {
  const header = 'Date,Time,Category,Emoji,Amount,Note'
  const rows = expenses.map((e) => {
    const d = new Date(e.created_at)
    const date = format(d, 'yyyy-MM-dd')
    const time = format(d, 'HH:mm:ss')
    const note = e.note ? `"${e.note.replace(/"/g, '""')}"` : ''
    return `${date},${time},"${e.category_name}",${e.category_emoji},${e.amount.toFixed(2)},${note}`
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trackdown-${preset.toLowerCase().replace(/ /g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [preset, setPreset] = useState('This Month')
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addAmount, setAddAmount] = useState('')
  const [addCategoryID, setAddCategoryID] = useState<number | null>(null)
  const [addNote, setAddNote] = useState('')

  const { start, end } = getDateRange(preset)
  const periodDays = getPeriodDays(preset)
  const prevRange = getPreviousDateRange(preset)
  const prevLabel = getPrevLabel(preset)

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', start, end],
    queryFn: () => api.getExpenses(start, end),
    placeholderData: (prev) => prev,
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  })
  const { data: prevExpenses } = useQuery({
    queryKey: ['expenses', prevRange?.start, prevRange?.end, 'prev'],
    queryFn: () => api.getExpenses(prevRange!.start, prevRange!.end),
    enabled: !!prevRange,
  })

  const delMut = useMutation({
    mutationFn: (id: number) => api.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setSelectedExpense(null)
      toast.success('Transaction deleted')
    },
    onError: () => toast.error('Failed to delete transaction'),
  })

  const addMut = useMutation({
    mutationFn: api.createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setAddOpen(false)
      setAddAmount('')
      setAddCategoryID(null)
      setAddNote('')
      toast.success('Expense added')
    },
    onError: () => toast.error('Failed to add expense'),
  })

  const handleAdd = () => {
    const amount = parseFloat(addAmount)
    if (!addCategoryID || isNaN(amount) || amount <= 0) return
    addMut.mutate({ category_id: addCategoryID, amount, note: addNote.trim() || undefined })
  }

  const total     = expenses.reduce((s, e) => s + e.amount, 0)
  const dailyAvg  = periodDays > 0 ? total / periodDays : 0
  const prevTotal    = prevExpenses ? prevExpenses.reduce((s, e) => s + e.amount, 0) : undefined
  const prevDailyAvg = prevTotal !== undefined && periodDays > 0 ? prevTotal / periodDays : undefined
  const prevCount    = prevExpenses?.length

  const animTotal    = useCountUp(total)
  const animDailyAvg = useCountUp(dailyAvg)
  const animCount    = useCountUp(expenses.length)

  const breakdown = getCategoryBreakdown(expenses, categories)
  const grouped   = groupByDay(expenses)
  const chartData = Object.entries(grouped)
    .map(([date, dayExp]) => ({
      date: format(new Date(date + 'T12:00:00'), 'MMM d'),
      amount: dayExp.reduce((s, e) => s + e.amount, 0),
    }))
    .reverse()

  const donutData = breakdown.map(c => ({ name: c.name, value: c.total }))
  const COLORS = [T.text, '#e4e4e7', '#a1a1aa', '#71717a', '#3f3f46', '#27272a']

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 sm:py-9" style={{ fontFamily: T.font }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: '-0.03em', fontFamily: T.font }}>
            Spending
          </h1>
          <p style={{ fontSize: 13, color: T.textMid, marginTop: 2, fontFamily: T.font }}>
            {format(new Date(), 'MMMM yyyy')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {PRESETS.map(p => (
            <button key={p} onClick={() => setPreset(p)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12,
              fontFamily: T.font, fontWeight: 500, cursor: 'pointer',
              background: preset === p ? T.text : 'transparent',
              color: preset === p ? T.bg : T.textMid,
              border: preset === p ? 'none' : `1px solid ${T.border}`,
              transition: 'all 0.15s',
            }}>
              {p}
            </button>
          ))}
          <Button onClick={() => setAddOpen(true)} style={{
            background: T.text, color: T.bg, fontFamily: T.font, fontSize: 12,
            height: 30, borderRadius: 8, gap: 4, paddingLeft: 10, paddingRight: 12,
          }}>
            <Plus size={12} /> Add
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {([
          {
            label: 'Total',
            val: `${CURRENCY}${animTotal.toFixed(2)}`,
            current: total, previous: prevTotal,
          },
          {
            label: 'Transactions',
            val: Math.round(animCount).toString(),
            current: expenses.length, previous: prevCount,
          },
          {
            label: 'Daily avg',
            val: `${CURRENCY}${animDailyAvg.toFixed(2)}`,
            current: dailyAvg, previous: prevDailyAvg,
          },
        ] as const).map(({ label, val, current, previous }) => (
          <Card key={label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: 'none', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: `radial-gradient(circle at top right, #ffffff08 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />
            <CardContent style={{ padding: '20px 24px', position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 500, color: T.textMid, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                {label}
              </p>
              <p style={{ fontFamily: T.fontMono, fontSize: 26, fontWeight: 500, color: T.text, letterSpacing: '-0.03em' }}>
                {val}
              </p>
              <div style={{ marginTop: 6 }}>
                <TrendBadge current={current} previous={previous} label={prevLabel} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font }}>
          Trend
        </h2>
        <Card style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: 'none', padding: '24px 20px 0 0', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '-50%', left: '-20%', width: '140%', height: '200%',
            background: `radial-gradient(circle, #ffffff05 0%, transparent 60%)`,
            pointerEvents: 'none',
          }} />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.text} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={T.text} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.borderHi} opacity={0.5} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: T.textDim, fontFamily: T.fontMono }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: T.textDim, fontFamily: T.fontMono }} tickFormatter={(val) => `${CURRENCY}${val}`} />
              <Tooltip
                contentStyle={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: T.fontMono, fontSize: 12 }}
                itemStyle={{ color: T.text, fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="amount" stroke={T.text} strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font }}>
              Transactions
            </h2>
            {expenses.length > 0 && (
              <button onClick={() => exportCSV(expenses, preset)} title="Export CSV" style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                borderRadius: 6, color: T.textDim, display: 'flex', alignItems: 'center',
                transition: 'color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = T.text)}
                onMouseLeave={e => (e.currentTarget.style.color = T.textDim)}
              >
                <Download size={13} />
              </button>
            )}
          </div>
          <Card style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: 'none' }}>
            {expenses.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: T.textMid, fontFamily: T.font }}>No transactions in this period</p>
                <p style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono, marginTop: 4 }}>
                  Log via Telegram or click Add above
                </p>
              </div>
            ) : (
              <div>
                {Object.entries(grouped).map(([date, dayExp]) => (
                  <div key={date}>
                    <div style={{ padding: '12px 20px 8px', background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {formatDay(date)}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textDim, marginLeft: 8 }}>
                        {CURRENCY}{dayExp.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                      </span>
                    </div>
                    {dayExp.map((exp, i) => (
                      <div key={exp.id}>
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '13px 20px', transition: 'background 0.1s', cursor: 'pointer',
                          }}
                          onClick={() => setSelectedExpense(exp)}
                          onMouseEnter={e => (e.currentTarget.style.background = T.bg)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 10,
                              border: `1px solid ${T.border}`, background: T.bg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                            }}>
                              {exp.category_emoji}
                            </div>
                            <div>
                              <p style={{ fontSize: 14, fontFamily: T.font, fontWeight: 500, color: T.text }}>{exp.category_name}</p>
                              {exp.note && <p style={{ fontSize: 12, color: T.textMid, fontFamily: T.font }}>{exp.note}</p>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 500, color: T.text }}>
                              {CURRENCY}{exp.amount.toFixed(2)}
                            </p>
                            <p style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
                              {format(new Date(exp.created_at), 'h:mm a')}
                            </p>
                          </div>
                        </div>
                        {i < dayExp.length - 1 && <Separator style={{ background: T.border }} />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font }}>
            By Category
          </h2>
          <Card style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: 'none' }}>
            <CardContent style={{ padding: '20px' }}>
              {breakdown.length === 0 ? (
                <p style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono, textAlign: 'center', padding: '16px 0' }}>
                  No data yet
                </p>
              ) : (
                <>
                  <div style={{ height: 160, display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%" cy="50%"
                          innerRadius={50} outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {donutData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: T.fontMono, fontSize: 12 }}
                          itemStyle={{ color: T.text, fontWeight: 600 }}
                          formatter={(val: unknown) => `${CURRENCY}${Number(val).toFixed(2)}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {breakdown.map((cat, i) => (
                      <div key={cat.id}>
                        <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 20, lineHeight: 1 }}>{cat.emoji}</span>
                            <div>
                              <p style={{ fontSize: 13, fontFamily: T.font, fontWeight: 500, color: T.text }}>{cat.name}</p>
                              <p style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textDim }}>{cat.count} txn</p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 13, fontFamily: T.fontMono, fontWeight: 500, color: T.text }}>
                              {CURRENCY}{cat.total.toFixed(2)}
                            </p>
                            <p style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textDim }}>
                              {cat.pct.toFixed(0)}%
                            </p>
                          </div>
                        </div>
                        <div style={{ height: 1, background: T.border, borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: T.text, width: `${cat.pct}%`, transition: 'width 0.8s ease' }} />
                        </div>
                        {i < breakdown.length - 1 && <div style={{ height: 0 }} />}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Expense detail sheet */}
      <Sheet open={!!selectedExpense} onOpenChange={(open) => !open && setSelectedExpense(null)}>
        <SheetContent style={{ background: T.surface, borderLeft: `1px solid ${T.border}`, maxWidth: 400, fontFamily: T.font }}>
          <SheetHeader style={{ marginBottom: 24 }}>
            <SheetTitle style={{ fontFamily: T.font, fontWeight: 700, fontSize: 18, color: T.text }}>
              Expense Details
            </SheetTitle>
          </SheetHeader>

          {selectedExpense && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ textAlign: 'center', padding: '32px 0', background: T.bg, borderRadius: 12, border: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 48 }}>{selectedExpense.category_emoji}</span>
                <p style={{ fontFamily: T.fontMono, fontSize: 36, fontWeight: 600, color: T.text, marginTop: 8 }}>
                  {CURRENCY}{selectedExpense.amount.toFixed(2)}
                </p>
                <p style={{ fontSize: 13, color: T.textMid, fontFamily: T.font, marginTop: 4 }}>
                  {selectedExpense.category_name}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Date & Time
                  </p>
                  <p style={{ fontSize: 14, color: T.text, fontFamily: T.fontMono }}>
                    {format(new Date(selectedExpense.created_at), 'MMM d, yyyy • h:mm a')}
                  </p>
                </div>
                {selectedExpense.note && (
                  <div>
                    <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      Note
                    </p>
                    <p style={{ fontSize: 14, color: T.text, fontFamily: T.font }}>
                      {selectedExpense.note}
                    </p>
                  </div>
                )}
              </div>

              <Separator style={{ background: T.border, margin: '8px 0' }} />

              <Button
                variant="destructive"
                style={{ width: '100%', background: '#450a0a', color: T.red, border: `1px solid #7f1d1d`, fontFamily: T.font, fontSize: 13 }}
                onClick={() => delMut.mutate(selectedExpense.id)}
                disabled={delMut.isPending}
              >
                <Trash2 size={14} style={{ marginRight: 8 }} />
                {delMut.isPending ? 'Deleting...' : 'Delete Transaction'}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add expense dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, maxWidth: 380, fontFamily: T.font }}>
          <DialogHeader style={{ marginBottom: 20 }}>
            <DialogTitle style={{ fontFamily: T.font, fontWeight: 700, fontSize: 18, color: T.text }}>
              Add Expense
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Amount
              </p>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={addAmount}
                onChange={e => setAddAmount(e.target.value)}
                autoFocus
                style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.fontMono, fontSize: 22, textAlign: 'center', height: 52, borderRadius: 10 }}
              />
            </div>

            <div>
              <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Category
              </p>
              {categories.length === 0 ? (
                <p style={{ fontSize: 13, color: T.textDim, fontFamily: T.fontMono }}>No categories yet — add some first.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {categories.map((cat: Category) => (
                    <button
                      key={cat.id}
                      onClick={() => setAddCategoryID(cat.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 13,
                        fontFamily: T.font, cursor: 'pointer', transition: 'all 0.12s',
                        background: addCategoryID === cat.id ? T.text : T.bg,
                        color: addCategoryID === cat.id ? T.bg : T.textMid,
                        border: `1px solid ${addCategoryID === cat.id ? T.text : T.border}`,
                      }}
                    >
                      {cat.emoji} {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Note <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </p>
              <Input
                placeholder="What was this for?"
                value={addNote}
                onChange={e => setAddNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, borderRadius: 9 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button onClick={() => setAddOpen(false)} style={{ flex: 1, background: 'transparent', color: T.textMid, fontFamily: T.font, borderRadius: 9, border: `1px solid ${T.border}` }}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={!addCategoryID || !addAmount || parseFloat(addAmount) <= 0 || addMut.isPending}
                style={{ flex: 1, background: T.text, color: T.bg, fontFamily: T.font, borderRadius: 9 }}
              >
                {addMut.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
