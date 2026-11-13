import { useEffect, useRef, useState } from 'react'
import { IconeBackup, IconeCelular, IconeEscudo, IconePaleta, IconePerfil, IconePredio } from '../icones.jsx'
import { avisar, avisosSuportados, pedirPermissaoAvisos, permissaoAvisos } from '../avisos.js'
import { IDIOMAS, t } from '../i18n.js'
import { LOGO_PADRAO_CLARO, LOGO_PADRAO_ESCURO } from '../marca.js'
import { corTextoSobre, FUSO_PADRAO, hexValido } from '../utils.js'

const COR_PADRAO = '#5b8def' // cor padrão no tema escuro
const COR_PADRAO_CLARO = '#3867d6' // cor padrão no tema claro
const NOME_PADRAO = 'Gerente de Preços'

// Seções da tela de Configurações. Cada cartão abre uma página própria.
const SECOES = [
  {
    titulo: 'Sua conta',
    itens: [
      { id: 'perfil', nome: 'Perfil', desc: 'Seu nome, idioma, tema, fuso horário e avatar.', icone: IconePerfil },
      { id: 'seguranca', nome: 'Segurança', desc: 'Verificação em duas etapas, códigos de recuperação e sessões.', icone: IconeEscudo },
      { id: 'celular', nome: 'App no celular', desc: 'Instale o sistema na tela de início do celular e receba os avisos.', icone: IconeCelular },
    ],
  },
  {
    titulo: 'Empresa',
    itens: [
      { id: 'organizacao', nome: 'Organização', desc: 'Dados da empresa, retenção de dados e encarregado de LGPD.', icone: IconePredio },
      { id: 'marca', nome: 'Marca', desc: 'O nome e a cor que sua empresa mostra dentro do sistema.', icone: IconePaleta },
    ],
  },
  {
    titulo: 'Dados',
    itens: [
      { id: 'backup', nome: 'Cópia de segurança', desc: 'Baixe uma cópia dos dados ou restaure de um arquivo.', icone: IconeBackup },
    ],
  },
]

const TODOS = SECOES.flatMap((s) => s.itens)

export default function Configuracoes({ db, executar, usuario }) {
  const [aberta, setAberta] = useState(null)
  const item = TODOS.find((i) => i.id === aberta)

  if (item) {
    const Pagina = { perfil: Perfil, celular: AppCelular, marca: Marca, backup: Backup }[item.id]
    return (
      <section>
        <h2>{t(item.nome)}</h2>
        <button className="voltar" onClick={() => setAberta(null)}>← {t('Configurações')}</button>
        <div className="config-titulo">
          <h3>{t(item.nome)}</h3>
          <small>{t({ perfil: 'Informações pessoais. O e-mail de acesso ainda não pode ser trocado.', marca: 'O nome e a cor que a sua empresa mostra para quem trabalha aqui dentro.' }[item.id] || item.desc)}</small>
        </div>
        {Pagina
          ? <Pagina db={db} executar={executar} usuario={usuario} />
          : <div className="painel"><p className="vazio">{t('Em construção — o conteúdo desta seção ainda vai ser definido.')}</p></div>}
      </section>
    )
  }

  return (
    <section>
      <h2>{t('Configurações')}</h2>
      {SECOES.map((s) => (
        <div key={s.titulo} className="config-secao">
          <div className="config-secao-titulo">{t(s.titulo)}</div>
          <div className="config-grade">
            {s.itens.map((i) => (
              <button key={i.id} className="config-card" onClick={() => setAberta(i.id)}>
                <span className="config-icone"><i.icone /></span>
                <span>
                  <b>{t(i.nome)}</b>
                  <small>{t(i.desc)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

// ---------- Perfil ----------
const TEMAS = [
  { id: 'escuro', nome: 'Escuro' },
  { id: 'claro', nome: 'Claro' },
  { id: 'auto', nome: 'Automático (igual ao aparelho)' },
]
const FUSOS = [
  'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Belem', 'America/Maceio',
  'America/Araguaina', 'America/Cuiaba', 'America/Campo_Grande', 'America/Manaus', 'America/Porto_Velho',
  'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha',
]

function Perfil({ db, executar, usuario }) {
  const atual = { nome: '', idioma: 'pt-BR', tema: 'escuro', fuso: FUSO_PADRAO, avatar: '', ...db.perfil }
  const [form, setForm] = useState(atual)
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })
  const mudou = JSON.stringify(form) !== JSON.stringify(atual)
  const avatarOk = !form.avatar || /^https:\/\/\S+$/i.test(form.avatar.trim())

  async function salvar(e) {
    e.preventDefault()
    if (!avatarOk) return
    executar((A) => A.salvarPerfil({ ...form, nome: form.nome.trim(), avatar: form.avatar.trim() }))
  }

  return (
    <form onSubmit={salvar} className="form-config">
      <label className="largo">{t('E-mail')}
        <input disabled value={usuario?.email || ''} />
        <small>{t('Trocar e-mail — em breve.')}</small>
      </label>
      <label className="largo">{t('Nome completo')}<input placeholder={t('Seu nome')} maxLength={60} {...campo('nome')} /></label>
      <label>{t('Idioma')}
        <select {...campo('idioma')}>{IDIOMAS.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
      </label>
      <label>{t('Tema')}
        <select {...campo('tema')}>{TEMAS.map((i) => <option key={i.id} value={i.id}>{t(i.nome)}</option>)}</select>
      </label>
      <label className="largo">{t('Fuso horário')}
        <select {...campo('fuso')}>{FUSOS.map((f) => <option key={f}>{f}</option>)}</select>
      </label>
      <label className="largo">{t('Avatar URL')}
        <div className="avatar-linha">
          {form.avatar && avatarOk && <img className="avatar" src={form.avatar} alt="" />}
          <input placeholder="https://..." {...campo('avatar')} />
        </div>
        <small className={avatarOk ? '' : 'bad'}>{avatarOk ? t('Upload de arquivo — em breve. Cole uma URL pública (https).') : t('Use um endereço que comece com https://')}</small>
      </label>
      <div className="acoes-form"><button type="submit" disabled={!mudou || !avatarOk}>{t('Salvar')}</button></div>
    </form>
  )
}

// ---------- App no celular ----------
function AppCelular({ db, executar }) {
  const [convite, setConvite] = useState(() => window.__conviteInstalacao || null)
  const [permissao, setPermissao] = useState(permissaoAvisos())
  const instalado = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const avisosEstoque = db.config?.avisosEstoque !== false

  useEffect(() => {
    const atualizar = () => setConvite(window.__conviteInstalacao || null)
    window.addEventListener('instalacao-disponivel', atualizar)
    return () => window.removeEventListener('instalacao-disponivel', atualizar)
  }, [])

  async function instalar() {
    if (!convite) return
    convite.prompt()
    await convite.userChoice
    window.__conviteInstalacao = null
    setConvite(null)
  }

  async function ligarAvisos() {
    const p = await pedirPermissaoAvisos()
    setPermissao(p)
    if (p === 'granted') avisar(t('Avisos ligados'), t('Você vai receber os avisos do sistema neste aparelho.'))
  }

  return (
    <>
      <div className="painel">
        <p><b>{t('Instale o app para abrir pelo ícone e receber os avisos.')}</b></p>
        {instalado ? (
          <p className="ok">✓ {t('O app já está instalado neste aparelho.')}</p>
        ) : convite ? (
          <button onClick={instalar}>{t('Instalar app')}</button>
        ) : (
          <div className="instrucoes">
            <button disabled>{t('Instalar app')}</button>
            <small>
              {ios
                ? t('No iPhone: abra no Safari, toque em Compartilhar (□↑) e depois em "Adicionar à Tela de Início".')
                : t('Se o botão não liberar: no menu do navegador (⋮), toque em "Instalar app" ou "Adicionar à tela inicial". A instalação funciona no endereço publicado (https), por exemplo na Vercel.')}
            </small>
          </div>
        )}
      </div>

      <div className="painel">
        <p><b>{t('Notificações')}</b></p>
        {permissao === 'indisponivel' && <p><small>{t('Este navegador não suporta avisos.')}{ios ? ' ' + t('No iPhone, instale o app na Tela de Início primeiro.') : ''}</small></p>}
        {permissao === 'default' && <button className="link" onClick={ligarAvisos}>{t('Ligar os avisos em Notificações')}</button>}
        {permissao === 'denied' && <p><small className="bad">{t('Os avisos foram bloqueados. Libere nas permissões do site, no navegador.')}</small></p>}
        {permissao === 'granted' && (
          <>
            <p className="ok">✓ {t('Avisos ligados neste aparelho.')}</p>
            <label className="check">
              <input type="checkbox" checked={avisosEstoque}
                onChange={(e) => executar((A) => A.salvarConfig({ ...db.config, avisosEstoque: e.target.checked }))} />
              {t('Avisar quando um produto do estoque ficar com 2 unidades ou menos')}
            </label>
            <div style={{ marginTop: 12 }}>
              <button className="sec" onClick={() => avisar(t('Teste de aviso'), t('Os avisos estão funcionando.'))}>{t('Enviar aviso de teste')}</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ---------- Marca ----------
const LIMITE_LOGO = 512 * 1024

function Marca({ db, executar }) {
  const atual = { nomeLoja: db.config?.nomeLoja || '', cor: db.config?.cor || '', corEscuro: db.config?.corEscuro || '', logo: db.config?.logo || '', logoEscuro: db.config?.logoEscuro || '' }
  const [form, setForm] = useState(atual)
  const [erroLogo, setErroLogo] = useState({}) // erro por campo: { logo, logoEscuro }
  const mudou = JSON.stringify(form) !== JSON.stringify(atual)
  const corOk = (!form.cor || hexValido(form.cor)) && (!form.corEscuro || hexValido(form.corEscuro))
  const corClaro = hexValido(form.cor) ? form.cor : COR_PADRAO_CLARO
  const corEsc = hexValido(form.corEscuro) ? form.corEscuro : hexValido(form.cor) ? form.cor : COR_PADRAO

  // campo = 'logo' (tema claro) ou 'logoEscuro' (tema escuro)
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

  // Campo de arquivo de logo (usado para o claro e para o escuro)
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

  // Prévia do menu num tema (cores fixas do tema, independente do tema aberto agora)
  const Previa = ({ tema, logo, cor }) => (
    <div className={'previa-marca previa-' + tema}>
      <small>{tema === 'claro' ? t('Tema claro') : t('Tema escuro')}</small>
      <div className="logo">
        {logo ? (
          <>
            <img className="logo-img" src={logo} alt="" />
            <span>{form.nomeLoja.trim() || t(NOME_PADRAO)}</span>
          </>
        ) : (
          <>
            {/* sem logo próprio: aparece o logo padrão do sistema */}
            <img className="logo-padrao" src={tema === 'claro' ? LOGO_PADRAO_CLARO : LOGO_PADRAO_ESCURO} alt="" />
            {form.nomeLoja.trim() && <span>{form.nomeLoja.trim()}</span>}
          </>
        )}
      </div>
      <span className="item ativo previa-item" style={{ background: cor, color: corTextoSobre(cor) }}>{t('Item selecionado')}</span>
    </div>
  )

  async function salvar(e) {
    e.preventDefault()
    if (!corOk) return
    executar((A) => A.salvarConfig({ ...db.config, nomeLoja: form.nomeLoja.trim(), cor: form.cor.toLowerCase(), corEscuro: form.corEscuro.toLowerCase(), logo: form.logo, logoEscuro: form.logoEscuro }))
  }

  return (
    <form onSubmit={salvar} className="form-config">
      <h3 className="largo">{t('Como sua empresa aparece')}</h3>

      <label className="largo">{t('Nome da sua empresa')}
        <input placeholder={t(NOME_PADRAO)} maxLength={40} value={form.nomeLoja} onChange={(e) => setForm({ ...form, nomeLoja: e.target.value })} />
        <small>{t('Aparece no menu lateral e no título da aba do navegador. Deixe em branco para usar "{nome}".', { nome: t(NOME_PADRAO) })}</small>
      </label>

      <label className="largo">{t('Cor da sua marca')}
        <div className="cor-linha">
          <input type="color" value={corClaro} onChange={(e) => setForm({ ...form, cor: e.target.value })} />
          <input className="hex" placeholder={COR_PADRAO_CLARO} maxLength={7} value={form.cor}
            onChange={(e) => setForm({ ...form, cor: e.target.value.trim() })} />
          {form.cor && <button type="button" className="sec" onClick={() => setForm({ ...form, cor: '' })}>{t('Usar a padrão')}</button>}
        </div>
        <small className={!form.cor || hexValido(form.cor) ? '' : 'bad'}>{!form.cor || hexValido(form.cor) ? t('Usada nos botões, no item ativo do menu e nos gráficos. Deixe em branco para a cor padrão.') : t('Use o formato #rrggbb, por exemplo #7a5cd6.')}</small>
      </label>

      <label className="largo">{t('Cor da sua marca no tema escuro (opcional)')}
        <div className="cor-linha">
          <input type="color" value={corEsc} onChange={(e) => setForm({ ...form, corEscuro: e.target.value })} />
          <input className="hex" placeholder={hexValido(form.cor) ? form.cor : COR_PADRAO} maxLength={7} value={form.corEscuro}
            onChange={(e) => setForm({ ...form, corEscuro: e.target.value.trim() })} />
          {form.corEscuro && <button type="button" className="sec" onClick={() => setForm({ ...form, corEscuro: '' })}>{t('Usar a de cima')}</button>}
        </div>
        <small className={!form.corEscuro || hexValido(form.corEscuro) ? '' : 'bad'}>{!form.corEscuro || hexValido(form.corEscuro) ? t('Deixe em branco para os dois temas usarem a cor acima.') : t('Use o formato #rrggbb, por exemplo #7a5cd6.')}</small>
      </label>

      {CampoLogo({ campo: 'logo', titulo: t('Logo do tema claro'), dica: t('PNG ou JPG, até 512 KB. Prefira fundo transparente. SVG não é aceito por segurança. Sem logo próprio, aparece o logo padrão do sistema.') })}
      {CampoLogo({ campo: 'logoEscuro', titulo: t('Logo do tema escuro'), dica: t('Use uma versão legível sobre fundo escuro. Sem ela, o tema escuro usa o logo do tema claro. PNG ou JPG, até 512 KB.') })}

      <div className="largo">
        <span className="rotulo-campo">{t('Assim ele aparece no menu:')}</span>
        <div className="previas">
          {Previa({ tema: 'claro', logo: form.logo, cor: corClaro })}
          {Previa({ tema: 'escuro', logo: form.logoEscuro || form.logo, cor: corEsc })}
        </div>
      </div>

      <div className="painel largo">
        <h3 style={{ marginBottom: 8 }}>{t('O que isto ainda não muda')}</h3>
        <ul className="dicas">
          <li>{t('O ícone do app instalado no celular continua o padrão do sistema.')}</li>
          <li>{t('Enquanto os dados ficam só neste navegador, nome, cor e logo valem só aqui. Em outro aparelho, use a Cópia de segurança para levar tudo.')}</li>
        </ul>
      </div>

      <div className="acoes-form largo"><button type="submit" disabled={!mudou || !corOk}>{t('Salvar')}</button></div>
    </form>
  )
}

// ---------- Cópia de segurança ----------
function Backup({ db, executar }) {
  const inputImport = useRef(null)

  function exportar() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }))
    a.download = 'backup-precos-' + new Date().toISOString().slice(0, 10) + '.json'
    a.click()
  }

  function importar(e) {
    const file = e.target.files[0]
    if (!file) return
    const r = new FileReader()
    r.onload = async () => {
      try {
        const d = JSON.parse(r.result)
        if (!d.fornecedores || !d.precosForn) throw new Error()
        if (!confirm(t('Isso vai substituir todos os dados atuais pelos do arquivo. Continuar?'))) return
        if (await executar((A) => A.substituirTudo(d))) alert(t('Backup restaurado!'))
      } catch {
        alert(t('Arquivo de backup inválido.'))
      } finally {
        e.target.value = ''
      }
    }
    r.readAsText(file)
  }

  return (
    <div className="painel">
      <p><small>
        {t('Os dados do app ficam guardados só neste navegador. Baixe uma cópia de vez em quando para não perder nada se os dados do navegador forem apagados, ou para levar tudo para outro computador.')}
      </small></p>
      <div className="botoes">
        <button onClick={exportar}>{t('Baixar cópia dos dados')}</button>
        <button className="sec" onClick={() => inputImport.current.click()}>{t('Restaurar de um arquivo')}</button>
        <input ref={inputImport} type="file" accept=".json" hidden onChange={importar} />
      </div>
    </div>
  )
}
