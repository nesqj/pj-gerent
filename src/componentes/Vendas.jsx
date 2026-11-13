import { useState } from 'react'
import { avisar } from '../avisos.js'
import { t } from '../i18n.js'
import { brl, num, calcularEstoque, classeEstoque, dataBR, hoje, hora, norm, PAGAMENTOS, descricaoPreco, produtosAVenda, uid } from '../utils.js'

const itemNovo = { k: '', qtd: '1', preco: '' } // preco: digitado só para produtos do estoque

export default function Vendas({ db, executar }) {
  const [item, setItem] = useState(itemNovo)
  const [carrinho, setCarrinho] = useState([])
  const [pagamento, setPagamento] = useState('Dinheiro')
  const [desconto, setDesconto] = useState('') // % de desconto na venda (opcional)
  const [dia, setDia] = useState(hoje())
  const [editando, setEditando] = useState(null) // venda sendo editada (carregada no carrinho)

  // Duas origens de produtos:
  // - Estoque: produtos próprios, preço digitado na hora da venda, controla quantidade
  // - Fornecedores: preço calculado na aba "Preços de Venda", sem controle de quantidade
  const estoque = calcularEstoque(db)
  const doEstoque = [...estoque.values()]
    .map((s) => ({ id: 'e:' + s.k, origem: 'estoque', k: s.k, produto: s.produto, marca: '', preco: null, custo: s.custo }))
    .sort((a, b) => a.produto.localeCompare(b.produto))
  const dosFornecedores = produtosAVenda(db).map((p) => ({ ...p, id: 'c:' + p.k, origem: 'fornecedor' }))
  const opcoes = [...doEstoque, ...dosFornecedores]
  const selecionado = opcoes.find((x) => x.id === item.k)
  const subtotalCarrinho = carrinho.reduce((s, i) => s + (+i.qtd || 0) * (+i.preco || 0), 0)
  const pctDesconto = Math.min(100, Math.max(0, +desconto || 0))
  const valorDesconto = Math.round(subtotalCarrinho * pctDesconto) / 100
  const totalCarrinho = Math.round((subtotalCarrinho - valorDesconto) * 100) / 100

  // estoque disponível = estoque salvo + o que a venda em edição já tinha tirado − o que está no carrinho
  const doEstoqueEm = (itens, k) => itens.filter((i) => i.origem === 'estoque' && norm(i.produto) === k).reduce((s, i) => s + +i.qtd, 0)
  const disponivel = (k) => (estoque.get(k)?.saldo ?? 0) + (editando ? doEstoqueEm(editando.itens, k) : 0) - doEstoqueEm(carrinho, k)

  function alterarItem(n, campo, valor) {
    setCarrinho(carrinho.map((i, x) => (x === n ? { ...i, [campo]: valor === '' ? '' : +valor } : i)))
  }

  function editar(v) {
    setEditando(v)
    setCarrinho(v.itens.map((i) => ({ ...i })))
    setPagamento(v.pagamento)
    setDesconto(v.descontoPct ? String(v.descontoPct) : '')
    setItem(itemNovo)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setCarrinho([])
    setEditando(null)
    setPagamento('Dinheiro')
    setDesconto('')
  }

  function escolherProduto(k) {
    setItem({ ...item, k, preco: '' })
  }

  function adicionar(e) {
    e.preventDefault()
    const p = selecionado
    if (!p) return
    if (p.origem === 'estoque') {
      const disp = disponivel(p.k)
      if (+item.qtd > disp && !confirm(
        t('Estoque insuficiente de "{produto}": {disp} disponível(is).\nVender {qtd} mesmo assim? O estoque ficará negativo.', { produto: p.produto, disp: Math.max(disp, 0), qtd: item.qtd }),
      )) return
    }
    const preco = p.origem === 'estoque' ? +item.preco : p.preco
    setCarrinho([...carrinho, { produto: p.produto, marca: p.marca, qtd: +item.qtd, preco, custo: p.custo, origem: p.origem }])
    setItem(itemNovo)
  }

  async function finalizar() {
    if (!carrinho.length) return
    if (carrinho.some((i) => !(+i.qtd > 0) || i.preco === '' || +i.preco < 0)) return alert(t('Confira a quantidade e o preço de todos os itens.'))
    const itens = carrinho.map((i) => ({ ...i, qtd: +i.qtd, preco: +i.preco }))
    if (desconto !== '' && (+desconto < 0 || +desconto > 100)) return alert(t('O desconto precisa ser entre 0% e 100%.'))
    const subtotal = itens.reduce((s, i) => s + i.qtd * i.preco, 0)
    const descontoPct = pctDesconto
    const descontoValor = Math.round(subtotal * descontoPct) / 100
    const total = Math.round((subtotal - descontoValor) * 100) / 100
    // editando: mantém id, data e dia originais
    const venda = editando
      ? { ...editando, itens, pagamento, subtotal, descontoPct, descontoValor, total }
      : { id: uid(), data: Date.now(), dia: hoje(), itens, pagamento, subtotal, descontoPct, descontoValor, total }
    // produtos do estoque que vão ficar com 2 ou menos depois desta venda
    const baixos = [...new Set(itens.filter((i) => i.origem === 'estoque').map((i) => norm(i.produto)))]
      .map((k) => ({ nome: estoque.get(k)?.produto, resta: disponivel(k) }))
      .filter((p) => p.nome && p.resta <= 2)
    if (await executar((A) => A.salvarVenda(venda))) {
      if (!editando) setDia(hoje())
      cancelar()
      if (db.config?.avisosEstoque !== false) {
        for (const p of baixos) avisar(t('Estoque baixo'), p.resta <= 0 ? t('{nome}: acabou o estoque.', { nome: p.nome }) : t('{nome}: restam {n} unidade(s).', { nome: p.nome, n: p.resta }))
      }
    }
  }

  function excluir(v) {
    if (confirm(t('Excluir a venda de {total} das {hora}?\nOs itens voltam para o estoque.', { total: brl(v.total), hora: hora(v.data) }))) {
      executar((A) => A.excluirVenda(v.id)).then((ok) => ok && editando?.id === v.id && cancelar())
    }
  }

  // Vendas do dia escolhido
  const vendasDia = db.vendas.filter((v) => v.dia === dia).sort((a, b) => b.data - a.data)
  const totalDia = vendasDia.reduce((s, v) => s + v.total, 0)
  const custoDia = vendasDia.reduce((s, v) => s + v.itens.reduce((c, i) => c + (i.custo ?? 0) * i.qtd, 0), 0)
  const semCusto = vendasDia.some((v) => v.itens.some((i) => i.custo == null))
  const porPagamento = PAGAMENTOS.map((p) => ({
    p, total: vendasDia.filter((v) => v.pagamento === p).reduce((s, v) => s + v.total, 0),
  }))

  return (
    <section>
      <h2>{t('Vendas')}</h2>

      {/* ---------- Nova venda ---------- */}
      <form onSubmit={adicionar}>
        <label style={{ flex: '2 1 240px' }}>{t('Produto')}
          <select required value={item.k} onChange={(e) => escolherProduto(e.target.value)}>
            <option value="">{t('Selecione um produto...')}</option>
            {doEstoque.length > 0 && (
              <optgroup label={t('Estoque')}>
                {doEstoque.map((p) => (
                  <option key={p.id} value={p.id}>{p.produto} · {t('estoque')}: {disponivel(p.k)}</option>
                ))}
              </optgroup>
            )}
            {dosFornecedores.length > 0 && (
              <optgroup label={t('Produtos dos fornecedores')}>
                {dosFornecedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.produto}{p.marca ? ` — ${p.marca}` : ''} ({brl(p.preco)})</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label style={{ flex: '0 1 100px' }}>{t('Qtd.')}
          <input type="number" min="1" step="1" required value={item.qtd} onChange={(e) => setItem({ ...item, qtd: e.target.value })} />
        </label>
        {selecionado?.origem === 'estoque' ? (
          <label style={{ flex: '0 1 160px' }}>{t('Preço vendido (R$)')} *
            <input type="number" min="0" step="0.01" required placeholder={selecionado.custo != null ? `${t('custo')}: ${brl(selecionado.custo)}` : ''}
              value={item.preco} onChange={(e) => setItem({ ...item, preco: e.target.value })} />
          </label>
        ) : (
          <label style={{ flex: '0 1 160px' }}>{t('Preço de venda')}
            <input readOnly tabIndex={-1} className="somente-leitura" value={selecionado ? brl(selecionado.preco) : ''} placeholder="—" />
          </label>
        )}
        {selecionado?.origem === 'estoque' && (
          <label style={{ flex: '0 1 110px' }}>{t('Em estoque')}
            <input readOnly tabIndex={-1} className={'somente-leitura estoque-' + classeEstoque(disponivel(selecionado.k))}
              value={disponivel(selecionado.k)} />
          </label>
        )}
        <button type="submit">{t('Adicionar')}</button>
      </form>
      <p>
        {selecionado?.origem === 'estoque'
          ? <small>{t('Produto do estoque: digite o preço pelo qual está vendendo.')}</small>
          : selecionado
          ? <small>{t('Preço da aba "Preços de Venda" ({regra}).', { regra: descricaoPreco(selecionado.resolucao) })}</small>
          : <small>{t('Produtos dos fornecedores usam o preço da aba "Preços de Venda".')}</small>}
        {selecionado?.origem === 'fornecedor' && selecionado.resolucao.tipo === 'nenhuma' && <small className="warn"> {t('Este produto está sem regra: o preço de venda é igual ao custo.')}</small>}
      </p>

      {opcoes.length === 0 && <p className="warn">{t('Registre produtos no Estoque ou cadastre produtos nos fornecedores para poder vender.')}</p>}

      {(carrinho.length > 0 || editando) && (
        <div className={'painel' + (editando ? ' painel-edicao' : '')}>
          {editando && (
            <p className="aviso-edicao">
              {t('Editando a venda de {data} às {hora}. Altere quantidades e preços na tabela, remova itens ou adicione novos pelo formulário acima.', { data: dataBR(editando.dia), hora: hora(editando.data) })}
            </p>
          )}
          <div className="tw">
            <table>
              <thead><tr><th>{t('Produto')}</th><th className="n">{t('Qtd.')}</th><th className="n">{t('Unit.')}</th><th className="n">{t('Subtotal')}</th><th></th></tr></thead>
              <tbody>
                {carrinho.length === 0 && <tr><td colSpan="5" className="vazio">{t('Nenhum item. Adicione pelo formulário acima.')}</td></tr>}
                {carrinho.map((i, n) => (
                  <tr key={n}>
                    <td>{i.produto}{i.marca ? ` — ${i.marca}` : ''}</td>
                    <td className="n">
                      <input className="cel" type="number" min="1" step="1" value={i.qtd} onChange={(e) => alterarItem(n, 'qtd', e.target.value)} />
                    </td>
                    <td className="n">
                      {i.origem === 'estoque'
                        ? <input className="cel" type="number" min="0" step="0.01" value={i.preco} onChange={(e) => alterarItem(n, 'preco', e.target.value)} />
                        : brl(i.preco)}
                    </td>
                    <td className="n">{brl((+i.qtd || 0) * (+i.preco || 0))}</td>
                    <td><button className="del" onClick={() => setCarrinho(carrinho.filter((_, x) => x !== n))}>{t('Remover')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="finalizar">
            <label style={{ flex: '0 1 180px' }}>{t('Forma de pagamento')}
              <select value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
                {PAGAMENTOS.map((p) => <option key={p} value={p}>{t(p)}</option>)}
              </select>
            </label>
            <label style={{ flex: '0 1 140px' }}>{t('Desconto (%)')}
              <input type="number" min="0" max="100" step="0.01" placeholder={t('Opcional')} value={desconto} onChange={(e) => setDesconto(e.target.value)} />
            </label>
            <div className="total-grande">
              {pctDesconto > 0 && <small className="riscado">{brl(subtotalCarrinho)}</small>}
              {pctDesconto > 0 && <small className="bad">− {brl(valorDesconto)} ({t('{p}% de desconto', { p: num(pctDesconto, 2) })})</small>}
              <small>{t('Total')}</small><b>{brl(totalCarrinho)}</b>
            </div>
            <button onClick={finalizar} disabled={!carrinho.length}>{editando ? t('Salvar alterações') : t('Finalizar venda')}</button>
            <button className="sec" onClick={cancelar}>{editando ? t('Cancelar edição') : t('Cancelar')}</button>
          </div>
        </div>
      )}

      {/* ---------- Vendas do dia ---------- */}
      <div className="linha-titulo">
        <h3>{t('Vendas de {data}', { data: dataBR(dia) })}</h3>
        <input type="date" value={dia} onChange={(e) => setDia(e.target.value || hoje())} />
      </div>

      <div className="cards">
        <div className="card"><small>{t('Vendas')}</small><b>{vendasDia.length}</b></div>
        <div className="card"><small>{t('Total vendido')}</small><b>{brl(totalDia)}</b></div>
        <div className="card"><small>{t('Lucro estimado')}{semCusto ? ' *' : ''}</small><b className="ok">{brl(totalDia - custoDia)}</b></div>
        {porPagamento.map(({ p, total }) => (
          <div key={p} className="card"><small>{t(p)}</small><b>{brl(total)}</b></div>
        ))}
      </div>

      <div className="tw">
        <table>
          <thead><tr><th>{t('Hora')}</th><th>{t('Itens')}</th><th>{t('Pagamento')}</th><th className="n">{t('Total')}</th><th></th></tr></thead>
          <tbody>
            {vendasDia.length === 0 && <tr><td colSpan="5" className="vazio">{t('Nenhuma venda neste dia.')}</td></tr>}
            {vendasDia.map((v) => (
              <tr key={v.id} className={editando?.id === v.id ? 'em-edicao' : ''}>
                <td>{hora(v.data)}</td>
                <td className="quebra">{v.itens.map((i) => `${i.qtd}× ${i.produto}${i.marca ? ` (${i.marca})` : ''}`).join(', ')}</td>
                <td>{t(v.pagamento)}</td>
                <td className="n">
                  <b>{brl(v.total)}</b>
                  {v.descontoPct > 0 && <small className="desconto-linha">{t('{p}% de desconto', { p: num(v.descontoPct, 2) })}</small>}
                </td>
                <td>
                  <button className="edit" onClick={() => editar(v)}>{t('Editar')}</button>{' '}
                  <button className="del" onClick={() => excluir(v)}>{t('Excluir')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {semCusto && <small>* {t('Algum item vendido não tinha custo informado; o lucro considera custo zero para ele.')}</small>}
    </section>
  )
}
