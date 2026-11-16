import { useRef, useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { avisar } from '../avisos.js'
import { t } from '../i18n.js'
import { chave, lerValor, resolverPreco } from '../utils.js'
import { brl, num, faturamentoVenda, calcularEstoque, calcularLotes, classeEstoque, dataBR, hoje, hora, norm, PAGAMENTOS, descricaoPreco, produtosAVenda, uid, lucroDe, lucroItem, lucroVenda, pagamentosDaVenda, resumoFiado } from '../utils.js'
import PagamentoVenda, { calcularFiado, montarPagamento, novoPagamento } from './PagamentoVenda.jsx'
import { EmprestimosDoDia, NovoEmprestimo } from './Emprestimo.jsx'
import { podeFazer } from '../armazenamento.js'

const itemNovo = { k: '', qtd: '1', preco: '', forn: '' } // preco: digitado só para produtos do estoque; forn: fornecedor escolhido

export default function Vendas({ db, executar, irPara }) {
  const [modo, setModo] = useState(() => { // 'venda' ou 'emprestimo'
    try { const m = sessionStorage.getItem('registro-modo'); sessionStorage.removeItem('registro-modo'); if (m === 'emprestimo' && podeFazer('emprestimo.salvo')) return m } catch { /* sem acesso */ }
    return 'venda'
  })
  const podeEmprestar = podeFazer('emprestimo.salvo')
  const [item, setItem] = useState(itemNovo)
  // item avulso: produto ou serviço que não está no estoque nem nos fornecedores (custo vira despesa)
  // lembra (neste aparelho) o último jeito de lançar o custo do avulso: R$ ou %, o valor da % e se tira do caixa
  const lembrado = (() => { try { return JSON.parse(localStorage.getItem('avulso-custo') || '{}') } catch { return {} } })()
  const avulsoNovo = { nome: '', tipo: lembrado.tipo || 'produto', qtd: '1', preco: '',
    modoCusto: lembrado.modoCusto || 'valor', custo: lembrado.modoCusto === 'pct' ? (lembrado.pct ?? '') : '' }
  const [avulso, setAvulso] = useState(null) // null = formulário fechado
  const [carrinho, setCarrinho] = useState([])
  const [editandoCusto, setEditandoCusto] = useState(null) // linha do carrinho com o custo do avulso aberto para editar
  const [pg, setPg] = useState(novoPagamento) // pagamento: uma forma, dividido e/ou fiado
  const [desconto, setDesconto] = useState('') // % de desconto na venda (opcional)
  const [dia, setDia] = useState(() => {
    try { const d = sessionStorage.getItem('vendas-dia'); sessionStorage.removeItem('vendas-dia'); if (d) return d } catch { /* sem acesso */ }
    return hoje()
  })

  // Duas origens de produtos:
  // - Estoque: cada entrada é um lote com o próprio custo; você escolhe de qual lote está vendendo.
  //   O preço é digitado na hora da venda, e a quantidade é controlada por lote.
  // - Fornecedores: preço calculado na aba "Fornecedores", sem controle de quantidade
  const estoque = calcularEstoque(db)
  const lotes = calcularLotes(db)
  // quanto de um lote já está no carrinho (ou na venda em edição, que devolve o que tinha tirado)
  const doLoteEm = (itens, id) => itens.filter((i) => i.origem === 'estoque' && i.entradaId === id).reduce((x, i) => x + (+i.qtd || 0), 0)
  const disponivelLote = (id) => (lotes.get(id)?.saldo ?? 0) - doLoteEm(carrinho, id)
  const detalheLote = (l) => [`${t('custo')} ${l.custo != null ? brl(l.custo) : '-'}`, l.obs].filter(Boolean).join(' · ')
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
  // venda com fiado (tudo para depois, ou entrada + fiado): sem desconto.
  // No pagamento dividido, há fiado quando o que foi pago não cobre o total com o desconto.
  const pctDigitado = Math.min(100, Math.max(0, +desconto || 0))
  const pagoDividido = pg.dividir ? pg.linhas.reduce((s, l) => s + (lerValor(l.valor) || 0), 0) : 0
  const comDesconto = Math.round(subtotalCarrinho * (100 - pctDigitado)) / 100
  const fiadoTudo = pg.dividir ? pagoDividido < comDesconto - 0.004 : pg.forma === 'Fiado'
  const pctDesconto = fiadoTudo ? 0 : pctDigitado
  const valorDesconto = Math.round(subtotalCarrinho * pctDesconto) / 100
  const totalCarrinho = Math.round((subtotalCarrinho - valorDesconto) * 100) / 100
  // lucro do carrinho (com o desconto) e prejuízo de quem vende abaixo do custo
  const fatorCarrinho = 1 - pctDesconto / 100
  const lucroCarrinho = lucroDe(carrinho, fatorCarrinho)
  // juros do fiado também são lucro: entram no lucro mostrado no carrinho
  // prévia do fiado (parcelas e juros), mesmo antes de escolher o cliente
  const entradaPrevia = pg.dividir ? pagoDividido : pg.forma === 'Fiado' ? 0 : totalCarrinho
  const restantePrevia = Math.round((totalCarrinho - entradaPrevia) * 100) / 100
  const jurosPctPrevia = String(pg.fiado.juros ?? '').trim() === '' ? 0 : lerValor(pg.fiado.juros)
  const fiadoPrevia = carrinho.length && restantePrevia > 0.004
    ? calcularFiado(restantePrevia, Math.max(1, Math.min(24, parseInt(pg.fiado.parcelas, 10) || 1)), jurosPctPrevia >= 0 ? jurosPctPrevia : 0, pg.fiado.intervalo)
    : null
  const jurosFiado = fiadoPrevia?.juros || 0
  const parcelasPrevia = fiadoPrevia?.valores || []
  const totalComJuros = Math.round((totalCarrinho + jurosFiado) * 100) / 100
  const lucroComJuros = Math.round((lucroCarrinho.lucro + jurosFiado) * 100) / 100
  const temCusto = carrinho.some((i) => i.custo != null)
  // preço digitado abaixo do custo (produto do estoque)
  const abaixoDoCusto = selecionado?.origem === 'estoque' && selecionado.custo != null && item.preco !== '' && +item.preco < selecionado.custo

  // estoque disponível = estoque salvo + o que a venda em edição já tinha tirado − o que está no carrinho
  const doEstoqueEm = (itens, k) => itens.filter((i) => i.origem === 'estoque' && norm(i.produto) === k).reduce((s, i) => s + +i.qtd, 0)
  const disponivel = (k) => (estoque.get(k)?.saldo ?? 0) - doEstoqueEm(carrinho, k)

  // avulso com custo em %: o custo acompanha o preço
  const custoPorPct = (preco, pct) => (preco === '' || pct === '' ? '' : Math.round(+preco * +pct) / 100)
  function alterarItem(n, campo, valor) {
    setCarrinho(carrinho.map((i, x) => {
      if (x !== n) return i
      const novo = { ...i, [campo]: valor === '' ? '' : +valor }
      if (campo === 'preco' && i.origem === 'avulso' && i.custoPct != null) novo.custo = custoPorPct(novo.preco, i.custoPct)
      return novo
    }))
  }
  // muda o custo do avulso já no carrinho (em R$ ou na %, conforme foi lançado)
  function alterarCustoAvulso(n, valor) {
    setCarrinho(carrinho.map((i, x) => {
      if (x !== n) return i
      if (i.custoPct != null) return { ...i, custoPct: valor === '' ? '' : +valor, custo: custoPorPct(i.preco, valor) }
      return { ...i, custo: valor === '' ? '' : +valor }
    }))
  }

  function cancelar() {
    setCarrinho([])
    setPg(novoPagamento())
    setDesconto('')
  }

  // fornecedores que vendem o produto escolhido, do mais barato para o mais caro
  const fornecedoresDo = (o) => (o?.origem !== 'fornecedor' ? [] : (db.precosForn || [])
    .filter((x) => chave(x.produto, x.marca) === o.k)
    .map((x) => ({ id: x.fornecedorId, nome: (db.fornecedores || []).find((f) => f.id === x.fornecedorId)?.nome || t('Fornecedor'), custo: +x.preco }))
    .sort((a, b) => a.custo - b.custo))

  const fornEscolhido = (o) => (o?.origem === 'fornecedor' ? (fornecedoresDo(o).find((f) => f.id === item.forn) || fornecedoresDo(o)[0]) : null)
  // preço de venda de um produto de fornecedor: a regra do produto aplicada sobre o custo do fornecedor escolhido
  const precoDoForn = (o) => { const f = fornEscolhido(o); return f ? resolverPreco(db, o.k, f.custo).preco : o?.preco }

  function escolherProduto(k) {
    setItem({ ...item, k, preco: '', forn: '' })
  }

  // custo do avulso em R$: digitado direto ou % do preço de venda
  const custoAvulso = (a) => {
    const v = lerValor(a.custo)
    if (a.modoCusto !== 'pct') return v
    const p = lerValor(a.preco)
    return Number.isFinite(v) && Number.isFinite(p) ? Math.round(p * v) / 100 : NaN
  }

  function adicionarAvulso(e) {
    e.preventDefault()
    const nome = avulso.nome.trim()
    const qtd = parseInt(avulso.qtd, 10)
    const preco = lerValor(avulso.preco)
    if (!nome) return aviso.alerta(t('Informe o nome do produto ou serviço.'))
    if (!(qtd > 0)) return aviso.alerta(t('Confira a quantidade.'))
    if (String(avulso.preco).trim() === '' || !(preco >= 0)) return aviso.alerta(t('Informe o preço de venda.'))
    const custo = custoAvulso(avulso)
    if (String(avulso.custo).trim() === '' || !(custo >= 0)) return aviso.alerta(t('Informe o custo (0 se não tiver).'))
    setCarrinho([...carrinho, { produto: nome, marca: '', qtd, preco, custo, origem: 'avulso', tipo: avulso.tipo,
      ...(avulso.modoCusto === 'pct' ? { custoPct: lerValor(avulso.custo) } : {}), foraDoCaixa: true }])
    try { localStorage.setItem('avulso-custo', JSON.stringify({ tipo: avulso.tipo, modoCusto: avulso.modoCusto, pct: avulso.modoCusto === 'pct' ? avulso.custo : undefined })) } catch { /* sem acesso */ }
    setAvulso(null)
  }

  function adicionar(e) {
    e.preventDefault()
    const p = selecionado
    if (!p) return aviso.alerta(t('Escolha um produto.'))
    if (p.origem === 'estoque') {
      const disp = disponivelLote(p.entradaId)
      if (disp <= 0) return aviso.alerta(t('"{produto}" está sem estoque. Registre uma entrada no Estoque para vender.', { produto: p.produto }))
      if (+item.qtd > disp) return aviso.alerta(t('Estoque insuficiente de "{produto}": só há {n} unidade(s).', { produto: p.produto, n: disp }), p.detalhe)
    }
    const preco = p.origem === 'estoque' ? +item.preco : precoDoForn(p)
    // produto de fornecedor: o custo é o do fornecedor escolhido (o mais barato, se não escolher)
    const forn = fornEscolhido(p)
    setCarrinho([...carrinho, { produto: p.produto, marca: p.marca, qtd: +item.qtd, preco, custo: forn ? forn.custo : p.custo, origem: p.origem,
      ...(p.origem === 'estoque' ? { entradaId: p.entradaId, lote: p.detalhe } : {}),
      ...(forn ? { fornecedorId: forn.id, fornecedor: forn.nome } : {}) }])
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
    if (carrinho.some((i) => i.origem === 'avulso' && (i.custo === '' || !(+i.custo >= 0)))) return aviso.alerta(t('Informe o custo (0 se não tiver).'))
    const itens = carrinho.map((i) => ({ ...i, qtd: +i.qtd, preco: +i.preco }))
    if (!fiadoTudo && desconto !== '' && (+desconto < 0 || +desconto > 100)) return aviso.alerta(t('O desconto precisa ser entre 0% e 100%.'))
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
    const venda = { id: uid(), data: Date.now(), dia: hoje(), itens, subtotal, descontoPct, descontoValor, total, ...extra }
    if (!pago.fiado) delete venda.fiado
    // produtos do estoque que vão ficar com 2 ou menos depois desta venda
    const baixos = [...new Set(itens.filter((i) => i.origem === 'estoque').map((i) => norm(i.produto)))]
      .map((k) => ({ nome: estoque.get(k)?.produto, resta: disponivel(k) }))
      .filter((p) => p.nome && p.resta <= 2)
    if (await executar((A) => A.salvarVenda(venda))) {
      const resultado = lucroVenda(venda)
      if (venda.fiado) aviso.info(t('Venda registrada com fiado.'), t('{valor} a receber de {cliente}. Acompanhe na aba Cobranças.', { valor: brl(resumoFiado(venda).aberto), cliente: venda.fiado.cliente }))
      else if (resultado.lucro < 0) aviso.alerta(t('Venda registrada com prejuízo.'), t('Perda de {valor} nesta venda.', { valor: brl(-resultado.lucro) }))
      else if (resultado.perda > 0) aviso.alerta(t('Venda registrada.'), t('Atenção: {n} item(ns) vendido(s) abaixo do custo (perda de {valor}).', { n: resultado.itensComPrejuizo, valor: brl(resultado.perda) }))
      else aviso.ok(t('Venda registrada.'), brl(venda.total))
      setDia(hoje())
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
      executar((A) => A.excluirVenda(v.id), t('Venda excluída.'))
    }
  }

  // Vendas do dia escolhido
  const vendasDia = db.vendas.filter((v) => v.dia === dia).sort((a, b) => b.data - a.data)
  const temJurosDia = vendasDia.some((v) => +v.fiado?.juros > 0) // coluna Juros só aparece se alguma venda do dia teve
  const totalDia = vendasDia.reduce((s, v) => s + faturamentoVenda(v), 0)
  // lucro estimado das vendas do dia (o fiado conta na hora; o que o cliente não pagar sai depois)
  const lucroDia = Math.round(vendasDia.reduce((s, v) => s + lucroVenda(v).lucro, 0) * 100) / 100
  const perdasDia = vendasDia.reduce((s, v) => s + lucroVenda(v).perda, 0)
  const vendasComPrejuizo = vendasDia.filter((v) => lucroVenda(v).perda > 0).length
  const semCusto = vendasDia.some((v) => v.itens.some((i) => i.custo == null))
  const somaForma = (forma) => vendasDia.reduce((s, v) => s + pagamentosDaVenda(v).filter((x) => x.forma === forma).reduce((a, x) => a + x.valor, 0), 0)
  const porPagamento = [...PAGAMENTOS, 'Fiado'].map((p) => ({ p, total: somaForma(p) })).filter((x) => x.p !== 'Fiado' || x.total > 0) // Fiado: o que ficou para depois nas vendas do dia
  const textoPagamento = (v) => { const l = pagamentosDaVenda(v); return l.length > 1 ? l.map((x) => `${t(x.forma)} ${brl(x.valor)}`).join(' + ') : t(l[0]?.forma || v.pagamento) }

  return (
    <section>
      <h2>{t('Novo Registro')}</h2>

      {podeEmprestar && (
        <div className="chips modo-registro">
          <button className={'filtro' + (modo === 'venda' ? ' ativo' : '')} onClick={() => setModo('venda')}>{t('Venda')}</button>
          <button className={'filtro' + (modo === 'emprestimo' ? ' ativo' : '')} onClick={() => setModo('emprestimo')}>{t('Empréstimo')}</button>
        </div>
      )}

      {modo === 'emprestimo' && podeEmprestar ? (
        <>
          <NovoEmprestimo db={db} executar={executar} aoSalvar={() => setDia(hoje())} />
          <p><small>{t('Juros simples: o valor emprestado × os juros do mês × o número de parcelas. As parcelas vão para a aba Cobranças.')}</small></p>
        </>
      ) : (<>
      {/* ---------- Nova venda: produto cadastrado ou avulso (no mesmo quadro) ---------- */}
      {!avulso && <form onSubmit={adicionar}>
        <div className="campo-custo" style={{ flex: '2 1 240px' }}>{t('Produto')}
          <BuscaProduto estoque={doEstoque} semEstoque={semEstoque} fornecedores={dosFornecedores} selecionado={selecionado} onEscolher={escolherProduto} nomesForn={(o) => fornecedoresDo(o).map((f) => f.nome)} />
        </div>
        {selecionado?.origem === 'fornecedor' && (
          <label style={{ flex: '1 1 220px' }}>{t('Fornecedor')}
            <select value={item.forn || fornecedoresDo(selecionado)[0]?.id || ''} onChange={(e) => setItem({ ...item, forn: e.target.value })}>
              {fornecedoresDo(selecionado).map((f) => <option key={f.id} value={f.id}>{f.nome} · {t('custo')} {brl(f.custo)}</option>)}
            </select>
          </label>
        )}
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
            <input readOnly tabIndex={-1} className="somente-leitura" value={selecionado ? brl(precoDoForn(selecionado)) : ''} placeholder="—" />
          </label>
        )}
        {selecionado?.origem === 'estoque' && (
          <label style={{ flex: '0 1 110px' }}>{t('Em estoque')}
            <input readOnly tabIndex={-1} className={'somente-leitura estoque-' + classeEstoque(disponivelLote(selecionado.entradaId))}
              value={disponivelLote(selecionado.entradaId)} />
          </label>
        )}
        <button type="submit">{t('Adicionar')}</button>
        <button type="button" className="sec botao-avulso" title={t('Produto ou serviço sem cadastro')} onClick={() => setAvulso(avulsoNovo)}>+ {t('Avulso')}</button>
      </form>}
      {avulso && (
        <form onSubmit={adicionarAvulso}>
          <label style={{ flex: '0 1 140px' }}>{t('Tipo')}
            <select value={avulso.tipo} onChange={(e) => setAvulso({ ...avulso, tipo: e.target.value })}>
              <option value="produto">{t('Produto')}</option>
              <option value="servico">{t('Serviço')}</option>
            </select>
          </label>
          <label style={{ flex: '2 1 220px' }}>{t('Nome')} *<input autoFocus maxLength={80} placeholder={avulso.tipo === 'servico' ? t('Ex: troca de tela') : t('Ex: cabo USB-C')} value={avulso.nome} onChange={(e) => setAvulso({ ...avulso, nome: e.target.value })} /></label>
          <label style={{ flex: '0 1 80px' }}>{t('Qtd.')}<input type="number" min="1" step="1" value={avulso.qtd} onChange={(e) => setAvulso({ ...avulso, qtd: e.target.value })} /></label>
          <label style={{ flex: '0 1 140px' }}>{t('Preço de venda (R$)')} *<input inputMode="decimal" placeholder="0,00" value={avulso.preco} onChange={(e) => setAvulso({ ...avulso, preco: e.target.value })} /></label>
          <div className="campo-custo" style={{ flex: '0 1 170px' }}>
            <span className="rotulo-custo">{t('Custo')} *
              <span className="modo-custo">
                <button type="button" className={avulso.modoCusto !== 'pct' ? 'ativo' : ''} onClick={() => setAvulso({ ...avulso, modoCusto: 'valor', custo: '' })}>R$</button>
                <button type="button" className={avulso.modoCusto === 'pct' ? 'ativo' : ''} onClick={() => setAvulso({ ...avulso, modoCusto: 'pct', custo: '' })}>%</button>
              </span>
            </span>
            <span className="lf-preco">
              {avulso.modoCusto !== 'pct' && <span>R$</span>}
              <input inputMode="decimal" placeholder={avulso.modoCusto === 'pct' ? t('% do preço') : '0,00'} value={avulso.custo} onChange={(e) => setAvulso({ ...avulso, custo: e.target.value })} />
              {avulso.modoCusto === 'pct' && <span className="sufixo">%</span>}
            </span>
          </div>
          <button type="submit">{t('Adicionar')}</button>
          <button type="button" className="sec" onClick={() => setAvulso(null)}>{t('Voltar')}</button>
        </form>
      )}
      {avulso ? (
        <p><small className={Number.isFinite(custoAvulso(avulso)) && lerValor(avulso.preco) - custoAvulso(avulso) < 0 ? 'bad' : ''}>
          {String(avulso.custo).trim() !== '' && String(avulso.preco).trim() !== '' && Number.isFinite(custoAvulso(avulso))
            ? (avulso.modoCusto === 'pct' ? t('Custo {valor}', { valor: brl(custoAvulso(avulso)) }) + ' · ' : '') + t('Lucro por unidade: {valor}', { valor: brl(lerValor(avulso.preco) - custoAvulso(avulso)) })
            : t('Produto ou serviço sem cadastro.')}{' · '}{t('O custo serve só para calcular o lucro; o material você lança como despesa quando comprar.')}
        </small></p>
      ) : <p>
        {selecionado?.origem === 'estoque'
          ? <small>{t('Produto do estoque: digite o preço pelo qual está vendendo.')}</small>
          : selecionado
          ? <small>{t('Preço da aba "Fornecedores" ({regra}).', { regra: descricaoPreco(selecionado.resolucao) })}</small>
          : <small>{t('Produtos dos fornecedores usam o preço da aba "Fornecedores".')}</small>}
        {selecionado?.origem === 'fornecedor' && selecionado.resolucao.tipo === 'nenhuma' && <small className="warn"> {t('Este produto está sem preço definido: o preço de venda é igual ao custo. Defina na aba "Fornecedores".')}</small>}
        {abaixoDoCusto && <small className="bad"> {t('Abaixo do custo ({custo}): prejuízo de {valor} por unidade.', { custo: brl(selecionado.custo), valor: brl(selecionado.custo - +item.preco) })}</small>}
      </p>}

      {doEstoque.length + semEstoque.length + dosFornecedores.length === 0 && <p className="warn">{t('Registre produtos no Estoque, cadastre nos fornecedores ou use "Produto ou serviço avulso".')}</p>}

      {carrinho.length > 0 && (
        <div className="painel">
          <div className="tw">
            <table>
              <thead><tr><th>{t('Produto')}</th><th className="n">{t('Qtd.')}</th><th className="n">{t('Unit.')}</th><th className="n">{t('Subtotal')}</th><th className="n">{t('Lucro')}</th><th></th></tr></thead>
              <tbody>
                {carrinho.length === 0 && <tr><td colSpan="6" className="vazio">{t('Nenhum item. Adicione pelo formulário acima.')}</td></tr>}
                {carrinho.map((i, n) => {
                  const l = lucroItem(i, fatorCarrinho)
                  return (
                  <tr key={n} className={l != null && l < 0 ? 'linha-prejuizo' : ''}>
                    <td>{i.produto}{i.marca ? ` — ${i.marca}` : ''}{i.lote && <small className="sub-linha">{i.lote}</small>}{i.origem === 'avulso' && <small className="sub-linha custo-item">{i.tipo === 'servico' ? t('serviço avulso') : t('produto avulso')} · {t('custo')}
                      {editandoCusto === n ? (<>
                        {i.custoPct == null && <span>R$</span>}
                        <input className="cel mini" type="number" min="0" step="0.01" autoFocus value={i.custoPct != null ? i.custoPct : i.custo}
                          onChange={(e) => alterarCustoAvulso(n, e.target.value)} onBlur={() => setEditandoCusto(null)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditandoCusto(null) } }} aria-label={t('Custo')} />
                        {i.custoPct != null && <span>% = {i.custo === '' ? '—' : brl(i.custo)}</span>}
                      </>) : (
                        <button type="button" className="custo-link" title={t('Mudar o custo')} onClick={() => setEditandoCusto(n)}>
                          {i.custo === '' ? '—' : brl(i.custo)}{i.custoPct != null && i.custoPct !== '' ? ` (${String(i.custoPct).replace('.', ',')}%)` : ''} ✎
                        </button>
                      )}</small>}{i.fornecedor && <small className="sub-linha">{t('Fornecedor')}: {i.fornecedor} · {t('custo')} {brl(i.custo)}</small>}</td>
                    <td className="n">
                      <input className={'cel' + (i.origem === 'estoque' && (i.entradaId ? disponivelLote(i.entradaId) : disponivel(norm(i.produto))) < 0 ? ' campo-erro' : '')} type="number" min="1" step="1"
                        max={i.origem === 'estoque' ? (i.entradaId ? disponivelLote(i.entradaId) : disponivel(norm(i.produto))) + +i.qtd : undefined}
                        value={i.qtd} onChange={(e) => alterarItem(n, 'qtd', e.target.value)} />
                    </td>
                    <td className="n">
                      {i.origem === 'estoque' || i.origem === 'avulso'
                        ? <input className={'cel' + (i.custo != null && +i.preco < i.custo ? ' campo-erro' : '')} type="number" min="0" step="0.01" value={i.preco} onChange={(e) => alterarItem(n, 'preco', e.target.value)} />
                        : brl(i.preco)}
                    </td>
                    <td className="n">{brl((+i.qtd || 0) * (+i.preco || 0))}</td>
                    <td className="n"><ValorLucro valor={l} /></td>
                    <td><button className="del" onClick={() => { setEditandoCusto(null); setCarrinho(carrinho.filter((_, x) => x !== n)) }}>{t('Remover')}</button></td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <PagamentoVenda pg={pg} setPg={setPg} total={totalCarrinho} clientes={db.clientes || []} db={db} />
          <div className="finalizar">
            {fiadoTudo ? <span /> : <label style={{ flex: '0 1 140px' }}>{t('Desconto (%)')}
              <input type="number" min="0" max="100" step="0.01" placeholder={t('Opcional')} value={desconto} onChange={(e) => setDesconto(e.target.value)} />
            </label>}
            <div className="total-grande">
              {pctDesconto > 0 && <small className="riscado">{brl(subtotalCarrinho)}</small>}
              {pctDesconto > 0 && <small className="bad">− {brl(valorDesconto)} ({t('{p}% de desconto', { p: num(pctDesconto, 2) })})</small>}
              <small>{t('Total')}</small>
              {parcelasPrevia.length
                ? <b className="total-parcelas"><span>{entradaPrevia > 0 ? brl(entradaPrevia) + ' + ' : ''}{parcelasPrevia.length}× {brl(parcelasPrevia[0])} = </span>{brl(totalComJuros)}</b>
                : <b>{brl(totalComJuros)}</b>}
              {jurosFiado > 0 && <small>{t('Juros')}: {brl(jurosFiado)}</small>}
              {temCusto && (lucroComJuros < 0
                ? <small className="bad resultado-venda">{t('Prejuízo')}: − {brl(-lucroComJuros)}</small>
                : <small className="ok resultado-venda">{t('Lucro')}: {brl(lucroComJuros)}{lucroCarrinho.perda > 0 ? ` · ${t('perda de {valor} abaixo do custo', { valor: brl(lucroCarrinho.perda) })}` : ''}</small>)}
            </div>
            <button onClick={finalizar} disabled={!carrinho.length}>{t('Finalizar venda')}</button>
            <button className="sec" onClick={cancelar}>{t('Cancelar')}</button>
          </div>
        </div>
      )}

      </>)}

      {modo === 'emprestimo' && podeEmprestar ? (
        <EmprestimosDoDia db={db} dia={dia} setDia={setDia} executar={executar} irPara={irPara} />
      ) : (<>
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
          <thead><tr><th>{t('Hora')}</th><th>{t('Itens')}</th><th>{t('Pagamento')}</th><th className="n">{t('Valor')}</th>{temJurosDia && <th className="n">{t('Juros')}</th>}<th className="n">{t('Total')}</th><th className="n">{t('Custo')}</th><th className="n">{t('Lucro')}</th><th></th></tr></thead>
          <tbody>
            {vendasDia.length === 0 && <tr><td colSpan="9" className="vazio">{t('Nenhuma venda neste dia.')}</td></tr>}
            {vendasDia.map((v) => {
              const res = lucroVenda(v)
              const temCustoV = v.itens.some((i) => i.custo != null)
              return (
              <tr key={v.id} className={res.lucro < 0 ? 'linha-prejuizo' : ''}>
                <td>{hora(v.data)}</td>
                <td className="quebra">{v.itens.map((i) => `${i.qtd}× ${i.produto}${i.marca ? ` (${i.marca})` : ''}`).join(', ')}</td>
                <td className="quebra">{textoPagamento(v)}{v.fiado && <small className="sub-linha">{t('Fiado de {cliente}', { cliente: v.fiado.cliente })}</small>}</td>
                <td className="n">
                  {brl(v.total)}
                  {v.descontoPct > 0 && <small className="desconto-linha">{t('{p}% de desconto', { p: num(v.descontoPct, 2) })}</small>}
                </td>
                {temJurosDia && <td className="n">{+v.fiado?.juros > 0 ? brl(v.fiado.juros) : '-'}</td>}
                <td className="n"><b>{brl(faturamentoVenda(v))}</b></td>
                <td className="n">{temCustoV ? brl(v.itens.reduce((c, i) => c + (+i.qtd || 0) * (+i.custo || 0), 0)) : '-'}</td>
                <td className="n">
                  {temCustoV ? <ValorLucro valor={res.lucro} /> : '-'}
                  {res.perda > 0 && res.lucro >= 0 && <small className="desconto-linha bad">{t('perda de {valor} abaixo do custo', { valor: brl(res.perda) })}</small>}
                </td>
                <td>
                  <button className="del" onClick={() => excluir(v)}>{t('Excluir')}</button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {semCusto && <small>* {t('Algum item vendido não tinha custo informado; o lucro considera custo zero para ele.')}</small>}
      </>)}
    </section>
  )
}

// Lucro em verde; prejuízo em vermelho, com a palavra "prejuízo"
function ValorLucro({ valor }) {
  if (valor == null) return <small>{t('sem custo')}</small>
  if (valor < 0) return <span className="bad">− {brl(-valor)}<small className="desconto-linha">{t('prejuízo')}</small></span>
  return <span className="ok">{brl(valor)}</span>
}

// ---------- Busca de produto: digite parte do nome, da marca ou do fornecedor ----------
const semAcento = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function BuscaProduto({ estoque, semEstoque, fornecedores, selecionado, onEscolher, nomesForn }) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const lista = useRef(null)
  const campo = useRef(null)
  const nomeDe = (o) => o ? o.produto + (o.marca ? ' — ' + o.marca : '') : ''
  const palavras = semAcento(texto).split(/\s+/).filter(Boolean)
  const bate = (...campos) => { const h = semAcento(campos.join(' ')); return palavras.every((w) => h.includes(w)) }
  const doEst = estoque.filter((o) => bate(o.produto, o.detalhe, 'estoque'))
  const semEst = semEstoque.filter((e) => bate(e.produto, 'estoque'))
  const doForn = fornecedores.filter((o) => bate(o.produto, o.marca, ...nomesForn(o)))
  const escolhiveis = [...doEst, ...doForn]
  const escolher = (o) => { onEscolher(o.id); setTexto(''); setAberto(false); campo.current?.blur() }
  const mover = (d) => {
    const n = Math.min(escolhiveis.length - 1, Math.max(0, ativo + d))
    setAtivo(n)
    lista.current?.querySelector('[data-i="' + n + '"]')?.scrollIntoView({ block: 'nearest' })
  }
  function tecla(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!aberto) setAberto(true); else mover(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1) }
    else if (e.key === 'Enter' && aberto) { e.preventDefault(); if (escolhiveis[ativo]) escolher(escolhiveis[ativo]) }
    else if (e.key === 'Escape') { setAberto(false); setTexto('') }
  }
  let i = -1
  const linha = (o, titulo, sub, dir) => { i++; const k = i; return (
    <button type="button" key={o.id} data-i={k} className={'bp-item' + (k === ativo ? ' ativo' : '') + (selecionado?.id === o.id ? ' escolhido' : '')}
      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAtivo(k)} onClick={() => escolher(o)}>
      <span className="bp-nome">{titulo}<small>{sub}</small></span><span className="bp-dir">{dir}</span>
    </button>) }
  return (
    <div className="busca-produto">
      <input ref={campo} value={aberto ? texto : nomeDe(selecionado)} placeholder={aberto && selecionado ? nomeDe(selecionado) : t('Buscar produto...')}
        onFocus={() => { setAberto(true); setAtivo(0) }} onBlur={() => { setAberto(false); setTexto('') }}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(0) }} onKeyDown={tecla} autoComplete="off" />
      {aberto && (
        <div className="bp-lista" ref={lista}>
          {doEst.length + semEst.length > 0 && <div className="bp-grupo">{t('Estoque')}</div>}
          {doEst.map((o) => linha(o, o.produto, o.detalhe, t('{n} un.', { n: o.disp })))}
          {semEst.map((e) => <div key={'sem:' + e.k} className="bp-item desativado"><span className="bp-nome">{e.produto}<small>{t('sem estoque')}</small></span></div>)}
          {doForn.length > 0 && <div className="bp-grupo">{t('Fornecedores')}</div>}
          {doForn.map((o) => linha(o, o.produto, o.marca || '', brl(o.preco)))}
          {escolhiveis.length + semEst.length === 0 && <div className="bp-vazio">{t('Nenhum produto encontrado.')}</div>}
        </div>
      )}
    </div>
  )
}
