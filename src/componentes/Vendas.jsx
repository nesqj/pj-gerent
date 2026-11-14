import { useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { avisar } from '../avisos.js'
import { t } from '../i18n.js'
import { brl, num, calcularEstoque, calcularLotes, classeEstoque, dataBR, hoje, hora, norm, PAGAMENTOS, descricaoPreco, produtosAVenda, uid, lucroDe, lucroItem, lucroVenda, pagamentosDaVenda, resumoFiado } from '../utils.js'
import PagamentoVenda, { montarPagamento, novoPagamento, pagamentoDaVenda } from './PagamentoVenda.jsx'

const itemNovo = { k: '', qtd: '1', preco: '' } // preco: digitado só para produtos do estoque

export default function Vendas({ db, executar }) {
  const [item, setItem] = useState(itemNovo)
  const [carrinho, setCarrinho] = useState([])
  const [pg, setPg] = useState(novoPagamento) // pagamento: uma forma, dividido e/ou fiado
  const [desconto, setDesconto] = useState('') // % de desconto na venda (opcional)
  const [dia, setDia] = useState(() => {
    try { const d = sessionStorage.getItem('vendas-dia'); sessionStorage.removeItem('vendas-dia'); if (d) return d } catch { /* sem acesso */ }
    return hoje()
  })
  const [editando, setEditando] = useState(null) // venda sendo editada (carregada no carrinho)

  // Duas origens de produtos:
  // - Estoque: cada entrada é um lote com o próprio custo; você escolhe de qual lote está vendendo.
  //   O preço é digitado na hora da venda, e a quantidade é controlada por lote.
  // - Fornecedores: preço calculado na aba "Preços de Venda", sem controle de quantidade
  const estoque = calcularEstoque(db)
  const lotes = calcularLotes(db)
  // quanto de um lote já está no carrinho (ou na venda em edição, que devolve o que tinha tirado)
  const doLoteEm = (itens, id) => itens.filter((i) => i.origem === 'estoque' && i.entradaId === id).reduce((x, i) => x + (+i.qtd || 0), 0)
  const disponivelLote = (id) => (lotes.get(id)?.saldo ?? 0) + (editando ? doLoteEm(editando.itens, id) : 0) - doLoteEm(carrinho, id)
  const detalheLote = (l) => [`${t('custo')} ${l.custo != null ? brl(l.custo) : '-'}`, l.dia && dataBR(l.dia), l.obs].filter(Boolean).join(' · ')
  const doEstoque = [...lotes.values()]
    .map((l) => ({ id: 'l:' + l.id, entradaId: l.id, origem: 'estoque', k: l.k, produto: l.produto, marca: '', preco: null, custo: l.custo,
      detalhe: detalheLote(l), disp: disponivelLote(l.id) }))
    .filter((o) => o.disp > 0)
    .sort((a, b) => a.produto.localeCompare(b.produto) || (a.custo ?? 0) - (b.custo ?? 0))
  // produtos do estoque sem nenhuma unidade disponível (aparecem desativados na lista)
  const semEstoque = [...estoque.values()].filter((e) => !doEstoque.some((o) => o.k === e.k)).sort((a, b) => a.produto.localeCompare(b.produto))
  const dosFornecedores = produtosAVenda(db).map((p) => ({ ...p, id: 'c:' + p.k, origem: 'fornecedor' }))
  const opcoes = [...doEstoque, ...dosFornecedores]
  const selecionado = opcoes.find((x) => x.id === item.k)
  const subtotalCarrinho = carrinho.reduce((s, i) => s + (+i.qtd || 0) * (+i.preco || 0), 0)
  const pctDesconto = Math.min(100, Math.max(0, +desconto || 0))
  const valorDesconto = Math.round(subtotalCarrinho * pctDesconto) / 100
  const totalCarrinho = Math.round((subtotalCarrinho - valorDesconto) * 100) / 100
  // lucro do carrinho (com o desconto) e prejuízo de quem vende abaixo do custo
  const fatorCarrinho = 1 - pctDesconto / 100
  const lucroCarrinho = lucroDe(carrinho, fatorCarrinho)
  const temCusto = carrinho.some((i) => i.custo != null)
  // preço digitado abaixo do custo (produto do estoque)
  const abaixoDoCusto = selecionado?.origem === 'estoque' && selecionado.custo != null && item.preco !== '' && +item.preco < selecionado.custo

  // estoque disponível = estoque salvo + o que a venda em edição já tinha tirado − o que está no carrinho
  const doEstoqueEm = (itens, k) => itens.filter((i) => i.origem === 'estoque' && norm(i.produto) === k).reduce((s, i) => s + +i.qtd, 0)
  const disponivel = (k) => (estoque.get(k)?.saldo ?? 0) + (editando ? doEstoqueEm(editando.itens, k) : 0) - doEstoqueEm(carrinho, k)

  function alterarItem(n, campo, valor) {
    setCarrinho(carrinho.map((i, x) => (x === n ? { ...i, [campo]: valor === '' ? '' : +valor } : i)))
  }

  function editar(v) {
    // fiado com pagamento já registrado: a venda não muda mais por aqui (só pela aba Fiado)
    const f = resumoFiado(v)
    if (f && (f.recebido > 0 || f.naoPago > 0)) {
      return aviso.alerta(t('Esta venda tem fiado com pagamento já registrado.'), t('Para mudar, use a aba Cobranças (receber, mudar data, não pagou) ou exclua a venda.'))
    }
    setEditando(v)
    setCarrinho(v.itens.map((i) => ({ ...i })))
    setPg(pagamentoDaVenda(v, db.clientes || []))
    setDesconto(v.descontoPct ? String(v.descontoPct) : '')
    setItem(itemNovo)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setCarrinho([])
    setEditando(null)
    setPg(novoPagamento())
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
      const disp = disponivelLote(p.entradaId)
      if (disp <= 0) return aviso.alerta(t('"{produto}" está sem estoque. Registre uma entrada no Estoque para vender.', { produto: p.produto }))
      if (+item.qtd > disp) return aviso.alerta(t('Estoque insuficiente de "{produto}": só há {n} unidade(s).', { produto: p.produto, n: disp }), p.detalhe)
    }
    const preco = p.origem === 'estoque' ? +item.preco : p.preco
    setCarrinho([...carrinho, { produto: p.produto, marca: p.marca, qtd: +item.qtd, preco, custo: p.custo, origem: p.origem,
      ...(p.origem === 'estoque' ? { entradaId: p.entradaId, lote: p.detalhe } : {}) }])
    setItem(itemNovo)
  }

  async function finalizar() {
    if (!carrinho.length) return
    // nenhum lote pode passar do que há (o carrinho pode ter sido alterado na tabela)
    const lotePassou = carrinho.find((i) => i.origem === 'estoque' && i.entradaId && disponivelLote(i.entradaId) < 0)
    if (lotePassou) {
      return aviso.alerta(t('Estoque insuficiente de "{produto}": só há {n} unidade(s).', { produto: lotePassou.produto, n: disponivelLote(lotePassou.entradaId) + doLoteEm(carrinho, lotePassou.entradaId) }), lotePassou.lote)
    }
    // e nenhum produto (vendas antigas, sem lote)
    const passou = [...new Set(carrinho.filter((i) => i.origem === 'estoque').map((i) => norm(i.produto)))].find((k) => disponivel(k) < 0)
    if (passou) {
      const nome = estoque.get(passou)?.produto || passou
      return aviso.alerta(t('Estoque insuficiente de "{produto}": só há {n} unidade(s).', { produto: nome, n: disponivel(passou) + doEstoqueEm(carrinho, passou) }))
    }
    if (carrinho.some((i) => !(+i.qtd > 0) || i.preco === '' || +i.preco < 0)) return aviso.alerta(t('Confira a quantidade e o preço de todos os itens.'))
    const itens = carrinho.map((i) => ({ ...i, qtd: +i.qtd, preco: +i.preco }))
    if (desconto !== '' && (+desconto < 0 || +desconto > 100)) return aviso.alerta(t('O desconto precisa ser entre 0% e 100%.'))
    const subtotal = itens.reduce((s, i) => s + i.qtd * i.preco, 0)
    const descontoPct = pctDesconto
    const descontoValor = Math.round(subtotal * descontoPct) / 100
    const total = Math.round((subtotal - descontoValor) * 100) / 100
    // pagamento: uma forma, dividido e/ou fiado
    const pago = montarPagamento(pg, total, db.clientes || [])
    if (pago.erro) return aviso.alerta(pago.erro)
    if (pago.novoCliente) {
      if (!(await executar((A) => A.salvarCliente(pago.novoCliente)))) return
      setPg((x) => ({ ...x, fiado: { ...x.fiado, clienteId: pago.novoCliente.id } }))
    }
    const extra = { pagamento: pago.pagamento, pagamentos: pago.pagamentos, ...(pago.fiado ? { fiado: pago.fiado } : {}) }
    // editando: mantém id, data e dia originais
    const venda = editando
      ? { ...editando, itens, subtotal, descontoPct, descontoValor, total, ...extra }
      : { id: uid(), data: Date.now(), dia: hoje(), itens, subtotal, descontoPct, descontoValor, total, ...extra }
    if (!pago.fiado) delete venda.fiado
    // produtos do estoque que vão ficar com 2 ou menos depois desta venda
    const baixos = [...new Set(itens.filter((i) => i.origem === 'estoque').map((i) => norm(i.produto)))]
      .map((k) => ({ nome: estoque.get(k)?.produto, resta: disponivel(k) }))
      .filter((p) => p.nome && p.resta <= 2)
    if (await executar((A) => A.salvarVenda(venda))) {
      const resultado = lucroVenda(venda)
      if (venda.fiado) aviso.info(editando ? t('Venda atualizada com fiado.') : t('Venda registrada com fiado.'), t('{valor} a receber de {cliente}. O lucro conta quando você confirmar o pagamento na aba Cobranças.', { valor: brl(resumoFiado(venda).aberto), cliente: venda.fiado.cliente }))
      else if (resultado.lucro < 0) aviso.alerta(editando ? t('Venda atualizada com prejuízo.') : t('Venda registrada com prejuízo.'), t('Perda de {valor} nesta venda.', { valor: brl(-resultado.lucro) }))
      else if (resultado.perda > 0) aviso.alerta(editando ? t('Venda atualizada.') : t('Venda registrada.'), t('Atenção: {n} item(ns) vendido(s) abaixo do custo (perda de {valor}).', { n: resultado.itensComPrejuizo, valor: brl(resultado.perda) }))
      else aviso.ok(editando ? t('Venda atualizada.') : t('Venda registrada.'), brl(venda.total))
      if (!editando) setDia(hoje())
      cancelar()
      if (db.config?.avisosEstoque !== false) {
        for (const p of baixos) {
          const msg = p.resta <= 0 ? t('{nome}: acabou o estoque.', { nome: p.nome }) : t('{nome}: restam {n} unidade(s).', { nome: p.nome, n: p.resta })
          aviso.alerta(t('Estoque baixo'), msg) // na tela
          avisar(t('Estoque baixo'), msg)       // e no celular/computador, se os avisos estiverem ligados
        }
      }
    }
  }

  async function excluir(v) {
    const f = resumoFiado(v)
    const extra = f?.recebido > 0 ? '\n' + t('Os recebimentos do fiado desta venda ({valor}) também serão apagados, e o caixa é ajustado.', { valor: brl(f.recebido) }) : ''
    if (await confirmar(t('Excluir a venda de {total} das {hora}?\nOs itens voltam para o estoque.', { total: brl(v.total), hora: hora(v.data) }) + extra)) {
      executar((A) => A.excluirVenda(v.id), t('Venda excluída.')).then((ok) => ok && editando?.id === v.id && cancelar())
    }
  }

  // Vendas do dia escolhido
  const vendasDia = db.vendas.filter((v) => v.dia === dia).sort((a, b) => b.data - a.data)
  const totalDia = vendasDia.reduce((s, v) => s + v.total, 0)
  const custoDia = vendasDia.reduce((s, v) => s + v.itens.reduce((c, i) => c + (i.custo ?? 0) * i.qtd, 0), 0)
  // lucro só do que já está confirmado (fiado em aberto fica "a confirmar")
  const lucroDia = Math.round(vendasDia.reduce((s, v) => s + lucroVenda(v).lucro, 0) * 100) / 100
  const aConfirmarDia = vendasDia.reduce((s, v) => { const l = lucroVenda(v); return s + (l.pendente ? l.lucroPrevisto : 0) }, 0)
  const perdasDia = vendasDia.reduce((s, v) => s + lucroVenda(v).perda, 0)
  const vendasComPrejuizo = vendasDia.filter((v) => lucroVenda(v).perda > 0).length
  const semCusto = vendasDia.some((v) => v.itens.some((i) => i.custo == null))
  const somaForma = (forma) => vendasDia.reduce((s, v) => s + pagamentosDaVenda(v).filter((x) => x.forma === forma).reduce((a, x) => a + x.valor, 0), 0)
  const porPagamento = [...PAGAMENTOS, 'Fiado'].map((p) => ({ p, total: somaForma(p) })).filter((x) => x.p !== 'Fiado' || x.total > 0)
  const textoPagamento = (v) => { const l = pagamentosDaVenda(v); return l.length > 1 ? l.map((x) => `${t(x.forma)} ${brl(x.valor)}`).join(' + ') : t(l[0]?.forma || v.pagamento) }

  return (
    <section>
      <h2>{t('Novo Registro')}</h2>

      {/* ---------- Nova venda ---------- */}
      <form onSubmit={adicionar}>
        <label style={{ flex: '2 1 240px' }}>{t('Produto')}
          <select required value={item.k} onChange={(e) => escolherProduto(e.target.value)}>
            <option value="">{t('Selecione um produto...')}</option>
            {doEstoque.length + semEstoque.length > 0 && (
              <optgroup label={t('Estoque (escolha a unidade/lote)')}>
                {doEstoque.map((p) => (
                  <option key={p.id} value={p.id}>{p.produto} · {p.detalhe} — {t('{n} un.', { n: p.disp })}</option>
                ))}
                {semEstoque.map((e) => <option key={'sem:' + e.k} value="" disabled>{e.produto} · {t('sem estoque')}</option>)}
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
          <input type="number" min="1" step="1" required max={selecionado?.origem === 'estoque' ? Math.max(1, disponivelLote(selecionado.entradaId)) : undefined}
            value={item.qtd} onChange={(e) => setItem({ ...item, qtd: e.target.value })} />
        </label>
        {selecionado?.origem === 'estoque' ? (
          <label style={{ flex: '0 1 160px' }}>{t('Preço vendido (R$)')} *
            <input type="number" min="0" step="0.01" required placeholder={selecionado.custo != null ? `${t('custo')}: ${brl(selecionado.custo)}` : ''}
              className={abaixoDoCusto ? 'campo-erro' : ''}
              value={item.preco} onChange={(e) => setItem({ ...item, preco: e.target.value })} />
          </label>
        ) : (
          <label style={{ flex: '0 1 160px' }}>{t('Preço de venda')}
            <input readOnly tabIndex={-1} className="somente-leitura" value={selecionado ? brl(selecionado.preco) : ''} placeholder="—" />
          </label>
        )}
        {selecionado?.origem === 'estoque' && (
          <label style={{ flex: '0 1 110px' }}>{t('Em estoque')}
            <input readOnly tabIndex={-1} className={'somente-leitura estoque-' + classeEstoque(disponivelLote(selecionado.entradaId))}
              value={disponivelLote(selecionado.entradaId)} />
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
        {abaixoDoCusto && <small className="bad"> {t('Abaixo do custo ({custo}): prejuízo de {valor} por unidade.', { custo: brl(selecionado.custo), valor: brl(selecionado.custo - +item.preco) })}</small>}
      </p>

      {doEstoque.length + semEstoque.length + dosFornecedores.length === 0 && <p className="warn">{t('Registre produtos no Estoque ou cadastre produtos nos fornecedores para poder vender.')}</p>}

      {(carrinho.length > 0 || editando) && (
        <div className={'painel' + (editando ? ' painel-edicao' : '')}>
          {editando && (
            <p className="aviso-edicao">
              {t('Editando a venda de {data} às {hora}. Altere quantidades e preços na tabela, remova itens ou adicione novos pelo formulário acima.', { data: dataBR(editando.dia), hora: hora(editando.data) })}
            </p>
          )}
          <div className="tw">
            <table>
              <thead><tr><th>{t('Produto')}</th><th className="n">{t('Qtd.')}</th><th className="n">{t('Unit.')}</th><th className="n">{t('Subtotal')}</th><th className="n">{t('Lucro')}</th><th></th></tr></thead>
              <tbody>
                {carrinho.length === 0 && <tr><td colSpan="6" className="vazio">{t('Nenhum item. Adicione pelo formulário acima.')}</td></tr>}
                {carrinho.map((i, n) => {
                  const l = lucroItem(i, fatorCarrinho)
                  return (
                  <tr key={n} className={l != null && l < 0 ? 'linha-prejuizo' : ''}>
                    <td>{i.produto}{i.marca ? ` — ${i.marca}` : ''}{i.lote && <small className="sub-linha">{i.lote}</small>}</td>
                    <td className="n">
                      <input className={'cel' + (i.origem === 'estoque' && (i.entradaId ? disponivelLote(i.entradaId) : disponivel(norm(i.produto))) < 0 ? ' campo-erro' : '')} type="number" min="1" step="1"
                        max={i.origem === 'estoque' ? (i.entradaId ? disponivelLote(i.entradaId) : disponivel(norm(i.produto))) + +i.qtd : undefined}
                        value={i.qtd} onChange={(e) => alterarItem(n, 'qtd', e.target.value)} />
                    </td>
                    <td className="n">
                      {i.origem === 'estoque'
                        ? <input className={'cel' + (i.custo != null && +i.preco < i.custo ? ' campo-erro' : '')} type="number" min="0" step="0.01" value={i.preco} onChange={(e) => alterarItem(n, 'preco', e.target.value)} />
                        : brl(i.preco)}
                    </td>
                    <td className="n">{brl((+i.qtd || 0) * (+i.preco || 0))}</td>
                    <td className="n"><ValorLucro valor={l} /></td>
                    <td><button className="del" onClick={() => setCarrinho(carrinho.filter((_, x) => x !== n))}>{t('Remover')}</button></td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <PagamentoVenda pg={pg} setPg={setPg} total={totalCarrinho} clientes={db.clientes || []} />
          <div className="finalizar">
            <label style={{ flex: '0 1 140px' }}>{t('Desconto (%)')}
              <input type="number" min="0" max="100" step="0.01" placeholder={t('Opcional')} value={desconto} onChange={(e) => setDesconto(e.target.value)} />
            </label>
            <div className="total-grande">
              {pctDesconto > 0 && <small className="riscado">{brl(subtotalCarrinho)}</small>}
              {pctDesconto > 0 && <small className="bad">− {brl(valorDesconto)} ({t('{p}% de desconto', { p: num(pctDesconto, 2) })})</small>}
              <small>{t('Total')}</small><b>{brl(totalCarrinho)}</b>
              {temCusto && (lucroCarrinho.lucro < 0
                ? <small className="bad resultado-venda">{t('Prejuízo')}: − {brl(-lucroCarrinho.lucro)}</small>
                : <small className="ok resultado-venda">{t('Lucro')}: {brl(lucroCarrinho.lucro)}{lucroCarrinho.perda > 0 ? ` · ${t('perda de {valor} abaixo do custo', { valor: brl(lucroCarrinho.perda) })}` : ''}</small>)}
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
        <div className={'card' + (lucroDia < 0 ? ' card-prejuizo' : '')}>
          <small>{lucroDia < 0 ? t('Prejuízo estimado') : t('Lucro estimado')}{semCusto ? ' *' : ''}</small>
          <b className={lucroDia < 0 ? 'bad' : 'ok'}>{lucroDia < 0 ? '− ' + brl(-lucroDia) : brl(lucroDia)}</b>
          {aConfirmarDia > 0 && <small className="var">+ {brl(aConfirmarDia)} {t('a confirmar (fiado)')}</small>}
        </div>
        {perdasDia > 0 && (
          <div className="card card-prejuizo">
            <small>{t('Perdas')}</small>
            <b className="bad">− {brl(perdasDia)}</b>
            <small>{t('{n} venda(s) com item abaixo do custo', { n: vendasComPrejuizo })}</small>
          </div>
        )}
        {porPagamento.map(({ p, total }) => (
          <div key={p} className="card"><small>{t(p)}</small><b>{brl(total)}</b></div>
        ))}
      </div>

      <div className="tw">
        <table>
          <thead><tr><th>{t('Hora')}</th><th>{t('Itens')}</th><th>{t('Pagamento')}</th><th className="n">{t('Total')}</th><th className="n">{t('Lucro')}</th><th></th></tr></thead>
          <tbody>
            {vendasDia.length === 0 && <tr><td colSpan="6" className="vazio">{t('Nenhuma venda neste dia.')}</td></tr>}
            {vendasDia.map((v) => {
              const res = lucroVenda(v)
              const temCustoV = v.itens.some((i) => i.custo != null)
              return (
              <tr key={v.id} className={(editando?.id === v.id ? 'em-edicao' : '') + (res.lucro < 0 ? ' linha-prejuizo' : '')}>
                <td>{hora(v.data)}</td>
                <td className="quebra">{v.itens.map((i) => `${i.qtd}× ${i.produto}${i.marca ? ` (${i.marca})` : ''}`).join(', ')}</td>
                <td className="quebra">{textoPagamento(v)}{v.fiado && <small className="sub-linha">{t('Fiado de {cliente}', { cliente: v.fiado.cliente })}</small>}</td>
                <td className="n">
                  <b>{brl(v.total)}</b>
                  {v.descontoPct > 0 && <small className="desconto-linha">{t('{p}% de desconto', { p: num(v.descontoPct, 2) })}</small>}
                </td>
                <td className="n">
                  {res.pendente ? <span className="pendente">{t('a confirmar')}<small className="sub-linha">{t('previsto {valor}', { valor: brl(res.lucroPrevisto) })}</small></span>
                    : temCustoV ? <ValorLucro valor={res.lucro} /> : '-'}
                  {res.naoPago > 0 && <small className="desconto-linha bad">{t('não pago: {valor}', { valor: brl(res.naoPago) })}</small>}
                  {res.perda > 0 && res.lucro >= 0 && <small className="desconto-linha bad">{t('perda de {valor} abaixo do custo', { valor: brl(res.perda) })}</small>}
                </td>
                <td>
                  <button className="edit" onClick={() => editar(v)}>{t('Editar')}</button>{' '}
                  <button className="del" onClick={() => excluir(v)}>{t('Excluir')}</button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {semCusto && <small>* {t('Algum item vendido não tinha custo informado; o lucro considera custo zero para ele.')}</small>}
    </section>
  )
}

// Lucro em verde; prejuízo em vermelho, com a palavra "prejuízo"
function ValorLucro({ valor }) {
  if (valor == null) return <small>{t('sem custo')}</small>
  if (valor < 0) return <span className="bad">− {brl(-valor)}<small className="desconto-linha">{t('prejuízo')}</small></span>
  return <span className="ok">{brl(valor)}</span>
}
