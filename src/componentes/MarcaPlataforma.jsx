import { useEffect, useState } from 'react'
import * as Org from '../organizacoes.js'
import { t } from '../i18n.js'
import { LOGO_PADRAO_CLARO, LOGO_PADRAO_ESCURO, NOME_APP } from '../marca.js'
import { corTextoSobre, hexValido } from '../utils.js'

const COR_PADRAO = '#5b8def'
const COR_PADRAO_CLARO = '#3867d6'
const LIMITE_LOGO = 512 * 1024
const VAZIA = { nome: '', cor: '', corEscuro: '', logo: '', logoEscuro: '', tema: '' }
const TEMAS = [
  { id: '', nome: 'Escuro (padrão do sistema)' },
  { id: 'claro', nome: 'Claro' },
  { id: 'auto', nome: 'Automático (igual ao aparelho)' },
]

// Painel → Marca: nome, cores, logos e tema da PLATAFORMA. Vale na tela de login e em toda loja
// que não tem marca própria (cada loja pode ter a sua em Configurações → Marca).
export default function MarcaPlataforma({ onSalvou }) {
  const [atual, setAtual] = useState(null)
  const [form, setForm] = useState(VAZIA)
  const [erroLogo, setErroLogo] = useState({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    Org.marcaPlataforma().then((m) => { const v = { ...VAZIA, ...m }; setAtual(v); setForm(v) })
  }, [])
  if (!atual) return <p className="vazio">{t('Carregando...')}</p>

  const mudou = JSON.stringify(form) !== JSON.stringify(atual)
  const corOk = (!form.cor || hexValido(form.cor)) && (!form.corEscuro || hexValido(form.corEscuro))
  const corClaro = hexValido(form.cor) ? form.cor : COR_PADRAO_CLARO
  const corEsc = hexValido(form.corEscuro) ? form.corEscuro : hexValido(form.cor) ? form.cor : COR_PADRAO
  const nome = form.nome.trim() || NOME_APP

  function escolherLogo(campo, e) {
    const file = e.target.files[0]
    e.target.value = ''
    setErroLogo((er) => ({ ...er, [campo]: '' }))
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setErroLogo((er) => ({ ...er, [campo]: t('Use um arquivo PNG ou JPG.') }))
    if (file.size > LIMITE_LOGO) return setErroLogo((er) => ({ ...er, [campo]: t('O arquivo passa de 512 KB.') }))
    const r = new FileReader()
    r.onload = () => setForm((f) => ({ ...f, [campo]: r.result }))
    r.readAsDataURL(file)
  }

  async function salvar(e) {
    e.preventDefault()
    if (!corOk) return
    setSalvando(true)
    try {
      const m = { ...form, nome: form.nome.trim(), cor: form.cor.toLowerCase(), corEscuro: form.corEscuro.toLowerCase() }
      await Org.salvarMarca(m)
      setAtual(m); setForm(m)
      onSalvou?.(m)
      alert(t('Marca salva.'))
    } catch (er) { alert(er.message) } finally { setSalvando(false) }
  }

  const CampoLogo = ({ campo, titulo, dica }) => (
    <div className="largo campo-arquivo">
      <span className="rotulo-campo">{titulo}</span>
      <div className="cor-linha">
        <label className="botao-arquivo">{t('Escolher arquivo')}<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => escolherLogo(campo, e)} /></label>
        {form[campo] && <img className="logo-img" src={form[campo]} alt="" />}
        <small>{form[campo] ? t('Logo escolhido') : t('Nenhum arquivo escolhido')}</small>
        {form[campo] && <button type="button" className="sec" onClick={() => setForm({ ...form, [campo]: '' })}>{t('Remover logo')}</button>}
      </div>
      <small className={erroLogo[campo] ? 'bad' : ''}>{erroLogo[campo] || dica}</small>
    </div>
  )
  const Previa = ({ tema, logo, cor }) => (
    <div className={'previa-marca previa-' + tema}>
      <small>{tema === 'claro' ? t('Tema claro') : t('Tema escuro')}</small>
      <div className="logo">
        {logo ? <><img className="logo-img" src={logo} alt="" /><span>{nome}</span></>
          : <><img className="logo-padrao" src={tema === 'claro' ? LOGO_PADRAO_CLARO : LOGO_PADRAO_ESCURO} alt="" />{form.nome.trim() && <span>{form.nome.trim()}</span>}</>}
      </div>
      <span className="item ativo previa-item" style={{ background: cor, color: corTextoSobre(cor) }}>{t('Item selecionado')}</span>
    </div>
  )

  return (
    <section>
      <p className="subtitulo-tela">{t('Nome, cores, logos e tema da plataforma. Valem na tela de entrada e em toda loja que não tem marca própria.')}</p>
      <form onSubmit={salvar} className="form-config">
        <label className="largo">{t('Nome do sistema')}
          <input placeholder={NOME_APP} maxLength={40} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <small>{t('Aparece no título da aba do navegador e no menu. Deixe em branco para usar "{nome}".', { nome: NOME_APP })}</small>
        </label>

        <label className="largo">{t('Cor da marca')}
          <div className="cor-linha">
            <input type="color" value={corClaro} onChange={(e) => setForm({ ...form, cor: e.target.value })} />
            <input className="hex" placeholder={COR_PADRAO_CLARO} maxLength={7} value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value.trim() })} />
            {form.cor && <button type="button" className="sec" onClick={() => setForm({ ...form, cor: '' })}>{t('Usar a padrão')}</button>}
          </div>
          <small className={!form.cor || hexValido(form.cor) ? '' : 'bad'}>{!form.cor || hexValido(form.cor) ? t('Deixe em branco para voltar à cor padrão do sistema.') : t('Use o formato #rrggbb, por exemplo #7a5cd6.')}</small>
        </label>

        <label className="largo">{t('Cor da marca no tema escuro (opcional)')}
          <div className="cor-linha">
            <input type="color" value={corEsc} onChange={(e) => setForm({ ...form, corEscuro: e.target.value })} />
            <input className="hex" placeholder={hexValido(form.cor) ? form.cor : COR_PADRAO} maxLength={7} value={form.corEscuro} onChange={(e) => setForm({ ...form, corEscuro: e.target.value.trim() })} />
            {form.corEscuro && <button type="button" className="sec" onClick={() => setForm({ ...form, corEscuro: '' })}>{t('Usar a de cima')}</button>}
          </div>
          <small className={!form.corEscuro || hexValido(form.corEscuro) ? '' : 'bad'}>{!form.corEscuro || hexValido(form.corEscuro) ? t('Deixe em branco para os dois temas usarem a cor acima.') : t('Use o formato #rrggbb, por exemplo #7a5cd6.')}</small>
        </label>

        {CampoLogo({ campo: 'logo', titulo: t('Logo do tema claro'), dica: t('PNG ou JPG, até 512 KB. Sem logo, aparece o logo padrão do PJ GERENT.') })}
        {CampoLogo({ campo: 'logoEscuro', titulo: t('Logo do tema escuro'), dica: t('Use uma versão legível sobre fundo escuro. Sem ela, o tema escuro usa o logo do tema claro. PNG ou JPG, até 512 KB.') })}

        <label className="largo">{t('Tema da plataforma')}
          <select value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })}>
            {TEMAS.map((x) => <option key={x.id} value={x.id}>{t(x.nome)}</option>)}
          </select>
          <small>{t('Tema de quem ainda não escolheu um no próprio Perfil, e da tela de entrada.')}</small>
        </label>

        <div className="largo">
          <span className="rotulo-campo">{t('Assim ele aparece no menu:')}</span>
          <div className="previas">
            {Previa({ tema: 'claro', logo: form.logo, cor: corClaro })}
            {Previa({ tema: 'escuro', logo: form.logoEscuro || form.logo, cor: corEsc })}
          </div>
        </div>

        <div className="painel largo">
          <h3 style={{ marginBottom: 8 }}>{t('O que isto não muda')}</h3>
          <ul className="dicas">
            <li>{t('Lojas com marca própria (Configurações → Marca) continuam com a delas.')}</li>
            <li>{t('O ícone e o nome do app instalado no celular continuam os do PJ GERENT.')}</li>
          </ul>
        </div>

        <div className="acoes-form largo"><button type="submit" disabled={!mudou || !corOk || salvando}>{salvando ? t('Salvando…') : t('Salvar')}</button></div>
      </form>
    </section>
  )
}
