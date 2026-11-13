// "Assinar" / "Pagar agora" (administrador da loja ou da plataforma).
// Devolve o endereço de pagamento no provedor: página de assinatura da Stripe ou fatura do Asaas.
import {
  ErroHttp, asaas, corpoJson, dataISO, endereco, rpc, somenteDigitos, srv, stripe, tokenDe, voltaSegura,
} from '../_lib/comum.js'

export default endereco('POST', async (req) => {
  const token = tokenDe(req)
  const { org, cpfCnpj, voltar } = await corpoJson(req)
  if (!org) throw new ErroHttp(400, 'sem-loja')
  if (!(await rpc('pode_pagar', { o: org }, token))) throw new ErroHttp(403, 'sem-permissao')
  const config = await srv('srv_config')
  if (!config.ligada) throw new ErroHttp(400, 'cobranca-desligada')
  if (!config.provedor) throw new ErroHttp(400, 'sem-provedor')
  const d = await srv('srv_dados_loja', { o: org })
  if (d.situacao === 'isenta' || !d.plano) throw new ErroHttp(400, 'loja-isenta')
  const volta = voltaSegura(req, voltar)
  const ativa = d.assinatura_ref && !d.cancelada_em && d.provedor === config.provedor

  if (config.provedor === 'stripe') {
    if (ativa) {
      // já assina: a fatura em aberto (atraso) ou o portal para trocar o cartão
      const faturas = await stripe('GET', `/invoices?subscription=${encodeURIComponent(d.assinatura_ref)}&status=open&limit=1`)
      const aberta = faturas.data?.[0]?.hosted_invoice_url
      if (aberta) return { url: aberta }
      const portal = await stripe('POST', '/billing_portal/sessions', { customer: d.cliente_ref, return_url: volta })
      return { url: portal.url }
    }
    let cliente = d.cliente_ref
    if (!cliente) {
      const c = await stripe('POST', '/customers', { email: d.email || undefined, name: d.cadastro?.razao_social || d.nome, metadata: { org_id: org } })
      cliente = c.id
      await srv('srv_registrar_assinatura', { o: org, prov: 'stripe', cliente, assinatura: null, link: null })
    }
    // teste grátis que ainda resta (a Stripe exige pelo menos 48 horas)
    const fimTeste = d.teste_ate ? Math.floor(new Date(d.teste_ate).getTime() / 1000) : 0
    const comTeste = fimTeste > Date.now() / 1000 + 48 * 3600
    const sessao = await stripe('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer: cliente,
      client_reference_id: org,
      line_items: [{ quantity: 1, price_data: {
        currency: 'brl', unit_amount: d.plano.preco_centavos,
        recurring: { interval: d.plano.intervalo === 'anual' ? 'year' : 'month' },
        product_data: { name: `PJ GERENT — ${d.plano.nome}` },
      } }],
      subscription_data: { metadata: { org_id: org }, ...(comTeste ? { trial_end: fimTeste } : {}) },
      success_url: `${volta}?cobranca=ok`,
      cancel_url: volta,
    })
    await srv('srv_registrar_assinatura', { o: org, prov: 'stripe', cliente, assinatura: null, link: sessao.url })
    return { url: sessao.url }
  }

  // Asaas: Pix, boleto ou cartão, escolhido na fatura a cada cobrança
  if (ativa) {
    const pend = await asaas('GET', `/payments?subscription=${encodeURIComponent(d.assinatura_ref)}&status=PENDING&limit=1`)
    const atr = pend.data?.length ? pend : await asaas('GET', `/payments?subscription=${encodeURIComponent(d.assinatura_ref)}&status=OVERDUE&limit=1`)
    const url = atr.data?.[0]?.invoiceUrl || d.link_pagamento
    if (!url) throw new ErroHttp(400, 'sem-fatura')
    return { url }
  }
  let cliente = d.cliente_ref
  if (!cliente) {
    const doc = somenteDigitos(cpfCnpj)
    if (doc.length !== 11 && doc.length !== 14) throw new ErroHttp(400, 'cpf-cnpj')
    const c = await asaas('POST', '/customers', {
      name: d.cadastro?.razao_social || d.nome, cpfCnpj: doc, email: d.email || undefined, externalReference: org, notificationDisabled: false,
    })
    cliente = c.id
    await srv('srv_registrar_assinatura', { o: org, prov: 'asaas', cliente, assinatura: null, link: null })
  }
  const hoje = dataISO(Date.now())
  const vence = d.teste_ate && dataISO(d.teste_ate) > hoje ? dataISO(d.teste_ate) : hoje
  const a = await asaas('POST', '/subscriptions', {
    customer: cliente, billingType: 'UNDEFINED', value: d.plano.preco_centavos / 100, nextDueDate: vence,
    cycle: d.plano.intervalo === 'anual' ? 'YEARLY' : 'MONTHLY', description: `PJ GERENT — ${d.plano.nome} (${d.nome})`,
    externalReference: org,
  })
  const pagamentos = await asaas('GET', `/subscriptions/${a.id}/payments`)
  const url = pagamentos.data?.[0]?.invoiceUrl || null
  await srv('srv_registrar_assinatura', { o: org, prov: 'asaas', cliente, assinatura: a.id, link: url })
  if (!url) throw new ErroHttp(400, 'sem-fatura')
  return { url }
})
