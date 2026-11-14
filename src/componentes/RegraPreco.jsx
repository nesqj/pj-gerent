import { useEffect, useState } from 'react'
import { aviso } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { podeFazer } from '../armazenamento.js'
import { brl, escolhaProduto, lerValor, norm, pct, produtosAVenda } from '../utils.js'

// Calculadora de preço: cada produto tem um preço de venda fixo (o mesmo para qualquer fornecedor).
// Dá para digitar o preço direto ou a % de aumento sobre o custo (o menor custo entre os fornecedores).
const r2 = (x) => Math.round(x * 100) / 100
const paraTexto = (n, casas) => (n == null || !Number.isFinite(n) ? '' : (casas ? r2(n).toFixed(casas) : String(r2(n))).replace('.', ','))

export default function RegraPreco({ db, executar }) {
  const itens = produtosAVenda(db)
  const podeEditar = podeFazer('preco-venda.salvo')
  const [busca, setBusca] = useState('')
  const [rascunho, setRascunho] = useState({}) // k → { preco, pct } enquanto digita
  const [marcados, setMarcados] = useState({})
  const [pctLote, setPctLote] = useState('')

  // Produtos que ainda usam uma regra antiga: viram preço fixo no valor de hoje (uma vez só)
  const pendentes = itens.filter((i) => escolhaProduto(db, i.k).tipo !== 'fixo' && i.resolucao.tipo === 'regra')
  useEffect(() => {
    if (podeEditar && pendentes.length) executar((A) => A.fixarPrecos(Object.fromEntries(pendentes.map((i) => [i.k, r2(i.preco)]))))
  }, [pendentes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const b = norm(busca)
  const lista = itens.filter((i) => !b || norm(i.produto + ' ' + (i.marca || '')).includes(b))
  const fixo = (i) => escolhaProduto(db, i.k).tipo === 'fixo'
  const aumento = (custo, preco) => (custo > 0 ? ((preco - custo) / custo) * 100 : null)
  const qtdMarcados = lista.filter((i) => marcados[i.k]).length

  async function salvar(i, valor) {
    setRascunho((r) => { const n = { ...r }; delete n[i.k]; return n })
    if (!(valor >= 0)) return aviso.alerta(t('Confira o preço.'))
    if (fixo(i) && r2(valor) === r2(i.preco)) return
    await executar((A) => A.salvarPrecoProduto(i.k, { tipo: 'fixo', valor: r2(valor) }), t('Preço de {produto} salvo.', { produto: i.produto }))
  }
  const confirmarLinha = (i) => {
    const d = rascunho[i.k]
    if (!d) return
    if (d.campo === 'pct') { const p = lerValor(d.valor); if (!Number.isFinite(p)) return aviso.alerta(t('Confira a porcentagem.')); salvar(i, i.custo * (1 + p / 100)) }
    else salvar(i, lerValor(d.valor))
  }
  async function aplicarLote() {
    const p = lerValor(pctLote)
    if (!Number.isFinite(p) || p < 0) return aviso.alerta(t('Informe a porcentagem.'))
    const sel = lista.filter((i) => marcados[i.k])
    if (await executar((A) => A.fixarPrecos(Object.fromEntries(sel.map((i) => [i.k, r2(i.custo * (1 + p / 100))]))), t('Preço de {n} produto(s) calculado com +{p}% sobre o custo.', { n: sel.length, p: paraTexto(p) }))) {
      setMarcados({}); setPctLote('')
    }
  }

  return (
    <section>
      <h2>{t('Calculadora de preço')}</h2>
      <p><small>{t('Defina o preço de venda de cada produto: digite o preço ou a % de aumento sobre o custo (o menor custo entre os fornecedores). O preço vale para qualquer fornecedor.')}</small></p>

      {itens.length === 0 ? <p className="warn">{t('Cadastre produtos na aba Fornecedores primeiro.')}</p> : (
        <>
          <div className="linha-titulo">
            <input className="busca" style={{ marginBottom: 0 }} placeholder={t('Buscar produto ou marca...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
            <small className="qtd-produtos">{t('{n} produto(s) cadastrado(s)', { n: itens.length })}</small>
            {podeEditar && qtdMarcados > 0 && (
              <div className="aplicar-lote">
                <small>{t('{n} de {total} selecionado(s):', { n: qtdMarcados, total: lista.length })}</small>
                <span className="lf-preco" style={{ width: 110 }}><input inputMode="decimal" placeholder="0" value={pctLote} onChange={(e) => setPctLote(e.target.value)} /><span style={{ paddingRight: 10 }}>%</span></span>
                <button onClick={aplicarLote}>{t('Aplicar % sobre o custo')}</button>
              </div>
            )}
          </div>
          <div className="tw">
            <table className="tabela-calc">
              <thead>
                <tr>
                  {podeEditar && <th><input type="checkbox" checked={lista.length > 0 && qtdMarcados === lista.length}
                    onChange={(e) => setMarcados(e.target.checked ? Object.fromEntries(lista.map((i) => [i.k, true])) : {})} /></th>}
                  <th>{t('Produto')}</th><th>{t('Marca')}</th><th className="n">{t('Menor custo')}</th>
                  <th className="n">{t('Aumento (%)')}</th><th className="n">{t('Preço de venda')}</th><th className="n">{t('Lucro')}</th><th className="n">{t('Margem')}</th>
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan="8" className="vazio">{t('Nada encontrado.')}</td></tr>}
                {lista.map((i) => {
                  const d = rascunho[i.k]
                  // o que aparece enquanto digita: se mexeu na %, recalcula o preço; se mexeu no preço, recalcula a %
                  const precoVer = d?.campo === 'pct' ? i.custo * (1 + (lerValor(d.valor) || 0) / 100) : d?.campo === 'preco' ? lerValor(d.valor) : i.preco
                  const pctVer = d?.campo === 'preco' ? aumento(i.custo, lerValor(d.valor)) : d?.campo === 'pct' ? lerValor(d.valor) : aumento(i.custo, i.preco)
                  const lucro = (Number.isFinite(precoVer) ? precoVer : 0) - i.custo
                  const campo = (nome, valor, casas) => ({
                    value: d?.campo === nome ? d.valor : paraTexto(valor, casas),
                    onChange: (e) => setRascunho({ ...rascunho, [i.k]: { campo: nome, valor: e.target.value } }),
                    onBlur: () => confirmarLinha(i),
                    onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRascunho((r) => { const n = { ...r }; delete n[i.k]; return n }) },
                    disabled: !podeEditar,
                  })
                  return (
                    <tr key={i.k} className={marcados[i.k] ? 'em-edicao' : ''}>
                      {podeEditar && <td><input type="checkbox" checked={!!marcados[i.k]} onChange={(e) => setMarcados({ ...marcados, [i.k]: e.target.checked })} /></td>}
                      <td>{i.produto}{!fixo(i) && <small className="sub-linha warn">{t('sem preço definido (= custo)')}</small>}</td>
                      <td>{i.marca || '-'}</td>
                      <td className="n">{brl(i.custo)}</td>
                      <td className="n"><span className="lf-preco calc-campo"><input inputMode="decimal" {...campo('pct', pctVer)} /><span style={{ paddingRight: 10 }}>%</span></span></td>
                      <td className="n"><span className="lf-preco calc-campo"><span>R$</span><input inputMode="decimal" {...campo('preco', precoVer, 2)} /></span></td>
                      <td className="n"><span className={lucro < 0 ? 'bad' : 'ok'}>{lucro < 0 ? '− ' + brl(-lucro) : brl(lucro)}</span></td>
                      <td className="n"><small>{precoVer > 0 ? pct((lucro / precoVer) * 100) : '-'}</small></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p><small>{t('Digite e aperte Enter (ou clique fora) para salvar. Margem = lucro ÷ preço de venda.')}</small></p>
        </>
      )}
    </section>
  )
}
