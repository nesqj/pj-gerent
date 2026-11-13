// Painel → Cobrança → Conexão → "Testar e conectar" (só administrador da plataforma).
// Testa a chave do provedor escolhido e cadastra o aviso de pagamento (webhook) nele.
import {
  ASAAS_EVENTOS, ErroHttp, STRIPE_API_VERSAO, STRIPE_EVENTOS, aleatorio, asaas, asaasEmTeste, corpoJson, endereco, env,
  origem, rpc, srv, stripe, stripeEmTeste, tokenDe,
} from '../_lib/comum.js'

export default endereco('POST', async (req) => {
  const token = tokenDe(req)
  if (!(await rpc('e_admin_plataforma', {}, token))) throw new ErroHttp(403, 'sem-permissao')
  const { email } = await corpoJson(req)
  if (!env('COBRANCA_SEGREDO')) throw new ErroHttp(400, 'sem-segredo')
  const config = await srv('srv_config')
  const prov = config.provedor
  if (!prov) throw new ErroHttp(400, 'sem-provedor')
  const url = `${origem(req)}/api/cobranca/webhook-${prov}`

  if (prov === 'stripe') {
    if (!env('STRIPE_SECRET_KEY')) throw new ErroHttp(400, 'sem-chave-stripe')
    await stripe('GET', '/customers?limit=1') // testa a chave
    if (config.webhook_id) await stripe('DELETE', `/webhook_endpoints/${config.webhook_id}`).catch(() => {})
    const w = await stripe('POST', '/webhook_endpoints', {
      url, enabled_events: STRIPE_EVENTOS, api_version: STRIPE_API_VERSAO, description: 'PJ GERENT — cobrança',
    })
    await srv('srv_salvar_conexao', { prov, teste: stripeEmTeste(), wid: w.id, wsegredo: w.secret, wurl: url })
    return { ok: true, modo_teste: stripeEmTeste(), webhook_url: url }
  }

  // Asaas
  if (!env('ASAAS_API_KEY')) throw new ErroHttp(400, 'sem-chave-asaas')
  await asaas('GET', '/customers?limit=1') // testa a chave
  const tokenAviso = aleatorio(24) // 48 caracteres
  let wid = null
  let manual = false
  try {
    if (config.webhook_id) await asaas('DELETE', `/webhooks/${config.webhook_id}`).catch(() => {})
    const w = await asaas('POST', '/webhooks', {
      name: 'PJ GERENT — cobrança', url, email: email || undefined, enabled: true, interrupted: false, apiVersion: 3,
      authToken: tokenAviso, sendType: 'SEQUENTIALLY', events: ASAAS_EVENTOS,
    })
    wid = w.id
  } catch {
    manual = true // a conta não deixou cadastrar pela API: a tela mostra o passo a passo
  }
  await srv('srv_salvar_conexao', { prov, teste: asaasEmTeste(), wid, wsegredo: tokenAviso, wurl: url })
  return { ok: true, modo_teste: asaasEmTeste(), webhook_url: url, manual: manual ? { url, token: tokenAviso, eventos: ASAAS_EVENTOS } : null }
})
