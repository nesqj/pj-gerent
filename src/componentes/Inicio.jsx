import { t } from '../i18n.js'
import { podeFazer } from '../armazenamento.js'
import { brl, calcularEstoque, dataBR, extratoCaixa, hoje, hora, lucroVenda, pagamentosDaVenda, recebidoDaParcela, situacaoParcela } from '../utils.js'

// Início: o que está acontecendo hoje, numa olhada só. Não calcula nada novo:
// usa as mesmas contas do Novo Registro (vendas do dia), do Controle de caixa (saldo),
// de Cobranças (a receber e atrasados) e do Estoque (o que está acabando).
// completo = false (vendedor): sem lucro e sem saldo do caixa.
const r2 = (x) => Math.round(x * 100) / 100
const somarDias = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

export default function Inicio({ db, irPara, completo }) {
  const dia = hoje()
  const emprestimos = podeFazer('emprestimo.salvo')

  // vendas de hoje
  const vendasHoje = (db.vendas || []).filter((v) => v.dia === dia).sort((a, b) => b.data - a.data)
  const vendido = r2(vendasHoje.reduce((s, v) => s + (+v.total || 0), 0))
  const lucro = r2(vendasHoje.reduce((s, v) => s + lucroVenda(v).lucro, 0))

  // caixa
  const caixa = completo ? extratoCaixa(db) : null

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

  // estoque acabando (1 ou 2 unidades)
  const acabando = [...calcularEstoque(db).values()].filter((p) => p.saldo > 0 && p.saldo <= 2).sort((a, b) => a.saldo - b.saldo)

  const abrirCobrancas = (filtro) => { try { sessionStorage.setItem('cobrancas-filtro', filtro) } catch { /* sem acesso */ } irPara('fiado') }
  const abrirRegistro = (modo) => { try { sessionStorage.setItem('registro-modo', modo) } catch { /* sem acesso */ } irPara('vendas') }
  const alertas = [
    atrasadas.length > 0 && { classe: 'bad', texto: t('{n} parcela(s) atrasada(s) · {valor}', { n: atrasadas.length, valor: brl(soma(atrasadas)) }), acao: () => abrirCobrancas('atrasados'), botao: t('Ver cobranças') },
    venceHoje.length > 0 && { classe: 'warn', texto: t('{n} parcela(s) vence(m) hoje · {valor}', { n: venceHoje.length, valor: brl(soma(venceHoje)) }), acao: () => abrirCobrancas('abertos'), botao: t('Ver cobranças') },
    acabando.length > 0 && { classe: 'warn', texto: t('Acabando no estoque: {lista}', { lista: acabando.slice(0, 4).map((p) => `${p.produto} (${p.saldo})`).join(', ') + (acabando.length > 4 ? '…' : '') }), acao: () => irPara('estoque'), botao: t('Ver estoque') },
  ].filter(Boolean)

  return (
    <section className="inicio">
      <h2>{t('Início')}</h2>
      <p className="inicio-data"><small>{t('Hoje, {data}', { data: dataBR(dia) })}</small></p>

      <div className="inicio-atalhos">
        <button onClick={() => abrirRegistro('venda')}>+ {t('Nova venda')}</button>
        {emprestimos && <button className="sec" onClick={() => abrirRegistro('emprestimo')}>+ {t('Empréstimo')}</button>}
      </div>

      <div className="cards">
        <div className="card destaque"><small>{t('Vendido hoje')}</small><b>{brl(vendido)}</b><small className="var">{t('{n} venda(s)', { n: vendasHoje.length })}</small></div>
        {completo && (
          <div className="card"><small>{t('Lucro de hoje')}</small><b className={lucro < 0 ? 'bad' : 'ok'}>{lucro < 0 ? '− ' + brl(-lucro) : brl(lucro)}</b></div>
        )}
        {completo && (
          <button className="card card-link" onClick={() => irPara('caixa')}>
            <small>{t('Saldo do caixa')}</small>
            {caixa ? <b className={caixa.saldo < 0 ? 'bad' : ''}>{caixa.saldo < 0 ? '− ' + brl(-caixa.saldo) : brl(caixa.saldo)}</b> : <b className="mut">—</b>}
            {!caixa && <small className="var">{t('Comece o controle de caixa')}</small>}
          </button>
        )}
        <button className="card card-link" onClick={() => abrirCobrancas('abertos')}>
          <small>{t('A receber')}</small><b>{brl(aReceber)}</b>
          <small className="var">{t('{valor} nos próximos 7 dias', { valor: brl(semana) })}</small>
        </button>
      </div>

      {alertas.length > 0 && (
        <div className="painel inicio-alertas">
          <h3 className="painel-titulo">{t('Precisa de atenção')}</h3>
          {alertas.map((a, i) => (
            <div key={i} className="inicio-alerta">
              <span className={'ponto-alerta ' + a.classe} />
              <span className="inicio-alerta-texto">{a.texto}</span>
              <button className="link pequeno" onClick={a.acao}>{a.botao} →</button>
            </div>
          ))}
        </div>
      )}

      <div className="painel">
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
                <b className="iv-total">{brl(v.total)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
