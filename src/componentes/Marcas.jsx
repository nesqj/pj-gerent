import { useState } from 'react'
import { aviso, confirmar, perguntar } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { norm } from '../utils.js'

// Editor da lista de marcas de um fornecedor: digita, Enter/Adicionar, renomeia no ✎ e remove no ×.
// onRenomear(antiga, nova) é opcional: quando existe, quem usa o editor também atualiza os produtos daquela marca.
export function EditorMarcas({ marcas, onChange, onRenomear, emUso = {} }) {
  const [nova, setNova] = useState('')

  function adicionar() {
    const m = nova.trim()
    if (!m) return
    if (!marcas.some((x) => norm(x) === norm(m))) onChange([...marcas, m].sort((a, b) => a.localeCompare(b)))
    setNova('')
  }

  async function renomear(m) {
    const nova = (await perguntar(t('Novo nome para a marca "{marca}":', { marca: m }), m, { botao: t('Renomear') }))?.trim()
    if (!nova || nova === m) return
    if (marcas.some((x) => x !== m && norm(x) === norm(nova))) return aviso.alerta(t('Já existe a marca "{marca}" neste fornecedor.', { marca: nova }))
    const lista = marcas.map((x) => (x === m ? nova : x)).sort((a, b) => a.localeCompare(b))
    if (onRenomear) onRenomear(m, nova, lista)
    else onChange(lista)
  }

  async function remover(m) {
    const n = emUso[norm(m)] || 0
    if (n && !await confirmar(t('A marca "{marca}" está em {n} produto(s) deste fornecedor. Remover da lista mesmo assim?\n(Os produtos continuam cadastrados.)', { marca: m, n }))) return
    onChange(marcas.filter((x) => x !== m))
  }

  return (
    <div className="editor-marcas">
      <div className="editor-marcas-campo">
        <input
          placeholder={t('Digite uma marca e aperte Enter')}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
        />
        <button type="button" className="sec" onClick={adicionar}>{t('Adicionar marca')}</button>
      </div>
      <div className="chips">
        {marcas.length === 0 && <small>{t('Nenhuma marca cadastrada.')}</small>}
        {marcas.map((m) => (
          <span key={m} className="chip">
            <button type="button" className="chip-nome" title={t('Renomear {marca}', { marca: m })} onClick={() => renomear(m)}>{m}</button>
            <button type="button" title={t('Renomear {marca}', { marca: m })} onClick={() => renomear(m)}>✎</button>
            <button type="button" title={t('Remover {marca}', { marca: m })} onClick={() => remover(m)}>×</button>
          </span>
        ))}
      </div>
    </div>
  )
}

// Caixa de seleção com as marcas do fornecedor escolhido
export function SelectMarca({ fornecedor, value, onChange }) {
  const marcas = fornecedor?.marcas || []
  // ao editar um preço antigo, mantém a marca dele mesmo que não esteja mais na lista
  const opcoes = value && !marcas.includes(value) ? [value, ...marcas] : marcas
  return (
    <select required value={value} onChange={onChange} disabled={!fornecedor || opcoes.length === 0}>
      <option value="">
        {!fornecedor ? t('Escolha o fornecedor primeiro') : opcoes.length ? t('Selecione a marca...') : t('Fornecedor sem marcas')}
      </option>
      {opcoes.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  )
}
