// Login LOCAL (provisório).
// A senha fica guardada (com hash) só neste navegador. Isso organiza o acesso, mas NÃO protege
// os dados de verdade: quem tiver acesso ao navegador consegue contornar.
// Quando o Supabase for ligado, basta reescrever estas funções com o Supabase Auth mantendo os
// mesmos nomes e retornos — a tela de login e o resto do app não mudam.

const CHAVE_CONTAS = 'gerenciador-precos-auth'
const CHAVE_SESSAO = 'gerenciador-precos-sessao'
const DIAS_LEMBRAR = 30

const lerContas = () => {
  try { return JSON.parse(localStorage.getItem(CHAVE_CONTAS)) || { usuarios: [] } } catch { return { usuarios: [] } }
}
const gravarContas = (c) => localStorage.setItem(CHAVE_CONTAS, JSON.stringify(c))
const normEmail = (e) => (e || '').trim().toLowerCase()

const paraHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const deHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)))

async function gerarHash(senha, saltHex) {
  const salt = saltHex ? deHex(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, chave, 256)
  return { hash: paraHex(bits), salt: paraHex(salt) }
}

// Erros com código, para a tela mostrar a mensagem certa (e traduzida)
export class ErroLogin extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo }
}

const publico = (u) => ({ email: u.email, nome: u.nome })

// Existe alguma conta? (se não, a tela mostra "Criar acesso")
export async function temContas() {
  return lerContas().usuarios.length > 0
}

// Sessão atual ou null
export async function obterSessao() {
  for (const armazem of [sessionStorage, localStorage]) {
    try {
      const s = JSON.parse(armazem.getItem(CHAVE_SESSAO))
      if (!s) continue
      if (s.expira && Date.now() > s.expira) { armazem.removeItem(CHAVE_SESSAO); continue }
      const u = lerContas().usuarios.find((x) => x.email === s.email)
      if (u) return { usuario: publico(u) }
    } catch { /* ignora sessão inválida */ }
  }
  return null
}

function abrirSessao(email, lembrar) {
  const s = { email, criada: Date.now(), expira: lembrar ? Date.now() + DIAS_LEMBRAR * 86400000 : null }
  sessionStorage.removeItem(CHAVE_SESSAO)
  localStorage.removeItem(CHAVE_SESSAO)
  ;(lembrar ? localStorage : sessionStorage).setItem(CHAVE_SESSAO, JSON.stringify(s))
}

// Primeiro acesso: cria a conta de administrador
export async function cadastrar({ nome, email, senha }) {
  const contas = lerContas()
  const e = normEmail(email)
  if (contas.usuarios.some((u) => u.email === e)) throw new ErroLogin('email-existe')
  const { hash, salt } = await gerarHash(senha)
  contas.usuarios.push({ email: e, nome: (nome || '').trim(), hash, salt, criado: Date.now(), papel: 'admin' })
  gravarContas(contas)
  abrirSessao(e, false)
  return { usuario: { email: e, nome: (nome || '').trim() } }
}

export async function entrar({ email, senha, lembrar }) {
  const e = normEmail(email)
  const u = lerContas().usuarios.find((x) => x.email === e)
  if (!u) throw new ErroLogin('credenciais')
  const { hash } = await gerarHash(senha, u.salt)
  if (hash !== u.hash) throw new ErroLogin('credenciais')
  abrirSessao(e, !!lembrar)
  return { usuario: publico(u) }
}

export async function sair() {
  sessionStorage.removeItem(CHAVE_SESSAO)
  localStorage.removeItem(CHAVE_SESSAO)
}

// Sem servidor de e-mail, "esqueci a senha" só redefine neste aparelho.
// (Com o Supabase, isto vira o envio do link de recuperação por e-mail.)
export async function redefinirSenhaLocal({ email, novaSenha }) {
  const contas = lerContas()
  const u = contas.usuarios.find((x) => x.email === normEmail(email))
  if (!u) throw new ErroLogin('email-nao-encontrado')
  Object.assign(u, await gerarHash(novaSenha))
  gravarContas(contas)
}

export const SENHA_MINIMA = 8
