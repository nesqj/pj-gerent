// Conexão com o Supabase. A URL e a chave pública vêm do arquivo .env.local
// (no computador) ou das variáveis de ambiente da Vercel (no site publicado).
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigurado = Boolean(url && chave)

export const supabase = supabaseConfigurado
  ? createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
