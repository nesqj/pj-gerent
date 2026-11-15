import { t } from './i18n.js'
import { brl, formatarCPF, hoje, lerCPF, lerValor as numero, norm, PAGAMENTOS, soDigitos, uid } from './utils.js'

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
  fiado: { clienteId: '', nome: '', cpf: '', telefone: '', parcelas: '1', primeira: somarDias(hoje(), 30), intervalo: 'mensal', juros: '' },
})
const r2 = (x) => Math.round(x * 100) / 100
const dataCurta = (d) => d.split('-').reverse().join('/')

// Datas das parcelas
export function vencimentos(primeira, n, intervalo) {
  return Array.from({ length: n }, (_, k) => (intervalo === 'mensal' ? somarMeses(primeira, k) : somarDias(primeira, k * Number(intervalo))))
}

// Valor de cada parcela do fiado, com juros simples ao mês (opcional).
// Meses = nº de parcelas × o intervalo (mês = 1; 15 dias = 0,5; 7 dias ≈ 0,23).
export function calcularFiado(restante, n, jurosPct, intervalo) {
  const meses = n * (intervalo === 'mensal' || intervalo === '30' ? 1 : Number(intervalo) / 30)
  const total = r2(restante * (1 + ((+jurosPct || 0) / 100) * meses))
  const base = Math.floor((total / n) * 100) / 100
  const valores = Array.from({ length: n }, (_, k) => (k === n - 1 ? r2(total - base * (n - 1)) : base)) // a última leva os centavos
  return { total, juros: r2(total - restante), valores }
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
  const cpf = cliente ? '' : lerCPF(f.cpf)
  if (cpf?.erro) return { erro: cpf.erro }
  // mesmo CPF ou mesmo nome de um cliente já cadastrado: usa o cadastro (não duplica)
  if (!cliente && cpf) cliente = clientes.find((c) => soDigitos(c.cpf) === soDigitos(cpf))
  if (!cliente && f.nome.trim()) cliente = clientes.find((c) => norm(c.nome) === norm(f.nome))
  if (!cliente) {
    if (!f.nome.trim()) return { erro: t('Informe o cliente do fiado.') }
    novoCliente = { id: uid(), nome: f.nome.trim(), cpf, telefone: f.telefone.trim() }
    cliente = novoCliente
  }
  const n = Math.max(1, Math.min(24, parseInt(f.parcelas, 10) || 1))
  if (!f.primeira) return { erro: t('Informe a data combinada para o pagamento.') }
  const jurosPct = String(f.juros ?? '').trim() === '' ? 0 : numero(f.juros)
  if (!(jurosPct >= 0)) return { erro: t('Confira os juros.') }
  const calc = calcularFiado(restante, n, jurosPct, f.intervalo)
  const datas = vencimentos(f.primeira, n, f.intervalo)
  const parcelas = datas.map((vencimento, k) => ({ id: uid(), n: k + 1, vencimento, recebimentos: [], valor: calc.valores[k] }))
  return {
    pagamento: pagamentos.length ? 'Misto' : 'Fiado',
    pagamentos,
    fiado: { clienteId: cliente.id, cliente: cliente.nome, telefone: cliente.telefone || '', parcelas,
      ...(calc.juros > 0 ? { jurosPct, juros: calc.juros } : {}) }, // juros: o que passa do valor da venda (vira lucro quando receber)
    novoCliente,
  }
}

