// Camada de armazenamento — Supabase.
// Os dados de cada conta ficam numa linha da tabela "dados_loja" (campo JSON "conteudo").
// O app mantém uma cópia em memória; cada alteração é enviada ao banco. Se o envio falhar,
// a alteração é desfeita na memória e a tela mostra o erro.
// As funções têm os mesmos nomes da versão antiga (navegador), então as telas não mudaram.

import { t } from './i18n.js'
import { supabase } from './supabase.js'

const TABELA = 'dados_loja'
const CHAVE_NAVEGADOR = 'gerenciador-precos-v1' // onde a versão antiga guardava os dados
const vazio = () => ({ fornecedores: [], precosForn: [], vendas: [], entradas: [] })

let db = vazio()
let carregadoDe = null // id da conta cujos dados estão na memória

async function idUsuario() {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new Error(t('Sua sessão expirou. Entre de novo.'))
  return id
}

async function enviar() {
  const user_id = await idUsuario()
  const { error } = await supabase.from(TABELA).upsert({ user_id, conteudo: db })
  if (error) throw new Error(t('Não foi possível salvar no banco de dados. Verifique a internet e tente de novo.'))
}

// Aplica uma alteração na memória e envia; se der erro, volta como estava
async function mudar(fn) {
  const antes = structuredClone(db)
  const r = fn(db)
  try {
    await enviar()
  } catch (e) {
    db = antes
    throw e
  }
  return r
}

const upsert = (lista, obj) => mudar((d) => {
  const i = d[lista].findIndex((x) => x.id === obj.id)
  if (i >= 0) d[lista][i] = obj
  else d[lista].push(obj)
  return obj
})

const remover = (lista, id) => mudar((d) => { d[lista] = d[lista].filter((x) => x.id !== id) })

// Carrega todos os dados da conta: { fornecedores, precosForn, vendas, entradas, regras, regraPadraoId, precoProduto, perfil, config }
// Busca no banco só na primeira vez (ou quando troca de conta); depois usa a cópia em memória.
export async function carregar() {
  const id = await idUsuario()
  if (carregadoDe !== id) {
    const { data, error } = await supabase.from(TABELA).select('conteudo').eq('user_id', id).maybeSingle()
    if (error) throw new Error(t('Não foi possível carregar os dados do banco. Verifique a internet e tente de novo.'))
    db = { ...vazio(), ...(data?.conteudo || {}) }
    carregadoDe = id
  }
  return structuredClone(db)
}

// Esquece os dados da memória (ao sair da conta)
export function limpar() {
  db = vazio()
  carregadoDe = null
}

// A conta ainda não tem nada salvo no banco?
export const contaVazia = (d) => !['fornecedores', 'precosForn', 'vendas', 'entradas'].some((k) => d?.[k]?.length) && !d?.regras?.length

// Dados que a versão antiga deixou guardados neste navegador (ou null)
export function dadosDoNavegador() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE_NAVEGADOR))
    return d && !contaVazia(d) ? d : null
  } catch {
    return null
  }
}
export function esquecerDadosDoNavegador() {
  try { localStorage.removeItem(CHAVE_NAVEGADOR) } catch { /* sem acesso */ }
}

export const salvarFornecedor = (f) => upsert('fornecedores', f)
export const excluirFornecedor = (id) => mudar((d) => {
  d.precosForn = d.precosForn.filter((p) => p.fornecedorId !== id) // remove os preços dele também
  d.fornecedores = d.fornecedores.filter((x) => x.id !== id)
})

export const salvarPrecoFornecedor = (p) => upsert('precosForn', p)
export const excluirPrecoFornecedor = (id) => remover('precosForn', id)

// Perfil de quem usa: { nome, idioma, tema, fuso, avatar }
export const salvarPerfil = (p) => mudar((d) => { d.perfil = p; return p })

// Configurações gerais: { nomeLoja, cor, corEscuro, logo, logoEscuro, avisosEstoque }
export const salvarConfig = (c) => mudar((d) => { d.config = c; return c })

// Regras de preço: lista [{ id, nome, percentual }] e qual é a padrão (id ou null)
export const salvarRegras = (regras, regraPadraoId) => mudar((d) => {
  d.regras = regras
  d.regraPadraoId = regraPadraoId ?? null
  delete d.regra // a regra única antiga vira parte da lista
  // escolhas de produtos que apontavam para regras excluídas voltam para a padrão
  for (const [k, e] of Object.entries(d.precoProduto || {})) {
    if (e.tipo === 'regra' && !regras.some((r) => r.id === e.regraId)) delete d.precoProduto[k]
  }
})

// Escolha de preço de um produto (chave produto|marca); null volta para a regra padrão
export const salvarPrecoProduto = (k, escolha) => mudar((d) => {
  d.precoProduto = { ...d.precoProduto }
  if (!escolha || escolha.tipo === 'padrao') delete d.precoProduto[k]
  else d.precoProduto[k] = escolha
})

// Vendas: { id, data, dia 'AAAA-MM-DD', itens: [{ produto, marca, qtd, preco, custo, origem }], pagamento, subtotal, descontoPct, descontoValor, total }
export const salvarVenda = (v) => upsert('vendas', v)
export const excluirVenda = (id) => remover('vendas', id)

// Entradas de estoque: { id, data, dia, produto, qtd, custo, obs }
export const salvarEntrada = (e) => upsert('entradas', e)
export const excluirEntrada = (id) => remover('entradas', id)

// Substitui todos os dados (restaurar backup ou trazer os dados do navegador)
export const substituirTudo = (dados) => mudar((d) => {
  for (const k of Object.keys(d)) delete d[k]
  Object.assign(d, vazio(), structuredClone(dados))
})
