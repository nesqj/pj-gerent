import { useState } from 'react'
import { t } from '../i18n.js'
import { brl, dataBR, hoje, num, PAGAMENTOS, pct, lucroVenda } from '../utils.js'
import { Anel, AnelPontilhado, BarrasSegmentadas, CalendarioCalor, ColunasDegrade, GraficoArea, Sparkline } from './Graficos.jsx'

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

export default function Analise({ db }) {
  const [tipo, setTipo] = useState('30')
  const [ini, setIni] = useState(somarDias(hoje(), -29))
  const [fim, setFim] = useState(hoje())
  const [ordem, setOrdem] = useState('faturamento')

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
  const faturamentoPorDia = new Map()
  for (const v of vendas) faturamentoPorDia.set(v.dia, (faturamentoPorDia.get(v.dia) || 0) + v.total)
  const melhorDia = n > 1 && serie.reduce((m, d) => (d.valor > (m?.valor ?? 0) ? d : m), null)

  // por forma de pagamento
  const pagamentos = PAGAMENTOS.map((p) => ({ nome: p, valor: vendas.filter((v) => v.pagamento === p).reduce((s, v) => s + v.total, 0) }))
    .sort((a, b) => b.valor - a.valor)

  // por dia da semana
  const semana = DIAS_SEMANA.map((nome) => ({ nome, valor: 0 }))
  for (const v of vendas) semana[deDia(v.dia).getDay()].valor += v.total

  // por produto e por marca
  const prod = new Map(), marca = new Map()
  for (const v of vendas) {
    // desconto da venda dividido proporcionalmente entre os itens
    const fator = 1 - (+v.descontoPct || 0) / 100
    for (const i of v.itens) {
      const k = (i.produto + '|' + (i.marca || '')).toLowerCase()
      const p = prod.get(k) || { produto: i.produto, marca: i.marca, qtd: 0, faturamento: 0, lucro: 0 }
      p.qtd += i.qtd; p.faturamento += i.qtd * i.preco * fator; p.lucro += i.qtd * (i.preco * fator - (i.custo ?? 0))
      prod.set(k, p)
      const km = (i.marca || '').toLowerCase()
      const m = marca.get(km) || { nome: i.marca || t('Sem marca'), qtd: 0, faturamento: 0, lucro: 0 }
      m.qtd += i.qtd; m.faturamento += i.qtd * i.preco * fator; m.lucro += i.qtd * (i.preco * fator - (i.custo ?? 0))
      marca.set(km, m)
    }
  }
  const produtos = [...prod.values()].sort((a, b) => b[ordem] - a[ordem])
  const marcas = [...marca.values()].sort((a, b) => b.faturamento - a.faturamento)

  return (
    <section>
      <h2>{t('Análise')}</h2>

      {/* ---------- Filtro de período ---------- */}
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
        <div className="card destaque card-neon"><small>{t('Faturamento')}</small><b>{brl(r.faturamento)}</b><Variacao atual={r.faturamento} anterior={ra.faturamento} /><Sparkline valores={serie.map((d) => d.valor)} cor="var(--pri)" /></div>
        <div className={'card card-neon' + (r.lucro < 0 ? ' card-prejuizo' : '')}><small>{r.lucro < 0 ? t('Prejuízo estimado') : t('Lucro estimado')}</small><b className={r.lucro < 0 ? 'bad' : ''}>{r.lucro < 0 ? '− ' + brl(-r.lucro) : brl(r.lucro)}</b><Variacao atual={r.lucro} anterior={ra.lucro} /><Sparkline valores={serie.map((d) => d.lucro)} cor={r.lucro < 0 ? 'var(--bad)' : 'var(--neon)'} /></div>
        <div className="card"><small>{t('Margem')}</small><b className={r.margem < 0 ? 'bad' : ''}>{pct(r.margem)}</b><Variacao atual={r.margem} anterior={ra.margem} pontos semAnterior={!ra.vendas} /></div>
        <div className="card card-neon"><small>{t('Vendas')}</small><b>{r.vendas}</b><Variacao atual={r.vendas} anterior={ra.vendas} /><Sparkline valores={serie.map((d) => d.vendas)} cor="var(--neon)" /></div>
        <div className="card"><small>{t('Ticket médio')}</small><b>{brl(r.ticket)}</b><Variacao atual={r.ticket} anterior={ra.ticket} /></div>
        <div className="card"><small>{t('Itens vendidos')}</small><b>{r.itens}</b><Variacao atual={r.itens} anterior={ra.itens} /></div>
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
          {/* ---------- Painel de gráficos ---------- */}
          <div className="dash-grade">
            <div className="painel neon dash-largo">
              <div className="painel-titulo">
                <h3 className="titulo-neon">{n === 1 ? t('Faturamento por hora') : t('Faturamento por dia')}</h3>
                {melhorDia && melhorDia.valor > 0 && <small>{t('Melhor dia:')} <b>{dataBR(melhorDia.dia)}</b> {t('com')} {brl(melhorDia.valor)}</small>}
              </div>
              <div className="destaque-numero"><b>{brl(r.faturamento)}</b><small>{t('no período')}</small></div>
              <GraficoArea
                serie={serie}
                rotuloDica={(d) => (n === 1 ? t('{data} às {hora}', { data: dataBR(de), hora: d.rotulo }) : `${t(DIAS_SEMANA[deDia(d.dia).getDay()])}, ${dataBR(d.dia)}`)}
              />
            </div>
            <div className="painel neon">
              <h3 className="painel-titulo titulo-neon">{t('Calendário de vendas')}</h3>
              <CalendarioCalor porDia={faturamentoPorDia} de={de} ate={ate} melhor={melhorDia?.valor > 0 ? melhorDia.dia : null} />
            </div>

            <div className="painel neon">
              <h3 className="painel-titulo titulo-neon">{t('Por forma de pagamento')}</h3>
              <div className="aneis">
                {pagamentos.map((pg) => (
                  <Anel key={pg.nome} fracao={r.faturamento ? pg.valor / r.faturamento : 0}
                    centro={pct(r.faturamento ? (pg.valor / r.faturamento) * 100 : 0).replace(/,\d+/, '')} rotulo={t(pg.nome)} sub={brl(pg.valor)} />
                ))}
              </div>
            </div>
            <div className="painel neon">
              <h3 className="painel-titulo titulo-neon">{t('Por dia da semana')}</h3>
              <ColunasDegrade linhas={semana} destaque={semana.reduce((m, d, i) => (d.valor > (semana[m]?.valor ?? 0) ? i : m), 0)} />
            </div>

            <div className="painel neon">
              <h3 className="painel-titulo titulo-neon">{t('Produtos que mais faturam')}</h3>
              <BarrasSegmentadas total={r.faturamento}
                linhas={[...prod.values()].sort((a, b) => b.faturamento - a.faturamento).slice(0, 6).map((x) => ({ nome: x.produto, valor: x.faturamento }))} />
            </div>
            <div className="painel neon">
              <h3 className="painel-titulo titulo-neon">{t('Resumo')}</h3>
              <div className="aneis">
                <AnelPontilhado centro={r.vendas} rotulo={t('Vendas')} fracao={ra.vendas ? Math.min(1, r.vendas / (ra.vendas * 2)) : 1} sub={ra.vendas ? t('{n} antes', { n: ra.vendas }) : ''} />
                <AnelPontilhado centro={r.itens} rotulo={t('Itens')} fracao={ra.itens ? Math.min(1, r.itens / (ra.itens * 2)) : 1} sub={ra.itens ? t('{n} antes', { n: ra.itens }) : ''} />
                <Anel fracao={Math.max(0, r.margem) / 100} centro={pct(r.margem).replace(/,\d+/, '')} rotulo={t('Margem')} sub={t('do faturamento')}
                  cor={r.margem < 0 ? 'var(--bad)' : 'var(--pri)'} cor2={r.margem < 0 ? 'var(--bad)' : 'var(--neon)'} />
              </div>
            </div>
          </div>

          {/* ---------- Produtos ---------- */}
          <div className="linha-titulo">
            <h3>{t('Desempenho dos produtos')}</h3>
            <div className="segmentado pequeno">
              {[['faturamento', 'Faturamento'], ['qtd', 'Quantidade'], ['lucro', 'Lucro']].map(([k, nome]) => (
                <button key={k} className={ordem === k ? 'on' : ''} onClick={() => setOrdem(k)}>{t(nome)}</button>
              ))}
            </div>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr><th>#</th><th>{t('Produto')}</th><th>{t('Marca')}</th><th className="n">{t('Qtd.')}</th><th className="n">{t('Faturamento')}</th><th className="n">{t('Lucro')}</th><th className="n">{t('Margem')}</th><th className="n">{t('% do total')}</th></tr>
              </thead>
              <tbody>
                {produtos.map((p, i) => (
                  <tr key={p.produto + p.marca}>
                    <td>{i + 1}</td>
                    <td>{p.produto}</td>
                    <td>{p.marca || '-'}</td>
                    <td className="n">{p.qtd}</td>
                    <td className="n"><b>{brl(p.faturamento)}</b></td>
                    <td className={'n' + (p.lucro < 0 ? ' bad' : '')}>{p.lucro < 0 ? '− ' + brl(-p.lucro) : brl(p.lucro)}</td>
                    <td className={'n' + (p.lucro < 0 ? ' bad' : '')}>{pct(p.faturamento ? (p.lucro / p.faturamento) * 100 : 0)}</td>
                    <td className="n">{pct((p.faturamento / r.faturamento) * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------- Marcas ---------- */}
          <div className="linha-titulo"><h3>{t('Desempenho das marcas')}</h3></div>
          <div className="tw">
            <table>
              <thead>
                <tr><th>{t('Marca')}</th><th className="n">{t('Qtd.')}</th><th className="n">{t('Faturamento')}</th><th className="n">{t('Lucro')}</th><th className="n">{t('% do total')}</th></tr>
              </thead>
              <tbody>
                {marcas.map((m) => (
                  <tr key={m.nome}>
                    <td>{m.nome}</td>
                    <td className="n">{m.qtd}</td>
                    <td className="n"><b>{brl(m.faturamento)}</b></td>
                    <td className={'n' + (m.lucro < 0 ? ' bad' : '')}>{m.lucro < 0 ? '− ' + brl(-m.lucro) : brl(m.lucro)}</td>
                    <td className="n">{pct((m.faturamento / r.faturamento) * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>{t('Lucro estimado = preço vendido − custo do produto no momento da venda.')}</small>
        </>
      )}
    </section>
  )
}
