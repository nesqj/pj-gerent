import { useEffect, useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import * as Org from '../organizacoes.js'
import { t } from '../i18n.js'
import { dataTs, hora } from '../utils.js'

// Pessoas de uma loja, com papéis e convites. Usada em Configurações → Organização
// (pela própria loja) e no painel da plataforma (Organizações → abrir uma loja).
export default function Equipe({ orgId, podeGerir, meuId }) {
  const [pessoas, setPessoas] = useState(null)
  const [pendentes, setPendentes] = useState([])
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({ email: '', papel: 'vendedor' })
  const [enviando, setEnviando] = useState(false)

  async function carregar() {
    setErro('')
    try {
      setPessoas(await Org.equipe(orgId))
      setPendentes(podeGerir ? await Org.convites(orgId) : [])
    } catch (e) {
      setErro(e.message)
    }
  }
  useEffect(() => { carregar() }, [orgId, podeGerir]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fazer(fn, sucesso) {
    try {
      const r = await fn()
      await carregar()
      if (sucesso) aviso.erro(typeof sucesso === 'function' ? sucesso(r) : sucesso)
      return true
    } catch (e) {
      aviso.erro(e.message)
      return false
    }
  }

  async function adicionar(e) {
    e.preventDefault()
    setEnviando(true)
    const ok = await fazer(() => Org.adicionarMembro(orgId, form.email, form.papel), (r) => ({
      adicionado: t('Pronto! A pessoa já tem acesso à loja.'),
      convidado: t('Convite criado. Quando {email} criar a conta com este e-mail, a loja aparece para ela automaticamente.', { email: form.email.trim() }),
      'ja-membro': t('Esta pessoa já faz parte da loja.'),
    }[r]))
    setEnviando(false)
    if (ok) setForm({ ...form, email: '' })
  }

  if (erro) return <div className="painel"><p className="bad">{erro}</p><button className="sec" onClick={carregar}>{t('Tentar de novo')}</button></div>
  if (!pessoas) return <p className="vazio">{t('Carregando...')}</p>

  return (
    <>
      {podeGerir && (
        <form onSubmit={adicionar}>
          <label>{t('E-mail da pessoa')}
            <input type="email" required placeholder={t('voce@empresa.com')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>{t('Papel')}
            <select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
              {Org.PAPEIS.map((p) => <option key={p.id} value={p.id}>{t(p.nome)}</option>)}
            </select>
          </label>
          <button type="submit" disabled={enviando}>{enviando ? t('Aguarde...') : t('Adicionar à loja')}</button>
        </form>
      )}

      <div className="tw">
        <table>
          <thead>
            <tr><th>{t('Nome')}</th><th>{t('E-mail')}</th><th>{t('Papel')}</th><th>{t('Na loja desde')}</th><th>{t('Último acesso')}</th>{podeGerir && <th></th>}</tr>
          </thead>
          <tbody>
            {pessoas.length === 0 && <tr><td colSpan={podeGerir ? 6 : 5} className="vazio">{t('Ninguém nesta loja ainda.')}</td></tr>}
            {pessoas.map((p) => (
              <tr key={p.user_id}>
                <td>{p.nome || '-'}{p.user_id === meuId && <span className="tag">{t('você')}</span>}</td>
                <td>{p.email}</td>
                <td>
                  {podeGerir ? (
                    <select className="sel-pequeno" value={p.papel} onChange={(e) => fazer(() => Org.mudarPapel(orgId, p.user_id, e.target.value))}>
                      {Org.PAPEIS.map((x) => <option key={x.id} value={x.id}>{t(x.nome)}</option>)}
                    </select>
                  ) : Org.nomePapel(p.papel)}
                </td>
                <td>{dataTs(p.criado_em)}</td>
                <td>{p.ultimo_acesso ? `${dataTs(p.ultimo_acesso)} ${hora(p.ultimo_acesso)}` : t('Nunca entrou')}</td>
                {podeGerir && (
                  <td className="n">
                    <button className="del" onClick={async () => await confirmar(t('Tirar {email} desta loja?', { email: p.email })) && fazer(() => Org.removerMembro(orgId, p.user_id))}>{t('Remover')}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {podeGerir && pendentes.length > 0 && (
        <>
          <div className="linha-titulo"><h3>{t('Convites esperando a pessoa criar a conta')}</h3></div>
          <div className="tw">
            <table>
              <thead><tr><th>{t('E-mail')}</th><th>{t('Papel')}</th><th>{t('Convidado em')}</th><th></th></tr></thead>
              <tbody>
                {pendentes.map((c) => (
                  <tr key={c.email}>
                    <td>{c.email}</td>
                    <td>{Org.nomePapel(c.papel)}</td>
                    <td>{dataTs(c.criado_em)}</td>
                    <td className="n"><button className="del" onClick={async () => await confirmar(t('Cancelar o convite de {email}?', { email: c.email })) && fazer(() => Org.cancelarConvite(orgId, c.email))}>{t('Cancelar')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="painel">
        <p><b>{t('O que cada papel pode fazer')}</b></p>
        <ul className="dicas">
          {Org.PAPEIS.map((p) => <li key={p.id}><b>{t(p.nome)}:</b> {t(p.desc)}</li>)}
        </ul>
      </div>
    </>
  )
}
