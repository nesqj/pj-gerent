// Guia rápido de uso, com atalhos para cada tela. Os textos são traduzidos na tela com t().
import { t } from '../i18n.js'

const TOPICOS = [
  {
    aba: 'vendas', nome: 'Novo Registro',
    texto: 'Escolha o produto, a quantidade e clique em Adicionar. Produtos do estoque pedem o preço vendido; produtos dos fornecedores já vêm com o preço definido na aba Fornecedores. No fim, escolha a forma de pagamento e clique em Finalizar venda. Na lista do dia dá para editar ou excluir uma venda.',
  },
  {
    aba: 'analise', nome: 'Análise',
    texto: 'Mostra faturamento, lucro, margem, ticket médio e os produtos e marcas que mais vendem. Escolha o período no topo; os números são comparados com o período anterior do mesmo tamanho.',
  },
  {
    aba: 'forn', nome: 'Fornecedores',
    texto: 'Cadastre o fornecedor, de onde ele é, contato e as marcas que ele trabalha. Clique no cartão para abrir a página dele, onde ficam os produtos e preços só daquele fornecedor. Embaixo fica a tabela de produtos com o preço de venda: na coluna Regra você escolhe a regra de cada produto, sem regra ou um preço fixo.',
  },
  {
    aba: 'estoque', nome: 'Estoque',
    texto: 'Registre os produtos que chegaram para revenda com quantidade e custo. Cada venda de um produto do estoque diminui a quantidade. As entradas podem ser editadas ou excluídas.',
  },
  {
    aba: 'regra', nome: 'Regra de Preço',
    texto: 'Crie várias regras com nome e a porcentagem de aumento sobre o custo, e escolha a regra padrão para os produtos sem regra própria.',
  },
  {
    aba: 'config', nome: 'Configurações',
    texto: 'Perfil (nome, idioma, tema e fuso), marca da empresa, app no celular e cópia de segurança dos dados.',
  },
]

export default function Ajuda({ irPara }) {
  return (
    <section>
      <h2>{t('Ajuda')}</h2>
      <p><small>{t('Guia rápido de cada tela. Clique no nome para abrir.')}</small></p>
      <div className="ajuda">
        {TOPICOS.map((tp) => (
          <div key={tp.aba} className="painel">
            <button className="link" onClick={() => irPara(tp.aba)}>{t(tp.nome)} →</button>
            <p>{t(tp.texto)}</p>
          </div>
        ))}
      </div>
      <div className="painel">
        <h3 style={{ marginBottom: 8 }}>{t('Dicas')}</h3>
        <ul className="dicas">
          <li>{t('Todo cadastro tem botões de Editar e Excluir.')}</li>
          <li>{t('No celular, o menu abre pelo botão ☰ no topo.')}</li>
          <li>{t('O botão « no topo do menu deixa a barra lateral só com os ícones.')}</li>
          <li>{t('Tema claro ou escuro e idioma ficam em Configurações → Perfil.')}</li>
        </ul>
      </div>
    </section>
  )
}
