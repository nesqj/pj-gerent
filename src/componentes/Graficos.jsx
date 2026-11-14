// Gráficos do painel de Análise (SVG puro, sem biblioteca), no estilo "dashboard":
// área com degradê e linha brilhante, minigráficos, anéis, colunas em degradê, barras segmentadas e calendário de calor.
// As cores vêm do tema: --pri (cor da marca) e --neon (ciano de destaque).
import { useId, useState } from 'react'
import { t } from '../i18n.js'
import { brl, num, pct } from '../utils.js'

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

// ---------- Minigráfico (dentro dos cards)
export function Sparkline({ valores, cor = 'var(--neon)' }) {
  const id = useId().replace(/:/g, '')
  if (!valores?.length || valores.every((v) => !v)) return null
  const L = 120, A = 32
  const min = Math.min(0, ...valores), max = Math.max(...valores, 1)
  const pts = valores.map((v, i) => [valores.length === 1 ? L / 2 : (i / (valores.length - 1)) * L, A - 2 - ((v - min) / (max - min || 1)) * (A - 6)])
  const linha = caminhoSuave(pts)
  return (
    <svg className="sparkline" viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={'sg' + id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity=".45" /><stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linha} L${L},${A} L0,${A} Z`} fill={`url(#sg${id})`} />
      <path d={linha} fill="none" stroke={cor} strokeWidth="1.6" className="brilho" />
    </svg>
  )
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
        <path d={linhaFat} fill="none" stroke="var(--pri)" strokeWidth="2.4" className="brilho" />
        <path d={linhaLuc} fill="none" stroke="var(--neon)" strokeWidth="2" strokeDasharray="0" className="brilho" />
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

// ---------- Anel (percentual) com degradê
export function Anel({ fracao, centro, rotulo, sub, cor = 'var(--pri)', cor2 = 'var(--neon)' }) {
  const id = useId().replace(/:/g, '')
  const R = 42, C = 2 * Math.PI * R
  const f = Math.max(0, Math.min(1, fracao || 0))
  return (
    <div className="anel">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={'an' + id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={cor2} /><stop offset="100%" stopColor={cor} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} className="anel-trilho" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={`url(#an${id})`} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${C * f} ${C}`} transform="rotate(-90 50 50)" className="brilho" />
      </svg>
      <div className="anel-centro"><b>{centro}</b></div>
      <span className="anel-rotulo">{rotulo}</span>
      {sub && <small className="anel-sub">{sub}</small>}
    </div>
  )
}

// ---------- Contador com anel pontilhado
export function AnelPontilhado({ centro, rotulo, sub, fracao = 1 }) {
  const pontos = 36
  const acesos = Math.round(pontos * Math.max(0, Math.min(1, fracao)))
  return (
    <div className="anel pontilhado">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: pontos }, (_, i) => {
          const a = (i / pontos) * Math.PI * 2 - Math.PI / 2
          return <circle key={i} cx={50 + Math.cos(a) * 43} cy={50 + Math.sin(a) * 43} r={i < acesos ? 2.6 : 1.8} className={i < acesos ? 'ponto-aceso' : 'ponto-apagado'} />
        })}
      </svg>
      <div className="anel-centro"><b>{centro}</b></div>
      <span className="anel-rotulo">{rotulo}</span>
      {sub && <small className="anel-sub">{sub}</small>}
    </div>
  )
}

// ---------- Colunas em degradê (dia da semana)
export function ColunasDegrade({ linhas, destaque }) {
  const id = useId().replace(/:/g, '')
  const max = Math.max(...linhas.map((l) => l.valor), 1)
  return (
    <div className="colunas-degrade">
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id={'cd' + id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--neon)" /><stop offset="100%" stopColor="var(--pri)" stopOpacity=".35" />
          </linearGradient>
        </defs>
      </svg>
      {linhas.map((l, i) => {
        const h = (l.valor / max) * 100
        return (
          <div key={l.nome} className={'col' + (i === destaque ? ' destaque' : '')} title={`${t(l.nome)}: ${brl(l.valor)}`}>
            <small className="col-valor">{l.valor ? compacto(l.valor) : ''}</small>
            <div className="col-trilho">
              <svg viewBox="0 0 10 100" preserveAspectRatio="none">
                <rect x="0" y={100 - h} width="10" height={h} rx="2" fill={`url(#cd${id})`} className="brilho" />
              </svg>
            </div>
            <span className="col-nome">{t(l.nome)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Barras segmentadas (participação)
export function BarrasSegmentadas({ linhas, total, segmentos = 12 }) {
  return (
    <div className="segmentadas">
      {linhas.map((l) => {
        const p = total ? (l.valor / total) * 100 : 0
        const acesos = Math.round((p / 100) * segmentos)
        return (
          <div key={l.nome} className="seg-linha" title={`${l.nome}: ${brl(l.valor)}`}>
            <span className="seg-nome">{l.nome}</span>
            <div className="seg-blocos">
              {Array.from({ length: segmentos }, (_, i) => <i key={i} className={i < acesos ? 'aceso' : ''} style={i < acesos ? { opacity: 0.45 + (0.55 * (i + 1)) / Math.max(1, acesos) } : undefined} />)}
            </div>
            <span className="seg-pct">{pct(p)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Calendário de calor (faturamento por dia)
const NOMES_DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
export function CalendarioCalor({ porDia, de, ate, melhor }) {
  const deDia = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d) }
  const paraDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const max = Math.max(...porDia.values(), 1)
  // mostra o mês do fim do período (e o anterior, se o período começar nele)
  const meses = []
  const fim = deDia(ate)
  const ini = deDia(de)
  let cursor = new Date(fim.getFullYear(), fim.getMonth(), 1)
  while (meses.length < 2 && cursor >= new Date(ini.getFullYear(), ini.getMonth(), 1)) {
    meses.unshift(new Date(cursor))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
  }
  const nomeMes = (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return (
    <div className="calendarios">
      {meses.map((m) => {
        const primeiro = new Date(m.getFullYear(), m.getMonth(), 1).getDay()
        const dias = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
        return (
          <div key={m.toISOString()} className="calendario">
            <div className="cal-mes">{nomeMes(m)}</div>
            <div className="cal-grade">
              {NOMES_DIAS.map((n, i) => <span key={'n' + i} className="cal-sem">{n}</span>)}
              {Array.from({ length: primeiro }, (_, i) => <span key={'v' + i} />)}
              {Array.from({ length: dias }, (_, i) => {
                const dia = paraDia(new Date(m.getFullYear(), m.getMonth(), i + 1))
                const dentro = dia >= de && dia <= ate
                const v = porDia.get(dia) || 0
                const intensidade = v ? 0.18 + 0.82 * (v / max) : 0
                return (
                  <span key={dia} className={'cal-dia' + (dentro ? '' : ' fora') + (v ? ' com-venda' : '') + (dia === melhor ? ' melhor' : '')}
                    style={v ? { '--int': intensidade } : undefined} title={v ? `${i + 1}: ${brl(v)}` : undefined}>{i + 1}</span>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="cal-legenda"><small>{t('menos')}</small>{[0.2, 0.45, 0.7, 1].map((x) => <i key={x} style={{ '--int': x }} />)}<small>{t('mais')}</small></div>
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
