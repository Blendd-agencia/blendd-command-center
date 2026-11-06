# Matriz de paridade com a entrega original

Fonte: Guia-Funcional-Command-Center.docx (14 páginas) e Command-Center-Entrega.zip, SHA-256 `3fc4fefd44073d92d5601c927645b498d17f09faa5a5d0fdb4d553e21fc9da4c`.
Referência original indicada no guia: `57b3fc08aba87d81b2999229bee9b9555660636e`.
O pacote foi recuperado sem alterações; os dados embutidos são privados e não devem ser publicados em GitHub. Os dados criados nos navegadores posteriormente não estão no pacote e exigem exportação específica.

| Área | Comportamentos obrigatórios a preservar | Estado desta branch |
|---|---|---|
| Navegação | Menu geral curto; entrar em empresa; limpar seleção ao mudar de contexto; portal separado | Estrutura inicial com seleção de empresa; portal completo pendente |
| Dashboard | Mês, previsão financeira, seis meses, tarefas pessoais, atrasos, métricas com denominadores válidos | Só contagens iniciais; migração pendente |
| Tarefas | Designação, empresa, responsável, prazo, estado, filtros pessoais/partilhados | Criar e editar título, notas, prazo e estado; responsáveis/filtros pendentes |
| Finanças | Avenças, one shots, fixas, variáveis, temporalidade, horas e validação, pago/recebido, CSV, sem duplicar salários/dívidas | Modelo genérico com cêntimos; fluxo completo pendente |
| Dívidas | Saldo, mensalidade opcional, prestações variáveis, comparação de plano e saldo, desfazer | Pendente |
| Equipa | Identidade, contrato, remuneração/rubricas, seguros, carro, bens, documentos, validade | Acesso apenas admin preparado; fluxo pendente |
| Faturação | Mesma avença, dados legais/PO/IVA, revisão antes de emissão, período de serviço explícito | Pendente; Moloni inativo |
| CRM | Lead simples, discovery, proposta, seguimento, kanban flexível, ganho sem duplicar cliente | Pendente |
| Clientes | Nome comercial/legal separados, serviços, social media explícito, rubricas próprias, visibilidade dos documentos | Criar/listar nome; restante pendente |
| Post plan | Tabela única, copies por rede, dia/data, rubricagem, arte, tags, links, edição de células | Pendente |
| Aprovações | Copy/arte independentes, pronto pela equipa, decisão cliente, rejeição sem feedback obrigatório, nova submissão e versão exata | Pendente; clientes sem escrita nesta base |
| Ideias | Tabela estruturada, links/texto separados, conversão em post uma única vez, exportações | Pendente |
| Portal | Onboarding, pedidos e respostas, documentação, post plan, resultados e faturação | RLS de leitura preparada; fluxo pendente |
| KPIs e relatórios | Publicação separada, rascunhos internos, métricas mensais por rede, sem somas inválidas | Pendente |
| Cofre | Cifragem/gestor dedicado, identidade individual, revelar 15s, bloquear 5min, copiar, backups separados | Não operacional; decisão e validação de segurança pendentes |
| Dados/migração | Importação validada, proveniência, reconciliação de totais, anexos, sem duplicar | Pendente; dados reais ainda não importados |
| Integrações | Configuração, estados, testes, erros, limites; segredos no servidor | Limites/timeouts, estado inativo e teste Supabase iniciais |

As capturas anexadas servem como referências visuais para cartões claros/arredondados e sombras suaves. Não constituem prova de uma integração WhatsApp/Google Voice disponível.
