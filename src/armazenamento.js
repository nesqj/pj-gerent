// Camada de armazenamento — Supabase, por loja (organização).
// Os dados de cada loja ficam numa linha da tabela "dados_org" (campo JSON "conteudo").
// O app mantém uma cópia em memória; cada alteração é enviada ao banco pela função "salvar_dados".
// Se outra pessoa (ou outro aparelho) salvou antes, o banco recusa ("conflito"): o app busca a versão
// nova, refaz a alteração em cima dela e tenta de novo — assim nada do que o outro salvou se perde.
// O perfil (nome, idioma, tema, fuso, avatar) é de cada pessoa e fica na conta dela, não na loja.
// As funções têm os mesmos nomes da versão antiga, então as telas não mudaram.

import { t } from './i18n.js'
import { supabase } from './supabase.js'

const CHAVE_NAVEGADOR = 'gerenciador-precos-v1' // onde a versão sem banco guardava os dados
const vazio = () => ({ fornecedores: [], precosForn: [], vendas: [], entradas: [] })

let org = null          // loja ativa: { id, nome, papel, suspensa, criada_por_mim }
let db = vazio()
let versao = 0
let carregadoDe = null  // id da loja cujos dados estão na memória
let perfil = null       // perfil de quem está logado

// ---------- loja ativa e papéis

// O que cada papel pode gravar (o banco também confere: leitor não grava nada)
const PODE = {
  admin: () => true,
  gerente: (acao) => acao !== 'tudo.substituido',
  vendedor: (acao) => /^(venda|entrada)\./.test(acao),
  leitor: () => false,
}
export const podeFazer = (acao) => !!org && (PODE[org.papel] || PODE.leitor)(acao)

export function definirOrg(o) {
  if (o?.id !== carregadoDe) { db = vazio(); versao = 0; carregadoDe = null }
  org = o
}
export const orgAtiva = () => org

// ---------- leitura

async function idUsuario() {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new Error(t('Sua sessão expirou. Entre de novo.'))
  return data.session.user
}

async function buscar() {
  const { data, error } = await supabase.from('dados_org').select('conteudo, versao').eq('org_id', org.id).maybeSingle()
  if (error) throw new Error(t('Não foi possível carregar os dados do banco. Verifique a internet e tente de novo.'))
  db = { ...vazio(), ...(data?.conteudo || {}) }
  versao = data?.versao ?? 0
  carregadoDe = org.id
}

// Carrega os dados da loja ativa: { fornecedores, precosForn, vendas, entradas, regras, regraPadraoId, precoProduto, config, perfil }
// Busca no banco só na primeira vez (ou quando troca de loja); depois usa a cópia em memória.
export async function carregar() {
  const usuario = await idUsuario()
  if (!org) throw new Error(t('Nenhuma loja selecionada.'))
  if (carregadoDe !== org.id) await buscar()
  if (!perfil) {
    // perfil da conta; quem veio da versão antiga ainda tem o perfil guardado dentro dos dados da loja
    perfil = usuario.user_metadata?.perfil || (org.criada_por_mim && db.perfil) || {}
  }
  const copia = structuredClone(db)
  copia.perfil = { ...perfil }
  return copia
}

// Busca de novo se alguém alterou a loja (ao voltar para o app). Retorna true se mudou.
export async function atualizarSeMudou() {
  if (!org || carregadoDe !== org.id) return false
  const { data, error } = await supabase.from('dados_org').select('versao').eq('org_id', org.id).maybeSingle()
  if (error || (data?.versao ?? 0) === versao) return false
  await buscar()
  return true
}

// Esquece tudo da memória (ao sair da conta)
export function limpar() {
  org = null
  db = vazio()
  versao = 0
  carregadoDe = null
  perfil = null
}

// ---------- gravação

const MENSAGENS = {
  'sem-permissao': 'Seu papel nesta loja não permite fazer isso.',
  'loja-suspensa': 'Esta loja está suspensa. Fale com o administrador da plataforma.',
}
function mensagemDoBanco(error) {
  const codigo = Object.keys(MENSAGENS).find((c) => error?.message?.includes(c))
  return t(codigo ? MENSAGENS[codigo] : 'Não foi possível salvar no banco de dados. Verifique a internet e tente de novo.')
}

// Registro na auditoria (se falhar, não atrapalha o que já foi salvo)
export function registrar(acao, detalhe) {
  supabase.from('auditoria').insert({ org_id: org?.id ?? null, acao, detalhe: detalhe ? String(detalhe).slice(0, 300) : null })
    .then(() => {}, () => {})
}

// Aplica uma alteração numa cópia, envia e só então troca a memória.
// "acao" diz o que é (para permissões e auditoria); "detalhe" é um resumo legível.
async function mudar(acao, fn, detalhe) {
  await idUsuario()
  if (!org) throw new Error(t('Nenhuma loja selecionada.'))
  if (!podeFazer(acao)) throw new Error(t(MENSAGENS['sem-permissao']))
  if (carregadoDe !== org.id) await buscar()
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const novo = structuredClone(db)
    delete novo.perfil // o perfil é de cada pessoa, não da loja
    const r = fn(novo)
    const { data, error } = await supabase.rpc('salvar_dados', { o: org.id, novo_conteudo: novo, versao_esperada: versao })
    if (!error) {
      db = novo
      versao = data
      registrar(acao, typeof detalhe === 'function' ? detalhe(r) : detalhe)
      return r
    }
    if (!error.message?.includes('conflito')) throw new Error(mensagemDoBanco(error))
    await buscar() // alguém salvou antes: pega a versão nova e refaz a alteração
  }
  throw new Error(t('Outra pessoa está alterando os dados agora. Tente de novo em instantes.'))
}

const upsert = (lista, acao, obj, detalhe) => mudar(acao, (d) => {
  const i = d[lista].findIndex((x) => x.id === obj.id)
  if (i >= 0) d[lista][i] = obj
  else d[lista].push(obj)
  return obj
}, detalhe)

const remover = (lista, acao, id) => mudar(acao, (d) => {
  const item = d[lista].find((x) => x.id === id)
  d[lista] = d[lista].filter((x) => x.id !== id)
  return item
}, (item) => resumo(lista, item))

// Resumo legível de um registro, para a auditoria
function resumo(lista, x) {
  if (!x) return null
  if (lista === 'fornecedores') return x.nome
  if (lista === 'precosForn') return [x.produto, x.marca].filter(Boolean).join(' — ')
  if (lista === 'vendas') return (x.itens || []).map((i) => `${i.qtd}× ${i.produto}`).join(', ') + ` = ${x.total}`
  if (lista === 'entradas') return `${x.qtd}× ${x.produto}`
  return null
}

// A loja ainda não tem nada salvo?
export const contaVazia = (d) => !['fornecedores', 'precosForn', 'vendas', 'entradas'].some((k) => d?.[k]?.length) && !d?.regras?.length

// Dados que a versão sem banco deixou guardados neste navegador (ou null)
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

export const salvarFornecedor = (f) => upsert('fornecedores', 'fornecedor.salvo', f, f.nome)
export const excluirFornecedor = (id) => mudar('fornecedor.excluido', (d) => {
  const f = d.fornecedores.find((x) => x.id === id)
  d.precosForn = d.precosForn.filter((p) => p.fornecedorId !== id) // remove os preços dele também
  d.fornecedores = d.fornecedores.filter((x) => x.id !== id)
  return f
}, (f) => f?.nome)

export const salvarPrecoFornecedor = (p) => upsert('precosForn', 'preco-fornecedor.salvo', p, resumo('precosForn', p))
export const excluirPrecoFornecedor = (id) => remover('precosForn', 'preco-fornecedor.excluido', id)

// Perfil de quem usa: { nome, idioma, tema, fuso, avatar } — fica na conta da pessoa
export async function salvarPerfil(p) {
  const { error } = await supabase.auth.updateUser({ data: { perfil: p, nome: p.nome || undefined } })
  if (error) throw new Error(t('Não foi possível salvar no banco de dados. Verifique a internet e tente de novo.'))
  perfil = { ...p }
  return p
}

// Configurações da loja: { nomeLoja, cor, corEscuro, logo, logoEscuro, avisosEstoque }
export const salvarConfig = (c) => mudar('config.salva', (d) => { d.config = c; return c }, c.nomeLoja || null)

// Regras de preço: lista [{ id, nome, percentual }] e qual é a padrão (id ou null)
export const salvarRegras = (regras, regraPadraoId) => mudar('regras.salvas', (d) => {
  d.regras = regras
  d.regraPadraoId = regraPadraoId ?? null
  delete d.regra // a regra única antiga vira parte da lista
  // escolhas de produtos que apontavam para regras excluídas voltam para a padrão
  for (const [k, e] of Object.entries(d.precoProduto || {})) {
    if (e.tipo === 'regra' && !regras.some((r) => r.id === e.regraId)) delete d.precoProduto[k]
  }
}, regras.map((r) => `${r.nome} ${r.percentual}%`).join(', '))

// Escolha de preço de um produto (chave produto|marca); null volta para a regra padrão
export const salvarPrecoProduto = (k, escolha) => mudar('preco-venda.salvo', (d) => {
  d.precoProduto = { ...d.precoProduto }
  if (!escolha || escolha.tipo === 'padrao') delete d.precoProduto[k]
  else d.precoProduto[k] = escolha
}, k.replace('|', ' — ') + ': ' + (escolha?.tipo === 'fixo' ? escolha.valor : escolha?.tipo || 'padrao'))

// Vendas: { id, data, dia 'AAAA-MM-DD', itens: [{ produto, marca, qtd, preco, custo, origem }], pagamento, subtotal, descontoPct, descontoValor, total }
export const salvarVenda = (v) => upsert('vendas', 'venda.salva', v, resumo('vendas', v))
export const excluirVenda = (id) => remover('vendas', 'venda.excluida', id)

// Entradas de estoque: { id, data, dia, produto, qtd, custo, obs }
export const salvarEntrada = (e) => upsert('entradas', 'entrada.salva', e, resumo('entradas', e))
export const excluirEntrada = (id) => remover('entradas', 'entrada.excluida', id)

// Substitui todos os dados da loja (restaurar backup ou trazer os dados do navegador)
export const substituirTudo = (dados) => mudar('tudo.substituido', (d) => {
  for (const k of Object.keys(d)) delete d[k]
  Object.assign(d, vazio(), structuredClone(dados))
  delete d.perfil
}, null)
