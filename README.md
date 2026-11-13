# Gerenciador de Preços

Sistema para a loja: fornecedores e seus preços, regras de preço por produto, estoque, vendas (com desconto) e análise de faturamento. Tema claro/escuro e português/inglês.

## Rodar no computador

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## Gerar a versão de produção

```bash
npm run build
```

Os arquivos ficam em `dist/` (é o que a Vercel publica).

## Observações

- Hoje os dados, o login e a sessão ficam guardados **só no navegador** (localStorage). Use Configurações → Cópia de segurança para baixar uma cópia.
- O login é local e não protege os dados de verdade. A troca para o Supabase acontece em `src/armazenamento.js` e `src/auth.js`, sem mudar as telas.
- Traduções em inglês: `src/traducoes/en.js`.
