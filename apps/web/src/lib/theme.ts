import { format, isToday, isYesterday } from 'date-fns'

export const T = {
  bg:       '#09090b',
  surface:  '#18181b',
  border:   '#27272a',
  borderHi: '#3f3f46',
  text:     '#fafafa',
  textMid:  '#a1a1aa',
  textDim:  '#71717a',
  accent:   '#ffffff',
  red:      '#ef4444',
  font:     `'Bricolage Grotesque', system-ui, sans-serif`,
  fontMono: `'JetBrains Mono', monospace`,
}

export const PRESETS = ['Today', 'This Week', 'This Month', 'Last 30 Days']

export const EMOJI_ROWS = [
  ['🍔','🍕','🍜','🧃','🍺','🍰','☕','🍱'],
  ['🚗','🚌','🛵','✈️','🚕','⛽','🚲','🏍️'],
  ['🛒','🛍️','👗','👟','📦','🎁','💄','🧴'],
  ['🏠','💡','💻','📱','🎮','📺','🔧','🏋️'],
  ['💊','🏥','💉','🧪','🩺','💆','🦷','🩻'],
  ['🎬','🎵','🎭','🎪','🎨','🎸','🎯','🏆'],
]

export function formatDay(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  if (isToday(d))     return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMM d')
}
