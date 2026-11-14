import { useRef, useState } from 'react'
import { confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { brl, dataTs, gravarPrecoFornecedor, menorPreco, nomeFornecedor, norm } from '../utils.js'
import { CamposFornecedor, doFormulario, origem, paraFormulario } from './Fornecedores.jsx'
import { EditorMarcas, SelectMarca } from './Marcas.jsx'

// Página de um fornecedor: informações + produtos e preços só dele
export default function FornecedorDetalhe({ db, executar, forn, voltar }) {
  const novo = { id: '', fornecedorId: forn.id, marca: '', produto: '', preco: '' }
  const [form, setForm] = useState(novo)
  const [editInfo, setEditInfo] = useState(null) // formulário de edição das informações
  const [busca, setBusca] = useState('')
  const refProduto = useRef(null)
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  const todosProdutos = [...new Set(db.precosForn.map((p) => p.produto))].sort()

  // quantos produtos deste fornecedor usam cada marca (avisa antes de remover uma marca)
  const emUso = {}
  for (const p of db.precosForn) if (p.fornecedorId === forn.id) emUso[norm(p.marca)] = (emUso[norm(p.marca)] || 0) + 1

  // renomeia a marca no fornecedor e nos produtos dele que usam essa marca
  function renomearMarca(antiga, nova, lista) {
    executar(async (A) => {
      await A.salvarFornecedor({ ...forn, marcas: lista })
      for (const p of db.precosForn) {
        if (p.fornecedorId === forn.id && norm(p.marca) === norm(antiga)) await A.salvarPrecoFornecedor({ ...p, marca: nova })
      }
    })
  }

  async function salvarInfo(e) {
    e.preventDefault()
    if (await executar((A) => A.salvarFornecedor(doFormulario(editInfo)))) setEditInfo(null)
  }

  async function excluirFornecedor() {
    const n = db.precosForn.filter((p) => p.fornecedorId === forn.id).length
    if (!await confirmar(n ? t('Excluir "{nome}" e seus {n} produto(s)?', { nome: forn.nome, n }) : t('Excluir "{nome}"?', { nome: forn.nome }))) return
    executar((A) => A.excluirFornecedor(forn.id)).then((ok) => ok && voltar())
  }

  async function salvarProduto(e) {
    e.preventDefault()
    if (await executar((A) => gravarPrecoFornecedor(A, db, form))) {
      setForm(novo)
      refProduto.current?.focus()
    }
  }

  async function excluirProduto(p) {
    if (await confirmar(t('Excluir "{produto}" deste fornecedor?', { produto: p.produto }))) executar((A) => A.excluirPrecoFornecedor(p.id))
  }

  const b = norm(busca)
  const produtos = db.precosForn
    .filter((p) => p.fornecedorId === forn.id)
    .filter((p) => !b || norm(p.produto + ' ' + p.marca).includes(b))
    .sort((a, c) => a.produto.localeCompare(c.produto))

  const telefone = forn.telefone || forn.contato

  return (
    <section>
      <h2>{forn.nome}</h2>
      <button className="voltar" onClick={voltar}>← {t('Todos os fornecedores')}</button>

      {/* ---------- Informações ---------- */}
      {!editInfo ? (
        <div className="painel info-forn">
          <div className="info-forn-topo">
            <h3>{forn.nome}</h3>
            <div>
              <button className="edit" onClick={() => setEditInfo(paraFormulario(forn))}>{t('Editar informações')}</button>{' '}
              <button className="del" onClick={excluirFornecedor}>{t('Excluir fornecedor')}</button>
            </div>
          </div>
          <dl>
            <div><dt>{t('De onde é')}</dt><dd>{origem(forn) || '-'}</dd></div>
            <div><dt>{t('Telefone / WhatsApp')}</dt><dd>{telefone || '-'}</dd></div>
            <div><dt>{t('E-mail')}</dt><dd>{forn.email ? <a href={`mailto:${forn.email}`}>{forn.email}</a> : '-'}</dd></div>
            {forn.obs && <div className="largo"><dt>{t('Observações')}</dt><dd>{forn.obs}</dd></div>}
          </dl>
        </div>
      ) : (
        <form onSubmit={salvarInfo}>
          <CamposFornecedor form={editInfo} setForm={setEditInfo} emUso={emUso} />
          <button type="submit">{t('Salvar informações')}</button>
          <button type="button" className="sec" onClick={() => setEditInfo(null)}>{t('Cancelar')}</button>
        </form>
      )}

      {/* ---------- Marcas (salva na hora) ---------- */}
      {!editInfo && (
        <div className="painel">
          <h3 style={{ marginBottom: 10 }}>{t('Marcas que ele trabalha')}</h3>
          <EditorMarcas
            marcas={forn.marcas}
            emUso={emUso}
            onChange={(marcas) => executar((A) => A.salvarFornecedor({ ...forn, marcas }))}
            onRenomear={renomearMarca}
          />
        </div>
      )}

      {/* ---------- Produtos deste fornecedor ---------- */}
      <div className="linha-titulo"><h3>{t('Produtos e preços')}</h3></div>
      {forn.marcas.length === 0 && <p className="warn">{t('Cadastre pelo menos uma marca acima para poder adicionar produtos.')}</p>}
      <form onSubmit={salvarProduto}>
        <label style={{ flex: '2 1 220px' }}>{t('Produto')} *<input ref={refProduto} list="dlProdutosForn" required {...campo('produto')} /></label>
        <label>{t('Marca')} *<SelectMarca fornecedor={forn} {...campo('marca')} /></label>
        <label style={{ flex: '0 1 150px' }}>{t('Preço (R$)')} *<input type="number" step="0.01" min="0" required {...campo('preco')} /></label>
        <button type="submit">{form.id ? t('Atualizar') : t('Adicionar produto')}</button>
        {form.id && <button type="button" className="sec" onClick={() => setForm(novo)}>{t('Cancelar')}</button>}
      </form>
      <datalist id="dlProdutosForn">{todosProdutos.map((p) => <option key={p} value={p} />)}</datalist>

      <input className="busca" placeholder={t('Buscar produto ou marca...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="tw">
        <table>
          <thead>
            <tr><th>{t('Produto')}</th><th>{t('Marca')}</th><th className="n">{t('Preço')}</th><th>{t('Comparação')}</th><th>{t('Atualizado')}</th><th></th></tr>
          </thead>
          <tbody>
            {produtos.length === 0 && <tr><td colSpan="6" className="vazio">{t('Nenhum produto cadastrado para este fornecedor.')}</td></tr>}
            {produtos.map((p) => {
              const best = menorPreco(db, p.produto, p.marca)
              const outros = db.precosForn.filter((x) => x.id !== p.id && norm(x.produto) === norm(p.produto) && norm(x.marca) === norm(p.marca)).length
              let comp = <small>{t('único fornecedor')}</small>
              if (outros) {
                comp = best.id === p.id
                  ? <span className="ok">{t('mais barato')}</span>
                  : <span className="bad">{t('+{dif} que {forn}', { dif: brl(p.preco - best.preco), forn: nomeFornecedor(db, best.fornecedorId) })}</span>
              }
              return (
                <tr key={p.id}>
                  <td>{p.produto}</td>
                  <td>{p.marca || '-'}</td>
                  <td className="n"><b>{brl(p.preco)}</b></td>
                  <td>{comp}</td>
                  <td>{dataTs(p.atualizado)}</td>
                  <td>
                    <button className="edit" onClick={() => setForm({ ...p, preco: String(p.preco) })}>{t('Editar')}</button>{' '}
                    <button className="del" onClick={() => excluirProduto(p)}>{t('Excluir')}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
