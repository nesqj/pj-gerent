import { useEffect, useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { trabalhaCom } from './NovoProduto.jsx'
import { t } from '../i18n.js'
import {
  brl, calcularVenda, chave, dataTs, descricaoPreco, escolhaProduto, formulaRegra, gravarPrecoFornecedor, lerValor, nomeFornecedor, norm,
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
const paraSelect = (e) => (e.tipo === 'regra' ? 'r:' + e.regraId : e.tipo)
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
        <option value="padrao">{padrao ? t('Padrão: {nome}', { nome: padrao.nome }) : t('Padrão: sem regra')}</option>
        {regras.map((r) => <option key={r.id} value={'r:' + r.id}>{r.nome} ({formulaRegra(r)})</option>)}
        <option value="nenhuma">{t('Sem regra (preço = custo)')}</option>
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
  const [marcados, setMarcados] = useState({}) // produtos marcados para aplicar uma regra de uma vez
  const [aplicar, setAplicar] = useState('padrao')

  const regras = regrasDe(db)
  const itens = produtosAVenda(db)
  const item = itens.find((i) => i.k === sel)
  const ofertas = item
    ? db.precosForn.filter((p) => chave(p.produto, p.marca) === item.k).sort((a, b) => +a.preco - +b.preco)
    : []
  const ff = FornecedoresDoProduto({ db, executar, item: item || {}, ofertas })
  const fornecedoresDe = (k) => db.precosForn.filter((p) => chave(p.produto, p.marca) === k)

  const b = norm(busca)
  const tabela = itens.filter((i) => !b || norm(i.produto + ' ' + i.marca + ' ' + nomeFornecedor(db, i.fornecedorId)).includes(b))
  const qtdMarcados = tabela.filter((i) => marcados[i.k]).length
  const todosMarcados = tabela.length > 0 && qtdMarcados === tabela.length

  async function aplicarNosMarcados() {
    const ks = tabela.filter((i) => marcados[i.k]).map((i) => i.k)
    if (!ks.length) return
    if (aplicar === 'fixo') return
    const ok = await executar(async (A) => { for (const k of ks) await A.salvarPrecoProduto(k, deSelect(aplicar)) })
    if (ok) setMarcados({})
  }

  return (
    <section>
      {embutido ? <h3 className="titulo-produtos">{t('Produtos e preços de venda')}</h3> : <h2>{t('Tabela de Venda')}</h2>}
      <p><small>{t('Escolha a regra de cada produto na coluna "Regra". Para criar ou mudar regras, use a aba "Regra de Preço".')}</small></p>

      {itens.length === 0 && <p className="warn">{t('Cadastre produtos nos fornecedores primeiro.')}</p>}

      {/* ---------- Produto selecionado ---------- */}
      {item && (
        <>
          <div className="resultado">
            <div><small>{t('Produto')}</small><b>{item.produto}{item.marca ? ` — ${item.marca}` : ''}</b></div>
            <div><small>{t('Fornecedor mais barato')}</small><b>{nomeFornecedor(db, item.fornecedorId)}</b></div>
            <div><small>{t('Menor preço')}</small><b>{brl(item.custo)}</b></div>
            <div><small>{t('Regra')}</small><SeletorPreco db={db} executar={executar} k={item.k} custo={item.custo} /></div>
            <div className="destaque"><small>{t('Preço de venda')}</small><b>{brl(item.preco)}</b></div>
            <div><button className="sec" onClick={() => setSel('')}>{t('Ver todos')}</button></div>
          </div>

          <div className="tw">
            <table>
              <thead>
                <tr><th>{t('Fornecedor')}</th><th className="n">{t('Preço')}</th><th className="n">{t('Venda calculada')}</th><th>{t('Atualizado')}</th><th></th></tr>
              </thead>
              <tbody>
                {ofertas.map((p, n) => (
                  <tr key={p.id} className={n === 0 ? 'best' : ''}>
                    <td>{nomeFornecedor(db, p.fornecedorId)}</td>
                    <td className="n">{ff.editando?.id === p.id
                      ? <input className="cel" inputMode="decimal" autoFocus value={ff.editando.preco} onChange={(e) => ff.setEditando({ ...ff.editando, preco: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') ff.salvarPreco(p); if (e.key === 'Escape') ff.setEditando(null) }} />
                      : brl(p.preco)}</td>
                    <td className="n">{brl(item.resolucao.tipo === 'regra' ? calcularVenda(p.preco, item.resolucao.regra) : item.resolucao.tipo === 'fixo' ? item.preco : p.preco)}</td>
                    <td>{dataTs(p.atualizado)}</td>
                    <td className="n acoes-fiado">
                      {ff.editando?.id === p.id
                        ? <><button className="edit" onClick={() => ff.salvarPreco(p)}>{t('Salvar')}</button>{' '}<button className="sec" onClick={() => ff.setEditando(null)}>×</button></>
                        : <><button className="edit" onClick={() => ff.setEditando({ id: p.id, preco: String(p.preco).replace('.', ',') })}>{t('Mudar preço')}</button>{' '}<button className="del" onClick={() => ff.remover(p)}>{t('Remover')}</button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ff.semEste.length > 0 && (
            <form className="inline-form adicionar-forn" onSubmit={ff.adicionar}>
              <small>{t('Outro fornecedor também tem este produto?')}</small>
              <select value={ff.novo.fornecedorId || ff.semEste[0].id} onChange={(e) => ff.setNovo({ ...ff.novo, fornecedorId: e.target.value })}>
                {ff.semEste.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              <input inputMode="decimal" placeholder={t('Preço (R$)')} style={{ width: 110 }} value={ff.novo.preco} onChange={(e) => ff.setNovo({ ...ff.novo, preco: e.target.value })} />
              <button type="submit">+ {t('Adicionar')}</button>
            </form>
          )}
        </>
      )}

      {/* ---------- Tabela com todos os produtos ---------- */}
      {!item && itens.length > 0 && (
        <>
          <div className="linha-titulo">
            <input className="busca" style={{ marginBottom: 0 }} placeholder={t('Buscar produto, marca ou fornecedor...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
            {qtdMarcados > 0 && (
              <div className="aplicar-lote">
                <small>{t('{n} selecionado(s):', { n: qtdMarcados })}</small>
                <select value={aplicar} onChange={(e) => setAplicar(e.target.value)}>
                  <option value="padrao">{t('Usar a regra padrão')}</option>
                  {regras.map((r) => <option key={r.id} value={'r:' + r.id}>{r.nome} ({formulaRegra(r)})</option>)}
                  <option value="nenhuma">{t('Sem regra (preço = custo)')}</option>
                </select>
                <button onClick={aplicarNosMarcados}>{t('Aplicar')}</button>
              </div>
            )}
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" checked={todosMarcados} title={t('Selecionar todos')}
                    onChange={(e) => setMarcados(e.target.checked ? Object.fromEntries(tabela.map((i) => [i.k, true])) : {})} /></th>
                  <th>{t('Produto')}</th><th>{t('Marca')}</th><th>{t('Fornecedores')}</th><th className="n">{t('Menor custo')}</th>
                  <th>{t('Regra')}</th><th className="n">{t('Preço de venda')}</th><th className="n">{t('Lucro')}</th>
                </tr>
              </thead>
              <tbody>
                {tabela.length === 0 && <tr><td colSpan="8" className="vazio">{t('Nada encontrado.')}</td></tr>}
                {tabela.map((i) => (
                  <tr key={i.k} className={'clicavel' + (marcados[i.k] ? ' em-edicao' : '')} onClick={() => setSel(i.k)} title={descricaoPreco(i.resolucao)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={!!marcados[i.k]} onChange={(e) => setMarcados({ ...marcados, [i.k]: e.target.checked })} />
                    </td>
                    <td>{i.produto}</td>
                    <td>{i.marca || '-'}</td>
                    <td title={fornecedoresDe(i.k).map((o) => nomeFornecedor(db, o.fornecedorId) + ': ' + brl(o.preco)).join('\n')}>
                      {nomeFornecedor(db, i.fornecedorId)}{fornecedoresDe(i.k).length > 1 && <small className="sub-linha">{t('+ {n} fornecedor(es)', { n: fornecedoresDe(i.k).length - 1 })}</small>}
                    </td>
                    <td className="n">{brl(i.custo)}</td>
                    <td><SeletorPreco db={db} executar={executar} k={i.k} custo={i.custo} /></td>
                    <td className="n"><b className="ok">{brl(i.preco)}</b></td>
                    <td className="n"><span className={i.preco - i.custo < 0 ? 'bad' : ''}>{brl(i.preco - i.custo)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
