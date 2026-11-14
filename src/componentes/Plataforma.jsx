import { useEffect, useState } from 'react'
import { aviso, confirmar, perguntar } from '../avisos-tela.jsx'
import * as Org from '../organizacoes.js'
import Equipe from './Equipe.jsx'
import Cobranca from './Cobranca.jsx'
import CobrancaLoja from './CobrancaLoja.jsx'
import MarcaPlataforma from './MarcaPlataforma.jsx'
import { t } from '../i18n.js'
import { brl, dataTs, hora, norm } from '../utils.js'

// Painel "Admin Plataforma": só para administradores da plataforma (o banco confere).
// Telas: dashboard, auditoria, organizações, usuários, administradores, uso, marca, cadastro e cobrança.
export default function Plataforma({ tela, irPara, abrirLoja, meuId, aoMudarLojas, aoMudarMarca }) {
  const [orgSel, setOrgSel] = useState(null) // loja aberta em Organizações
  const abrirOrg = (id) => { setOrgSel(id); irPara('orgs') }
  if (tela === 'cobranca') return <Cobranca abrirOrg={abrirOrg} />
  if (tela === 'marca') return <MarcaPlataforma onSalvou={aoMudarMarca} />
  const Tela = { dashboard: Dashboard, orgs: Organizacoes, usuarios: Usuarios, admins: Administradores, uso: Uso, auditoria: Auditoria, cadastro: Cadastro }[tela] || Dashboard
  return <Tela irPara={irPara} abrirLoja={abrirLoja} meuId={meuId} aoMudarLojas={aoMudarLojas} orgSel={orgSel} setOrgSel={setOrgSel} abrirOrg={abrirOrg} />
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
    const [orgs, usuarios, eventos, pedidos] = await Promise.all([Org.usoDasOrgs(), Org.listarUsuarios(), Org.auditoria({ limite: 8 }), Org.listarPedidos()])
    return { orgs, usuarios, eventos, pedidos }
  })
  if (!dados) return <Estado erro={erro} recarregar={recarregar} />
  const { orgs, usuarios, eventos, pedidos } = dados
  const pedidosPendentes = pedidos.filter((p) => p.situacao === 'pendente').length
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
        <button className="card card-botao" onClick={() => irPara('cadastro')}><small>{t('Pedidos de cadastro')}</small><b className={pedidosPendentes ? 'bad' : ''}>{pedidosPendentes}</b></button>
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
const FILTROS_ORG = [
  { id: '', nome: 'Todas' },
  { id: 'ativa', nome: 'Ativas' },
  { id: 'suspensa', nome: 'Suspensas' },
  { id: 'cobranca', nome: 'Com pagamento pendente' },
]

function Organizacoes({ abrirLoja, meuId, aoMudarLojas, orgSel, setOrgSel }) {
  const [dados, erro, recarregar] = useCarga(async () => {
    const [orgs, cobranca, planos] = await Promise.all([Org.usoDasOrgs(), Org.cobrancaResumo().catch(() => []), Org.planos().catch(() => [])])
    const porOrg = Object.fromEntries(cobranca.map((c) => [c.org_id, c]))
    return { orgs: orgs.map((o) => ({ ...o, cob: porOrg[o.id] })), planos }
  })
  const [form, setForm] = useState({ nome: '', email: '', plano: '' })
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function criar(e) {
    e.preventDefault()
    setEnviando(true)
    try {
      const id = await Org.criarOrg(form.nome.trim(), form.email.trim())
      if (form.plano) await Org.trocarPlano(id, form.plano)
      setForm({ nome: '', email: '', plano: '' })
      await recarregar()
      aoMudarLojas?.()
      setOrgSel(id)
    } catch (er) {
      aviso.erro(er.message)
    } finally {
      setEnviando(false)
    }
  }

  if (!dados) return <Estado erro={erro} recarregar={recarregar} />
  const org = dados.orgs.find((o) => o.id === orgSel)
  if (org) return <DetalheOrg org={org} voltar={() => setOrgSel(null)} recarregar={async () => { await recarregar(); aoMudarLojas?.() }} abrirLoja={abrirLoja} meuId={meuId} />

  const pendente = (o) => ['atrasada', 'suspensa', 'aguardando'].includes(o.cob?.situacao)
  const lista = dados.orgs.filter((o) => norm(o.nome).includes(norm(busca)) &&
    (!filtro || (filtro === 'ativa' && !o.suspensa) || (filtro === 'suspensa' && o.suspensa) || (filtro === 'cobranca' && pendente(o))))
  return (
    <section>
      <div className="linha-titulo"><h3>{t('Nova loja')}</h3></div>
      <form onSubmit={criar}>
        <label>{t('Nome da loja')}<input required maxLength={60} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
        <label>{t('E-mail do administrador da loja (opcional)')}
          <input type="email" placeholder={t('voce@empresa.com')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        {dados.planos.length > 0 && (
          <label>{t('Plano de cobrança')}
            <select value={form.plano} onChange={(e) => setForm({ ...form, plano: e.target.value })}>
              <option value="">{t('Plano padrão (ou isenta)')}</option>
              {dados.planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )}
        <button type="submit" disabled={enviando}>{enviando ? t('Aguarde...') : t('Criar loja')}</button>
      </form>

      <div className="linha-titulo"><h3>{t('Lojas')} ({dados.orgs.length})</h3></div>
      <div className="linha-titulo">
        <input className="busca" placeholder={t('Buscar loja...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="chips">
          {FILTROS_ORG.map((f) => <button key={f.id} className={'filtro' + (filtro === f.id ? ' ativo' : '')} onClick={() => setFiltro(f.id)}>{t(f.nome)}</button>)}
        </div>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Loja')}</th><th>{t('Situação')}</th><th>{t('Plano')}</th><th>{t('Cobrança')}</th><th className="n">{t('Pessoas')}</th><th className="n">{t('Vendas')}</th><th>{t('Criada em')}</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="8" className="vazio">{dados.orgs.length ? t('Nada encontrado.') : t('Nenhuma loja ainda. Crie a primeira acima.')}</td></tr>}
            {lista.map((o) => (
              <tr key={o.id}>
                <td><button className="link" onClick={() => setOrgSel(o.id)}>{o.nome}</button></td>
                <td><Situacao suspensa={o.suspensa} /></td>
                <td>{o.cob?.plano || '-'}</td>
                <td><span className={Org.SITUACOES[o.cob?.situacao]?.classe}>{Org.nomeSituacao(o.cob?.situacao || 'isenta')}</span></td>
                <td className="n">{o.membros}{o.convites > 0 && <small> (+{o.convites} {t('convite(s)')})</small>}</td>
                <td className="n">{o.vendas}</td>
                <td>{dataTs(o.criada_em)}</td>
                <td className="n">
                  <button className="edit" onClick={() => setOrgSel(o.id)}>{t('Gerenciar')}</button>{' '}
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

const ABAS_ORG = [
  { id: 'geral', nome: 'Visão geral' },
  { id: 'cadastro', nome: 'Cadastro' },
  { id: 'cobranca', nome: 'Cobrança' },
  { id: 'equipe', nome: 'Equipe' },
  { id: 'atividade', nome: 'Atividade' },
]

function DetalheOrg({ org, voltar, recarregar, abrirLoja, meuId }) {
  const [aba, setAba] = useState('geral')
  const [nome, setNome] = useState(org.nome)
  const [atividade] = useCarga(() => Org.auditoria({ org: org.id, limite: 100 }), [org.id])

  async function fazer(fn) {
    try { await fn(); await recarregar(); return true } catch (e) { aviso.erro(e.message); return false }
  }
  async function excluir() {
    const digitado = await perguntar(t('Isto apaga a loja "{nome}" e TODOS os dados dela (fornecedores, preços, estoque e vendas). Não dá para desfazer.\n\nPara confirmar, digite o nome da loja:', { nome: org.nome }))
    if (digitado == null) return
    if (await fazer(() => Org.excluirOrg(org.id, digitado))) { aviso.ok(t('Loja excluída.')); voltar() }
  }

  return (
    <section>
      <button className="voltar" onClick={voltar}>← {t('Organizações')}</button>
      <div className="linha-titulo">
        <h3>{org.nome} · <Situacao suspensa={org.suspensa} /></h3>
        <button onClick={() => abrirLoja(org)}>{t('Abrir loja')}</button>
      </div>
      <div className="abas">
        {ABAS_ORG.map((a) => <button key={a.id} className={'aba' + (aba === a.id ? ' ativa' : '')} onClick={() => setAba(a.id)}>{t(a.nome)}</button>)}
      </div>

      {aba === 'geral' && (
        <>
          <div className="cards">
            <div className="card"><small>{t('Cobrança')}</small><b className={Org.SITUACOES[org.cob?.situacao]?.classe}>{Org.nomeSituacao(org.cob?.situacao || 'isenta')}</b>{org.cob?.plano && <small>{org.cob.plano}</small>}</div>
            <div className="card"><small>{t('Pessoas')}</small><b>{org.membros}</b></div>
            <div className="card"><small>{t('Fornecedores')}</small><b>{org.fornecedores}</b></div>
            <div className="card"><small>{t('Produtos cadastrados')}</small><b>{org.produtos}</b></div>
            <div className="card"><small>{t('Vendas')}</small><b>{org.vendas}</b></div>
            <div className="card"><small>{t('Faturamento total')}</small><b>{brl(Number(org.faturamento))}</b></div>
            <div className="card"><small>{t('Criada em')}</small><b>{dataTs(org.criada_em)}</b></div>
            <div className="card"><small>{t('Última alteração')}</small><b>{momento(org.atualizado_em)}</b></div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); fazer(() => Org.renomearOrg(org.id, nome.trim())) }}>
            <label>{t('Nome da loja')}<input required maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
            <button type="submit" disabled={nome.trim() === org.nome}>{t('Renomear')}</button>
          </form>

          <div className="painel zona-perigo">
            <p><b>{t('Zona de perigo')}</b></p>
            <p><small>{org.suspensa
              ? t('Loja suspensa: ninguém da equipe consegue abrir nem alterar os dados. Os dados continuam guardados.')
              : t('Suspender bloqueia o acesso de toda a equipe desta loja, sem apagar nada. Dá para reativar quando quiser.')}</small></p>
            <div className="botoes">
              {org.suspensa
                ? <button className="sec" onClick={() => fazer(() => Org.suspenderOrg(org.id, false))}>{t('Reativar loja')}</button>
                : <button className="del" onClick={async () => await confirmar(t('Suspender a loja "{nome}"? A equipe perde o acesso até você reativar.', { nome: org.nome })) && fazer(() => Org.suspenderOrg(org.id, true))}>{t('Suspender loja')}</button>}
              {org.suspensa && <button className="del" onClick={excluir}>{t('Excluir loja e todos os dados')}</button>}
            </div>
            {!org.suspensa && <p><small>{t('Para excluir a loja, suspenda primeiro.')}</small></p>}
          </div>
        </>
      )}
      {aba === 'cadastro' && <CadastroOrg orgId={org.id} />}
      {aba === 'cobranca' && <CobrancaLoja orgId={org.id} admin onMudou={recarregar} />}
      {aba === 'equipe' && <Equipe orgId={org.id} podeGerir meuId={meuId} />}
      {aba === 'atividade' && (atividade ? <ListaAuditoria eventos={atividade} /> : <p className="vazio">{t('Carregando...')}</p>)}
    </section>
  )
}

// Cadastro da loja (dados da empresa e do contato)
const CAMPOS_CADASTRO = [
  { k: 'razao_social', nome: 'Razão social', largo: true },
  { k: 'cnpj', nome: 'CNPJ ou CPF' },
  { k: 'contato_nome', nome: 'Nome do contato' },
  { k: 'contato_email', nome: 'E-mail do contato', tipo: 'email' },
  { k: 'contato_telefone', nome: 'Telefone / WhatsApp' },
  { k: 'cidade', nome: 'Cidade' },
  { k: 'uf', nome: 'UF', max: 2 },
]
function CadastroOrg({ orgId }) {
  const [atual, setAtual] = useState(null)
  const [form, setForm] = useState({})
  useEffect(() => { Org.buscarCadastroOrg(orgId).then((c) => { setAtual(c); setForm(c) }, (e) => aviso.erro(e.message)) }, [orgId])
  if (!atual) return <p className="vazio">{t('Carregando...')}</p>
  const mudou = JSON.stringify(form) !== JSON.stringify(atual)
  async function salvar(e) {
    e.preventDefault()
    const limpo = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v))
    if (limpo.uf) limpo.uf = limpo.uf.toUpperCase()
    try { await Org.salvarCadastroOrg(orgId, limpo); setAtual(limpo); setForm(limpo); aviso.ok(t('Cadastro salvo.')) } catch (er) { aviso.erro(er.message) }
  }
  return (
    <form onSubmit={salvar} className="form-config">
      {CAMPOS_CADASTRO.map((c) => (
        <label key={c.k} className={c.largo ? 'largo' : ''}>{t(c.nome)}
          <input type={c.tipo || 'text'} maxLength={c.max || 120} value={form[c.k] || ''} onChange={(e) => setForm({ ...form, [c.k]: e.target.value })} />
        </label>
      ))}
      <label className="largo">{t('Observações')}
        <textarea rows={3} maxLength={500} value={form.observacoes || ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
      </label>
      <p className="largo"><small>{t('A razão social e o CNPJ entram na cobrança (cliente no Stripe ou no Asaas). Só o administrador da plataforma vê e altera este cadastro.')}</small></p>
      <div className="acoes-form largo"><button type="submit" disabled={!mudou}>{t('Salvar')}</button></div>
    </form>
  )
}

// ---------- Usuários
function Usuarios({ irPara, abrirOrg }) {
  const [usuarios, erro, recarregar] = useCarga(() => Org.listarUsuarios())
  const [busca, setBusca] = useState('')
  const [loja, setLoja] = useState('')
  const [papel, setPapel] = useState('')
  const [aberto, setAberto] = useState(null)
  if (!usuarios) return <Estado erro={erro} recarregar={recarregar} />
  const u = usuarios.find((x) => x.id === aberto)
  if (u) return <FichaUsuario u={u} voltar={() => setAberto(null)} irPara={irPara} abrirOrg={abrirOrg} />

  const lojas = [...new Map(usuarios.flatMap((x) => x.lojas).map((l) => [l.id, l.nome])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const lista = usuarios.filter((x) => norm(x.email + ' ' + x.nome).includes(norm(busca)) &&
    (!loja || (loja === '-' ? !x.lojas.length : x.lojas.some((l) => l.id === loja))) &&
    (!papel || (papel === 'plataforma' ? x.admin_plataforma : x.lojas.some((l) => l.papel === papel && (!loja || l.id === loja)))))
  return (
    <section>
      <p><small>{t('Todas as contas criadas no sistema. Para colocar alguém numa loja, abra a loja em Organizações.')}</small></p>
      <div className="linha-titulo">
        <input className="busca" placeholder={t('Buscar por nome ou e-mail...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="filtros-linha">
          <select className="sel-pequeno" value={loja} onChange={(e) => setLoja(e.target.value)} aria-label={t('Filtrar por loja')}>
            <option value="">{t('Todas as lojas')}</option>
            <option value="-">{t('Sem loja')}</option>
            {lojas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <select className="sel-pequeno" value={papel} onChange={(e) => setPapel(e.target.value)} aria-label={t('Filtrar por papel')}>
            <option value="">{t('Todos os papéis')}</option>
            {Org.PAPEIS.map((p) => <option key={p.id} value={p.id}>{t(p.nome)}</option>)}
            <option value="plataforma">{t('Admin plataforma')}</option>
          </select>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Nome')}</th><th>{t('E-mail')}</th><th>{t('Lojas e papéis')}</th><th>{t('Criada em')}</th><th>{t('Último acesso')}</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="5" className="vazio">{t('Nada encontrado.')}</td></tr>}
            {lista.map((x) => (
              <tr key={x.id} className="clicavel" onClick={() => setAberto(x.id)}>
                <td><button className="link" onClick={() => setAberto(x.id)}>{x.nome || t('Usuário sem nome')}</button>{x.admin_plataforma && <span className="tag">{t('Admin plataforma')}</span>}</td>
                <td>{x.email}{!x.confirmado && <small className="bad"> ({t('e-mail não confirmado')})</small>}</td>
                <td className="quebra">{x.lojas.length ? x.lojas.map((l) => <span key={l.id} className="tag">{l.nome} · {Org.nomePapel(l.papel)}</span>) : <small className="bad">{t('Sem loja')}</small>}</td>
                <td>{dataTs(x.criado_em)}</td>
                <td>{x.ultimo_acesso ? momento(x.ultimo_acesso) : t('Nunca entrou')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FichaUsuario({ u, voltar, irPara, abrirOrg }) {
  const [eventos] = useCarga(() => Org.auditoria({ usuario: u.id, limite: 50 }), [u.id])
  return (
    <section>
      <button className="voltar" onClick={voltar}>← {t('Usuários')}</button>
      <div className="linha-titulo"><h3>{u.nome || t('Usuário sem nome')}{u.admin_plataforma && <span className="tag">{t('Admin plataforma')}</span>}</h3></div>
      <div className="painel">
        <p><b>{t('Informações do usuário')}</b></p>
        <dl className="ficha">
          <dt>{t('E-mail')}</dt><dd>{u.email}</dd>
          <dt>{t('E-mail confirmado')}</dt><dd className={u.confirmado ? 'ok' : 'bad'}>{u.confirmado ? t('Sim') : t('Não')}</dd>
          <dt>{t('Criada em')}</dt><dd>{momento(u.criado_em)}</dd>
          <dt>{t('Último acesso')}</dt><dd>{u.ultimo_acesso ? momento(u.ultimo_acesso) : t('Nunca entrou')}</dd>
          <dt>{t('Administrador da plataforma')}</dt><dd>{u.admin_plataforma ? t('Sim') : t('Não')} <button className="link pequeno" onClick={() => irPara('admins')}>{t('Administradores')} →</button></dd>
        </dl>
      </div>
      <div className="linha-titulo"><h3>{t('Lojas e papéis')}</h3></div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Loja')}</th><th>{t('Papel')}</th><th></th></tr></thead>
          <tbody>
            {u.lojas.length === 0 && <tr><td colSpan="3" className="vazio">{t('Não faz parte de nenhuma loja.')}</td></tr>}
            {u.lojas.map((l) => (
              <tr key={l.id}><td>{l.nome}</td><td>{Org.nomePapel(l.papel)}</td><td className="n"><button className="edit" onClick={() => abrirOrg(l.id)}>{t('Gerenciar')}</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="linha-titulo"><h3>{t('Atividade recente')}</h3></div>
      {eventos ? <ListaAuditoria eventos={eventos} mostrarLoja /> : <p className="vazio">{t('Carregando...')}</p>}
    </section>
  )
}

// ---------- Administradores da plataforma
function Administradores({ meuId }) {
  const [admins, erro, recarregar] = useCarga(() => Org.listarAdmins())
  const [email, setEmail] = useState('')
  if (!admins) return <Estado erro={erro} recarregar={recarregar} />

  async function fazer(fn) {
    try { await fn(); await recarregar(); return true } catch (e) { aviso.erro(e.message); return false }
  }

  return (
    <section>
      <div className="painel">
        <p><small>{t('Administradores da plataforma veem e administram todas as lojas, todos os usuários e este painel. Dê este poder só a quem precisa.')}</small></p>
        <p><small>{t('O administrador principal (o dono do sistema) não pode ser removido: nem por outro administrador, nem por ele mesmo.')}</small></p>
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
                <td>{a.nome || '-'}{a.principal && <span className="tag">{t('Principal')}</span>}{a.user_id === meuId && <span className="tag">{t('você')}</span>}</td>
                <td>{a.email}</td>
                <td>{dataTs(a.criado_em)}</td>
                <td className="n">
                  {a.principal ? <small>{t('Não pode ser removido')}</small> : (
                  <button className="del" onClick={async () => await confirmar(a.user_id === meuId
                    ? t('Tirar o SEU acesso de administrador da plataforma? Você deixa de ver este painel.')
                    : t('Tirar o acesso de administrador da plataforma de {email}?', { email: a.email }))
                    && fazer(async () => { await Org.removerAdmin(a.user_id); if (a.user_id === meuId) window.location.reload() })}>{t('Remover')}</button>)}
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
  const [limite, setLimite] = useState(300)
  const [eventos, erro, recarregar] = useCarga(() => Org.auditoria({ limite }), [limite])
  const [busca, setBusca] = useState('')
  const [loja, setLoja] = useState('')
  const [acao, setAcao] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [aberto, setAberto] = useState(null)
  if (!eventos) return <Estado erro={erro} recarregar={recarregar} />

  const lojas = [...new Map(eventos.filter((e) => e.org_id).map((e) => [e.org_id, e.org_nome || e.org_id])).entries()]
  const acoes = [...new Set(eventos.map((e) => e.acao))].sort((a, b) => Org.nomeAcao(a).localeCompare(Org.nomeAcao(b)))
  const dia = (ts) => new Date(ts).toISOString().slice(0, 10)
  const lista = eventos.filter((e) =>
    norm([e.org_nome, e.email, Org.nomeAcao(e.acao), e.detalhe].join(' ')).includes(norm(busca)) &&
    (!loja || (loja === '-' ? !e.org_id : e.org_id === loja)) && (!acao || e.acao === acao) &&
    (!de || dia(e.criado_em) >= de) && (!ate || dia(e.criado_em) <= ate))
  const ev = eventos.find((e) => e.id === aberto)

  return (
    <section>
      <p><small>{t('Quem fez o quê e quando, em todas as lojas. Os registros não podem ser alterados nem apagados pelo app.')}</small></p>
      <div className="filtros-auditoria">
        <input className="busca" placeholder={t('Buscar por loja, pessoa ou ação...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="sel-pequeno" value={loja} onChange={(e) => setLoja(e.target.value)} aria-label={t('Filtrar por loja')}>
          <option value="">{t('Todas as lojas')}</option>
          <option value="-">{t('Plataforma')}</option>
          {lojas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select className="sel-pequeno" value={acao} onChange={(e) => setAcao(e.target.value)} aria-label={t('Filtrar por ação')}>
          <option value="">{t('Todas as ações')}</option>
          {acoes.map((a) => <option key={a} value={a}>{Org.nomeAcao(a)}</option>)}
        </select>
        <label className="data-filtro">{t('De')}<input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="data-filtro">{t('Até')}<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        <button className="sec" onClick={recarregar}>{t('Atualizar')}</button>
      </div>

      {ev && (
        <div className="painel detalhe-evento">
          <div className="linha-titulo"><b>{Org.nomeAcao(ev.acao)}</b><button className="sec" onClick={() => setAberto(null)}>{t('Fechar')}</button></div>
          <dl className="ficha">
            <dt>{t('Quando')}</dt><dd>{momento(ev.criado_em)}</dd>
            <dt>{t('Loja')}</dt><dd>{ev.org_nome || (ev.org_id ? '-' : t('Plataforma'))}</dd>
            <dt>{t('Quem')}</dt><dd>{ev.email || t('Sistema (aviso do provedor)')}</dd>
            <dt>{t('Ação')}</dt><dd>{Org.nomeAcao(ev.acao)} <small>({ev.acao})</small></dd>
            <dt>{t('Detalhe')}</dt><dd className="quebra">{ev.detalhe || '-'}</dd>
            <dt>{t('Registro nº')}</dt><dd>{ev.id}</dd>
          </dl>
        </div>
      )}

      <ListaAuditoria eventos={lista} mostrarLoja onAbrir={setAberto} />
      <p><small>{t('Mostrando {n} de {total} registros carregados.', { n: lista.length, total: eventos.length })}</small>{' '}
        {eventos.length >= limite && <button className="link pequeno" onClick={() => setLimite(limite + 300)}>{t('Carregar mais')}</button>}</p>
    </section>
  )
}

export function ListaAuditoria({ eventos, mostrarLoja, onAbrir }) {
  return (
    <div className="tw">
      <table>
        <thead><tr><th>{t('Quando')}</th>{mostrarLoja && <th>{t('Loja')}</th>}<th>{t('Quem')}</th><th>{t('Ação')}</th><th>{t('Detalhe')}</th></tr></thead>
        <tbody>
          {eventos.length === 0 && <tr><td colSpan={mostrarLoja ? 5 : 4} className="vazio">{t('Nenhum registro.')}</td></tr>}
          {eventos.map((e) => (
            <tr key={e.id} className={onAbrir ? 'clicavel' : ''} onClick={onAbrir ? () => onAbrir(e.id) : undefined}>
              <td>{momento(e.criado_em)}</td>
              {mostrarLoja && <td>{e.org_nome || (e.org_id ? '-' : t('Plataforma'))}</td>}
              <td>{e.email || t('Sistema')}</td>
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
  const [pedidos, erroPedidos, recarregarPedidos] = useCarga(() => Org.listarPedidos())
  const [nomes, setNomes] = useState({}) // nome da loja de cada pedido, antes de aprovar
  const [ocupado, setOcupado] = useState(false)
  if (!config) return <Estado erro={erro} recarregar={recarregar} />

  const soConvite = config.somente_convite
  const comAprovacao = config.aprovacao
  async function mudar(novoConvite, novaAprovacao) {
    setOcupado(true)
    try { await Org.definirCadastro(novoConvite, novaAprovacao); await recarregar() } catch (e) { aviso.erro(e.message) } finally { setOcupado(false) }
  }
  async function decidir(fn) {
    try { await fn(); await recarregarPedidos() } catch (e) { aviso.erro(e.message) }
  }
  const nomeDe = (p) => nomes[p.user_id] ?? t('Loja de {nome}', { nome: p.nome || p.email.split('@')[0] })
  const pendentes = (pedidos || []).filter((p) => p.situacao === 'pendente')
  const recusados = (pedidos || []).filter((p) => p.situacao === 'recusado')

  return (
    <section>
      <p className="subtitulo-tela">{t('Quem pode criar uma conta no sistema.')}</p>
      <div className="painel cadastro-bloco">
        <p><b>{t('Quem pode criar conta')}</b></p>
        <p><small>{t('Vale para o sistema inteiro, não para uma loja só. Quem já tem conta continua entrando normalmente.')}</small></p>

        <div className="opcao-chave">
          <div>
            <b>{t('Cadastro apenas por convite')}</b>
            <small>{soConvite
              ? t('Ligado: só entra quem foi convidado para uma loja (por você ou pelo administrador da loja). Quem chega sem convite vê um aviso para pedir acesso.')
              : comAprovacao
                ? t('Desligado: quem chega sem convite pode criar conta, e a loja espera a sua aprovação.')
                : t('Desligado: quem chega sem convite pode criar conta e ganha uma loja própria na hora.')}</small>
          </div>
          <Chave ligada={soConvite} desativada={ocupado} rotulo={t('Cadastro apenas por convite')} onMudar={(v) => mudar(v, comAprovacao)} />
        </div>

        <div className={'opcao-chave' + (soConvite ? ' sem-efeito' : '')}>
          <div>
            <b>{t('Cadastro com aprovação')}</b>
            <small>{soConvite
              ? t('Só vale com o cadastro apenas por convite desligado.')
              : comAprovacao
                ? t('Ligado: quem cria conta sem convite pede a loja, e ela só é criada quando você aprova o pedido nesta tela.')
                : t('Desligado: quem cria conta sem convite ganha a loja na hora, sem passar por você.')}</small>
          </div>
          <Chave ligada={comAprovacao} desativada={ocupado || soConvite} rotulo={t('Cadastro com aprovação')} onMudar={(v) => mudar(soConvite, v)} />
        </div>
      </div>

      <div className="painel cadastro-bloco">
        <p><b>{t('Pedidos aguardando aprovação')}</b></p>
        <p><small>{t('Aprovar cria a loja e torna quem pediu administrador dela.')}</small></p>
        {!pedidos ? <Estado erro={erroPedidos} recarregar={recarregarPedidos} />
          : pendentes.length === 0 ? <p><small>{t('Nenhum pedido aguardando.')}</small></p>
            : (
              <div className="tw">
                <table>
                  <thead><tr><th>{t('Nome')}</th><th>{t('E-mail')}</th><th>{t('Pedido em')}</th><th>{t('Nome da loja')}</th><th></th></tr></thead>
                  <tbody>
                    {pendentes.map((p) => (
                      <tr key={p.user_id}>
                        <td>{p.nome || '-'}</td>
                        <td>{p.email}</td>
                        <td>{momento(p.criado_em)}</td>
                        <td><input className="sel-pequeno" maxLength={60} value={nomeDe(p)} onChange={(e) => setNomes({ ...nomes, [p.user_id]: e.target.value })} /></td>
                        <td className="n">
                          <button className="edit" disabled={!nomeDe(p).trim()} onClick={() => decidir(() => Org.aprovarPedido(p.user_id, nomeDe(p).trim()))}>{t('Aprovar')}</button>{' '}
                          <button className="del" onClick={async () => await confirmar(t('Recusar o pedido de {email}? A pessoa continua sem acesso.', { email: p.email })) && decidir(() => Org.recusarPedido(p.user_id))}>{t('Recusar')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        {recusados.length > 0 && (
          <>
            <p style={{ marginTop: 14 }}><b>{t('Recusados')}</b></p>
            <div className="tw">
              <table>
                <thead><tr><th>{t('Nome')}</th><th>{t('E-mail')}</th><th>{t('Recusado em')}</th><th></th></tr></thead>
                <tbody>
                  {recusados.map((p) => (
                    <tr key={p.user_id}>
                      <td>{p.nome || '-'}</td>
                      <td>{p.email}</td>
                      <td>{momento(p.decidido_em)}</td>
                      <td className="n"><button className="sec" onClick={() => decidir(() => Org.aprovarPedido(p.user_id, nomeDe(p).trim()))}>{t('Aprovar mesmo assim')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

// Interruptor liga/desliga
function Chave({ ligada, desativada, rotulo, onMudar }) {
  return (
    <button type="button" role="switch" aria-checked={ligada} aria-label={rotulo} disabled={desativada}
      className={'chave' + (ligada ? ' ligada' : '')} onClick={() => onMudar(!ligada)}>
      <span />
    </button>
  )
}
