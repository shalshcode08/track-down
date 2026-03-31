import { useState } from 'react'
import { format } from 'date-fns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

import { getCategoryBreakdown, groupByDay, type Expense } from '@/data/mock'
import { T, PRESETS, formatDay } from '@/lib/theme'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [preset, setPreset] = useState('This Month')
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: () => api.getExpenses() })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.getCategories() })

  const delMut = useMutation({
    mutationFn: api.deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setSelectedExpense(null)
      toast.success('Transaction deleted')
    }
  })

  const total      = expenses.reduce((s, e) => s + e.amount, 0)
  const breakdown  = getCategoryBreakdown(expenses, categories)
  const grouped    = groupByDay(expenses)
  const chartData  = Object.entries(grouped)
    .map(([date, dayExp]) => ({
      date: format(new Date(date + 'T12:00:00'), 'MMM d'),
      amount: dayExp.reduce((s, e) => s + e.amount, 0)
    })).reverse()
    
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
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total',        val: `$${total.toFixed(2)}`,    sub: 'all categories' },
          { label: 'Transactions', val: String(expenses.length),   sub: 'this period' },
          { label: 'Daily avg',    val: `$${(total / 7).toFixed(2)}`, sub: 'per day' },
        ].map(({ label, val, sub }) => (
          <Card key={label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: 'none', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: `radial-gradient(circle at top right, #ffffff08 0%, transparent 70%)`,
              pointerEvents: 'none'
            }} />
            <CardContent style={{ padding: '20px 24px', position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 500, color: T.textMid, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                {label}
              </p>
              <p style={{ fontFamily: T.fontMono, fontSize: 26, fontWeight: 500, color: T.text, letterSpacing: '-0.03em' }}>
                {val}
              </p>
              <p style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font }}>
          Analyzing
        </h2>
        <Card style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: 'none', padding: '24px 20px 0 0', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '-50%', left: '-20%', width: '140%', height: '200%',
            background: `radial-gradient(circle, #ffffff05 0%, transparent 60%)`,
            pointerEvents: 'none'
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
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: T.textDim, fontFamily: T.fontMono }} tickFormatter={(val) => `$${val}`} />
              <Tooltip 
                contentStyle={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: T.fontMono, fontSize: 12 }}
                itemStyle={{ color: T.text, fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="amount" stroke={T.text} strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font }}>
            Transactions
          </h2>
          <Card style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: 'none' }}>
            <div>
              {Object.entries(grouped).map(([date, dayExp]) => (
                <div key={date}>
                  <div style={{ padding: '12px 20px 8px', background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {formatDay(date)}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textDim, marginLeft: 8 }}>
                      ${dayExp.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                    </span>
                  </div>
                  {dayExp.map((exp, i) => (
                    <div key={exp.id}>
                      <div 
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '13px 20px', transition: 'background 0.1s', cursor: 'pointer'
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
                            ${exp.amount.toFixed(2)}
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
          </Card>
        </div>

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font }}>
            By Category
          </h2>
          <Card style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: 'none' }}>
            <CardContent style={{ padding: '20px' }}>
              
              {breakdown.length > 0 && (
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
                        formatter={(val: unknown) => `$${Number(val).toFixed(2)}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

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
                          ${cat.total.toFixed(2)}
                        </p>
                        <p style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textDim }}>
                          {cat.pct.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                    <div style={{ height: 1, background: T.border, borderRadius: 999, overflow: 'hidden', marginBottom: 0 }}>
                      <div style={{ height: '100%', background: T.text, width: `${cat.pct}%`, transition: 'width 0.8s ease' }} />
                    </div>
                    {i < breakdown.length - 1 && <div style={{ height: 0 }} />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
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
                  ${selectedExpense.amount.toFixed(2)}
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
                <Trash2 size={14} style={{ marginRight: 8 }} /> {delMut.isPending ? 'Deleting...' : 'Delete Transaction'}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}