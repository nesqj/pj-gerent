// Depois de trocar o plano de uma loja que já assina: atualiza o valor no provedor
// (a próxima cobrança já sai com o preço novo; sem cobrar diferença agora).
import { ErroHttp, asaas, corpoJson, endereco, rpc, srv, stripe, tokenDe } from '../_lib/comum.js'

export default endereco('POST', async (req) => {
  const { org } = await corpoJson(req)
  if (!org) throw new ErroHttp(400, 'sem-loja')
  if (!(await rpc('pode_pagar', { o: org }, tokenDe(req)))) throw new ErroHttp(403, 'sem-permissao')
  const d = await srv('srv_dados_loja', { o: org })
  if (!d.assinatura_ref || d.cancelada_em || !d.plano) return { ok: true, nada: true }

  if (d.provedor === 'stripe') {
    const s = await stripe('GET', `/subscriptions/${encodeURIComponent(d.assinatura_ref)}`)
    const item = s.items?.data?.[0]
    if (!item) throw new ErroHttp(400, 'erro-stripe')
    await stripe('POST', `/subscriptions/${encodeURIComponent(d.assinatura_ref)}`, {
      proration_behavior: 'none',
      items: [{ id: item.id, price_data: {
        currency: 'brl', unit_amount: d.plano.preco_centavos, product: item.price.product,
        recurring: { interval: d.plano.intervalo === 'anual' ? 'year' : 'month' },
      } }],
    })
    return { ok: true }
  }
  if (d.provedor === 'asaas') {
    await asaas('POST', `/subscriptions/${encodeURIComponent(d.assinatura_ref)}`, {
      value: d.plano.preco_centavos / 100, updatePendingPayments: true, description: `PJ GERENT — ${d.plano.nome} (${d.nome})`,
    })
    return { ok: true }
  }
  return { ok: true, nada: true }
})
