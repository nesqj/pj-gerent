// Aviso de pagamento da Stripe. Cadastrado sozinho em "Testar e conectar".
import { conferirAssinaturaStripe, corpoBruto, responder, srv } from '../_lib/comum.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'metodo' })
  try {
    const bruto = await corpoBruto(req)
    const cfg = await srv('srv_config')
    if (!conferirAssinaturaStripe(bruto, req.headers['stripe-signature'], cfg.webhook_segredo)) return responder(res, 400, { erro: 'assinatura' })
    const ev = JSON.parse(bruto)
    const obj = ev.data?.object || {}
    const base = { prov: 'stripe', evento: ev.id, o: null, pago_ate_exato: null, vencimento: null, valor: null, referencia: null }
    let r = 'ignorado'

    if (ev.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      r = await srv('srv_evento', { ...base, tipo: 'checkout', assinatura: obj.subscription, cliente: obj.customer, o: obj.client_reference_id || null })
    } else if (ev.type === 'invoice.paid') {
      // fatura de R$ 0 (início do teste grátis) não conta como pagamento
      if (obj.amount_paid > 0) {
        const fim = Math.max(...(obj.lines?.data || []).map((l) => l.period?.end || 0), obj.period_end || 0)
        r = await srv('srv_evento', {
          ...base, tipo: 'pago', assinatura: obj.subscription, cliente: obj.customer,
          o: obj.subscription_details?.metadata?.org_id || null,
          pago_ate_exato: new Date(fim * 1000).toISOString(), valor: obj.amount_paid, referencia: obj.id,
        })
      }
    } else if (ev.type === 'customer.subscription.deleted') {
      r = await srv('srv_evento', { ...base, tipo: 'cancelado', assinatura: obj.id, cliente: obj.customer, o: obj.metadata?.org_id || null })
    }
    responder(res, 200, { ok: true, resultado: r })
  } catch (e) {
    console.error(e)
    responder(res, 500, { erro: 'erro-interno' }) // a Stripe tenta de novo mais tarde
  }
}
