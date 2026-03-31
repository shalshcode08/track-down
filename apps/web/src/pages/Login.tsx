import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, ArrowRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { T } from '@/lib/theme'

export default function LoginPage() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()
  const { login, user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/')
    }
  }, [user, isLoading, navigate])

  const loginMut = useMutation({
    mutationFn: login,
    onSuccess: () => navigate('/'),
    onError: () => toast.error('Invalid or expired code')
  })

  const handleLogin = () => {
    if (code.length === 6) loginMut.mutate(code)
  }

  if (isLoading) return null

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2" style={{ fontFamily: T.font }}>
      <div className="p-8 py-12 md:p-14 relative overflow-hidden flex flex-col items-start justify-center" style={{
        background: T.bg,
        borderRight: `1px solid ${T.border}`,
      }}>
        <div style={{
          position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 300, height: 300, background: `#ffffff0a`,
          borderRadius: '50%', filter: 'blur(60px)',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            border: `1px solid ${T.borderHi}`,
            background: T.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 28,
          }}>
            <Wallet size={22} color={T.text} strokeWidth={2} />
          </div>
          <h1 style={{ fontFamily: T.font, fontWeight: 800, fontSize: 40, color: T.text, letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 12 }}>
            Track<br />Down
          </h1>
          <p style={{ fontSize: 14, color: T.textMid, fontFamily: T.fontMono, lineHeight: 1.6, maxWidth: 260 }}>
            Log expenses via Telegram. Review them here.
          </p>

          <div className="hidden md:flex flex-col gap-3 mt-12">
            {['Telegram bot integration', 'Category management', 'Spending analytics'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.text, boxShadow: `0 0 6px ${T.text}` }} />
                <span style={{ fontSize: 12, fontFamily: T.fontMono, color: T.textMid }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-start md:items-center justify-center p-8 md:p-14" style={{ background: T.surface }}>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <p style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textMid, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
            Authentication
          </p>
          <h2 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 26, color: T.text, letterSpacing: '-0.04em', marginBottom: 6 }}>
            Sign in
          </h2>
          <p style={{ fontSize: 13, fontFamily: T.fontMono, color: T.textDim, marginBottom: 32, lineHeight: 1.6 }}>
            Send <code style={{ color: T.text }}>/login</code> to your Telegram bot to receive a code.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
            {[
              `Open @trackdownbot on Telegram`,
              `Send /login to the bot`,
              `Paste the 6-digit code below`,
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5,
                  border: `1px solid ${T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.fontMono, fontSize: 9, color: T.textDim, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 12, fontFamily: T.fontMono, color: T.textMid }}>{step}</span>
              </div>
            ))}
          </div>

          <Input
            inputMode="numeric" maxLength={6}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && code.length === 6 && handleLogin()}
            disabled={loginMut.isPending}
            placeholder="_ _ _ _ _ _"
            style={{
              background: T.bg, border: `1px solid ${code.length === 6 ? T.text : T.border}`,
              color: T.text, fontFamily: T.fontMono, fontSize: 26,
              textAlign: 'center', letterSpacing: '0.4em',
              height: 58, borderRadius: 10, marginBottom: 10,
              transition: 'border-color 0.2s', boxShadow: code.length === 6 ? `0 0 0 1px ${T.text}` : 'none',
            }}
          />

          <Button onClick={handleLogin} disabled={code.length !== 6 || loginMut.isPending} style={{
            width: '100%', height: 44,
            background: code.length === 6 ? T.text : T.bg,
            color: code.length === 6 ? T.bg : T.textDim,
            fontFamily: T.fontMono, fontWeight: 700, fontSize: 13,
            border: `1px solid ${code.length === 6 ? T.text : T.border}`,
            borderRadius: 10, transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: code.length === 6 ? `0 0 20px ${T.text}30` : 'none',
          }}>
            {loginMut.isPending ? 'verifying...' : 'authenticate'} <ArrowRight size={15} />
          </Button>

          <p style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textDim, textAlign: 'center', marginTop: 14, letterSpacing: '0.05em' }}>
            code expires in 5 min
          </p>
        </div>
      </div>
    </div>
  )
}
