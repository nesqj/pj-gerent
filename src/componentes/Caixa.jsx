import { useRef, useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { brl, dataBR, dataTs, extratoCaixa, hoje, hora, lerValor as numero, uid } from '../utils.js'

// Caixa (capital de giro): o dinheiro da loja.
// Entra: vendas e dinheiro colocado. Sai: compras do estoque (custo × quantidade) e dinheiro retirado.
const PERIODOS = [
  { id: 'hoje', nome: 'Hoje' },
  { id: '7', nome: '7 dias' },
  { id: 'mes', nome: 'Este mês' },
  { id: 'tudo', nome: 'Tudo' },
]
const ORIGENS = {
  venda: { nome: 'Venda', classe: 'ok' },
  fiado: { nome: 'Recebimento de fiado', classe: 'ok' },
  compra: { nome: 'Compra de estoque', classe: 'bad' },
  colocar: { nome: 'Dinheiro colocado', classe: 'ok' },
  retirar: { nome: 'Dinheiro retirado', classe: 'bad' },
}
const novo = { tipo: 'colocar', valor: '', descricao: '' }

export default function Caixa({ db, executar, irPara }) {
  const ext = extratoCaixa(db)
  if (!ext) return <AbrirCaixa executar={executar} />
  return <ControleCaixa db={db} ext={ext} executar={executar} irPara={irPara} />
}

// ---------- Começar o controle
function AbrirCaixa({ executar, atual, aoTerminar }) {
  const [valor, setValor] = useState(atual ? String(atual.saldoInicial).replace('.', ',') : '')
  const [dia, setDia] = useState(atual ? new Date(atual.inicio).toISOString().slice(0, 10) : hoje())
  async function salvar(e) {
    e.preventDefault()
    const v = numero(valor)
    if (!Number.isFinite(v)) return aviso.alerta(t('Valor inválido.'))
    // hoje: começa agora (vendas e compras de antes não contam); outro dia: começa no início daquele dia
    const inicio = dia === hoje() ? (atual && new Date(atual.inicio).toISOString().slice(0, 10) === dia ? atual.inicio : Date.now()) : new Date(dia + 'T00:00:00').getTime()
    if (await executar((A) => A.salvarCaixa({ inicio, saldoInicial: Math.round(v * 100) / 100 }))) aoTerminar?.()
  }
  return (
    <section>
      {!atual && <h2>{t('Controle de caixa')}</h2>}
      <div className="painel">
        <p><b>{atual ? t('Ajustar o início do caixa') : t('Comece o controle de caixa')}</b></p>
        <p><small>{t('Informe quanto dinheiro a loja tem para girar agora (em espécie, conta e o que mais usar para comprar mercadoria). A partir daí, as vendas somam, as entradas no estoque descontam o custo, e você registra o que colocar ou retirar.')}</small></p>
      </div>
      <form onSubmit={salvar}>
        <label>{t('Saldo inicial (R$)')} *<input required inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
        <label>{t('Começar em')}<input type="date" max={hoje()} value={dia} onChange={(e) => setDia(e.target.value)} /></label>
        <button type="submit">{atual ? t('Salvar') : t('Começar o caixa')}</button>
        {atual && <button type="button" className="sec" onClick={aoTerminar}>{t('Cancelar')}</button>}
      </form>
      <p><small>{t('Vendas, compras e movimentos anteriores a essa data não entram no caixa.')}</small></p>
    </section>
  )
}

// ---------- Controle
function ControleCaixa({ db, ext, executar, irPara }) {
  const [form, setForm] = useState(novo)
  const [editando, setEditando] = useState(null)
  const [periodo, setPeriodo] = useState('mes')
  const [ajustando, setAjustando] = useState(false)
  const refValor = useRef(null)
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  if (ajustando) return <AbrirCaixa executar={executar} atual={ext} aoTerminar={() => setAjustando(false)} />

  async function registrar(e) {
    e.preventDefault()
    const v = numero(form.valor)
    if (!(v > 0)) return aviso.alerta(t('Informe um valor maior que zero.'))
    if (form.tipo === 'retirar' && !editando && v > ext.saldo && !await confirmar(t('O caixa tem {saldo}. Retirar {valor} vai deixar o saldo negativo. Continuar?', { saldo: brl(ext.saldo), valor: brl(v) }))) return
    const dados = { tipo: form.tipo, valor: Math.round(v * 100) / 100, descricao: form.descricao.trim() }
    const m = editando ? { ...editando, ...dados } : { id: uid(), data: Date.now(), dia: hoje(), ...dados }
    if (await executar((A) => A.salvarMovCaixa(m), m.tipo === 'retirar' ? t('Dinheiro retirado do caixa.') : t('Dinheiro colocado no caixa.'))) { cancelar(); refValor.current?.focus() }
  }
  function editar(m) {
    setEditando(m)
    setForm({ tipo: m.tipo, valor: String(m.valor).replace('.', ','), descricao: m.descricao || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelar() { setEditando(null); setForm(novo) }
  async function excluir(m) {
    if (await confirmar(t('Excluir o movimento de {valor} de {data}?', { valor: brl(m.valor), data: dataBR(m.dia) }))) {
      executar((A) => A.excluirMovCaixa(m.id)).then((ok) => ok && editando?.id === m.id && cancelar())
    }
  }

  // período
  const agora = new Date()
  const desde = {
    hoje: new Date(hoje() + 'T00:00:00').getTime(),
    7: Date.now() - 7 * 86400000,
    mes: new Date(agora.getFullYear(), agora.getMonth(), 1).getTime(),
    tudo: 0,
  }[periodo]
  const doPeriodo = ext.movimentos.filter((m) => m.data >= desde)
  const soma = (origem) => doPeriodo.filter((m) => m.origem === origem).reduce((s, m) => s + Math.abs(m.valor), 0)
  const lista = [...doPeriodo].reverse()

  return (
    <section>
      <h2>{t('Controle de caixa')}</h2>

      <div className="cards">
        <div className="card destaque-caixa"><small>{t('Saldo em caixa')}</small><b className={ext.saldo < 0 ? 'bad' : ''}>{brl(ext.saldo)}</b></div>
        <div className="card"><small>{t('Vendas')}</small><b className="ok">+ {brl(soma('venda') + soma('fiado'))}</b></div>
        <div className="card"><small>{t('Dinheiro colocado')}</small><b className="ok">+ {brl(soma('colocar'))}</b></div>
        <div className="card"><small>{t('Compras de estoque')}</small><b className="bad">− {brl(soma('compra'))}</b></div>
        <div className="card"><small>{t('Dinheiro retirado')}</small><b className="bad">− {brl(soma('retirar'))}</b></div>
      </div>
      <p><small>{t('Controle desde {data}.', { data: `${dataTs(ext.inicio)} ${hora(ext.inicio)}` })}{' '}<button className="link pequeno" onClick={() => setAjustando(true)}>{t('Ajustar saldo inicial')}</button></small></p>
      {ext.saldo < 0 && <p className="bad">{t('O caixa está negativo: saiu mais dinheiro do que entrou. Confira as compras e retiradas, ou registre o dinheiro colocado.')}</p>}

      <div className="linha-titulo"><h3>{editando ? t('Editando movimento de {data} às {hora}', { data: dataBR(editando.dia), hora: hora(editando.data) }) : t('Colocar ou retirar dinheiro')}</h3></div>
      <form onSubmit={registrar} className={editando ? 'form-edicao' : ''}>
        <label style={{ flex: '0 1 200px' }}>{t('Tipo')}
          <select {...campo('tipo')}>
            <option value="colocar">{t('Colocar dinheiro')}</option>
            <option value="retirar">{t('Retirar dinheiro')}</option>
          </select>
        </label>
        <label style={{ flex: '0 1 160px' }}>{t('Valor (R$)')} *<input ref={refValor} required inputMode="decimal" placeholder="0,00" {...campo('valor')} /></label>
        <label style={{ flex: '2 1 240px' }}>{t('Descrição')}
          <input maxLength={120} placeholder={form.tipo === 'retirar' ? t('Ex: pró-labore, conta de luz, troco do banco...') : t('Ex: aporte do sócio, empréstimo, troco inicial...')} {...campo('descricao')} />
        </label>
        <button type="submit">{editando ? t('Salvar alterações') : form.tipo === 'retirar' ? t('Retirar') : t('Colocar')}</button>
        {editando && <button type="button" className="sec" onClick={cancelar}>{t('Cancelar edição')}</button>}
      </form>
      <p><small>{t('As vendas entram sozinhas e as entradas no estoque descontam o custo sozinhas. Aqui vai só o dinheiro que entra ou sai por fora delas.')}</small></p>

      <div className="linha-titulo">
        <h3>{t('Extrato')}</h3>
        <div className="chips">
          {PERIODOS.map((p) => <button key={p.id} className={'filtro' + (periodo === p.id ? ' ativo' : '')} onClick={() => setPeriodo(p.id)}>{t(p.nome)}</button>)}
        </div>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Data')}</th><th>{t('Tipo')}</th><th>{t('Descrição')}</th><th className="n">{t('Valor')}</th><th className="n">{t('Saldo')}</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="6" className="vazio">{t('Nenhum movimento neste período.')}</td></tr>}
            {lista.map((m) => (
              <tr key={m.id} className={editando?.id === m.ref.id ? 'em-edicao' : ''}>
                <td>{dataBR(m.dia)} {hora(m.data)}</td>
                <td><span className={ORIGENS[m.origem].classe}>{t(ORIGENS[m.origem].nome)}</span>{m.pagamento && <small> · {t(m.pagamento)}</small>}</td>
                <td className="quebra">{m.descricao || '-'}</td>
                <td className={'n ' + (m.valor < 0 ? 'bad' : 'ok')}>{m.valor < 0 ? '− ' : '+ '}{brl(Math.abs(m.valor))}</td>
                <td className="n">{brl(m.saldo)}</td>
                <td className="n">
                  {m.origem === 'colocar' || m.origem === 'retirar' ? (
                    <>
                      <button className="edit" onClick={() => editar(m.ref)}>{t('Editar')}</button>{' '}
                      <button className="del" onClick={() => excluir(m.ref)}>{t('Excluir')}</button>
                    </>
                  ) : (
                    <button className="link pequeno" onClick={() => irPara(m.origem === 'venda' ? 'vendas' : m.origem === 'fiado' ? 'fiado' : 'estoque')}>{m.origem === 'venda' ? t('Ver em Novo Registro') : m.origem === 'fiado' ? t('Ver em Cobranças') : t('Ver no Estoque')}</button>
                  )}
                </td>
              </tr>
            ))}
            {ext.inicio >= desde && <tr className="linha-inicial">
              <td>{dataTs(ext.inicio)} {hora(ext.inicio)}</td>
              <td>{t('Saldo inicial')}</td>
              <td>-</td><td className="n">{brl(ext.saldoInicial)}</td><td className="n">{brl(ext.saldoInicial)}</td>
              <td className="n"><button className="edit" onClick={() => setAjustando(true)}>{t('Ajustar')}</button></td>
            </tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
