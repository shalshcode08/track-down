import { NavLink } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { T } from '@/lib/theme'

export function TopNav() {
  const { data: user } = useQuery({ queryKey: ['user'], queryFn: api.getUser, retry: false })
  
  const links = [
    { to: '/',            label: 'Dashboard', end: true },
    { to: '/categories',  label: 'Categories' },
  ]
  return (
    <header style={{
      background: T.surface, borderBottom: `1px solid ${T.border}`,
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <div style={{ width: 28, height: 28, borderRadius: 7, background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={14} color={T.bg} strokeWidth={2.5} />
          </div>
          <span className="hidden sm:inline-block" style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15, color: T.text, letterSpacing: '-0.02em' }}>
            TrackDown
          </span>
        </div>

        <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
          {links.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}
              style={({ isActive }) => ({
                textDecoration: 'none', padding: '5px 10px', borderRadius: 8,
                fontSize: 13, fontFamily: T.font, fontWeight: 500,
                color: isActive ? T.text : T.textMid,
                background: isActive ? T.bg : 'transparent',
                border: isActive ? `1px solid ${T.border}` : '1px solid transparent',
                transition: 'all 0.15s',
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 hidden sm:block" style={{
          fontFamily: T.fontMono, fontSize: 11, color: T.textMid,
          padding: '4px 10px', borderRadius: 20, border: `1px solid ${T.border}`,
          background: T.bg,
        }}>
          {user?.name || 'Guest'}
        </div>
      </div>
    </header>
  )
}
