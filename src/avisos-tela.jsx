// Avisos na tela, no mesmo estilo do PJ CRM:
//  - aviso.ok / aviso.erro / aviso.info / aviso.alerta: notificação no canto (biblioteca "sonner",
//    canto inferior direito, cores para sucesso/erro, botão de fechar, some sozinha em 4 s)
//  - confirmar(texto): janela de confirmação no lugar do confirm() do navegador (devolve true/false)
//  - perguntar(texto, padrão): janela com um campo no lugar do prompt() (devolve o texto ou null)
import { useEffect, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { t } from './i18n.js'

const opcoes = (descricao, extra) => ({ ...(descricao ? { description: descricao } : {}), ...extra })
export const aviso = {
  ok: (msg, descricao) => toast.success(msg, opcoes(descricao)),
  erro: (msg, descricao) => toast.error(msg, opcoes(descricao, { duration: 6000 })),
  info: (msg, descricao) => toast.info(msg, opcoes(descricao)),
  alerta: (msg, descricao) => toast.warning(msg, opcoes(descricao, { duration: 6000 })),
}

let abrir = null // a janela é montada uma vez (AvisosNaTela) e recebe os pedidos por aqui

// Pede confirmação. opções: { titulo, botao, perigo } — perigo deixa o botão vermelho (excluir, suspender...)
export function confirmar(texto, { titulo, botao, perigo } = {}) {
  const perigoso = perigo ?? /\b(excluir|apagar|remover|tirar|suspender|recusar|arquivar|cancelar o convite|substituir)\b/i.test(texto)
  return new Promise((resolver) => {
    if (!abrir) return resolver(window.confirm(texto))
    abrir({ tipo: 'confirmar', texto, titulo, botao, perigo: perigoso, resolver })
  })
}

// Pede um texto. Devolve o texto digitado, ou null se cancelar.
export function perguntar(texto, padrao = '', { titulo, botao, perigo } = {}) {
  return new Promise((resolver) => {
    if (!abrir) return resolver(window.prompt(texto, padrao))
    abrir({ tipo: 'perguntar', texto, padrao: padrao ?? '', titulo, botao, perigo, resolver })
  })
}

// Montado uma vez, na raiz do app: as notificações e a janela de confirmação
export function AvisosNaTela() {
  const [pedido, setPedido] = useState(null)
  const [valor, setValor] = useState('')
  const [tema, setTema] = useState(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  const refBotao = useRef(null)
  const refCampo = useRef(null)

  useEffect(() => {
    abrir = (p) => { setValor(p.padrao ?? ''); setPedido(p) }
    // acompanha o tema claro/escuro do app
    const obs = new MutationObserver(() => setTema(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { abrir = null; obs.disconnect() }
  }, [])

  useEffect(() => {
    if (!pedido) return
    const foco = setTimeout(() => (pedido.tipo === 'perguntar' ? refCampo.current?.select() : refBotao.current?.focus()), 30)
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); fechar(false) } }
    document.addEventListener('keydown', tecla)
    return () => { clearTimeout(foco); document.removeEventListener('keydown', tecla) }
  }, [pedido]) // eslint-disable-line react-hooks/exhaustive-deps

  function fechar(ok) {
    if (!pedido) return
    pedido.resolver(pedido.tipo === 'perguntar' ? (ok ? valor : null) : ok)
    setPedido(null)
  }

  // título: o informado, ou a primeira frase do texto (o resto vira a descrição)
  let titulo = pedido?.titulo
  let descricao = pedido?.texto || ''
  if (pedido && !titulo) {
    const quebra = descricao.search(/\n|(?<=[?.:])\s/)
    if (quebra > 0 && quebra < descricao.length - 1) { titulo = descricao.slice(0, quebra + 1).trim(); descricao = descricao.slice(quebra + 1).trim() }
    else { titulo = descricao; descricao = '' }
  }

  return (
    <>
      <Toaster
        theme={tema}
        position="bottom-right"
        richColors
        closeButton
        duration={4000}
        toastOptions={{ className: 'aviso-toast' }}
        mobileOffset={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))', left: '0.75rem', right: '0.75rem' }}
      />
      {pedido && (
        <div className="dialogo-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar(false)}>
          <div className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo" aria-describedby="dialogo-texto">
            <h2 id="dialogo-titulo">{titulo}</h2>
            {descricao && <p id="dialogo-texto">{descricao}</p>}
            <form onSubmit={(e) => { e.preventDefault(); fechar(true) }}>
              {pedido.tipo === 'perguntar' && (
                <input ref={refCampo} className="dialogo-campo" value={valor} onChange={(e) => setValor(e.target.value)} />
              )}
              <div className="dialogo-botoes">
                <button type="button" className="sec" onClick={() => fechar(false)}>{t('Cancelar')}</button>
                <button ref={refBotao} type="submit" className={pedido.perigo ? 'perigo' : ''}>
                  {pedido.botao || (pedido.tipo === 'perguntar' ? t('OK') : pedido.perigo ? t('Confirmar') : t('Continuar'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
