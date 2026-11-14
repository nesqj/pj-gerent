import { useEffect, useState } from 'react'
import { aviso, confirmar, perguntar } from '../avisos-tela.jsx'
import * as Org from '../organizacoes.js'
import { t } from '../i18n.js'
import { brl, dataTs } from '../utils.js'

const reais = (centavos) => brl((centavos || 0) / 100)
const precoPlano = (p) => p && `${reais(p.preco_centavos)} / ${p.intervalo === 'anual' ? t('ano') : t('mês')}`

// Plano e cobrança de uma loja.
//  - na própria loja (Configurações → Plano e cobrança, ou a tela de loja bloqueada): ver, assinar, pagar e trocar de plano
//  - no painel (admin = true): também isentar, registrar pagamento à mão, estender teste e gerar link para mandar
export default function CobrancaLoja({ orgId, admin = false, onMudou }) {
  const [c, setC] = useState(null)
  const [erro, setErro] = useState('')
  const [lista, setLista] = useState([])
  const [doc, setDoc] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [link, setLink] = useState('')

  async function carregar() {
    setErro('')
    try {
      setC(await Org.cobrancaDaOrg(orgId))
      setLista(await Org.planos())
    } catch (e) { setErro(e.message) }
  }
  useEffect(() => { carregar() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fazer(nome, fn) {
    setOcupado(nome)
    try { await fn(); await carregar(); onMudou?.() } catch (e) { aviso.erro(e.message) } finally { setOcupado('') }
  }

  async function pagar(soLink = false) {
    setOcupado('pagar')
    try {
      const r = await Org.servidor('pagar', { org: orgId, cpfCnpj: doc, voltar: window.location.origin + '/' })
      if (soLink) { setLink(r.url); await carregar() } else window.location.href = r.url
    } catch (e) { aviso.erro(e.message) } finally { setOcupado('') }
  }

  async function trocar(planoId) {
    if (!planoId || planoId === c.plano?.id) return
    const p = lista.find((x) => x.id === planoId)
    if (!await confirmar(t('Trocar para o plano {plano} ({preco})?', { plano: p?.nome, preco: precoPlano(p) }))) return
    await fazer('plano', async () => {
      const r = await Org.trocarPlano(orgId, planoId)
      if (r?.sincronizar) await Org.servidor('sincronizar', { org: orgId })
    })
  }

  if (erro) return <div className="painel"><p className="bad">{erro}</p><button className="sec" onClick={carregar}>{t('Tentar de novo')}</button></div>
  if (!c) return <p className="vazio">{t('Carregando...')}</p>
  if (!c.ligada && !admin) return <div className="painel"><p>{t('A cobrança não está ligada. O uso do sistema não tem custo agora.')}</p></div>

  const s = c.situacao
  const venc = [c.teste_ate, c.pago_ate].filter(Boolean).map((d) => new Date(d)).sort((a, b) => b - a)[0]
  const limite = venc && new Date(venc.getTime() + c.tolerancia_dias * 86400000)
  const podePagar = c.ligada && c.plano && !c.isenta && c.provedor_config
  const asaasSemAssinatura = c.provedor_config === 'asaas' && !c.tem_assinatura
  const opcoes = lista.filter((p) => admin || p.visivel)

  return (
    <>
      <div className="cards">
        <div className="card"><small>{t('Situação')}</small><b className={Org.SITUACOES[s]?.classe}>{Org.nomeSituacao(s)}</b></div>
        <div className="card"><small>{t('Plano')}</small><b>{c.plano ? c.plano.nome : t('Sem plano')}</b>{c.plano && <small>{precoPlano(c.plano)}</small>}</div>
        {s === 'teste' && <div className="card"><small>{t('Teste grátis até')}</small><b>{dataTs(c.teste_ate)}</b></div>}
        {c.pago_ate && <div className="card"><small>{t('Pago até')}</small><b>{dataTs(c.pago_ate)}</b></div>}
        {c.plano?.max_pessoas && <div className="card"><small>{t('Pessoas')}</small><b>{c.pessoas} / {c.plano.max_pessoas}</b></div>}
      </div>

      {s === 'atrasada' && <p className="bad">{t('O pagamento venceu. A loja continua funcionando até {data}; depois disso fica suspensa até o pagamento.', { data: dataTs(limite) })}</p>}
      {s === 'suspensa' && <p className="bad">{t('A loja está suspensa por falta de pagamento. Pague para voltar a usar na hora.')}</p>}
      {s === 'aguardando' && <p className="bad">{t('Este plano não tem teste grátis: a loja libera quando o primeiro pagamento for confirmado.')}</p>}
      {c.cancelada_em && <p><small className="bad">{t('A assinatura foi cancelada no provedor em {data}.', { data: dataTs(c.cancelada_em) })}</small></p>}
      {!c.ligada && <p><small>{t('A cobrança está desligada: nenhuma loja paga enquanto ela estiver assim.')}</small></p>}

      {podePagar && (
        <div className="painel">
          {asaasSemAssinatura && (
            <label className="campo-doc">{t('CPF ou CNPJ de quem paga')}
              <input inputMode="numeric" maxLength={18} placeholder="000.000.000-00" value={doc} onChange={(e) => setDoc(e.target.value)} />
              <small>{t('Vai direto para o Asaas; não fica guardado no sistema.')}</small>
            </label>
          )}
          <div className="botoes">
            <button disabled={!!ocupado || (asaasSemAssinatura && ![11, 14].includes(doc.replace(/\D/g, '').length))} onClick={() => pagar(false)}>
              {ocupado === 'pagar' ? t('Aguarde...')
                : !c.tem_assinatura ? t('Assinar')
                  : s === 'em_dia' || s === 'teste' ? (c.provedor_config === 'stripe' ? t('Gerenciar pagamento') : t('Ver fatura'))
                    : t('Pagar agora')}
            </button>
            {admin && s !== 'em_dia' && (
              <button className="sec" disabled={!!ocupado || (asaasSemAssinatura && ![11, 14].includes(doc.replace(/\D/g, '').length))} onClick={() => pagar(true)}>{t('Gerar link de pagamento')}</button>
            )}
          </div>
          {link && (
            <div className="link-pagamento">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button className="sec" onClick={() => navigator.clipboard?.writeText(link).then(() => aviso.ok(t('Link copiado.')))}>{t('Copiar link de pagamento')}</button>
            </div>
          )}
          <p><small>{c.provedor_config === 'asaas'
            ? t('Pagamento pelo Asaas: Pix, boleto ou cartão, escolhido na fatura. Pix confirma em minutos; boleto em até 1 dia útil.')
            : t('Pagamento pela Stripe: cartão, cobrado sozinho a cada período.')}</small></p>
        </div>
      )}
      {c.ligada && c.plano && !c.provedor_config && !c.isenta && <p><small>{t('O pagamento online ainda não foi configurado pelo administrador da plataforma.')}</small></p>}

      {(opcoes.length > 0 && (admin || ((s === 'teste' || s === 'aguardando' || !c.tem_assinatura) && !['atrasada', 'suspensa'].includes(s)))) && (
        <label className="campo-plano">{c.plano ? t('Trocar de plano') : t('Escolher plano')}
          <select value={c.plano?.id || ''} disabled={!!ocupado} onChange={(e) => trocar(e.target.value)}>
            {!c.plano && <option value="">{t('Escolha...')}</option>}
            {opcoes.map((p) => <option key={p.id} value={p.id}>{p.nome} — {precoPlano(p)}{p.max_pessoas ? ` · ${t('até {n} pessoas', { n: p.max_pessoas })}` : ''}{!p.visivel ? ` · ${t('só você atribui')}` : ''}</option>)}
          </select>
          {c.tem_assinatura && <small>{t('Quem já assina passa a pagar o valor novo a partir da próxima cobrança.')}</small>}
        </label>
      )}

      {admin && (
        <div className="painel">
          <p><b>{t('Ações do administrador da plataforma')}</b></p>
          <div className="botoes">
            {c.plano && (c.isenta
              ? <button className="sec" disabled={!!ocupado} onClick={() => fazer('isentar', () => Org.isentarLoja(orgId, false))}>{t('Voltar a cobrar')}</button>
              : <button className="sec" disabled={!!ocupado} onClick={async () => await confirmar(t('Isentar esta loja? Ela passa a usar de graça, sem limite.')) && fazer('isentar', () => Org.isentarLoja(orgId, true))}>{t('Isentar de cobrança')}</button>)}
            {c.plano && !c.isenta && (
              <button className="sec" disabled={!!ocupado} onClick={async () => {
                const v = await perguntar(t('Valor recebido (R$):'), String((c.plano.preco_centavos / 100).toFixed(2)).replace('.', ','))
                if (v == null) return
                const centavos = Math.round(Number(v.replace(/\./g, '').replace(',', '.')) * 100)
                if (!(centavos > 0)) return aviso.alerta(t('Valor inválido.'))
                const obs = await perguntar(t('Observação (opcional), por exemplo "Pix de 13/11":'), '') || ''
                fazer('pago', () => Org.marcarPago(orgId, centavos, obs))
              }}>{t('Registrar pagamento à mão')}</button>
            )}
            {c.plano && !c.isenta && (
              <button className="sec" disabled={!!ocupado} onClick={async () => {
                const d = Number(await perguntar(t('Estender o teste grátis em quantos dias? (1 a 90)'), '7'))
                if (d >= 1 && d <= 90) fazer('teste', () => Org.estenderTeste(orgId, d))
              }}>{t('Estender teste grátis')}</button>
            )}
          </div>
        </div>
      )}

      {c.pagamentos.length > 0 && (
        <>
          <div className="linha-titulo"><h3>{t('Pagamentos')}</h3></div>
          <div className="tw">
            <table>
              <thead><tr><th>{t('Data')}</th><th className="n">{t('Valor')}</th><th>{t('Cobre até')}</th><th>{t('Por')}</th><th>{t('Obs.')}</th></tr></thead>
              <tbody>
                {c.pagamentos.map((p) => (
                  <tr key={p.id}>
                    <td>{dataTs(p.pago_em)}</td><td className="n">{reais(p.valor_centavos)}</td><td>{p.cobre_ate ? dataTs(p.cobre_ate) : '-'}</td>
                    <td>{{ manual: t('À mão'), stripe: 'Stripe', asaas: 'Asaas' }[p.provedor] || p.provedor}</td><td className="quebra">{p.observacao || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
