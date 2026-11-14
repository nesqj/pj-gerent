// Gráfico da Análise (SVG puro, sem biblioteca): faturamento, lucro e vendas por dia (ou por hora).
// Faturamento e lucro em colunas lado a lado (eixo da esquerda, R$); vendas em pontos (eixo da direita, quantidade).
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
  return { lo, hi, ticks, passo }
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

export function GraficoLinhas({ serie, rotuloDica }) {
  const [ref, L] = useLargura()
  const [hover, setHover] = useState(null)
  const A = 300, esq = 56, dir = 40, topo = 16, base = 30
  const larg = L - esq - dir, alt = A - topo - base

  // eixo da esquerda (R$): faturamento e lucro, com espaço para lucro negativo
  const reais = serie.flatMap((d) => [d.valor, d.lucro])
  const { lo, hi, ticks } = escala(Math.min(...reais, 0), Math.max(...reais, 0))
  const y = (v) => topo + alt - ((v - lo) / (hi - lo)) * alt
  // eixo da direita (vendas): mesmas linhas de grade, números inteiros
  const positivos = ticks.filter((tk) => tk > 0).length || 1
  const maxV = Math.max(...serie.map((d) => d.vendas), 1)
  const passoV = Math.max(1, Math.ceil(maxV / positivos))
  const topoV = passoV * positivos
  const yV = (v) => y(0) - (v / topoV) * (y(0) - y(hi))

  const banda = larg / serie.length
  const xc = (i) => esq + banda * i + banda / 2
  const largBarra = Math.max(2, Math.min(18, (banda - 6) / 2))
  const cadaRotulo = Math.max(1, Math.ceil(serie.length / Math.max(2, Math.floor(larg / 70))))
  const h = hover != null ? serie[hover] : null

  // pontos de vendas: só dias com venda, ligados quando são dias seguidos
  const comVenda = serie.map((d, i) => (d.vendas > 0 ? i : null)).filter((i) => i != null)
  const trechos = []
  for (const i of comVenda) {
    const ultimo = trechos[trechos.length - 1]
    if (ultimo && ultimo[ultimo.length - 1] === i - 1) ultimo.push(i)
    else trechos.push([i])
  }

  const barra = (x, v, cls) => {
    if (!v) return null
    const y0 = y(0), y1 = y(v)
    const topoB = Math.min(y0, y1), altura = Math.max(1, Math.abs(y1 - y0))
    const r = Math.min(3, largBarra / 2, altura)
    // arredonda só a ponta (em cima para positivo, embaixo para negativo)
    const d = v > 0
      ? `M${x},${y0} V${topoB + r} Q${x},${topoB} ${x + r},${topoB} H${x + largBarra - r} Q${x + largBarra},${topoB} ${x + largBarra},${topoB + r} V${y0} Z`
      : `M${x},${y0} V${topoB + altura - r} Q${x},${topoB + altura} ${x + r},${topoB + altura} H${x + largBarra - r} Q${x + largBarra},${topoB + altura} ${x + largBarra},${topoB + altura - r} V${y0} Z`
    return <path d={d} className={cls} />
  }

  return (
    <div className="grafico diario" ref={ref} onMouseLeave={() => setHover(null)}>
      <div className="legenda-topo">
        <span><i className="q fat" />{t('Faturamento')}</span>
        <span><i className="q luc" />{t('Lucro')}</span>
        <span><i className="p ven" />{t('Vendas')} <small>({t('eixo da direita')})</small></span>
      </div>
      <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t('Faturamento, lucro e vendas')}>
        {/* grade e eixos */}
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={esq} x2={L - dir} y1={y(tk)} y2={y(tk)} className={'grade' + (tk === 0 ? ' zero' : '')} />
            <text x={esq - 10} y={y(tk) + 4} textAnchor="end" className="eixo">{compacto(tk)}</text>
            {tk >= 0 && <text x={L - dir + 10} y={y(tk) + 4} textAnchor="start" className="eixo eixo-vendas">{Math.round((tk / hi) * topoV)}</text>}
          </g>
        ))}
        {/* faixa do dia sob o mouse */}
        {hover != null && <rect x={esq + banda * hover} y={topo} width={banda} height={alt} className="faixa-hover" />}
        {/* colunas: faturamento e lucro lado a lado */}
        {serie.map((d, i) => (
          <g key={'b' + i}>
            {barra(xc(i) - largBarra - 1, d.valor, 'barra-fat')}
            {barra(xc(i) + 1, d.lucro, d.lucro < 0 ? 'barra-preju' : 'barra-luc')}
          </g>
        ))}
        {/* vendas: linha fina + pontos */}
        {trechos.filter((tr) => tr.length > 1).map((tr) => (
          <polyline key={'l' + tr[0]} points={tr.map((i) => `${xc(i)},${yV(serie[i].vendas)}`).join(' ')} className="linha-vendas" />
        ))}
        {comVenda.map((i) => <circle key={'p' + i} cx={xc(i)} cy={yV(serie[i].vendas)} r={hover === i ? 5 : 3.5} className="ponto-vendas" />)}
        {/* rótulos do eixo X */}
        {serie.map((d, i) => i % cadaRotulo === 0 && (
          <text key={'x' + i} x={xc(i)} y={A - 10} textAnchor="middle" className="eixo">{d.rotulo}</text>
        ))}
        {/* áreas de mouse */}
        {serie.map((d, i) => (
          <rect key={'h' + i} x={esq + banda * i} y={topo} width={banda} height={alt} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {h && (
        <div className="dica dica-diario" style={{ left: Math.min(L - 110, Math.max(110, xc(hover))) }}>
          <b>{rotuloDica(h)}</b>
          <div className="dica-linha"><i className="q fat" />{t('Faturamento')}<span>{brl(h.valor)}</span></div>
          <div className="dica-linha"><i className={'q ' + (h.lucro < 0 ? 'preju' : 'luc')} />{h.lucro < 0 ? t('Prejuízo') : t('Lucro')}<span className={h.lucro < 0 ? 'bad' : ''}>{brl(h.lucro)}</span></div>
          <div className="dica-linha"><i className="p ven" />{t('Vendas')}<span>{h.vendas}</span></div>
        </div>
      )}
    </div>
  )
}
