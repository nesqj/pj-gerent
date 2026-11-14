import { idioma, t } from './i18n.js'

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// Moeda é sempre real (BRL); o formato segue o idioma (R$ 1.500,00 / R$1,500.00)
export const brl = (v) => Number(v).toLocaleString(idioma(), { style: 'currency', currency: 'BRL' })
export const num = (v, casas = 0) => Number(v).toLocaleString(idioma(), { maximumFractionDigits: casas })
export const pct = (v) => `${Number(v).toLocaleString(idioma(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

export const norm = (s) => (s || '').trim().toLowerCase()

// Chave para comparar produto + marca sem diferenciar maiúsculas/espaços
export const chave = (produto, marca) => norm(produto) + '|' + norm(marca)

// Fuso horário escolhido no Perfil (vazio = fuso do aparelho)
let FUSO
export const definirFuso = (tz) => { FUSO = tz || undefined }
export const FUSO_PADRAO = 'America/Sao_Paulo'

// Data de hoje no fuso escolhido, no formato AAAA-MM-DD
export const hoje = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}
// Data AAAA-MM-DD no formato do idioma (13/11/2026 ou 11/13/2026)
export const dataBR = (dia) => {
  const [a, m, d] = dia.split('-')
  return idioma() === 'en-US' ? `${m}/${d}/${a}` : `${d}/${m}/${a}`
}
// Data de um momento salvo (timestamp), no formato do idioma
export const dataTs = (ts) => {
  try { return new Date(ts).toLocaleDateString(idioma(), { timeZone: FUSO }) }
  catch { return new Date(ts).toLocaleDateString(idioma()) }
}
export const hora = (ts) => {
  try { return new Date(ts).toLocaleTimeString(idioma(), { hour: '2-digit', minute: '2-digit', timeZone: FUSO }) }
  catch { return new Date(ts).toLocaleTimeString(idioma(), { hour: '2-digit', minute: '2-digit' }) }
}

// Cor de texto legível sobre uma cor de fundo (#rrggbb)
export function corTextoSobre(hex) {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.18 ? '#10131a' : '#ffffff'
}
export const hexValido = (s) => /^#[0-9a-f]{6}$/i.test(s || '')

// Formas de pagamento: o valor salvo fica em português; na tela, usar t(p)
export const PAGAMENTOS = ['Dinheiro', 'PIX', 'Débito', 'Crédito']

export const nomeFornecedor = (db, id) => db.fornecedores.find((f) => f.id === id)?.nome || t('(removido)')

// Salva um preço de fornecedor a partir do formulário { id, fornecedorId, produto, marca, preco }.
// - mesmo fornecedor + produto + marca: atualiza o existente em vez de duplicar
export async function gravarPrecoFornecedor(A, db, form) {
  const o = {
    id: form.id || uid(),
    fornecedorId: form.fornecedorId,
    produto: form.produto.trim(),
    marca: form.marca.trim(),
    preco: +form.preco,
    atualizado: Date.now(),
  }
  const dup = db.precosForn.find(
    (p) => p.id !== o.id && p.fornecedorId === o.fornecedorId && chave(p.produto, p.marca) === chave(o.produto, o.marca),
  )
  if (dup) o.id = dup.id

  await A.salvarPrecoFornecedor(o)
  if (form.id && dup) await A.excluirPrecoFornecedor(form.id)
}

// ---------- Regras de preço ----------
// Cada regra: { id, nome, percentual } → preço = custo + percentual% do custo.
// Ex.: custo 100, +30% = 130. Percentual 0 (ou vazio) = preço igual ao custo.
// db.regras = lista de regras; db.regraPadraoId = regra usada nos produtos sem escolha (null = nenhuma).
// db.precoProduto[chave] = escolha de cada produto:
//   { tipo: 'padrao' } | { tipo: 'regra', regraId } | { tipo: 'nenhuma' } | { tipo: 'fixo', valor }
export const REGRA_ZERADA = { percentual: 0 }

// Regras antigas tinham multiplicador e valor somado: o multiplicador vira porcentagem
// (×2 = +100%, ×2 com +10% = +120%) e o valor somado em R$ deixa de existir.
const paraPercentual = (r) => {
  const m = +r.multiplicador || 0, p = +r.percentual || 0
  return m > 0 ? Math.round((m * (1 + p / 100) - 1) * 10000) / 100 : p
}
const normalizarRegra = (r) => ({ id: r.id, nome: r.nome, percentual: paraPercentual(r) })

// Lista de regras (converte a regra única das versões anteriores, se existir)
export function regrasDe(db) {
  if (Array.isArray(db?.regras)) return db.regras.map(normalizarRegra)
  const antiga = db?.regra
  if (antiga && (+antiga.multiplicador || +antiga.acrescimo)) {
    return [normalizarRegra({ id: 'padrao', nome: t('Regra padrão'), ...antiga })]
  }
  return []
}
export function regraPadraoDe(db) {
  const regras = regrasDe(db)
  const id = db?.regraPadraoId !== undefined ? db.regraPadraoId : regras[0]?.id ?? null
  return regras.find((r) => r.id === id) || null
}

export function calcularVenda(custo, regra = REGRA_ZERADA) {
  const p = +regra.percentual || 0
  return Math.round(+custo * (1 + p / 100) * 100) / 100
}
export const numBR = (n) => num(n, 4)

// Regra em texto, ex.: "+ 30%" (vazio quando a regra está zerada)
function partesRegra(regra) {
  const p = +regra.percentual || 0
  return p > 0 ? `+ ${num(p, 2)}%` : ''
}
export const formulaRegra = (regra) => partesRegra(regra) || t('+ 0% (preço = custo)')
// Margem sobre o preço de venda, em % (ex.: custo 100, venda 130 → 23,1%)
export const margemDe = (custo, preco) => (+preco > 0 ? ((+preco - +custo) / +preco) * 100 : 0)
export const textoRegra = (regra) =>
  partesRegra(regra) ? `${t('menor preço do fornecedor')} ${partesRegra(regra)}` : t('menor preço do fornecedor')
export const textoCalculo = (custo, regra) => `${brl(custo)} ${partesRegra(regra)}`.trim()

export const escolhaProduto = (db, k) => db?.precoProduto?.[k] || { tipo: 'padrao' }

// Preço de venda de um produto conforme a escolha dele.
// Retorna { preco, tipo ('regra'|'nenhuma'|'fixo'), regra, padrao (true se veio da regra padrão) }
export function resolverPreco(db, k, custo) {
  const e = escolhaProduto(db, k)
  if (e.tipo === 'fixo' && e.valor !== '' && e.valor != null) return { preco: +e.valor, tipo: 'fixo', regra: null, padrao: false }
  // "sem regra" não é mais uma opção: quem estava assim passa a usar a regra padrão
  const regra = e.tipo === 'regra' ? regrasDe(db).find((r) => r.id === e.regraId) : regraPadraoDe(db)
  const padrao = e.tipo !== 'regra' || !regra
  if (!regra) return { preco: +custo, tipo: 'nenhuma', regra: null, padrao: true }
  return { preco: calcularVenda(custo, regra), tipo: 'regra', regra, padrao }
}

// Como o preço foi formado, em texto curto (ex.: "Telas: × 2 + R$ 40,00", "Preço fixo")
export function descricaoPreco(r) {
  if (r.tipo === 'fixo') return t('Preço fixo')
  if (r.tipo === 'nenhuma') return r.padrao ? t('Sem regra (padrão)') : t('Sem regra')
  return `${r.regra.nome}${r.padrao ? ' (' + t('padrão') + ')' : ''}: ${formulaRegra(r.regra)}`
}

// Todos os produtos (produto + marca) com o fornecedor mais barato e o preço de venda de cada um
export function produtosAVenda(db) {
  const porChave = new Map()
  for (const p of db.precosForn) {
    const k = chave(p.produto, p.marca)
    const atual = porChave.get(k)
    if (!atual || +p.preco < +atual.custo) {
      porChave.set(k, { k, produto: p.produto, marca: p.marca, custo: +p.preco, fornecedorId: p.fornecedorId })
    }
  }
  return [...porChave.values()]
    .map((i) => { const r = resolverPreco(db, i.k, i.custo); return { ...i, preco: r.preco, resolucao: r } })
    .sort((a, b) => a.produto.localeCompare(b.produto) || (a.marca || '').localeCompare(b.marca || ''))
}

// Preço mais barato entre os fornecedores para um produto/marca
export function menorPreco(db, produto, marca) {
  let best = null
  for (const p of db.precosForn) {
    if (chave(p.produto, p.marca) === chave(produto, marca) && (!best || +p.preco < +best.preco)) best = p
  }
  return best
}

// Estoque próprio (separado dos fornecedores), por nome do produto.
// Entradas: { produto, qtd, custo }. Saídas: itens de venda com origem 'estoque'
// (o preço de venda é digitado na hora da venda).
// ---------- Lotes do estoque
// Cada entrada é um lote, com o próprio custo (o mesmo produto pode ser comprado por preços diferentes).
// Na venda, o item guarda de qual lote saiu (entradaId). Vendas antigas, sem lote, saem do lote mais antigo.
// Retorna Map id da entrada → { id, k, produto, custo, qtd, vendidos, saldo, data, dia, obs }
export function calcularLotes(db) {
  const lotes = new Map()
  const porProduto = new Map()
  for (const e of [...(db.entradas || [])].sort((a, b) => (a.data || 0) - (b.data || 0))) {
    const l = { id: e.id, k: norm(e.produto), produto: e.produto, custo: e.custo != null ? +e.custo : null, qtd: +e.qtd || 0,
      vendidos: 0, data: e.data, dia: e.dia, obs: e.obs || '' }
    lotes.set(e.id, l)
    if (!porProduto.has(l.k)) porProduto.set(l.k, [])
    porProduto.get(l.k).push(l)
  }
  const semLote = []
  for (const v of db.vendas || []) {
    for (const i of v.itens || []) {
      if (i.origem !== 'estoque') continue
      const l = i.entradaId && lotes.get(i.entradaId)
      if (l && norm(i.produto) === l.k) l.vendidos += +i.qtd || 0
      else semLote.push({ k: norm(i.produto), qtd: +i.qtd || 0, data: v.data || 0 })
    }
  }
  for (const x of semLote.sort((a, b) => a.data - b.data)) {
    const ls = porProduto.get(x.k) || []
    let resta = x.qtd
    for (const l of ls) {
      const livre = l.qtd - l.vendidos
      if (livre <= 0) continue
      const usa = Math.min(livre, resta)
      l.vendidos += usa
      resta -= usa
      if (!resta) break
    }
    if (resta && ls.length) ls[ls.length - 1].vendidos += resta // vendeu mais do que entrou (dados antigos)
  }
  for (const l of lotes.values()) l.saldo = l.qtd - l.vendidos
  return lotes
}

// Estoque por produto (soma dos lotes): Map nome normalizado → { k, produto, entradas, vendidos, saldo, custo, ultimoCusto, valor, lotes }
// custo = custo médio das unidades que ainda restam (cada lote com o próprio custo); valor = soma exata dos lotes.
export function calcularEstoque(db) {
  const m = new Map()
  for (const l of calcularLotes(db).values()) {
    if (!m.has(l.k)) m.set(l.k, { k: l.k, produto: l.produto, entradas: 0, vendidos: 0, saldo: 0, custo: null, ultimoCusto: null, valor: 0, lotes: [] })
    const s = m.get(l.k)
    s.produto = l.produto
    s.entradas += l.qtd
    s.vendidos += l.vendidos
    s.saldo += l.saldo
    if (l.custo != null) { s.ultimoCusto = l.custo; if (l.saldo > 0) s.valor += l.saldo * l.custo }
    s.lotes.push(l)
  }
  for (const s of m.values()) {
    const restantes = s.lotes.reduce((x, l) => x + Math.max(0, l.saldo), 0)
    s.custo = restantes > 0 ? Math.round((s.valor / restantes) * 100) / 100 : s.ultimoCusto
    s.valor = Math.round(s.valor * 100) / 100
  }
  return m
}

// Cor do estoque: zerado/negativo = vermelho, até 2 = amarelo, resto = verde
export const classeEstoque = (saldo) => (saldo <= 0 ? 'bad' : saldo <= 2 ? 'warn' : 'ok')

// ---------- Caixa (capital de giro)
// db.caixa = { inicio (momento em que o controle começou), saldoInicial }
// db.movCaixa = [{ id, data, dia, tipo: 'colocar' | 'retirar', valor, descricao }]
// Saldo = saldo inicial + vendas + dinheiro colocado − dinheiro retirado − compras do estoque (custo × qtd),
// contando só o que aconteceu a partir do início. Entrada de estoque com "foraDoCaixa" não desconta.
// É sempre recalculado: editar ou excluir uma venda, uma entrada de estoque ou um movimento já corrige o saldo.
export function extratoCaixa(db) {
  const c = db?.caixa
  if (!c?.inicio) return null
  const depois = (x) => (x.data || 0) >= c.inicio
  const movs = [
    ...(db.vendas || []).filter((v) => depois(v) && pagoNaHora(v) > 0).map((v) => ({
      id: 'v-' + v.id, ref: v, origem: 'venda', data: v.data, dia: v.dia, valor: pagoNaHora(v),
      descricao: (v.itens || []).map((i) => `${i.qtd}× ${i.produto}`).join(', ') + (v.fiado ? ` (${v.fiado.cliente || ''}: entrada)` : ''),
      pagamento: Array.isArray(v.pagamentos) ? v.pagamentos.filter((p) => +p.valor > 0).map((p) => p.forma).join(' + ') : v.pagamento,
    })),
    ...(db.vendas || []).flatMap((v) => (v.fiado?.parcelas || []).flatMap((p) => (p.recebimentos || []).filter(depois).map((r) => ({
      id: 'f-' + r.id, ref: v, origem: 'fiado', data: r.data, dia: r.dia, valor: (+r.valor || 0) + (+r.encargo || 0),
      descricao: `${v.fiado.cliente || ''} · ${p.n}/${v.fiado.parcelas.length}`, pagamento: r.forma,
    })))),
    // empréstimo: o dinheiro sai do caixa (se foi pago com ele) e as parcelas recebidas voltam
    ...(db.emprestimos || []).filter((e) => depois(e) && !e.foraDoCaixa).map((e) => ({
      id: 'p-' + e.id, ref: e, origem: 'emprestimo', data: e.data, dia: e.dia, valor: -(+e.valor || 0),
      descricao: `${e.fiado?.cliente || ''} · ${e.fiado?.parcelas?.length || 1}×`,
    })),
    ...(db.emprestimos || []).flatMap((e) => (e.fiado?.parcelas || []).flatMap((p) => (p.recebimentos || []).filter(depois).map((r) => ({
      id: 'pr-' + r.id, ref: e, origem: 'emprestimo-receb', data: r.data, dia: r.dia, valor: (+r.valor || 0) + (+r.encargo || 0),
      descricao: `${e.fiado.cliente || ''} · ${p.n}/${e.fiado.parcelas.length}`, pagamento: r.forma,
    })))),
    // produto de fornecedor vendido: o custo é pago ao fornecedor com o dinheiro do caixa, no dia da venda
    ...(db.vendas || []).filter(depois).map((v) => ({ v, itens: (v.itens || []).filter((i) => i.origem === 'fornecedor' && i.custo != null && +i.qtd > 0) }))
      .filter((x) => x.itens.length).map(({ v, itens }) => ({
        id: 'pf-' + v.id, ref: v, origem: 'fornecedor', data: v.data, dia: v.dia,
        valor: -Math.round(itens.reduce((s, i) => s + (+i.qtd || 0) * (+i.custo || 0), 0) * 100) / 100,
        descricao: itens.map((i) => `${i.qtd}× ${i.produto}${i.marca ? ' (' + i.marca + ')' : ''}${i.fornecedor ? ' · ' + i.fornecedor : ''}`).join(', '),
      })),
    ...(db.entradas || []).filter((e) => depois(e) && !e.foraDoCaixa && e.custo != null).map((e) => ({
      id: 'e-' + e.id, ref: e, origem: 'compra', data: e.data, dia: e.dia, valor: -(+e.qtd || 0) * (+e.custo || 0),
      descricao: `${e.qtd}× ${e.produto}`,
    })),
    ...(db.movCaixa || []).filter(depois).map((m) => ({
      id: 'm-' + m.id, ref: m, origem: m.tipo, data: m.data, dia: m.dia, valor: m.tipo === 'retirar' ? -(+m.valor || 0) : +m.valor || 0,
      descricao: m.descricao || '',
    })),
  ].sort((a, b) => a.data - b.data)
  let saldo = +c.saldoInicial || 0
  for (const m of movs) { saldo += m.valor; m.saldo = Math.round(saldo * 100) / 100 }
  return { inicio: c.inicio, saldoInicial: +c.saldoInicial || 0, movimentos: movs, saldo: Math.round(saldo * 100) / 100 }
}

// ---------- Lucro e prejuízo das vendas
// O desconto da venda vale para todos os itens na mesma proporção (total ÷ subtotal).
export const fatorDesconto = (v) => (+v.subtotal > 0 ? +v.total / +v.subtotal : 1)
// Lucro de um item (preço já com desconto − custo). Sem custo informado: null.
export const lucroItem = (i, fator = 1) => (i.custo == null ? null : (+i.qtd || 0) * ((+i.preco || 0) * fator - +i.custo))
// { lucro, perda, itensComPrejuizo } de uma venda (ou do carrinho, com o fator do desconto)
export function lucroDe(itens, fator = 1) {
  let lucro = 0, perda = 0, itensComPrejuizo = 0
  for (const i of itens || []) {
    const l = lucroItem(i, fator)
    lucro += l ?? (+i.qtd || 0) * (+i.preco || 0) * fator // sem custo: conta como custo zero (igual à Análise)
    if (l != null && l < -0.004) { perda += -l; itensComPrejuizo++ }
  }
  return { lucro: Math.round(lucro * 100) / 100, perda: Math.round(perda * 100) / 100, itensComPrejuizo }
}
// ---------- Pagamento dividido e fiado
// venda.pagamentos = [{ forma, valor }]  — o que foi pago na hora (dinheiro, PIX, débito, crédito)
// venda.fiado = { clienteId, cliente, telefone, parcelas: [{ id, n, valor, vencimento 'AAAA-MM-DD', naoPaga, recebimentos: [{ id, data, dia, valor, forma }] }] }
// Vendas antigas (sem "pagamentos") foram pagas inteiras na forma "pagamento".
// Valor digitado em reais: "1.000,50", "1000,50", "1000.50" e "1.000" (mil) funcionam
export const lerValor = (s) => Number(String(s ?? '').replace(/\s/g, '').replace(/R\$/i, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
export const recebidoDaParcela = (p) => (p.recebimentos || []).reduce((s, r) => s + (+r.valor || 0), 0)
export function situacaoParcela(p, dia = hoje()) {
  const falta = (+p.valor || 0) - recebidoDaParcela(p)
  if (falta <= 0.004) return 'paga'
  if (p.naoPaga) return 'nao_paga'
  if (p.vencimento < dia) return 'atrasada'
  if (p.vencimento === dia) return 'vence_hoje'
  return 'aberta'
}
export const totalFiado = (v) => (v.fiado?.parcelas || []).reduce((s, p) => s + (+p.valor || 0), 0)
// Resumo do fiado de uma venda: total, recebido, não pago (perda), em aberto
export function resumoFiado(v) {
  if (!v.fiado?.parcelas?.length) return null
  let recebido = 0, naoPago = 0, aberto = 0
  for (const p of v.fiado.parcelas) {
    const rec = recebidoDaParcela(p)
    const falta = Math.max(0, (+p.valor || 0) - rec)
    recebido += rec
    if (falta > 0.004) { if (p.naoPaga) naoPago += falta; else aberto += falta }
  }
  const r = (x) => Math.round(x * 100) / 100
  return { total: r(totalFiado(v)), recebido: r(recebido), naoPago: r(naoPago), aberto: r(aberto), pendente: aberto > 0.004 }
}
// O que entrou em cada forma de pagamento (para relatórios): pago na hora + o fiado como "Fiado"
export function pagamentosDaVenda(v) {
  if (!Array.isArray(v.pagamentos)) return [{ forma: v.pagamento, valor: +v.total || 0 }]
  const l = v.pagamentos.filter((p) => +p.valor > 0).map((p) => ({ forma: p.forma, valor: +p.valor }))
  if (v.fiado) l.push({ forma: 'Fiado', valor: Math.round(((+v.total || 0) - l.reduce((s, x) => s + x.valor, 0)) * 100) / 100 }) // sem os juros
  return l
}
export const pagoNaHora = (v) => (Array.isArray(v.pagamentos) ? v.pagamentos.reduce((s, p) => s + (+p.valor || 0), 0) : +v.total || 0)

// Lucro de uma venda. Com fiado:
//  - o lucro (com os juros do fiado) conta no dia da venda, mesmo com parcelas em aberto (é estimado)
//  - o que o cliente não pagar vira perda no dia em que você marcou "Não pagou" (ver perdasNaoPago)
//  - resolvido: lucro = lucro da venda − o que o cliente não pagou (o calote vira perda)
export function lucroVenda(v) {
  const base = lucroDe(v.itens, fatorDesconto(v))
  const f = resumoFiado(v)
  if (!f) return { ...base, pendente: false, lucroPrevisto: base.lucro, naoPago: 0 }
  const juros = +v.fiado.juros || 0 // juros do fiado: lucro a mais, também só quando o cliente paga
  const previsto = Math.round((base.lucro + juros + encargosRecebidos(v)) * 100) / 100 // + multa/juros de atraso já recebidos
  return { ...base, lucro: previsto, pendente: f.pendente, lucroPrevisto: previsto, aReceber: f.aberto, naoPago: f.naoPago, juros }
}

// ---------- Empréstimo (crediário de dinheiro) com juros simples
// db.emprestimos = [{ id, data, dia, valor, jurosPct (ao mês), total, foraDoCaixa, obs,
//   fiado: { clienteId, cliente, telefone, parcelas: [mesmo formato das parcelas do fiado] } }]
// total = valor × (1 + juros% × nº de parcelas); a última parcela leva os centavos que sobram.
export function calcularEmprestimo(valor, jurosPct, n) {
  const v = Math.round((+valor || 0) * 100) / 100
  n = Math.max(1, Math.floor(+n || 1))
  const total = Math.round(v * (1 + ((+jurosPct || 0) / 100) * n) * 100) / 100
  const base = Math.floor((total / n) * 100) / 100
  const parcelas = Array.from({ length: n }, (_, k) => (k === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base))
  return { valor: v, total, juros: Math.round((total - v) * 100) / 100, parcelas }
}
// Lucro do empréstimo = juros (estimado, conta no dia do empréstimo). O não pago é perda no dia em que foi marcado.
export function lucroEmprestimo(e) {
  const juros = Math.round(((+e.total || 0) - (+e.valor || 0) + encargosRecebidos(e)) * 100) / 100
  const f = resumoFiado(e) || { recebido: 0, naoPago: 0, aberto: 0, pendente: false }
  return { lucro: juros, pendente: f.pendente, lucroPrevisto: juros, naoPago: f.naoPago, recebido: f.recebido, aberto: f.aberto }
}

// ---------- Clientes
// Tudo o que um cliente pegou (vendas fiado e, se permitido, empréstimos) e a situação das parcelas.
export function resumoCliente(db, clienteId, comEmprestimos = true, dia = hoje()) {
  const registros = [
    ...(db.vendas || []).filter((v) => v.fiado?.clienteId === clienteId && v.fiado.parcelas?.length).map((v) => ({ tipo: 'venda', r: v })),
    ...(comEmprestimos ? (db.emprestimos || []) : []).filter((e) => e.fiado?.clienteId === clienteId && e.fiado.parcelas?.length).map((e) => ({ tipo: 'emprestimo', r: e })),
  ].sort((a, b) => b.r.data - a.r.data)
  let total = 0, recebido = 0, aberto = 0, atrasado = 0, naoPago = 0, nAtrasadas = 0
  for (const x of registros) {
    let falta = 0, pagas = 0, sit = 'pago'
    for (const p of x.r.fiado.parcelas) {
      const rec = recebidoDaParcela(p)
      const f = Math.max(0, (+p.valor || 0) - rec)
      const s = situacaoParcela(p, dia)
      total += +p.valor || 0
      recebido += rec
      if (s === 'paga') pagas++
      else if (s === 'nao_paga') { naoPago += f; if (sit === 'pago') sit = 'nao_pago' }
      else { aberto += f; falta += f; if (s === 'atrasada') { atrasado += f; nAtrasadas++; sit = 'atrasado' } else if (sit !== 'atrasado') sit = 'aberto' }
    }
    x.falta = Math.round(falta * 100) / 100
    x.pagas = pagas
    x.situacao = sit
  }
  const r = (v) => Math.round(v * 100) / 100
  return { registros, total: r(total), recebido: r(recebido), aberto: r(aberto), atrasado: r(atrasado), naoPago: r(naoPago), nAtrasadas,
    ultima: registros[0]?.r.data || null }
}

// ---------- CPF
export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '')
// Confere os dois dígitos verificadores (e recusa 000.000.000-00, 111.111.111-11...)
export function cpfValido(s) {
  const d = soDigitos(s)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n) => { let soma = 0; for (let i = 0; i < n; i++) soma += +d[i] * (n + 1 - i); const r = (soma * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === +d[9] && dv(10) === +d[10]
}
export const formatarCPF = (s) => { const d = soDigitos(s); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(s ?? '').trim() }
// CPF digitado num formulário: '' (vazio), o CPF formatado, ou { erro }
export function lerCPF(s) {
  if (!soDigitos(s)) return ''
  if (!cpfValido(s)) return { erro: t('CPF inválido. Confira os números.') }
  return formatarCPF(s)
}

// Recebimento de fiado/empréstimo: paga primeiro a parcela mais antiga; o que sobrar vai para as próximas.
// Devolve { parcelas, quitadas, sobra } (sobra > 0 = valor maior do que tudo o que falta).
const parcelaAberta = (p) => !p.naoPaga && (+p.valor || 0) - recebidoDaParcela(p) > 0.004
export function distribuirRecebimento(parcelas, valor, rec, encargoDe) {
  const ordem = parcelas.map((p, i) => ({ p, i })).filter((x) => parcelaAberta(x.p))
    .sort((a, b) => String(a.p.vencimento).localeCompare(String(b.p.vencimento)) || a.p.n - b.p.n)
  const novas = [...parcelas]
  let resta = Math.round(valor * 100) / 100
  let quitadas = 0
  for (const { p, i } of ordem) {
    if (resta <= 0.004) break
    const falta = Math.round(((+p.valor || 0) - recebidoDaParcela(p)) * 100) / 100
    const enc = Math.min(resta, encargoDe ? encargoDe(p) : 0)
    resta = Math.round((resta - enc) * 100) / 100
    const parte = Math.min(falta, resta)
    novas[i] = { ...p, recebimentos: [...(p.recebimentos || []), { ...rec, id: rec.id + '-' + p.n, valor: parte, ...(enc > 0 ? { encargo: enc } : {}) }] }
    resta = Math.round((resta - parte) * 100) / 100
    if (parte >= falta - 0.004) quitadas++
  }
  return { parcelas: novas, quitadas, sobra: resta }
}

// ---------- Multa e juros por atraso
// db.config.atraso = { multaPct, jurosMesPct, carenciaDias }
// Multa: % do que falta, uma vez. Juros: % ao mês, por dia de atraso (contados a partir do fim da carência).
// O que já foi pago de multa/juros (recebimento.encargo) é descontado.
export const encargoPago = (p) => (p.recebimentos || []).reduce((s, r) => s + (+r.encargo || 0), 0)
export const encargosRecebidos = (v) => (v.fiado?.parcelas || []).reduce((s, p) => s + encargoPago(p), 0)
export function encargoAtraso(p, cfg, dia = hoje()) {
  const zero = { dias: 0, multa: 0, juros: 0, total: 0 }
  if (!cfg || !(+cfg.multaPct > 0 || +cfg.jurosMesPct > 0) || p.naoPaga) return zero
  const falta = (+p.valor || 0) - recebidoDaParcela(p)
  if (falta <= 0.004 || !p.vencimento) return zero
  const dias = Math.round((new Date(dia + 'T12:00:00') - new Date(p.vencimento + 'T12:00:00')) / 86400000)
  if (dias <= 0 || dias <= (+cfg.carenciaDias || 0)) return zero
  const r = (x) => Math.round(x * 100) / 100
  const multa = r(falta * (+cfg.multaPct || 0) / 100)
  const juros = r(falta * ((+cfg.jurosMesPct || 0) / 100 / 30) * (dias - (+cfg.carenciaDias || 0)))
  return { dias, multa, juros, total: Math.max(0, r(multa + juros - encargoPago(p))) }
}
export const textoAtraso = (cfg) => cfg && (+cfg.multaPct > 0 || +cfg.jurosMesPct > 0)
  ? [+cfg.multaPct > 0 && t('multa {p}%', { p: String(cfg.multaPct).replace('.', ',') }), +cfg.jurosMesPct > 0 && t('juros {p}% ao mês', { p: String(cfg.jurosMesPct).replace('.', ',') })].filter(Boolean).join(' + ')
    + (+cfg.carenciaDias > 0 ? ' ' + t('(depois de {n} dia(s) de atraso)', { n: cfg.carenciaDias }) : '')
  : ''

// Quanto falta receber de uma lista (vendas fiado ou empréstimos): parcelas em aberto + multa e juros de atraso de hoje
export function faltaReceber(lista, cfgAtraso) {
  return Math.round((lista || []).reduce((s, v) => s + (resumoFiado(v)?.aberto || 0)
    + (v.fiado?.parcelas || []).reduce((a, p) => a + encargoAtraso(p, cfgAtraso).total, 0), 0) * 100) / 100
}

// Perdas por "Não pagou" (fiado ou empréstimo): contam no dia em que você marcou.
// Parcelas marcadas antes desta regra (sem a data) contam no dia da venda/empréstimo.
// Devolve [{ dia, data, valor, ref }] — filtre pelo período.
export function perdasNaoPago(lista) {
  const l = []
  for (const v of lista || []) for (const p of v.fiado?.parcelas || []) {
    if (!p.naoPaga) continue
    const falta = Math.round(((+p.valor || 0) - recebidoDaParcela(p)) * 100) / 100
    if (falta > 0.004) l.push({ dia: p.naoPagaEm?.dia || v.dia, data: p.naoPagaEm?.data || v.data, valor: falta, ref: v })
  }
  return l
}
export const somaPerdas = (perdas, de, ate = de) => Math.round(perdas.filter((x) => x.dia >= de && x.dia <= ate).reduce((s, x) => s + x.valor, 0) * 100) / 100
