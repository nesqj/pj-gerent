import { useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { brl, dataTs, gravarPrecoFornecedor, lerValor, menorPreco, nomeFornecedor, norm } from '../utils.js'
import { CamposFornecedor, doFormulario, origem, paraFormulario } from './Fornecedores.jsx'
import { EditorMarcas } from './Marcas.jsx'
import { IconeVoltar } from '../icones.jsx'
import { useCelular } from '../useCelular.js'

// Página de um fornecedor: informações + produtos e preços só dele (o cadastro de produto fica em "+ Cadastrar produto")
export default function FornecedorDetalhe({ db, executar, forn, voltar }) {
  const [editInfo, setEditInfo] = useState(null) // formulário de edição das informações
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState(null) // { id, preco } — preço sendo mudado na linha
  const celular = useCelular()

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

  async function salvarPreco(p) {
    const preco = lerValor(editando?.preco)
    if (String(editando?.preco ?? '').trim() === '' || !(preco >= 0)) return aviso.alerta(t('Informe o preço.'))
    if (await executar((A) => gravarPrecoFornecedor(A, db, { ...p, preco }), t('Preço atualizado.'))) setEditando(null)
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
  const whats = (() => { let n = String(telefone || '').replace(/\D/g, ''); if (!n) return null; if (n.length <= 11) n = '55' + n; return `https://wa.me/${n}` })()

  return (
    <section className="tela-registro sub-pagina">
      <button className="voltar-conta" onClick={voltar}><IconeVoltar /><span>{t('Todos os fornecedores')}</span></button>
      <h2>{forn.nome}</h2>

      {/* ---------- Informações ---------- */}
      {!editInfo ? (
        <div className="cb-item forn-info">
          <div className="forn-linha"><span>{t('De onde é')}</span><b>{origem(forn) || '-'}</b></div>
          <div className="forn-linha"><span>{t('Telefone / WhatsApp')}</span><b>{telefone || '-'}</b></div>
          <div className="forn-linha"><span>{t('E-mail')}</span><b className="quebra-linhas">{forn.email || '-'}</b></div>
          {forn.obs && <div className="forn-linha coluna"><span>{t('Observações')}</span><b>{forn.obs}</b></div>}
          <div className="cb-rodape vd-rodape">
            {whats && <a className="link pequeno" href={whats} target="_blank" rel="noreferrer">WhatsApp</a>}
            {forn.email && <a className="link pequeno" href={`mailto:${forn.email}`}>{t('E-mail')}</a>}
            <button className="link pequeno" onClick={() => setEditInfo(paraFormulario(forn))}>{t('Editar informações')}</button>
            <button className="link pequeno bad" onClick={excluirFornecedor}>{t('Excluir fornecedor')}</button>
          </div>
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
        <div className="cb-item forn-marcas">
          <h3>{t('Marcas que ele trabalha')}</h3>
          <EditorMarcas
            marcas={forn.marcas}
            emUso={emUso}
            onChange={(marcas) => executar((A) => A.salvarFornecedor({ ...forn, marcas }))}
            onRenomear={renomearMarca}
          />
        </div>
      )}

      {/* ---------- Produtos deste fornecedor ---------- */}
      <div className="dia-topo"><h3>{t('Produtos e preços')} ({db.precosForn.filter((x) => x.fornecedorId === forn.id).length})</h3></div>
      <p className="texto-precos">{t('Para cadastrar um produto, use "+ Cadastrar produto" na aba Fornecedores.')}</p>
      <div className="cb-busca">
        <input className="busca" placeholder={t('Buscar produto ou marca...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {celular ? (
        // no celular: cada produto é um cartão
        <div className="cb-lista">
          {produtos.length === 0 && <div className="cb-vazio">{t('Nenhum produto cadastrado para este fornecedor.')}</div>}
          {produtos.map((p) => {
            const best = menorPreco(db, p.produto, p.marca)
            const outros = db.precosForn.filter((x) => x.id !== p.id && norm(x.produto) === norm(p.produto) && norm(x.marca) === norm(p.marca)).length
            const comp = !outros ? <small>{t('único fornecedor')}</small>
              : best.id === p.id ? <small className="ok">{t('mais barato')}</small>
                : <small className="bad">{t('+{dif} que {forn}', { dif: brl(p.preco - best.preco), forn: nomeFornecedor(db, best.fornecedorId) })}</small>
            return (
              <div key={p.id} className="cb-item">
                <div className="cb-topo">
                  <span className="cb-quem">
                    <b className="quebra-linhas">{p.produto}</b>
                    <small>{[p.marca, dataTs(p.atualizado)].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="cb-valor">
                    {editando?.id === p.id
                      ? <span className="lf-preco forn-preco-edit"><span>R$</span><input inputMode="decimal" autoFocus value={editando.preco}
                          onChange={(e) => setEditando({ ...editando, preco: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') salvarPreco(p); if (e.key === 'Escape') setEditando(null) }} /></span>
                      : <b>{brl(p.preco)}</b>}
                    {comp}
                  </span>
                </div>
                <div className="cb-rodape vd-rodape">
                  {editando?.id === p.id
                    ? <><button className="link pequeno" onClick={() => setEditando(null)}>{t('Cancelar')}</button><button className="link pequeno" onClick={() => salvarPreco(p)}>{t('Salvar')}</button></>
                    : <><button className="link pequeno" onClick={() => setEditando({ id: p.id, preco: String(p.preco).replace('.', ',') })}>{t('Mudar preço')}</button>
                      <button className="link pequeno bad" onClick={() => excluirProduto(p)}>{t('Excluir')}</button></>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
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
                  <td className="n">{editando?.id === p.id
                    ? <span className="lf-preco" style={{ display: 'inline-flex', width: 120 }}><span>R$</span><input inputMode="decimal" autoFocus value={editando.preco}
                        onChange={(e) => setEditando({ ...editando, preco: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') salvarPreco(p); if (e.key === 'Escape') setEditando(null) }} /></span>
                    : <b>{brl(p.preco)}</b>}</td>
                  <td>{comp}</td>
                  <td>{dataTs(p.atualizado)}</td>
                  <td>
                    {editando?.id === p.id
                      ? <><button className="edit" onClick={() => salvarPreco(p)}>{t('Salvar')}</button>{' '}<button className="sec" onClick={() => setEditando(null)}>×</button></>
                      : <><button className="edit" onClick={() => setEditando({ id: p.id, preco: String(p.preco).replace('.', ',') })}>{t('Mudar preço')}</button>{' '}
                        <button className="del" onClick={() => excluirProduto(p)}>{t('Excluir')}</button></>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
    </section>
  )
}
