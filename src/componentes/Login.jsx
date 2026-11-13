import { useState } from 'react'
import * as Auth from '../auth.js'
import { t } from '../i18n.js'
import { LOGO_PADRAO_CLARO, LOGO_PADRAO_ESCURO } from '../marca.js'

// Tela de entrada. Modos: 'entrar', 'criar' (primeiro acesso) e 'esqueci'.
export default function Login({ temConta, tema, logo, onEntrou }) {
  const [modo, setModo] = useState(temConta ? 'entrar' : 'criar')
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmar: '', lembrar: true })
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  const MENSAGENS = {
    credenciais: t('E-mail ou senha incorretos.'),
    'email-existe': t('Já existe uma conta com este e-mail.'),
    'email-nao-encontrado': t('Não encontramos uma conta com este e-mail neste aparelho.'),
  }

  function trocarModo(m) {
    setModo(m)
    setErro('')
    setAviso('')
    setForm((f) => ({ ...f, senha: '', confirmar: '' }))
  }

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    setAviso('')
    if ((modo === 'criar' || modo === 'esqueci') && form.senha.length < Auth.SENHA_MINIMA) {
      return setErro(t('A senha precisa ter pelo menos {n} caracteres.', { n: Auth.SENHA_MINIMA }))
    }
    if ((modo === 'criar' || modo === 'esqueci') && form.senha !== form.confirmar) return setErro(t('As senhas não são iguais.'))
    setEnviando(true)
    try {
      if (modo === 'entrar') onEntrou(await Auth.entrar({ email: form.email, senha: form.senha, lembrar: form.lembrar }))
      else if (modo === 'criar') onEntrou(await Auth.cadastrar({ nome: form.nome, email: form.email, senha: form.senha }))
      else {
        await Auth.redefinirSenhaLocal({ email: form.email, novaSenha: form.senha })
        trocarModo('entrar')
        setAviso(t('Senha redefinida. Entre com a nova senha.'))
      }
    } catch (err) {
      setErro(MENSAGENS[err.codigo] || t('Não foi possível entrar. Tente de novo.'))
    } finally {
      setEnviando(false)
    }
  }

  const titulo = { entrar: t('Entrar'), criar: t('Criar acesso'), esqueci: t('Redefinir senha') }[modo]
  const subtitulo = {
    entrar: t('Use seu e-mail e senha para acessar o sistema.'),
    criar: t('Primeiro acesso: crie a conta de administrador.'),
    esqueci: t('Crie uma nova senha para a conta deste aparelho.'),
  }[modo]

  return (
    <div className="login-fundo">
      <div className="login-caixa">
        <img className="login-logo" src={logo || (tema === 'light' ? LOGO_PADRAO_CLARO : LOGO_PADRAO_ESCURO)} alt="" />
        <h1>{titulo}</h1>
        <p className="login-sub">{subtitulo}</p>

        <form onSubmit={enviar} className="login-form" noValidate={false}>
          {modo === 'criar' && (
            <label>{t('Nome')}
              <input autoComplete="name" required maxLength={60} {...campo('nome')} />
            </label>
          )}
          <label>{t('E-mail')}
            <input type="email" autoComplete={modo === 'entrar' ? 'username' : 'email'} required placeholder={t('voce@empresa.com')} {...campo('email')} />
          </label>
          <label>
            <span className="login-rotulo-linha">
              {modo === 'esqueci' ? t('Nova senha') : t('Senha')}
              {modo === 'entrar' && <button type="button" className="link pequeno" onClick={() => trocarModo('esqueci')}>{t('Esqueci minha senha')}</button>}
            </span>
            <span className="campo-senha">
              <input type={verSenha ? 'text' : 'password'} required autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} {...campo('senha')} />
              <button type="button" className="ver-senha" onClick={() => setVerSenha(!verSenha)}>{verSenha ? t('Ocultar') : t('Mostrar')}</button>
            </span>
          </label>
          {modo !== 'entrar' && (
            <label>{t('Confirmar senha')}
              <input type={verSenha ? 'text' : 'password'} required autoComplete="new-password" {...campo('confirmar')} />
              <small>{t('Mínimo de {n} caracteres.', { n: Auth.SENHA_MINIMA })}</small>
            </label>
          )}
          {modo === 'entrar' && (
            <label className="check">
              <input type="checkbox" checked={form.lembrar} onChange={(e) => setForm({ ...form, lembrar: e.target.checked })} />
              {t('Manter conectado neste aparelho')}
            </label>
          )}

          {erro && <p className="login-erro" role="alert">{erro}</p>}
          {aviso && <p className="login-aviso" role="status">{aviso}</p>}

          <button type="submit" className="login-botao" disabled={enviando}>
            {enviando ? t('Aguarde...') : { entrar: t('Entrar'), criar: t('Criar acesso e entrar'), esqueci: t('Salvar nova senha') }[modo]}
          </button>
        </form>

        {modo === 'esqueci' && (
          <>
            <p className="login-nota">{t('Por enquanto o login fica só neste aparelho, então a senha é redefinida aqui mesmo. Quando o banco de dados for ligado, a recuperação passa a ser por link no e-mail.')}</p>
            <button type="button" className="link pequeno" onClick={() => trocarModo('entrar')}>← {t('Voltar para o login')}</button>
          </>
        )}
      </div>
    </div>
  )
}
