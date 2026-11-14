import { Fragment, useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { podeFazer } from '../armazenamento.js'
import { distribuirRecebimento, encargoAtraso, textoAtraso } from '../utils.js'
import { brl, dataBR, hoje, lerValor as numero, norm, PAGAMENTOS, recebidoDaParcela, situacaoParcela, uid } from '../utils.js'

// Fiado (contas a receber): cada parcela de cada venda fiado.
// "Recebeu" registra o pagamento (total ou parcial) e entra no caixa; "Não pagou" vira perda.
// O lucro conta no dia da venda/empréstimo; o que o cliente não pagar sai do lucro.
const SITUACOES = {
  atrasada: { nome: 'Atrasado', classe: 'bad' },
  vence_hoje: { nome: 'Vence hoje', classe: 'warn' },
  aberta: { nome: 'Em aberto', classe: '' },
  paga: { nome: 'Pago', classe: 'ok' },
  nao_paga: { nome: 'Não pagou', classe: 'bad' },
}
const FILTROS = [
  { id: 'abertos', nome: 'Em aberto' },
  { id: 'atrasados', nome: 'Atrasados' },
  { id: 'pagos', nome: 'Pagos' },
  { id: 'nao_pagos', nome: 'Não pagos' },
  { id: 'todos', nome: 'Todos' },
]
const r2 = (x) => Math.round(x * 100) / 100

// Link do WhatsApp com a mensagem pronta
function linkWhats(telefone, texto) {
  let n = String(telefone || '').replace(/\D/g, '')
  if (!n) return null
  if (n.length <= 11) n = '55' + n
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}

export default function Fiado({ db, executar, irPara }) {
  const [filtro, setFiltro] = useState('abertos')
  const [busca, setBusca] = useState('')
  const [recebendo, setRecebendo] = useState(null) // { vendaId, parcelaId, valor, forma }
  const [mudandoData, setMudandoData] = useState(null) // { vendaId, parcelaId, data }
  const [configurando, setConfigurando] = useState(null) // { multaPct, jurosMesPct, carenciaDias } em edição
  const dia = hoje()
  const cfgAtraso = db.config?.atraso
  const podeConfigurar = podeFazer('config.salva')

  // todas as parcelas, com a venda junto
  // (empréstimos só para quem pode emprestar)
  const comParcelas = (l, emp) => (l || []).filter((v) => v.fiado?.parcelas?.length).flatMap((v) => v.fiado.parcelas.map((p) => {
    const recebido = recebidoDaParcela(p)
    const atraso = encargoAtraso(p, cfgAtraso, dia) // multa e juros por atraso (se configurados)
    return { v, p, emp, recebido, falta: r2(Math.max(0, p.valor - recebido)), situacao: situacaoParcela(p, dia), total: v.fiado.parcelas.length, atraso, enc: atraso.total }
  }))
  const parcelas = [...comParcelas(db.vendas, false), ...(podeFazer('emprestimo.salvo') ? comParcelas(db.emprestimos, true) : [])]
  const abertas = parcelas.filter((x) => ['aberta', 'vence_hoje', 'atrasada'].includes(x.situacao))
  const soma = (l) => r2(l.reduce((s, x) => s + x.falta, 0))
  const em7 = (() => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })()
  const cards = {
    receber: soma(abertas),
    atrasado: soma(abertas.filter((x) => x.situacao === 'atrasada')),
    encargos: r2(abertas.reduce((s, x) => s + x.enc, 0)),
    nAtrasado: abertas.filter((x) => x.situacao === 'atrasada').length,
    semana: soma(abertas.filter((x) => x.p.vencimento >= dia && x.p.vencimento <= em7)),
    naoPago: soma(parcelas.filter((x) => x.situacao === 'nao_paga')),
  }

  // uma linha por compra ou empréstimo; a linha mostra a próxima parcela e abre as outras
  const ABERTA = ['aberta', 'vence_hoje', 'atrasada']
  const grupos = [...parcelas.reduce((m, x) => { const g = m.get(x.v.id) || { v: x.v, emp: x.emp, parcelas: [] }; g.parcelas.push(x); return m.set(x.v.id, g) }, new Map()).values()]
    .map((g) => {
      const tem = (s) => g.parcelas.some((x) => x.situacao === s)
      const abertasG = g.parcelas.filter((x) => ABERTA.includes(x.situacao)).sort((a, c) => String(a.p.vencimento).localeCompare(String(c.p.vencimento)))
      const situacao = tem('atrasada') ? 'atrasada' : tem('vence_hoje') ? 'vence_hoje' : tem('aberta') ? 'aberta' : tem('nao_paga') ? 'nao_paga' : 'paga'
      return {
        ...g, situacao, abertas: abertasG,
        proxima: abertasG[0] || g.parcelas.find((x) => x.situacao === 'nao_paga') || g.parcelas.at(-1),
        falta: soma(abertasG),
        encargo: r2(abertasG.reduce((s, x) => s + x.enc, 0)),
        pagas: g.parcelas.filter((x) => x.situacao === 'paga').length,
      }
    })
  const b = norm(busca)
  const lista = grupos
    .filter((g) => !b || norm(g.v.fiado.cliente).includes(b) || norm(g.v.fiado.telefone).includes(b) || (!g.emp && (g.v.itens || []).some((i) => norm(i.produto).includes(b))))
    .filter((g) => ({
      abertos: g.abertas.length > 0,
      atrasados: g.situacao === 'atrasada',
      pagos: g.situacao === 'paga',
      nao_pagos: g.parcelas.some((x) => x.situacao === 'nao_paga'),
      todos: true,
    }[filtro]))
    .sort((a, c) => (c.abertas.length > 0) - (a.abertas.length > 0) || String(a.proxima.p.vencimento).localeCompare(String(c.proxima.p.vencimento)) || c.v.data - a.v.data)
  const [abertos, setAbertos] = useState({}) // compras com as parcelas abertas na tela
  // o motivo da cobrança: os produtos comprados ou o empréstimo
  const motivo = (g) => {
    if (g.emp) return { titulo: t('Empréstimo'), detalhe: t('{valor} emprestado · {p}% ao mês', { valor: brl(g.v.valor), p: String(g.v.jurosPct || 0).replace('.', ',') }) }
    const itens = (g.v.itens || []).map((i) => `${i.qtd > 1 ? i.qtd + '× ' : ''}${i.produto}`)
    return {
      titulo: itens.length > 2 ? `${itens.slice(0, 2).join(', ')} ${t('+{n} item(ns)', { n: itens.length - 2 })}` : itens.join(', ') || t('Compra'),
      detalhe: [t('Compra'), g.v.fiado.jurosPct ? t('juros {p}% ao mês', { p: String(g.v.fiado.jurosPct).replace('.', ',') }) : ''].filter(Boolean).join(' · '),
    }
  }

  // altera uma parcela (a mudança é aplicada sobre a versão mais nova da venda, no banco)
  const gravar = (x, alterar, acao, detalhe, msgOk) => executar((A) => A.salvarParcela(x.emp ? 'emprestimos' : 'vendas', x.v.id, x.p.id, alterar, acao, detalhe), msgOk)
  const acao = (x, s) => (x.emp ? 'emprestimo.' : 'venda.fiado-') + s

  async function salvarAtraso(e) {
    e.preventDefault()
    const n = (s) => (String(s ?? '').trim() === '' ? 0 : numero(s))
    const atraso = { multaPct: n(configurando.multaPct), jurosMesPct: n(configurando.jurosMesPct), carenciaDias: Math.max(0, parseInt(configurando.carenciaDias, 10) || 0) }
    if (!(atraso.multaPct >= 0) || !(atraso.jurosMesPct >= 0)) return aviso.alerta(t('Confira os valores.'))
    if (atraso.multaPct > 2 && !(await confirmar(t('Multa de {p}% passa dos 2% que o Código de Defesa do Consumidor costuma permitir. Salvar mesmo assim?', { p: String(atraso.multaPct).replace('.', ',') })))) return
    if (await executar((A) => A.salvarConfig({ ...(db.config || {}), atraso }), t('Multa e juros por atraso salvos.'))) setConfigurando(null)
  }

  // Recebeu: paga sempre a parcela mais antiga; o que passar dela quita as próximas, em ordem
  async function confirmarRecebimento(e) {
    e.preventDefault()
    const g = grupos.find((y) => y.v.id === recebendo.vendaId)
    const x = g?.abertas[0]
    if (!x) return setRecebendo(null)
    const valor = r2(numero(recebendo.valor))
    const comEncargo = !recebendo.perdoar && g.encargo > 0
    const limite = r2(g.falta + (comEncargo ? g.encargo : 0))
    if (!(valor > 0)) return aviso.alerta(t('Informe um valor maior que zero.'))
    if (valor > limite + 0.004) return aviso.alerta(t('O valor passa do que falta nesta compra ({valor}).', { valor: brl(limite) }))
    const rec = { id: uid(), data: Date.now(), dia: hoje(), forma: recebendo.forma }
    let quitadas = 0
    const ok = await executar((A) => A.alterarParcelas(x.emp ? 'emprestimos' : 'vendas', x.v.id, (ps) => {
      // refeito sobre os dados mais novos (outra pessoa pode ter recebido antes)
      const r = distribuirRecebimento(ps, valor, rec, comEncargo ? (p) => encargoAtraso(p, cfgAtraso, hoje()).total : null)
      if (r.sobra > 0.004) throw new Error(t('O valor passa do que falta nesta compra ({valor}).', { valor: brl(valor - r.sobra) }))
      quitadas = r.quitadas
      return r.parcelas
    }, acao(x, 'recebido'), `${x.v.fiado.cliente} ${x.p.n}/${x.total}: ${valor} (${recebendo.forma})`))
    if (!ok) return
    const resta = r2(limite - valor)
    aviso.ok(quitadas > 1 ? t('Recebido. Quitou {n} parcelas.', { n: quitadas }) : quitadas === 1 ? t('Parcela recebida. Entrou no caixa.') : t('Pagamento parcial registrado.'),
      resta > 0.004 ? t('Ainda falta {valor} desta compra.', { valor: brl(resta) }) : t('Compra quitada.'))
    setRecebendo(null)
  }

  async function naoPagou(x) {
    const texto = x.emp
      ? t('Marcar que {cliente} NÃO pagou {valor}?\nEsse valor sai do lucro do empréstimo e conta como perda. Dá para desfazer depois.', { cliente: x.v.fiado.cliente, valor: brl(x.falta) })
      : t('Marcar que {cliente} NÃO pagou {valor}?\nEsse valor sai do lucro da venda e conta como perda. Dá para desfazer depois.', { cliente: x.v.fiado.cliente, valor: brl(x.falta) })
    if (!(await confirmar(texto, { botao: t('Não pagou'), perigo: true }))) return
    gravar(x, (p) => ({ ...p, naoPaga: true, naoPagaEm: { data: Date.now(), dia: hoje() } }), acao(x, 'nao-pago'), `${x.v.fiado.cliente} ${x.p.n}/${x.total}: ${x.falta}`, t('Marcado como não pago (perda).'))
  }
  function reabrir(x) {
    gravar(x, (p) => { const { naoPagaEm, ...resto } = p; return { ...resto, naoPaga: false } }, acao(x, 'reaberto'), `${x.v.fiado.cliente} ${x.p.n}/${x.total}`, t('Parcela reaberta.'))
  }
  async function estornar(x) {
    const ultimo = (x.p.recebimentos || []).at(-1)
    if (!ultimo) return
    // um recebimento que quitou várias parcelas foi dividido em partes ("id-1", "id-2"...): o estorno desfaz todas
    const base = /-\d+$/.test(ultimo.id) ? ultimo.id.replace(/-\d+$/, '') : null
    const doMesmo = (r) => r.id === ultimo.id || (base && r.id.startsWith(base + '-'))
    const total = r2(x.v.fiado.parcelas.reduce((s, p) => s + (p.recebimentos || []).filter(doMesmo).reduce((a, r) => a + (+r.valor || 0), 0), 0))
    if (!(await confirmar(t('Estornar o último recebimento de {valor} ({data})? Ele sai do caixa e a parcela volta a ficar em aberto.', { valor: brl(total), data: dataBR(ultimo.dia) })))) return
    executar((A) => A.alterarParcelas(x.emp ? 'emprestimos' : 'vendas', x.v.id, (ps) => {
      const p = ps.find((y) => y.id === x.p.id)
      if ((p?.recebimentos || []).at(-1)?.id !== ultimo.id) throw new Error(t('Os recebimentos desta parcela mudaram. Confira e tente de novo.'))
      return ps.map((y) => ({ ...y, recebimentos: (y.recebimentos || []).filter((r) => !doMesmo(r)) }))
    }, acao(x, 'estorno'), `${x.v.fiado.cliente} ${x.p.n}/${x.total}: ${total}`), t('Recebimento estornado.'))
  }
  async function salvarData(e) {
    e.preventDefault()
    const x = parcelas.find((y) => y.v.id === mudandoData.vendaId && y.p.id === mudandoData.parcelaId)
    if (!x || !mudandoData.data) return setMudandoData(null)
    const ok = await gravar(x, (p) => ({ ...p, vencimento: mudandoData.data }), acao(x, 'data'),
      `${x.v.fiado.cliente} ${x.p.n}/${x.total}: ${dataBR(x.p.vencimento)} → ${dataBR(mudandoData.data)}`, t('Data alterada.'))
    if (ok) setMudandoData(null)
  }

  const mensagem = (x) => t('Olá, {cliente}! Passando para lembrar da parcela {n} de {valor}, combinada para {data}. Obrigado!', {
    cliente: String(x.v.fiado.cliente || '').split(' ')[0], n: `${x.p.n}/${x.total}`, valor: brl(x.falta + x.enc), data: dataBR(x.p.vencimento),
  })

  return (
    <section>
      <h2>{t('Cobranças')}</h2>

      <div className="cards">
        <div className="card destaque"><small>{t('A receber')}</small><b>{brl(cards.receber)}</b><small className="var">{t('{n} parcela(s) em aberto', { n: abertas.length })}</small></div>
        <div className={'card' + (cards.atrasado > 0 ? ' card-prejuizo' : '')}><small>{t('Atrasado')}</small><b className={cards.atrasado > 0 ? 'bad' : ''}>{brl(cards.atrasado)}</b><small className="var">{t('{n} parcela(s)', { n: cards.nAtrasado })}</small>{cards.encargos > 0 && <small className="var bad">{t('+ {valor} de multa e juros', { valor: brl(cards.encargos) })}</small>}</div>
        <div className="card"><small>{t('Vence em 7 dias')}</small><b>{brl(cards.semana)}</b></div>
        <div className="card"><small>{t('Não pagos (perda)')}</small><b className={cards.naoPago > 0 ? 'bad' : ''}>{cards.naoPago > 0 ? '− ' + brl(cards.naoPago) : brl(0)}</b></div>
      </div>

      <div className="config-atraso">
        <small>{textoAtraso(cfgAtraso) ? <>{t('Atraso')}: <b>{textoAtraso(cfgAtraso)}</b></> : t('Sem multa ou juros por atraso.')}</small>
        {podeConfigurar && !configurando && <button className="link pequeno" onClick={() => setConfigurando({ multaPct: String(cfgAtraso?.multaPct ?? '').replace('.', ','), jurosMesPct: String(cfgAtraso?.jurosMesPct ?? '').replace('.', ','), carenciaDias: String(cfgAtraso?.carenciaDias ?? '') })}>{t('Multa e juros por atraso')}</button>}
      </div>
      {configurando && (
        <form className="painel form-atraso" onSubmit={salvarAtraso}>
          <label>{t('Multa (%)')}<input inputMode="decimal" placeholder="0" value={configurando.multaPct} onChange={(e) => setConfigurando({ ...configurando, multaPct: e.target.value })} /></label>
          <label>{t('Juros de atraso (% ao mês)')}<input inputMode="decimal" placeholder="0" value={configurando.jurosMesPct} onChange={(e) => setConfigurando({ ...configurando, jurosMesPct: e.target.value })} /></label>
          <label>{t('Carência (dias)')}<input type="number" min="0" step="1" placeholder="0" value={configurando.carenciaDias} onChange={(e) => setConfigurando({ ...configurando, carenciaDias: e.target.value })} /></label>
          <button type="submit">{t('Salvar')}</button>
          <button type="button" className="sec" onClick={() => setConfigurando(null)}>{t('Cancelar')}</button>
          <small style={{ flex: '1 1 100%' }}>{t('A multa é cobrada uma vez, quando a carência acaba; os juros contam por dia, a partir do fim da carência. Valem para todas as compras e empréstimos. No comércio, a multa costuma ser limitada a 2%.')}</small>
        </form>
      )}

      <div className="linha-titulo">
        <input className="busca" placeholder={t('Buscar cliente, telefone ou produto...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="chips">
          {FILTROS.map((f) => <button key={f.id} className={'filtro' + (filtro === f.id ? ' ativo' : '')} onClick={() => setFiltro(f.id)}>{t(f.nome)}</button>)}
        </div>
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr><th>{t('Próximo vencimento')}</th><th>{t('Cliente')}</th><th>{t('Motivo')}</th><th className="n">{t('Parcelas')}</th><th className="n">{t('Próxima')}</th><th className="n">{t('Falta (total)')}</th><th>{t('Situação')}</th><th></th></tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="8" className="vazio">{parcelas.length ? t('Nada neste filtro.') : t('Nenhuma venda fiado ainda. Na aba Novo Registro, escolha "Fiado" ou divida o pagamento.')}</td></tr>}
            {lista.map((g) => {
              const x = g.proxima
              const s = SITUACOES[g.situacao]
              const m = motivo(g)
              const aberto = !!abertos[g.v.id]
              return (
                <Fragment key={g.v.id}>
                  <tr className={'linha-grupo' + (g.situacao === 'atrasada' ? ' linha-prejuizo' : '')}>
                    <td>{celulaData(x)}</td>
                    <td>{g.v.fiado.cliente}{g.v.fiado.telefone && <small className="sub-linha">{g.v.fiado.telefone}</small>}</td>
                    <td className="quebra">
                      <b className="motivo">{m.titulo}</b>
                      <small className="sub-linha">{m.detalhe} · <button className="link pequeno" onClick={() => { try { sessionStorage.setItem('vendas-dia', g.v.dia) } catch { /* sem acesso */ } irPara?.('vendas') }}>{dataBR(g.v.dia)}</button></small>
                    </td>
                    <td className="n">
                      {g.parcelas.length > 1
                        ? <button className="link pequeno" onClick={() => setAbertos({ ...abertos, [g.v.id]: !aberto })} title={t('Ver todas as parcelas')}>{t('{pagas} de {total} pagas', { pagas: g.pagas, total: g.parcelas.length })} {aberto ? '▴' : '▾'}</button>
                        : t('Parcela única')}
                    </td>
                    <td className="n">{g.abertas.length ? <>{brl(x.falta)}<small className="sub-linha">{x.p.n}/{x.total}</small>{x.enc > 0 && <small className="sub-linha bad">{t('+ {valor} de atraso ({n} dias)', { valor: brl(x.enc), n: x.atraso.dias })}</small>}</> : '-'}</td>
                    <td className="n"><b>{g.falta > 0 ? brl(g.falta + g.encargo) : '-'}</b>{g.encargo > 0 && <small className="sub-linha bad">{t('com {valor} de atraso', { valor: brl(g.encargo) })}</small>}</td>
                    <td><span className={s.classe}>{t(s.nome)}</span></td>
                    <td className="n acoes-fiado">{acoes(x)}</td>
                  </tr>
                  {aberto && g.parcelas.map((y) => {
                    const sy = SITUACOES[y.situacao]
                    return (
                      <tr key={y.p.id} className={'linha-parcela' + (y.situacao === 'atrasada' ? ' linha-prejuizo' : '')}>
                        <td>{celulaData(y)}</td>
                        <td colSpan="2"><small>{t('Parcela {n} de {total}', { n: y.p.n, total: y.total })}</small></td>
                        <td className="n"><small>{brl(y.p.valor)}</small>{y.recebido > 0 && <small className="sub-linha ok">{t('recebido {valor}', { valor: brl(y.recebido) })}</small>}</td>
                        <td className="n"></td>
                        <td className="n">{y.situacao === 'paga' ? '-' : brl(y.falta + y.enc)}{y.enc > 0 && <small className="sub-linha bad">{t('+ {valor} de atraso ({n} dias)', { valor: brl(y.enc), n: y.atraso.dias })}</small>}</td>
                        <td><span className={sy.classe}>{t(sy.nome)}</span></td>
                        <td className="n acoes-fiado">{acoes(y)}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p><small>{t('"Recebeu" entra no caixa na data do recebimento. O que o cliente não pagar ("Não pagou") sai do lucro como perda.')}</small></p>
    </section>
  )

  // vencimento (ou o campo para mudar a data)
  function celulaData(x) {
    return mudandoData?.vendaId === x.v.id && mudandoData.parcelaId === x.p.id ? (
      <form className="inline-form" onSubmit={salvarData}>
        <input type="date" value={mudandoData.data} onChange={(e) => setMudandoData({ ...mudandoData, data: e.target.value })} />
        <button type="submit" className="edit">{t('Salvar')}</button>
        <button type="button" className="sec" onClick={() => setMudandoData(null)}>×</button>
      </form>
    ) : dataBR(x.p.vencimento)
  }

  // botões de uma parcela
  function acoes(x) {
    const whats = ['aberta', 'vence_hoje', 'atrasada'].includes(x.situacao) && linkWhats(x.v.fiado.telefone, mensagem(x))
    const primeira = grupos.find((g) => g.v.id === x.v.id)?.abertas[0]
    const daVez = primeira?.p.id === x.p.id // as outras esperam: não dá para pagar a de março com a de fevereiro em aberto
    return (
      <>
                    {recebendo?.vendaId === x.v.id && recebendo.parcelaId === x.p.id ? (
                      <form className="inline-form" onSubmit={confirmarRecebimento}>
                        <input inputMode="decimal" value={recebendo.valor} onChange={(e) => setRecebendo({ ...recebendo, valor: e.target.value })} style={{ width: 90 }} />
                        <select value={recebendo.forma} onChange={(e) => setRecebendo({ ...recebendo, forma: e.target.value })}>
                          {PAGAMENTOS.map((f) => <option key={f} value={f}>{t(f)}</option>)}
                        </select>
                        <button type="submit">{t('Confirmar')}</button>
                        <button type="button" className="sec" onClick={() => setRecebendo(null)}>×</button>
                        {x.enc > 0 && (
                          <label className="check perdoar">
                            <input type="checkbox" checked={!!recebendo.perdoar} onChange={(e) => setRecebendo({ ...recebendo, perdoar: e.target.checked, valor: String(r2(x.falta + (e.target.checked ? 0 : x.enc))).replace('.', ',') })} />
                            {t('Perdoar multa e juros ({valor})', { valor: brl(x.enc) })}
                          </label>
                        )}
                      </form>
                    ) : (
                      <>
                        {['aberta', 'vence_hoje', 'atrasada'].includes(x.situacao) && !daVez && (
                          <><small className="aguarda">{t('depois da {n}ª', { n: primeira?.p.n })}</small>{' '}
                            <button className="sec mini" title={t('Mudar data')} onClick={() => setMudandoData({ vendaId: x.v.id, parcelaId: x.p.id, data: x.p.vencimento })}>📅</button></>
                        )}
                        {['aberta', 'vence_hoje', 'atrasada'].includes(x.situacao) && daVez && (
                          <>
                            <button className="edit" title={t('O valor que passar desta parcela quita as próximas')} onClick={() => setRecebendo({ vendaId: x.v.id, parcelaId: x.p.id, valor: String(r2(x.falta + x.enc)).replace('.', ','), forma: 'PIX', perdoar: false })}>{t('Recebeu')}</button>{' '}
                            <button className="del" onClick={() => naoPagou(x)}>{t('Não pagou')}</button>{' '}
                            <button className="sec mini" title={t('Mudar data')} onClick={() => setMudandoData({ vendaId: x.v.id, parcelaId: x.p.id, data: x.p.vencimento })}>📅</button>{' '}
                            {whats && <a className="botao-whats" href={whats} target="_blank" rel="noreferrer" title={t('Lembrar no WhatsApp')}>WhatsApp</a>}
                          </>
                        )}
                        {x.situacao === 'nao_paga' && <button className="sec" onClick={() => reabrir(x)}>{t('Reabrir')}</button>}
                        {x.recebido > 0 && <>{' '}<button className="link pequeno" onClick={() => estornar(x)}>{t('Estornar')}</button></>}
                      </>
                    )}
      </>
    )
  }
}
