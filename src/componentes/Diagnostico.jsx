// Página de diagnóstico (abrir com ?diagnostico no endereço): testa, passo a passo, o que o app precisa
// para abrir neste navegador e mostra o que falhou. Não usa a tela de login nem os dados da loja.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const URL_BANCO = import.meta.env.VITE_SUPABASE_URL
const CHAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// roda uma etapa com tempo limite e mede quanto demorou
async function etapa(nome, fn, limite = 10000) {
  const ini = performance.now()
  try {
    const detalhe = await Promise.race([fn(), new Promise((_, n) => setTimeout(() => n(new Error(`sem resposta em ${limite / 1000} s`)), limite))])
    return { nome, ok: true, detalhe: detalhe || 'ok', ms: Math.round(performance.now() - ini) }
  } catch (e) {
    return { nome, ok: false, detalhe: `${e?.name || 'Erro'}: ${e?.message || e}`, ms: Math.round(performance.now() - ini) }
  }
}

async function rodarTudo() {
  const r = []
  r.push(await etapa('Navegador', async () => navigator.userAgent))
  r.push(await etapa('Armazenamento do navegador', async () => {
    localStorage.setItem('diag-teste', '1')
    const v = localStorage.getItem('diag-teste')
    localStorage.removeItem('diag-teste')
    if (v !== '1') throw new Error('não guardou')
    return 'funciona'
  }))
  r.push(await etapa('Cópia guardada do app (service worker)', async () => {
    if (!('serviceWorker' in navigator)) return 'não usa'
    const regs = await navigator.serviceWorker.getRegistrations()
    return `${regs.length} registrada(s)${navigator.serviceWorker.controller ? ', controlando a página' : ''}`
  }))
  r.push(await etapa('Trava do navegador (Web Locks)', async () => ('locks' in navigator ? 'existe' : 'não existe')))
  r.push(await etapa('Site (pj-gerent)', async () => {
    const res = await fetch('/manifest.webmanifest?d=' + Date.now(), { cache: 'no-store' })
    return `HTTP ${res.status}`
  }))
  r.push(await etapa('Banco de dados: conexão', async () => {
    const res = await fetch(`${URL_BANCO}/auth/v1/health`, { headers: { apikey: CHAVE }, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return `HTTP ${res.status}`
  }))
  r.push(await etapa('Banco de dados: consulta', async () => {
    const res = await fetch(`${URL_BANCO}/rest/v1/rpc/marca_plataforma`, {
      method: 'POST', headers: { apikey: CHAVE, 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return `HTTP ${res.status}`
  }))
  r.push(await etapa('Login guardado', async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session ? `logado (${data.session.user.email})` : 'ninguém logado'
  }))
  return r
}

export default function Diagnostico() {
  const [resultado, setResultado] = useState(null)
  const [limpando, setLimpando] = useState(false)
  const testar = () => { setResultado(null); rodarTudo().then(setResultado) }
  useEffect(testar, [])

  // apaga o que o app guardou neste navegador (login, preferências, cópia do app) e abre de novo
  async function limpar() {
    if (!window.confirm('Apagar o que o app guardou neste navegador? Você vai precisar entrar de novo com e-mail e senha. Os dados da loja não são apagados.')) return
    setLimpando(true)
    try { localStorage.clear(); sessionStorage.clear() } catch { /* sem acesso */ }
    try { for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister() } catch { /* sem service worker */ }
    try { for (const k of await caches.keys()) await caches.delete(k) } catch { /* sem cache */ }
    window.location.href = '/'
  }

  const falhas = resultado?.filter((x) => !x.ok).length
  return (
    <section style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px calc(24px + env(safe-area-inset-bottom))' }}>
      <h2 style={{ display: 'block', fontSize: 24, margin: '8px 0 6px' }}>Diagnóstico</h2>
      <p style={{ color: 'var(--mut)', margin: '0 0 16px' }}>Tire um print desta tela e mande para o suporte.</p>
      {!resultado ? <p className="vazio">Testando…</p> : (
        <>
          <div className={'diag-resumo ' + (falhas ? 'bad' : 'ok')}>{falhas ? `${falhas} etapa(s) com problema` : 'Tudo certo neste navegador'}</div>
          <div className="diag-lista">
            {resultado.map((x) => (
              <div key={x.nome} className="diag-item">
                <span className={x.ok ? 'ok' : 'bad'}>{x.ok ? '✓' : '✗'}</span>
                <span><b>{x.nome}</b><small>{x.detalhe}{x.ms > 30 ? ` · ${x.ms} ms` : ''}</small></span>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        <button onClick={testar} disabled={!resultado}>Testar de novo</button>
        <button className="sec" onClick={limpar} disabled={limpando}>{limpando ? 'Limpando…' : 'Limpar o que o app guardou neste navegador'}</button>
        <button className="link" style={{ color: 'var(--mut)' }} onClick={() => { window.location.href = '/' }}>Voltar para o app</button>
      </div>
    </section>
  )
}
