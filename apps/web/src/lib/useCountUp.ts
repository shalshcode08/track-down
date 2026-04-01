import { useEffect, useRef, useState } from 'react'

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export function useCountUp(target: number, duration = 700): number {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    let startTime: number | null = null

    const tick = (ts: number) => {
      if (!startTime) startTime = ts
      const p = Math.min((ts - startTime) / duration, 1)
      const current = from + (target - from) * easeOutExpo(p)
      fromRef.current = current
      setDisplay(current)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return display
}
