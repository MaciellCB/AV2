# Validação da entrega

Este registro resume os testes executados e diferencia o ambiente validado das plataformas-alvo que ainda não foram verificadas individualmente.

## Validação funcional executada

- [x] Testes backend: `npm test` — 12 passaram, nenhum falhou ou foi ignorado. A execução incluiu a integração HTTP com PostgreSQL, com `TEST_DATABASE_URL` configurada.
- [x] Typecheck e build de produção do backend — passaram.
- [x] Build de produção do frontend — passou.
- [x] Testes E2E Playwright — 2 passaram.
- [x] Teste HTTP de integração confirmou autenticação, CRUD/versionamento, transações e autorização.
- [x] Site verificado funcionalmente no navegador local.

## Ambiente e alcance da validação

Os testes automatizados registrados acima foram executados em Windows 11 Pro, com Node.js 24.18.0 e PostgreSQL 16 em Docker. Além disso, conforme informado pelo responsável pelo projeto, a aplicação foi instalada e testada funcionalmente em Windows 10 e Linux, e está funcionando nesses ambientes. Assim, a compatibilidade nesses sistemas também foi verificada pelo responsável em seus ambientes locais.

O workflow `.github/workflows/ci.yml` está configurado para builds em runners Windows e Ubuntu 24.04, além de integração PostgreSQL e E2E no Ubuntu. A execução remota do workflow ainda está pendente. As versões/distribuições Linux testadas pelo responsável não foram especificadas neste registro; portanto, a confirmação refere-se aos ambientes Linux em que ele executou os testes, sem declarar validação individual de cada distribuição derivada do Ubuntu.

## Roteiro para repetir a validação em outro ambiente

Este roteiro pode ser usado para repetir os testes em uma nova instalação Windows 10 ou superior, Ubuntu 24.04 LTS ou superior, ou distribuição derivada:

Em cada sistema operacional, com Docker ativo e depois de extrair o ZIP:

1. Instale Node.js 22 ou superior e execute o script de preparação correspondente (`setup-windows.ps1` ou `setup-linux.sh`).
2. Inicie backend e frontend em terminais separados.
3. Confirme `http://localhost:3333/health` e `http://localhost:5173/`.
4. Faça login com as credenciais locais de demonstração.
5. Confira as listas de organizações, contratos, lotes, equipamentos e movimentações.
6. Crie, edite e exclua organização/contrato/lote de teste; crie e edite equipamento de teste e confirme os vínculos.
7. Tente uma transição de status inválida pela API e diretamente no banco; ambas devem ser rejeitadas.
8. Execute `npm test`, `npm run typecheck` e `npm run build` no backend e `npm run build` no frontend.
9. Tente salvar data de término anterior à data de início tanto na criação como na edição de contrato; ambas devem retornar HTTP 400.
10. Para validar concorrência, leia um registro, atualize-o com `versao` atual e tente repetir a atualização com a versão antiga; a segunda tentativa deve retornar HTTP 409.

## Critérios de aceitação verificáveis

- **Persistência e cardinalidades:** executar `prisma migrate deploy`; criar organização sem contrato, organização com contrato, vários lotes por organização, vários equipamentos por lote e várias movimentações por equipamento; confirmar unicidades e chaves estrangeiras no PostgreSQL.
- **Autenticação e autorização:** login válido retorna token; senha incorreta retorna 401; chamadas sem token, token malformado e token expirado retornam 401; consulta de `/me` e de rota protegida com usuário desativado também retorna 401. `CONSULTA` só lê, `OPERADOR` lê/grava e `ADMINISTRADOR` lê/grava/exclui; operação sem permissão retorna 403.
- **Regras de negócio:** validar todas as transições permitidas e proibidas; uma transição proibida retorna 422 e não grava alteração nem movimentação. Erros de validação retornam 400, recurso inexistente 404, unicidade/versão concorrente 409.
- **Paginação e documentação:** verificar limites `page >= 1`, `1 <= limit <= 100`, filtros/pesquisa e formato `{ data, total, page, limit }`; manter a referência de endpoints, métodos, papéis, parâmetros e erros atualizada em `docs/API.md`.
- **Atomicidade e concorrência:** provocar falha em operações que agrupam gravações e confirmar rollback integral; enviar versão antiga após uma atualização válida e confirmar HTTP 409 sem sobrescrita.
- **Dados para demonstração:** o seed populado fornece dados representativos para os testes de desenvolvimento. A atividade sugere esse seed e permite reinserir dados de teste manualmente; importar arquivos históricos reais não é necessário para atender a esse item. O importador JSON existente é um recurso adicional; caso seja usado para dados reais, deve-se seguir o procedimento de homologação e conferência descrito em `docs/MIGRACAO-CLI.md`.
- **Produção:** antes de disponibilizar externamente, verificar HTTPS, segredo fora do código e logs, CORS restrito, backup cifrado e restauração testada, política de retenção, ausência de dados sensíveis em logs e procedimento de resposta a incidentes. O checklist de recomendações está em `docs/ARQUITETURA.md`.
- **Plataformas:** conforme informado pelo responsável, a aplicação foi testada funcionalmente em Windows 10 e Linux. Para registrar evidência reproduzível por plataforma, anotar a versão exata do sistema e executar o roteiro acima; distribuições derivadas do Ubuntu devem ser identificadas individualmente.

O instalador Linux verifica Ubuntu 24.04 LTS ou superior e aceita sistemas que se identificam como derivados por `ID_LIKE`; instalação e testes ainda devem ser executados em Ubuntu e em cada derivada que se pretenda declarar validada. Instale dependências no sistema-alvo (`npm ci`); não copie `node_modules` entre Windows e Linux. A exclusão de equipamentos não é oferecida para não apagar o histórico de movimentações.
