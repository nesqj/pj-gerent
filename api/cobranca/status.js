// Painel → Cobrança → Conexão: o que está cadastrado na Vercel (sem mostrar nenhuma chave).
import { ErroHttp, asaasEmTeste, endereco, env, origem, rpc, srv, stripeEmTeste, tokenDe } from '../_lib/comum.js'

export default endereco('GET', async (req) => {
  if (!(await rpc('e_admin_plataforma', {}, tokenDe(req)))) throw new ErroHttp(403, 'sem-permissao')
  let segredoOk = false
  if (env('COBRANCA_SEGREDO')) {
    try { await srv('srv_config'); segredoOk = true } catch { segredoOk = false }
  }
  return {
    servidor: true,
    segredo: { cadastrado: !!env('COBRANCA_SEGREDO'), confere: segredoOk },
    stripe: { chave: !!env('STRIPE_SECRET_KEY'), teste: stripeEmTeste() },
    asaas: { chave: !!env('ASAAS_API_KEY'), teste: asaasEmTeste() },
    origem: origem(req),
  }
})
