import { useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { podeFazer } from '../armazenamento.js'
import { brl, formatarCPF, lerCPF, norm, resumoCliente, soDigitos, uid } from '../utils.js'
import { useCelular } from '../useCelular.js'

// Clientes: só o cadastro (nome, CPF, WhatsApp e observação).
// O que cada um deve fica na aba Cobranças.
const vazio = { id: '', nome: '', cpf: '', telefone: '', obs: '' }

function linkWhats(telefone) {
  let n = String(telefone || '').replace(/\D/g, '')
  if (!n) return null
  if (n.length <= 11) n = '55' + n
  return `https://wa.me/${n}`
}

// Aviso ao escolher o cliente num fiado ou empréstimo novo
export function AvisoCliente({ db, clienteId }) {
  const r = resumoCliente(db, clienteId, podeFazer('emprestimo.salvo'))
  if (r.atrasado > 0) return <div className="aviso-cliente bad">⚠ {t('Este cliente tem {valor} atrasado ({n} parcela(s)).', { valor: brl(r.atrasado), n: r.nAtrasadas })}{r.naoPago > 0 ? ' ' + t('E já deixou de pagar {valor}.', { valor: brl(r.naoPago) }) : ''}</div>
  if (r.naoPago > 0) return <div className="aviso-cliente bad">⚠ {t('Este cliente já deixou de pagar {valor}.', { valor: brl(r.naoPago) })}</div>
  if (r.aberto > 0) return <div className="aviso-cliente warn">{t('Este cliente já tem {valor} em aberto (em dia).', { valor: brl(r.aberto) })}</div>
  return null
}

export default function Clientes({ db, executar }) {
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('az') // 'az' ou 'recentes'
  const [form, setForm] = useState(vazio)
  const [abrirForm, setAbrirForm] = useState(false) // formulário aparece ao tocar em "Novo cliente" ou "Editar"
  const celular = useCelular()
  const clientes = db.clientes || []
  const fecharForm = () => { setForm(vazio); setAbrirForm(false) }
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  async function salvar(e) {
    e.preventDefault()
    const nome = form.nome.trim()
    if (!nome) return aviso.alerta(t('Informe o nome do cliente.'))
    const cpf = lerCPF(form.cpf)
    if (cpf.erro) return aviso.alerta(cpf.erro)
    const mesmoCpf = cpf && clientes.find((c) => c.id !== form.id && soDigitos(c.cpf) === soDigitos(cpf))
    if (mesmoCpf) return aviso.alerta(t('Este CPF já é do cliente {nome}.', { nome: mesmoCpf.nome }))
    if (clientes.some((c) => c.id !== form.id && norm(c.nome) === norm(nome))) return aviso.alerta(t('Já existe um cliente com esse nome.'))
    const c = { id: form.id || uid(), nome, cpf, telefone: form.telefone.trim(), obs: form.obs.trim() }
    if (await executar((A) => A.atualizarCliente(c), form.id ? t('Cliente atualizado.') : t('Cliente cadastrado.'))) fecharForm()
  }
  function editar(c) {
    setForm({ id: c.id, nome: c.nome || '', cpf: c.cpf || '', telefone: c.telefone || '', obs: c.obs || '' })
    setAbrirForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function excluir(c) {
    if (await confirmar(t('Excluir o cliente {nome}?\nAs vendas e empréstimos dele continuam registrados com o nome.', { nome: c.nome }), { perigo: true })) {
      executar((A) => A.excluirCliente(c.id), t('Cliente excluído.')).then((ok) => { if (ok && form.id === c.id) fecharForm() })
    }
  }

  const b = norm(busca)
  const lista = clientes
    .map((c, i) => ({ ...c, _i: i }))
    .filter((c) => !b || norm(c.nome).includes(b) || norm(c.telefone).includes(b) || (soDigitos(b) && soDigitos(c.cpf).includes(soDigitos(b))))
    .sort((x, y) => (ordem === 'recentes' ? y._i - x._i : x.nome.localeCompare(y.nome)))

  return (
    <section className="tela-registro">
      <h2>{t('Clientes')}</h2>

      {!abrirForm && <div className="pag-acoes"><button className="botao-novo" onClick={() => setAbrirForm(true)}>+ {t('Novo cliente')}</button></div>}
      {abrirForm && <>
      <div className="linha-titulo"><h3>{form.id ? t('Editando {nome}', { nome: form.nome }) : t('Novo cliente')}</h3></div>
      <form onSubmit={salvar} className={form.id ? 'form-edicao' : ''}>
        <label style={{ flex: '2 1 220px' }}>{t('Nome')} *<input required maxLength={60} {...campo('nome')} /></label>
        <label style={{ flex: '1 1 160px' }}>{t('CPF')}<input inputMode="numeric" maxLength={14} placeholder="000.000.000-00" {...campo('cpf')} onBlur={() => setForm((f) => ({ ...f, cpf: formatarCPF(f.cpf) }))} /></label>
        <label style={{ flex: '1 1 180px' }}>{t('Telefone / WhatsApp')}<input inputMode="tel" maxLength={20} placeholder="(11) 99999-9999" {...campo('telefone')} /></label>
        <label style={{ flex: '2 1 240px' }}>{t('Observação')}<input maxLength={120} placeholder={t('Ex: endereço, indicação, limite combinado...')} {...campo('obs')} /></label>
        <button type="submit">{form.id ? t('Salvar alterações') : t('Cadastrar')}</button>
        <button type="button" className="sec" onClick={fecharForm}>{t('Cancelar')}</button>
      </form>
      </>}

      <div className="dia-topo"><h3>{t('Cadastrados ({n})', { n: clientes.length })}</h3></div>
      <div className="cb-busca">
        <input className="busca" placeholder={t('Buscar nome, CPF ou telefone...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="an-pilulas">
          <button className={ordem === 'az' ? 'on' : ''} onClick={() => setOrdem('az')}>{t('A–Z')}</button>
          <button className={ordem === 'recentes' ? 'on' : ''} onClick={() => setOrdem('recentes')}>{t('Mais recentes')}</button>
        </div>
      </div>
      {celular ? (
        // no celular: cada cliente é um cartão
        <div className="cb-lista">
          {lista.length === 0 && <div className="cb-vazio">{clientes.length ? t('Nenhum cliente encontrado.') : t('Nenhum cliente ainda. Toque em "Novo cliente", ou cadastre ao fazer uma venda fiado ou um empréstimo.')}</div>}
          {lista.map((c) => {
            const whats = linkWhats(c.telefone)
            return (
              <div key={c.id} className="cb-item">
                <div className="cb-topo">
                  <span className="cb-avatar">{(c.nome || '?').trim()[0]?.toUpperCase()}</span>
                  <span className="cb-quem">
                    <b>{c.nome}</b>
                    <small>{[c.telefone, c.cpf].filter(Boolean).join(' · ') || t('Sem telefone e CPF')}</small>
                  </span>
                </div>
                {c.obs && <small className="cb-detalhe">{c.obs}</small>}
                <div className="cb-rodape vd-rodape">
                  {whats && <a className="link pequeno" href={whats} target="_blank" rel="noreferrer">WhatsApp</a>}
                  <button className="link pequeno" onClick={() => editar(c)}>{t('Editar')}</button>
                  <button className="link pequeno bad" onClick={() => excluir(c)}>{t('Excluir')}</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
      <div className="tw">
        <table>
          <thead><tr><th>{t('Nome')}</th><th>{t('CPF')}</th><th>{t('Telefone / WhatsApp')}</th><th>{t('Observação')}</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="5" className="vazio">{clientes.length ? t('Nenhum cliente encontrado.') : t('Nenhum cliente ainda. Toque em "Novo cliente", ou cadastre ao fazer uma venda fiado ou um empréstimo.')}</td></tr>}
            {lista.map((c) => {
              const whats = linkWhats(c.telefone)
              return (
                <tr key={c.id} className={form.id === c.id ? 'em-edicao' : ''}>
                  <td>{c.nome}</td>
                  <td>{c.cpf || '-'}</td>
                  <td>{c.telefone || '-'}</td>
                  <td className="quebra">{c.obs || '-'}</td>
                  <td className="n acoes-fiado">
                    {whats && <><a className="botao-whats" href={whats} target="_blank" rel="noreferrer">WhatsApp</a>{' '}</>}
                    <button className="edit" onClick={() => editar(c)}>{t('Editar')}</button>{' '}
                    <button className="del" onClick={() => excluir(c)}>{t('Excluir')}</button>
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
