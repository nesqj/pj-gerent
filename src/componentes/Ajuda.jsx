// Central de ajuda: um guia rápido de cada tela, com atalho para abrir. Os textos são traduzidos com t().
import { t } from '../i18n.js'
import { IconeCaixaProduto, IconeCaminhao, IconeCarrinho, IconeConfig, IconeDireita, IconeExtrato, IconeFiado, IconeGrafico, IconeInicio, IconeUsuarios } from '../icones.jsx'

const TOPICOS = [
  { aba: 'inicio', nome: 'Início', icone: IconeInicio,
    texto: 'O resumo do dia: saldo disponível, o que você tem a receber, as vendas de hoje e atalhos. Toque no olho para esconder os valores e no sino para ver os avisos.' },
  { aba: 'vendas', nome: 'Vender', icone: IconeCarrinho,
    texto: 'Toque em Realizar venda, escolha o produto, a quantidade e toque em Adicionar. Produtos do estoque pedem o preço vendido; produtos dos fornecedores já vêm com o preço definido na aba Fornecedores. No fim, escolha a forma de pagamento e toque em Finalizar venda. Na lista do dia dá para excluir uma venda. Os empréstimos também são feitos aqui, e a calculadora no canto de cima mostra quanto o cliente paga com a taxa da maquininha.' },
  { aba: 'fiado', nome: 'Cobranças', icone: IconeFiado,
    texto: 'Tudo o que ficou para receber: vendas fiado e empréstimos, parcela por parcela. Marque Recebeu ou Não pagou, mude a data combinada e cobre pelo WhatsApp.' },
  { aba: 'caixa', nome: 'Extrato', icone: IconeExtrato,
    texto: 'O dinheiro da loja: saldo disponível, o que entrou e saiu em cada dia, os custos a pagar e os botões para colocar ou retirar dinheiro.' },
  { aba: 'analise', nome: 'Análise', icone: IconeGrafico,
    texto: 'Faturamento, lucro, margem e os produtos que mais vendem. Escolha o período no topo; os números são comparados com o período anterior do mesmo tamanho.' },
  { aba: 'estoque', nome: 'Estoque', icone: IconeCaixaProduto,
    texto: 'Registre os produtos que chegaram para revenda com quantidade e custo. Cada venda de um produto do estoque diminui a quantidade.' },
  { aba: 'forn', nome: 'Fornecedores', icone: IconeCaminhao,
    texto: 'Cadastre de quem você compra, com o contato e as marcas. Toque no fornecedor para ver os produtos e os preços de custo dele. Embaixo fica a tabela com o preço de venda de cada produto.' },
  { aba: 'clientes', nome: 'Clientes', icone: IconeUsuarios,
    texto: 'O cadastro de quem compra fiado ou pega empréstimo: nome, CPF, WhatsApp e observação.' },
  { aba: 'config', nome: 'Configurações', icone: IconeConfig,
    texto: 'Seu perfil (nome, idioma, tema e fuso), a marca da loja, o app no celular, os logs e a cópia de segurança dos dados.' },
]

export default function Ajuda({ irPara }) {
  return (
    <section>
      <h2>{t('Central de ajuda')}</h2>
      <p className="ajuda-sub">{t('Guia rápido de cada tela. Toque para abrir.')}</p>
      <div className="vd-lista">
        {TOPICOS.map((tp) => (
          <button key={tp.aba} className="vd-item ajuda-item" onClick={() => irPara(tp.aba)}>
            <span className="vd-icone"><tp.icone /></span>
            <span className="vd-txt"><b>{t(tp.nome)}</b><small>{t(tp.texto)}</small></span>
            <IconeDireita />
          </button>
        ))}
      </div>
      <div className="dia-topo"><h3>{t('Dicas')}</h3></div>
      <div className="cb-item ajuda-dicas">
        <ul className="dicas">
          <li>{t('No celular, a barra de baixo leva para Início, Cobranças, Extrato, Análise e Vender.')}</li>
          <li>{t('Toque na sua foto, no Início, para abrir a Minha conta: Estoque, Fornecedores, Clientes, Configurações e as suas lojas.')}</li>
          <li>{t('Tema claro ou escuro e idioma ficam em Configurações → Perfil.')}</li>
          <li>{t('Todo cadastro tem botões de Editar e Excluir.')}</li>
        </ul>
      </div>
    </section>
  )
}
