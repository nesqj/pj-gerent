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

// Estilo "bolsa": faturamento e lucro em linhas na parte de cima (R$) e
// vendas em colunas discretas numa faixa embaixo (quantidade), sem disputar espaço com as linhas.
export function GraficoLinhas({ serie, rotuloDica }) {
  const [ref, L] = useLargura()
  const [hover, setHover] = useState(null)
  const A = 320, esq = 56, dir = 40, topo = 16, base = 30, vao = 14
  const larg = L - esq - dir
  const altTotal = A - topo - base
  const altLinhas = Math.round((altTotal - vao) * 0.74)
  const altVendas = altTotal - vao - altLinhas
  const topoVendas = topo + altLinhas + vao

  // parte de cima: R$ (faturamento e lucro)
  const reais = serie.flatMap((d) => [d.valor, d.lucro])
  const { lo, hi, ticks } = escala(Math.min(...reais, 0), Math.max(...reais, 0))
  const y = (v) => topo + altLinhas - ((v - lo) / (hi - lo)) * altLinhas
  // faixa de baixo: quantidade de vendas
  const maxV = Math.max(...serie.map((d) => d.vendas), 1)
  const yV = (v) => topoVendas + altVendas - (v / maxV) * altVendas

  const banda = larg / serie.length
  const xc = (i) => esq + banda * i + banda / 2
  const largBarra = Math.max(2, Math.min(16, banda * 0.6))
  const cadaRotulo = Math.max(1, Math.ceil(serie.length / Math.max(2, Math.floor(larg / 70))))
  const h = hover != null ? serie[hover] : null
  const linha = (f) => serie.map((d, i) => `${i ? 'L' : 'M'}${xc(i).toFixed(1)},${f(d).toFixed(1)}`).join(' ')
  const comVenda = serie.map((d, i) => (d.vendas > 0 ? i : null)).filter((i) => i != null)

  return (
    <div className="grafico diario bolsa" ref={ref} onMouseLeave={() => setHover(null)}>
      <div className="legenda-topo">
        <span><i className="l fat" />{t('Faturamento')}</span>
        <span><i className="l luc" />{t('Lucro')}</span>
        <span><i className="q ven" />{t('Vendas')}</span>
      </div>
      <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t('Faturamento, lucro e vendas')}>
        {/* grade da parte de cima (R$) */}
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={esq} x2={L - dir} y1={y(tk)} y2={y(tk)} className={'grade' + (tk === 0 ? ' zero' : '')} />
            <text x={esq - 10} y={y(tk) + 4} textAnchor="end" className="eixo">{compacto(tk)}</text>
          </g>
        ))}
        {/* faixa de vendas: base, topo e o máximo à direita */}
        <line x1={esq} x2={L - dir} y1={topoVendas + altVendas} y2={topoVendas + altVendas} className="grade zero" />
        <text x={L - dir + 10} y={topoVendas + 10} textAnchor="start" className="eixo eixo-vendas">{maxV}</text>
        <text x={L - dir + 10} y={topoVendas + altVendas + 4} textAnchor="start" className="eixo eixo-vendas">0</text>
        <text x={esq - 10} y={topoVendas + altVendas / 2 + 4} textAnchor="end" className="eixo eixo-vendas">{t('vendas')}</text>
        {/* dia sob o mouse */}
        {hover != null && <rect x={esq + banda * hover} y={topo} width={banda} height={altTotal} className="faixa-hover" />}
        {/* vendas em colunas discretas */}
        {serie.map((d, i) => d.vendas > 0 && (
          <rect key={'v' + i} x={xc(i) - largBarra / 2} y={yV(d.vendas)} width={largBarra} height={topoVendas + altVendas - yV(d.vendas)} rx="2"
            className={'barra-vendas' + (hover === i ? ' ativa' : '')} />
        ))}
        {/* faturamento e lucro em linhas, com ponto nos dias com venda */}
        <path d={linha((d) => y(d.valor))} className="linha-fat" />
        <path d={linha((d) => y(d.lucro))} className="linha-luc" />
        {comVenda.map((i) => (
          <g key={'p' + i}>
            <circle cx={xc(i)} cy={y(serie[i].valor)} r={hover === i ? 5 : 3.5} className="ponto-fat" />
            <circle cx={xc(i)} cy={y(serie[i].lucro)} r={hover === i ? 5 : 3.5} className={serie[i].lucro < 0 ? 'ponto-preju' : 'ponto-luc'} />
          </g>
        ))}
        {/* rótulos do eixo X */}
        {serie.map((d, i) => i % cadaRotulo === 0 && (
          <text key={'x' + i} x={xc(i)} y={A - 10} textAnchor="middle" className="eixo">{d.rotulo}</text>
        ))}
        {/* áreas de mouse */}
        {serie.map((d, i) => (
          <rect key={'h' + i} x={esq + banda * i} y={topo} width={banda} height={altTotal} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {h && (
        <div className="dica dica-diario" style={{ left: Math.min(L - 110, Math.max(110, xc(hover))) }}>
          <b>{rotuloDica(h)}</b>
          <div className="dica-linha"><i className="l fat" />{t('Faturamento')}<span>{brl(h.valor)}</span></div>
          <div className="dica-linha"><i className={'l ' + (h.lucro < 0 ? 'preju' : 'luc')} />{h.lucro < 0 ? t('Prejuízo') : t('Lucro')}<span className={h.lucro < 0 ? 'bad' : ''}>{brl(h.lucro)}</span></div>
          <div className="dica-linha"><i className="q ven" />{t('Vendas')}<span>{h.vendas}</span></div>
        </div>
      )}
    </div>
  )
}
