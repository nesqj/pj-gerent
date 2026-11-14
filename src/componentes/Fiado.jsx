import { useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { podeFazer } from '../armazenamento.js'
import { brl, dataBR, hoje, lerValor as numero, norm, PAGAMENTOS, recebidoDaParcela, situacaoParcela, uid } from '../utils.js'

// Fiado (contas a receber): cada parcela de cada venda fiado.
// "Recebeu" registra o pagamento (total ou parcial) e entra no caixa; "Não pagou" vira perda.
// O lucro da venda só conta quando todas as parcelas estão resolvidas (pagas ou não pagas).
const SITUACOES = {
  atrasada: { nome: 'Atrasado', classe: 'bad' },
  vence_hoje: { nome: 'Vence hoje', classe: 'warn' },
  aberta: { nome: 'Em aberto', classe: '' },
  paga: { nome: 'Pago', classe: 'ok' },
  nao_paga: { nome: 'Não pagou', classe: 'bad' },
}
const FILTROS = [
  { id: 'abertos', nome: 'Em aberto' },
  { id: 'atrasados', nome: 'Atrasados' },
  { id: 'pagos', nome: 'Pagos' },
  { id: 'nao_pagos', nome: 'Não pagos' },
  { id: 'todos', nome: 'Todos' },
]
const r2 = (x) => Math.round(x * 100) / 100

// Link do WhatsApp com a mensagem pronta
function linkWhats(telefone, texto) {
  let n = String(telefone || '').replace(/\D/g, '')
  if (!n) return null
  if (n.length <= 11) n = '55' + n
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}

export default function Fiado({ db, executar, irPara }) {
  const [filtro, setFiltro] = useState('abertos')
  const [busca, setBusca] = useState(() => {
    try { const b = sessionStorage.getItem('cobrancas-busca'); sessionStorage.removeItem('cobrancas-busca'); if (b) return b } catch { /* sem acesso */ }
    return ''
  })
  const [recebendo, setRecebendo] = useState(null) // { vendaId, parcelaId, valor, forma }
  const [mudandoData, setMudandoData] = useState(null) // { vendaId, parcelaId, data }
  const dia = hoje()

  // todas as parcelas, com a venda junto
  // (empréstimos só para quem pode emprestar)
  const comParcelas = (l, emp) => (l || []).filter((v) => v.fiado?.parcelas?.length).flatMap((v) => v.fiado.parcelas.map((p) => {
    const recebido = recebidoDaParcela(p)
    return { v, p, emp, recebido, falta: r2(Math.max(0, p.valor - recebido)), situacao: situacaoParcela(p, dia), total: v.fiado.parcelas.length }
  }))
  const parcelas = [...comParcelas(db.vendas, false), ...(podeFazer('emprestimo.salvo') ? comParcelas(db.emprestimos, true) : [])]
  const abertas = parcelas.filter((x) => ['aberta', 'vence_hoje', 'atrasada'].includes(x.situacao))
  const soma = (l) => r2(l.reduce((s, x) => s + x.falta, 0))
  const em7 = (() => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })()
  const cards = {
    receber: soma(abertas),
    atrasado: soma(abertas.filter((x) => x.situacao === 'atrasada')),
    nAtrasado: abertas.filter((x) => x.situacao === 'atrasada').length,
    semana: soma(abertas.filter((x) => x.p.vencimento >= dia && x.p.vencimento <= em7)),
    naoPago: soma(parcelas.filter((x) => x.situacao === 'nao_paga')),
  }

  const b = norm(busca)
  const lista = parcelas
    .filter((x) => !b || norm(x.v.fiado.cliente).includes(b) || norm(x.v.fiado.telefone).includes(b))
    .filter((x) => ({
      abertos: ['aberta', 'vence_hoje', 'atrasada'].includes(x.situacao),
      atrasados: x.situacao === 'atrasada',
      pagos: x.situacao === 'paga',
      nao_pagos: x.situacao === 'nao_paga',
      todos: true,
    }[filtro]))
    .sort((a, c) => String(a.p.vencimento).localeCompare(String(c.p.vencimento)) || String(a.v.fiado.cliente || '').localeCompare(String(c.v.fiado.cliente || '')))

  // altera uma parcela (a mudança é aplicada sobre a versão mais nova da venda, no banco)
  const gravar = (x, alterar, acao, detalhe, msgOk) => executar((A) => A.salvarParcela(x.emp ? 'emprestimos' : 'vendas', x.v.id, x.p.id, alterar, acao, detalhe), msgOk)
  const acao = (x, s) => (x.emp ? 'emprestimo.' : 'venda.fiado-') + s

  async function confirmarRecebimento(e) {
    e.preventDefault()
    const x = parcelas.find((y) => y.v.id === recebendo.vendaId && y.p.id === recebendo.parcelaId)
    if (!x) return setRecebendo(null)
    const valor = r2(numero(recebendo.valor))
    if (!(valor > 0)) return aviso.alerta(t('Informe um valor maior que zero.'))
    if (valor > x.falta + 0.004) return aviso.alerta(t('O valor passa do que falta nesta parcela ({valor}).', { valor: brl(x.falta) }))
    const rec = { id: uid(), data: Date.now(), dia: hoje(), valor, forma: recebendo.forma }
    const ok = await gravar(x, (p) => {
      // confere de novo com os dados mais novos (outra pessoa pode ter recebido antes)
      const falta = r2(Math.max(0, p.valor - recebidoDaParcela(p)))
      if (valor > falta + 0.004) throw new Error(t('O valor passa do que falta nesta parcela ({valor}).', { valor: brl(falta) }))
      return { ...p, naoPaga: false, recebimentos: [...(p.recebimentos || []), rec] }
    },
      acao(x, 'recebido'), `${x.v.fiado.cliente} ${x.p.n}/${x.total}: ${valor} (${recebendo.forma})`,
      valor >= x.falta - 0.004 ? t('Parcela recebida. Entrou no caixa.') : t('Pagamento parcial registrado. Falta {valor}.', { valor: brl(x.falta - valor) }))
    if (ok) setRecebendo(null)
  }

  async function naoPagou(x) {
    const texto = x.emp
      ? t('Marcar que {cliente} NÃO pagou {valor}?\nEsse valor sai do lucro do empréstimo e conta como perda. Dá para desfazer depois.', { cliente: x.v.fiado.cliente, valor: brl(x.falta) })
      : t('Marcar que {cliente} NÃO pagou {valor}?\nEsse valor sai do lucro da venda e conta como perda. Dá para desfazer depois.', { cliente: x.v.fiado.cliente, valor: brl(x.falta) })
    if (!(await confirmar(texto, { botao: t('Não pagou'), perigo: true }))) return
    gravar(x, (p) => ({ ...p, naoPaga: true }), acao(x, 'nao-pago'), `${x.v.fiado.cliente} ${x.p.n}/${x.total}: ${x.falta}`, t('Marcado como não pago (perda).'))
  }
  function reabrir(x) {
    gravar(x, (p) => ({ ...p, naoPaga: false }), acao(x, 'reaberto'), `${x.v.fiado.cliente} ${x.p.n}/${x.total}`, t('Parcela reaberta.'))
  }
  async function estornar(x) {
    const ultimo = (x.p.recebimentos || []).at(-1)
    if (!ultimo) return
    if (!(await confirmar(t('Estornar o último recebimento de {valor} ({data})? Ele sai do caixa e a parcela volta a ficar em aberto.', { valor: brl(ultimo.valor), data: dataBR(ultimo.dia) })))) return
    gravar(x, (p) => {
      if ((p.recebimentos || []).at(-1)?.id !== ultimo.id) throw new Error(t('Os recebimentos desta parcela mudaram. Confira e tente de novo.'))
      return { ...p, recebimentos: p.recebimentos.slice(0, -1) }
    }, acao(x, 'estorno'), `${x.v.fiado.cliente} ${x.p.n}/${x.total}: ${ultimo.valor}`, t('Recebimento estornado.'))
  }
  async function salvarData(e) {
    e.preventDefault()
    const x = parcelas.find((y) => y.v.id === mudandoData.vendaId && y.p.id === mudandoData.parcelaId)
    if (!x || !mudandoData.data) return setMudandoData(null)
    const ok = await gravar(x, (p) => ({ ...p, vencimento: mudandoData.data }), acao(x, 'data'),
      `${x.v.fiado.cliente} ${x.p.n}/${x.total}: ${dataBR(x.p.vencimento)} → ${dataBR(mudandoData.data)}`, t('Data alterada.'))
    if (ok) setMudandoData(null)
  }

  const mensagem = (x) => t('Olá, {cliente}! Passando para lembrar da parcela {n} de {valor}, combinada para {data}. Obrigado!', {
    cliente: String(x.v.fiado.cliente || '').split(' ')[0], n: `${x.p.n}/${x.total}`, valor: brl(x.falta), data: dataBR(x.p.vencimento),
  })

  return (
    <section>
      <h2>{t('Cobranças')}</h2>

      <div className="cards">
        <div className="card destaque"><small>{t('A receber')}</small><b>{brl(cards.receber)}</b><small className="var">{t('{n} parcela(s) em aberto', { n: abertas.length })}</small></div>
        <div className={'card' + (cards.atrasado > 0 ? ' card-prejuizo' : '')}><small>{t('Atrasado')}</small><b className={cards.atrasado > 0 ? 'bad' : ''}>{brl(cards.atrasado)}</b><small className="var">{t('{n} parcela(s)', { n: cards.nAtrasado })}</small></div>
        <div className="card"><small>{t('Vence em 7 dias')}</small><b>{brl(cards.semana)}</b></div>
        <div className="card"><small>{t('Não pagos (perda)')}</small><b className={cards.naoPago > 0 ? 'bad' : ''}>{cards.naoPago > 0 ? '− ' + brl(cards.naoPago) : brl(0)}</b></div>
      </div>

      <div className="linha-titulo">
        <input className="busca" placeholder={t('Buscar cliente ou telefone...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="chips">
          {FILTROS.map((f) => <button key={f.id} className={'filtro' + (filtro === f.id ? ' ativo' : '')} onClick={() => setFiltro(f.id)}>{t(f.nome)}</button>)}
        </div>
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr><th>{t('Vencimento')}</th><th>{t('Cliente')}</th><th>{t('Origem')}</th><th className="n">{t('Parcela')}</th><th className="n">{t('Valor')}</th><th className="n">{t('Falta')}</th><th>{t('Situação')}</th><th></th></tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="8" className="vazio">{parcelas.length ? t('Nada neste filtro.') : t('Nenhuma venda fiado ainda. Na aba Novo Registro, escolha "Fiado" ou divida o pagamento.')}</td></tr>}
            {lista.map((x) => {
              const s = SITUACOES[x.situacao]
              const chave = x.v.id + x.p.id
              const whats = ['aberta', 'vence_hoje', 'atrasada'].includes(x.situacao) && linkWhats(x.v.fiado.telefone, mensagem(x))
              return (
                <tr key={chave} className={x.situacao === 'atrasada' ? 'linha-prejuizo' : ''}>
                  <td>
                    {mudandoData?.vendaId === x.v.id && mudandoData.parcelaId === x.p.id ? (
                      <form className="inline-form" onSubmit={salvarData}>
                        <input type="date" value={mudandoData.data} onChange={(e) => setMudandoData({ ...mudandoData, data: e.target.value })} />
                        <button type="submit" className="edit">{t('Salvar')}</button>
                        <button type="button" className="sec" onClick={() => setMudandoData(null)}>×</button>
                      </form>
                    ) : dataBR(x.p.vencimento)}
                  </td>
                  <td>{x.v.fiado.cliente}{x.v.fiado.telefone && <small className="sub-linha">{x.v.fiado.telefone}</small>}</td>
                  <td className="quebra">
                    <button className="link pequeno" onClick={() => { try { sessionStorage.setItem('vendas-dia', x.v.dia) } catch { /* sem acesso */ } irPara?.('vendas') }}>{dataBR(x.v.dia)}</button>
                    <small className="sub-linha">{x.emp ? t('Empréstimo de {valor} · {p}% ao mês', { valor: brl(x.v.valor), p: String(x.v.jurosPct || 0).replace('.', ',') }) : (x.v.itens || []).map((i) => `${i.qtd}× ${i.produto}`).join(', ')}</small>
                  </td>
                  <td className="n">{x.p.n}/{x.total}</td>
                  <td className="n">{brl(x.p.valor)}{x.recebido > 0 && <small className="sub-linha ok">{t('recebido {valor}', { valor: brl(x.recebido) })}</small>}</td>
                  <td className="n"><b>{x.situacao === 'paga' ? '-' : brl(x.falta)}</b></td>
                  <td><span className={s.classe}>{t(s.nome)}</span></td>
                  <td className="n acoes-fiado">
                    {recebendo?.vendaId === x.v.id && recebendo.parcelaId === x.p.id ? (
                      <form className="inline-form" onSubmit={confirmarRecebimento}>
                        <input inputMode="decimal" value={recebendo.valor} onChange={(e) => setRecebendo({ ...recebendo, valor: e.target.value })} style={{ width: 90 }} />
                        <select value={recebendo.forma} onChange={(e) => setRecebendo({ ...recebendo, forma: e.target.value })}>
                          {PAGAMENTOS.map((f) => <option key={f} value={f}>{t(f)}</option>)}
                        </select>
                        <button type="submit">{t('Confirmar')}</button>
                        <button type="button" className="sec" onClick={() => setRecebendo(null)}>×</button>
                      </form>
                    ) : (
                      <>
                        {['aberta', 'vence_hoje', 'atrasada'].includes(x.situacao) && (
                          <>
                            <button className="edit" onClick={() => setRecebendo({ vendaId: x.v.id, parcelaId: x.p.id, valor: String(x.falta).replace('.', ','), forma: 'PIX' })}>{t('Recebeu')}</button>{' '}
                            <button className="del" onClick={() => naoPagou(x)}>{t('Não pagou')}</button>{' '}
                            <button className="sec mini" title={t('Mudar data')} onClick={() => setMudandoData({ vendaId: x.v.id, parcelaId: x.p.id, data: x.p.vencimento })}>📅</button>{' '}
                            {whats && <a className="botao-whats" href={whats} target="_blank" rel="noreferrer" title={t('Lembrar no WhatsApp')}>WhatsApp</a>}
                          </>
                        )}
                        {x.situacao === 'nao_paga' && <button className="sec" onClick={() => reabrir(x)}>{t('Reabrir')}</button>}
                        {x.recebido > 0 && <>{' '}<button className="link pequeno" onClick={() => estornar(x)}>{t('Estornar')}</button></>}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p><small>{t('"Recebeu" entra no caixa na data do recebimento. O lucro da venda (ou os juros do empréstimo) só conta quando todas as parcelas estão resolvidas; o que o cliente não pagou sai do lucro como perda.')}</small></p>
    </section>
  )
}
