import { useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { formatarCPF, lerCPF, soDigitos } from '../utils.js'
import { brl, calcularEmprestimo, dataBR, encargoAtraso, extratoCaixa, hoje, hora, lerValor, lucroEmprestimo, norm, num, resumoFiado, uid } from '../utils.js'
import { vencimentos } from './PagamentoVenda.jsx'
import { AvisoCliente } from './Clientes.jsx'

// Empréstimo de dinheiro (crediário) com juros simples ao mês.
// O dinheiro sai do caixa (se marcado) e as parcelas vão para a aba Cobranças.
// O lucro é só o juro, e conta quando todas as parcelas estiverem resolvidas.
const somarDias = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const novo = () => ({ clienteId: '', nome: '', cpf: '', telefone: '', valor: '', juros: '', parcelas: '1', primeira: somarDias(hoje(), 30), intervalo: 'mensal', doCaixa: true, obs: '' })

export function NovoEmprestimo({ db, executar, aoSalvar }) {
  const [f, setF] = useState(novo)
  const campo = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) })
  const clientes = db.clientes || []
  const valor = lerValor(f.valor)
  const juros = f.juros === '' ? 0 : lerValor(f.juros)
  const n = Math.max(1, Math.min(24, parseInt(f.parcelas, 10) || 1))
  const valido = valor > 0 && juros >= 0
  const calc = valido ? calcularEmprestimo(valor, juros, n) : null
  const datas = f.primeira ? vencimentos(f.primeira, n, f.intervalo) : []

  async function salvar(e) {
    e.preventDefault()
    if (!(valor > 0)) return aviso.alerta(t('Informe o valor emprestado.'))
    if (!(juros >= 0)) return aviso.alerta(t('Confira os juros.'))
    if (!f.primeira) return aviso.alerta(t('Informe a data combinada para o pagamento.'))
    // cliente: escolhido, com o mesmo nome de um cadastrado, ou novo
    let cliente = clientes.find((c) => c.id === f.clienteId)
    const cpf = cliente ? '' : lerCPF(f.cpf)
    if (cpf?.erro) return aviso.alerta(cpf.erro)
    if (!cliente && cpf) cliente = clientes.find((c) => soDigitos(c.cpf) === soDigitos(cpf))
    if (!cliente && f.nome.trim()) cliente = clientes.find((c) => norm(c.nome) === norm(f.nome))
    if (!cliente) {
      if (!f.nome.trim()) return aviso.alerta(t('Informe o cliente.'))
      cliente = { id: uid(), nome: f.nome.trim(), cpf, telefone: f.telefone.trim() }
      if (!(await executar((A) => A.salvarCliente(cliente)))) return
      setF((x) => ({ ...x, clienteId: cliente.id }))
    }
    const usaCaixa = !!db.caixa && f.doCaixa
    const ext = usaCaixa ? extratoCaixa(db) : null
    if (ext && valor > ext.saldo && !(await confirmar(t('O caixa tem {saldo}. Emprestar {valor} vai deixar o saldo negativo. Continuar?', { saldo: brl(ext.saldo), valor: brl(valor) })))) return
    const c = calcularEmprestimo(valor, juros, n)
    const emp = {
      id: uid(), data: Date.now(), dia: hoje(), valor: c.valor, jurosPct: juros, total: c.total, obs: f.obs.trim(),
      ...(usaCaixa ? {} : { foraDoCaixa: true }),
      fiado: {
        clienteId: cliente.id, cliente: cliente.nome, telefone: cliente.telefone || '',
        parcelas: datas.map((vencimento, k) => ({ id: uid(), n: k + 1, vencimento, valor: c.parcelas[k], recebimentos: [] })),
      },
    }
    if (await executar((A) => A.salvarEmprestimo(emp))) {
      aviso.ok(t('Empréstimo registrado.'), t('{total} a receber de {cliente} em {n} parcela(s). Acompanhe na aba Cobranças.', { total: brl(c.total), cliente: cliente.nome, n }))
      setF(novo())
      aoSalvar?.()
    }
  }

  return (
    <form onSubmit={salvar} className="form-emprestimo">
      <label style={{ flex: '2 1 220px' }}>{t('Cliente')} *
        <select value={f.clienteId} onChange={(e) => setF({ ...f, clienteId: e.target.value })}>
          <option value="">{t('+ Novo cliente')}</option>
          {[...clientes].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.telefone ? ` · ${c.telefone}` : ''}</option>)}
        </select>
      </label>
      {f.clienteId && <AvisoCliente db={db} clienteId={f.clienteId} />}
      {!f.clienteId && (
        <>
          <label style={{ flex: '2 1 200px' }}>{t('Nome do cliente')} *<input maxLength={60} {...campo('nome')} /></label>
          <label style={{ flex: '1 1 150px' }}>{t('CPF')}<input inputMode="numeric" maxLength={14} placeholder="000.000.000-00" {...campo('cpf')} onBlur={() => setF((x) => ({ ...x, cpf: formatarCPF(x.cpf) }))} /></label>
          <label style={{ flex: '1 1 160px' }}>{t('Telefone / WhatsApp')}<input inputMode="tel" maxLength={20} placeholder="(11) 99999-9999" {...campo('telefone')} /></label>
        </>
      )}
      <label style={{ flex: '1 1 150px' }}>{t('Valor emprestado (R$)')} *<input required inputMode="decimal" placeholder="0,00" {...campo('valor')} /></label>
      <label style={{ flex: '0 1 130px' }}>{t('Juros (% ao mês)')}<input inputMode="decimal" placeholder="0" {...campo('juros')} /></label>
      <label style={{ flex: '0 1 100px' }}>{t('Parcelas')}
        <select {...campo('parcelas')}>
          {Array.from({ length: 24 }, (_, k) => <option key={k} value={k + 1}>{k + 1}×</option>)}
        </select>
      </label>
      <label style={{ flex: '1 1 150px' }}>{n > 1 ? t('1ª parcela em') : t('Data combinada')} *<input type="date" required {...campo('primeira')} /></label>
      {n > 1 && (
        <label style={{ flex: '0 1 140px' }}>{t('Depois, a cada')}
          <select {...campo('intervalo')}>
            <option value="mensal">{t('mês')}</option>
            <option value="30">{t('30 dias')}</option>
          </select>
        </label>
      )}
      <label style={{ flex: '1 1 100%' }}>{t('Observação')}<input maxLength={120} placeholder={t('Ex: combinado por mensagem, garantia, testemunha...')} {...campo('obs')} /></label>
      {db.caixa && (
        <label className="check">
          <input type="checkbox" checked={f.doCaixa} onChange={(e) => setF({ ...f, doCaixa: e.target.checked })} />
          {t('Pago com o dinheiro do caixa')}
          {f.doCaixa && valor > 0 && <small> ({t('desconta {valor}', { valor: brl(valor) })})</small>}
        </label>
      )}
      {calc && (
        <div className="resumo-emprestimo">
          <div>
            {t('Empresta')} <b>{brl(calc.valor)}</b> → {t('recebe')} <b>{n}× {brl(calc.parcelas[0])}</b>{n > 1 && calc.parcelas[n - 1] !== calc.parcelas[0] ? <small> ({t('última {valor}', { valor: brl(calc.parcelas[n - 1]) })})</small> : null}
            {' = '}<b>{brl(calc.total)}</b> · {t('juros')} <b className="ok">{brl(calc.juros)}</b>
          </div>
          {datas.length > 0 && <small>{n > 1 ? t('de {inicio} a {fim}', { inicio: dataBR(datas[0]), fim: dataBR(datas[n - 1]) }) : t('em {data}', { data: dataBR(datas[0]) })}</small>}
        </div>
      )}
      <button type="submit">{t('Registrar empréstimo')}</button>
    </form>
  )
}

// Empréstimos feitos no dia (na aba Novo Registro)
export function EmprestimosDoDia({ db, dia, setDia, executar, irPara }) {
  const lista = (db.emprestimos || []).filter((e) => e.dia === dia).sort((a, b) => b.data - a.data)
  const lucros = lista.map(lucroEmprestimo)
  const emprestado = lista.reduce((s, e) => s + (+e.valor || 0), 0)
  // falta receber = o que falta das parcelas + multa e juros de atraso de hoje (se configurados)
  const faltaDe = (e) => {
    const f = resumoFiado(e)
    const atraso = (e.fiado?.parcelas || []).reduce((s, p) => s + encargoAtraso(p, db.config?.atraso).total, 0)
    return { falta: Math.round(((f?.aberto || 0) + atraso) * 100) / 100, atraso: Math.round(atraso * 100) / 100 }
  }
  const faltas = lista.map(faltaDe)
  const faltaTotal = faltas.reduce((s, x) => s + x.falta, 0)
  const jurosConfirmados = lucros.reduce((s, l) => s + l.lucro, 0)
  const jurosAConfirmar = lucros.reduce((s, l) => s + (l.pendente ? l.lucroPrevisto : 0), 0)

  async function excluir(e) {
    const f = resumoFiado(e)
    const extra = f?.recebido > 0 ? '\n' + t('Os recebimentos deste empréstimo ({valor}) também serão apagados, e o caixa é ajustado.', { valor: brl(f.recebido) }) : ''
    if (await confirmar(t('Excluir o empréstimo de {valor} para {cliente}?', { valor: brl(e.valor), cliente: e.fiado?.cliente || '' }) + extra, { perigo: true })) {
      executar((A) => A.excluirEmprestimo(e.id), t('Empréstimo excluído.'))
    }
  }

  return (
    <>
      <div className="linha-titulo">
        <h3>{t('Empréstimos de {data}', { data: dataBR(dia) })}</h3>
        {setDia && <input type="date" value={dia} onChange={(e) => setDia(e.target.value || hoje())} />}
      </div>
      <div className="cards">
        <div className="card"><small>{t('Empréstimos')}</small><b>{lista.length}</b></div>
        <div className="card"><small>{t('Emprestado')}</small><b>{brl(emprestado)}</b></div>
        <div className="card">
          <small>{t('A receber')}</small><b>{brl(faltaTotal)}</b>
        </div>
        <div className={'card' + (jurosConfirmados < 0 ? ' card-prejuizo' : '')}>
          <small>{t('Lucro (juros)')}</small>
          <b className={jurosConfirmados < 0 ? 'bad' : 'ok'}>{jurosConfirmados < 0 ? '− ' + brl(-jurosConfirmados) : brl(jurosConfirmados)}</b>
          {jurosAConfirmar > 0 && <small className="var">+ {brl(jurosAConfirmar)} {t('a confirmar')}</small>}
        </div>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Hora')}</th><th>{t('Cliente')}</th><th className="n">{t('Emprestado')}</th><th className="n">{t('A receber')}</th><th className="n">{t('Recebido')}</th><th className="n">{t('Lucro (juros)')}</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="7" className="vazio">{t('Nenhum empréstimo neste dia.')}</td></tr>}
            {lista.map((e) => {
              const l = lucroEmprestimo(e)
              const n = e.fiado?.parcelas?.length || 1
              return (
                <tr key={e.id} className={l.lucro < 0 ? 'linha-prejuizo' : ''}>
                  <td>{hora(e.data)}</td>
                  <td className="quebra">{e.fiado?.cliente}<small className="sub-linha">{n}× · {t('{p}% ao mês', { p: num(e.jurosPct || 0, 2) })}{e.foraDoCaixa ? ' · ' + t('fora do caixa') : ''}{e.obs ? ' · ' + e.obs : ''}</small></td>
                  <td className="n">{brl(e.valor)}</td>
                  <td className="n">
                    <b>{faltas[lista.indexOf(e)].falta > 0 ? brl(faltas[lista.indexOf(e)].falta) : '-'}</b>
                  </td>
                  <td className="n">{brl(l.recebido)}</td>
                  <td className="n">
                    {l.pendente
                      ? <span className="pendente">{t('a confirmar')}<small className="sub-linha">{t('previsto {valor}', { valor: brl(l.lucroPrevisto) })}</small></span>
                      : l.lucro < 0 ? <span className="bad">− {brl(-l.lucro)}<small className="desconto-linha">{t('prejuízo')}</small></span> : <span className="ok">{brl(l.lucro)}</span>}
                    {l.naoPago > 0 && <small className="desconto-linha bad">{t('não pago: {valor}', { valor: brl(l.naoPago) })}</small>}
                  </td>
                  <td>
                    <button className="link pequeno" onClick={() => irPara?.('fiado')}>{t('Ver em Cobranças')}</button>{' '}
                    <button className="del" onClick={() => excluir(e)}>{t('Excluir')}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
