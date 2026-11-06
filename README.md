# Command Center · Blendd e UP

Base inicial de desenvolvimento. **Não é a aplicação completa nem uma versão aprovada para lançamento.**

## Implementado nesta base

- Login por palavra-passe via Supabase Auth, validado no servidor em cada pedido. Sessão em cookie HttpOnly, Secure, SameSite=Strict, com validade máxima de uma hora; sem refresh automático nesta fase.
- Empresas, clientes e pertenças explícitas. Papéis admin, editor e client com RLS. Clientes só conseguem ler registos partilhados da sua organização; não têm ainda os fluxos de aprovação/edição implementados.
- Registos por empresa/cliente com revisões, atualização otimista e auditoria sem cópia do conteúdo.
- Criação/listagem de clientes e criação/edição de tarefas.
- Integrações: limites e timeouts editáveis; teste de leitura da base de dados. Fornecedores externos inativos e sem credenciais no código.
- Bucket privado, sem políticas de acesso: **uploads/downloads permanecem bloqueados** até implementação da validação e autorização dos ficheiros.
- CSP restritiva, verificação de origem em alterações, timeouts, validação de tamanho/estrutura, valores financeiros em cêntimos e limite de 120 pedidos autenticados/minuto na API.

## Estado verificado em 6 de novembro de 2026

O repositório original tinha apenas um README. O projeto Supabase existente foi reutilizado; `db/schema.sql`, `db/rate-limit.sql` e `db/indexes.sql` foram aplicados. Não executar novamente sobre o mesmo projeto.

Não há utilizadores reais criados nem pertenças atribuídas. Não foram importados dados comerciais. O pacote original contém dados reais e não foi adicionado a este repositório público.

Não foi criado projeto na Vercel: a ligação da equipa devolveu `403 forbidden`. A alternativa CLI não tinha credenciais e iniciou um pedido de autenticação. Não há deployment novo concluído.

## Desenvolvimento e validação

Node.js 22 ou superior, sem dependências de runtime.

```sh
npm ci
npm test
npm run build
```

As funções em `api/` destinam-se à Vercel. Configurar as variáveis de `.env.example` no servidor. `APP_ORIGIN` tem de corresponder exatamente ao endereço HTTPS da aplicação. Não configurar o domínio a partir de headers recebidos.

`tests/rls.sql` verifica isolamento, escritas negadas, conflito de versões, auditoria e limite de pedidos numa transação que termina em ROLLBACK. Usa identidades temporárias sem email enviado e não testa login real. Não confundir este teste com testes simultâneos de browser ou restauro de backups.

## Antes de produção

Consultar [docs/launch-status.md](docs/launch-status.md) e [docs/parity.md](docs/parity.md). Todos os fluxos do protótipo devem ser migrados e validados antes de substituir a instalação original. As secções ainda não migradas mostram explicitamente essa limitação.

O cofre de passwords, Moloni, emails, OTP, WhatsApp e Google Voice **não estão implementados nesta base**. Não inserir segredos nos payloads; as configurações de integrações não aceitam credenciais. As limitações de custos apenas ficam preparadas, pois não há conectores ativos.
