import { useState } from 'react'
import { confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { brl, calcularVenda, escolhaProduto, formulaRegra, margemDe, pct, produtosAVenda, regraPadraoDe, regrasDe, textoCalculo, uid } from '../utils.js'

// Aba de regras de preço: cria várias regras com nome e escolhe qual é a padrão.
// Em "Tabela de Venda" cada produto escolhe a regra que quiser.
const vazio = { id: '', nome: '', percentual: '' }

export default function RegraPreco({ db, executar }) {
  const regras = regrasDe(db)
  const padrao = regraPadraoDe(db)
  const [form, setForm] = useState(vazio)
  const [custoExemplo, setCustoExemplo] = useState('100')
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  const valido = form.nome.trim() && form.percentual !== '' && +form.percentual >= 0
  const nova = { percentual: +form.percentual || 0 }
  const exemplo = +custoExemplo || 0

  // quantos produtos usam cada regra (escolhida direto ou pela padrão)
  const produtos = produtosAVenda(db)
  const uso = (id) => produtos.filter((p) => p.resolucao.regra?.id === id).length

  async function salvar(e) {
    e.preventDefault()
    if (!valido) return
    const regra = { id: form.id || uid(), nome: form.nome.trim(), ...nova }
    const lista = form.id ? regras.map((r) => (r.id === form.id ? regra : r)) : [...regras, regra]
    // a primeira regra criada já vira a padrão, se ainda não houver uma definida
    const padraoId = db.regraPadraoId !== undefined ? db.regraPadraoId : padrao?.id ?? regra.id
    if (await executar((A) => A.salvarRegras(lista, padraoId), t('Regra salva.'))) setForm(vazio)
  }

  function editar(r) {
    setForm({ id: r.id, nome: r.nome, percentual: String(+r.percentual || 0) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function excluir(r) {
    const diretos = Object.values(db.precoProduto || {}).filter((e) => e.tipo === 'regra' && e.regraId === r.id).length
    const msg = diretos
      ? t('Excluir a regra "{nome}"? {n} produto(s) que usam esta regra passam a usar a regra padrão.', { nome: r.nome, n: diretos })
      : t('Excluir a regra "{nome}"?', { nome: r.nome })
    if (!await confirmar(msg)) return
    executar((A) => A.salvarRegras(regras.filter((x) => x.id !== r.id), padrao?.id === r.id ? null : padrao?.id ?? null))
    if (form.id === r.id) setForm(vazio)
  }

  function mudarPadrao(id) {
    executar((A) => A.salvarRegras(regras, id || null))
  }

  const comEscolha = produtos.filter((p) => escolhaProduto(db, p.k).tipo !== 'padrao').length

  return (
    <section>
      <h2>{t('Regra de Preço')}</h2>
      <p><small>{t('Crie quantas regras quiser. Em "Tabela de Venda" você escolhe a regra de cada produto; os produtos sem escolha usam a regra padrão.')}</small></p>

      {/* ---------- Criar / editar regra ---------- */}
      <div className="linha-titulo"><h3>{form.id ? t('Editar regra') : t('Nova regra')}</h3></div>
      <form onSubmit={salvar} className={form.id ? 'form-edicao' : ''}>
        <label style={{ flex: '2 1 200px' }}>{t('Nome da regra')} *
          <input required maxLength={40} placeholder={t('Ex: Telas, Acessórios, Celulares')} {...campo('nome')} />
        </label>
        <label style={{ flex: '0 1 170px' }}>{t('Aumentar (%)')} *
          <input type="number" min="0" step="0.01" required placeholder={t('Ex: 30')} {...campo('percentual')} />
        </label>
        <button type="submit" disabled={!valido}>{form.id ? t('Salvar alterações') : t('Criar regra')}</button>
        {form.id && <button type="button" className="sec" onClick={() => setForm(vazio)}>{t('Cancelar edição')}</button>}
      </form>

      <div className="resultado">
        <div>
          <small>{t('Simular com custo de')}</small>
          <input type="number" min="0" step="0.01" value={custoExemplo} onChange={(e) => setCustoExemplo(e.target.value)} style={{ width: 120 }} />
        </div>
        <div><small>{t('Cálculo')}</small><b>{textoCalculo(exemplo, nova)}</b></div>
        <div className="destaque"><small>{t('Preço de venda')}</small><b>{brl(calcularVenda(exemplo, nova))}</b></div>
        <div><small>{t('Margem sobre a venda')}</small><b>{pct(margemDe(exemplo, calcularVenda(exemplo, nova)))}</b></div>
      </div>
      <p><small>{t('A porcentagem é calculada sobre o custo. Ex.: custo R$ 100 + 30% = R$ 130.')}</small></p>

      {/* ---------- Regra padrão ---------- */}
      <div className="painel">
        <label style={{ maxWidth: 420 }}>{t('Regra padrão (para produtos sem regra escolhida)')}
          <select value={padrao?.id || ''} onChange={(e) => mudarPadrao(e.target.value)}>
            <option value="">{t('Nenhuma — preço igual ao custo')}</option>
            {regras.map((r) => <option key={r.id} value={r.id}>{r.nome} ({formulaRegra(r)})</option>)}
          </select>
        </label>
        <p style={{ marginTop: 10 }}><small>
          {t('{n} produto(s) com regra própria ou preço fixo. Para mudar, use a aba "Tabela de Venda".', { n: comEscolha })}
        </small></p>
      </div>

      {/* ---------- Regras criadas ---------- */}
      <div className="linha-titulo"><h3>{t('Regras criadas')}</h3></div>
      <div className="tw">
        <table>
          <thead>
            <tr><th>{t('Nome')}</th><th>{t('Fórmula')}</th><th className="n">{t('Exemplo: custo {custo}', { custo: brl(exemplo) })}</th><th className="n">{t('Produtos')}</th><th></th></tr>
          </thead>
          <tbody>
            {regras.length === 0 && <tr><td colSpan="5" className="vazio">{t('Nenhuma regra criada. Crie a primeira acima.')}</td></tr>}
            {regras.map((r) => (
              <tr key={r.id} className={form.id === r.id ? 'em-edicao' : ''}>
                <td><b>{r.nome}</b> {padrao?.id === r.id && <span className="tag">{t('padrão')}</span>}</td>
                <td>{formulaRegra(r)}</td>
                <td className="n">{brl(calcularVenda(exemplo, r))}</td>
                <td className="n">{uso(r.id)}</td>
                <td>
                  <button className="edit" onClick={() => editar(r)}>{t('Editar')}</button>{' '}
                  <button className="del" onClick={() => excluir(r)}>{t('Excluir')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
