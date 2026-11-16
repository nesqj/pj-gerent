import { useState } from 'react'
import { t } from '../i18n.js'

// Termos de uso e Política de privacidade.
// TEXTO-MODELO: revise com um advogado antes de usar como documento oficial.
const TERMOS = [
  ['1. Sobre o serviço', 'O PJ GERENT é um sistema para ajudar lojas e prestadores de serviço a organizar vendas, estoque, fornecedores, clientes, cobranças, empréstimos e o caixa. O sistema é uma ferramenta de apoio: as decisões e os registros feitos nele são de responsabilidade de quem usa.'],
  ['2. Conta e acesso', 'Cada pessoa acessa com o próprio e-mail e senha. Você é responsável por manter a senha em segredo e por tudo o que for feito com a sua conta. O administrador da loja decide quem faz parte da equipe e o que cada pessoa pode ver e alterar.'],
  ['3. Uso correto', 'Não é permitido usar o sistema para atividades ilegais, para enganar clientes ou para guardar informações de terceiros sem autorização. Contas usadas de forma indevida podem ser suspensas.'],
  ['4. Valores, juros e cobranças', 'Os cálculos de lucro, juros, multa e saldo são feitos a partir do que você registra. Confira os valores antes de cobrar seus clientes. Juros e multas cobrados de clientes devem seguir a lei, incluindo o Código de Defesa do Consumidor.'],
  ['5. Plano e pagamento', 'O uso pode depender de um plano pago. Se o pagamento atrasar, o acesso da loja pode ser suspenso até a regularização. Os dados continuam guardados durante esse período.'],
  ['6. Disponibilidade', 'Trabalhamos para manter o sistema funcionando, mas podem acontecer interrupções para manutenção ou por falhas de terceiros (internet, servidores). Recomendamos baixar cópias de segurança periodicamente em Configurações.'],
  ['7. Mudanças nos termos', 'Estes termos podem ser atualizados. Quando isso acontecer, a versão nova fica disponível nesta tela.'],
]
const PRIVACIDADE = [
  ['1. Quais dados guardamos', 'Seu nome, e-mail e foto de perfil; os dados da loja; e o que você registra no sistema, como vendas, produtos, fornecedores, clientes (nome, CPF e telefone), cobranças e movimentos de caixa.'],
  ['2. Para que usamos', 'Somente para fazer o sistema funcionar para a sua loja: mostrar os registros, fazer os cálculos e enviar avisos. Não vendemos nem compartilhamos seus dados com terceiros para fins de propaganda.'],
  ['3. Onde ficam guardados', 'Os dados ficam em servidores de nuvem contratados para hospedar o sistema, com acesso protegido por senha. Cada loja só enxerga os próprios dados.'],
  ['4. Dados dos seus clientes', 'Ao cadastrar clientes, você é responsável por ter a autorização deles para guardar essas informações e por usá-las apenas para a relação comercial com a sua loja.'],
  ['5. Seus direitos (LGPD)', 'Você pode pedir acesso, correção ou exclusão dos seus dados, e baixar uma cópia deles a qualquer momento em Configurações → Cópia de segurança.'],
  ['6. Contato', 'Para dúvidas sobre privacidade ou para exercer seus direitos, fale com o administrador do sistema.'],
]

export default function Termos() {
  const [aba, setAba] = useState('termos')
  const secoes = aba === 'termos' ? TERMOS : PRIVACIDADE
  return (
    <section className="termos">
      <h2>{t('Termos e políticas')}</h2>
      <div className="chips modo-registro">
        <button className={'filtro' + (aba === 'termos' ? ' ativo' : '')} onClick={() => setAba('termos')}>{t('Termos de uso')}</button>
        <button className={'filtro' + (aba === 'privacidade' ? ' ativo' : '')} onClick={() => setAba('privacidade')}>{t('Política de privacidade')}</button>
      </div>
      {secoes.map(([titulo, texto]) => (
        <div key={titulo} className="termos-secao">
          <h3>{titulo}</h3>
          <p>{texto}</p>
        </div>
      ))}
    </section>
  )
}
