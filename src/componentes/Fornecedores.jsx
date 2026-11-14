import { useState } from 'react'
import { t } from '../i18n.js'
import { norm, uid } from '../utils.js'
import FornecedorDetalhe from './FornecedorDetalhe.jsx'
import { EditorMarcas } from './Marcas.jsx'
import PrecosVenda from './PrecosVenda.jsx'

export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

export const fornecedorVazio = { id: '', nome: '', cidade: '', uf: '', telefone: '', email: '', marcas: [], obs: '' }

// Converte o fornecedor salvo para os campos do formulário
export const paraFormulario = (f) => ({
  ...fornecedorVazio,
  ...f,
  telefone: f.telefone ?? f.contato ?? '', // fornecedores antigos tinham só "contato"
  marcas: [...f.marcas],
})

// Converte o formulário para o fornecedor salvo
export const doFormulario = (form) => ({
  id: form.id || uid(),
  nome: form.nome.trim(),
  cidade: form.cidade.trim(),
  uf: form.uf,
  telefone: form.telefone.trim(),
  email: form.email.trim(),
  obs: form.obs.trim(),
  marcas: form.marcas,
})

export const origem = (f) => [f.cidade, f.uf].filter(Boolean).join(' / ')

// Campos do formulário de fornecedor (usado na lista e na página do fornecedor)
export function CamposFornecedor({ form, setForm, emUso }) {
  const campo = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm({ ...form, [k]: e.target.value }) })
  return (
    <>
      <label style={{ flex: '2 1 220px' }}>{t('Nome do fornecedor')} *<input required {...campo('nome')} /></label>
      <label>{t('Cidade')}<input placeholder={t('Ex: São Paulo')} {...campo('cidade')} /></label>
      <label style={{ flex: '0 1 90px' }}>{t('UF')}
        <select {...campo('uf')}>
          <option value=""></option>
          {UFS.map((u) => <option key={u}>{u}</option>)}
        </select>
      </label>
      <label>{t('Telefone / WhatsApp')}<input placeholder="(11) 99999-9999" {...campo('telefone')} /></label>
      <label>{t('E-mail')}<input type="email" placeholder={t('contato@fornecedor.com')} {...campo('email')} /></label>
      <label style={{ flex: '1 1 100%' }}>{t('Observações')}<input placeholder={t('Prazo de entrega, pedido mínimo, forma de pagamento...')} {...campo('obs')} /></label>
      <div className="bloco-marcas">
        <span className="rotulo-campo">{t('Marcas que ele trabalha')}</span>
        <EditorMarcas marcas={form.marcas} onChange={(marcas) => setForm({ ...form, marcas })} emUso={emUso} />
      </div>
    </>
  )
}

export default function Fornecedores({ db, executar }) {
  const [form, setForm] = useState(fornecedorVazio)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(null) // id do fornecedor com a página aberta

  const fornAberto = db.fornecedores.find((f) => f.id === aberto)
  if (fornAberto) return <FornecedorDetalhe db={db} executar={executar} forn={fornAberto} voltar={() => setAberto(null)} />

  async function salvar(e) {
    e.preventDefault()
    const o = doFormulario(form)
    if (await executar((A) => A.salvarFornecedor(o))) {
      setForm(fornecedorVazio)
      setAberto(o.id) // abre a página do fornecedor para cadastrar os produtos
    }
  }

  const b = norm(busca)
  const lista = db.fornecedores
    .filter((f) => !b || norm([f.nome, f.cidade, f.uf, ...f.marcas].join(' ')).includes(b))
    .sort((a, c) => a.nome.localeCompare(c.nome))

  return (
    <section>
      <h2>{t('Fornecedores')}</h2>
      <form onSubmit={salvar}>
        <CamposFornecedor form={form} setForm={setForm} />
        <button type="submit">{t('Cadastrar fornecedor')}</button>
        <button type="button" className="sec" onClick={() => setForm(fornecedorVazio)}>{t('Limpar')}</button>
      </form>

      <input className="busca" placeholder={t('Buscar por nome, cidade ou marca...')} value={busca} onChange={(e) => setBusca(e.target.value)} />

      {lista.length === 0 && <p className="vazio">{t('Nenhum fornecedor cadastrado.')}</p>}
      <div className="lista-forn">
        {lista.map((f) => {
          const qtd = db.precosForn.filter((p) => p.fornecedorId === f.id).length
          return (
            <button key={f.id} className="card-forn" onClick={() => setAberto(f.id)}>
              <div className="card-forn-topo">
                <b>{f.nome}</b>
                <span className="contador">{qtd === 1 ? t('1 produto') : t('{n} produtos', { n: qtd })}</span>
              </div>
              <small>{origem(f) || t('Origem não informada')}{(f.telefone || f.contato) ? ` · ${f.telefone || f.contato}` : ''}</small>
              <div>{f.marcas.map((m) => <span key={m} className="tag">{m}</span>)}</div>
            </button>
          )
        })}
      </div>

      {/* produtos e preço de venda (era a aba "Tabela de Venda") */}
      <PrecosVenda db={db} executar={executar} embutido />
    </section>
  )
}
