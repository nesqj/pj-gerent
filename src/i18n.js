// Traduções. O texto em português é a "chave": t('Salvar') → 'Save' em inglês.
// Variáveis entram com {nome}: t('Restam {n} unidades', { n: 3 }).
// Para traduzir um texto novo, use t('...') no componente e adicione a linha em traducoes/en.js.
// O arquivo em inglês só é baixado quando alguém escolhe inglês (quem usa português não carrega ele).

export const IDIOMAS = [
  { id: 'pt-BR', nome: 'Português (BR)' },
  { id: 'en-US', nome: 'English (US)' },
]

let IDIOMA = 'pt-BR'
let en = null            // traduções em inglês (carregadas sob demanda)
let carregando = null
const avisar = new Set() // quem quer saber quando as traduções chegarem (para redesenhar a tela)
const faltando = new Set()

export function definirIdioma(id) {
  IDIOMA = id === 'en-US' ? 'en-US' : 'pt-BR'
  if (typeof document !== 'undefined') document.documentElement.lang = IDIOMA
  if (IDIOMA === 'en-US' && !en && !carregando) {
    carregando = import('./traducoes/en.js')
      .then((m) => { en = m.default; avisar.forEach((f) => f()) })
      .catch(() => { carregando = null })
  }
}

// Avisa quando as traduções terminam de carregar; devolve a função para parar de ouvir
export function aoCarregarIdioma(f) {
  avisar.add(f)
  return () => avisar.delete(f)
}

export const idioma = () => IDIOMA

export function t(texto, vars) {
  let s = texto
  if (IDIOMA === 'en-US' && en) {
    if (en[texto] != null) s = en[texto]
    else if (import.meta.env.DEV && !faltando.has(texto)) {
      faltando.add(texto)
      console.warn('[i18n] sem tradução:', texto)
    }
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m))
  return s
}
