import { useState } from 'react'
import { t } from '../i18n.js'
import { podeFazer } from '../armazenamento.js'
import { custosDasVendas, reservadoCustos } from '../utils.js'
import { brl, calcularEstoque, extratoCaixa, faturamentoVenda, hoje, hora, lucroVenda, pagamentosDaVenda, recebidoDaParcela, situacaoParcela } from '../utils.js'
import {
  IconeCaixa, IconeCaixaProduto, IconeCalculadora, IconeCarrinho, IconeDireita, IconeFechar, IconeFiado, IconeOlho, IconeOlhoFechado, IconeSino, IconeUsuarios,
} from '../icones.jsx'
import { Avatar } from './MinhaConta.jsx'
import { Calculadora } from './VenderMenu.jsx'

// Início: o que está acontecendo hoje, numa olhada só. Não calcula nada novo:
// usa as mesmas contas da aba Vender (vendas do dia), do Controle de caixa (saldo e reservado),
// de Cobranças (a receber e atrasados) e do Estoque (o que está acabando).
// completo = false (vendedor): sem lucro e sem caixa.
const r2 = (x) => Math.round(x * 100) / 100
const somarDias = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const OCULTAR = 'inicio-ocultar-valores'

export default function Inicio({ db, irPara, completo, perfil, nome }) {
  const dia = hoje()
  const emprestimos = podeFazer('emprestimo.salvo')
  // 👁 esconde os valores (fica guardado neste aparelho)
  const [oculto, setOculto] = useState(() => { try { return localStorage.getItem(OCULTAR) === '1' } catch { return false } })
  const [verAvisos, setVerAvisos] = useState(false)
  const [calculadora, setCalculadora] = useState(false)
  const alternarOculto = () => { const v = !oculto; setOculto(v); try { localStorage.setItem(OCULTAR, v ? '1' : '0') } catch { /* sem acesso */ } }
  const R = (v) => (oculto ? 'R$ ••••' : brl(v))

  // vendas de hoje
  const vendasHoje = (db.vendas || []).filter((v) => v.dia === dia).sort((a, b) => b.data - a.data)
  const vendido = r2(vendasHoje.reduce((s, v) => s + faturamentoVenda(v), 0))
  const lucro = r2(vendasHoje.reduce((s, v) => s + lucroVenda(v).lucro, 0))

  // caixa: o valor grande é o "Livre para você" (caixa − custos a pagar)
  const caixa = completo ? extratoCaixa(db) : null
  const reservado = completo ? reservadoCustos(db) : 0
  const livre = caixa ? r2(caixa.saldo - reservado) : null

  // cobranças (fiado e, para quem pode, empréstimos)
  const parcelas = [...(db.vendas || []), ...(emprestimos ? db.emprestimos || [] : [])]
    .flatMap((v) => (v.fiado?.parcelas || []).map((p) => ({ p, falta: r2(Math.max(0, (+p.valor || 0) - recebidoDaParcela(p))), sit: situacaoParcela(p, dia) })))
    .filter((x) => ['aberta', 'vence_hoje', 'atrasada'].includes(x.sit))
  const soma = (l) => r2(l.reduce((s, x) => s + x.falta, 0))
  const em7 = somarDias(dia, 7)
  const aReceber = soma(parcelas)
  const semana = soma(parcelas.filter((x) => x.p.vencimento >= dia && x.p.vencimento <= em7))
  const atrasadas = parcelas.filter((x) => x.sit === 'atrasada')
  const venceHoje = parcelas.filter((x) => x.sit === 'vence_hoje')

  // estoque acabando (1 ou 2 unidades) e custos a pagar
  const acabando = [...calcularEstoque(db).values()].filter((p) => p.saldo > 0 && p.saldo <= 2).sort((a, b) => a.saldo - b.saldo)
  const custosAPagar = completo ? custosDasVendas(db).filter((c) => !c.pago && (c.data || 0) >= (caixa?.inicio || 0)) : []

  const abrirCobrancas = (filtro) => { try { sessionStorage.setItem('cobrancas-filtro', filtro) } catch { /* sem acesso */ } irPara('fiado') }

  // cartões de atenção (deslizam para o lado)
  const alertas = [
    atrasadas.length > 0 && { classe: 'bad', titulo: t('{n} parcela(s) atrasada(s)', { n: atrasadas.length }), valor: R(soma(atrasadas)), desc: t('{valor} em atraso. Cobre os clientes.', { valor: R(soma(atrasadas)) }), botao: t('Ver cobranças'), acao: () => abrirCobrancas('atrasados') },
    venceHoje.length > 0 && { classe: 'warn', titulo: t('{n} parcela(s) vence(m) hoje', { n: venceHoje.length }), valor: R(soma(venceHoje)), desc: t('{valor} para receber hoje.', { valor: R(soma(venceHoje)) }), botao: t('Ver cobranças'), acao: () => abrirCobrancas('abertos') },
    custosAPagar.length > 0 && { classe: 'neutro', titulo: t('Custos a pagar'), valor: R(r2(custosAPagar.reduce((s, c) => s + c.valor, 0))), desc: t('{valor} reservado no caixa para pagar fornecedores e materiais.', { valor: R(r2(custosAPagar.reduce((s, c) => s + c.valor, 0))) }), botao: t('Pagar'), acao: () => irPara('caixa') },
    acabando.length > 0 && { classe: 'warn', titulo: t('Acabando no estoque'), valor: acabando.slice(0, 3).map((p) => `${p.produto} (${p.saldo})`).join(', ') + (acabando.length > 3 ? '…' : ''), desc: acabando.slice(0, 3).map((p) => `${p.produto} (${p.saldo})`).join(', ') + (acabando.length > 3 ? '…' : ''), botao: t('Ver estoque'), acao: () => irPara('estoque') },
  ].filter(Boolean)

  // botões redondos de ação rápida
  const acoes = [
    { nome: 'Vender', icone: IconeCarrinho, acao: () => irPara('vendas'), destaque: true },
    { nome: 'Receber', icone: IconeFiado, acao: () => abrirCobrancas('abertos') },
    completo && { nome: 'Retirar', icone: IconeCaixa, acao: () => irPara('caixa') },
    { nome: 'Estoque', icone: IconeCaixaProduto, acao: () => irPara('estoque') },
    { nome: 'Clientes', icone: IconeUsuarios, acao: () => irPara('clientes') },
    { nome: 'Calculadora', icone: IconeCalculadora, acao: () => setCalculadora(true) },
  ].filter(Boolean)

  const primeiroNome = String(nome || '').trim().split(/\s+/)[0]

  return (
    <section className="inicio">
      <h2>{t('Início')}</h2>

      {/* saudação: foto (abre Minha conta), olá, esconder valores e avisos */}
      <div className="in-topo">
        <button className="in-foto" onClick={() => irPara('perfil')} aria-label={t('Minha conta')}><Avatar perfil={perfil} nome={nome} /></button>
        <div className="in-ola"><small>{t('Olá,')}</small><b>{primeiroNome}</b></div>
        <button className="in-icone" onClick={alternarOculto} aria-label={oculto ? t('Mostrar valores') : t('Esconder valores')}>{oculto ? <IconeOlhoFechado /> : <IconeOlho />}</button>
        <button className="in-icone" onClick={() => setVerAvisos(true)} aria-label={t('Notificações')}>
          <IconeSino />{alertas.length > 0 && <span className="in-bolinha" />}
        </button>
      </div>
      {verAvisos && (
        <div className="notif-fundo" onClick={() => setVerAvisos(false)}>
          <div className="notif-folha" role="dialog" aria-label={t('Notificações')} onClick={(e) => e.stopPropagation()}>
            <div className="notif-topo"><button className="in-icone" onClick={() => setVerAvisos(false)} aria-label={t('Fechar')}><IconeFechar /></button></div>
            <h2 className="notif-titulo">{t('Notificações')}</h2>
            <p className="notif-sub">{alertas.length ? t('Resolva os itens para deixar a loja em dia') : t('Tudo em dia. Nenhuma notificação agora.')}</p>
            {alertas.map((a, i) => (
              <button key={i} className={'notif-item' + (a.classe === 'bad' ? ' urgente' : '')} onClick={() => { setVerAvisos(false); a.acao() }}>
                {a.classe === 'bad' ? <span className="notif-alerta">!</span> : <span className={'notif-ponto ' + a.classe} />}
                <span className="notif-txt"><b>{a.titulo}</b><small>{a.desc}</small></span>
                <IconeDireita />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* valor grande: livre para você (dono) ou vendido hoje (vendedor) */}
      {completo ? (
        <button className="in-saldo" onClick={() => irPara('caixa')}>
          <span><small>{t('Saldo disponível')}</small><b className={livre != null && livre < 0 ? 'bad' : ''}>{livre == null ? R(0) : livre < 0 ? '− ' + R(-livre) : R(livre)}</b>
            {caixa && reservado > 0 && <small className="in-sub">{t('{valor} reservado para custos', { valor: R(reservado) })}</small>}
            {!caixa && <small className="in-sub">{t('Comece o controle de caixa')}</small>}</span>
          <IconeDireita />
        </button>
      ) : (
        <div className="in-saldo"><span><small>{t('Vendido hoje')}</small><b>{R(vendido)}</b><small className="in-sub">{t('{n} venda(s)', { n: vendasHoje.length })}</small></span></div>
      )}

      <button className="in-receber" onClick={() => abrirCobrancas('abertos')}>
        <span className="in-receber-icone"><IconeFiado /></span>
        <span><small>{t('A receber')}</small><b>{R(aReceber)}</b>{semana > 0 && <small className="in-sub">{t('{valor} nos próximos 7 dias', { valor: R(semana) })}</small>}</span>
        <IconeDireita />
      </button>

      <div className="in-acoes">
        {acoes.map((a) => (
          <button key={a.nome} className={'in-acao' + (a.destaque ? ' destaque' : '')} onClick={a.acao}>
            <span className="in-acao-circulo"><a.icone /></span>
            <span>{t(a.nome)}</span>
          </button>
        ))}
      </div>

      {alertas.length > 0 && (
        <div className="in-cartoes">
          {alertas.map((a, i) => (
            <div key={i} className={'in-cartao ' + a.classe}>
              <small>{a.titulo}</small>
              <b>{a.valor}</b>
              <button className="sec" onClick={a.acao}>{a.botao}</button>
            </div>
          ))}
        </div>
      )}

      <h3 className="in-titulo">{t('Hoje')}</h3>
      <div className="in-hoje">
        <div className="in-numero"><small>{t('Vendido hoje')}</small><b>{R(vendido)}</b><small>{t('{n} venda(s)', { n: vendasHoje.length })}</small></div>
        {completo && <div className="in-numero"><small>{t('Lucro de hoje')}</small><b className={lucro < 0 ? 'bad' : 'ok'}>{lucro < 0 ? '− ' + R(-lucro) : R(lucro)}</b></div>}
      </div>

      <div className="painel in-vendas-painel">
        <div className="painel-titulo inicio-titulo">
          <h3>{t('Últimas vendas de hoje')}</h3>
          {vendasHoje.length > 0 && <button className="link pequeno" onClick={() => irPara('vendas')}>{t('Ver todas')} →</button>}
        </div>
        {vendasHoje.length === 0 ? <p className="vazio">{t('Nenhuma venda hoje ainda.')}</p> : (
          <div className="inicio-vendas">
            {vendasHoje.slice(0, 5).map((v) => (
              <div key={v.id} className="inicio-venda">
                <span className="iv-hora">{hora(v.data)}</span>
                <span className="iv-itens">{(v.itens || []).map((i) => `${i.qtd}× ${i.produto}`).join(', ')}<small>{pagamentosDaVenda(v).map((p) => t(p.forma)).join(' + ')}</small></span>
                <b className="iv-total">{R(faturamentoVenda(v))}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      {calculadora && <Calculadora onFechar={() => setCalculadora(false)} />}
    </section>
  )
}
