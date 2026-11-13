import { useEffect, useState } from 'react'
import * as Org from '../organizacoes.js'
import Equipe from './Equipe.jsx'
import { t } from '../i18n.js'
import { brl, dataTs, hora, norm } from '../utils.js'

// Painel "Admin Plataforma": só para administradores da plataforma (o banco confere).
// Telas: dashboard, organizações, usuários, administradores, uso, auditoria e cadastro.
export default function Plataforma({ tela, irPara, abrirLoja, meuId, aoMudarLojas }) {
  const Tela = { dashboard: Dashboard, orgs: Organizacoes, usuarios: Usuarios, admins: Administradores, uso: Uso, auditoria: Auditoria, cadastro: Cadastro }[tela] || Dashboard
  return <Tela irPara={irPara} abrirLoja={abrirLoja} meuId={meuId} aoMudarLojas={aoMudarLojas} />
}

// Carrega dados de uma função; devolve [dados, erro, recarregar]
function useCarga(fn, deps = []) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  async function recarregar() {
    setErro('')
    try { setDados(await fn()) } catch (e) { setErro(e.message) }
  }
  useEffect(() => { recarregar() }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return [dados, erro, recarregar]
}

const Estado = ({ erro, recarregar }) => erro
  ? <div className="painel"><p className="bad">{erro}</p><button className="sec" onClick={recarregar}>{t('Tentar de novo')}</button></div>
  : <p className="vazio">{t('Carregando...')}</p>

const momento = (ts) => (ts ? `${dataTs(ts)} ${hora(ts)}` : '-')
const Situacao = ({ suspensa }) => <span className={suspensa ? 'bad' : 'ok'}>{suspensa ? t('Suspensa') : t('Ativa')}</span>

// ---------- Dashboard
function Dashboard({ irPara }) {
  const [dados, erro, recarregar] = useCarga(async () => {
    const [orgs, usuarios, eventos] = await Promise.all([Org.usoDasOrgs(), Org.listarUsuarios(), Org.auditoria({ limite: 8 })])
    return { orgs, usuarios, eventos }
  })
  if (!dados) return <Estado erro={erro} recarregar={recarregar} />
  const { orgs, usuarios, eventos } = dados
  const soma = (k) => orgs.reduce((s, o) => s + Number(o[k] || 0), 0)
  const semLoja = usuarios.filter((u) => !u.lojas.length).length

  return (
    <section>
      <div className="cards">
        <div className="card"><small>{t('Lojas ativas')}</small><b>{orgs.filter((o) => !o.suspensa).length}</b></div>
        <div className="card"><small>{t('Lojas suspensas')}</small><b className={orgs.some((o) => o.suspensa) ? 'bad' : ''}>{orgs.filter((o) => o.suspensa).length}</b></div>
        <div className="card"><small>{t('Usuários')}</small><b>{usuarios.length}</b></div>
        <div className="card"><small>{t('Usuários sem loja')}</small><b className={semLoja ? 'bad' : ''}>{semLoja}</b></div>
        <div className="card"><small>{t('Convites pendentes')}</small><b>{soma('convites')}</b></div>
        <div className="card"><small>{t('Vendas (30 dias)')}</small><b>{soma('vendas_30d')}</b></div>
        <div className="card"><small>{t('Faturamento (30 dias)')}</small><b>{brl(soma('faturamento_30d'))}</b></div>
      </div>

      <div className="linha-titulo"><h3>{t('Lojas que mais venderam (30 dias)')}</h3><button className="link pequeno" onClick={() => irPara('uso')}>{t('Ver uso completo')} →</button></div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Loja')}</th><th className="n">{t('Vendas')}</th><th className="n">{t('Faturamento')}</th><th>{t('Última alteração')}</th></tr></thead>
          <tbody>
            {orgs.length === 0 && <tr><td colSpan="4" className="vazio">{t('Nenhuma loja ainda.')}</td></tr>}
            {[...orgs].sort((a, b) => b.faturamento_30d - a.faturamento_30d).slice(0, 5).map((o) => (
              <tr key={o.id}><td>{o.nome}</td><td className="n">{o.vendas_30d}</td><td className="n">{brl(Number(o.faturamento_30d))}</td><td>{momento(o.atualizado_em)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="linha-titulo"><h3>{t('Atividade recente')}</h3><button className="link pequeno" onClick={() => irPara('auditoria')}>{t('Ver auditoria')} →</button></div>
      <ListaAuditoria eventos={eventos} mostrarLoja />
    </section>
  )
}

// ---------- Organizações (lojas)
function Organizacoes({ abrirLoja, meuId, aoMudarLojas }) {
  const [orgs, erro, recarregar] = useCarga(() => Org.usoDasOrgs())
  const [aberta, setAberta] = useState(null)
  const [form, setForm] = useState({ nome: '', email: '' })
  const [busca, setBusca] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function criar(e) {
    e.preventDefault()
    setEnviando(true)
    try {
      const id = await Org.criarOrg(form.nome.trim(), form.email.trim())
      setForm({ nome: '', email: '' })
      await recarregar()
      aoMudarLojas?.()
      setAberta(id)
    } catch (er) {
      alert(er.message)
    } finally {
      setEnviando(false)
    }
  }

  if (!orgs) return <Estado erro={erro} recarregar={recarregar} />
  const org = orgs.find((o) => o.id === aberta)
  if (org) return <DetalheOrg org={org} voltar={() => setAberta(null)} recarregar={async () => { await recarregar(); aoMudarLojas?.() }} abrirLoja={abrirLoja} meuId={meuId} />

  const lista = orgs.filter((o) => norm(o.nome).includes(norm(busca)))
  return (
    <section>
      <div className="linha-titulo"><h3>{t('Nova loja')}</h3></div>
      <form onSubmit={criar}>
        <label>{t('Nome da loja')}<input required maxLength={60} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
        <label>{t('E-mail do administrador da loja (opcional)')}
          <input type="email" placeholder={t('voce@empresa.com')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <button type="submit" disabled={enviando}>{enviando ? t('Aguarde...') : t('Criar loja')}</button>
      </form>

      <div className="linha-titulo"><h3>{t('Lojas')} ({orgs.length})</h3></div>
      <input className="busca" placeholder={t('Buscar loja...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="tw">
        <table>
          <thead><tr><th>{t('Loja')}</th><th>{t('Situação')}</th><th className="n">{t('Pessoas')}</th><th className="n">{t('Vendas')}</th><th>{t('Criada em')}</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="6" className="vazio">{orgs.length ? t('Nada encontrado.') : t('Nenhuma loja ainda. Crie a primeira acima.')}</td></tr>}
            {lista.map((o) => (
              <tr key={o.id}>
                <td><button className="link" onClick={() => setAberta(o.id)}>{o.nome}</button></td>
                <td><Situacao suspensa={o.suspensa} /></td>
                <td className="n">{o.membros}{o.convites > 0 && <small> (+{o.convites} {t('convite(s)')})</small>}</td>
                <td className="n">{o.vendas}</td>
                <td>{dataTs(o.criada_em)}</td>
                <td className="n">
                  <button className="edit" onClick={() => setAberta(o.id)}>{t('Gerenciar')}</button>{' '}
                  <button className="sec" onClick={() => abrirLoja(o)}>{t('Abrir loja')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DetalheOrg({ org, voltar, recarregar, abrirLoja, meuId }) {
  const [nome, setNome] = useState(org.nome)
  const [atividade] = useCarga(() => Org.auditoria({ org: org.id, limite: 30 }), [org.id])

  async function fazer(fn) {
    try { await fn(); await recarregar(); return true } catch (e) { alert(e.message); return false }
  }
  async function excluir() {
    const digitado = prompt(t('Isto apaga a loja "{nome}" e TODOS os dados dela (fornecedores, preços, estoque e vendas). Não dá para desfazer.\n\nPara confirmar, digite o nome da loja:', { nome: org.nome }))
    if (digitado == null) return
    if (await fazer(() => Org.excluirOrg(org.id, digitado))) { alert(t('Loja excluída.')); voltar() }
  }

  return (
    <section>
      <button className="voltar" onClick={voltar}>← {t('Organizações')}</button>
      <div className="linha-titulo">
        <h3>{org.nome} · <Situacao suspensa={org.suspensa} /></h3>
        <button onClick={() => abrirLoja(org)}>{t('Abrir loja')}</button>
      </div>

      <div className="cards">
        <div className="card"><small>{t('Fornecedores')}</small><b>{org.fornecedores}</b></div>
        <div className="card"><small>{t('Produtos cadastrados')}</small><b>{org.produtos}</b></div>
        <div className="card"><small>{t('Vendas')}</small><b>{org.vendas}</b></div>
        <div className="card"><small>{t('Faturamento total')}</small><b>{brl(Number(org.faturamento))}</b></div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); fazer(() => Org.renomearOrg(org.id, nome.trim())) }}>
        <label>{t('Nome da loja')}<input required maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <button type="submit" disabled={nome.trim() === org.nome}>{t('Renomear')}</button>
      </form>

      <div className="linha-titulo"><h3>{t('Equipe')}</h3></div>
      <Equipe orgId={org.id} podeGerir meuId={meuId} />

      <div className="linha-titulo"><h3>{t('Atividade da loja')}</h3></div>
      {atividade ? <ListaAuditoria eventos={atividade} /> : <p className="vazio">{t('Carregando...')}</p>}

      <div className="painel zona-perigo">
        <p><b>{t('Zona de perigo')}</b></p>
        <p><small>{org.suspensa
          ? t('Loja suspensa: ninguém da equipe consegue abrir nem alterar os dados. Os dados continuam guardados.')
          : t('Suspender bloqueia o acesso de toda a equipe desta loja, sem apagar nada. Dá para reativar quando quiser.')}</small></p>
        <div className="botoes">
          {org.suspensa
            ? <button className="sec" onClick={() => fazer(() => Org.suspenderOrg(org.id, false))}>{t('Reativar loja')}</button>
            : <button className="del" onClick={() => confirm(t('Suspender a loja "{nome}"? A equipe perde o acesso até você reativar.', { nome: org.nome })) && fazer(() => Org.suspenderOrg(org.id, true))}>{t('Suspender loja')}</button>}
          {org.suspensa && <button className="del" onClick={excluir}>{t('Excluir loja e todos os dados')}</button>}
        </div>
        {!org.suspensa && <p><small>{t('Para excluir a loja, suspenda primeiro.')}</small></p>}
      </div>
    </section>
  )
}

// ---------- Usuários
function Usuarios() {
  const [usuarios, erro, recarregar] = useCarga(() => Org.listarUsuarios())
  const [busca, setBusca] = useState('')
  if (!usuarios) return <Estado erro={erro} recarregar={recarregar} />
  const lista = usuarios.filter((u) => norm(u.email + ' ' + u.nome).includes(norm(busca)))
  return (
    <section>
      <p><small>{t('Todas as contas criadas no sistema. Para colocar alguém numa loja, abra a loja em Organizações.')}</small></p>
      <input className="busca" placeholder={t('Buscar por nome ou e-mail...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="tw">
        <table>
          <thead><tr><th>{t('Nome')}</th><th>{t('E-mail')}</th><th>{t('Lojas e papéis')}</th><th>{t('Criada em')}</th><th>{t('Último acesso')}</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="5" className="vazio">{t('Nada encontrado.')}</td></tr>}
            {lista.map((u) => (
              <tr key={u.id}>
                <td>{u.nome || '-'}{u.admin_plataforma && <span className="tag">{t('Admin plataforma')}</span>}</td>
                <td>{u.email}{!u.confirmado && <small className="bad"> ({t('e-mail não confirmado')})</small>}</td>
                <td className="quebra">{u.lojas.length ? u.lojas.map((l) => <span key={l.id} className="tag">{l.nome} · {Org.nomePapel(l.papel)}</span>) : <small className="bad">{t('Sem loja')}</small>}</td>
                <td>{dataTs(u.criado_em)}</td>
                <td>{u.ultimo_acesso ? momento(u.ultimo_acesso) : t('Nunca entrou')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------- Administradores da plataforma
function Administradores({ meuId }) {
  const [admins, erro, recarregar] = useCarga(() => Org.listarAdmins())
  const [email, setEmail] = useState('')
  if (!admins) return <Estado erro={erro} recarregar={recarregar} />

  async function fazer(fn) {
    try { await fn(); await recarregar(); return true } catch (e) { alert(e.message); return false }
  }

  return (
    <section>
      <div className="painel">
        <p><small>{t('Administradores da plataforma veem e administram todas as lojas, todos os usuários e este painel. Dê este poder só a quem precisa.')}</small></p>
      </div>
      <form onSubmit={async (e) => { e.preventDefault(); if (await fazer(() => Org.adicionarAdmin(email))) setEmail('') }}>
        <label>{t('E-mail de quem já tem conta')}<input type="email" required placeholder={t('voce@empresa.com')} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button type="submit">{t('Tornar administrador')}</button>
      </form>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Nome')}</th><th>{t('E-mail')}</th><th>{t('Desde')}</th><th></th></tr></thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.user_id}>
                <td>{a.nome || '-'}{a.user_id === meuId && <span className="tag">{t('você')}</span>}</td>
                <td>{a.email}</td>
                <td>{dataTs(a.criado_em)}</td>
                <td className="n">
                  <button className="del" onClick={() => confirm(a.user_id === meuId
                    ? t('Tirar o SEU acesso de administrador da plataforma? Você deixa de ver este painel.')
                    : t('Tirar o acesso de administrador da plataforma de {email}?', { email: a.email }))
                    && fazer(async () => { await Org.removerAdmin(a.user_id); if (a.user_id === meuId) window.location.reload() })}>{t('Remover')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------- Uso
function Uso({ abrirLoja }) {
  const [orgs, erro, recarregar] = useCarga(() => Org.usoDasOrgs())
  if (!orgs) return <Estado erro={erro} recarregar={recarregar} />
  return (
    <section>
      <p><small>{t('O quanto cada loja usa o sistema. "30 dias" conta a partir de hoje.')}</small></p>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>{t('Loja')}</th><th className="n">{t('Pessoas')}</th><th className="n">{t('Fornecedores')}</th><th className="n">{t('Produtos')}</th>
              <th className="n">{t('Vendas')}</th><th className="n">{t('Vendas (30 dias)')}</th><th className="n">{t('Faturamento (30 dias)')}</th>
              <th className="n">{t('Faturamento total')}</th><th>{t('Última alteração')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && <tr><td colSpan="10" className="vazio">{t('Nenhuma loja ainda.')}</td></tr>}
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>{o.nome}{o.suspensa && <small className="bad"> ({t('Suspensa')})</small>}</td>
                <td className="n">{o.membros}</td><td className="n">{o.fornecedores}</td><td className="n">{o.produtos}</td>
                <td className="n">{o.vendas}</td><td className="n">{o.vendas_30d}</td>
                <td className="n">{brl(Number(o.faturamento_30d))}</td><td className="n">{brl(Number(o.faturamento))}</td>
                <td>{momento(o.atualizado_em)}</td>
                <td className="n"><button className="sec" onClick={() => abrirLoja(o)}>{t('Abrir loja')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------- Auditoria
function Auditoria() {
  const [eventos, erro, recarregar] = useCarga(() => Org.auditoria({ limite: 500 }))
  const [busca, setBusca] = useState('')
  if (!eventos) return <Estado erro={erro} recarregar={recarregar} />
  const lista = eventos.filter((e) => norm([e.org_nome, e.email, Org.nomeAcao(e.acao), e.detalhe].join(' ')).includes(norm(busca)))
  return (
    <section>
      <p><small>{t('Quem fez o quê e quando, em todas as lojas (últimos 500 registros). Os registros não podem ser alterados nem apagados pelo app.')}</small></p>
      <div className="linha-titulo">
        <input className="busca" placeholder={t('Buscar por loja, pessoa ou ação...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="sec" onClick={recarregar}>{t('Atualizar')}</button>
      </div>
      <ListaAuditoria eventos={lista} mostrarLoja />
    </section>
  )
}

export function ListaAuditoria({ eventos, mostrarLoja }) {
  return (
    <div className="tw">
      <table>
        <thead><tr><th>{t('Quando')}</th>{mostrarLoja && <th>{t('Loja')}</th>}<th>{t('Quem')}</th><th>{t('Ação')}</th><th>{t('Detalhe')}</th></tr></thead>
        <tbody>
          {eventos.length === 0 && <tr><td colSpan={mostrarLoja ? 5 : 4} className="vazio">{t('Nenhum registro.')}</td></tr>}
          {eventos.map((e) => (
            <tr key={e.id}>
              <td>{momento(e.criado_em)}</td>
              {mostrarLoja && <td>{e.org_nome || (e.org_id ? '-' : t('Plataforma'))}</td>}
              <td>{e.email || '-'}</td>
              <td>{Org.nomeAcao(e.acao)}</td>
              <td className="quebra">{e.detalhe || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Cadastro
function Cadastro() {
  const [config, erro, recarregar] = useCarga(() => Org.configPlataforma())
  if (!config) return <Estado erro={erro} recarregar={recarregar} />

  async function mudar(modo) {
    try { await Org.definirCadastro(modo); await recarregar() } catch (e) { alert(e.message) }
  }

  const OPCOES = [
    { id: 'convite', nome: 'Só com convite', desc: 'Quem cria conta só entra se já foi colocado numa loja (por você ou pelo administrador da loja). Sem loja, vê um aviso para pedir acesso.' },
    { id: 'aberto', nome: 'Aberto', desc: 'Quem cria conta e não tem convite ganha uma loja própria, vazia, como administrador dela.' },
  ]
  return (
    <section>
      <div className="painel">
        <p><b>{t('Quem pode usar o sistema')}</b></p>
        {OPCOES.map((o) => (
          <label key={o.id} className="check opcao-radio">
            <input type="radio" name="cadastro" checked={config.cadastro === o.id} onChange={() => mudar(o.id)} />
            <span><b>{t(o.nome)}</b><br /><small>{t(o.desc)}</small></span>
          </label>
        ))}
      </div>
      <div className="painel">
        <p><b>{t('Fechar a criação de contas de vez')}</b></p>
        <p><small>{t('Para ninguém conseguir nem criar conta, desligue no Supabase: Authentication → Sign In / Providers → "Allow new users to sign up". Quem já tem conta continua entrando. Com isso desligado, convites para quem ainda não tem conta não funcionam: crie a conta da pessoa em Authentication → Users → "Add user".')}</small></p>
      </div>
    </section>
  )
}
