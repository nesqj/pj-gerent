# PJ GERENT

Sistema para lojas: fornecedores e seus preços, regras de preço por produto, estoque, vendas (com desconto) e análise de faturamento. Várias lojas, cada uma com a própria equipe e os próprios dados, e um painel de administração da plataforma. Tema claro/escuro e português/inglês.

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

1. `supabase/esquema.sql`
2. `supabase/organizacoes.sql`: lojas, equipe, convites, auditoria e painel da plataforma

Os dois podem ser rodados de novo sem problema e não apagam nada.

## Lojas e papéis

- Cada loja (organização) tem os próprios dados, guardados em `dados_org`.
- Papéis na loja:
  - **Administrador**: tudo.
  - **Gerente**: tudo, menos a equipe e restaurar cópia de segurança.
  - **Vendedor**: vendas e entradas no estoque.
  - **Somente leitura**: só vê.
- O **administrador da plataforma** vê todas as lojas no painel "Admin Plataforma": Dashboard, Organizações, Usuários, Administradores, Uso, Auditoria e Cadastro. Abra o painel pelo seletor de loja no topo → "Gerenciar organizações".
- **Cadastro** (no painel) tem dois interruptores. **Apenas por convite**: só entra quem foi colocado numa loja. **Com aprovação**: quem cria conta sem convite pede a loja, e ela só é criada quando o administrador aprova. Com os dois desligados, a conta nova ganha uma loja na hora.
- **Marca** (no painel): nome, cores, logos e tema da plataforma. Vale na tela de entrada e nas lojas sem marca própria.
- **Cobrança** (no painel): planos, teste grátis, régua de atraso e suspensão automáticos, cobrando pela **Stripe** ou pelo **Asaas** (escolha na aba Conexão). As funções de servidor ficam em `api/cobranca` (Vercel) e precisam destas variáveis de ambiente na Vercel:
  - `COBRANCA_SEGREDO`: copie em Cobrança → Conexão.
  - `STRIPE_SECRET_KEY` ou `ASAAS_API_KEY`: a chave do provedor. Comece pela de teste.
- Cada salvamento confere a versão dos dados. Se outra pessoa salvou antes, o app busca a versão nova e refaz a alteração por cima, então nada se perde.
- Traduções em inglês: `src/traducoes/en.js`.
