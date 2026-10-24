# Definition of Done (DoD) e matriz CRUD

Este documento registra os critérios de conclusão da entrega e as operações disponíveis na API GreenCode.

## Definition of Done (DoD)

Considera-se a atividade concluída quando:

- [x] A aplicação oferece uma SPA e uma API HTTP para o sistema de logística reversa.
- [x] A API está organizada em rotas/controllers, serviços, domínio e repositórios.
- [x] PostgreSQL e Prisma persistem as entidades de organização, contrato, lote, equipamento e movimentação, além de usuários.
- [x] As relações, identificadores únicos e regras de integridade estão definidos no schema e nas migrações.
- [x] Login com senha protegida por hash emite JWT; rotas protegidas aplicam autenticação e autorização por papel.
- [x] Criação e transição de status mantêm o histórico de movimentações de forma transacional.
- [x] Atualizações concorrentes usam versionamento otimista, e entradas inválidas recebem respostas de erro apropriadas.
- [x] Existe seed de demonstração para popular o banco com cenários variados.
- [x] A API, as decisões arquiteturais e a instalação estão documentadas.
- [x] Os testes executados no ambiente de desenvolvimento passaram: 12 testes backend, 2 testes E2E, typecheck e builds do backend e frontend.
- [x] Conforme informado pelo responsável, a aplicação também foi executada e testada funcionalmente em Windows 10 e Linux.

Os itens de plataforma refletem os testes realizados pelo responsável pelo projeto. As distribuições e versões Linux específicas não foram registradas aqui. Os testes automatizados contabilizados neste documento foram executados em Windows 11 Pro com Node.js 24.18.0 e PostgreSQL 16 em Docker.

## Matriz CRUD

Legenda: **C** = criar, **R** = consultar/listar, **U** = atualizar, **D** = excluir. As permissões dependem do papel autenticado; a coluna de observações registra restrições.

| Recurso | C | R | U | D | Observações |
|---|---|---|---|---|---|
| Organizações | Sim | Sim | Sim | Sim | Exclusão somente por administrador e quando não houver lotes vinculados. |
| Contratos | Sim | Sim | Sim | Sim | Exclusão somente por administrador. Uma organização pode possuir no máximo um contrato. |
| Lotes | Sim | Sim | Sim | Sim | Pode criar equipamentos e movimentações iniciais junto com o lote; exclusão somente por administrador e quando não houver equipamentos vinculados. |
| Equipamentos | Sim | Sim | Sim | Não | Status é alterado por operação própria, que registra movimentação; não há exclusão para preservar o histórico. |
| Movimentações | Automático | Sim | Não | Não | São criadas pelas operações de recebimento/transição; o histórico é consultável e não é editado ou excluído pela API. |
| Usuários | Sim | Sim | Sim | Sim | Rotas administrativas; não permite remover, desativar ou rebaixar a própria conta nem excluir o último administrador ativo. |
| Painel/indicadores | Não se aplica | Sim | Não se aplica | Não se aplica | Somente leitura; apresenta contagens e valores agregados. |

Em geral, `CONSULTA` pode ler; `OPERADOR` pode ler e criar/atualizar dados operacionais; `ADMINISTRADOR` pode também executar as exclusões permitidas e administrar usuários. Consulte [API.md](./API.md) para endpoints, métodos, parâmetros, códigos de erro e detalhes por rota.
