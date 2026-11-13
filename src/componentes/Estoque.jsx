import { useRef, useState } from 'react'
import { t } from '../i18n.js'
import { brl, calcularEstoque, classeEstoque, dataBR, hoje, hora, norm, uid } from '../utils.js'

// Estoque próprio da loja: não tem fornecedor nem marca, e não se mistura com os preços dos fornecedores.
// O preço de venda é digitado na aba Vendas, na hora de vender.
const novo = { produto: '', qtd: '1', custo: '', obs: '' }

export default function Estoque({ db, executar }) {
  const [form, setForm] = useState(novo)
  const [editando, setEditando] = useState(null) // entrada sendo editada
  const [busca, setBusca] = useState('')
  const [soFalta, setSoFalta] = useState(false)
  const refProduto = useRef(null)
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  const estoque = calcularEstoque(db)
  const existente = estoque.get(norm(form.produto)) // produto que já está no estoque

  async function registrar(e) {
    e.preventDefault()
    const dados = {
      produto: existente ? existente.produto : form.produto.trim(), // mantém o mesmo nome já cadastrado
      qtd: +form.qtd,
      custo: +form.custo,
      obs: form.obs.trim(),
    }
    // editando: mantém id, data e dia originais
    const entrada = editando ? { ...editando, ...dados } : { id: uid(), data: Date.now(), dia: hoje(), ...dados }
    if (await executar((A) => A.salvarEntrada(entrada))) {
      cancelarEdicao()
      refProduto.current?.focus()
    }
  }

  function editarEntrada(en) {
    setEditando(en)
    setForm({ produto: en.produto, qtd: String(en.qtd), custo: en.custo != null ? String(en.custo) : '', obs: en.obs || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicao() {
    setEditando(null)
    setForm(novo)
  }

  function excluirEntrada(en) {
    if (confirm(t('Excluir a entrada de {qtd}× "{produto}" de {data}?\nO estoque vai diminuir {qtd} unidade(s).', { qtd: en.qtd, produto: en.produto, data: dataBR(en.dia) }))) {
      executar((A) => A.excluirEntrada(en.id)).then((ok) => ok && editando?.id === en.id && cancelarEdicao())
    }
  }

  const todos = [...estoque.values()]
  const b = norm(busca)
  const linhas = todos
    .filter((p) => !b || norm(p.produto).includes(b))
    .filter((p) => !soFalta || p.saldo <= 0)
    .sort((a, c) => a.produto.localeCompare(c.produto))

  const unidades = todos.reduce((s, p) => s + Math.max(0, p.saldo), 0)
  const valorCusto = todos.reduce((s, p) => s + Math.max(0, p.saldo) * (p.custo ?? 0), 0)
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
            placeholder={existente?.custo != null ? `${t('último')}: ${brl(existente.custo)}` : ''} {...campo('custo')} />
        </label>
        <label style={{ flex: '1 1 100%' }}>{t('Observação')}<input placeholder={t('Ex: nota fiscal 123, IMEI, de quem comprou...')} {...campo('obs')} /></label>
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
            <tr><th>{t('Produto')}</th><th className="n">{t('Custo unit.')}</th><th className="n">{t('Entradas')}</th><th className="n">{t('Vendidos')}</th><th className="n">{t('Em estoque')}</th><th className="n">{t('Valor (custo)')}</th></tr>
          </thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan="6" className="vazio">{todos.length ? t('Nada encontrado.') : t('Nenhum produto no estoque. Registre uma entrada acima.')}</td></tr>}
            {linhas.map((p) => (
              <tr key={p.k}>
                <td>{p.produto}</td>
                <td className="n">{p.custo != null ? brl(p.custo) : '-'}</td>
                <td className="n">{p.entradas}</td>
                <td className="n">{p.vendidos}</td>
                <td className="n"><b className={classeEstoque(p.saldo)}>{p.saldo}</b></td>
                <td className="n">{p.saldo > 0 && p.custo != null ? brl(p.saldo * p.custo) : '-'}</td>
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
            <tr><th>{t('Data')}</th><th>{t('Produto')}</th><th className="n">{t('Qtd.')}</th><th className="n">{t('Custo unit.')}</th><th className="n">{t('Total')}</th><th>{t('Obs.')}</th><th></th></tr>
          </thead>
          <tbody>
            {entradas.length === 0 && <tr><td colSpan="7" className="vazio">{t('Nenhuma entrada registrada.')}</td></tr>}
            {entradas.map((en) => (
              <tr key={en.id} className={editando?.id === en.id ? 'em-edicao' : ''}>
                <td>{dataBR(en.dia)} {hora(en.data)}</td>
                <td>{en.produto}</td>
                <td className="n">{en.qtd}</td>
                <td className="n">{en.custo != null ? brl(en.custo) : '-'}</td>
                <td className="n">{en.custo != null ? brl(en.qtd * en.custo) : '-'}</td>
                <td className="quebra">{en.obs || '-'}</td>
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
