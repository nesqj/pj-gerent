import { useState } from 'react'
import { t } from '../i18n.js'
import { brl, dataBR, hoje, num, PAGAMENTOS, pct, lucroDe, fatorDesconto, lucroVenda, pagamentosDaVenda, lucroEmprestimo, perdasNaoPago, somaPerdas, resumoFiado } from '../utils.js'
import { podeFazer } from '../armazenamento.js'
import { GraficoLinhas } from './Graficos.jsx'

// ---------- Datas ----------
const paraDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deDia = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d) }
const somarDias = (s, n) => { const d = deDia(s); d.setDate(d.getDate() + n); return paraDia(d) }
const diasEntre = (a, b) => Math.round((deDia(b) - deDia(a)) / 86400000) + 1
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function periodoDe(tipo, ini, fim) {
  const h = hoje()
  const d = deDia(h)
  switch (tipo) {
    case 'hoje': return [h, h]
    case '7': return [somarDias(h, -6), h]
    case '30': return [somarDias(h, -29), h]
    case 'mes': return [paraDia(new Date(d.getFullYear(), d.getMonth(), 1)), h]
    case 'mesPassado': return [paraDia(new Date(d.getFullYear(), d.getMonth() - 1, 1)), paraDia(new Date(d.getFullYear(), d.getMonth(), 0))]
    default: return ini <= fim ? [ini, fim] : [fim, ini]
  }
}

const PERIODOS = [
  { id: 'hoje', nome: 'Hoje' }, // nomes traduzidos na tela com t()
  { id: '7', nome: '7 dias' },
  { id: '30', nome: '30 dias' },
  { id: 'mes', nome: 'Este mês' },
  { id: 'mesPassado', nome: 'Mês passado' },
  { id: 'perso', nome: 'Personalizado' },
]

// ---------- Números do período ----------
const lucroVenda0 = (v) => lucroDe(v.itens, fatorDesconto(v))
function resumo(vendas) {
  let faturamento = 0, itens = 0, perdas = 0, comPrejuizo = 0, lucro = 0, naoPago = 0, jurosFiado = 0
  for (const v of vendas) {
    faturamento += v.total
    for (const i of v.itens) itens += i.qtd
    const base = lucroVenda0(v) // lucro de vender (preço − custo), sem os juros do fiado
    lucro += base.lucro
    jurosFiado += lucroVenda(v).lucro - base.lucro // juros do fiado (e multa/juros de atraso recebidos)
    if (base.perda > 0) { perdas += base.perda; comPrejuizo++ }
  }
  return {
    faturamento, lucro, itens, vendas: vendas.length, perdas, comPrejuizo, naoPago, jurosFiado: Math.round(jurosFiado * 100) / 100,
    ticket: vendas.length ? faturamento / vendas.length : 0,
    margem: faturamento ? (lucro / faturamento) * 100 : 0,
  }
}

function Variacao({ atual, anterior, pontos, semAnterior }) {
  if (semAnterior) return <small className="var">{t('sem vendas no período anterior')}</small>
  if (pontos) {
    const d = atual - anterior
    if (Math.abs(d) < 0.05) return <small className="var">{t('= igual ao período anterior')}</small>
    return <small className={'var ' + (d > 0 ? 'ok' : 'bad')}>{d > 0 ? '▲' : '▼'} {pct(Math.abs(d)).replace('%', ' p.p.')} {t('vs anterior')}</small>
  }
  if (!anterior) return <small className="var">{atual ? t('sem vendas no período anterior') : '—'}</small>
  const d = ((atual - anterior) / anterior) * 100
  if (Math.abs(d) < 0.05) return <small className="var">{t('= igual ao período anterior')}</small>
  return <small className={'var ' + (d > 0 ? 'ok' : 'bad')}>{d > 0 ? '▲' : '▼'} {pct(Math.abs(d))} {t('vs anterior')}</small>
}

// Participação (barras finas): forma de pagamento
function Participacao({ linhas, total }) {
  return (
    <div className="participacao">
      {linhas.map((l) => {
        const p = total ? (l.valor / total) * 100 : 0
        return (
          <div key={l.nome} className="part-linha">
            <span className="part-nome">{t(l.nome)}</span>
            <div className="part-trilho"><div className="part-barra" style={{ width: `${p}%` }} /></div>
            <span className="part-valor">{brl(l.valor)} <small>{pct(p)}</small></span>
          </div>
        )
      })}
    </div>
  )
}

const PRODUTOS_INICIO = 8

export default function Analise({ db }) {
  const [tipo, setTipo] = useState('30')
  const [ini, setIni] = useState(somarDias(hoje(), -29))
  const [fim, setFim] = useState(hoje())
  const [todosProdutos, setTodosProdutos] = useState(false)
  const [aba, setAba] = useState('vendas') // 'vendas' ou 'emprestimos'
  const comEmprestimos = podeFazer('emprestimo.salvo')

  const [de, ate] = periodoDe(tipo, ini, fim)
  const n = diasEntre(de, ate)
  const antDe = somarDias(de, -n), antAte = somarDias(de, -1)

  const vendas = db.vendas.filter((v) => v.dia >= de && v.dia <= ate)
  const anteriores = db.vendas.filter((v) => v.dia >= antDe && v.dia <= antAte)
  const r = resumo(vendas), ra = resumo(anteriores)
  // "Não pagou" (fiado e empréstimo): perda no dia em que foi marcado
  const perdasV = perdasNaoPago(db.vendas), perdasE = perdasNaoPago(db.emprestimos || [])
  r.naoPago = somaPerdas(perdasV, de, ate); r.lucro -= r.naoPago
  ra.naoPago = somaPerdas(perdasV, antDe, antAte); ra.lucro -= ra.naoPago
  r.margem = r.faturamento ? (r.lucro / r.faturamento) * 100 : 0
  ra.margem = ra.faturamento ? (ra.lucro / ra.faturamento) * 100 : 0
  const lucroTotal = Math.round(r.lucro * 100) / 100 // só vendas (os juros do fiado aparecem num card próprio; empréstimos na outra aba)

  // série do gráfico: por hora quando é um dia só, senão por dia (faturamento e lucro)
  let serie
  if (n === 1) {
    serie = Array.from({ length: 24 }, (_, h) => ({ rotulo: `${h}h`, hora: h, valor: 0, lucro: 0, vendas: 0 }))
    for (const v of vendas) { const h = new Date(v.data).getHours(); serie[h].valor += v.total; serie[h].lucro += lucroVenda0(v).lucro; serie[h].vendas++ }
    for (const x of perdasV) if (x.dia === de) serie[new Date(x.data).getHours()].lucro -= x.valor
  } else {
    const porDia = new Map()
    for (let i = 0; i < n; i++) { const d = somarDias(de, i); porDia.set(d, { dia: d, rotulo: dataBR(d).slice(0, 5), valor: 0, lucro: 0, vendas: 0 }) }
    for (const v of vendas) { const p = porDia.get(v.dia); if (p) { p.valor += v.total; p.lucro += lucroVenda0(v).lucro; p.vendas++ } }
    for (const x of perdasV) { const p = porDia.get(x.dia); if (p) p.lucro -= x.valor }
    serie = [...porDia.values()]
  }
  const melhorDia = n > 1 && serie.reduce((m, d) => (d.valor > (m?.valor ?? 0) ? d : m), null)

  // por forma de pagamento (só as que tiveram venda)
  const pagamentos = [...PAGAMENTOS, 'Fiado'].map((p) => ({ nome: p, valor: vendas.reduce((s, v) => s + pagamentosDaVenda(v).filter((x) => x.forma === p).reduce((a, x) => a + x.valor, 0), 0) }))
    .filter((p) => p.valor > 0).sort((a, b) => b.valor - a.valor)

  // por produto (desconto da venda dividido proporcionalmente entre os itens)
  const prod = new Map()
  for (const v of vendas) {
    const fator = 1 - (+v.descontoPct || 0) / 100
    // fiado: em aberto não entra no lucro; o que não foi pago sai do lucro proporcionalmente
    const lv = lucroVenda(v)
    const ajusteLucro = 1
    const calotePorReal = 0 // o não pago é perda do dia em que foi marcado, não do produto
    for (const i of v.itens) {
      const k = (i.produto + '|' + (i.marca || '')).toLowerCase()
      const p = prod.get(k) || { produto: i.produto, marca: i.marca, qtd: 0, faturamento: 0, lucro: 0 }
      p.qtd += i.qtd; p.faturamento += i.qtd * i.preco * fator; p.lucro += ajusteLucro * (i.qtd * (i.preco * fator - (i.custo ?? 0)) - i.qtd * i.preco * fator * calotePorReal)
      prod.set(k, p)
    }
  }
  const produtos = [...prod.values()].sort((a, b) => b.faturamento - a.faturamento)
  const visiveis = todosProdutos ? produtos : produtos.slice(0, PRODUTOS_INICIO)
  const valorLucro = (v) => <span className={v < 0 ? 'bad' : 'ok'}>{v < 0 ? '− ' + brl(-v) : brl(v)}</span>

  return (
    <section>
      <h2>{t('Análise')}</h2>

      {comEmprestimos && (
        <div className="chips modo-registro">
          <button className={'filtro' + (aba === 'vendas' ? ' ativo' : '')} onClick={() => setAba('vendas')}>{t('Vendas')}</button>
          <button className={'filtro' + (aba === 'emprestimos' ? ' ativo' : '')} onClick={() => setAba('emprestimos')}>{t('Empréstimos')}</button>
        </div>
      )}

      {/* ---------- Período ---------- */}
      <div className="filtros">
        <div className="segmentado">
          {PERIODOS.map((p) => (
            <button key={p.id} className={tipo === p.id ? 'on' : ''} onClick={() => setTipo(p.id)}>{t(p.nome)}</button>
          ))}
        </div>
        {tipo === 'perso' && (
          <div className="datas">
            <input type="date" value={ini} onChange={(e) => setIni(e.target.value || hoje())} />
            <span>{t('até')}</span>
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value || hoje())} />
          </div>
        )}
        <small>{de === ate ? dataBR(de) : t('{de} a {ate}', { de: dataBR(de), ate: dataBR(ate) })} · {t('comparado com')} {antDe === antAte ? dataBR(antDe) : t('{de} a {ate}', { de: dataBR(antDe), ate: dataBR(antAte) })}</small>
      </div>

      {aba === 'emprestimos' && comEmprestimos ? (
        <AnaliseEmprestimos db={db} de={de} ate={ate} perdasE={perdasE} />
      ) : (<>
      {/* ---------- Indicadores ---------- */}
      <div className="cards indicadores">
        <div className="card destaque"><small>{t('Faturamento')}</small><b>{brl(r.faturamento)}</b><Variacao atual={r.faturamento} anterior={ra.faturamento} /></div>
        <div className={'card' + (lucroTotal < 0 ? ' card-prejuizo' : '')}>
          <small>{lucroTotal < 0 ? t('Prejuízo estimado') : t('Lucro estimado')}</small>
          <b className={lucroTotal < 0 ? 'bad' : 'ok'}>{lucroTotal < 0 ? '− ' + brl(-lucroTotal) : brl(lucroTotal)}</b>
          <small className="var">{t('Margem')} {pct(r.margem)}</small>
          {r.naoPago > 0 && <small className="var bad">{t('fiado não pago: {valor}', { valor: brl(r.naoPago) })}</small>}
        </div>
        {r.jurosFiado !== 0 && <div className="card"><small>{t('Juros do fiado')}</small><b className="ok">{brl(r.jurosFiado)}</b></div>}
        <div className="card">
          <small>{t('Vendas')}</small><b>{r.vendas}</b>
          <small className="var">{t('Ticket médio')} {brl(r.ticket)}</small>
        </div>
      </div>

      {vendas.length === 0 ? (
        <p className="vazio">{t('Nenhuma venda neste período.')}</p>
      ) : (
        <>
          {/* ---------- Faturamento e lucro ---------- */}
          <div className="painel">
            <div className="painel-titulo">
              <h3>{n === 1 ? t('Faturamento, lucro e vendas por hora') : t('Faturamento, lucro e vendas por dia')}</h3>
              {melhorDia && melhorDia.valor > 0 && <small>{t('Melhor dia:')} <b>{dataBR(melhorDia.dia)}</b> {t('com')} {brl(melhorDia.valor)}</small>}
            </div>
            <GraficoLinhas
              serie={serie}
              rotuloDica={(d) => (n === 1 ? t('{data} às {hora}', { data: dataBR(de), hora: d.rotulo }) : `${t(DIAS_SEMANA[deDia(d.dia).getDay()])}, ${dataBR(d.dia)}`)}
            />
          </div>

          <div className="duas-colunas">
            {/* ---------- Produtos ---------- */}
            <div className="painel">
              <h3 className="painel-titulo">{t('Produtos')}</h3>
              <div className="lista-produtos">
                <div className="lp-linha lp-cabecalho"><span>{t('Produto')}</span><span>{t('Qtd.')}</span><span>{t('Faturamento')}</span><span>{t('Lucro')}</span></div>
                {visiveis.map((p) => (
                  <div key={p.produto + p.marca} className="lp-linha">
                    <span className="lp-nome">{p.produto}{p.marca ? <small> · {p.marca}</small> : null}</span>
                    <span>{p.qtd}</span>
                    <span>{brl(p.faturamento)}</span>
                    <span>{valorLucro(p.lucro)}</span>
                  </div>
                ))}
              </div>
              {produtos.length > PRODUTOS_INICIO && (
                <button className="link pequeno" onClick={() => setTodosProdutos(!todosProdutos)}>
                  {todosProdutos ? t('Mostrar menos') : t('Ver todos ({n})', { n: produtos.length })}
                </button>
              )}
            </div>
            {/* ---------- Pagamentos ---------- */}
            <div className="painel">
              <h3 className="painel-titulo">{t('Por forma de pagamento')}</h3>
              <Participacao linhas={pagamentos} total={r.faturamento} />
            </div>
          </div>
          <small>{t('Lucro estimado = preço vendido − custo do produto no momento da venda.')}</small>
        </>
      )}
      </>)}
    </section>
  )
}

// ---------- Análise dos empréstimos (feitos no período) ----------
// Resultado de um empréstimo já fechado (tudo pago, ou o resto marcado "Não pagou"): o que voltou − o que foi emprestado.
// Em aberto: null.
function resultadoEmprestimo(e) {
  if (resumoFiado(e)?.pendente) return null
  const voltou = (e.fiado?.parcelas || []).reduce((a, p) => a + (p.recebimentos || []).reduce((b, r) => b + (+r.valor || 0) + (+r.encargo || 0), 0), 0)
  return Math.round((voltou - (+e.valor || 0)) * 100) / 100
}

function AnaliseEmprestimos({ db, de, ate, perdasE }) {
  const todos = db.emprestimos || []
  const lista = todos.filter((e) => e.dia >= de && e.dia <= ate).sort((a, b) => b.data - a.data)
  const emprestado = lista.reduce((s, e) => s + (+e.valor || 0), 0)
  const juros = lista.reduce((s, e) => s + lucroEmprestimo(e).lucro, 0)
  const naoPago = somaPerdas(perdasE, de, ate) // marcado "Não pagou" no período (de qualquer empréstimo)
  // Pendências no fim do período: tudo o que foi emprestado até o fim do período e ainda não tinha voltado até essa data
  // (inclui o que foi marcado "Não pagou"). Passa de um mês para o outro e só diminui no mês em que o cliente paga.
  const pendencias = Math.round(todos.filter((e) => e.dia <= ate).reduce((s, e) => s + (e.fiado?.parcelas || []).reduce((a, p) =>
    a + Math.max(0, (+p.valor || 0) - (p.recebimentos || []).filter((r) => (r.dia || '') <= ate).reduce((b, r) => b + (+r.valor || 0), 0)), 0), 0) * 100) / 100
  const lucro = Math.round((juros - naoPago) * 100) / 100
  // dinheiro que voltou no período (de qualquer empréstimo), com multa/juros de atraso
  const recebido = todos.reduce((s, e) => s + (e.fiado?.parcelas || []).reduce((a, p) => a + (p.recebimentos || [])
    .filter((r) => r.dia >= de && r.dia <= ate).reduce((b, r) => b + (+r.valor || 0) + (+r.encargo || 0), 0), 0), 0)
  // por cliente: soma o resultado dos empréstimos já fechados
  const mapa = new Map()
  for (const e of lista) {
    const res = resultadoEmprestimo(e)
    if (res == null) continue
    const k = e.fiado?.clienteId || e.fiado?.cliente || '?'
    const c = mapa.get(k) || { nome: e.fiado?.cliente || '-', n: 0, emprestado: 0, resultado: 0 }
    c.n++; c.emprestado += +e.valor || 0; c.resultado = Math.round((c.resultado + res) * 100) / 100
    mapa.set(k, c)
  }
  const porCliente = [...mapa.values()].sort((a, b) => b.resultado - a.resultado)
  const situacao = (e) => {
    const f = resumoFiado(e)
    if (!f) return { nome: 'Pago', classe: 'ok' }
    if (f.pendente) return { nome: 'Em aberto', classe: 'warn' }
    if (f.naoPago > 0) return { nome: 'Não pagou', classe: 'bad' }
    return { nome: 'Pago', classe: 'ok' }
  }
  return (
    <>
      <div className="cards indicadores">
        <div className="card"><small>{t('Emprestado')}</small><b>{brl(emprestado)}</b><small className="var">{t('{n} empréstimo(s)', { n: lista.length })}</small></div>
        <div className={'card' + (lucro < 0 ? ' card-prejuizo' : ' destaque')}>
          <small>{lucro < 0 ? t('Prejuízo estimado') : t('Lucro (juros)')}</small>
          <b className={lucro < 0 ? 'bad' : 'ok'}>{lucro < 0 ? '− ' + brl(-lucro) : brl(lucro)}</b>
        </div>
        <div className="card"><small>{t('Recebido no período')}</small><b>{brl(recebido)}</b></div>
        <div className="card"><small>{t('Pendências')}</small><b>{brl(pendencias)}</b></div>
      </div>
      {lista.length === 0 ? (
        <p className="vazio">{t('Nenhum empréstimo neste período.')}</p>
      ) : (
        <div className="tw">
          <table>
            <thead><tr><th>{t('Data')}</th><th>{t('Cliente')}</th><th className="n">{t('Emprestado')}</th><th className="n">{t('Juros')}</th><th className="n">{t('Parcelas pagas')}</th><th>{t('Situação')}</th><th className="n">{t('Resultado')}</th></tr></thead>
            <tbody>
              {lista.map((e) => {
                const ps = e.fiado?.parcelas || []
                const pagas = ps.filter((p) => (+p.valor || 0) - (p.recebimentos || []).reduce((a, r) => a + (+r.valor || 0), 0) <= 0.004).length
                const s = situacao(e)
                const res = resultadoEmprestimo(e)
                return (
                  <tr key={e.id}>
                    <td>{dataBR(e.dia)}</td>
                    <td>{e.fiado?.cliente}<small className="sub-linha">{t('{p}% ao mês', { p: num(e.jurosPct || 0, 2) })}</small></td>
                    <td className="n">{brl(e.valor)}</td>
                    <td className="n ok">{brl(lucroEmprestimo(e).lucro)}</td>
                    <td className="n">{pagas}/{ps.length}</td>
                    <td><span className={s.classe}>{t(s.nome)}</span></td>
                    <td className="n">{res == null ? <small>{t('em aberto')}</small> : <b className={res < 0 ? 'bad' : 'ok'}>{res < 0 ? '− ' + brl(-res) : brl(res)}</b>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {porCliente.length > 0 && (
        <div className="painel">
          <h3 className="painel-titulo">{t('Resultado por cliente (empréstimos fechados)')}</h3>
          <div className="lista-produtos">
            <div className="lp-linha lp-cabecalho"><span>{t('Cliente')}</span><span>{t('Empréstimos')}</span><span>{t('Emprestado')}</span><span>{t('Resultado')}</span></div>
            {porCliente.map((c) => (
              <div key={c.nome} className="lp-linha">
                <span className="lp-nome">{c.nome}</span>
                <span>{c.n}</span>
                <span>{brl(c.emprestado)}</span>
                <span className={c.resultado < 0 ? 'bad' : 'ok'}>{c.resultado < 0 ? '− ' + brl(-c.resultado) : brl(c.resultado)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <small>{t('Lucro (juros) = juros dos empréstimos feitos no período − o que foi marcado "Não pagou" no período. Resultado = o que voltou (com multa e juros de atraso) − o que foi emprestado, quando o empréstimo fecha.')}</small>
    </>
  )
}

