import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { T, EMOJI_ROWS } from '@/lib/theme'
import { api } from '@/lib/api'
import type { Category } from '@/data/mock'

type ModalMode = 'add' | 'edit'

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('add')
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [name, setName]   = useState('')
  const [emoji, setEmoji] = useState('💰')

  const { data: cats = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api.getCategories() })

  const addMut = useMutation({
    mutationFn: api.addCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      closeModal()
      toast.success('Category added')
    },
    onError: () => toast.error('Failed to add category'),
  })

  const editMut = useMutation({
    mutationFn: ({ id, cat }: { id: number; cat: { name: string; emoji: string } }) =>
      api.updateCategory(id, cat),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      closeModal()
      toast.success('Category updated')
    },
    onError: () => toast.error('Failed to update category'),
  })

  const delMut = useMutation({
    mutationFn: api.deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Category deleted')
    },
    onError: () => toast.error('Failed to delete category'),
  })

  function openAdd() {
    setModalMode('add')
    setEditTarget(null)
    setName('')
    setEmoji('💰')
    setModalOpen(true)
  }

  function openEdit(cat: Category) {
    setModalMode('edit')
    setEditTarget(cat)
    setName(cat.name)
    setEmoji(cat.emoji)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditTarget(null)
    setName('')
    setEmoji('💰')
  }

  function submit() {
    if (!name.trim()) return
    if (modalMode === 'edit' && editTarget) {
      editMut.mutate({ id: editTarget.id, cat: { name: name.trim(), emoji } })
    } else {
      addMut.mutate({ name: name.trim(), emoji, sort_order: cats.length })
    }
  }

  const isPending = addMut.isPending || editMut.isPending

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 sm:py-9" style={{ fontFamily: T.font }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: '-0.03em' }}>Categories</h1>
          <p style={{ fontSize: 13, color: T.textMid, marginTop: 2 }}>Used by your Telegram bot to log expenses.</p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto" style={{
          background: T.accent, color: '#1e1b4b', fontFamily: T.font, fontWeight: 600,
          fontSize: 13, gap: 6, height: 36, borderRadius: 9,
          boxShadow: `0 0 14px rgba(129, 140, 248, 0.3)`,
        }}>
          <Plus size={14} /> Add Category
        </Button>
      </div>

      <Card style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: 'none', overflow: 'hidden' }}>
        {cats.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: T.textMid, fontFamily: T.font }}>No categories yet</p>
            <p style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono, marginTop: 4 }}>
              Add one to start logging expenses via Telegram.
            </p>
          </div>
        )}
        {cats.map((cat, i) => (
          <div key={cat.id}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = T.bg)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  border: `1px solid ${T.border}`, background: T.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}>
                  {cat.emoji}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontFamily: T.font, fontWeight: 500, color: T.text }}>{cat.name}</p>
                  <p style={{ fontSize: 11, fontFamily: T.fontMono, color: T.textDim }}>#{cat.id}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => openEdit(cat)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: T.textDim, padding: '6px 8px', borderRadius: 8, transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.border }}
                  onMouseLeave={e => { e.currentTarget.style.color = T.textDim; e.currentTarget.style.background = 'transparent' }}
                >
                  <Pencil size={14} />
                </button>
                <button onClick={() => delMut.mutate(cat.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: T.textDim, padding: '6px 8px', borderRadius: 8, transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = '#450a0a' }}
                  onMouseLeave={e => { e.currentTarget.style.color = T.textDim; e.currentTarget.style.background = 'transparent' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {i < cats.length - 1 && <Separator style={{ background: T.border }} />}
          </div>
        ))}
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, maxWidth: 400, fontFamily: T.font }}>
          <DialogHeader style={{ marginBottom: 24 }}>
            <DialogTitle style={{ fontFamily: T.font, fontWeight: 700, fontSize: 18, color: T.text }}>
              {modalMode === 'edit' ? 'Edit Category' : 'New Category'}
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Emoji
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {EMOJI_ROWS.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: 4 }}>
                    {row.map(e => (
                      <button key={e} onClick={() => setEmoji(e)} style={{
                        flex: 1, aspectRatio: '1', borderRadius: 8, fontSize: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.1s',
                        background: emoji === e ? T.text : T.bg,
                        border: `1px solid ${emoji === e ? T.text : T.border}`,
                        filter: emoji === e ? 'none' : 'grayscale(20%)',
                      }}>
                        {e}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, fontFamily: T.font, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Name
              </p>
              <Input
                value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="Food, Transport, Shopping…"
                autoFocus
                style={{ border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, borderRadius: 9, background: T.bg }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={closeModal} style={{ flex: 1, background: 'transparent', color: T.textMid, fontFamily: T.font, borderRadius: 9, border: `1px solid ${T.border}` }}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!name.trim() || isPending} style={{ flex: 1, background: T.text, color: T.bg, fontFamily: T.font, borderRadius: 9 }}>
                {isPending ? 'Saving…' : modalMode === 'edit' ? `Save ${emoji}` : `Add ${emoji}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
