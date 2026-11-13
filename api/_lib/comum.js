// Funções de servidor da cobrança (Vercel). Arquivos em api/_lib não viram endereços.
//
// Variáveis de ambiente (cadastradas por você na Vercel → Settings → Environment Variables):
//   COBRANCA_SEGREDO   senha do servidor (copie do painel → Cobrança → Conexão)
//   STRIPE_SECRET_KEY  chave secreta da Stripe (sk_test_... para testar, sk_live_... de verdade)
//   ASAAS_API_KEY      chave de API do Asaas ($aact_hmlg_... no sandbox, $aact_prod_... de verdade)
//   VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (já existem; servem também aqui)
import crypto from 'node:crypto'

export const env = (k) => process.env[k] || ''
const urlSupabase = () => env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
const chavePublica = () => env('SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY')

export class ErroHttp extends Error {
  constructor(status, codigo, extra) { super(codigo); this.status = status; this.codigo = codigo; this.extra = extra }
}

// ---------- banco (Supabase), pela API REST
// Com "token": age como a pessoa logada (o banco confere as permissões dela).
// Sem token: age sem login, e só as funções srv_* (que pedem a senha do servidor) funcionam.
export async function rpc(nome, args = {}, token) {
  const cabecalhos = { apikey: chavePublica(), 'Content-Type': 'application/json' }
  if (token) cabecalhos.Authorization = `Bearer ${token}`
  const r = await fetch(`${urlSupabase()}/rest/v1/rpc/${nome}`, { method: 'POST', headers: cabecalhos, body: JSON.stringify(args) })
  const texto = await r.text()
  let dados = null
  try { dados = texto ? JSON.parse(texto) : null } catch { dados = texto }
  if (!r.ok) {
    const msg = dados?.message || 'erro-banco'
    if (/segredo-invalido/.test(msg)) throw new ErroHttp(500, 'segredo-invalido')
    if (/sem-permissao/.test(msg) || r.status === 401) throw new ErroHttp(403, 'sem-permissao')
    throw new ErroHttp(400, msg)
  }
  return dados
}
export const srv = (nome, args = {}) => rpc(nome, { segredo: env('COBRANCA_SEGREDO'), ...args })

// ---------- requisição e resposta (sem depender dos "helpers" da Vercel)
export function tokenDe(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : ''
}

export async function corpoBruto(req) {
  if (typeof req.rawBody === 'string') return req.rawBody
  const partes = []
  for await (const p of req) partes.push(typeof p === 'string' ? Buffer.from(p) : p)
  return Buffer.concat(partes).toString('utf8')
}
export async function corpoJson(req) {
  const t = await corpoBruto(req)
  try { return t ? JSON.parse(t) : {} } catch { throw new ErroHttp(400, 'json-invalido') }
}

export function responder(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(obj))
}

// Envolve um endereço: só aceita o método certo e transforma erros em resposta JSON
export const endereco = (metodo, fn) => async (req, res) => {
  if (req.method !== metodo) return responder(res, 405, { erro: 'metodo' })
  try {
    responder(res, 200, await fn(req, res))
  } catch (e) {
    if (e instanceof ErroHttp) return responder(res, e.status, { erro: e.codigo, ...(e.extra || {}) })
    console.error(e)
    responder(res, 500, { erro: 'erro-interno' })
  }
}

// Origem do site (para links de volta e endereço dos avisos)
export function origem(req) {
  if (env('APP_URL')) return env('APP_URL').replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `https://${host}`
}
// Endereço de volta enviado pelo app: só aceita o próprio site
export function voltaSegura(req, url) {
  try {
    const u = new URL(url)
    if (u.host === new URL(origem(req)).host) return u.origin + u.pathname
  } catch { /* cai no padrão */ }
  return origem(req) + '/'
}

export const aleatorio = (bytes = 24) => crypto.randomBytes(bytes).toString('hex')

// ---------- Stripe
const STRIPE_VERSAO = '2024-06-20' // versão fixa da API: o formato dos avisos não muda sozinho

function formulario(obj, prefixo, saida = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const chave = prefixo ? `${prefixo}[${k}]` : k
    if (typeof v === 'object') formulario(v, chave, saida)
    else saida.push(`${encodeURIComponent(chave)}=${encodeURIComponent(v)}`)
  }
  return saida
}

export async function stripe(metodo, caminho, dados) {
  const chave = env('STRIPE_SECRET_KEY')
  if (!chave) throw new ErroHttp(400, 'sem-chave-stripe')
  const r = await fetch(`https://api.stripe.com/v1${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${chave}`, 'Stripe-Version': STRIPE_VERSAO, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: dados ? formulario(dados).join('&') : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroHttp(400, 'erro-stripe', { detalhe: j?.error?.message || String(r.status) })
  return j
}
export const stripeEmTeste = () => /^(sk|rk)_test_/.test(env('STRIPE_SECRET_KEY'))
export const STRIPE_EVENTOS = ['checkout.session.completed', 'invoice.paid', 'customer.subscription.deleted']
export const STRIPE_API_VERSAO = STRIPE_VERSAO

// Confere a assinatura do aviso da Stripe (cabeçalho Stripe-Signature)
export function conferirAssinaturaStripe(bruto, cabecalho, segredo, tolerancia = 300) {
  if (!cabecalho || !segredo) return false
  const partes = Object.fromEntries(cabecalho.split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v]))
  const assinaturas = cabecalho.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3))
  const t = Number(partes.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > tolerancia) return false
  const esperado = crypto.createHmac('sha256', segredo).update(`${t}.${bruto}`).digest('hex')
  return assinaturas.some((a) => a.length === esperado.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(esperado)))
}

// ---------- Asaas
export const asaasEmTeste = () => env('ASAAS_API_KEY').includes('_hmlg_')
const asaasBase = () => (asaasEmTeste() ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3')

export async function asaas(metodo, caminho, dados) {
  const chave = env('ASAAS_API_KEY')
  if (!chave) throw new ErroHttp(400, 'sem-chave-asaas')
  const r = await fetch(`${asaasBase()}${caminho}`, {
    method: metodo,
    headers: { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'pj-gerent' },
    body: dados ? JSON.stringify(dados) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroHttp(400, 'erro-asaas', { detalhe: j?.errors?.map((e) => e.description).join(' ') || String(r.status) })
  return j
}
export const ASAAS_EVENTOS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED']

// ---------- datas
export const dataISO = (d) => new Date(d).toISOString().slice(0, 10)
export const somenteDigitos = (s) => String(s || '').replace(/\D/g, '')
