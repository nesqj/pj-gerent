import { Fragment, useEffect, useState } from 'react'
import { podeFazer } from '../armazenamento.js'
import { aviso, confirmar } from '../avisos-tela.jsx'
import NovoProduto, { marcasDisponiveis, trabalhaCom } from './NovoProduto.jsx'
import { t } from '../i18n.js'
import {
  brl, pct, calcularVenda, chave, dataTs, descricaoPreco, escolhaProduto, formulaRegra, gravarPrecoFornecedor, lerValor, nomeFornecedor, norm,
  produtosAVenda, regraPadraoDe, regrasDe, resolverPreco,
} from '../utils.js'

// ---------- Na tela do produto: adicionar um fornecedor ou mudar/remover o preço de um
function FornecedoresDoProduto({ db, executar, item, ofertas }) {
  const semEste = (db.fornecedores || []).filter((x) => !ofertas.some((o) => o.fornecedorId === x.id) && (!item.marca || trabalhaCom(x, item.marca)))
    .sort((a, b) => a.nome.localeCompare(b.nome))
  const [novo, setNovo] = useState({ fornecedorId: '', preco: '' })
  const [editando, setEditando] = useState(null) // { id, preco }
  async function adicionar(e) {
    e.preventDefault()
    const fornecedorId = novo.fornecedorId || semEste[0]?.id
    if (!fornecedorId) return
    if (String(novo.preco).trim() === '' || !(lerValor(novo.preco) >= 0)) return aviso.alerta(t('Informe o preço.'))
    if (await executar((A) => gravarPrecoFornecedor(A, db, { fornecedorId, produto: item.produto, marca: item.marca || '', preco: lerValor(novo.preco) }), t('Fornecedor adicionado.'))) setNovo({ fornecedorId: '', preco: '' })
  }
  async function salvarPreco(o) {
    if (String(editando.preco).trim() === '' || !(lerValor(editando.preco) >= 0)) return aviso.alerta(t('Informe o preço.'))
    if (await executar((A) => gravarPrecoFornecedor(A, db, { id: o.id, fornecedorId: o.fornecedorId, produto: o.produto, marca: o.marca || '', preco: lerValor(editando.preco) }), t('Preço atualizado.'))) setEditando(null)
  }
  async function remover(o) {
    if (await confirmar(t('Tirar "{produto}" do fornecedor {nome}?', { produto: item.produto, nome: nomeFornecedor(db, o.fornecedorId) }))) executar((A) => A.excluirPrecoFornecedor(o.id), t('Fornecedor removido deste produto.'))
  }
  return { semEste, novo, setNovo, adicionar, editando, setEditando, salvarPreco, remover }
}

// Valor do <select> a partir da escolha salva, e o contrário
const paraSelect = (e) => (e.tipo === 'regra' ? 'r:' + e.regraId : e.tipo === 'nenhuma' ? 'padrao' : e.tipo) // "sem regra" saiu: vale a padrão
const deSelect = (v, valorFixo) =>
  v.startsWith('r:') ? { tipo: 'regra', regraId: v.slice(2) } : v === 'fixo' ? { tipo: 'fixo', valor: valorFixo } : { tipo: v }

// Escolha do preço de UM produto: regra padrão, uma regra, sem regra ou preço fixo
function SeletorPreco({ db, executar, k, custo }) {
  const regras = regrasDe(db)
  const padrao = regraPadraoDe(db)
  const escolha = escolhaProduto(db, k)
  const [fixo, setFixo] = useState(escolha.tipo === 'fixo' ? String(escolha.valor) : '')
  useEffect(() => { if (escolha.tipo === 'fixo') setFixo(String(escolha.valor)) }, [escolha.tipo, escolha.valor])

  function mudar(v) {
    if (v === 'fixo') {
      // começa com o preço que o produto tem hoje, para só ajustar
      const atual = String(resolverPreco(db, k, custo).preco)
      setFixo(atual)
      return executar((A) => A.salvarPrecoProduto(k, { tipo: 'fixo', valor: +atual }))
    }
    executar((A) => A.salvarPrecoProduto(k, deSelect(v)))
  }

  function salvarFixo() {
    if (fixo === '' || +fixo < 0 || +fixo === +escolha.valor) return
    executar((A) => A.salvarPrecoProduto(k, { tipo: 'fixo', valor: +fixo }))
  }

  return (
    <span className="seletor-preco" onClick={(e) => e.stopPropagation()}>
      <select value={paraSelect(escolha)} onChange={(e) => mudar(e.target.value)}>
        <option value="padrao">{padrao ? t('Padrão: {nome}', { nome: padrao.nome }) : t('Padrão: Sem regra')}</option>
        {regras.map((r) => <option key={r.id} value={'r:' + r.id}>{r.nome} ({formulaRegra(r)})</option>)}
        <option value="fixo">{t('Preço fixo')}</option>
      </select>
      {escolha.tipo === 'fixo' && (
        <input className="cel" type="number" min="0" step="0.01" value={fixo} title={t('Preço fixo')}
          onChange={(e) => setFixo(e.target.value)} onBlur={salvarFixo}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
      )}
    </span>
  )
}

export default function PrecosVenda({ db, executar, embutido }) {
  const [sel, setSel] = useState('')
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState({}) // produtos marcados (aplicar % ou excluir de uma vez)
  const [rascunho, setRascunho] = useState({}) // k → { campo: 'pct' | 'preco', valor } enquanto digita
  const [pctLote, setPctLote] = useState('')
  const podeEditarPreco = podeFazer('preco-venda.salvo')
  const [aplicar, setAplicar] = useState('padrao')
  const [nomeEd, setNomeEd] = useState(null) // { produto, marca } em edição
  const [cadastrando, setCadastrando] = useState(false)
  const [ordem, setOrdem] = useState('az') // 'az' (alfabética) ou 'recentes' (ordem de cadastro, mais novos primeiro)

  const regras = regrasDe(db)
  const itens = produtosAVenda(db)
  const item = itens.find((i) => i.k === sel)
  const ofertas = item
    ? db.precosForn.filter((p) => chave(p.produto, p.marca) === item.k).sort((a, b) => +a.preco - +b.preco)
    : []
  const ff = FornecedoresDoProduto({ db, executar, item: item || {}, ofertas })
  const fornecedoresDe = (k) => db.precosForn.filter((p) => chave(p.produto, p.marca) === k)

  const criadoEm = (o) => { const n = parseInt(String(o.id || '').slice(0, 8), 36); return Number.isFinite(n) && n > 1e12 ? n : (o.atualizado || 0) }
  const cadastro = (k) => Math.min(...fornecedoresDe(k).map(criadoEm))
  const b = norm(busca)
  const tabela = itens.filter((i) => !b || norm(i.produto + ' ' + i.marca + ' ' + nomeFornecedor(db, i.fornecedorId)).includes(b))
  if (ordem === 'recentes') tabela.sort((x, y) => cadastro(y.k) - cadastro(x.k))
  const qtdMarcados = tabela.filter((i) => marcados[i.k]).length
  const todosMarcados = tabela.length > 0 && qtdMarcados === tabela.length

  async function salvarNome(i) {
    const produto = (nomeEd?.produto || '').trim()
    const marca = (nomeEd?.marca || '').trim()
    if (!produto) return aviso.alerta(t('Informe o nome do produto.'))
    if (chave(produto, marca) === i.k && produto === i.produto && marca === (i.marca || '')) return
    const existe = itens.some((x) => x.k === chave(produto, marca) && x.k !== i.k)
    if (existe && !(await confirmar(t('Já existe "{produto}" com essa marca. Juntar os dois em um só?', { produto: produto + (marca ? ' — ' + marca : '') })))) return
    if (await executar((A) => A.renomearProduto(i.k, produto, marca), t('Nome do produto atualizado.'))) setSel(chave(produto, marca))
  }

  // ---------- preço de venda fixo (era a aba "Calculadora de preço")
  const r2 = (x) => Math.round(x * 100) / 100
  const paraTexto = (n, casas) => (n == null || !Number.isFinite(n) ? '' : (casas ? r2(n).toFixed(casas) : String(r2(n))).replace('.', ','))
  const fixo = (i) => escolhaProduto(db, i.k).tipo === 'fixo'
  const aumento = (custo, preco) => (custo > 0 ? ((preco - custo) / custo) * 100 : null)
  // produtos que ainda usam uma regra antiga: viram preço fixo no valor de hoje (uma vez só)
  const pendentes = itens.filter((i) => !fixo(i) && i.resolucao.tipo === 'regra')
  useEffect(() => {
    if (podeEditarPreco && pendentes.length) executar((A) => A.fixarPrecos(Object.fromEntries(pendentes.map((i) => [i.k, r2(i.preco)]))))
  }, [pendentes.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const limparRascunho = (k) => setRascunho((r) => { const n = { ...r }; delete n[k]; return n })
  async function salvarPrecoVenda(i, valor) {
    limparRascunho(i.k)
    if (!(valor >= 0)) return aviso.alerta(t('Confira o preço.'))
    if (fixo(i) && r2(valor) === r2(i.preco)) return
    await executar((A) => A.salvarPrecoProduto(i.k, { tipo: 'fixo', valor: r2(valor) }), t('Preço de {produto} salvo.', { produto: i.produto }))
  }
  function confirmarLinha(i) {
    const d = rascunho[i.k]
    if (!d) return
    if (d.campo === 'pct') { const p = lerValor(d.valor); if (!Number.isFinite(p)) return aviso.alerta(t('Confira a porcentagem.')); salvarPrecoVenda(i, i.custo * (1 + p / 100)) }
    else salvarPrecoVenda(i, lerValor(d.valor))
  }
  async function aplicarPctLote() {
    const p = lerValor(pctLote)
    if (!Number.isFinite(p) || p < 0) return aviso.alerta(t('Informe a porcentagem.'))
    const lista = tabela.filter((i) => marcados[i.k])
    if (await executar((A) => A.fixarPrecos(Object.fromEntries(lista.map((i) => [i.k, r2(i.custo * (1 + p / 100))]))), t('Preço de {n} produto(s) calculado com +{p}% sobre o custo.', { n: lista.length, p: paraTexto(p) }))) {
      setMarcados({}); setPctLote('')
    }
  }

  async function excluirProduto(i) {
    const lista = fornecedoresDe(i.k)
    const nome = i.produto + (i.marca ? ' — ' + i.marca : '')
    if (!(await confirmar(lista.length > 1
      ? t('Excluir "{produto}" de todos os {n} fornecedores?', { produto: nome, n: lista.length })
      : t('Excluir "{produto}"?', { produto: nome }), { perigo: true }))) return
    if (await executar(async (A) => { for (const o of lista) await A.excluirPrecoFornecedor(o.id) }, t('Produto excluído.'))) {
      if (sel === i.k) setSel('')
    }
  }

  // exclui de uma vez os produtos marcados (de todos os fornecedores de cada um)
  async function excluirMarcados() {
    const lista = tabela.filter((i) => marcados[i.k])
    if (!lista.length) return
    if (!(await confirmar(t('Excluir {n} produto(s) selecionado(s)?\nEles saem de todos os fornecedores. Não dá para desfazer.', { n: lista.length }), { perigo: true }))) return
    const ids = lista.flatMap((i) => fornecedoresDe(i.k).map((o) => o.id))
    if (await executar(async (A) => { for (const id of ids) await A.excluirPrecoFornecedor(id) }, t('{n} produto(s) excluído(s).', { n: lista.length }))) {
      setMarcados({})
      if (lista.some((i) => i.k === sel)) setSel('')
    }
  }

  async function aplicarNosMarcados() {
    const ks = tabela.filter((i) => marcados[i.k]).map((i) => i.k)
    if (!ks.length) return
    if (aplicar === 'fixo') return
    const ok = await executar(async (A) => { for (const k of ks) await A.salvarPrecoProduto(k, deSelect(aplicar)) })
    if (ok) setMarcados({})
  }

  return (
    <section>
      {embutido ? (
        <div className="linha-titulo titulo-produtos">
          <h3>{t('Produtos e preços de venda')}</h3>
          {(db.fornecedores || []).length > 0 && !cadastrando && <button onClick={() => setCadastrando(true)}>+ {t('Cadastrar produto')}</button>}
        </div>
      ) : <h2>{t('Tabela de Venda')}</h2>}
      {cadastrando && <NovoProduto db={db} executar={executar} aoTerminar={(k) => { setCadastrando(false); if (k) setSel(k) }} />}
      <p><small>{t('Digite o preço de venda ou a % de aumento sobre o custo (o menor custo entre os fornecedores) e aperte Enter. O preço vale para qualquer fornecedor.')}</small></p>

      {itens.length === 0 && <p className="warn">{t('Cadastre produtos nos fornecedores primeiro.')}</p>}

      {/* ---------- Tabela com todos os produtos ---------- */}
      {itens.length > 0 && (
        <>
          <div className="linha-titulo">
            <input className="busca" style={{ marginBottom: 0 }} placeholder={t('Buscar produto, marca ou fornecedor...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
            <small className="qtd-produtos">{b ? t('{n} de {total} produto(s)', { n: tabela.length, total: itens.length }) : t('{n} produto(s) cadastrado(s)', { n: itens.length })}</small>
            <div className="chips">
              <button className={'filtro' + (ordem === 'az' ? ' ativo' : '')} onClick={() => setOrdem('az')}>{t('A–Z')}</button>
              <button className={'filtro' + (ordem === 'recentes' ? ' ativo' : '')} onClick={() => setOrdem('recentes')}>{t('Mais recentes')}</button>
            </div>
            {qtdMarcados > 0 && (
              <div className="aplicar-lote">
                <small>{t('{n} de {total} selecionado(s):', { n: qtdMarcados, total: tabela.length })}</small>
                {podeEditarPreco && <>
                  <span className="lf-preco" style={{ width: 100 }}><input inputMode="decimal" placeholder="0" value={pctLote} onChange={(e) => setPctLote(e.target.value)} /><span style={{ paddingRight: 10 }}>%</span></span>
                  <button onClick={aplicarPctLote}>{t('Aplicar % sobre o custo')}</button>
                </>}
                <button className="del" onClick={excluirMarcados}>{t('Excluir selecionados')}</button>
              </div>
            )}
          </div>
          <div className="tw">
            <table className="tabela-calc">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={todosMarcados} title={t('Selecionar todos')}
                    onChange={(e) => setMarcados(e.target.checked ? Object.fromEntries(tabela.map((i) => [i.k, true])) : {})} /></th>
                  <th>{t('Produto')}</th><th>{t('Marca')}</th><th>{t('Fornecedores')}</th><th className="n">{t('Menor custo')}</th>
                  <th className="n">{t('Aumento (%)')}</th><th className="n">{t('Preço de venda')}</th><th className="n">{t('Lucro')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tabela.length === 0 && <tr><td colSpan="10" className="vazio">{t('Nada encontrado.')}</td></tr>}
                {tabela.map((i) => (
                  <Fragment key={i.k}>
                    <tr className={(marcados[i.k] ? 'em-edicao' : '') + (sel === i.k ? ' linha-aberta' : '')} title={descricaoPreco(i.resolucao)}>
                      <td><input type="checkbox" checked={!!marcados[i.k]} onChange={(e) => setMarcados({ ...marcados, [i.k]: e.target.checked })} /></td>
                      <td>{i.produto}</td>
                      <td>{i.marca || '-'}</td>
                      <td title={fornecedoresDe(i.k).map((o) => nomeFornecedor(db, o.fornecedorId) + ': ' + brl(o.preco)).join('\n')}>
                        {nomeFornecedor(db, i.fornecedorId)}{fornecedoresDe(i.k).length > 1 && <small className="sub-linha">{t('+ {n} fornecedor(es)', { n: fornecedoresDe(i.k).length - 1 })}</small>}
                      </td>
                      <td className="n">{brl(i.custo)}</td>
                      {(() => {
                        const d = rascunho[i.k]
                        // enquanto digita: mexeu na %, recalcula o preço; mexeu no preço, recalcula a %
                        const precoVer = d?.campo === 'pct' ? i.custo * (1 + (lerValor(d.valor) || 0) / 100) : d?.campo === 'preco' ? lerValor(d.valor) : i.preco
                        const pctVer = d?.campo === 'preco' ? aumento(i.custo, lerValor(d.valor)) : d?.campo === 'pct' ? lerValor(d.valor) : aumento(i.custo, i.preco)
                        const lucro = (Number.isFinite(precoVer) ? precoVer : 0) - i.custo
                        const campo = (nome, valor, casas) => ({
                          value: d?.campo === nome ? d.valor : paraTexto(valor, casas),
                          onChange: (e) => setRascunho({ ...rascunho, [i.k]: { campo: nome, valor: e.target.value } }),
                          onBlur: () => confirmarLinha(i),
                          onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') limparRascunho(i.k) },
                          disabled: !podeEditarPreco,
                        })
                        return (
                          <>
                            <td className="n"><span className="lf-preco calc-campo"><input inputMode="decimal" {...campo('pct', pctVer)} /><span style={{ paddingRight: 10 }}>%</span></span></td>
                            <td className="n">
                              <span className="lf-preco calc-campo"><span>R$</span><input inputMode="decimal" {...campo('preco', precoVer, 2)} /></span>
                              {!fixo(i) && <small className="sub-linha warn">{t('sem preço definido (= custo)')}</small>}
                            </td>
                            <td className="n">
                              <span className={lucro < 0 ? 'bad' : 'ok'}>{lucro < 0 ? '− ' + brl(-lucro) : brl(lucro)}</span>
                              {precoVer > 0 && <small className="sub-linha">{t('margem {p}', { p: pct((lucro / precoVer) * 100) })}</small>}
                            </td>
                          </>
                        )
                      })()}
                      <td className="n acoes-fiado">
                        <button className="edit" onClick={() => { ff.setEditando(null); setNomeEd({ produto: i.produto, marca: i.marca || '' }); setSel(sel === i.k ? '' : i.k) }}>{sel === i.k ? t('Fechar') : t('Editar')}</button>{' '}
                        <button className="del" onClick={() => excluirProduto(i)}>{t('Excluir')}</button>
                      </td>
                    </tr>
                    {sel === i.k && (
                      <tr className="linha-edicao-produto">
                        <td colSpan="10">
                          <div className="edicao-produto">
                            {nomeEd && (
                              <form className="ep-nome-form" onSubmit={(e) => { e.preventDefault(); salvarNome(i) }}>
                                <label>{t('Nome do produto')}<input maxLength={80} value={nomeEd.produto} onChange={(e) => setNomeEd({ ...nomeEd, produto: e.target.value })} /></label>
                                <label>{t('Marca')}
                                  <select value={nomeEd.marca} onChange={(e) => setNomeEd({ ...nomeEd, marca: e.target.value })}>
                                    {[...new Set([i.marca || '', ...marcasDisponiveis(db)])].map((m) => <option key={m} value={m}>{m || t('(sem marca)')}</option>)}
                                  </select>
                                </label>
                                <button type="submit" className="edit" disabled={nomeEd.produto.trim() === i.produto && nomeEd.marca === (i.marca || '')}>{t('Salvar')}</button>
                              </form>
                            )}
                            <b>{t('Fornecedores de {produto}', { produto: i.produto + (i.marca ? ' — ' + i.marca : '') })}</b>
                            {ofertas.map((o, n) => (
                              <div key={o.id} className={'ep-linha' + (n === 0 ? ' best' : '')}>
                                <span className="ep-nome">{nomeFornecedor(db, o.fornecedorId)}{n === 0 && <small> · {t('mais barato')}</small>}</span>
                                {ff.editando?.id === o.id
                                  ? <span className="lf-preco"><span>R$</span><input inputMode="decimal" autoFocus value={ff.editando.preco} onChange={(e) => ff.setEditando({ ...ff.editando, preco: e.target.value })}
                                      onKeyDown={(e) => { if (e.key === 'Enter') ff.salvarPreco(o); if (e.key === 'Escape') ff.setEditando(null) }} /></span>
                                  : <span className="ep-preco">{brl(o.preco)}</span>}
                                <span className="acoes-fiado">
                                  {ff.editando?.id === o.id
                                    ? <><button className="edit" onClick={() => ff.salvarPreco(o)}>{t('Salvar')}</button>{' '}<button className="sec" onClick={() => ff.setEditando(null)}>×</button></>
                                    : <><button className="edit" onClick={() => ff.setEditando({ id: o.id, preco: String(o.preco).replace('.', ',') })}>{t('Mudar preço')}</button>{' '}<button className="del" onClick={() => ff.remover(o)}>{t('Remover')}</button></>}
                                </span>
                              </div>
                            ))}
                            {ff.semEste.length > 0 && (
                              <form className="ep-adicionar" onSubmit={ff.adicionar}>
                                <select value={ff.novo.fornecedorId || ff.semEste[0].id} onChange={(e) => ff.setNovo({ ...ff.novo, fornecedorId: e.target.value })}>
                                  {ff.semEste.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                                </select>
                                <span className="lf-preco"><span>R$</span><input inputMode="decimal" placeholder="0,00" value={ff.novo.preco} onChange={(e) => ff.setNovo({ ...ff.novo, preco: e.target.value })} /></span>
                                <button type="submit" className="edit">+ {t('Adicionar fornecedor')}</button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
