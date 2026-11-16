import { useState } from 'react'
import { t } from '../i18n.js'
import { brl, dataBR, faturamentoVenda, hoje, num, PAGAMENTOS, pct, lucroDe, fatorDesconto, pagamentosDaVenda, lucroEmprestimo, resumoFiado, encargoAtraso, pagoNaHora, totalFiado } from '../utils.js'
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

// Lucro das vendas pelo que foi pago: a parte paga na hora conta no dia da venda; no fiado, cada parcela paga traz
// a % do lucro da venda proporcional ao que entrou (com os juros combinados do fiado). O que não foi pago não traz lucro.
// Devolve [{ dia, data, lucro }] para somar por período, dia ou hora.
function lucrosPagos(todas) {
  const ev = []
  for (const v of todas) {
    const aReceber = pagoNaHora(v) + totalFiado(v)
    if (!(aReceber > 0)) continue
    const porReal = (lucroVenda0(v).lucro + (+v.fiado?.juros || 0)) / aReceber // lucro de cada real que entra (os juros do fiado são lucro inteiro)
    const naHora = pagoNaHora(v)
    if (naHora > 0) ev.push({ dia: v.dia, data: v.data, lucro: naHora * porReal })
    for (const p of v.fiado?.parcelas || []) for (const r of p.recebimentos || []) {
      if (+r.valor > 0) ev.push({ dia: r.dia, data: r.data || v.data, lucro: +r.valor * porReal })
      if (+r.encargo > 0) ev.push({ dia: r.dia, data: r.data || v.data, lucro: +r.encargo }) // multa e juros de atraso: lucro inteiro
    }
  }
  return ev
}
const somaLucros = (ev, de, ate) => Math.round(ev.filter((x) => x.dia >= de && x.dia <= ate).reduce((s, x) => s + x.lucro, 0) * 100) / 100

// faturamento, nº de vendas e ticket médio do período (o lucro vem de lucrosPagos)
function resumo(vendas) {
  const faturamento = vendas.reduce((s, v) => s + faturamentoVenda(v), 0)
  return { faturamento, vendas: vendas.length, ticket: vendas.length ? faturamento / vendas.length : 0 }
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
  // "Não pagou" do empréstimo: perda no dia em que foi marcado
  const evLucro = lucrosPagos(db.vendas)
  r.lucro = somaLucros(evLucro, de, ate)
  ra.lucro = somaLucros(evLucro, antDe, antAte)
  r.margem = r.faturamento ? (r.lucro / r.faturamento) * 100 : 0
  const lucroTotal = Math.round(r.lucro * 100) / 100
  // outras despesas: o que saiu do caixa como "Despesa da loja" (luz, aluguel, insumos...). Retirada pessoal não conta.
  const outrasDespesas = (a, b) => Math.round((db.movCaixa || []).filter((m) => m.tipo === 'retirar' && m.categoria === 'despesa' && m.dia >= a && m.dia <= b)
    .reduce((s, m) => s + (+m.valor || 0), 0) * 100) / 100
  const outras = outrasDespesas(de, ate), outrasAnt = outrasDespesas(antDe, antAte)
  // lucro líquido: o que sobrou de verdade (o custo dos produtos já sai do lucro bruto)
  const resultado = Math.round((lucroTotal - outras) * 100) / 100
  const resultadoAnt = Math.round((ra.lucro - outrasAnt) * 100) / 100

  // série do gráfico: por hora quando é um dia só, senão por dia (faturamento e lucro)
  let serie
  if (n === 1) {
    serie = Array.from({ length: 24 }, (_, h) => ({ rotulo: `${h}h`, hora: h, valor: 0, lucro: 0, vendas: 0 }))
    for (const v of vendas) { const h = new Date(v.data).getHours(); serie[h].valor += faturamentoVenda(v); serie[h].vendas++ }
    for (const x of evLucro) if (x.dia === de) serie[new Date(x.data).getHours()].lucro += x.lucro
  } else {
    const porDia = new Map()
    for (let i = 0; i < n; i++) { const d = somarDias(de, i); porDia.set(d, { dia: d, rotulo: dataBR(d).slice(0, 5), valor: 0, lucro: 0, vendas: 0 }) }
    for (const v of vendas) { const p = porDia.get(v.dia); if (p) { p.valor += faturamentoVenda(v); p.vendas++ } }
    for (const x of evLucro) { const p = porDia.get(x.dia); if (p) p.lucro += x.lucro }
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
    for (const i of v.itens) {
      const k = (i.produto + '|' + (i.marca || '')).toLowerCase()
      const p = prod.get(k) || { produto: i.produto, marca: i.marca, qtd: 0, faturamento: 0, lucro: 0 }
      p.qtd += i.qtd; p.faturamento += i.qtd * i.preco * fator; p.lucro += i.qtd * (i.preco * fator - (i.custo ?? 0))
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
        <AnaliseEmprestimos db={db} de={de} ate={ate} n={n} />
      ) : (<>
      {/* ---------- Indicadores ---------- */}
      <div className="cards indicadores">
        <div className="card destaque"><small>{t('Faturamento')}</small><b>{brl(r.faturamento)}</b><Variacao atual={r.faturamento} anterior={ra.faturamento} /></div>
        <div className={'card' + (lucroTotal < 0 ? ' card-prejuizo' : '')}>
          <small>{lucroTotal < 0 ? t('Prejuízo bruto') : t('Lucro bruto')}</small>
          <b className={lucroTotal < 0 ? 'bad' : 'ok'}>{lucroTotal < 0 ? '− ' + brl(-lucroTotal) : brl(lucroTotal)}</b>
          <small className="var">{t('Margem')} {pct(r.margem)}</small>
        </div>
        <div className="card">
          <small>{t('Vendas')}</small><b>{r.vendas}</b>
          <small className="var">{t('Ticket médio')} {brl(r.ticket)}</small>
        </div>
        <div className="card">
          <small>{t('Outras despesas')}</small><b>{brl(outras)}</b>
          {outrasAnt > 0 && <small className="var">{t('período anterior: {valor}', { valor: brl(outrasAnt) })}</small>}
        </div>
        <div className="card">
          <small>{t('Lucro líquido')}</small>
          <b className={resultado < 0 ? 'bad' : 'ok'}>{resultado < 0 ? '− ' + brl(-resultado) : brl(resultado)}</b>
          <small className="var">{t('lucro − outras despesas')}{resultadoAnt !== 0 ? ' · ' + t('anterior: {valor}', { valor: (resultadoAnt < 0 ? '− ' : '') + brl(Math.abs(resultadoAnt)) }) : ''}</small>
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
          <small>{t('Lucro bruto = preço vendido − custo. No fiado, conta a parte do lucro (com os juros) de cada parcela quando ela é paga, mais a multa e os juros de atraso recebidos. Lucro líquido = lucro bruto − outras despesas.')}</small>
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

function AnaliseEmprestimos({ db, de, ate, n }) {
  const todos = db.emprestimos || []
  const lista = todos.filter((e) => e.dia >= de && e.dia <= ate).sort((a, b) => b.data - a.data)
  const emprestado = lista.reduce((s, e) => s + (+e.valor || 0), 0)
  // Lucro igual ao das vendas fiado: entra quando o cliente paga. Cada parcela recebida traz a parte dos juros
  // proporcional ao que entrou (ex.: 1.000 com 300 de juros → de cada R$ 1.300 que voltam, R$ 300 são lucro);
  // multa e juros de atraso entram inteiros. O que não foi pago não traz lucro.
  const recebimentos = todos.flatMap((e) => {
    const porReal = +e.total > 0 ? ((+e.total || 0) - (+e.valor || 0)) / +e.total : 0
    return (e.fiado?.parcelas || []).flatMap((p) => (p.recebimentos || []).filter((r) => r.dia >= de && r.dia <= ate)
      .map((r) => ({ e, dia: r.dia, data: r.data || e.data, forma: r.forma || 'Dinheiro', valor: (+r.valor || 0) + (+r.encargo || 0), lucro: (+r.valor || 0) * porReal + (+r.encargo || 0) })))
  })
  const lucroEmp = recebimentos.reduce((s, x) => s + x.lucro, 0)
  // Pendências no fim do período: tudo o que foi emprestado até o fim do período e ainda não tinha voltado até essa data
  // (inclui o que foi marcado "Não pagou"). Passa de um mês para o outro e só diminui no mês em que o cliente paga.
  // Com multa e juros de atraso configurados, a parcela atrasada aumenta a pendência (calculado como estava no fim do período).
  const fimPend = ate < hoje() ? ate : hoje()
  const pendencias = Math.round(todos.filter((e) => e.dia <= ate).reduce((s, e) => s + (e.fiado?.parcelas || []).reduce((a, p) => {
    // a parcela como estava no fim do período: só os recebimentos até lá; "Não pagou" só se já tinha sido marcado
    const naData = { ...p, recebimentos: (p.recebimentos || []).filter((r) => (r.dia || '') <= ate), naoPaga: !!p.naoPaga && (p.naoPagaEm?.dia || '') <= ate }
    const falta = Math.max(0, (+p.valor || 0) - naData.recebimentos.reduce((b, r) => b + (+r.valor || 0), 0))
    return a + falta + encargoAtraso(naData, db.config?.atraso, fimPend).total
  }, 0), 0) * 100) / 100
  const lucro = Math.round(lucroEmp * 100) / 100
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

  // gráfico: emprestado (linha azul), lucro recebido (linha verde) e nº de empréstimos (colunas), por hora ou por dia
  let serie
  if (n === 1) {
    serie = Array.from({ length: 24 }, (_, h) => ({ rotulo: `${h}h`, valor: 0, lucro: 0, vendas: 0 }))
    for (const e of lista) { const h = new Date(e.data).getHours(); serie[h].valor += +e.valor || 0; serie[h].vendas++ }
    for (const x of recebimentos) serie[new Date(x.data).getHours()].lucro += x.lucro
  } else {
    const porDia = new Map()
    for (let i = 0; i < n; i++) { const d = somarDias(de, i); porDia.set(d, { dia: d, rotulo: dataBR(d).slice(0, 5), valor: 0, lucro: 0, vendas: 0 }) }
    for (const e of lista) { const p = porDia.get(e.dia); if (p) { p.valor += +e.valor || 0; p.vendas++ } }
    for (const x of recebimentos) { const p = porDia.get(x.dia); if (p) p.lucro += x.lucro }
    serie = [...porDia.values()]
  }
  const maiorDia = n > 1 && serie.reduce((m, d) => (d.valor > (m?.valor ?? 0) ? d : m), null)
  const temMovimento = lista.length > 0 || recebimentos.length > 0

  // clientes do período: quanto pegou emprestado e quanto de lucro (juros) já voltou dele no período
  const cli = new Map()
  const doCliente = (e) => { const k = e.fiado?.clienteId || e.fiado?.cliente || '?'; if (!cli.has(k)) cli.set(k, { nome: e.fiado?.cliente || '-', n: 0, emprestado: 0, recebido: 0, lucro: 0 }); return cli.get(k) }
  for (const e of lista) { const c = doCliente(e); c.n++; c.emprestado += +e.valor || 0 }
  for (const x of recebimentos) { const c = doCliente(x.e); c.recebido += x.valor; c.lucro += x.lucro }
  const clientes = [...cli.values()].sort((a, b) => b.lucro - a.lucro || b.emprestado - a.emprestado)

  // por forma de recebimento (o que voltou no período)
  const formas = [...PAGAMENTOS].map((f) => ({ nome: f, valor: recebimentos.filter((x) => x.forma === f).reduce((s, x) => s + x.valor, 0) }))
    .filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor)
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
        <div className="card destaque">
          <small>{t('Lucro (juros)')}</small>
          <b className={lucro < 0 ? 'bad' : 'ok'}>{lucro < 0 ? '− ' + brl(-lucro) : brl(lucro)}</b>
        </div>
        <div className="card"><small>{t('Recebido no período')}</small><b>{brl(recebido)}</b></div>
        <div className="card"><small>{t('Pendências')}</small><b>{brl(pendencias)}</b></div>
      </div>
      {temMovimento && (
        <>
          <div className="painel">
            <div className="painel-titulo">
              <h3>{n === 1 ? t('Emprestado e lucro por hora') : t('Emprestado e lucro por dia')}</h3>
              {maiorDia && maiorDia.valor > 0 && <small>{t('Mais emprestado:')} <b>{dataBR(maiorDia.dia)}</b> {t('com')} {brl(maiorDia.valor)}</small>}
            </div>
            <GraficoLinhas serie={serie} nomes={{ valor: 'Emprestado', lucro: 'Lucro', qtd: 'Empréstimos', eixo: 'empréstimos' }}
              rotuloDica={(d) => (n === 1 ? t('{data} às {hora}', { data: dataBR(de), hora: d.rotulo }) : `${t(DIAS_SEMANA[deDia(d.dia).getDay()])}, ${dataBR(d.dia)}`)} />
          </div>
          <div className="duas-colunas">
            <div className="painel">
              <h3 className="painel-titulo">{t('Clientes')}</h3>
              <div className="lista-produtos">
                <div className="lp-linha lp-cabecalho"><span>{t('Cliente')}</span><span>{t('Qtd.')}</span><span>{t('Emprestado')}</span><span>{t('Lucro')}</span></div>
                {clientes.map((c) => (
                  <div key={c.nome} className="lp-linha">
                    <span className="lp-nome">{c.nome}</span>
                    <span>{c.n}</span>
                    <span>{brl(c.emprestado)}</span>
                    <span className="ok">{brl(c.lucro)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="painel">
              <h3 className="painel-titulo">{t('Por forma de recebimento')}</h3>
              {formas.length ? <Participacao linhas={formas} total={recebido} /> : <p className="vazio">{t('Nada recebido no período.')}</p>}
            </div>
          </div>
        </>
      )}
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
      <small>{t('Lucro (juros) = a parte dos juros de cada parcela recebida no período, mais a multa e os juros de atraso recebidos (igual às vendas fiado). Resultado = o que voltou − o que foi emprestado, quando o empréstimo fecha.')}</small>
    </>
  )
}
