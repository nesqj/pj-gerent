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
  'limite-plano': 'O plano desta loja chegou ao máximo de pessoas. Troque de plano para adicionar mais.',
  'plano-invalido': 'Plano inválido.',
  'troca-fale-com-admin': 'Depois do teste grátis, a troca de plano é feita pelo administrador da plataforma.',
  'regularize-antes': 'Regularize o pagamento antes de trocar de plano.',
  'intervalo-diferente': 'Só dá para trocar entre planos com o mesmo intervalo (mensal ou anual).',
  'acima-do-plano': 'A loja tem mais pessoas do que o plano escolhido permite.',
  'provedor-em-uso': 'Há lojas pagando pelo provedor atual. Não dá para trocar agora.',
  'plano-travado': 'Preço e intervalo travam depois que alguém assina. Arquive e crie outro plano.',
  'escolha-um-plano': 'Escolha um plano para a loja primeiro.',
  'valor-invalido': 'Valor inválido.',
  planos_preco_centavos_check: 'O preço mínimo é R$ 5,00.',
  planos_nome_check: 'O nome precisa ter de 1 a 60 caracteres.',
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
    if (codigo) throw new Error(t(MENSAGENS[codigo]))
    // erro inesperado do banco: mostra o motivo técnico junto, para dar para descobrir o que houve
    throw new Error(t('Não foi possível concluir. Verifique a internet e tente de novo.') + (error.message ? ` (${error.message})` : ''))
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
export async function auditoria({ org, usuario, limite = 200 } = {}) {
  let q = supabase.from('auditoria').select('id, criado_em, org_id, org_nome, user_id, email, acao, detalhe').order('criado_em', { ascending: false }).limit(limite)
  if (org) q = q.eq('org_id', org)
  if (usuario) q = q.eq('user_id', usuario)
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
  'pedido.criado': 'Pedido de cadastro recebido', 'org.cadastro': 'Cadastro da loja alterado',
  'plataforma.marca': 'Marca da plataforma alterada', 'cobranca.plano': 'Plano da loja alterado', 'cobranca.config': 'Cobrança configurada',
  'cobranca.provedor': 'Provedor de cobrança escolhido', 'cobranca.segredo': 'Senha do servidor trocada',
  'cobranca.conectada': 'Provedor de cobrança conectado', 'cobranca.isenta': 'Loja isenta de cobrança', 'cobranca.cobrar': 'Loja volta a ser cobrada',
  'cobranca.pago-manual': 'Pagamento registrado à mão', 'cobranca.teste': 'Teste grátis estendido', 'cobranca.pago': 'Pagamento recebido',
  'cobranca.cancelada': 'Assinatura cancelada no provedor', 'plano.criado': 'Plano criado', 'plano.alterado': 'Plano alterado',
  'plano.padrao': 'Plano padrão escolhido', 'plano.arquivado': 'Plano arquivado', 'pedido.aprovado': 'Pedido de cadastro aprovado', 'pedido.recusado': 'Pedido de cadastro recusado',
}
export const nomeAcao = (a) => (ACOES[a] ? t(ACOES[a]) : a)

// ---------- cadastro da loja e marca da plataforma
export const salvarCadastroOrg = (o, dados) => chamar('salvar_cadastro_org', { o, dados })
export async function buscarCadastroOrg(id) {
  const { data, error } = await supabase.from('organizacoes').select('cadastro').eq('id', id).maybeSingle()
  if (error) throw new Error(t('Não foi possível concluir. Verifique a internet e tente de novo.'))
  return data?.cadastro || {}
}
export async function marcaPlataforma() {
  const { data, error } = await supabase.rpc('marca_plataforma')
  return error ? {} : data || {}
}
export const salvarMarca = (m) => chamar('salvar_marca', { m })

// ---------- cobrança
export const SITUACOES = {
  isenta: { nome: 'Isenta', classe: '' },
  teste: { nome: 'Teste grátis', classe: 'ok' },
  em_dia: { nome: 'Em dia', classe: 'ok' },
  aguardando: { nome: 'Aguardando o 1º pagamento', classe: 'bad' },
  atrasada: { nome: 'Em atraso', classe: 'bad' },
  suspensa: { nome: 'Suspensa por falta de pagamento', classe: 'bad' },
}
export const nomeSituacao = (s) => t(SITUACOES[s]?.nome || s || '-')

export const cobrancaDaOrg = (o) => chamar('cobranca_da_org', { o })
export const trocarPlano = (o, plano) => chamar('trocar_plano', { o, novo: plano })
export const cobrancaConfig = () => chamar('cobranca_config_admin')
export const definirCobranca = (ligar, tolerancia) => chamar('definir_cobranca', { ligar, tolerancia })
export const definirProvedor = (p) => chamar('definir_provedor', { novo: p })
export const trocarSegredoServidor = () => chamar('trocar_segredo_servidor')
export const salvarPlano = (p) => chamar('salvar_plano', {
  pid: p.id || null, nome_plano: p.nome, preco: p.preco_centavos, intervalo_plano: p.intervalo, dias: p.dias_teste,
  max_p: p.max_pessoas || null, visivel_plano: p.visivel,
})
export const planoPadrao = (id) => chamar('plano_padrao', { pid: id })
export const arquivarPlano = (id) => chamar('arquivar_plano', { pid: id })
export const cobrancaResumo = () => chamar('cobranca_resumo')
export const isentarLoja = (o, isentar) => chamar('isentar_loja', { o, isentar })
export const marcarPago = (o, valor, obs) => chamar('marcar_pago', { o, valor, obs })
export const estenderTeste = (o, dias) => chamar('estender_teste', { o, dias })
export async function planos({ todos } = {}) {
  let q = supabase.from('planos').select('*').order('preco_centavos')
  if (!todos) q = q.is('arquivado_em', null)
  const { data, error } = await q
  if (error) throw new Error(t('Não foi possível concluir. Verifique a internet e tente de novo.'))
  return data
}

// Funções de servidor da cobrança (pasta api/, na Vercel)
const ERROS_SERVIDOR = {
  'sem-permissao': 'Você não tem permissão para fazer isso.',
  'segredo-invalido': 'A senha do servidor (COBRANCA_SEGREDO) na Vercel não confere com a do banco. Copie de novo em Cobrança → Conexão.',
  'sem-segredo': 'Falta cadastrar COBRANCA_SEGREDO nas variáveis de ambiente da Vercel.',
  'sem-provedor': 'Escolha o provedor em Cobrança → Conexão.',
  'sem-chave-stripe': 'Falta cadastrar STRIPE_SECRET_KEY nas variáveis de ambiente da Vercel.',
  'sem-chave-asaas': 'Falta cadastrar ASAAS_API_KEY nas variáveis de ambiente da Vercel.',
  'cobranca-desligada': 'A cobrança está desligada.',
  'loja-isenta': 'Esta loja não tem plano para pagar.',
  'cpf-cnpj': 'Informe um CPF ou CNPJ válido de quem paga.',
  'sem-fatura': 'Não há fatura em aberto agora.',
  'erro-stripe': 'A Stripe recusou o pedido.',
  'erro-asaas': 'O Asaas recusou o pedido.',
}
export async function servidor(caminho, corpo, metodo = 'POST') {
  const { data } = await supabase.auth.getSession()
  let r
  try {
    r = await fetch('/api/cobranca/' + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
      body: metodo === 'GET' ? undefined : JSON.stringify(corpo || {}),
    })
  } catch {
    throw new Error(t('Não foi possível concluir. Verifique a internet e tente de novo.'))
  }
  const j = await r.json().catch(() => null)
  if (!j) throw new Error(t('As funções de servidor não responderam. Elas só funcionam no site publicado na Vercel.'))
  if (!r.ok) {
    const base = t(ERROS_SERVIDOR[j.erro] || 'Não foi possível concluir. Verifique a internet e tente de novo.')
    throw new Error(j.detalhe ? `${base} (${j.detalhe})` : base)
  }
  return j
}
