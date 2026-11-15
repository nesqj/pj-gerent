import { useRef, useState } from 'react'
import { t } from '../i18n.js'

// Busca de cliente (fiado e empréstimo): digite parte do nome, do CPF ou do telefone.
// clienteId '' = cliente novo (os campos de cadastro aparecem no formulário).
const semAcento = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digitos = (x) => String(x || '').replace(/\D/g, '')

export default function BuscaCliente({ clientes, clienteId, onEscolher, onNovo }) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const lista = useRef(null)
  const campo = useRef(null)
  const escolhido = clientes.find((c) => c.id === clienteId)
  const palavras = semAcento(texto).split(/\s+/).filter(Boolean)
  const achados = [...clientes].sort((a, b) => a.nome.localeCompare(b.nome)).filter((c) => {
    const h = semAcento(c.nome) + ' ' + digitos(c.cpf) + ' ' + digitos(c.telefone)
    // número (CPF/telefone) é comparado só pelos dígitos
    return palavras.every((w) => h.includes(/^[\d.\-()]+$/.test(w) ? digitos(w) : w))
  })
  // a 1ª opção é sempre "Novo cliente" (com o nome digitado, se houver)
  const opcoes = [{ novo: true }, ...achados]
  // destacado: escolhido pelas setas/mouse, ou (-1) automático: o 1º cliente encontrado, senão "Novo cliente"
  const atual = ativo < 0 ? (texto.trim() && achados.length ? 1 : 0) : Math.min(ativo, opcoes.length - 1)
  const fechar = () => { setTexto(''); setAberto(false); campo.current?.blur() }
  const escolher = (o) => {
    if (o.novo) onNovo(texto.trim())
    else onEscolher(o.id)
    fechar()
  }
  const mover = (d) => {
    const n = Math.min(opcoes.length - 1, Math.max(0, atual + d))
    setAtivo(n)
    lista.current?.querySelector('[data-i="' + n + '"]')?.scrollIntoView({ block: 'nearest' })
  }
  function tecla(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!aberto) setAberto(true); else mover(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1) }
    else if (e.key === 'Enter' && aberto) { e.preventDefault(); escolher(opcoes[atual]) }
    else if (e.key === 'Escape') { setAberto(false); setTexto('') }
  }
  const item = (o, i, conteudo) => (
    <button type="button" key={o.novo ? 'novo' : o.id} data-i={i} className={'bp-item' + (i === atual ? ' ativo' : '') + (!o.novo && o.id === clienteId ? ' escolhido' : '')}
      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAtivo(i)} onClick={() => escolher(o)}>{conteudo}</button>
  )
  return (
    <div className="busca-produto">
      <input ref={campo} value={aberto ? texto : (escolhido?.nome || '')} autoComplete="off"
        placeholder={aberto && escolhido ? escolhido.nome : clientes.length ? t('Buscar cliente ou cadastrar novo...') : t('Nome do cliente novo...')}
        onFocus={() => { setAberto(true); setAtivo(-1) }} onBlur={() => { setAberto(false); setTexto('') }}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(-1) }} onKeyDown={tecla} />
      {aberto && (
        <div className="bp-lista" ref={lista}>
          {item(opcoes[0], 0, <span className="bp-nome bp-novo">{texto.trim() ? t('+ Cadastrar "{nome}"', { nome: texto.trim() }) : t('+ Novo cliente')}</span>)}
          {achados.length > 0 && <div className="bp-grupo">{t('Clientes')}</div>}
          {achados.map((c, k) => item(c, k + 1, <span className="bp-nome">{c.nome}<small>{[c.telefone, c.cpf].filter(Boolean).join(' · ')}</small></span>))}
          {texto.trim() && !achados.length && <div className="bp-vazio">{t('Nenhum cliente encontrado.')}</div>}
        </div>
      )}
    </div>
  )
}
