// Conexão com o Supabase. A URL e a chave pública vêm do arquivo .env.local
// (no computador) ou das variáveis de ambiente da Vercel (no site publicado).
import { createClient, processLock } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigurado = Boolean(url && chave)

// Conexão que não fica pendurada para sempre: se o servidor não responder em 15 s, desiste
// (aí o app mostra o erro e tenta de novo, em vez de ficar em "Carregando..." sem fim).
const LIMITE_MS = 15000
function fetchComLimite(recurso, opcoes = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LIMITE_MS)
  // respeita um cancelamento que já venha de quem chamou
  if (opcoes.signal) {
    if (opcoes.signal.aborted) ctrl.abort()
    else opcoes.signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return fetch(recurso, { ...opcoes, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

export const supabase = supabaseConfigurado
  ? createClient(url, chave, {
    auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      // trava simples (dentro da própria página): a trava do navegador (Web Locks) às vezes
      // fica presa no Safari do iPhone e o login nunca responde
      lock: processLock,
    },
    global: { fetch: fetchComLimite },
  })
  : null
