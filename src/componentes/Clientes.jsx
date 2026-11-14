import { useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { podeFazer } from '../armazenamento.js'
import { brl, dataBR, dataTs, formatarCPF, lerCPF, norm, num, resumoCliente, soDigitos, uid } from '../utils.js'

// Clientes: cadastro (nome, WhatsApp, observação) e a ficha de cada um, com o fiado e os empréstimos.
const SIT = {
  atrasado: { nome: 'Atrasado', classe: 'bad' },
  nao_pago: { nome: 'Não pagou', classe: 'bad' },
  aberto: { nome: 'Em aberto', classe: 'warn' },
  pago: { nome: 'Pago', classe: 'ok' },
}
const vazio = { id: '', nome: '', cpf: '', telefone: '', obs: '' }

function linkWhats(telefone, texto) {
  let n = String(telefone || '').replace(/\D/g, '')
  if (!n) return null
  if (n.length <= 11) n = '55' + n
  return `https://wa.me/${n}${texto ? '?text=' + encodeURIComponent(texto) : ''}`
}

// Situação geral do cliente (para a lista)
function situacaoGeral(r) {
  if (r.atrasado > 0) return { nome: 'Atrasado', classe: 'bad' }
  if (r.naoPago > 0 && r.aberto <= 0) return { nome: 'Deixou de pagar', classe: 'bad' }
  if (r.aberto > 0) return { nome: 'Em dia', classe: 'warn' }
  if (r.registros.length) return { nome: 'Sem pendências', classe: 'ok' }
  return { nome: 'Sem compras a prazo', classe: '' }
}

// Aviso ao escolher o cliente num fiado ou empréstimo novo
export function AvisoCliente({ db, clienteId }) {
  const r = resumoCliente(db, clienteId, podeFazer('emprestimo.salvo'))
  if (r.atrasado > 0) return <div className="aviso-cliente bad">⚠ {t('Este cliente tem {valor} atrasado ({n} parcela(s)).', { valor: brl(r.atrasado), n: r.nAtrasadas })}{r.naoPago > 0 ? ' ' + t('E já deixou de pagar {valor}.', { valor: brl(r.naoPago) }) : ''}</div>
  if (r.naoPago > 0) return <div className="aviso-cliente bad">⚠ {t('Este cliente já deixou de pagar {valor}.', { valor: brl(r.naoPago) })}</div>
  if (r.aberto > 0) return <div className="aviso-cliente warn">{t('Este cliente já tem {valor} em aberto (em dia).', { valor: brl(r.aberto) })}</div>
  return null
}

export default function Clientes({ db, executar, irPara }) {
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(vazio)
  const [aberto, setAberto] = useState(null) // id do cliente com a ficha aberta
  const comEmp = podeFazer('emprestimo.salvo')
  const clientes = db.clientes || []
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  async function salvar(e) {
    e.preventDefault()
    const nome = form.nome.trim()
    if (!nome) return aviso.alerta(t('Informe o nome do cliente.'))
    const cpf = lerCPF(form.cpf)
    if (cpf.erro) return aviso.alerta(cpf.erro)
    const mesmoCpf = cpf && clientes.find((c) => c.id !== form.id && soDigitos(c.cpf) === soDigitos(cpf))
    if (mesmoCpf) return aviso.alerta(t('Este CPF já é do cliente {nome}.', { nome: mesmoCpf.nome }))
    if (clientes.some((c) => c.id !== form.id && norm(c.nome) === norm(nome))) return aviso.alerta(t('Já existe um cliente com esse nome.'))
    const c = { id: form.id || uid(), nome, cpf, telefone: form.telefone.trim(), obs: form.obs.trim() }
    if (await executar((A) => A.atualizarCliente(c), form.id ? t('Cliente atualizado.') : t('Cliente cadastrado.'))) setForm(vazio)
  }
  function editar(c) {
    setForm({ id: c.id, nome: c.nome || '', cpf: c.cpf || '', telefone: c.telefone || '', obs: c.obs || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function excluir(c) {
    if (await confirmar(t('Excluir o cliente {nome}?\nAs vendas e empréstimos dele continuam registrados com o nome.', { nome: c.nome }), { perigo: true })) {
      executar((A) => A.excluirCliente(c.id), t('Cliente excluído.')).then((ok) => { if (ok) { if (form.id === c.id) setForm(vazio); if (aberto === c.id) setAberto(null) } })
    }
  }
  function verCobrancas(c) {
    try { sessionStorage.setItem('cobrancas-busca', c.nome) } catch { /* sem acesso */ }
    irPara?.('fiado')
  }

  const ficha = aberto && clientes.find((c) => c.id === aberto)
  if (ficha) return <Ficha c={ficha} db={db} comEmp={comEmp} voltar={() => setAberto(null)} editar={() => { setAberto(null); editar(ficha) }} verCobrancas={() => verCobrancas(ficha)} irPara={irPara} />

  const b = norm(busca)
  const lista = clientes
    .filter((c) => !b || norm(c.nome).includes(b) || norm(c.telefone).includes(b) || (soDigitos(b) && soDigitos(c.cpf).includes(soDigitos(b))))
    .map((c) => ({ c, r: resumoCliente(db, c.id, comEmp) }))
    .sort((x, y) => y.r.atrasado - x.r.atrasado || y.r.aberto - x.r.aberto || x.c.nome.localeCompare(y.c.nome))
  const tot = clientes.map((c) => resumoCliente(db, c.id, comEmp))
  const soma = (k) => tot.reduce((s, r) => s + r[k], 0)

  return (
    <section>
      <h2>{t('Clientes')}</h2>

      <div className="cards">
        <div className="card"><small>{t('Clientes')}</small><b>{clientes.length}</b></div>
        <div className="card destaque"><small>{t('A receber')}</small><b>{brl(soma('aberto'))}</b><small className="var">{t('{n} cliente(s) devendo', { n: tot.filter((r) => r.aberto > 0).length })}</small></div>
        <div className={'card' + (soma('atrasado') > 0 ? ' card-prejuizo' : '')}><small>{t('Atrasado')}</small><b className={soma('atrasado') > 0 ? 'bad' : ''}>{brl(soma('atrasado'))}</b><small className="var">{t('{n} cliente(s)', { n: tot.filter((r) => r.atrasado > 0).length })}</small></div>
      </div>

      <div className="linha-titulo"><h3>{form.id ? t('Editando {nome}', { nome: form.nome }) : t('Novo cliente')}</h3></div>
      <form onSubmit={salvar} className={form.id ? 'form-edicao' : ''}>
        <label style={{ flex: '2 1 220px' }}>{t('Nome')} *<input required maxLength={60} {...campo('nome')} /></label>
        <label style={{ flex: '1 1 160px' }}>{t('CPF')}<input inputMode="numeric" maxLength={14} placeholder="000.000.000-00" {...campo('cpf')} onBlur={() => setForm((f) => ({ ...f, cpf: formatarCPF(f.cpf) }))} /></label>
        <label style={{ flex: '1 1 180px' }}>{t('Telefone / WhatsApp')}<input inputMode="tel" maxLength={20} placeholder="(11) 99999-9999" {...campo('telefone')} /></label>
        <label style={{ flex: '2 1 240px' }}>{t('Observação')}<input maxLength={120} placeholder={t('Ex: endereço, indicação, limite combinado...')} {...campo('obs')} /></label>
        <button type="submit">{form.id ? t('Salvar alterações') : t('Cadastrar')}</button>
        {form.id && <button type="button" className="sec" onClick={() => setForm(vazio)}>{t('Cancelar edição')}</button>}
      </form>

      <div className="linha-titulo">
        <input className="busca" placeholder={t('Buscar nome, CPF ou telefone...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Cliente')}</th><th className="n">{t('Registros')}</th><th className="n">{t('Em aberto')}</th><th className="n">{t('Atrasado')}</th><th className="n">{t('Não pago')}</th><th>{t('Situação')}</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="7" className="vazio">{clientes.length ? t('Nenhum cliente encontrado.') : t('Nenhum cliente ainda. Cadastre acima, ou ao fazer uma venda fiado ou um empréstimo.')}</td></tr>}
            {lista.map(({ c, r }) => {
              const s = situacaoGeral(r)
              const whats = linkWhats(c.telefone)
              return (
                <tr key={c.id} className={(form.id === c.id ? 'em-edicao' : '') + (r.atrasado > 0 ? ' linha-prejuizo' : '')}>
                  <td className="quebra"><button className="link" onClick={() => setAberto(c.id)}>{c.nome}</button>{(c.cpf || c.telefone || c.obs) && <small className="sub-linha">{[c.cpf && t('CPF {cpf}', { cpf: c.cpf }), c.telefone, c.obs].filter(Boolean).join(' · ')}</small>}</td>
                  <td className="n">{r.registros.length}</td>
                  <td className="n">{r.aberto > 0 ? brl(r.aberto) : '-'}</td>
                  <td className={'n' + (r.atrasado > 0 ? ' bad' : '')}>{r.atrasado > 0 ? brl(r.atrasado) : '-'}</td>
                  <td className={'n' + (r.naoPago > 0 ? ' bad' : '')}>{r.naoPago > 0 ? brl(r.naoPago) : '-'}</td>
                  <td><span className={'tag-sit ' + s.classe}>{t(s.nome)}</span></td>
                  <td className="n acoes-fiado">
                    <button className="sec mini" onClick={() => setAberto(c.id)}>{t('Ficha')}</button>{' '}
                    <button className="edit" onClick={() => editar(c)}>{t('Editar')}</button>{' '}
                    {whats && <><a className="botao-whats" href={whats} target="_blank" rel="noreferrer">WhatsApp</a>{' '}</>}
                    <button className="del" onClick={() => excluir(c)}>{t('Excluir')}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------- Ficha do cliente
function Ficha({ c, db, comEmp, voltar, editar, verCobrancas, irPara }) {
  const r = resumoCliente(db, c.id, comEmp)
  const whats = linkWhats(c.telefone, r.aberto > 0 ? t('Olá, {cliente}! Passando para lembrar que há {valor} em aberto com a gente. Obrigado!', { cliente: c.nome.split(' ')[0], valor: brl(r.aberto) }) : '')
  const irDia = (dia) => { try { sessionStorage.setItem('vendas-dia', dia) } catch { /* sem acesso */ } irPara?.('vendas') }
  return (
    <section className="ficha-cliente">
      <p><button className="link pequeno" onClick={voltar}>← {t('Voltar para Clientes')}</button></p>
      <div className="cabecalho-ficha">
        <h2>{c.nome}</h2>
        {c.cpf && <span>{t('CPF {cpf}', { cpf: c.cpf })}</span>}
        {c.telefone && <span>{c.telefone}</span>}
        {whats && <a className="botao-whats" href={whats} target="_blank" rel="noreferrer">WhatsApp</a>}
        <button className="edit" onClick={editar}>{t('Editar')}</button>
        {r.aberto > 0 && <button className="sec" onClick={verCobrancas}>{t('Ver em Cobranças')}</button>}
      </div>
      {c.obs && <p><small>{c.obs}</small></p>}

      <div className="cards">
        <div className="card"><small>{t('Total a prazo')}</small><b>{brl(r.total)}</b><small className="var">{t('{n} registro(s)', { n: r.registros.length })}</small></div>
        <div className="card"><small>{t('Já pagou')}</small><b className="ok">{brl(r.recebido)}</b></div>
        <div className="card destaque"><small>{t('Em aberto')}</small><b>{brl(r.aberto)}</b></div>
        <div className={'card' + (r.atrasado > 0 ? ' card-prejuizo' : '')}><small>{t('Atrasado')}</small><b className={r.atrasado > 0 ? 'bad' : ''}>{brl(r.atrasado)}</b><small className="var">{t('{n} parcela(s)', { n: r.nAtrasadas })}</small></div>
        <div className="card"><small>{t('Não pagos (perda)')}</small><b className={r.naoPago > 0 ? 'bad' : ''}>{r.naoPago > 0 ? '− ' + brl(r.naoPago) : brl(0)}</b></div>
      </div>

      <div className="linha-titulo"><h3>{t('Histórico')}</h3></div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Data')}</th><th>{t('Tipo')}</th><th className="n">{t('Parcelas pagas')}</th><th className="n">{t('Total')}</th><th className="n">{t('Falta')}</th><th>{t('Situação')}</th><th></th></tr></thead>
          <tbody>
            {r.registros.length === 0 && <tr><td colSpan="7" className="vazio">{t('Nenhuma venda fiado ou empréstimo para este cliente.')}</td></tr>}
            {r.registros.map((x) => {
              const s = SIT[x.situacao]
              const n = x.r.fiado.parcelas.length
              const total = x.r.fiado.parcelas.reduce((a, p) => a + (+p.valor || 0), 0)
              return (
                <tr key={x.r.id} className={x.situacao === 'atrasado' ? 'linha-prejuizo' : ''}>
                  <td>{dataTs(x.r.data)}</td>
                  <td className="quebra">
                    {x.tipo === 'venda' ? t('Venda fiado') : t('Empréstimo')}
                    <small className="sub-linha">{x.tipo === 'venda'
                      ? (x.r.itens || []).map((i) => `${i.qtd}× ${i.produto}`).join(', ')
                      : t('{valor} emprestado · {p}% ao mês', { valor: brl(x.r.valor), p: num(x.r.jurosPct || 0, 2) })}</small>
                  </td>
                  <td className="n">{x.pagas}/{n}</td>
                  <td className="n">{brl(total)}</td>
                  <td className="n"><b>{x.falta > 0 ? brl(x.falta) : '-'}</b></td>
                  <td><span className={s.classe}>{t(s.nome)}</span></td>
                  <td className="n"><button className="link pequeno" onClick={() => irDia(x.r.dia)}>{dataBR(x.r.dia)} →</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {r.ultima && <p><small>{t('Último registro em {data}.', { data: dataTs(r.ultima) })}</small></p>}
    </section>
  )
}
