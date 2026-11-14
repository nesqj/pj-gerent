import { t } from '../i18n.js'
import { AvisoCliente } from './Clientes.jsx'
import { brl, hoje, lerValor as numero, norm, PAGAMENTOS, uid } from '../utils.js'

// Pagamento da venda:
//  - uma forma só (Dinheiro, PIX, Débito, Crédito ou Fiado para o valor todo), ou
//  - dividido: várias formas com valores, e o que faltar fica no FIADO (cliente + parcelas + datas)
const somarDias = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const somarMeses = (dia, n) => {
  const [a, m, d] = dia.split('-').map(Number)
  const alvo = new Date(a, m - 1 + n, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}
export const novoPagamento = () => ({
  dividir: false, forma: 'Dinheiro',
  linhas: [{ forma: 'Dinheiro', valor: '' }, { forma: 'PIX', valor: '' }],
  fiado: { clienteId: '', nome: '', telefone: '', parcelas: '1', primeira: somarDias(hoje(), 30), intervalo: 'mensal' },
})
const r2 = (x) => Math.round(x * 100) / 100

// Datas das parcelas
export function vencimentos(primeira, n, intervalo) {
  return Array.from({ length: n }, (_, k) => (intervalo === 'mensal' ? somarMeses(primeira, k) : somarDias(primeira, k * Number(intervalo))))
}

// Pagamento de uma venda já salva → estado do formulário (para editar)
export function pagamentoDaVenda(v, clientes) {
  const p = novoPagamento()
  if (v.fiado) {
    const ps = v.fiado.parcelas || []
    const intervalo = ps.length > 1 && ps[1].vencimento === somarMeses(ps[0].vencimento, 1) ? 'mensal' : ps.length > 1 ? String(Math.round((new Date(ps[1].vencimento) - new Date(ps[0].vencimento)) / 86400000)) : 'mensal'
    p.fiado = { clienteId: clientes.some((c) => c.id === v.fiado.clienteId) ? v.fiado.clienteId : '', nome: v.fiado.cliente || '', telefone: v.fiado.telefone || '',
      parcelas: String(ps.length || 1), primeira: ps[0]?.vencimento || p.fiado.primeira, intervalo: ['mensal', '7', '15', '30'].includes(intervalo) ? intervalo : 'mensal' }
  }
  const pagos = Array.isArray(v.pagamentos) ? v.pagamentos.filter((x) => +x.valor > 0) : null
  if (!pagos) return { ...p, forma: v.pagamento || 'Dinheiro' }
  if (v.fiado && !pagos.length) return { ...p, forma: 'Fiado' }
  if (!v.fiado && pagos.length === 1) return { ...p, forma: pagos[0].forma }
  return { ...p, dividir: true, linhas: [...pagos.map((x) => ({ forma: x.forma, valor: String(x.valor).replace('.', ',') })), ...(pagos.length < 2 ? [{ forma: 'PIX', valor: '' }] : [])] }
}

// Estado do formulário → { pagamento, pagamentos, fiado, novoCliente } ou { erro }
export function montarPagamento(pg, total, clientes) {
  let pagamentos, restante
  if (!pg.dividir) {
    if (pg.forma === 'Fiado') { pagamentos = []; restante = total }
    else { pagamentos = [{ forma: pg.forma, valor: total }]; restante = 0 }
  } else {
    pagamentos = pg.linhas.map((l) => ({ forma: l.forma, valor: r2(numero(l.valor) || 0) })).filter((l) => l.valor > 0)
    if (pg.linhas.some((l) => l.valor !== '' && !(numero(l.valor) >= 0))) return { erro: t('Confira os valores do pagamento.') }
    restante = r2(total - pagamentos.reduce((s, l) => s + l.valor, 0))
    if (restante < -0.004) return { erro: t('Os valores pagos passam do total da venda ({total}).', { total: brl(total) }) }
  }
  if (restante <= 0.004) {
    return { pagamento: pagamentos.length === 1 ? pagamentos[0].forma : 'Misto', pagamentos, fiado: null }
  }
  // fiado: cliente e parcelas
  const f = pg.fiado
  let cliente = clientes.find((c) => c.id === f.clienteId)
  let novoCliente = null
  if (!cliente && f.nome.trim()) cliente = clientes.find((c) => norm(c.nome) === norm(f.nome))
  if (!cliente) {
    if (!f.nome.trim()) return { erro: t('Informe o cliente do fiado.') }
    novoCliente = { id: uid(), nome: f.nome.trim(), telefone: f.telefone.trim() }
    cliente = novoCliente
  }
  const n = Math.max(1, Math.min(24, parseInt(f.parcelas, 10) || 1))
  if (!f.primeira) return { erro: t('Informe a data combinada para o pagamento.') }
  const base = Math.floor((restante / n) * 100) / 100
  const datas = vencimentos(f.primeira, n, f.intervalo)
  const parcelas = datas.map((vencimento, k) => ({
    id: uid(), n: k + 1, vencimento, recebimentos: [],
    valor: k === n - 1 ? r2(restante - base * (n - 1)) : base, // a última leva os centavos que sobram
  }))
  return {
    pagamento: pagamentos.length ? 'Misto' : 'Fiado',
    pagamentos,
    fiado: { clienteId: cliente.id, cliente: cliente.nome, telefone: cliente.telefone || '', parcelas },
    novoCliente,
  }
}

export default function PagamentoVenda({ pg, setPg, total, clientes, db }) {
  const mudar = (campos) => setPg({ ...pg, ...campos })
  const mudarFiado = (campos) => setPg({ ...pg, fiado: { ...pg.fiado, ...campos } })
  const pago = pg.dividir ? pg.linhas.reduce((s, l) => s + (numero(l.valor) || 0), 0) : pg.forma === 'Fiado' ? 0 : total
  const restante = r2(total - pago)
  const temFiado = restante > 0.004
  const n = Math.max(1, Math.min(24, parseInt(pg.fiado.parcelas, 10) || 1))
  const datas = temFiado && pg.fiado.primeira ? vencimentos(pg.fiado.primeira, n, pg.fiado.intervalo) : []
  const valorParcela = n ? Math.floor((restante / n) * 100) / 100 : restante

  return (
    <div className="pagamento-venda">
      {!pg.dividir ? (
        <div className="pg-linha-unica">
          <label>{t('Forma de pagamento')}
            <select value={pg.forma} onChange={(e) => mudar({ forma: e.target.value })}>
              {PAGAMENTOS.map((p) => <option key={p} value={p}>{t(p)}</option>)}
              <option value="Fiado">{t('Fiado (tudo para depois)')}</option>
            </select>
          </label>
          <button type="button" className="link pequeno" onClick={() => mudar({ dividir: true })}>{t('Dividir pagamento / entrada + fiado')}</button>
        </div>
      ) : (
        <div className="pg-dividido">
          <div className="pg-cabecalho">
            <b>{t('Pagamento dividido')}</b>
            <button type="button" className="link pequeno" onClick={() => mudar({ dividir: false })}>{t('Voltar para uma forma só')}</button>
          </div>
          {pg.linhas.map((l, i) => (
            <div key={i} className="pg-parte">
              <select value={l.forma} onChange={(e) => mudar({ linhas: pg.linhas.map((x, k) => (k === i ? { ...x, forma: e.target.value } : x)) })}>
                {PAGAMENTOS.map((p) => <option key={p} value={p}>{t(p)}</option>)}
              </select>
              <input inputMode="decimal" placeholder="0,00" value={l.valor}
                onChange={(e) => mudar({ linhas: pg.linhas.map((x, k) => (k === i ? { ...x, valor: e.target.value } : x)) })} />
              {pg.linhas.length > 1 && <button type="button" className="del" onClick={() => mudar({ linhas: pg.linhas.filter((_, k) => k !== i) })}>×</button>}
            </div>
          ))}
          <button type="button" className="link pequeno" onClick={() => mudar({ linhas: [...pg.linhas, { forma: 'Dinheiro', valor: '' }] })}>+ {t('Outra forma')}</button>
          <div className={'pg-restante' + (restante < -0.004 ? ' bad' : '')}>
            {restante < -0.004 ? t('Passou {valor} do total', { valor: brl(-restante) })
              : temFiado ? <>{t('Falta')} <b>{brl(restante)}</b> → {t('fica no fiado')}</> : <span className="ok">✓ {t('Pago por completo')}</span>}
          </div>
        </div>
      )}

      {temFiado && (
        <div className="pg-fiado">
          <b>{t('Fiado')}: {brl(restante)}</b>
          <div className="pg-fiado-campos">
            <label>{t('Cliente')} *
              <select value={pg.fiado.clienteId} onChange={(e) => mudarFiado({ clienteId: e.target.value })}>
                <option value="">{t('+ Novo cliente')}</option>
                {[...clientes].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.telefone ? ` · ${c.telefone}` : ''}</option>)}
              </select>
            </label>
            {!pg.fiado.clienteId && (
              <>
                <label>{t('Nome do cliente')} *<input maxLength={60} value={pg.fiado.nome} onChange={(e) => mudarFiado({ nome: e.target.value })} /></label>
                <label>{t('Telefone / WhatsApp')}<input inputMode="tel" maxLength={20} placeholder="(11) 99999-9999" value={pg.fiado.telefone} onChange={(e) => mudarFiado({ telefone: e.target.value })} /></label>
              </>
            )}
            <label className="pg-curto">{t('Parcelas')}
              <select value={pg.fiado.parcelas} onChange={(e) => mudarFiado({ parcelas: e.target.value })}>
                {Array.from({ length: 12 }, (_, k) => <option key={k} value={k + 1}>{k + 1}×</option>)}
              </select>
            </label>
            <label>{n > 1 ? t('1ª parcela em') : t('Data combinada')} *<input type="date" min={hoje()} value={pg.fiado.primeira} onChange={(e) => mudarFiado({ primeira: e.target.value })} /></label>
            {n > 1 && (
              <label>{t('Depois, a cada')}
                <select value={pg.fiado.intervalo} onChange={(e) => mudarFiado({ intervalo: e.target.value })}>
                  <option value="mensal">{t('mês')}</option>
                  <option value="30">{t('30 dias')}</option>
                  <option value="15">{t('15 dias')}</option>
                  <option value="7">{t('7 dias')}</option>
                </select>
              </label>
            )}
          </div>
          {db && pg.fiado.clienteId && <AvisoCliente db={db} clienteId={pg.fiado.clienteId} />}
          {datas.length > 0 && (
            <small className="pg-parcelas">
              {datas.map((d, k) => `${k + 1}ª ${d.split('-').reverse().join('/')}: ${brl(k === n - 1 ? r2(restante - valorParcela * (n - 1)) : valorParcela)}`).join(' · ')}
            </small>
          )}
          <small>{t('O lucro desta venda só conta quando você confirmar na aba Cobranças se o cliente pagou.')}</small>
        </div>
      )}
    </div>
  )
}
