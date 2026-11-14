import { useState } from 'react'
import { t } from '../i18n.js'
import { brl, dataBR, hoje, num, PAGAMENTOS, pct, lucroVenda } from '../utils.js'
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
function resumo(vendas) {
  let faturamento = 0, custo = 0, itens = 0, perdas = 0, comPrejuizo = 0
  for (const v of vendas) {
    faturamento += v.total
    for (const i of v.itens) { custo += (i.custo ?? 0) * i.qtd; itens += i.qtd }
    const p = lucroVenda(v).perda
    if (p > 0) { perdas += p; comPrejuizo++ }
  }
  const lucro = faturamento - custo
  return {
    faturamento, lucro, itens, vendas: vendas.length, perdas, comPrejuizo,
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

  const [de, ate] = periodoDe(tipo, ini, fim)
  const n = diasEntre(de, ate)
  const antDe = somarDias(de, -n), antAte = somarDias(de, -1)

  const vendas = db.vendas.filter((v) => v.dia >= de && v.dia <= ate)
  const anteriores = db.vendas.filter((v) => v.dia >= antDe && v.dia <= antAte)
  const r = resumo(vendas), ra = resumo(anteriores)

  // série do gráfico: por hora quando é um dia só, senão por dia (faturamento e lucro)
  let serie
  if (n === 1) {
    serie = Array.from({ length: 24 }, (_, h) => ({ rotulo: `${h}h`, hora: h, valor: 0, lucro: 0, vendas: 0 }))
    for (const v of vendas) { const h = new Date(v.data).getHours(); serie[h].valor += v.total; serie[h].lucro += lucroVenda(v).lucro; serie[h].vendas++ }
  } else {
    const porDia = new Map()
    for (let i = 0; i < n; i++) { const d = somarDias(de, i); porDia.set(d, { dia: d, rotulo: dataBR(d).slice(0, 5), valor: 0, lucro: 0, vendas: 0 }) }
    for (const v of vendas) { const p = porDia.get(v.dia); if (p) { p.valor += v.total; p.lucro += lucroVenda(v).lucro; p.vendas++ } }
    serie = [...porDia.values()]
  }
  const melhorDia = n > 1 && serie.reduce((m, d) => (d.valor > (m?.valor ?? 0) ? d : m), null)

  // por forma de pagamento (só as que tiveram venda)
  const pagamentos = PAGAMENTOS.map((p) => ({ nome: p, valor: vendas.filter((v) => v.pagamento === p).reduce((s, v) => s + v.total, 0) }))
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
  const valorLucro = (v) => <span className={v < 0 ? 'bad' : ''}>{v < 0 ? '− ' + brl(-v) : brl(v)}</span>

  return (
    <section>
      <h2>{t('Análise')}</h2>

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

      {/* ---------- Indicadores ---------- */}
      <div className="cards indicadores">
        <div className="card destaque"><small>{t('Faturamento')}</small><b>{brl(r.faturamento)}</b><Variacao atual={r.faturamento} anterior={ra.faturamento} /></div>
        <div className={'card' + (r.lucro < 0 ? ' card-prejuizo' : '')}>
          <small>{r.lucro < 0 ? t('Prejuízo estimado') : t('Lucro estimado')}</small>
          <b className={r.lucro < 0 ? 'bad' : ''}>{r.lucro < 0 ? '− ' + brl(-r.lucro) : brl(r.lucro)}</b>
          <small className="var">{t('Margem')} {pct(r.margem)}</small>
        </div>
        <div className="card">
          <small>{t('Vendas')}</small><b>{r.vendas}</b>
          <small className="var">{t('Ticket médio')} {brl(r.ticket)}</small>
        </div>
        {r.perdas > 0 && (
          <div className="card card-prejuizo">
            <small>{t('Perdas')}</small><b className="bad">− {brl(r.perdas)}</b>
            <small>{t('{n} venda(s) com item abaixo do custo', { n: r.comPrejuizo })}</small>
          </div>
        )}
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
    </section>
  )
}
