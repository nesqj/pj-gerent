import { useEffect, useState } from 'react'
import * as Armazenamento from './armazenamento.js'
import Fornecedores from './componentes/Fornecedores.jsx'
import PrecosVenda from './componentes/PrecosVenda.jsx'
import Vendas from './componentes/Vendas.jsx'
import RegraPreco from './componentes/RegraPreco.jsx'
import Analise from './componentes/Analise.jsx'
import Estoque from './componentes/Estoque.jsx'
import Configuracoes from './componentes/Configuracoes.jsx'
import Ajuda from './componentes/Ajuda.jsx'
import Login from './componentes/Login.jsx'
import * as Auth from './auth.js'
import { supabaseConfigurado } from './supabase.js'
import { observarTabelas } from './tabelasResponsivas.js'
import { definirIdioma, t } from './i18n.js'
import { corTextoSobre, definirFuso, FUSO_PADRAO, hexValido, hoje } from './utils.js'
import pacote from '../package.json'
import { LOGO_PADRAO_APP, LOGO_PADRAO_CLARO, LOGO_PADRAO_ESCURO, NOME_APP } from './marca.js'
import {
  IconeAjuda, IconeAjustes, IconeCaixaProduto, IconeCalculadora, IconeCaminhao, IconeCarrinho, IconeConfig,
  IconeGrafico, IconeMenu, IconeRecolher, IconeSair, IconeSeta,
} from './icones.jsx'

// Grupos e itens da barra lateral
const GRUPOS = [
  {
    nome: 'Vendas',
    itens: [
      { id: 'vendas', nome: 'Vendas', icone: IconeCarrinho },
      { id: 'analise', nome: 'Análise', icone: IconeGrafico },
    ],
  },
  {
    nome: 'Cadastros',
    itens: [
      { id: 'forn', nome: 'Fornecedores', icone: IconeCaminhao },
      { id: 'estoque', nome: 'Estoque', icone: IconeCaixaProduto },
    ],
  },
  {
    nome: 'Preços',
    itens: [
      { id: 'venda', nome: 'Preços de Venda', icone: IconeCalculadora },
      { id: 'regra', nome: 'Regra de Preço', icone: IconeAjustes },
    ],
  },
]

// Itens do rodapé da barra lateral
const RODAPE = [
  { id: 'config', nome: 'Configurações', icone: IconeConfig },
  { id: 'ajuda', nome: 'Ajuda', icone: IconeAjuda },
]

export default function App() {
  const [db, setDb] = useState(null)
  const [aba, setAba] = useState('vendas')
  const [fechados, setFechados] = useState({})       // grupos recolhidos
  const [recolhida, setRecolhida] = useState(false)  // barra lateral só com ícones
  const [menuAberto, setMenuAberto] = useState(false) // menu no celular
  const [temaAtivo, setTemaAtivo] = useState(document.documentElement.dataset.theme || 'dark')

  // login: undefined = verificando, null = sem sessão, objeto = logado
  const [sessao, setSessao] = useState(undefined)
  const [recuperando, setRecuperando] = useState(false) // abriu o link de "esqueci minha senha"
  const [erroCarga, setErroCarga] = useState('')

  // Carrega os dados da conta e, se a conta estiver vazia, oferece trazer os dados deste navegador
  async function carregarConta(s) {
    setErroCarga('')
    try {
      let d = await Armazenamento.carregar()
      const locais = Armazenamento.contaVazia(d) && Armazenamento.dadosDoNavegador()
      if (locais && !sessionStorage.getItem('migracao-recusada')) {
        if (confirm(t('Encontramos dados salvos neste navegador (da versão sem banco de dados). Enviar esses dados para a sua conta?'))) {
          await Armazenamento.substituirTudo(locais)
          Armazenamento.esquecerDadosDoNavegador()
          d = await Armazenamento.carregar()
          alert(t('Dados enviados para a sua conta!'))
        } else sessionStorage.setItem('migracao-recusada', '1')
      }
      // primeiro acesso: usa o nome do cadastro no Perfil, se ainda não tiver
      if (s?.usuario?.nome && !d.perfil?.nome) {
        await Armazenamento.salvarPerfil({ ...d.perfil, nome: s.usuario.nome })
        d = await Armazenamento.carregar()
      }
      setDb(d)
    } catch (e) {
      setErroCarga(e.message || t('Não foi possível carregar os dados.'))
    }
  }

  useEffect(() => {
    if (!supabaseConfigurado) return setSessao(null)
    Auth.obterSessao().then((s) => { setSessao(s); if (s) carregarConta(s) })
    return Auth.aoMudar((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (evento === 'SIGNED_OUT') { Armazenamento.limpar(); setDb(null); setSessao(null) }
      if (evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') setSessao(s)
    })
  }, [])

  function entrou(s) {
    setSessao(s)
    setAba('vendas')
    carregarConta(s)
  }

  async function sairDoSistema() {
    if (!confirm(t('Sair do sistema?'))) return
    await Auth.sair()
    Armazenamento.limpar()
    setDb(null)
    setSessao(null)
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
  const tema = db?.perfil?.tema || pref.tema || 'escuro'
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const aplicar = () => {
      const claro = tema === 'claro' || (tema === 'auto' && mq?.matches)
      document.documentElement.dataset.theme = claro ? 'light' : 'dark'
      setTemaAtivo(claro ? 'light' : 'dark')
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', claro ? '#f6f5f2' : '#1c1b19')
    }
    aplicar()
    if (tema !== 'auto' || !mq) return
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [tema])

  // marca: cor (pode ser diferente no tema escuro) e título da aba
  const corClaro = hexValido(db?.config?.cor) ? db.config.cor : null
  const corEscuro = hexValido(db?.config?.corEscuro) ? db.config.corEscuro : corClaro
  const cor = temaAtivo === 'light' ? corClaro : corEscuro
  // logo: no tema escuro usa o logo próprio dele; se não tiver, usa o do tema claro
  const logo = temaAtivo === 'light' ? db?.config?.logo : db?.config?.logoEscuro || db?.config?.logo
  const nomeProprio = db?.config?.nomeLoja?.trim()
  const nomeLoja = nomeProprio || NOME_APP
  useEffect(() => {
    const raiz = document.documentElement.style
    if (cor) { raiz.setProperty('--pri', cor); raiz.setProperty('--pri-txt', corTextoSobre(cor)) }
    else { raiz.removeProperty('--pri'); raiz.removeProperty('--pri-txt') }
  }, [cor])
  useEffect(() => { document.title = nomeLoja }, [nomeLoja])

  // Executa uma operação de armazenamento e recarrega os dados.
  async function executar(fn) {
    try {
      await fn(Armazenamento)
      setDb(await Armazenamento.carregar())
      return true
    } catch (e) {
      alert(e.message || t('Erro ao salvar.'))
      return false
    }
  }

  function irPara(id) {
    setAba(id)
    setMenuAberto(false)
  }

  const contagem = db && {
    vendas: db.vendas.filter((v) => v.dia === hoje()).length, // vendas de hoje
    forn: db.fornecedores.length }
  const titulo = [...GRUPOS.flatMap((g) => g.itens), ...RODAPE].find((i) => i.id === aba)?.nome
  const tituloT = titulo && t(titulo)
  const perfil = db?.perfil || {}
  const nomeUsuario = perfil.nome || sessao?.usuario?.nome || sessao?.usuario?.email || ''

  const Item = ({ id, nome, icone: Icone, badge }) => (
    <button className={'item' + (aba === id ? ' ativo' : '')} onClick={() => irPara(id)} title={t(nome)}>
      <Icone />
      <span className="rotulo">{t(nome)}</span>
      {badge > 0 && <span className="badge">{badge}</span>}
    </button>
  )

  if (!supabaseConfigurado) {
    return <div className="login-fundo"><div className="login-caixa"><h1>{t('Banco de dados não configurado')}</h1><p className="login-sub">{t('Faltam a URL e a chave do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY).')}</p></div></div>
  }
  if (recuperando) {
    return <Login tema={temaAtivo} logo={logo} modoInicial="novaSenha" onSenhaTrocada={() => { setRecuperando(false); alert(t('Senha alterada!')) }} />
  }
  if (sessao === undefined) return <p className="vazio">{t('Carregando...')}</p>
  if (!sessao) return <Login tema={temaAtivo} logo={logo} onEntrou={entrou} />
  if (erroCarga) {
    return (
      <div className="login-fundo"><div className="login-caixa">
        <h1>{t('Não foi possível carregar')}</h1>
        <p className="login-sub">{erroCarga}</p>
        <button className="login-botao" onClick={() => carregarConta(sessao)}>{t('Tentar de novo')}</button>
        <div className="login-rodape"><button className="link pequeno" onClick={() => Auth.sair()}>{t('Sair')}</button></div>
      </div></div>
    )
  }
  if (!db) return <p className="vazio">{t('Carregando...')}</p>

  return (
    <div className={'layout' + (recolhida ? ' recolhida' : '') + (menuAberto ? ' menu-aberto' : '')}>
      <aside className="lateral">
        <div className="topo">
          <div className="logo">
            {logo ? (
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
          {GRUPOS.map((g) => (
            <div key={g.nome} className="grupo">
              <button className="grupo-titulo" onClick={() => setFechados({ ...fechados, [g.nome]: !fechados[g.nome] })}>
                <span className="rotulo">{t(g.nome)}</span>
                <IconeSeta aberto={!fechados[g.nome]} />
              </button>
              {!fechados[g.nome] && g.itens.map((i) => <Item key={i.id} {...i} badge={contagem?.[i.id]} />)}
            </div>
          ))}
        </nav>

        <div className="rodape-lateral">
          {RODAPE.map((i) => <Item key={i.id} {...i} />)}
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
          <button className="icone-btn so-celular" onClick={() => setMenuAberto(true)} title={t('Abrir menu')}><IconeMenu /></button>
          <h1>{tituloT}</h1>
          {(nomeUsuario || perfil.avatar) && (
            <button className="usuario" onClick={() => irPara('config')} title={t('Configurações')}>
              {perfil.avatar
                ? <img className="avatar" src={perfil.avatar} alt="" />
                : <span className="avatar avatar-letra">{nomeUsuario.trim()[0]?.toUpperCase()}</span>}
              <span className="usuario-nome">{nomeUsuario}</span>
            </button>
          )}
        </header>

        <main>
          {!db && <p className="vazio">{t('Carregando...')}</p>}
          {db && aba === 'vendas' && <Vendas db={db} executar={executar} />}
          {db && aba === 'analise' && <Analise db={db} />}
          {db && aba === 'estoque' && <Estoque db={db} executar={executar} />}
          {db && aba === 'forn' && <Fornecedores db={db} executar={executar} />}
          {db && aba === 'venda' && <PrecosVenda db={db} executar={executar} />}
          {db && aba === 'regra' && <RegraPreco db={db} executar={executar} />}
          {db && aba === 'config' && <Configuracoes db={db} executar={executar} usuario={sessao.usuario} />}
          {db && aba === 'ajuda' && <Ajuda irPara={irPara} />}
        </main>
      </div>
    </div>
  )
}
