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
// Toda vez que abre, a taxa começa em 0%. A % digitada vale para qualquer número de parcelas (mudar as parcelas não muda a taxa).
const r2 = (n) => Math.round(n * 100) / 100

export function Calculadora({ onFechar }) {
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState(1)
  const [taxaTxt, setTaxaTxt] = useState('') // % como a pessoa digitou
  const taxa = Math.max(0, Math.min(99, lerValor(taxaTxt) || 0))
  const mudarTaxa = (txt) => setTaxaTxt(txt)
  const mudarParcelas = (n) => setParcelas(n)

  const v = lerValor(valor) || 0
  // o cliente paga o valor + a taxa (ex.: 100 em 5x com 10% = 110, 5x de 22)
  const clientePaga = v > 0 ? r2(v * (1 + taxa / 100)) : 0
  const nParc = parcelas

  return createPortal(
    <div className="notif-fundo" onClick={onFechar}>
      <div className="notif-folha calc-folha" role="dialog" aria-label={t('Calculadora')} onClick={(e) => e.stopPropagation()}>
        <div className="calc-topo">
          <button className="in-icone" onClick={onFechar} aria-label={t('Fechar')}><IconeFechar /></button>
          <b>{t('Calculadora')}</b>
          <span style={{ width: 44 }} />
        </div>

        <label className="calc-valor">{t('Qual o valor da venda?')}
          <input inputMode="decimal" placeholder="R$ 0,00" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        </label>

        <div className="calc-linha">
          <span>{t('Parcelas')}</span>
          <div className="calc-passo">
            <button className="in-icone" disabled={parcelas <= 1} onClick={() => mudarParcelas(parcelas - 1)} aria-label={t('Menos parcelas')}>‹</button>
            <span>{t('{n}x', { n: parcelas })}</span>
            <button className="in-icone" disabled={parcelas >= 12} onClick={() => mudarParcelas(parcelas + 1)} aria-label={t('Mais parcelas')}>›</button>
          </div>
        </div>

        <label className="calc-linha">
          <span>{t('Taxa da maquininha')}</span>
          <span className="calc-pct"><input inputMode="decimal" placeholder="0" value={taxaTxt} onChange={(e) => mudarTaxa(e.target.value)} /><i>%</i></span>
        </label>

        <div className="calc-resultado">
          <div><span>{t('Seu cliente paga')}</span><b>{brl(clientePaga)}</b></div>
          {nParc > 1 && <div className="calc-parc"><span /><small>{t('{n}x de {valor}', { n: nParc, valor: brl(r2(clientePaga / nParc)) })}</small></div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
