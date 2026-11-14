import { useRef, useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { brl, calcularEstoque, calcularLotes, classeEstoque, dataBR, hoje, hora, norm, uid } from '../utils.js'

// Estoque próprio da loja: não tem fornecedor nem marca, e não se mistura com os preços dos fornecedores.
// O preço de venda é digitado na aba Vendas, na hora de vender.
const novo = { produto: '', qtd: '1', custo: '', obs: '', doCaixa: true }

export default function Estoque({ db, executar, irPara }) {
  const [form, setForm] = useState(novo)
  const [editando, setEditando] = useState(null) // entrada sendo editada
  const [busca, setBusca] = useState('')
  const [soFalta, setSoFalta] = useState(false)
  const refProduto = useRef(null)
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  const estoque = calcularEstoque(db)
  const lotes = calcularLotes(db)
  const existente = estoque.get(norm(form.produto)) // produto que já está no estoque

  async function registrar(e) {
    e.preventDefault()
    const dados = {
      produto: existente ? existente.produto : form.produto.trim(), // mantém o mesmo nome já cadastrado
      qtd: +form.qtd,
      custo: +form.custo,
      obs: form.obs.trim(),
      foraDoCaixa: !form.doCaixa || undefined, // não desconta do caixa (comprado com outro dinheiro)
    }
    // editando: mantém id, data e dia originais
    const entrada = editando ? { ...editando, ...dados } : { id: uid(), data: Date.now(), dia: hoje(), ...dados }
    if (!entrada.foraDoCaixa) delete entrada.foraDoCaixa
    if (await executar((A) => A.salvarEntrada(entrada), editando ? t('Entrada atualizada.') : t('Entrada registrada.'))) {
      cancelarEdicao()
      refProduto.current?.focus()
    }
  }

  function editarEntrada(en) {
    setEditando(en)
    setForm({ produto: en.produto, qtd: String(en.qtd), custo: en.custo != null ? String(en.custo) : '', obs: en.obs || '', doCaixa: !en.foraDoCaixa })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicao() {
    setEditando(null)
    setForm(novo)
  }

  async function excluirEntrada(en) {
    // entrada (lote) que já teve unidades vendidas: excluir deixaria o estoque negativo
    const lote = lotes.get(en.id)
    const k = norm(en.produto)
    const vendidoDireto = (db.vendas || []).reduce((s, v) => s + v.itens.filter((i) => i.origem === 'estoque' && i.entradaId === en.id).reduce((x, i) => x + (+i.qtd || 0), 0), 0)
    if (lote && (vendidoDireto > 0 || (estoque.get(k)?.saldo ?? 0) - en.qtd < 0)) {
      // em que dias estão as vendas que usaram esta entrada (ou o produto, nas vendas antigas sem lote)
      const usa = (i) => i.origem === 'estoque' && (i.entradaId ? i.entradaId === en.id : norm(i.produto) === k)
      const dias = [...new Set((db.vendas || []).filter((v) => v.itens.some(usa)).map((v) => v.dia))].sort().reverse()
      const abrirDia = (d) => { try { sessionStorage.setItem('vendas-dia', d) } catch { /* sem acesso */ } irPara?.('vendas') }
      return aviso.alerta(
        t('Não dá para excluir: esta entrada já foi vendida.'),
        t('Desta entrada já saíram {n} unidade(s). Exclua antes a venda em Vendas: {dias}.', { n: lote.vendidos, dias: dias.map(dataBR).join(', ') }),
        dias.length && irPara ? { duration: 12000, action: { label: t('Ver venda de {data}', { data: dataBR(dias[0]) }), onClick: () => abrirDia(dias[0]) } } : undefined,
      )
    }
    if (await confirmar(t('Excluir a entrada de {qtd}× "{produto}" de {data}?\nO estoque vai diminuir {qtd} unidade(s).', { qtd: en.qtd, produto: en.produto, data: dataBR(en.dia) }))) {
      executar((A) => A.excluirEntrada(en.id), t('Entrada excluída.')).then((ok) => ok && editando?.id === en.id && cancelarEdicao())
    }
  }

  const todos = [...estoque.values()]
  const b = norm(busca)
  const linhas = todos
    .filter((p) => !b || norm(p.produto).includes(b))
    .filter((p) => !soFalta || p.saldo <= 0)
    .sort((a, c) => a.produto.localeCompare(c.produto))

  const unidades = todos.reduce((s, p) => s + Math.max(0, p.saldo), 0)
  const valorCusto = todos.reduce((s, p) => s + (p.valor || 0), 0) // soma exata dos lotes (cada um com o próprio custo)
  const semEstoque = todos.filter((p) => p.saldo <= 0).length

  const entradas = [...(db.entradas || [])].sort((a, c) => c.data - a.data).slice(0, 50)

  return (
    <section>
      <h2>{t('Estoque')}</h2>

      {/* ---------- Entrada de produtos ---------- */}
      <div className="linha-titulo"><h3>{editando ? t('Editando entrada de {data} às {hora}', { data: dataBR(editando.dia), hora: hora(editando.data) }) : t('Entrada de produtos')}</h3></div>
      <form onSubmit={registrar} className={editando ? 'form-edicao' : ''}>
        <label style={{ flex: '2 1 240px' }}>{t('Produto')} *
          <input ref={refProduto} required list="dlProdEstoque" placeholder={t('Ex: iPhone 11 64GB preto')} {...campo('produto')} />
        </label>
        <label style={{ flex: '0 1 110px' }}>{t('Quantidade')} *<input type="number" min="1" step="1" required {...campo('qtd')} /></label>
        <label style={{ flex: '0 1 160px' }}>{t('Custo unit. (R$)')} *
          <input type="number" min="0" step="0.01" required
            placeholder={existente?.ultimoCusto != null ? `${t('último')}: ${brl(existente.ultimoCusto)}` : ''} {...campo('custo')} />
        </label>
        <label style={{ flex: '1 1 100%' }}>{t('Observação')}<input placeholder={t('Ex: nota fiscal 123, IMEI, de quem comprou...')} {...campo('obs')} /></label>
        {db.caixa && (
          <label className="check">
            <input type="checkbox" checked={form.doCaixa} onChange={(e) => setForm({ ...form, doCaixa: e.target.checked })} />
            {t('Pago com o dinheiro do caixa')}
            {form.doCaixa && +form.qtd > 0 && +form.custo > 0 && <small> ({t('desconta {valor}', { valor: brl(+form.qtd * +form.custo) })})</small>}
          </label>
        )}
        <button type="submit">{editando ? t('Salvar alterações') : t('Registrar entrada')}</button>
        {editando && <button type="button" className="sec" onClick={cancelarEdicao}>{t('Cancelar edição')}</button>}
      </form>
      <datalist id="dlProdEstoque">{todos.map((p) => <option key={p.k} value={p.produto} />)}</datalist>
      <p><small>
        {editando
          ? t('Altere os dados e clique em "Salvar alterações". O estoque é recalculado automaticamente.')
          : existente
          ? t('"{produto}" já está no estoque ({n} un.). A quantidade será somada.', { produto: existente.produto, n: existente.saldo })
          : t('O preço de venda é informado na aba Vendas, na hora de vender.')}
      </small></p>

      {/* ---------- Resumo ---------- */}
      <div className="cards">
        <div className="card"><small>{t('Unidades em estoque')}</small><b>{unidades}</b></div>
        <div className="card"><small>{t('Valor em estoque (custo)')}</small><b>{brl(valorCusto)}</b></div>
        <div className="card"><small>{t('Produtos sem estoque')}</small><b className={semEstoque ? 'bad' : ''}>{semEstoque}</b></div>
      </div>

      {/* ---------- Estoque atual ---------- */}
      <div className="linha-titulo">
        <h3>{t('Estoque atual')}</h3>
        <label className="check"><input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} /> {t('Só sem estoque')}</label>
      </div>
      <input className="busca" placeholder={t('Buscar produto...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="tw">
        <table>
          <thead>
            <tr><th>{t('Produto')}</th><th className="n" title={t('Média do custo das unidades em estoque, pesando a quantidade de cada entrada.')}>{t('Custo médio')}</th><th className="n">{t('Entradas')}</th><th className="n">{t('Vendidos')}</th><th className="n">{t('Em estoque')}</th><th className="n">{t('Valor (custo)')}</th></tr>
          </thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan="6" className="vazio">{todos.length ? t('Nada encontrado.') : t('Nenhum produto no estoque. Registre uma entrada acima.')}</td></tr>}
            {linhas.map((p) => (
              <tr key={p.k}>
                <td>{p.produto}</td>
                <td className="n">{p.custo != null ? brl(p.custo) : '-'}</td>
                <td className="n">{p.entradas}</td>
                <td className="n">{p.vendidos}</td>
                <td className="n"><b className={classeEstoque(p.saldo)}>{Math.max(0, p.saldo)}</b>{p.saldo < 0 && <small className="bad" title={t('Vendeu {n} a mais do que entrou (antes do bloqueio). Registre uma entrada para acertar.', { n: -p.saldo })}> ({p.saldo})</small>}</td>
                <td className="n">{p.saldo > 0 && p.valor > 0 ? brl(p.valor) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Histórico ---------- */}
      <div className="linha-titulo"><h3>{t('Últimas entradas')}</h3></div>
      <div className="tw">
        <table>
          <thead>
            <tr><th>{t('Data')}</th><th>{t('Produto')}</th><th className="n">{t('Qtd.')}</th><th className="n">{t('Restam')}</th><th className="n">{t('Custo unit.')}</th><th className="n">{t('Total')}</th><th>{t('Obs.')}</th><th></th></tr>
          </thead>
          <tbody>
            {entradas.length === 0 && <tr><td colSpan="8" className="vazio">{t('Nenhuma entrada registrada.')}</td></tr>}
            {entradas.map((en) => (
              <tr key={en.id} className={editando?.id === en.id ? 'em-edicao' : ''}>
                <td>{dataBR(en.dia)} {hora(en.data)}</td>
                <td>{en.produto}</td>
                <td className="n">{en.qtd}</td>
                <td className="n"><b className={classeEstoque(lotes.get(en.id)?.saldo ?? 0)}>{Math.max(0, lotes.get(en.id)?.saldo ?? 0)}</b></td>
                <td className="n">{en.custo != null ? brl(en.custo) : '-'}</td>
                <td className="n">{en.custo != null ? brl(en.qtd * en.custo) : '-'}</td>
                <td className="quebra">{en.obs || '-'}{en.foraDoCaixa && <span className="tag">{t('fora do caixa')}</span>}</td>
                <td>
                  <button className="edit" onClick={() => editarEntrada(en)}>{t('Editar')}</button>{' '}
                  <button className="del" onClick={() => excluirEntrada(en)}>{t('Excluir')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
