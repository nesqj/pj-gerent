import { useEffect, useState } from 'react'

// Tela de celular? (as listas viram cartões; no computador continuam as tabelas)
const TELA_CELULAR = '(max-width: 767px)'
export function useCelular() {
  const [celular, setCelular] = useState(() => window.matchMedia?.(TELA_CELULAR).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(TELA_CELULAR)
    if (!mq) return
    const mudou = () => setCelular(mq.matches)
    mq.addEventListener('change', mudou)
    window.addEventListener('resize', mudou) // alguns navegadores não avisam a mudança pelo matchMedia
    return () => { mq.removeEventListener('change', mudou); window.removeEventListener('resize', mudou) }
  }, [])
  return celular
}
