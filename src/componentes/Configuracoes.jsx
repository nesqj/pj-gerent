import { useEffect, useRef, useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import CobrancaLoja from './CobrancaLoja.jsx'
import { ListaAuditoria } from './ListaAuditoria.jsx'
import * as Org from '../organizacoes.js'
import { IconeBackup, IconeCelular, IconeCobranca, IconeDireita, IconeEscudo, IconePaleta, IconePerfil, IconePredio, IconeVoltar } from '../icones.jsx'
import { Avatar } from './MinhaConta.jsx'
import EditarFoto from './EditarFoto.jsx'
import { avisar, pedirPermissaoAvisos, permissaoAvisos } from '../avisos.js'
import { IDIOMAS, t } from '../i18n.js'
import { FUSO_PADRAO } from '../utils.js'

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
      { id: 'organizacao', nome: 'Organização', desc: 'A loja e a atividade recente.', icone: IconePredio },
      { id: 'marca', nome: 'Marca', desc: 'A logo da sua marca, para o catálogo.', icone: IconePaleta },
      { id: 'cobranca', nome: 'Plano e cobrança', desc: 'Seu plano, a situação do pagamento, faturas e troca de plano.', icone: IconeCobranca },
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

export default function Configuracoes({ db, executar, usuario, loja, adminPlataforma }) {
  // a faixa de cobrança do topo pode pedir para abrir direto em "Plano e cobrança"
  const [aberta, setAberta] = useState(() => {
    try { const a = sessionStorage.getItem('abrir-config'); sessionStorage.removeItem('abrir-config'); return a } catch { return null }
  })
  const item = TODOS.find((i) => i.id === aberta)

  if (item) {
    const Pagina = { perfil: Perfil, celular: AppCelular, organizacao: Organizacao, marca: Marca, cobranca: PlanoCobranca, backup: Backup }[item.id]
    return (
      <section className="config-sub">
        <h2>{t(item.nome)}</h2>
        <button className="voltar-conta" onClick={() => setAberta(null)}><IconeVoltar /><span>{t('Configurações')}</span></button>
        <div className="config-titulo">
          <h3>{t(item.nome)}</h3>
          <small>{t({ perfil: 'Informações pessoais. O e-mail de acesso ainda não pode ser trocado.', marca: 'A logo da sua marca. Ela vai aparecer no catálogo da sua loja.' }[item.id] || item.desc)}</small>
        </div>
        {Pagina
          ? <Pagina db={db} executar={executar} usuario={usuario} loja={loja} adminPlataforma={adminPlataforma} />
          : <div className="painel"><p className="vazio">{t('Em construção — o conteúdo desta seção ainda vai ser definido.')}</p></div>}
      </section>
    )
  }

  // lista simples: ícone, nome e seta; cada grupo separado por uma linha
  const nome = db?.perfil?.nome || usuario?.email || ''
  return (
    <section className="config-lista">
      <h2>{t('Configurações')}</h2>
      <button className="cl-usuario" onClick={() => setAberta('perfil')}>
        <Avatar perfil={db?.perfil} nome={nome} />
        <span><b>{nome}</b>{usuario?.email && usuario.email !== nome && <small>{usuario.email}</small>}</span>
      </button>
      {SECOES.map((s) => {
        const itens = s.itens.filter((i) => (i.id !== 'marca' || adminPlataforma || ['admin', 'gerente'].includes(loja?.papel)) &&
          (i.id !== 'cobranca' || (loja?.papel === 'admin' && loja?.cobranca && loja.cobranca !== 'isenta')))
        if (!itens.length) return null
        return (
          <div key={s.titulo} className="cl-grupo">
            {itens.map((i) => (
              <button key={i.id} className="cl-item" onClick={() => setAberta(i.id)}>
                <i.icone /><span>{t(i.nome)}</span><IconeDireita />
              </button>
            ))}
          </div>
        )
      })}
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
  const semFoto = ({ avatar, ...resto }) => resto
  const mudou = JSON.stringify(semFoto(form)) !== JSON.stringify(semFoto(atual))
  const [editandoFoto, setEditandoFoto] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    // a foto é salva pela telinha "Editar imagem"; aqui mantém a que já está no perfil
    executar((A) => A.salvarPerfil({ ...form, nome: form.nome.trim(), avatar: db.perfil?.avatar || '' }), t('Perfil salvo.'))
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
      <div className="largo foto-config">
        <Avatar perfil={db.perfil} nome={form.nome || usuario?.email} />
        <button type="button" className="sec" onClick={() => setEditandoFoto(true)}>{t('Trocar foto')}</button>
      </div>
      {editandoFoto && <EditarFoto perfil={db.perfil} nome={form.nome || usuario?.email} executar={executar} onFechar={() => setEditandoFoto(false)} />}
      <div className="acoes-form"><button type="submit" disabled={!mudou}>{t('Salvar')}</button></div>
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

// ---------- Organização (a loja e a atividade; cada loja tem um único usuário) ----------
function Organizacao({ loja, adminPlataforma }) {
  const podeGerir = loja?.papel === 'admin' || adminPlataforma
  const [atividade, setAtividade] = useState(null)
  useEffect(() => {
    if (!podeGerir || !loja) return
    Org.auditoria({ org: loja.id, limite: 30 }).then(setAtividade, () => setAtividade([]))
  }, [loja?.id, podeGerir]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!loja) return null

  return (
    <>
      <div className="cards">
        <div className="card"><small>{t('Loja')}</small><b>{loja.nome}</b></div>
      </div>
      {podeGerir && (
        <>
          <div className="linha-titulo"><h3>{t('Atividade recente')}</h3></div>
          {atividade ? <ListaAuditoria eventos={atividade} /> : <p className="vazio">{t('Carregando...')}</p>}
        </>
      )}
    </>
  )
}

// ---------- Plano e cobrança ----------
function PlanoCobranca({ loja }) {
  if (!loja) return null
  return <CobrancaLoja orgId={loja.id} />
}

// ---------- Marca ----------
// Logo: a imagem escolhida é reduzida no próprio aparelho (lado maior até 400 px) e precisa ficar com até 100 KB.
// PNG continua PNG (mantém o fundo transparente); JPG vira JPG mais leve.
const LADO_LOGO = 400
const LIMITE_LOGO = 100 * 1024
async function reduzirLogo(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url })
    const escala = Math.min(1, LADO_LOGO / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * escala))
    c.height = Math.max(1, Math.round(img.naturalHeight * escala))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    if (file.type === 'image/png') return c.toDataURL('image/png')
    let foto = c.toDataURL('image/jpeg', 0.85)
    if (foto.length * 0.75 > LIMITE_LOGO) foto = c.toDataURL('image/jpeg', 0.6)
    return foto
  } finally { URL.revokeObjectURL(url) }
}

function Marca({ db, executar }) {
  const atual = db.config?.logo || ''
  const [logo, setLogo] = useState(atual)
  const [erro, setErro] = useState('')

  async function escolherLogo(e) {
    const file = e.target.files[0]
    e.target.value = ''
    setErro('')
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setErro(t('Use um arquivo PNG ou JPG.'))
    try {
      const reduzida = await reduzirLogo(file)
      if (reduzida.length * 0.75 > LIMITE_LOGO) return setErro(t('Mesmo reduzida, a logo passa de 100 KB. Tente uma imagem mais simples ou em JPG.'))
      setLogo(reduzida)
    } catch {
      setErro(t('Não foi possível usar esta imagem.'))
    }
  }

  function salvar(e) {
    e.preventDefault()
    // guarda só a logo (nome, cores e logo do tema escuro não existem mais)
    const { nomeLoja, cor, corEscuro, logoEscuro, ...resto } = db.config || {}
    executar((A) => A.salvarConfig({ ...resto, logo }), t('Logo salva.'))
  }

  return (
    <form onSubmit={salvar} className="form-config">
      <div className="largo campo-arquivo">
        <span className="rotulo-campo">{t('Logo da sua marca')}</span>
        <div className="logo-marca">
          {logo ? <img src={logo} alt="" /> : <span>{t('Sem logo')}</span>}
        </div>
        <div className="cor-linha">
          <label className="botao-arquivo">{logo ? t('Trocar logo') : t('Escolher logo')}<input type="file" accept="image/png,image/jpeg" hidden onChange={escolherLogo} /></label>
          {logo && <button type="button" className="sec" onClick={() => setLogo('')}>{t('Remover logo')}</button>}
        </div>
        <small className={erro ? 'bad' : ''}>{erro || t('Vai aparecer no catálogo da sua loja. PNG ou JPG, de preferência com fundo transparente. A imagem é reduzida sozinha para ficar leve (até 100 KB).')}</small>
      </div>
      <div className="acoes-form largo"><button type="submit" disabled={logo === atual}>{t('Salvar')}</button></div>
    </form>
  )
}

// ---------- Cópia de segurança ----------
function Backup({ db, executar, loja }) {
  const inputImport = useRef(null)
  const podeRestaurar = loja?.papel === 'admin'

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
        if (!await confirmar(t('Isso vai substituir todos os dados da loja "{loja}" pelos do arquivo, para todas as pessoas da loja. Continuar?', { loja: loja?.nome }))) return
        if (await executar((A) => A.substituirTudo(d))) aviso.ok(t('Backup restaurado!'))
      } catch {
        aviso.erro(t('Arquivo de backup inválido.'))
      } finally {
        e.target.value = ''
      }
    }
    r.readAsText(file)
  }

  return (
    <div className="painel">
      <p><small>
        {t('Os dados desta loja ficam guardados no banco de dados. Baixe uma cópia de vez em quando para ter uma reserva sua, principalmente antes de mudanças grandes.')}
      </small></p>
      <div className="botoes">
        <button onClick={exportar}>{t('Baixar cópia dos dados')}</button>
        {podeRestaurar && <button className="sec" onClick={() => inputImport.current.click()}>{t('Restaurar de um arquivo')}</button>}
        <input ref={inputImport} type="file" accept=".json" hidden onChange={importar} />
      </div>
    </div>
  )
}
