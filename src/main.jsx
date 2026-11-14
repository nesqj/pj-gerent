import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AvisosNaTela } from './avisos-tela.jsx'
import './index.css'

// Guarda o convite de instalação do navegador para o botão "Instalar app" usar depois
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__conviteInstalacao = e
  window.dispatchEvent(new Event('instalacao-disponivel'))
})
window.addEventListener('appinstalled', () => {
  window.__conviteInstalacao = null
  window.dispatchEvent(new Event('instalacao-disponivel'))
})

// Service worker: só na versão publicada (no modo de desenvolvimento atrapalha as atualizações)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <AvisosNaTela />
  </StrictMode>,
)
