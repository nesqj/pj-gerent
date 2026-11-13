// Login com o Supabase Auth (e-mail e senha).
// A sessão fica guardada pelo próprio Supabase e é renovada sozinha.
import { supabase } from './supabase.js'

export const SENHA_MINIMA = 8

// Erros com código, para a tela mostrar a mensagem certa (e traduzida)
export class ErroLogin extends Error {
  constructor(codigo, original) { super(codigo); this.codigo = codigo; this.original = original }
}

const CODIGOS = {
  invalid_credentials: 'credenciais',
  user_already_exists: 'email-existe',
  email_exists: 'email-existe',
  email_not_confirmed: 'email-nao-confirmado',
  weak_password: 'senha-fraca',
  over_email_send_rate_limit: 'limite',
  over_request_rate_limit: 'limite',
  signup_disabled: 'cadastro-fechado',
  same_password: 'mesma-senha',
}

function falhou(error) {
  const codigo = CODIGOS[error?.code] || (/invalid login/i.test(error?.message || '') ? 'credenciais' : 'geral')
  return new ErroLogin(codigo, error)
}

const paraSessao = (s) =>
  s?.user ? { usuario: { id: s.user.id, email: s.user.email, nome: s.user.user_metadata?.nome || '' } } : null

// Sessão atual ou null
export async function obterSessao() {
  const { data } = await supabase.auth.getSession()
  return paraSessao(data.session)
}

// Avisa quando a pessoa entra, sai ou abre o link de recuperação de senha.
// Retorna a função para parar de ouvir.
export function aoMudar(callback) {
  const { data } = supabase.auth.onAuthStateChange((evento, s) => callback(evento, paraSessao(s)))
  return () => data.subscription.unsubscribe()
}

export async function entrar({ email, senha }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
  if (error) throw falhou(error)
  return paraSessao(data.session)
}

// Cria a conta. Se o projeto pede confirmação por e-mail, volta { confirmar: true } (sem sessão).
export async function cadastrar({ nome, email, senha }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: { data: { nome: (nome || '').trim() }, emailRedirectTo: window.location.origin },
  })
  if (error) throw falhou(error)
  // e-mail já cadastrado: o Supabase responde sem erro, mas sem "identities"
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new ErroLogin('email-existe')
  return data.session ? paraSessao(data.session) : { confirmar: true }
}

export async function sair() {
  await supabase.auth.signOut()
}

// Envia o e-mail com o link para criar uma senha nova
export async function enviarRecuperacao(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
  if (error) throw falhou(error)
}

// Troca a senha de quem está logado (usado depois de abrir o link de recuperação)
export async function trocarSenha(novaSenha) {
  const { error } = await supabase.auth.updateUser({ password: novaSenha })
  if (error) throw falhou(error)
}
