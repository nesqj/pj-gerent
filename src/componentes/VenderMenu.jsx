// Aba "Vender": a lista do que dá para fazer (Realizar venda, Empréstimo, Catálogo) e, no canto de cima,
// a calculadora de taxas da maquininha (quanto o cliente paga e quanto você recebe).
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n.js'
import { brl, lerValor } from '../utils.js'
import { IconeCalculadora, IconeCarrinho, IconeCobranca, IconeDireita, IconeFechar, IconeLoja } from '../icones.jsx'

export function MenuVender({ podeVender, podeEmprestar, abrir }) {
  const [calculadora, setCalculadora] = useState(false)
  const itens = [
    podeVender && { id: 'venda', nome: 'Realizar venda', sub: 'Produtos do estoque, dos fornecedores ou avulsos', icone: IconeCarrinho },
    podeEmprestar && { id: 'emprestimo', nome: 'Empréstimo', sub: 'Empreste com juros e receba em parcelas', icone: IconeCobranca },
    { id: 'catalogo', nome: 'Catálogo', sub: 'Mostre seus produtos e venda por Pix ou cartão', icone: IconeLoja },
  ].filter(Boolean)
  return (
    <section>
      <div className="vd-topo">
        <h2>{t('Vender')}</h2>
        <button className="in-icone" onClick={() => setCalculadora(true)} aria-label={t('Calculadora')} title={t('Calculadora')}><IconeCalculadora /></button>
      </div>
      <div className="vd-lista">
        {itens.map((i) => (
          <button key={i.id} className="vd-item" onClick={() => abrir(i.id)}>
            <span className="vd-icone"><i.icone /></span>
            <span className="vd-txt"><b>{t(i.nome)}</b><small>{t(i.sub)}</small></span>
            <IconeDireita />
          </button>
        ))}
      </div>
      {calculadora && <Calculadora onFechar={() => setCalculadora(false)} />}
    </section>
  )
}

// Catálogo: ainda vai ser configurado
export function Catalogo() {
  return (
    <div className="cb-vazio vd-embreve">
      <span className="vd-icone"><IconeLoja /></span>
      <b>{t('Catálogo')}</b>
      <span>{t('Em breve você vai poder montar seu catálogo de produtos aqui.')}</span>
    </div>
  )
}

// ---------- Calculadora de taxas ----------
// As taxas ficam guardadas neste aparelho; dá para ajustar para as da sua maquininha em "Ajustar taxas".
const TAXAS_PADRAO = {
  pix: 0, debito: 1.37,
  credito: [3.15, 5.39, 6.12, 6.85, 7.57, 8.28, 8.99, 9.69, 10.38, 11.06, 11.74, 12.4], // 1x a 12x
}
const CHAVE = 'calc-taxas'
function lerTaxas() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || 'null')
    if (s && Array.isArray(s.credito) && s.credito.length === 12) return s
  } catch { /* sem acesso */ }
  return TAXAS_PADRAO
}
const pctTxt = (p) => String(Math.round(p * 100) / 100).replace('.', ',') + '%'
const r2 = (n) => Math.round(n * 100) / 100

export function Calculadora({ onFechar }) {
  const [forma, setForma] = useState('credito')
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState(1)
  const [repassar, setRepassar] = useState(false)
  const [taxas, setTaxas] = useState(lerTaxas)
  const [ajustando, setAjustando] = useState(null) // cópia em texto das taxas enquanto edita

  const taxa = forma === 'credito' ? taxas.credito[parcelas - 1] : taxas[forma]
  const v = lerValor(valor) || 0
  // repassar a taxa: o cliente paga a mais para você receber o valor cheio
  const clientePaga = v > 0 ? r2(repassar ? v / (1 - taxa / 100) : v) : 0
  const voceRecebe = v > 0 ? r2(repassar ? v : v * (1 - taxa / 100)) : 0
  const custo = r2(clientePaga - voceRecebe)
  const nParc = forma === 'credito' ? parcelas : 1

  function salvarTaxas(e) {
    e.preventDefault()
    const n = (s) => Math.max(0, Math.min(99, lerValor(s) || 0))
    const novas = { pix: n(ajustando.pix), debito: n(ajustando.debito), credito: ajustando.credito.map(n) }
    setTaxas(novas)
    try { localStorage.setItem(CHAVE, JSON.stringify(novas)) } catch { /* sem acesso */ }
    setAjustando(null)
  }
  const emTexto = (x) => String(x).replace('.', ',')

  return createPortal(
    <div className="notif-fundo" onClick={onFechar}>
      <div className="notif-folha calc-folha" role="dialog" aria-label={t('Calculadora')} onClick={(e) => e.stopPropagation()}>
        <div className="calc-topo">
          <button className="in-icone" onClick={ajustando ? () => setAjustando(null) : onFechar} aria-label={t('Fechar')}><IconeFechar /></button>
          <b>{ajustando ? t('Ajustar taxas') : t('Calculadora')}</b>
          <span style={{ width: 44 }} />
        </div>

        {ajustando ? (
          <form className="calc-taxas" onSubmit={salvarTaxas}>
            <small className="calc-ajuda">{t('Coloque as taxas da sua maquininha (em %). Ficam guardadas neste aparelho.')}</small>
            <label>{t('Pix')}<input inputMode="decimal" value={ajustando.pix} onChange={(e) => setAjustando({ ...ajustando, pix: e.target.value })} /></label>
            <label>{t('Débito')}<input inputMode="decimal" value={ajustando.debito} onChange={(e) => setAjustando({ ...ajustando, debito: e.target.value })} /></label>
            {ajustando.credito.map((c, i) => (
              <label key={i}>{t('Crédito {n}x', { n: i + 1 })}<input inputMode="decimal" value={c} onChange={(e) => setAjustando({ ...ajustando, credito: ajustando.credito.map((x, j) => (j === i ? e.target.value : x)) })} /></label>
            ))}
            <div className="calc-botoes">
              <button type="button" className="sec" onClick={() => setAjustando({ pix: emTexto(TAXAS_PADRAO.pix), debito: emTexto(TAXAS_PADRAO.debito), credito: TAXAS_PADRAO.credito.map(emTexto) })}>{t('Voltar ao padrão')}</button>
              <button type="submit">{t('Salvar')}</button>
            </div>
          </form>
        ) : (<>
          <div className="an-abas calc-abas">
            {[['debito', 'Débito'], ['credito', 'Crédito'], ['pix', 'Pix']].map(([id, nome]) => (
              <button key={id} className={forma === id ? 'on' : ''} onClick={() => setForma(id)}>{t(nome)}</button>
            ))}
          </div>

          <label className="calc-valor">{t('Qual o valor da venda?')}
            <input inputMode="decimal" placeholder="R$ 0,00" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
          </label>

          <div className="calc-resultado">
            <div><span>{t('Seu cliente paga')}</span><b>{brl(clientePaga)}</b></div>
            {nParc > 1 && <div className="calc-parc"><span /><small>{t('{n}x de {valor}', { n: nParc, valor: brl(r2(clientePaga / nParc)) })}</small></div>}
            <div><span>{t('Taxa ({p})', { p: pctTxt(taxa) })}</span><b className={custo > 0 ? 'bad' : ''}>{custo > 0 ? '− ' + brl(custo) : brl(0)}</b></div>
            <div className="calc-recebe"><span>{t('Você recebe')}</span><b>{brl(voceRecebe)}</b></div>
          </div>

          {forma === 'credito' && (
            <div className="calc-linha">
              <span>{t('Parcelas')}</span>
              <div className="calc-passo">
                <button className="in-icone" disabled={parcelas <= 1} onClick={() => setParcelas(parcelas - 1)} aria-label={t('Menos parcelas')}>‹</button>
                <span>{t('Crédito {n}x', { n: parcelas })}<small>({pctTxt(taxa)})</small></span>
                <button className="in-icone" disabled={parcelas >= 12} onClick={() => setParcelas(parcelas + 1)} aria-label={t('Mais parcelas')}>›</button>
              </div>
            </div>
          )}

          <label className="calc-linha calc-chave">
            <span>{t('Repassar taxa')}<small>{t('O cliente paga a taxa e você recebe o valor cheio')}</small></span>
            <input type="checkbox" className="interruptor" checked={repassar} onChange={(e) => setRepassar(e.target.checked)} />
          </label>

          <button className="link pequeno calc-ajustar" onClick={() => setAjustando({ pix: emTexto(taxas.pix), debito: emTexto(taxas.debito), credito: taxas.credito.map(emTexto) })}>{t('Ajustar taxas')}</button>
        </>)}
      </div>
    </div>,
    document.body,
  )
}
