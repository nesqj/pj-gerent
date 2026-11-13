import { useEffect, useRef, useState } from 'react'
import { IconeLoja, IconeSeta } from '../icones.jsx'
import { t } from '../i18n.js'

// Seletor de loja no topo: troca de loja e, para o administrador da plataforma, "Gerenciar organizações".
// No celular mostra só o ícone (o nome fica dentro do menu).
export default function SeletorLoja({ lojas, ativa, admin, onTrocar, onGerenciar }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e) => { if (!caixa.current?.contains(e.target)) setAberto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  if (lojas.length <= 1 && !admin) return null
  // a loja aberta pelo administrador pode não estar na lista dele (não é membro)
  const lista = ativa && !lojas.some((l) => l.id === ativa.id) ? [...lojas, ativa] : lojas

  return (
    <div className="seletor-loja" ref={caixa}>
      <button className="seletor-loja-botao" onClick={() => setAberto(!aberto)} aria-haspopup="menu" aria-expanded={aberto}
        aria-label={`${t('Loja')}: ${ativa?.nome || t('Selecionar loja')}`} title={ativa?.nome}>
        <IconeLoja />
        <span className="seletor-loja-nome">{ativa?.nome || t('Selecionar loja')}</span>
        <IconeSeta aberto />
      </button>
      {aberto && (
        <div className="seletor-loja-menu" role="menu">
          {lista.map((l) => (
            <button key={l.id} role="menuitem" className="seletor-loja-item" onClick={() => { setAberto(false); if (l.id !== ativa?.id) onTrocar(l) }}>
              <span>{l.nome}{l.suspensa && <small className="bad"> · {t('Suspensa')}</small>}{['suspensa', 'aguardando'].includes(l.cobranca) && !l.suspensa && <small className="bad"> · {t('Pagamento pendente')}</small>}</span>
              {l.id === ativa?.id && <span className="seletor-loja-marca">✓</span>}
            </button>
          ))}
          {lista.length === 0 && <p className="vazio">{t('Nenhuma loja.')}</p>}
          {admin && (
            <button role="menuitem" className="seletor-loja-item seletor-loja-gerenciar" onClick={() => { setAberto(false); onGerenciar() }}>
              {t('Gerenciar organizações')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
