// Tabelas no celular: o CSS transforma cada linha num cartão e mostra o nome da coluna ao lado
// de cada valor. Para isso, cada célula precisa saber o nome da sua coluna (atributo data-label).
// Esta função copia o texto dos cabeçalhos para as células — e repete sempre que as tabelas mudam.

function rotular(raiz) {
  for (const tabela of raiz.querySelectorAll('.tw table')) {
    const titulos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent.trim())
    for (const tr of tabela.querySelectorAll('tbody tr')) {
      ;[...tr.children].forEach((td, i) => {
        const rotulo = td.colSpan > 1 ? '' : titulos[i] || ''
        if (td.dataset.label !== rotulo) td.dataset.label = rotulo
      })
    }
  }
}

// Liga a observação; devolve a função para desligar
export function observarTabelas(raiz = document.body) {
  rotular(raiz)
  let pendente = false
  const obs = new MutationObserver(() => {
    if (pendente) return
    pendente = true
    requestAnimationFrame(() => { pendente = false; rotular(raiz) })
  })
  obs.observe(raiz, { childList: true, subtree: true, characterData: true })
  return () => obs.disconnect()
}
