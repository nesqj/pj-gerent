import { useEffect, useRef, useState } from 'react'
import { aviso, confirmar } from './avisos-tela.jsx'
import * as Armazenamento from './armazenamento.js'
import * as Org from './organizacoes.js'
import Fornecedores from './componentes/Fornecedores.jsx'
import Vendas from './componentes/Vendas.jsx'
import Analise from './componentes/Analise.jsx'
import Inicio from './componentes/Inicio.jsx'
import MinhaConta, { Avatar } from './componentes/MinhaConta.jsx'
import Termos from './componentes/Termos.jsx'
import Estoque from './componentes/Estoque.jsx'
import Caixa from './componentes/Caixa.jsx'
import Fiado from './componentes/Fiado.jsx'
import Clientes from './componentes/Clientes.jsx'
import Configuracoes from './componentes/Configuracoes.jsx'
import Ajuda from './componentes/Ajuda.jsx'
import Login from './componentes/Login.jsx'
import Plataforma from './componentes/Plataforma.jsx'
import SeletorLoja from './componentes/SeletorLoja.jsx'
import CobrancaLoja from './componentes/CobrancaLoja.jsx'
import * as Auth from './auth.js'
import { supabaseConfigurado } from './supabase.js'
import { observarTabelas } from './tabelasResponsivas.js'
import { definirIdioma, t } from './i18n.js'
import { corTextoSobre, definirFuso, FUSO_PADRAO, hexValido, hoje } from './utils.js'
import pacote from '../package.json'
import { LOGO_PADRAO_APP, LOGO_PADRAO_CLARO, LOGO_PADRAO_ESCURO, NOME_APP } from './marca.js'
import {
  IconeAjuda, IconeCaixaProduto, IconeCaminhao, IconeCarrinho, IconeChave, IconeConfig,
  IconeEscudo, IconeGrafico, IconeLista, IconeLoja, IconeMenu, IconePainel, IconeRecolher, IconeSair, IconeSeta,
  IconeUsuarios, IconeVoltar, IconePaleta, IconeCobranca, IconeCaixa, IconeFiado, IconeInicio, IconeMais, IconeExtrato,
} from './icones.jsx'

// Falha de conexão (o iPhone mostra "Load failed"; outros navegadores "Failed to fetch"): vale tentar de novo
const TENTATIVAS = 2
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const falhaDeRede = (e) => /load failed|failed to fetch|networkerror|network request failed|verifique a internet/i.test(e?.message || '')
const mensagemDeCarga = (e) => (falhaDeRede(e)
  ? t('Não conseguimos falar com o servidor. Confira a internet e toque em Tentar de novo.')
  : e?.message || t('Não foi possível carregar os dados.'))

// Grupos e itens da barra lateral (dentro de uma loja)
const GRUPOS = [
  {
    nome: 'Operações',
    itens: [
      { id: 'inicio', nome: 'Início', icone: IconeInicio },
      { id: 'vendas', nome: 'Vender', icone: IconeCarrinho },
      { id: 'fiado', nome: 'Cobranças', icone: IconeFiado },
      { id: 'caixa', nome: 'Controle de caixa', icone: IconeCaixa },
      { id: 'analise', nome: 'Análise', icone: IconeGrafico },
    ],
  },
  {
    nome: 'Cadastros',
    itens: [
      { id: 'forn', nome: 'Fornecedores', icone: IconeCaminhao },
      { id: 'estoque', nome: 'Estoque', icone: IconeCaixaProduto },
      { id: 'clientes', nome: 'Clientes', icone: IconeUsuarios },
    ],
  },
]

// Painel "Admin Plataforma" (só administradores da plataforma)
const GRUPOS_ADMIN = [
  {
    nome: 'Operação',
    itens: [
      { id: 'dashboard', nome: 'Dashboard', icone: IconePainel },
      { id: 'auditoria', nome: 'Auditoria', icone: IconeLista },
    ],
  },
  {
    nome: 'Clientes',
    itens: [
      { id: 'orgs', nome: 'Organizações', icone: IconeLoja },
      { id: 'usuarios', nome: 'Usuários', icone: IconeUsuarios },
      { id: 'admins', nome: 'Administradores', icone: IconeEscudo },
      { id: 'uso', nome: 'Uso', icone: IconeGrafico },
    ],
  },
  {
    nome: 'Plataforma',
    itens: [
      { id: 'marca', nome: 'Marca', icone: IconePaleta },
      { id: 'cadastro', nome: 'Cadastro', icone: IconeChave },
      { id: 'cobranca', nome: 'Cobrança', icone: IconeCobranca },
    ],
  },
]

// Itens do rodapé da barra lateral
const RODAPE = [
  { id: 'config', nome: 'Configurações', icone: IconeConfig },
  { id: 'ajuda', nome: 'Ajuda', icone: IconeAjuda },
]

// Abas que o vendedor vê (o banco também confere o que cada papel pode gravar)
const ABAS_DO_VENDEDOR = ['inicio', 'termos', 'vendas', 'fiado', 'clientes', 'estoque', 'forn', 'config', 'ajuda']
const podeVer = (papel, aba) => papel !== 'vendedor' || ABAS_DO_VENDEDOR.includes(aba)

// Barra de baixo no celular: as abas do dia a dia + o botão "Vender" em destaque
const BARRA_BAIXO = [
  { id: 'inicio', nome: 'Início', icone: IconeInicio },
  { id: 'fiado', nome: 'Cobranças', icone: IconeFiado },
  { id: 'caixa', nome: 'Extrato', icone: IconeExtrato },
  { id: 'analise', nome: 'Análise', icone: IconeGrafico },
]

// telas que no celular abrem pela Minha conta (não estão na barra de baixo): ganham o botão de voltar
const ABAS_DA_CONTA = ['estoque', 'forn', 'clientes', 'termos', 'ajuda', 'config']

const chaveLoja = (uid) => 'pjgerent-loja-' + uid

export default function App() {
  const [db, setDb] = useState(null)
  const [aba, setAba] = useState('inicio')
  const [fechados, setFechados] = useState({})       // grupos recolhidos
  const [recolhida, setRecolhida] = useState(false)  // barra lateral só com ícones
  const [menuAberto, setMenuAberto] = useState(false) // menu no celular
  const [contaAberta, setContaAberta] = useState(false) // folha "Minha conta" (toque na foto)
  const [temaAtivo, setTemaAtivo] = useState(document.documentElement.dataset.theme || 'dark')

  // login: undefined = verificando, null = sem sessão, objeto = logado
  const [sessao, setSessao] = useState(undefined)
  const [recuperando, setRecuperando] = useState(false) // abriu o link de "esqueci minha senha"
  const [erroCarga, setErroCarga] = useState('')

  // lojas
  const [lojas, setLojas] = useState([])          // lojas de quem está logado
  const [loja, setLoja] = useState(null)          // loja aberta
  const [adminPlataforma, setAdminPlataforma] = useState(false)
  const admin = useRef(false)
  // 'carregando' | 'loja' | 'admin' (painel da plataforma) | 'semLoja' | 'suspensa'
  const [modo, setModo] = useState('carregando')
  const [telaAdmin, setTelaAdmin] = useState('dashboard')
  const [pedido, setPedido] = useState(null) // pedido de cadastro de quem não tem loja: null | 'pendente' | 'recusado'
  const [marcaPlat, setMarcaPlat] = useState({}) // marca da plataforma (painel → Marca)
  const [faixa, setFaixa] = useState(null)       // aviso de cobrança no topo: { tipo, dias }

  // marca da plataforma: vale já na tela de login
  useEffect(() => { if (supabaseConfigurado) Org.marcaPlataforma().then(setMarcaPlat) }, [])

  // Faixa de cobrança: pagamento em atraso, ou fim do teste grátis chegando (3 dias)
  async function verFaixa(o) {
    setFaixa(null)
    if (o.cobranca === 'atrasada') return setFaixa({ tipo: 'atrasada' })
    if (o.cobranca !== 'teste' || o.papel !== 'admin') return
    try {
      const c = await Org.cobrancaDaOrg(o.id)
      const dias = Math.ceil((new Date(c.teste_ate) - Date.now()) / 86400000)
      if (dias <= 3 && !c.tem_assinatura) setFaixa({ tipo: 'teste', dias: Math.max(dias, 0) })
    } catch { /* sem faixa */ }
  }

  // Abre uma loja: carrega os dados dela e, se estiver vazia, oferece trazer os dados deste navegador
  async function abrirLoja(o, s = sessao, tentativa = 0) {
    setErroCarga('')
    setMenuAberto(false)
    if (o.suspensa && !admin.current) { setLoja(o); setDb(null); setModo('suspensa'); return }
    // bloqueada por falta de pagamento: o administrador da loja vê a cobrança para pagar
    if (['suspensa', 'aguardando'].includes(o.cobranca) && !admin.current) {
      setLoja({ ...o, papel: o.papel || lojas.find((l) => l.id === o.id)?.papel }); setDb(null); setModo('cobranca'); return
    }
    // papel na loja; o administrador da plataforma abrindo loja de outros entra como admin
    const ativa = { ...o, papel: o.papel || lojas.find((l) => l.id === o.id)?.papel || 'admin' }
    try {
      Armazenamento.definirOrg(ativa)
      setLoja(ativa)
      setModo('carregando')
      try { localStorage.setItem(chaveLoja(s.usuario.id), ativa.id) } catch { /* sem acesso */ }
      let d = await Armazenamento.carregar()
      const locais = Armazenamento.contaVazia(d) && Armazenamento.podeFazer('tudo.substituido') && Armazenamento.dadosDoNavegador()
      if (locais && !sessionStorage.getItem('migracao-recusada')) {
        if (await confirmar(t('Encontramos dados salvos neste navegador (da versão sem banco de dados). Enviar esses dados para a loja "{loja}"?', { loja: ativa.nome }))) {
          await Armazenamento.substituirTudo(locais)
          Armazenamento.esquecerDadosDoNavegador()
          d = await Armazenamento.carregar()
          aviso.ok(t('Dados enviados para a loja!'))
        } else sessionStorage.setItem('migracao-recusada', '1')
      }
      // primeiro acesso: usa o nome do cadastro no Perfil, se ainda não tiver
      if (s?.usuario?.nome && !d.perfil?.nome) {
        await Armazenamento.salvarPerfil({ ...d.perfil, nome: s.usuario.nome })
        d = await Armazenamento.carregar()
      }
      setDb(d)
      setAba((a) => (podeVer(ativa.papel, a) ? a : 'inicio'))
      setModo('loja')
      verFaixa(ativa)
    } catch (e) {
      // a conexão caiu por um instante (comum no celular ao voltar para o app): tenta de novo sozinho
      if (falhaDeRede(e) && tentativa < TENTATIVAS) { await esperar(1500 * (tentativa + 1)); return abrirLoja(o, s, tentativa + 1) }
      setErroCarga(mensagemDeCarga(e))
    }
  }

  // Depois do login: entra na plataforma (aceita convites), busca as lojas e abre a última usada
  async function carregarConta(s, tentativa = 0) {
    setErroCarga('')
    setModo('carregando')
    try {
      const info = await Org.entrar()
      admin.current = !!info?.admin
      setPedido(info?.pedido || null)
      setAdminPlataforma(admin.current)
      const lista = await Org.minhasOrgs()
      setLojas(lista)
      let salva = null
      try { salva = localStorage.getItem(chaveLoja(s.usuario.id)) } catch { /* sem acesso */ }
      let alvo = lista.find((o) => o.id === salva) || lista.find((o) => !o.suspensa) || lista[0]
      if (!lista.some((o) => o.id === salva) && salva && admin.current) {
        const g = await Org.buscarOrg(salva).catch(() => null)
        if (g) alvo = { ...g, papel: 'admin' }
      }
      if (new URLSearchParams(window.location.search).get('cobranca') === 'ok') {
        window.history.replaceState(null, '', window.location.pathname)
        aviso.ok(t('Pagamento enviado! A confirmação do provedor chega em instantes; se a loja ainda aparecer bloqueada, toque em "Já paguei, verificar de novo" daqui a pouco.'))
      }
      if (!alvo) { setDb(null); setLoja(null); setModo(admin.current ? 'admin' : 'semLoja'); if (admin.current) setTelaAdmin('orgs'); return }
      await abrirLoja(alvo, s)
    } catch (e) {
      if (falhaDeRede(e) && tentativa < TENTATIVAS) { await esperar(1500 * (tentativa + 1)); return carregarConta(s, tentativa + 1) }
      setErroCarga(mensagemDeCarga(e))
    }
  }

  // Atualiza a lista do seletor (depois de criar/renomear/suspender lojas no painel)
  async function atualizarLojas() {
    try {
      const lista = await Org.minhasOrgs()
      setLojas(lista)
      if (loja) {
        const nova = lista.find((o) => o.id === loja.id) || (admin.current && await Org.buscarOrg(loja.id).catch(() => null))
        if (nova) setLoja((l) => ({ ...l, nome: nova.nome, suspensa: nova.suspensa }))
      }
    } catch { /* a lista volta a ser buscada na próxima entrada */ }
  }

  useEffect(() => {
    if (!supabaseConfigurado) return setSessao(null)
    Auth.obterSessao().then((s) => { setSessao(s); if (s) carregarConta(s) })
    return Auth.aoMudar((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (evento === 'SIGNED_OUT') { Armazenamento.limpar(); setDb(null); setSessao(null); setLoja(null); setLojas([]) }
      if (evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') setSessao(s)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ao voltar para o app (outra aba, celular desbloqueado), busca o que outras pessoas salvaram
  useEffect(() => {
    if (modo !== 'loja') return
    const aoVoltar = async () => {
      if (document.visibilityState !== 'visible') return
      try { if (await Armazenamento.atualizarSeMudou()) setDb(await Armazenamento.carregar()) } catch { /* tenta na próxima */ }
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => { document.removeEventListener('visibilitychange', aoVoltar); window.removeEventListener('focus', aoVoltar) }
  }, [modo])

  function entrou(s) {
    setSessao(s)
    setAba('inicio')
    carregarConta(s)
  }

  async function sairDoSistema() {
    if (!await confirmar(t('Sair do sistema?'))) return
    await Auth.sair()
    Armazenamento.limpar()
    setDb(null)
    setSessao(null)
    setLoja(null)
    setLojas([])
    setMenuAberto(false)
  }

  // tabelas viram cartões no celular (ver tabelasResponsivas.js)
  useEffect(() => observarTabelas(), [])

  // guarda tema e idioma no navegador, para a tela de login já abrir do jeito certo
  useEffect(() => {
    if (!db?.perfil) return
    try { localStorage.setItem('gerenciador-precos-pref', JSON.stringify({ tema: db.perfil.tema, idioma: db.perfil.idioma })) } catch { /* sem acesso */ }
  }, [db?.perfil?.tema, db?.perfil?.idioma])
  const pref = (() => { try { return JSON.parse(localStorage.getItem('gerenciador-precos-pref')) || {} } catch { return {} } })()

  // fuso horário e idioma do Perfil (valem para todas as telas)
  definirFuso(db?.perfil?.fuso || FUSO_PADRAO)
  definirIdioma(db?.perfil?.idioma || pref.idioma || 'pt-BR')

  // tema: escuro (padrão), claro ou automático (segue o aparelho)
  const tema = db?.perfil?.tema || pref.tema || marcaPlat.tema || 'escuro'
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const aplicar = () => {
      const claro = tema === 'claro' || (tema === 'auto' && mq?.matches)
      document.documentElement.dataset.theme = claro ? 'light' : 'dark'
      setTemaAtivo(claro ? 'light' : 'dark')
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', claro ? '#ffffff' : '#0a0a0a')
    }
    aplicar()
    if (tema !== 'auto' || !mq) return
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [tema])

  // marca: a da loja (Configurações → Marca); o que ela não define vem da marca da plataforma (painel → Marca).
  // No painel da plataforma vale só a da plataforma.
  const daLoja = modo === 'loja' ? db?.config || {} : {}
  const escolher = (k) => daLoja[k] || marcaPlat[k] || ''
  const corClaro = hexValido(escolher('cor')) ? escolher('cor') : null
  const corEscuro = hexValido(daLoja.corEscuro) ? daLoja.corEscuro
    : hexValido(daLoja.cor) ? daLoja.cor
      : hexValido(marcaPlat.corEscuro) ? marcaPlat.corEscuro : corClaro
  const cor = temaAtivo === 'light' ? corClaro : corEscuro
  // logo: no tema escuro usa o logo próprio dele; se não tiver, usa o do tema claro
  const logoDe = (m) => (temaAtivo === 'light' ? m.logo : m.logoEscuro || m.logo)
  const logo = logoDe(daLoja) || logoDe(marcaPlat)
  const nomeSistema = marcaPlat.nome?.trim() || NOME_APP
  const nomeProprio = daLoja.nomeLoja?.trim() || (logo ? '' : marcaPlat.nome?.trim())
  const nomeLoja = daLoja.nomeLoja?.trim() || nomeSistema
  useEffect(() => {
    const raiz = document.documentElement.style
    if (cor) { raiz.setProperty('--pri', cor); raiz.setProperty('--pri-txt', corTextoSobre(cor)) }
    else { raiz.removeProperty('--pri'); raiz.removeProperty('--pri-txt') }
  }, [cor])
  useEffect(() => { document.title = modo === 'admin' ? `${nomeSistema} · ${t('Admin Plataforma')}` : nomeLoja }, [nomeLoja, nomeSistema, modo])

  // Executa uma operação de armazenamento e recarrega os dados.
  // msgOk (opcional): aviso de sucesso no canto da tela
  async function executar(fn, msgOk) {
    try {
      await fn(Armazenamento)
      setDb(await Armazenamento.carregar())
      if (msgOk) aviso.ok(msgOk)
      return true
    } catch (e) {
      aviso.erro(e.message || t('Erro ao salvar.'))
      return false
    }
  }

  const [visitaVendas, setVisitaVendas] = useState(0)
  // aba de onde a Minha conta foi aberta (Início, Cobranças...): o voltar das telas da conta reabre a conta por cima dela
  const origemConta = useRef('inicio')
  const [daConta, setDaConta] = useState(false) // a tela atual foi aberta pela Minha conta? (só aí aparece o voltar)
  function irPara(id, pelaConta = false) {
    setMenuAberto(false)
    if (id === 'perfil') {
      if (!ABAS_DA_CONTA.includes(aba)) origemConta.current = aba
      return setContaAberta(true)
    }
    setContaAberta(false)
    setDaConta(pelaConta)
    if (id === 'vendas') setVisitaVendas((n) => n + 1)
    setAba(id)
    window.scrollTo(0, 0)
  }
  // voltar de Estoque, Clientes, Configurações...: volta para a Minha conta, e fechar ela volta para a aba de origem
  function voltarParaConta() {
    setAba(podeVer(papel, origemConta.current) ? origemConta.current : 'inicio')
    setContaAberta(true)
    window.scrollTo(0, 0)
  }
  function irParaAdmin(id) {
    setTelaAdmin(id)
    setModo('admin')
    setMenuAberto(false)
  }

  const papel = loja?.papel
  const noAdmin = modo === 'admin'
  const grupos = noAdmin
    ? GRUPOS_ADMIN
    : GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((i) => podeVer(papel, i.id)) })).filter((g) => g.itens.length)
  const atual = noAdmin ? telaAdmin : aba
  const itemAtual = [...grupos.flatMap((g) => g.itens), ...RODAPE].find((i) => i.id === atual)
  const titulo = itemAtual?.nome || (atual === 'termos' ? 'Termos e políticas' : undefined)
  const grupoAtual = grupos.find((g) => g.itens.some((i) => i.id === atual))?.nome // para o caminho "Operações › Início"
  const tituloT = titulo && t(titulo)
  const perfil = db?.perfil || {}
  const nomeUsuario = perfil.nome || sessao?.usuario?.nome || sessao?.usuario?.email || ''

  const Item = ({ id, nome, icone: Icone }) => (
    <button className={'item' + (atual === id ? ' ativo' : '')} onClick={() => (noAdmin ? irParaAdmin(id) : irPara(id))} title={t(nome)}>
      <Icone />
      <span className="rotulo">{t(nome)}</span>
    </button>
  )

  if (!supabaseConfigurado) {
    return <div className="login-fundo"><div className="login-caixa"><h1>{t('Banco de dados não configurado')}</h1><p className="login-sub">{t('Faltam a URL e a chave do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY).')}</p></div></div>
  }
  if (recuperando) {
    return <Login tema={temaAtivo} logo={logo} modoInicial="novaSenha" onSenhaTrocada={() => { setRecuperando(false); aviso.ok(t('Senha alterada!')) }} />
  }
  if (sessao === undefined) return <p className="vazio">{t('Carregando...')}</p>
  if (!sessao) return <Login tema={temaAtivo} logo={logo} onEntrou={entrou} />

  // Telas de aviso (sem o menu): erro, sem loja, loja suspensa
  const Aviso = ({ titulo: tt, texto, children }) => (
    <div className="login-fundo"><div className="login-caixa">
      <img className="login-logo" src={temaAtivo === 'light' ? LOGO_PADRAO_CLARO : LOGO_PADRAO_ESCURO} alt="" />
      <h1>{tt}</h1>
      <p className="login-sub">{texto}</p>
      {children}
      <div className="login-rodape"><button className="link pequeno" onClick={() => Auth.sair()}>{t('Sair')}</button></div>
    </div></div>
  )
  if (erroCarga) {
    return (
      <Aviso titulo={t('Não foi possível carregar')} texto={erroCarga}>
        <button className="login-botao" onClick={() => carregarConta(sessao)}>{t('Tentar de novo')}</button>
      </Aviso>
    )
  }
  if (modo === 'semLoja' && pedido) {
    return (
      <Aviso titulo={pedido === 'pendente' ? t('Pedido enviado') : t('Pedido recusado')}
        texto={pedido === 'pendente'
          ? t('Sua conta ({email}) foi criada e o pedido da sua loja está aguardando a aprovação do administrador. Quando for aprovado, é só tocar em "Verificar de novo".', { email: sessao.usuario.email })
          : t('O pedido de loja da conta {email} não foi aprovado. Se achar que é engano, fale com o administrador.', { email: sessao.usuario.email })}>
        <button className="login-botao" onClick={() => carregarConta(sessao)}>{t('Verificar de novo')}</button>
      </Aviso>
    )
  }
  if (modo === 'semLoja') {
    return (
      <Aviso titulo={t('Sua conta ainda não tem acesso')} texto={t('Você entrou como {email}, mas ainda não faz parte de nenhuma loja. Peça ao administrador para colocar este e-mail na loja e depois toque em "Verificar de novo".', { email: sessao.usuario.email })}>
        <button className="login-botao" onClick={() => carregarConta(sessao)}>{t('Verificar de novo')}</button>
      </Aviso>
    )
  }
  if (modo === 'suspensa') {
    const outras = lojas.filter((o) => o.id !== loja?.id && !o.suspensa)
    return (
      <Aviso titulo={t('Loja suspensa')} texto={t('A loja "{loja}" está suspensa. Fale com o administrador da plataforma.', { loja: loja?.nome })}>
        {outras.map((o) => <button key={o.id} className="login-botao" onClick={() => abrirLoja(o)}>{t('Abrir {loja}', { loja: o.nome })}</button>)}
      </Aviso>
    )
  }
  if (modo === 'cobranca') {
    const outras = lojas.filter((o) => o.id !== loja?.id && !o.suspensa && !['suspensa', 'aguardando'].includes(o.cobranca))
    const adminDaLoja = loja?.papel === 'admin'
    return (
      <div className="login-fundo"><div className="login-caixa caixa-larga">
        <img className="login-logo" src={logo || (temaAtivo === 'light' ? LOGO_PADRAO_CLARO : LOGO_PADRAO_ESCURO)} alt="" />
        <h1>{loja?.cobranca === 'aguardando' ? t('Falta o primeiro pagamento') : t('Loja suspensa por falta de pagamento')}</h1>
        <p className="login-sub">{adminDaLoja
          ? t('A loja "{loja}" volta a funcionar assim que o pagamento for confirmado. Os dados continuam guardados.', { loja: loja?.nome })
          : t('A loja "{loja}" está com o pagamento pendente. Avise o administrador da loja.', { loja: loja?.nome })}</p>
        {adminDaLoja && <CobrancaLoja orgId={loja.id} />}
        <button className="login-botao" onClick={() => carregarConta(sessao)}>{t('Já paguei, verificar de novo')}</button>
        {outras.map((o) => <button key={o.id} className="login-botao sec" onClick={() => abrirLoja(o)}>{t('Abrir {loja}', { loja: o.nome })}</button>)}
        <div className="login-rodape"><button className="link pequeno" onClick={() => Auth.sair()}>{t('Sair')}</button></div>
      </div></div>
    )
  }
  if (modo === 'carregando' || (modo === 'loja' && !db)) return <p className="vazio">{t('Carregando...')}</p>

  return (
    <div className={'layout' + (recolhida ? ' recolhida' : '') + (menuAberto ? ' menu-aberto' : '') + (noAdmin ? '' : ' modo-loja') + (!noAdmin ? ' sem-topo-celular' : '')}>
      <aside className="lateral">
        <div className="topo">
          <div className="logo">
            {noAdmin ? (
              <>
                <img className="logo-img" src={LOGO_PADRAO_APP} alt="" />
                <span className="rotulo logo-admin"><small>{nomeSistema}</small><b>{t('Admin Plataforma')}</b></span>
              </>
            ) : logo ? (
              <>
                <img className="logo-img" src={logo} alt="" />
                <span className="rotulo">{nomeLoja}</span>
              </>
            ) : (
              <>
                {/* logo padrão do sistema: versão completa (com o nome) e o ícone para a barra recolhida */}
                <img className="logo-padrao rotulo" src={temaAtivo === 'light' ? LOGO_PADRAO_CLARO : LOGO_PADRAO_ESCURO} alt={NOME_APP} />
                <img className="logo-img logo-icone" src={LOGO_PADRAO_APP} alt="" />
                {nomeProprio && <span className="rotulo">{nomeProprio}</span>}
              </>
            )}
          </div>
          <button className="icone-btn so-desktop" onClick={() => setRecolhida(!recolhida)} title={t('Recolher menu')}>
            <IconeRecolher recolhido={recolhida} />
          </button>
        </div>

        <nav>
          {grupos.map((g) => (
            <div key={g.nome} className="grupo">
              <button className="grupo-titulo" onClick={() => setFechados({ ...fechados, [g.nome]: !fechados[g.nome] })}>
                <span className="rotulo">{t(g.nome)}</span>
                <IconeSeta aberto={!fechados[g.nome]} />
              </button>
              {!fechados[g.nome] && g.itens.map((i) => <Item key={i.id} {...i} />)}
            </div>
          ))}
        </nav>

        <div className="rodape-lateral">
          {noAdmin ? (
            loja && db && (
              <button className="item" onClick={() => { setModo('loja'); setMenuAberto(false) }} title={t('Voltar para a loja')}>
                <IconeVoltar />
                <span className="rotulo">{t('Voltar para {loja}', { loja: loja.nome })}</span>
              </button>
            )
          ) : (
            RODAPE.map((i) => <Item key={i.id} {...i} />)
          )}
          <button className="item" onClick={sairDoSistema} title={t('Sair')}>
            <IconeSair />
            <span className="rotulo">{t('Sair')}</span>
          </button>
          <div className="versao rotulo">{t('Versão')} {pacote.version}</div>
        </div>
      </aside>

      <div className="fundo-menu" onClick={() => setMenuAberto(false)} />

      <div className="conteudo">
        <header className="barra-topo">
          {noAdmin
            ? <button className="icone-btn so-celular" onClick={() => setMenuAberto(true)} title={t('Abrir menu')}><IconeMenu /></button>
            : <button className="foto-topo so-celular" onClick={() => irPara('perfil')} aria-label={t('Minha conta')}><Avatar perfil={perfil} nome={nomeUsuario} /></button>}
          <SeletorLoja lojas={lojas} ativa={loja} admin={adminPlataforma}
            onTrocar={(o) => abrirLoja(o)} onGerenciar={() => irParaAdmin('orgs')} />
          <h1>{grupoAtual && <span className="caminho so-desktop">{t(grupoAtual)}<span className="caminho-sep">›</span></span>}{tituloT}</h1>
          {(nomeUsuario || perfil.avatar) && (
            <button className={'usuario' + (noAdmin ? '' : ' so-desktop')} onClick={() => (db ? (setModo('loja'), irPara('perfil')) : null)} title={t('Minha conta')}>
              {perfil.avatar
                ? <img className="avatar" src={perfil.avatar} alt="" />
                : <span className="avatar avatar-letra">{nomeUsuario.trim()[0]?.toUpperCase()}</span>}
              <span className="usuario-nome">{nomeUsuario}</span>
            </button>
          )}
        </header>

        {!noAdmin && faixa && (
          <div className={'faixa-cobranca' + (faixa.tipo === 'atrasada' ? ' atraso' : '')}>
            <span>{faixa.tipo === 'atrasada'
              ? (loja?.papel === 'admin' ? t('O pagamento desta loja está em atraso. Pague para não ser suspensa.') : t('O pagamento desta loja está em atraso. Avise o administrador da loja.'))
              : faixa.dias === 0 ? t('O teste grátis termina hoje. Assine para continuar usando.') : t('O teste grátis termina em {n} dia(s). Assine para continuar usando.', { n: faixa.dias })}</span>
            {loja?.papel === 'admin' && <button className="sec" onClick={() => { sessionStorage.setItem('abrir-config', 'cobranca'); irPara('config') }}>{t('Ver plano e cobrança')}</button>}
          </div>
        )}
        <main>
          {!noAdmin && daConta && ABAS_DA_CONTA.includes(aba) && (
            <button className="voltar-conta so-celular" onClick={voltarParaConta} aria-label={t('Voltar')}><IconeVoltar /><span>{t('Minha conta')}</span></button>
          )}
          {noAdmin && <Plataforma tela={telaAdmin} irPara={irParaAdmin} abrirLoja={(o) => abrirLoja(o)} meuId={sessao.usuario.id} aoMudarLojas={atualizarLojas} aoMudarMarca={setMarcaPlat} />}
          {!noAdmin && aba === 'inicio' && <Inicio db={db} irPara={irPara} completo={papel !== 'vendedor'} perfil={perfil} nome={nomeUsuario} />}
          {!noAdmin && aba === 'termos' && <Termos />}
          {!noAdmin && contaAberta && <MinhaConta db={db} perfil={perfil} nome={nomeUsuario} email={sessao?.usuario?.email} loja={loja} lojas={lojas}
            adminPlataforma={adminPlataforma} podeVer={(id) => podeVer(papel, id)} irPara={(id) => irPara(id, true)} executar={executar}
            onFechar={() => setContaAberta(false)} onTrocarLoja={(o) => abrirLoja(o)} onAdmin={() => irParaAdmin('orgs')} onSair={sairDoSistema} />}
          {!noAdmin && aba === 'vendas' && <Vendas db={db} executar={executar} irPara={irPara} visita={visitaVendas} />}
          {!noAdmin && aba === 'fiado' && <Fiado db={db} executar={executar} irPara={irPara} />}
          {!noAdmin && aba === 'clientes' && <Clientes db={db} executar={executar} irPara={irPara} />}
          {!noAdmin && aba === 'caixa' && <Caixa db={db} executar={executar} irPara={irPara} nomeLoja={loja?.nome} />}
          {!noAdmin && aba === 'analise' && <Analise db={db} />}
          {!noAdmin && aba === 'estoque' && <Estoque db={db} executar={executar} irPara={irPara} />}
          {!noAdmin && aba === 'forn' && <Fornecedores db={db} executar={executar} />}
          {!noAdmin && aba === 'config' && <Configuracoes db={db} executar={executar} usuario={sessao.usuario} loja={loja} adminPlataforma={adminPlataforma} />}
          {!noAdmin && aba === 'ajuda' && <Ajuda irPara={irPara} />}
        </main>
        {!noAdmin && (
          <nav className="barra-baixo so-celular">
            {BARRA_BAIXO.filter((i) => podeVer(papel, i.id)).map(({ id, nome, icone: Icone }) => (
              <button key={id} className={'bb-item' + (aba === id ? ' ativo' : '')} onClick={() => irPara(id)}>
                <Icone /><span>{t(nome)}</span>
              </button>
            ))}
            <button className={'bb-vender' + (aba === 'vendas' ? ' ativo' : '')} onClick={() => irPara('vendas')}>
              <IconeMais /><span>{t('Vender')}</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  )
}
