import { useEffect, useState } from 'react'
import { aviso, confirmar } from '../avisos-tela.jsx'
import * as Org from '../organizacoes.js'
import { t } from '../i18n.js'
import { brl, dataTs, norm } from '../utils.js'
import { supabase } from '../supabase.js'

const reais = (centavos) => brl((centavos || 0) / 100)
const ABAS = [
  { id: 'geral', nome: 'Visão geral' },
  { id: 'planos', nome: 'Planos' },
  { id: 'conexao', nome: 'Conexão' },
  { id: 'regua', nome: 'Régua' },
]

// Painel → Cobrança (só administrador da plataforma)
export default function Cobranca({ abrirOrg }) {
  const [aba, setAba] = useState('geral')
  const [config, setConfig] = useState(null)
  const [erro, setErro] = useState('')
  async function carregar() {
    setErro('')
    try { setConfig(await Org.cobrancaConfig()) } catch (e) { setErro(e.message) }
  }
  useEffect(() => { carregar() }, [])
  if (erro) return <div className="painel"><p className="bad">{erro}</p><button className="sec" onClick={carregar}>{t('Tentar de novo')}</button></div>
  if (!config) return <p className="vazio">{t('Carregando...')}</p>

  return (
    <section>
      <p className="subtitulo-tela">{t('Cobre cada loja pela Stripe ou pelo Asaas: planos, teste grátis, atraso e suspensão automáticos.')}</p>
      {config.ligada && config.modo_teste && <p className="faixa-teste">{t('MODO DE TESTE: os pagamentos não são reais. Lojas de verdade ainda não conseguem pagar.')}</p>}
      {!config.ligada && <p className="faixa-teste neutra">{t('A cobrança está desligada. Ligue em Régua quando os planos e a conexão estiverem prontos.')}</p>}
      <div className="abas">
        {ABAS.map((a) => <button key={a.id} className={'aba' + (aba === a.id ? ' ativa' : '')} onClick={() => setAba(a.id)}>{t(a.nome)}</button>)}
      </div>
      {aba === 'geral' && <VisaoGeral config={config} abrirOrg={abrirOrg} irPara={setAba} />}
      {aba === 'planos' && <Planos />}
      {aba === 'conexao' && <Conexao config={config} recarregar={carregar} />}
      {aba === 'regua' && <Regua config={config} recarregar={carregar} />}
    </section>
  )
}

// ---------- Visão geral
function VisaoGeral({ config, abrirOrg, irPara }) {
  const [lojas, setLojas] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [planosLista, setPlanosLista] = useState([])
  useEffect(() => {
    Org.cobrancaResumo().then(setLojas, (e) => aviso.erro(e.message))
    Org.planos().then(setPlanosLista, () => {})
  }, [])
  if (!lojas) return <p className="vazio">{t('Carregando...')}</p>

  const mensal = (l) => (l.intervalo === 'anual' ? l.preco_centavos / 12 : l.preco_centavos)
  const pagantes = lojas.filter((l) => l.situacao === 'em_dia')
  const conta = (s) => lojas.filter((l) => l.situacao === s).length
  const lista = lojas.filter((l) => (!filtro || l.situacao === filtro) && norm(l.nome).includes(norm(busca)))
  const pendencias = [
    !planosLista.length && t('Crie pelo menos um plano (aba Planos).'),
    planosLista.length > 0 && !planosLista.some((p) => p.padrao) && t('Escolha o plano padrão: é o que as lojas novas ganham (aba Planos → "Usar no cadastro").'),
    !config.provedor && t('Escolha o provedor e conecte (aba Conexão).'),
    config.provedor && !config.conectado_em && t('Conecte o provedor com "Testar e conectar" (aba Conexão).'),
    !config.ligada && t('Ligue a cobrança (aba Régua).'),
  ].filter(Boolean)

  return (
    <>
      {pendencias.length > 0 && (
        <div className="painel">
          <p><b>{t('Para começar a cobrar, falta:')}</b></p>
          <ul className="dicas">{pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
          <button className="link pequeno" onClick={() => irPara(!planosLista.length || !planosLista.some((p) => p.padrao) ? 'planos' : !config.conectado_em ? 'conexao' : 'regua')}>{t('Resolver')} →</button>
        </div>
      )}
      <div className="cards">
        <div className="card"><small>{t('Receita por mês (em dia)')}</small><b>{reais(pagantes.reduce((s, l) => s + mensal(l), 0))}</b></div>
        <div className="card"><small>{t('Em dia')}</small><b>{conta('em_dia')}</b></div>
        <div className="card"><small>{t('Teste grátis')}</small><b>{conta('teste')}</b></div>
        <div className="card"><small>{t('Em atraso')}</small><b className={conta('atrasada') ? 'bad' : ''}>{conta('atrasada')}</b></div>
        <div className="card"><small>{t('Suspensas / aguardando')}</small><b className={conta('suspensa') + conta('aguardando') ? 'bad' : ''}>{conta('suspensa') + conta('aguardando')}</b></div>
        <div className="card"><small>{t('Isentas')}</small><b>{conta('isenta')}</b></div>
      </div>
      <div className="linha-titulo">
        <input className="busca" placeholder={t('Buscar loja...')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="sel-pequeno" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">{t('Todas as situações')}</option>
          {Object.keys(Org.SITUACOES).map((s) => <option key={s} value={s}>{Org.nomeSituacao(s)}</option>)}
        </select>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>{t('Loja')}</th><th>{t('Plano')}</th><th>{t('Situação')}</th><th>{t('Teste até')}</th><th>{t('Pago até')}</th><th>{t('Por')}</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="7" className="vazio">{t('Nada encontrado.')}</td></tr>}
            {lista.map((l) => (
              <tr key={l.org_id}>
                <td>{l.nome}</td>
                <td>{l.plano ? `${l.plano} · ${reais(l.preco_centavos)}` : '-'}</td>
                <td><span className={Org.SITUACOES[l.situacao]?.classe}>{Org.nomeSituacao(l.situacao)}</span></td>
                <td>{l.teste_ate ? dataTs(l.teste_ate) : '-'}</td>
                <td>{l.pago_ate ? dataTs(l.pago_ate) : '-'}</td>
                <td>{{ manual: t('À mão'), stripe: 'Stripe', asaas: 'Asaas' }[l.provedor] || '-'}</td>
                <td className="n"><button className="edit" onClick={() => abrirOrg(l.org_id)}>{t('Abrir')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------- Planos
const PLANO_VAZIO = { nome: '', preco: '', intervalo: 'mensal', dias_teste: '14', max_pessoas: '', visivel: true }

function Planos() {
  const [lista, setLista] = useState(null)
  const [form, setForm] = useState(PLANO_VAZIO)
  const [editando, setEditando] = useState(null)
  async function carregar() { try { setLista(await Org.planos({ todos: true })) } catch (e) { aviso.erro(e.message) } }
  useEffect(() => { carregar() }, [])
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  async function salvar(e) {
    e.preventDefault()
    const centavos = Math.round(Number(String(form.preco).replace(/\./g, '').replace(',', '.')) * 100)
    if (!(centavos >= 500)) return aviso.alerta(t('O preço mínimo é R$ 5,00.'))
    try {
      await Org.salvarPlano({ id: editando, nome: form.nome.trim(), preco_centavos: centavos, intervalo: form.intervalo,
        dias_teste: Number(form.dias_teste) || 0, max_pessoas: Number(form.max_pessoas) || null, visivel: form.visivel })
      setForm(PLANO_VAZIO); setEditando(null); carregar()
    } catch (er) { aviso.erro(er.message) }
  }
  function editar(p) {
    setEditando(p.id)
    setForm({ nome: p.nome, preco: (p.preco_centavos / 100).toFixed(2).replace('.', ','), intervalo: p.intervalo,
      dias_teste: String(p.dias_teste), max_pessoas: p.max_pessoas ? String(p.max_pessoas) : '', visivel: p.visivel })
  }
  const fazer = async (fn) => { try { await fn(); carregar() } catch (e) { aviso.erro(e.message) } }

  if (!lista) return <p className="vazio">{t('Carregando...')}</p>
  const ativos = lista.filter((p) => !p.arquivado_em)
  return (
    <>
      <form onSubmit={salvar} className={editando ? 'form-edicao' : ''}>
        <label>{t('Nome do plano')}<input required maxLength={60} {...campo('nome')} /></label>
        <label>{t('Preço (R$)')}<input required inputMode="decimal" placeholder="49,90" {...campo('preco')} /></label>
        <label>{t('Intervalo de cobrança')}
          <select {...campo('intervalo')}><option value="mensal">{t('Mensal')}</option><option value="anual">{t('Anual')}</option></select>
        </label>
        <label>{t('Dias de teste grátis')}<input type="number" min="0" max="90" {...campo('dias_teste')} /></label>
        <label>{t('Máximo de pessoas')}<input type="number" min="1" placeholder={t('Sem limite')} {...campo('max_pessoas')} /></label>
        <label className="check"><input type="checkbox" checked={!form.visivel} onChange={(e) => setForm({ ...form, visivel: !e.target.checked })} /> {t('Esconder das lojas')}</label>
        <button type="submit">{editando ? t('Salvar alterações') : t('Salvar plano')}</button>
        {editando && <button type="button" className="sec" onClick={() => { setEditando(null); setForm(PLANO_VAZIO) }}>{t('Cancelar edição')}</button>}
      </form>
      <p><small>{t('0 dias de teste = entrada paga: a loja nova fica bloqueada até o primeiro pagamento. Preço e intervalo travam quando alguém assina; para mudar, arquive e crie outro. Plano escondido ganha o selo "Só você atribui".')}</small></p>
      {ativos.length > 0 && !ativos.some((p) => p.padrao) && <p className="bad">{t('Nenhum plano é o padrão: lojas novas nascem isentas. Clique em "Usar no cadastro" no plano que quem entra sozinho deve ganhar.')}</p>}
      <div className="tw">
        <table>
          <thead><tr><th>{t('Plano')}</th><th className="n">{t('Preço')}</th><th>{t('Intervalo')}</th><th className="n">{t('Teste')}</th><th className="n">{t('Pessoas')}</th><th></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="6" className="vazio">{t('Nenhum plano ainda.')}</td></tr>}
            {lista.map((p) => (
              <tr key={p.id} className={p.arquivado_em ? 'apagado' : ''}>
                <td>{p.nome}{p.padrao && <span className="tag">{t('Padrão do cadastro')}</span>}{!p.visivel && <span className="tag">{t('Só você atribui')}</span>}{p.arquivado_em && <span className="tag">{t('Arquivado')}</span>}</td>
                <td className="n">{reais(p.preco_centavos)}</td>
                <td>{p.intervalo === 'anual' ? t('Anual') : t('Mensal')}</td>
                <td className="n">{p.dias_teste ? t('{n} dias', { n: p.dias_teste }) : t('Entrada paga')}</td>
                <td className="n">{p.max_pessoas || t('Sem limite')}</td>
                <td className="n">
                  {!p.arquivado_em && <>
                    {!p.padrao && <button className="sec" onClick={() => fazer(() => Org.planoPadrao(p.id))}>{t('Usar no cadastro')}</button>}{' '}
                    <button className="edit" onClick={() => editar(p)}>{t('Editar')}</button>{' '}
                    <button className="del" onClick={async () => await confirmar(t('Arquivar o plano {nome}? Quem já está nele continua; ninguém novo escolhe.', { nome: p.nome })) && fazer(() => Org.arquivarPlano(p.id))}>{t('Arquivar')}</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------- Conexão
function Conexao({ config, recarregar }) {
  const [status, setStatus] = useState(null)
  const [erroStatus, setErroStatus] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [manual, setManual] = useState(null)
  const [mostrarSegredo, setMostrarSegredo] = useState(false)

  async function verStatus() {
    setErroStatus('')
    try { setStatus(await Org.servidor('status', null, 'GET')) } catch (e) { setErroStatus(e.message) }
  }
  useEffect(() => { verStatus() }, [])

  async function escolher(p) {
    try { await Org.definirProvedor(p); setManual(null); await recarregar() } catch (e) { aviso.erro(e.message) }
  }
  async function conectar() {
    setOcupado(true)
    try {
      const { data } = await supabase.auth.getSession()
      const r = await Org.servidor('conectar', { email: data.session?.user?.email })
      setManual(r.manual)
      await recarregar(); await verStatus()
    } catch (e) { aviso.ok(e.message) } finally { setOcupado(false) }
  }
  const copiar = (txt) => navigator.clipboard?.writeText(txt).then(() => aviso.ok(t('Copiado.')))
  const prov = config.provedor
  const chaveOk = prov && status?.[prov]?.chave

  return (
    <>
      <div className="painel cadastro-bloco">
        <p><b>{t('Provedor')}</b></p>
        <p><small>{t('Um provedor por vez. Só dá para trocar enquanto nenhuma loja paga pelo atual.')}</small></p>
        <div className="opcoes-provedor">
          {[
            { id: 'asaas', nome: 'Asaas', desc: 'Pix, boleto ou cartão, escolhido na fatura a cada cobrança. Bom para pequenas lojas no Brasil. Pede o CPF ou CNPJ de quem paga.' },
            { id: 'stripe', nome: 'Stripe', desc: 'Cartão cobrado sozinho todo mês (sem Pix). Quem paga troca o cartão pelo portal da Stripe.' },
          ].map((o) => (
            <label key={o.id} className={'opcao-chave escolha' + (prov === o.id ? ' marcada' : '')}>
              <div><b>{o.nome}</b><small>{t(o.desc)}</small></div>
              <input type="radio" name="provedor" checked={prov === o.id} onChange={() => escolher(o.id)} />
            </label>
          ))}
        </div>
      </div>

      <div className="painel cadastro-bloco">
        <p><b>{t('Passo a passo')}</b></p>
        <ol className="dicas passos">
          <li>
            {t('Na Vercel (Settings → Environment Variables), cadastre COBRANCA_SEGREDO com a senha abaixo.')}
            <div className="link-pagamento">
              <input readOnly type={mostrarSegredo ? 'text' : 'password'} value={config.segredo_servidor} onFocus={(e) => e.target.select()} />
              <button className="sec" onClick={() => setMostrarSegredo(!mostrarSegredo)}>{mostrarSegredo ? t('Ocultar') : t('Mostrar')}</button>
              <button className="sec" onClick={() => copiar(config.segredo_servidor)}>{t('Copiar')}</button>
            </div>
          </li>
          <li>{prov === 'stripe'
            ? t('Cadastre também STRIPE_SECRET_KEY com a chave secreta da Stripe (Desenvolvedores → Chaves de API). Comece pela de teste: sk_test_...')
            : prov === 'asaas'
              ? t('Cadastre também ASAAS_API_KEY com a chave do Asaas (Integrações → Chaves de API). Comece pela do sandbox: $aact_hmlg_...')
              : t('Escolha o provedor acima para ver qual chave cadastrar.')}</li>
          <li>{t('Na Vercel, publique de novo (Deployments → ⋯ → Redeploy) para as variáveis valerem.')}</li>
          <li>{t('Volte aqui e clique em "Testar e conectar". O aviso de pagamento é cadastrado no provedor sozinho.')}</li>
        </ol>
      </div>

      <div className="painel cadastro-bloco">
        <p><b>{t('Situação da conexão')}</b></p>
        {erroStatus && <p className="bad">{erroStatus}</p>}
        {status && (
          <ul className="lista-status">
            <li className={status.segredo.confere ? 'ok' : 'bad'}>{status.segredo.confere ? '✓ ' + t('Senha do servidor confere') : status.segredo.cadastrado ? '✗ ' + t('COBRANCA_SEGREDO na Vercel não confere com a senha acima') : '✗ ' + t('Falta COBRANCA_SEGREDO na Vercel')}</li>
            {prov && <li className={chaveOk ? 'ok' : 'bad'}>{chaveOk ? `✓ ${t('Chave do provedor cadastrada')}${status[prov].teste ? ` (${t('teste')})` : ` (${t('produção')})`}` : '✗ ' + t('Falta a chave do provedor na Vercel')}</li>}
            {prov && <li className={config.conectado_em ? 'ok' : 'bad'}>{config.conectado_em ? `✓ ${t('Conectado em {data}', { data: dataTs(config.conectado_em) })}${config.modo_teste ? ' · ' + t('MODO DE TESTE') : ''}` : '✗ ' + t('Ainda não conectado')}</li>}
            {config.webhook_url && <li>{t('Os avisos de pagamento chegam em {url}', { url: config.webhook_url })}</li>}
          </ul>
        )}
        <div className="botoes">
          <button disabled={ocupado || !prov || !status?.segredo.confere || !chaveOk} onClick={conectar}>{ocupado ? t('Aguarde...') : t('Testar e conectar')}</button>
          <button className="sec" onClick={verStatus}>{t('Verificar de novo')}</button>
        </div>
        {manual && (
          <div className="painel aviso-manual">
            <p><b>{t('Falta um passo: cadastre o aviso de pagamento no Asaas')}</b></p>
            <p><small>{t('No Asaas: Integrações → Webhooks → Adicionar. Use os dados abaixo, marque os eventos listados e salve. O token aparece só agora: se sair da tela sem copiar, conecte de novo.')}</small></p>
            <div className="link-pagamento"><input readOnly value={manual.url} /><button className="sec" onClick={() => copiar(manual.url)}>{t('Copiar URL')}</button></div>
            <div className="link-pagamento"><input readOnly value={manual.token} /><button className="sec" onClick={() => copiar(manual.token)}>{t('Copiar token')}</button></div>
            <p><small>{t('Eventos')}: {manual.eventos.join(', ')}</small></p>
            <button className="sec" onClick={() => setManual(null)}>{t('Pronto, já cadastrei')}</button>
          </div>
        )}
        <p><small>{t('Para trocar a senha do servidor (se ela vazou), gere outra e atualize COBRANCA_SEGREDO na Vercel.')}{' '}
          <button className="link pequeno" onClick={async () => { if (await confirmar(t('Gerar uma senha nova? A cobrança para de funcionar até você atualizar COBRANCA_SEGREDO na Vercel.'))) { try { await Org.trocarSegredoServidor(); recarregar() } catch (e) { aviso.erro(e.message) } } }}>{t('Gerar senha nova')}</button></small></p>
      </div>
    </>
  )
}

// ---------- Régua
function Regua({ config, recarregar }) {
  const [tolerancia, setTolerancia] = useState(String(config.tolerancia_dias))
  const [ocupado, setOcupado] = useState(false)
  async function salvar(ligar) {
    const n = Number(tolerancia)
    if (!(n >= 5 && n <= 30)) return aviso.alerta(t('A tolerância vai de 5 a 30 dias.'))
    setOcupado(true)
    try { await Org.definirCobranca(ligar, n); await recarregar() } catch (e) { aviso.erro(e.message) } finally { setOcupado(false) }
  }
  return (
    <>
      <div className="painel cadastro-bloco">
        <div className="opcao-chave">
          <div>
            <b>{t('Cobrança das lojas')}</b>
            <small>{config.ligada
              ? t('Ligada: lojas com plano pagam; quem não paga entra na régua abaixo.')
              : t('Desligada: ninguém paga e ninguém é suspenso por cobrança. As lojas que já existem ficam isentas até você escolher um plano para elas.')}</small>
          </div>
          <button type="button" role="switch" aria-checked={config.ligada} aria-label={t('Cobrança das lojas')} disabled={ocupado}
            className={'chave' + (config.ligada ? ' ligada' : '')} onClick={() => salvar(!config.ligada)}><span /></button>
        </div>
      </div>
      <div className="painel cadastro-bloco">
        <p><b>{t('Dias de tolerância')}</b></p>
        <div className="linha-tolerancia">
          <input type="number" min="5" max="30" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
          <button disabled={ocupado || Number(tolerancia) === config.tolerancia_dias} onClick={() => salvar(config.ligada)}>{t('Salvar régua')}</button>
        </div>
        <div className="tw" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>{t('Quando')}</th><th>{t('O que acontece')}</th></tr></thead>
            <tbody>
              <tr><td>{t('3 dias antes do fim do teste')}</td><td className="quebra">{t('Faixa no topo do sistema avisando que o teste vai acabar.')}</td></tr>
              <tr><td>{t('Venceu (dia 0)')}</td><td className="quebra">{t('A loja continua funcionando, com uma faixa de pagamento em atraso e o botão para pagar.')}</td></tr>
              <tr><td>{t('Dia {n}', { n: config.tolerancia_dias })}</td><td className="quebra">{t('A loja é suspensa: ninguém da equipe usa até pagar. Os dados continuam guardados.')}</td></tr>
              <tr><td>{t('Pagou')}</td><td className="quebra">{t('Volta a funcionar sozinha, assim que o provedor confirma o pagamento.')}</td></tr>
            </tbody>
          </table>
        </div>
        <p><small>{t('Os e-mails de cobrança e de fatura saem pelo próprio provedor (Stripe ou Asaas). Dentro do sistema, os avisos aparecem na faixa do topo para o administrador da loja.')}</small></p>
      </div>
    </>
  )
}
