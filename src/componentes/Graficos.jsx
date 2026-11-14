// Gráfico da Análise (SVG puro, sem biblioteca): faturamento, lucro e vendas.
// As cores vêm do tema: --pri (cor da marca) e --neon (destaque).
import { useState } from 'react'
import { t } from '../i18n.js'
import { brl, num } from '../utils.js'

export const compacto = (n) => (Math.abs(n) >= 1000 ? t('{n} mil', { n: num(n / 1000, 1) }) : num(Math.round(n)))

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

// ---------- Linhas (estilo "ações"): faturamento e lucro em R$ (eixo da esquerda) e vendas em quantidade (eixo da direita)
// Linhas retas, sem preenchimento, só a grade horizontal.
export function GraficoLinhas({ serie, rotuloDica }) {
  const [hover, setHover] = useState(null)
  const L = 760, A = 280, esq = 54, dir = 40, topo = 12, base = 28
  const larg = L - esq - dir, alt = A - topo - base
  const reais = serie.flatMap((d) => [d.valor, d.lucro])
  const { lo, hi, ticks } = escala(Math.min(...reais, 0), Math.max(...reais, 0))
  const y = (v) => topo + alt - ((v - lo) / (hi - lo)) * alt
  // vendas: eixo próprio, alinhado às mesmas linhas de grade
  const maxV = Math.max(...serie.map((d) => d.vendas), 1)
  const passoV = Math.max(1, Math.ceil(maxV / Math.max(1, ticks.filter((tk) => tk > 0).length)))
  const topoV = passoV * Math.max(1, ticks.filter((tk) => tk > 0).length)
  const yV = (v) => y(0) - (v / topoV) * (y(0) - y(hi))
  const x = (i) => esq + (serie.length === 1 ? larg / 2 : (i / (serie.length - 1)) * larg)
  const linha = (f) => serie.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${f(d).toFixed(1)}`).join(' ')
  const cadaRotulo = Math.ceil(serie.length / 9)
  const banda = larg / Math.max(1, serie.length - 1)
  const SERIES = [
    { nome: t('Faturamento'), cor: 'var(--pri)', d: linha((d) => y(d.valor)) },
    { nome: t('Lucro'), cor: 'var(--linha-lucro)', d: linha((d) => y(d.lucro)) },
    { nome: t('Vendas'), cor: 'var(--linha-vendas)', d: linha((d) => yV(d.vendas)) },
  ]
  const h = hover != null ? serie[hover] : null

  return (
    <div className="grafico linhas" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t('Faturamento, lucro e vendas')}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={esq} x2={L - dir} y1={y(tk)} y2={y(tk)} className={'grade' + (tk === 0 ? ' zero' : '')} />
            <text x={esq - 8} y={y(tk) + 4} textAnchor="end" className="eixo">{compacto(tk)}</text>
            {tk >= 0 && <text x={L - dir + 8} y={y(tk) + 4} textAnchor="start" className="eixo eixo-vendas">{Math.round((tk / hi) * topoV)}</text>}
          </g>
        ))}
        {SERIES.map((s) => <path key={s.nome} d={s.d} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {serie.map((d, i) => i % cadaRotulo === 0 && (
          <text key={'r' + i} x={x(i)} y={A - 8} textAnchor="middle" className="eixo">{d.rotulo}</text>
        ))}
        {h && (
          <g className="guia">
            <line x1={x(hover)} x2={x(hover)} y1={topo} y2={topo + alt} />
            <circle cx={x(hover)} cy={y(h.valor)} r="4" fill="var(--card)" stroke="var(--pri)" strokeWidth="2.2" />
            <circle cx={x(hover)} cy={y(h.lucro)} r="4" fill="var(--card)" stroke="var(--linha-lucro)" strokeWidth="2.2" />
            <circle cx={x(hover)} cy={yV(h.vendas)} r="4" fill="var(--card)" stroke="var(--linha-vendas)" strokeWidth="2.2" />
          </g>
        )}
        {serie.map((d, i) => (
          <rect key={'h' + i} x={x(i) - banda / 2} y={topo} width={banda} height={alt} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <div className="legenda">
        {SERIES.map((s) => <span key={s.nome}><i className="leg-linha" style={{ borderColor: s.cor }} />{s.nome}</span>)}
        <small className="leg-nota">{t('vendas: eixo da direita')}</small>
      </div>
      {h && (
        <div className="dica" style={{ left: `${Math.min(86, Math.max(14, (x(hover) / L) * 100))}%` }}>
          <b>{rotuloDica(h)}</b>
          <span>{brl(h.valor)}</span>
          <small className={h.lucro < 0 ? 'bad' : 'cor-lucro'}>{h.lucro < 0 ? t('Prejuízo') : t('Lucro')}: {brl(h.lucro)}</small>
          <small className="cor-vendas">{h.vendas === 1 ? t('1 venda') : t('{n} vendas', { n: h.vendas })}</small>
        </div>
      )}
    </div>
  )
}
