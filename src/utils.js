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
  if (e.tipo === 'nenhuma') return { preco: +custo, tipo: 'nenhuma', regra: null, padrao: false }
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
// Retorna Map nome normalizado → { k, produto, entradas, vendidos, saldo, custo, ultimoCusto }
// custo = CUSTO MÉDIO PONDERADO das unidades em estoque (padrão do varejo):
//   cada entrada mistura o custo dela com o das unidades que ainda estão lá;
//   cada venda tira unidades sem mudar o custo médio das que sobram.
//   Ex.: 1 un. a R$ 1.000 + 1 un. a R$ 100 → custo médio R$ 550, valor em estoque R$ 1.100.
export function calcularEstoque(db) {
  const m = new Map()
  const pega = (k, produto) => {
    if (!m.has(k)) m.set(k, { k, produto, entradas: 0, vendidos: 0, saldo: 0, custo: null, ultimoCusto: null, temEntrada: false })
    return m.get(k)
  }
  // entradas e vendas em ordem de data
  const eventos = [
    ...(db.entradas || []).map((e) => ({ data: e.data || 0, ordem: 0, entrada: e })),
    ...(db.vendas || []).flatMap((v) => (v.itens || []).filter((i) => i.origem === 'estoque').map((i) => ({ data: v.data || 0, ordem: 1, item: i }))),
  ].sort((a, b) => a.data - b.data || a.ordem - b.ordem)
  for (const ev of eventos) {
    if (ev.entrada) {
      const e = ev.entrada
      const s = pega(norm(e.produto), e.produto)
      const qtd = +e.qtd || 0
      s.temEntrada = true
      s.produto = e.produto
      s.entradas += qtd
      if (e.custo != null) {
        const c = +e.custo
        const antes = Math.max(0, s.saldo)
        s.custo = antes > 0 && s.custo != null ? (antes * s.custo + qtd * c) / (antes + qtd) : c
        s.ultimoCusto = c
      }
      s.saldo += qtd
    } else {
      const i = ev.item
      const s = pega(norm(i.produto), i.produto)
      s.vendidos += +i.qtd || 0
      s.saldo -= +i.qtd || 0
    }
  }
  // produto que só aparece em vendas (sem nenhuma entrada) não entra na lista do estoque
  for (const [k, s] of m) {
    if (!s.temEntrada) m.delete(k)
    else { if (s.custo != null) s.custo = Math.round(s.custo * 100) / 100; delete s.temEntrada }
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
    ...(db.vendas || []).filter(depois).map((v) => ({
      id: 'v-' + v.id, ref: v, origem: 'venda', data: v.data, dia: v.dia, valor: +v.total || 0,
      descricao: (v.itens || []).map((i) => `${i.qtd}× ${i.produto}`).join(', '), pagamento: v.pagamento,
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
export const lucroVenda = (v) => lucroDe(v.itens, fatorDesconto(v))

