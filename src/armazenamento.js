// Camada de armazenamento.
// Hoje guarda tudo no navegador (localStorage). Quando o banco de dados
// (Supabase) for criado, basta reescrever estas funções mantendo os mesmos
// nomes — os componentes não precisam mudar.

import { t } from './i18n.js'

const KEY = 'gerenciador-precos-v1'
const vazio = () => ({ fornecedores: [], precosForn: [], vendas: [], entradas: [] })
let db = vazio()

function gravar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    throw new Error(t('Não foi possível salvar no navegador. Baixe uma cópia em Configurações → Cópia de segurança.'))
  }
}

function upsert(lista, obj) {
  const i = db[lista].findIndex((x) => x.id === obj.id)
  if (i >= 0) db[lista][i] = obj
  else db[lista].push(obj)
  gravar()
  return obj
}

function remover(lista, id) {
  db[lista] = db[lista].filter((x) => x.id !== id)
  gravar()
}

// Carrega todos os dados: { fornecedores, precosForn, vendas, entradas, regras, regraPadraoId, precoProduto, perfil, config }
export async function carregar() {
  try {
    const s = localStorage.getItem(KEY)
    if (s) db = { ...vazio(), ...JSON.parse(s) }
  } catch {
    /* navegador sem acesso ao armazenamento: começa vazio */
  }
  return structuredClone(db)
}

export async function salvarFornecedor(f) { return upsert('fornecedores', f) }
export async function excluirFornecedor(id) {
  db.precosForn = db.precosForn.filter((p) => p.fornecedorId !== id) // remove os preços dele também
  remover('fornecedores', id)
}

export async function salvarPrecoFornecedor(p) { return upsert('precosForn', p) }
export async function excluirPrecoFornecedor(id) { remover('precosForn', id) }


// Perfil de quem usa: { nome, idioma, fuso, avatar }
export async function salvarPerfil(p) {
  db.perfil = p
  gravar()
  return p
}

// Configurações gerais: { nomeLoja, cor, logo (data URL), avisosEstoque }
export async function salvarConfig(c) {
  db.config = c
  gravar()
  return c
}

// Regras de preço: lista [{ id, nome, percentual }] e qual é a padrão (id ou null)
export async function salvarRegras(regras, regraPadraoId) {
  db.regras = regras
  db.regraPadraoId = regraPadraoId ?? null
  delete db.regra // a regra única antiga vira parte da lista
  // escolhas de produtos que apontavam para regras excluídas voltam para a padrão
  for (const [k, e] of Object.entries(db.precoProduto || {})) {
    if (e.tipo === 'regra' && !regras.some((r) => r.id === e.regraId)) delete db.precoProduto[k]
  }
  gravar()
}

// Escolha de preço de um produto (chave produto|marca); null volta para a regra padrão
export async function salvarPrecoProduto(k, escolha) {
  db.precoProduto = { ...db.precoProduto }
  if (!escolha || escolha.tipo === 'padrao') delete db.precoProduto[k]
  else db.precoProduto[k] = escolha
  gravar()
}

// Vendas: { id, data (timestamp), dia 'AAAA-MM-DD', itens: [{ produto, marca, qtd, preco, custo, origem: 'estoque' | 'fornecedor' }], pagamento, total }
export async function salvarVenda(v) { return upsert('vendas', v) }
export async function excluirVenda(id) { remover('vendas', id) }


// Entradas de estoque (sem fornecedor/marca): { id, data, dia, produto, qtd, custo, obs }
export async function salvarEntrada(e) { return upsert('entradas', e) }
export async function excluirEntrada(id) { remover('entradas', id) }

// Substitui todos os dados (usado ao restaurar backup)
export async function substituirTudo(dados) {
  db = { ...vazio(), ...structuredClone(dados) }
  gravar()
}
