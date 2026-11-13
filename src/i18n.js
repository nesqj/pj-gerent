// Traduções. O texto em português é a "chave": t('Salvar') → 'Save' em inglês.
// Variáveis entram com {nome}: t('Restam {n} unidades', { n: 3 }).
// Para traduzir um texto novo, use t('...') no componente e adicione a linha em traducoes/en.js.
import en from './traducoes/en.js'

export const IDIOMAS = [
  { id: 'pt-BR', nome: 'Português (BR)' },
  { id: 'en-US', nome: 'English (US)' },
]

let IDIOMA = 'pt-BR'
const faltando = new Set()

export function definirIdioma(id) {
  IDIOMA = id === 'en-US' ? 'en-US' : 'pt-BR'
  if (typeof document !== 'undefined') document.documentElement.lang = IDIOMA
}

export const idioma = () => IDIOMA
export const emIngles = () => IDIOMA === 'en-US'

export function t(texto, vars) {
  let s = texto
  if (IDIOMA === 'en-US') {
    if (en[texto] != null) s = en[texto]
    else if (import.meta.env.DEV && !faltando.has(texto)) {
      faltando.add(texto)
      console.warn('[i18n] sem tradução:', texto)
    }
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m))
  return s
}
