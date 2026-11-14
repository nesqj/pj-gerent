import { useState } from 'react'
import { aviso } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { brl, chave, gravarPrecoFornecedor, lerValor, norm, pct } from '../utils.js'

export const trabalhaCom = (forn, marca) => (forn.marcas || []).some((m) => norm(m) === norm(marca))
// todas as marcas do cadastro dos fornecedores (sem repetir; fica a primeira grafia)
export const marcasDisponiveis = (db) => [...(db.fornecedores || []).flatMap((x) => x.marcas || []).reduce((m, x) => (m.has(norm(x)) ? m : m.set(norm(x), x)), new Map()).values()]
  .sort((a, b) => a.localeCompare(b))

// Cadastrar um produto e os fornecedores que têm ele (cada um com o seu preço)

export default function NovoProduto({ db, executar, aoTerminar }) {
  const marcas = marcasDisponiveis(db)
  const todos = [...(db.fornecedores || [])].sort((a, b) => a.nome.localeCompare(b.nome))
  const daMarca = (marca) => todos.filter((x) => trabalhaCom(x, marca))
  const [f, setF] = useState(() => ({ produto: '', marca: marcas[0] || '', linhas: [{ fornecedorId: daMarca(marcas[0] || '')[0]?.id || '', preco: '' }] }))
  const fornecedores = daMarca(f.marca)
  const trocarMarca = (marca) => setF({ ...f, marca, linhas: [{ fornecedorId: daMarca(marca)[0]?.id || '', preco: '' }] })
  const mudarLinha = (i, campos) => setF({ ...f, linhas: f.linhas.map((l, k) => (k === i ? { ...l, ...campos } : l)) })
  // preço de venda: digitado direto ou pela % sobre o menor custo dos fornecedores
  const [venda, setVenda] = useState({ campo: 'pct', valor: '' })
  const custos = f.linhas.filter((l) => String(l.preco).trim() !== '').map((l) => lerValor(l.preco)).filter((x) => Number.isFinite(x) && x >= 0)
  const menorCusto = custos.length ? Math.min(...custos) : null
  const r2 = (x) => Math.round(x * 100) / 100
  const precoVenda = venda.valor === '' ? null
    : venda.campo === 'pct' ? (menorCusto != null && Number.isFinite(lerValor(venda.valor)) ? r2(menorCusto * (1 + lerValor(venda.valor) / 100)) : null)
    : lerValor(venda.valor)
  const pctVenda = venda.campo === 'pct' ? venda.valor
    : precoVenda != null && menorCusto > 0 ? String(r2(((precoVenda - menorCusto) / menorCusto) * 100)).replace('.', ',') : ''
  const lucro = precoVenda != null && menorCusto != null ? precoVenda - menorCusto : null
  async function salvar(e) {
    e.preventDefault()
    if (!f.produto.trim()) return aviso.alerta(t('Informe o nome do produto.'))
    const linhas = f.linhas.filter((l) => l.fornecedorId)
    if (!linhas.length) return aviso.alerta(t('Escolha pelo menos um fornecedor.'))
    if (new Set(linhas.map((l) => l.fornecedorId)).size !== linhas.length) return aviso.alerta(t('Cada fornecedor só pode aparecer uma vez.'))
    if (linhas.some((l) => !(lerValor(l.preco) >= 0) || String(l.preco).trim() === '')) return aviso.alerta(t('Informe o preço de cada fornecedor.'))
    if (venda.valor !== '' && !(precoVenda >= 0)) return aviso.alerta(t('Confira o preço de venda.'))
    const ok = await executar(async (A) => {
      for (const l of linhas) await gravarPrecoFornecedor(A, db, { fornecedorId: l.fornecedorId, produto: f.produto, marca: f.marca, preco: lerValor(l.preco) })
      if (precoVenda != null) await A.salvarPrecoProduto(chave(f.produto, f.marca), { tipo: 'fixo', valor: r2(precoVenda) })
    }, t('Produto cadastrado em {n} fornecedor(es).', { n: linhas.length }))
    if (ok) aoTerminar(chave(f.produto, f.marca))
  }
  if (!todos.length) return <p className="warn">{t('Cadastre os fornecedores primeiro, na aba Fornecedores.')}</p>
  if (!marcas.length) return <p className="warn">{t('Cadastre as marcas nos fornecedores primeiro, na aba Fornecedores.')}</p>
  return (
    <form onSubmit={salvar} className="painel form-produto np">
      <div className="np-titulo"><b>{t('Novo produto')}</b></div>
      {/* linha 1: nome e marca */}
      <div className="np-linha">
        <label>{t('Produto')} *<input required maxLength={80} placeholder={t('Ex: Capinha iPhone 13')} value={f.produto} onChange={(e) => setF({ ...f, produto: e.target.value })} /></label>
        <label>{t('Marca')} *
          <select value={f.marca} onChange={(e) => trocarMarca(e.target.value)}>
            {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      {/* linha 2: fornecedores (custo) e preço de venda, lado a lado */}
      <div className="np-blocos">
        <div className="np-bloco">
          <div className="lf-titulo">
            <b>{t('Fornecedores e custo')}</b>
            <small>{t('marca {marca}', { marca: f.marca })}</small>
          </div>
          {fornecedores.length === 0 && <small className="warn">{t('Nenhum fornecedor trabalha com esta marca.')}</small>}
          {f.linhas.map((l, i) => (
            <div key={i} className="lf-linha">
              <select value={l.fornecedorId} onChange={(e) => mudarLinha(i, { fornecedorId: e.target.value })}>
                {fornecedores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              <div className="lf-preco">
                <span>R$</span>
                <input inputMode="decimal" placeholder="0,00" value={l.preco} onChange={(e) => mudarLinha(i, { preco: e.target.value })} />
              </div>
              {f.linhas.length > 1
                ? <button type="button" className="lf-tirar" title={t('Remover')} onClick={() => setF({ ...f, linhas: f.linhas.filter((_, k) => k !== i) })}>×</button>
                : <span className="lf-tirar-vazio" />}
            </div>
          ))}
          {f.linhas.length < fornecedores.length && (
            <button type="button" className="lf-mais" onClick={() => setF({ ...f, linhas: [...f.linhas, { fornecedorId: fornecedores.find((x) => !f.linhas.some((l) => l.fornecedorId === x.id))?.id || '', preco: '' }] })}>+ {t('Outro fornecedor')}</button>
          )}
        </div>
        <div className="np-bloco">
          <div className="lf-titulo">
            <b>{t('Preço de venda')}</b>
            <small>{menorCusto != null ? t('sobre o menor custo: {valor}', { valor: brl(menorCusto) }) : t('preencha o custo ao lado')}</small>
          </div>
          <div className="np-venda">
            <label>{t('Aumento')}
              <span className="lf-preco"><input inputMode="decimal" placeholder="0" value={pctVenda} onChange={(e) => setVenda({ campo: 'pct', valor: e.target.value })} /><span className="sufixo">%</span></span>
            </label>
            <span className="np-igual">=</span>
            <label>{t('Preço de venda')}
              <span className="lf-preco"><span>R$</span><input inputMode="decimal" placeholder="0,00"
                value={venda.campo === 'preco' ? venda.valor : precoVenda != null ? String(precoVenda.toFixed(2)).replace('.', ',') : ''}
                onChange={(e) => setVenda({ campo: 'preco', valor: e.target.value })} /></span>
            </label>
          </div>
          <div className="np-resumo">
            <div><small>{t('Lucro')}</small><b className={lucro != null && lucro < 0 ? 'bad' : 'ok'}>{lucro != null ? brl(lucro) : '—'}</b></div>
            <div><small>{t('Margem')}</small><b>{lucro != null && precoVenda > 0 ? pct((lucro / precoVenda) * 100) : '—'}</b></div>
          </div>
        </div>
      </div>
      {/* linha 3: botões */}
      <div className="np-botoes">
        <button type="button" className="sec" onClick={() => aoTerminar(null)}>{t('Cancelar')}</button>
        <button type="submit">{t('Cadastrar produto')}</button>
      </div>
    </form>
  )
}
