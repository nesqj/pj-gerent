// Avisos do sistema (notificações do navegador / do app instalado).

export const avisosSuportados = () => typeof window !== 'undefined' && 'Notification' in window

export const permissaoAvisos = () => (avisosSuportados() ? Notification.permission : 'indisponivel')

export async function pedirPermissaoAvisos() {
  if (!avisosSuportados()) return 'indisponivel'
  return Notification.requestPermission()
}

export async function avisar(titulo, corpo) {
  if (permissaoAvisos() !== 'granted') return false
  const opcoes = { body: corpo, icon: '/icone-192.png', badge: '/icone-192.png', lang: 'pt-BR' }
  try {
    // no celular (app instalado) o aviso precisa sair pelo service worker
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null
    if (reg) await reg.showNotification(titulo, opcoes)
    else new Notification(titulo, opcoes)
    return true
  } catch {
    return false
  }
}
