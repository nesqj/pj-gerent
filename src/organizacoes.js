// Lojas (organizações), equipe e painel da plataforma — chamadas às funções do banco
// (ver supabase/organizacoes.sql). Quem pode o quê é conferido no próprio banco.
import { t } from './i18n.js'
import { supabase } from './supabase.js'

export const PAPEIS = [
  { id: 'admin', nome: 'Administrador', desc: 'Tudo, inclusive a equipe e restaurar cópia de segurança.' },
  { id: 'gerente', nome: 'Gerente', desc: 'Tudo, menos a equipe e restaurar cópia de segurança.' },
  { id: 'vendedor', nome: 'Vendedor', desc: 'Registra vendas e entradas no estoque; o resto só vê.' },
  { id: 'leitor', nome: 'Somente leitura', desc: 'Só vê os dados.' },
]
export const nomePapel = (id) => t(PAPEIS.find((p) => p.id === id)?.nome || id)

const MENSAGENS = {
  'sem-permissao': 'Você não tem permissão para fazer isso.',
  'ultimo-admin-plataforma': 'A plataforma precisa de pelo menos um administrador.',
  'ultimo-admin': 'A loja precisa de pelo menos um administrador.',
  'email-invalido': 'E-mail inválido.',
  'sem-conta': 'Não existe conta com este e-mail. A pessoa precisa criar a conta primeiro.',
  'sem-pedido': 'Este pedido já foi resolvido.',
  'suspenda-antes': 'Suspenda a loja antes de excluir.',
  'nome-diferente': 'O nome digitado não confere com o nome da loja.',
  'loja-suspensa': 'Esta loja está suspensa.',
  organizacoes_nome_check: 'O nome precisa ter de 1 a 60 caracteres.',
}

async function chamar(funcao, args) {
  const { data, error } = await supabase.rpc(funcao, args)
  if (error) {
    const codigo = Object.keys(MENSAGENS).find((c) => error.message?.includes(c))
    if (!codigo && /function .* does not exist|Could not find the function/i.test(error.message || '')) {
      throw new Error(t('O banco ainda não tem as tabelas de lojas. Rode o arquivo supabase/organizacoes.sql no SQL Editor do Supabase.'))
    }
    throw new Error(t(codigo ? MENSAGENS[codigo] : 'Não foi possível concluir. Verifique a internet e tente de novo.'))
  }
  return data
}

// ---------- quem está logado
export const entrar = () => chamar('entrar_na_plataforma')          // { admin, pedido: null | 'pendente' | 'recusado' }
export const minhasOrgs = () => chamar('minhas_orgs')               // [{ id, nome, suspensa, papel, criada_por_mim }]

// Uma loja qualquer (o administrador da plataforma pode abrir lojas das quais não é membro)
export async function buscarOrg(id) {
  const { data, error } = await supabase.from('organizacoes').select('id, nome, suspensa').eq('id', id).maybeSingle()
  if (error) throw new Error(t('Não foi possível concluir. Verifique a internet e tente de novo.'))
  return data
}

// ---------- equipe de uma loja
export const equipe = (o) => chamar('equipe_da_org', { o })
export async function convites(o) {
  const { data, error } = await supabase.from('convites').select('email, papel, criado_em').eq('org_id', o).order('criado_em')
  if (error) throw new Error(t('Não foi possível concluir. Verifique a internet e tente de novo.'))
  return data
}
export const adicionarMembro = (o, email, papel) => chamar('adicionar_membro', { o, email_pessoa: email, novo_papel: papel })
export const mudarPapel = (o, pessoa, papel) => chamar('mudar_papel', { o, pessoa, novo_papel: papel })
export const removerMembro = (o, pessoa) => chamar('remover_membro', { o, pessoa })
export const cancelarConvite = (o, email) => chamar('cancelar_convite', { o, email_pessoa: email })

// ---------- painel da plataforma
export const criarOrg = (nome, emailAdmin) => chamar('criar_org', { nome_loja: nome, email_admin: emailAdmin || null })
export const renomearOrg = (o, nome) => chamar('renomear_org', { o, novo_nome: nome })
export const suspenderOrg = (o, suspender) => chamar('suspender_org', { o, suspender })
export const excluirOrg = (o, nome) => chamar('excluir_org', { o, nome_digitado: nome })
export const usoDasOrgs = () => chamar('uso_das_orgs')
export const listarUsuarios = () => chamar('listar_usuarios')
export const listarAdmins = () => chamar('listar_admins')
export const adicionarAdmin = (email) => chamar('adicionar_admin', { email_pessoa: email })
export const removerAdmin = (pessoa) => chamar('remover_admin', { pessoa })
export const definirCadastro = (soConvite, comAprovacao) => chamar('definir_cadastro', { so_convite: soConvite, com_aprovacao: comAprovacao })
export const listarPedidos = () => chamar('listar_pedidos')        // [{ user_id, email, nome, criado_em, situacao, decidido_em }]
export const aprovarPedido = (pessoa, nomeLoja) => chamar('aprovar_pedido', { pessoa, nome_loja: nomeLoja })
export const recusarPedido = (pessoa) => chamar('recusar_pedido', { pessoa })

export async function configPlataforma() {
  const { data, error } = await supabase.from('config_plataforma').select('somente_convite, aprovacao, atualizado_em').maybeSingle()
  if (error) throw new Error(t('Não foi possível concluir. Verifique a internet e tente de novo.'))
  return data || { somente_convite: true, aprovacao: false }
}

// Auditoria (o banco só devolve o que a pessoa pode ver)
export async function auditoria({ org, limite = 200 } = {}) {
  let q = supabase.from('auditoria').select('id, criado_em, org_id, org_nome, email, acao, detalhe').order('criado_em', { ascending: false }).limit(limite)
  if (org) q = q.eq('org_id', org)
  const { data, error } = await q
  if (error) throw new Error(t('Não foi possível concluir. Verifique a internet e tente de novo.'))
  return data
}

// Nome legível de cada ação da auditoria
const ACOES = {
  'fornecedor.salvo': 'Fornecedor salvo', 'fornecedor.excluido': 'Fornecedor excluído',
  'preco-fornecedor.salvo': 'Preço de fornecedor salvo', 'preco-fornecedor.excluido': 'Preço de fornecedor excluído',
  'config.salva': 'Configurações da loja salvas', 'regras.salvas': 'Regras de preço salvas',
  'preco-venda.salvo': 'Preço de venda alterado', 'venda.salva': 'Venda salva', 'venda.excluida': 'Venda excluída',
  'entrada.salva': 'Entrada no estoque salva', 'entrada.excluida': 'Entrada no estoque excluída',
  'tudo.substituido': 'Dados restaurados de arquivo',
  'org.criada': 'Loja criada', 'org.renomeada': 'Loja renomeada', 'org.suspensa': 'Loja suspensa',
  'org.reativada': 'Loja reativada', 'org.excluida': 'Loja excluída',
  'membro.adicionado': 'Pessoa adicionada à loja', 'membro.papel': 'Papel alterado', 'membro.removido': 'Pessoa removida da loja',
  'convite.criado': 'Convite criado', 'convite.aceito': 'Convite aceito', 'convite.cancelado': 'Convite cancelado',
  'admin.primeiro': 'Primeiro administrador da plataforma', 'admin.adicionado': 'Administrador da plataforma adicionado',
  'admin.removido': 'Administrador da plataforma removido', 'cadastro.modo': 'Modo de cadastro alterado',
  'pedido.criado': 'Pedido de cadastro recebido', 'pedido.aprovado': 'Pedido de cadastro aprovado', 'pedido.recusado': 'Pedido de cadastro recusado',
}
export const nomeAcao = (a) => (ACOES[a] ? t(ACOES[a]) : a)
