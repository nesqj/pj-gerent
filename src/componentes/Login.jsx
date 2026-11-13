import { useState } from 'react'
import * as Auth from '../auth.js'
import { t } from '../i18n.js'
import { LOGO_PADRAO_CLARO, LOGO_PADRAO_ESCURO } from '../marca.js'

// Tela de entrada. Modos:
//  'entrar'     e-mail e senha
//  'criar'      nova conta
//  'esqueci'    envia o link de recuperação por e-mail
//  'novaSenha'  depois de abrir o link do e-mail, cria a senha nova
//  'confirmar'  aviso para confirmar o e-mail depois de criar a conta
export default function Login({ tema, logo, modoInicial = 'entrar', onEntrou, onSenhaTrocada }) {
  const [modo, setModo] = useState(modoInicial)
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmar: '' })
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  const MENSAGENS = {
    credenciais: t('E-mail ou senha incorretos.'),
    'email-existe': t('Já existe uma conta com este e-mail.'),
    'email-nao-confirmado': t('Confirme seu e-mail antes de entrar. Procure a mensagem do sistema na sua caixa de entrada (e no spam).'),
    'senha-fraca': t('Senha fraca. Use letras e números, com pelo menos {n} caracteres.', { n: Auth.SENHA_MINIMA }),
    limite: t('Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'),
    'cadastro-fechado': t('O cadastro de novas contas está fechado.'),
    'mesma-senha': t('A nova senha precisa ser diferente da atual.'),
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
    const pedeSenhaNova = modo === 'criar' || modo === 'novaSenha'
    if (pedeSenhaNova && form.senha.length < Auth.SENHA_MINIMA) return setErro(t('A senha precisa ter pelo menos {n} caracteres.', { n: Auth.SENHA_MINIMA }))
    if (pedeSenhaNova && form.senha !== form.confirmar) return setErro(t('As senhas não são iguais.'))
    setEnviando(true)
    try {
      if (modo === 'entrar') onEntrou(await Auth.entrar({ email: form.email, senha: form.senha }))
      else if (modo === 'criar') {
        const r = await Auth.cadastrar({ nome: form.nome, email: form.email, senha: form.senha })
        if (r?.confirmar) trocarModo('confirmar')
        else onEntrou(r)
      } else if (modo === 'esqueci') {
        await Auth.enviarRecuperacao(form.email)
        setAviso(t('Se existir uma conta com este e-mail, enviamos um link para criar uma senha nova. Confira também o spam.'))
      } else if (modo === 'novaSenha') {
        await Auth.trocarSenha(form.senha)
        onSenhaTrocada?.()
      }
    } catch (err) {
      setErro(MENSAGENS[err.codigo] || t('Não foi possível concluir. Verifique a internet e tente de novo.'))
    } finally {
      setEnviando(false)
    }
  }

  const titulo = { entrar: t('Entrar'), criar: t('Criar conta'), esqueci: t('Recuperar senha'), novaSenha: t('Criar nova senha'), confirmar: t('Confirme seu e-mail') }[modo]
  const subtitulo = {
    entrar: t('Use seu e-mail e senha para acessar o sistema.'),
    criar: t('Crie sua conta para começar a usar o sistema.'),
    esqueci: t('Informe o e-mail da sua conta. Vamos enviar um link para criar uma senha nova.'),
    novaSenha: t('Digite a nova senha da sua conta.'),
    confirmar: t('Enviamos um link para {email}. Abra o e-mail e clique no link para ativar a conta; depois é só entrar.', { email: form.email }),
  }[modo]

  return (
    <div className="login-fundo">
      <div className="login-caixa">
        <img className="login-logo" src={logo || (tema === 'light' ? LOGO_PADRAO_CLARO : LOGO_PADRAO_ESCURO)} alt="" />
        <h1>{titulo}</h1>
        <p className="login-sub">{subtitulo}</p>

        {modo !== 'confirmar' && (
          <form onSubmit={enviar} className="login-form">
            {modo === 'criar' && (
              <label>{t('Nome')}
                <input autoComplete="name" required maxLength={60} {...campo('nome')} />
              </label>
            )}
            {modo !== 'novaSenha' && (
              <label>{t('E-mail')}
                <input type="email" autoComplete={modo === 'entrar' ? 'username' : 'email'} required placeholder={t('voce@empresa.com')} {...campo('email')} />
              </label>
            )}
            {modo !== 'esqueci' && (
              <label>
                <span className="login-rotulo-linha">
                  {modo === 'novaSenha' ? t('Nova senha') : t('Senha')}
                  {modo === 'entrar' && <button type="button" className="link pequeno" onClick={() => trocarModo('esqueci')}>{t('Esqueci minha senha')}</button>}
                </span>
                <span className="campo-senha">
                  <input type={verSenha ? 'text' : 'password'} required autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} {...campo('senha')} />
                  <button type="button" className="ver-senha" onClick={() => setVerSenha(!verSenha)}>{verSenha ? t('Ocultar') : t('Mostrar')}</button>
                </span>
              </label>
            )}
            {(modo === 'criar' || modo === 'novaSenha') && (
              <label>{t('Confirmar senha')}
                <input type={verSenha ? 'text' : 'password'} required autoComplete="new-password" {...campo('confirmar')} />
                <small>{t('Mínimo de {n} caracteres.', { n: Auth.SENHA_MINIMA })}</small>
              </label>
            )}

            {erro && <p className="login-erro" role="alert">{erro}</p>}
            {aviso && <p className="login-aviso" role="status">{aviso}</p>}

            <button type="submit" className="login-botao" disabled={enviando}>
              {enviando ? t('Aguarde...') : { entrar: t('Entrar'), criar: t('Criar conta'), esqueci: t('Enviar link'), novaSenha: t('Salvar nova senha') }[modo]}
            </button>
          </form>
        )}

        <div className="login-rodape">
          {modo === 'entrar' && (
            <span>{t('Não tem conta?')} <button type="button" className="link pequeno" onClick={() => trocarModo('criar')}>{t('Criar conta')}</button></span>
          )}
          {(modo === 'criar' || modo === 'esqueci' || modo === 'confirmar') && (
            <button type="button" className="link pequeno" onClick={() => trocarModo('entrar')}>← {t('Voltar para o login')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
