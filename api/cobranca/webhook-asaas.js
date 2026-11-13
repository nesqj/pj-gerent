// Aviso de pagamento do Asaas. Cadastrado em "Testar e conectar" (ou à mão, com o token mostrado na tela).
import crypto from 'node:crypto'
import { corpoBruto, responder, srv } from '../_lib/comum.js'

export const config = { api: { bodyParser: false } }

const igual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'metodo' })
  try {
    const cfg = await srv('srv_config')
    if (!igual(req.headers['asaas-access-token'], cfg.webhook_segredo)) return responder(res, 401, { erro: 'token' })
    const ev = JSON.parse(await corpoBruto(req))
    const base = { prov: 'asaas', evento: ev.id || null, o: null, pago_ate_exato: null, vencimento: null, valor: null, referencia: null, cliente: null }
    let r = 'ignorado'

    if (ev.event === 'PAYMENT_CONFIRMED' || ev.event === 'PAYMENT_RECEIVED') {
      const p = ev.payment || {}
      if (p.subscription) {
        r = await srv('srv_evento', {
          ...base, tipo: 'pago', assinatura: p.subscription, cliente: p.customer || null,
          o: /^[0-9a-f-]{36}$/i.test(p.externalReference || '') ? p.externalReference : null,
          vencimento: p.dueDate, valor: Math.round(Number(p.value || 0) * 100), referencia: p.id,
        })
      }
    } else if (ev.event === 'SUBSCRIPTION_DELETED' || ev.event === 'SUBSCRIPTION_INACTIVATED') {
      const s = ev.subscription || {}
      r = await srv('srv_evento', { ...base, tipo: 'cancelado', assinatura: s.id, cliente: s.customer || null })
    }
    responder(res, 200, { ok: true, resultado: r })
  } catch (e) {
    console.error(e)
    responder(res, 500, { erro: 'erro-interno' }) // o Asaas tenta de novo mais tarde
  }
}
