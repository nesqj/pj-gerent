// Gráficos da Análise (SVG puro, sem biblioteca): faturamento/lucro e tendência por semana.
// As cores vêm do tema: --pri (cor da marca) e --neon (destaque).
import { useId, useState } from 'react'
import { t } from '../i18n.js'
import { brl, num } from '../utils.js'

export const compacto = (n) => (Math.abs(n) >= 1000 ? t('{n} mil', { n: num(n / 1000, 1) }) : num(Math.round(n)))

// Curva suave que não "passa do ponto" (monotone cubic, Fritsch–Carlson)
function caminhoSuave(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
  const n = pts.length
  const dx = [], dy = [], m = []
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i] }
  const tg = [m[0]]
  for (let i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  tg[n - 1] = m[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue }
    const a = tg[i] / m[i], b = tg[i + 1] / m[i], h = a * a + b * b
    if (h > 9) { const s = 3 / Math.sqrt(h); tg[i] = s * a * m[i]; tg[i + 1] = s * b * m[i] }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i][0] + dx[i] / 3, c1y = pts[i][1] + (tg[i] * dx[i]) / 3
    const c2x = pts[i + 1][0] - dx[i] / 3, c2y = pts[i + 1][1] - (tg[i + 1] * dx[i]) / 3
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1][0]},${pts[i + 1][1]}`
  }
  return d
}

// Escala "redonda" para o eixo
function escala(min, max) {
  const amplitude = Math.max(max - min, Math.abs(max), 1)
  const bruto = amplitude / 4, ordem = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((x) => x * ordem).find((p) => p >= bruto)
  const lo = Math.min(0, Math.floor(min / passo) * passo)
  const hi = Math.max(passo, Math.ceil(max / passo) * passo)
  const ticks = []
  for (let v = lo; v <= hi + 1e-9; v += passo) ticks.push(Math.round(v * 100) / 100)
  return { lo, hi, ticks }
}

// ---------- Área com duas séries (faturamento e lucro)
export function GraficoArea({ serie, rotuloDica }) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState(null)
  const L = 720, A = 260, esq = 54, dir = 12, topo = 14, base = 28
  const larg = L - esq - dir, alt = A - topo - base
  const vals = serie.flatMap((d) => [d.valor, d.lucro])
  const { lo, hi, ticks } = escala(Math.min(...vals, 0), Math.max(...vals, 0))
  const y = (v) => topo + alt - ((v - lo) / (hi - lo)) * alt
  const x = (i) => esq + (serie.length === 1 ? larg / 2 : (i / (serie.length - 1)) * larg)
  const ptsFat = serie.map((d, i) => [x(i), y(d.valor)])
  const ptsLuc = serie.map((d, i) => [x(i), y(d.lucro)])
  const linhaFat = caminhoSuave(ptsFat)
  const linhaLuc = caminhoSuave(ptsLuc)
  const cadaRotulo = Math.ceil(serie.length / 9)
  const banda = larg / Math.max(1, serie.length - 1)

  return (
    <div className="grafico" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t('Faturamento e lucro no período')}>
        <defs>
          <linearGradient id={'fat' + id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pri)" stopOpacity=".55" />
            <stop offset="100%" stopColor="var(--pri)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={'luc' + id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--neon)" stopOpacity=".28" />
            <stop offset="100%" stopColor="var(--neon)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={esq} x2={L - dir} y1={y(tk)} y2={y(tk)} className={'grade' + (tk === 0 ? ' zero' : '')} />
            <text x={esq - 8} y={y(tk) + 4} textAnchor="end" className="eixo">{compacto(tk)}</text>
          </g>
        ))}
        <path d={`${linhaFat} L${x(serie.length - 1)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z`} fill={`url(#fat${id})`} />
        <path d={`${linhaLuc} L${x(serie.length - 1)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z`} fill={`url(#luc${id})`} />
        <path d={linhaFat} fill="none" stroke="var(--pri)" strokeWidth="2.4" />
        <path d={linhaLuc} fill="none" stroke="var(--neon)" strokeWidth="2" strokeDasharray="0" />
        {serie.map((d, i) => i % cadaRotulo === 0 && (
          <text key={'r' + i} x={x(i)} y={A - 8} textAnchor="middle" className="eixo">{d.rotulo}</text>
        ))}
        {hover != null && (
          <g className="guia">
            <line x1={x(hover)} x2={x(hover)} y1={topo} y2={topo + alt} />
            <circle cx={x(hover)} cy={y(serie[hover].valor)} r="5" className="ponto-pri" />
            <circle cx={x(hover)} cy={y(serie[hover].lucro)} r="4.5" className="ponto-neon" />
          </g>
        )}
        {serie.map((d, i) => (
          <rect key={'h' + i} x={x(i) - banda / 2} y={topo} width={banda} height={alt} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <div className="legenda">
        <span><i style={{ background: 'var(--pri)' }} />{t('Faturamento')}</span>
        <span><i style={{ background: 'var(--neon)' }} />{t('Lucro')}</span>
      </div>
      {hover != null && (
        <div className="dica" style={{ left: `${Math.min(86, Math.max(14, (x(hover) / L) * 100))}%` }}>
          <b>{rotuloDica(serie[hover])}</b>
          <span>{brl(serie[hover].valor)}</span>
          <small className={serie[hover].lucro < 0 ? 'bad' : 'neon'}>{serie[hover].lucro < 0 ? t('Prejuízo') : t('Lucro')}: {brl(serie[hover].lucro)}</small>
          <small>{serie[hover].vendas === 1 ? t('1 venda') : t('{n} vendas', { n: serie[hover].vendas })}</small>
        </div>
      )}
    </div>
  )
}

// ---------- Tendência por semana, com previsão (linha com marcadores + tracejado)
// semanas: [{ rotulo, inicio, valor, vendas, parcial }] ; previsao: [{ rotulo, inicio, valor }]
export function GraficoTendencia({ semanas, previsao, rotuloDica }) {
  const [hover, setHover] = useState(null)
  const todos = [...semanas, ...previsao]
  const L = 720, A = 240, esq = 54, dir = 16, topo = 14, base = 28
  const larg = L - esq - dir, alt = A - topo - base
  const { lo, hi, ticks } = escala(0, Math.max(...todos.map((d) => d.valor), 0))
  const y = (v) => topo + alt - ((v - lo) / (hi - lo)) * alt
  const x = (i) => esq + (todos.length === 1 ? larg / 2 : (i / (todos.length - 1)) * larg)
  const ptsReal = semanas.map((d, i) => [x(i), y(d.valor)])
  // a previsão começa no último ponto real, para a linha continuar
  const ptsPrev = previsao.length ? [ptsReal[ptsReal.length - 1], ...previsao.map((d, i) => [x(semanas.length + i), y(d.valor)])] : []
  const cadaRotulo = Math.ceil(todos.length / 8)
  const banda = larg / Math.max(1, todos.length - 1)
  const d = hover != null ? todos[hover] : null
  const ehPrev = hover != null && hover >= semanas.length

  return (
    <div className="grafico tendencia" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t('Tendência de vendas por semana')}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={esq} x2={L - dir} y1={y(tk)} y2={y(tk)} className="grade" />
            <text x={esq - 8} y={y(tk) + 4} textAnchor="end" className="eixo">{compacto(tk)}</text>
          </g>
        ))}
        {previsao.length > 0 && <rect x={x(semanas.length - 1)} y={topo} width={x(todos.length - 1) - x(semanas.length - 1) + 8} height={alt} className="faixa-previsao" />}
        <path d={caminhoSuave(ptsReal)} fill="none" stroke="var(--pri)" strokeWidth="2.4" />
        {ptsPrev.length > 1 && <path d={caminhoSuave(ptsPrev)} fill="none" stroke="var(--neon)" strokeWidth="2" strokeDasharray="5 5" />}
        {ptsReal.map(([px, py], i) => (
          <circle key={'r' + i} cx={px} cy={py} r={hover === i ? 6 : 4.5} className={'marcador' + (semanas[i].parcial ? ' parcial' : '')} />
        ))}
        {ptsPrev.slice(1).map(([px, py], i) => (
          <circle key={'p' + i} cx={px} cy={py} r={hover === semanas.length + i ? 6 : 4.5} className="marcador previsto" />
        ))}
        {todos.map((s, i) => i % cadaRotulo === 0 && (
          <text key={'x' + i} x={x(i)} y={A - 8} textAnchor="middle" className={'eixo' + (i >= semanas.length ? ' eixo-prev' : '')}>{s.rotulo}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={topo} y2={topo + alt} className="guia-linha" />}
        {todos.map((s, i) => (
          <rect key={'h' + i} x={x(i) - banda / 2} y={topo} width={banda} height={alt} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <div className="legenda">
        <span><i className="leg-linha" style={{ borderColor: 'var(--pri)' }} />{t('Vendas')}</span>
        {previsao.length > 0 && <span><i className="leg-linha tracejada" style={{ borderColor: 'var(--neon)' }} />{t('Previsão')}</span>}
      </div>
      {d && (
        <div className="dica" style={{ left: `${Math.min(86, Math.max(14, (x(hover) / L) * 100))}%` }}>
          <b>{rotuloDica(d)}</b>
          <span>{brl(d.valor)}</span>
          <small>{ehPrev ? t('previsão') : d.parcial ? t('semana em andamento') : d.vendas === 1 ? t('1 venda') : t('{n} vendas', { n: d.vendas })}</small>
        </div>
      )}
    </div>
  )
}
