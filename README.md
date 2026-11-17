# PJ GERENT

Sistema para lojas: fornecedores e seus preços, regras de preço por produto, estoque, vendas (com desconto), caixa (capital de giro) e análise de faturamento. Várias lojas, cada uma com a própria equipe e os próprios dados, e um painel de administração da plataforma. Tema claro/escuro e português/inglês.

## Rodar no computador

```bash
npm install
npm run dev
```

Abra http://localhost:5173. A URL e a chave pública do Supabase ficam em `.env.local` (modelo em `.env.example`).

## Gerar a versão de produção

```bash
npm run build
```

Os arquivos ficam em `dist/` (é o que a Vercel publica).

## Banco de dados (Supabase)

No SQL Editor do Supabase, rode, nesta ordem:

1. `supabase/organizacoes.sql`: lojas, auditoria, painel da plataforma e cobrança
2. `supabase/seguranca-2026-11.sql`: cada loja com um único usuário (só o dono grava)
3. `supabase/limpeza-2026-11.sql`: tira as funções de equipe sem uso e a tabela antiga `dados_loja` (só se tudo dela já foi copiado para as lojas)

Os dois primeiros podem ser rodados de novo sem problema.

## Lojas e papéis

- Cada loja (organização) tem os próprios dados, guardados em `dados_org`.
- Cada loja tem **um único usuário**, o dono (papel Administrador). Só o administrador da plataforma coloca ou tira pessoas de uma loja (aba Equipe da loja, no painel).
- O **administrador da plataforma** vê todas as lojas no painel "Admin Plataforma": Dashboard, Organizações, Usuários, Administradores, Uso, Auditoria e Cadastro. Abra o painel pelo seletor de loja no topo → "Gerenciar organizações".
- **Cadastro** (no painel) tem dois interruptores. **Apenas por convite**: só entra quem foi colocado numa loja. **Com aprovação**: quem cria conta sem convite pede a loja, e ela só é criada quando o administrador aprova. Com os dois desligados, a conta nova ganha uma loja na hora.
- **Marca** (no painel): nome, cores, logos e tema da plataforma. Vale na tela de entrada e nas lojas sem marca própria.
- **Cobrança** (no painel): planos, teste grátis, régua de atraso e suspensão automáticos, cobrando pela **Stripe** ou pelo **Asaas** (escolha na aba Conexão). As funções de servidor ficam em `api/cobranca` (Vercel) e precisam destas variáveis de ambiente na Vercel:
  - `COBRANCA_SEGREDO`: copie em Cobrança → Conexão.
  - `STRIPE_SECRET_KEY` ou `ASAAS_API_KEY`: a chave do provedor. Comece pela de teste.
- Cada salvamento confere a versão dos dados. Se outra pessoa salvou antes, o app busca a versão nova e refaz a alteração por cima, então nada se perde.
- Traduções em inglês: `src/traducoes/en.js`.
