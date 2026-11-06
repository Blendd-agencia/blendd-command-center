# Estado de lançamento

Data: 2026-11-06. Esta branch é uma base de desenvolvimento, não uma entrega funcional completa.

| Requisito | Estado e evidência |
|---|---|
| Recuperação do código original | Pacote de entrega recuperado e inventariado; não incluído no Git público devido a dados reais incorporados. |
| Guia funcional | Lidas as 14 páginas. Matriz de paridade em `parity.md`. |
| Supabase existente | Reutilizado; tabelas, RLS, auditoria, RPC de revisão, limites por utilizador e bucket privado criados. |
| Autenticação servidor | Código implementado. Login real ainda não testado: sem contas atribuídas. |
| Administradores | João Sousa e Diogo Borges identificados no pedido; provisionamento pendente. Não elevar contas apenas por metadata editável. |
| Empresas/clientes isolados | Teste SQL com admin de uma empresa, cliente e utilizador sem pertença passou. |
| Concorrência | Atualização com revisão antiga é rejeitada em teste SQL; teste real de sessões simultâneas pendente. |
| Ficheiros privados | Bucket privado criado; sem acesso externo. Pipeline de upload, leitura autenticada e verificação de conteúdo pendente. |
| XSS | UI nova usa textContent e CSP sem inline scripts. Revisão da aplicação completa e browser pendente. |
| Validação | Identificadores, visibilidade, payload limitado, chaves perigosas/segredos, cêntimos inteiros e limites de integrações testados. Validação específica de cada módulo pendente. |
| Limites de pedidos | API autenticada limitada por utilizador no banco. Limites de login/IP e proteção contra abuso precisam de configuração e teste na infraestrutura. Data API direta mantém RLS, mas não passa pelo limite da API Vercel. |
| Segredos no Git | Apenas código novo e configuração de exemplo. Histórico original consultado: um commit com README. Pacote comercial excluído. |
| Custos/timeouts | Limites editáveis e timeout de rede de 10s. Nenhuma API paga ativa; aplicação efetiva dos orçamentos depende de cada futuro conector. |
| Operações repetidas | IDs estáveis durante a submissão evitam inserções duplicadas por repetição do formulário. Reconciliação automática de resposta perdida e idempotência de fornecedores pendentes. |
| Integrações | Configurações de limites, estados e teste de leitura Supabase. Histórico de testes/erros e conectores pendentes. |
| Carregamento/vazio/erro | Implementados nas vistas iniciais. Cobertura e acessibilidade de toda a aplicação pendentes. |
| Performance | Sem dependências de runtime, assets locais. Medição real e paginação completa pendentes; listagem inicial limitada a 1000 registos. |
| Monitorização | Erros internos com código genérico sem payload. Alertas externos, métricas e retenção pendentes. |
| Backups e restauro | Não configurados/não testados. Não afirmar o contrário. Incluir dados SQL e objetos do Storage no plano de restauro. |
| GitHub → Vercel | Acesso GitHub com escrita confirmado. Vercel bloqueou criação com 403; CLI pediu login. Sem deployment. |
| UI completa do protótipo | Ainda não migrada. Só tarefas, clientes e configurações iniciais funcionam nesta base. |

## Sequência para continuar

1. Concluir autenticação Vercel na equipa autorizada; verificar primeiro se entretanto apareceu um projeto ligado ao repositório.
2. Migrar os módulos e comportamentos da matriz de paridade; não publicar o protótipo com dados incorporados.
3. Provisionar contas via mecanismos oficiais Supabase Auth e atribuir pertenças por user_id confirmado. Não escrever passwords em SQL, Git ou logs.
4. Implementar e testar pipeline de ficheiros, portal, ciclos de aprovação, importação, cofre e conectores separadamente.
5. Testes reais de login, utilizadores simultâneos, acesso negado e recuperação de falhas. Browser desktop/mobile.
6. Configurar backups, executar restauro isolado e comparar registos/objetos/checksums.
7. Deploy pela ligação GitHub e verificação de funcionamento antes de considerar lançamento concluído.

## Avisos dos advisors

O primeiro relatório de performance identificou quatro foreign keys sem índice; os índices foram adicionados em `db/indexes.sql`. Índices ainda não usados são esperados numa base vazia. O advisor também recomenda rever a estratégia de ligações Auth antes de escalar: https://supabase.com/docs/guides/deployment/going-into-prod
