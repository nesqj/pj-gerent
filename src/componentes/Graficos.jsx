// Gráfico da Análise (SVG puro, sem biblioteca): faturamento e lucro por dia (ou por hora), em barras arredondadas.
// Barra cinza = faturamento (ou o valor emprestado); barra verde por cima = lucro. Tocar/passar o mouse mostra os números do dia.
// O desenho acompanha a largura real da tela, então o texto fica sempre do mesmo tamanho.
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'
import { brl, num } from '../utils.js'

export const compacto = (n) => (Math.abs(n) >= 1000 ? t('{n} mil', { n: num(n / 1000, 1) }) : num(Math.round(n)))

// Escala "redonda" para o eixo
function escala(min, max, partes = 4) {
  const amplitude = Math.max(Math.abs(max), Math.abs(min), 1) // prejuízo pequeno não estica o eixo para baixo
  const bruto = amplitude / partes, ordem = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((x) => x * ordem).find((p) => p >= bruto)
  const lo = Math.min(0, Math.floor(min / passo) * passo)
  const hi = Math.max(passo, Math.ceil(max / passo) * passo)
  const ticks = []
  for (let v = lo; v <= hi + 1e-9; v += passo) ticks.push(Math.round(v * 100) / 100)
  return { lo, hi, ticks }
}

// Largura real do elemento (para o SVG não esticar o texto)
function useLargura(padrao = 720) {
  const ref = useRef(null)
  const [largura, setLargura] = useState(padrao)
  useEffect(() => {
    if (!ref.current) return
    const medir = () => setLargura(Math.max(280, Math.round(ref.current.getBoundingClientRect().width)))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, largura]
}

// barra com os cantos de cima (ou de baixo, se negativa) arredondados
function barra(x, y0, y1, w) {
  const alto = Math.abs(y1 - y0)
  if (alto < 0.5) return ''
  const r = Math.min(w / 2, 6, alto)
  const topo = Math.min(y0, y1), base = Math.max(y0, y1)
  if (y1 <= y0) return `M${x},${base} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + w - r} Q${x + w},${topo} ${x + w},${topo + r} V${base} Z`
  return `M${x},${topo} V${base - r} Q${x},${base} ${x + r},${base} H${x + w - r} Q${x + w},${base} ${x + w},${base - r} V${topo} Z`
}

const NOMES_PADRAO = { valor: 'Faturamento', lucro: 'Lucro', qtd: 'Vendas' }
export function GraficoBarras({ serie, rotuloDica, nomes: nomesDados }) {
  const nomes = { ...NOMES_PADRAO, ...nomesDados }
  const [ref, L] = useLargura()
  const [hover, setHover] = useState(null)
  const A = 250, esq = 46, dir = 10, topo = 12, base = 28
  const larg = L - esq - dir
  const alt = A - topo - base

  const reais = serie.flatMap((d) => [d.valor, d.lucro])
  const { lo, hi, ticks } = escala(Math.min(...reais, 0), Math.max(...reais, 0))
  const y = (v) => topo + alt - ((v - lo) / (hi - lo)) * alt

  const banda = larg / serie.length
  const x0 = (i) => esq + banda * i
  const w = Math.max(3, Math.min(22, banda * 0.62))
  const xb = (i) => x0(i) + (banda - w) / 2
  const cadaRotulo = Math.max(1, Math.ceil(serie.length / Math.max(2, Math.floor(larg / 64))))
  const h = hover != null ? serie[hover] : null

  return (
    <div className="grafico diario barras" ref={ref} onMouseLeave={() => setHover(null)}>
      <div className="legenda-topo">
        <span><i className="q fat" />{t(nomes.valor)}</span>
        <span><i className="q luc" />{t(nomes.lucro)}</span>
      </div>
      <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t(nomes.valor)}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={esq} x2={L - dir} y1={y(tk)} y2={y(tk)} className={'grade' + (tk === 0 ? ' zero' : '')} />
            <text x={esq - 8} y={y(tk) + 4} textAnchor="end" className="eixo">{compacto(tk)}</text>
          </g>
        ))}
        {hover != null && <rect x={x0(hover) + 2} y={topo} width={banda - 4} height={alt} rx="8" className="faixa-hover" />}
        {serie.map((d, i) => (
          <g key={i} className={hover != null && hover !== i ? 'apagada' : ''}>
            <path d={barra(xb(i), y(0), y(d.valor), w)} className="barra-fat" />
            <path d={barra(xb(i), y(0), y(d.lucro), w)} className={d.lucro < 0 ? 'barra-preju' : 'barra-luc'} />
          </g>
        ))}
        {serie.map((d, i) => i % cadaRotulo === 0 && (
          <text key={'x' + i} x={x0(i) + banda / 2} y={A - 8} textAnchor="middle" className="eixo">{d.rotulo}</text>
        ))}
        {serie.map((d, i) => (
          <rect key={'h' + i} x={x0(i)} y={topo} width={banda} height={alt} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      {h && (
        <div className="dica dica-diario" style={{ left: Math.min(L - 110, Math.max(110, x0(hover) + banda / 2)) }}>
          <b>{rotuloDica(h)}</b>
          <div className="dica-linha"><i className="q fat" />{t(nomes.valor)}<span>{brl(h.valor)}</span></div>
          <div className="dica-linha"><i className={'q ' + (h.lucro < 0 ? 'preju' : 'luc')} />{h.lucro < 0 ? t('Prejuízo') : t(nomes.lucro)}<span className={h.lucro < 0 ? 'bad' : ''}>{brl(h.lucro)}</span></div>
          <div className="dica-linha">{t(nomes.qtd)}<span>{h.vendas}</span></div>
        </div>
      )}
    </div>
  )
}
