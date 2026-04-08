import { NavLink } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { T } from '@/lib/theme'

export function TopNav() {
  const { data: user } = useQuery({ queryKey: ['user'], queryFn: api.getUser, retry: false })

  const links = [
    { to: '/',           label: 'Dashboard', end: true },
    { to: '/categories', label: 'Categories' },
  ]

  return (
    <header style={{
      background: 'rgba(9, 9, 11, 0.75)',
      backdropFilter: 'blur(16px) saturate(180%)',
      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">

        <div className="flex items-center gap-2.5 shrink-0">
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 12px rgba(129, 140, 248, 0.4)`,
          }}>
            <Wallet size={14} color="#1e1b4b" strokeWidth={2.5} />
          </div>
          <span className="hidden sm:inline-block" style={{
            fontFamily: T.font, fontWeight: 700, fontSize: 15,
            color: T.text, letterSpacing: '-0.02em',
          }}>
            TrackDown
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {links.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}
              style={({ isActive }) => ({
                textDecoration: 'none',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontFamily: T.font,
                fontWeight: 500,
                color: isActive ? T.accent : T.textMid,
                background: isActive ? T.accentDim : 'transparent',
                border: `1px solid ${isActive ? T.accentBorder : 'transparent'}`,
                transition: 'all 0.15s',
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{
          fontFamily: T.fontMono, fontSize: 11, color: T.textDim,
          padding: '4px 10px', borderRadius: 20,
          border: `1px solid ${T.border}`,
          background: T.bg,
        }} className="hidden sm:block">
          {user?.name ?? '—'}
        </div>

      </div>
    </header>
  )
}
