# Arquitetura do GreenCode

## Objetivo

Evoluir o GreenCode CLI para uma aplicação web monolítica, com API REST, SPA, persistência relacional e rastreabilidade das etapas de logística reversa.

## Componentes

- **Frontend:** React + TypeScript + Vite (SPA).
- **Servidor HTTP:** Node.js + TypeScript + Fastify.
- **Autenticação:** JWT com validade de 8 horas; senha armazenada com bcrypt.
- **Validação:** Zod nas entradas da API.
- **Persistência:** Prisma ORM e PostgreSQL.
- **Ambiente local:** Docker Compose para o banco.

## Camadas

1. **Rotas/Controllers (`backend/src/routes`)**: adaptam HTTP, validam parâmetros e serializam respostas.
2. **Serviços (`backend/src/services`)**: aplicam regras de negócio e coordenam operações. `catalog.service.ts` centraliza os casos de uso CRUD; `equipment.service.ts` protege as transições; `user.service.ts` aplica as regras de gestão de contas.
3. **Domínio (`backend/src/domain`)**: contém as transições de status e a política de autorização por papel.
4. **Repositórios (`backend/src/repositories`)**: `catalog.repository.ts` encapsula as consultas e escritas Prisma dos CRUDs; os repositórios de usuário e equipamento dão suporte às regras específicas desses fluxos.
5. **Persistência (`backend/prisma`)**: schema, relacionamentos, índices e migrações Prisma.

As rotas CRUD não acessam diretamente os modelos Prisma: validam o protocolo HTTP e delegam os casos de uso ao serviço de catálogo, que usa o repositório. A autorização de cada requisição ainda consulta o estado atual do usuário no banco.

## Entidades do domínio

- **Organizacao:** possui CNPJ único, pode ter zero ou um contrato e possui zero ou vários lotes.
- **Contrato:** pertence a exatamente uma organização; o `organizacaoId` único limita a um contrato por organização.
- **Lote:** pertence a exatamente uma organização e agrega zero ou vários equipamentos.
- **Equipamento:** pertence a exatamente um lote, possui status atual, versão otimista e zero ou várias movimentações.
- **Movimentacao:** pertence a exatamente um equipamento e registra status anterior/novo, tipo, data, descrição e responsável. O histórico é acrescentado, não editado pelo fluxo da API.
- **Usuario:** armazena nome, e-mail único, hash da senha, estado ativo e papel (`ADMINISTRADOR`, `OPERADOR` ou `CONSULTA`); não é importado pelo processo de migração do CLI.

## Regras de negócio

- CNPJ, número de contrato, código de lote e código de barras interno são únicos.
- CNPJ é validado pelos dígitos verificadores e armazenado normalizado; o validador aceita o formato numérico tradicional e o novo formato alfanumérico.
- A API calcula o valor recuperado acumulado e subtotais por status usando agregação decimal do banco; são somados apenas valores explicitamente informados nos equipamentos, sem inferir lucro ou margem.
- A criação do equipamento e sua movimentação inicial ocorrem na mesma transação.
- A criação de lote com até 100 equipamentos e suas movimentações iniciais ocorre atomicamente por criação aninhada Prisma.
- A mudança de status e a movimentação de histórico ocorrem na mesma transação.
- Transições permitidas: `RECEBIDO → EM_TRIAGEM`; `EM_TRIAGEM → EM_REPARO | RECONDICIONADO | RECICLAGEM | DESCARTADO`; `EM_REPARO → RECONDICIONADO | RECICLAGEM | DESCARTADO`.
- `RECONDICIONADO`, `RECICLAGEM` e `DESCARTADO` são estados finais neste fluxo inicial.
- Migrações SQL impõem valores financeiros e pesos não negativos, datas contratuais consistentes, versões positivas e transições permitidas de status também no PostgreSQL.
- Campos `versao` e atualização condicional são obrigatórios nas operações PUT para detectar conflitos concorrentes em organização, contrato, lote e equipamento; a transição de status também exige a versão enviada pelo cliente.
- `CONSULTA` pode ler; `OPERADOR` pode ler e gravar; `ADMINISTRADOR` pode ler, gravar e excluir.

## Decisões e trade-offs

- **Monólito em vez de microsserviços:** menor complexidade operacional para um projeto acadêmico e implantação local.
- **Fastify em vez de Express:** a validação por schemas, o sistema de plugins e os hooks integrados ajudam a manter rotas e políticas transversais organizadas, além de atender bem a uma API com validação frequente de entradas. O trade-off é adotar um framework menos familiar para parte dos desenvolvedores e seguir seu modelo próprio de plugins; Express seria uma alternativa válida e mais conhecida, mas exigiria escolher e integrar separadamente mais componentes.
- **PostgreSQL em vez de MySQL:** foi escolhido pelo suporte robusto a transações e constraints, pelo tipo JSON para cláusulas contratuais e pela possibilidade de reforçar regras de integridade no próprio banco, inclusive com migrações SQL específicas. O trade-off é menor portabilidade dessas regras para outro banco e a necessidade de administrar um serviço PostgreSQL; MySQL também atenderia ao modelo relacional, mas não foi o alvo configurado e testado neste projeto.
- **SPA em vez de renderização no servidor:** React entrega uma interface interativa que atualiza tabelas e estados sem recarregar a página, enquanto a API permanece independente do cliente. Isso combina com as telas autenticadas de operação e permite reaproveitar endpoints. Como trade-off, a primeira carga baixa JavaScript e a interface depende de o navegador executá-lo; SSR poderia melhorar a renderização inicial e indexação, benefícios pouco relevantes para este painel autenticado, mas adicionaria complexidade de renderização e implantação.
- **Prisma:** tipagem e migrações versionadas; exige geração do cliente antes da compilação.
- **JWT:** o token expira após 8 horas e é enviado em `Authorization: Bearer`. A API valida assinatura e expiração e consulta o estado ativo e o papel atuais do usuário no banco em cada requisição protegida; desativar um usuário invalida o acesso imediatamente. Token ausente, inválido ou expirado e usuário inexistente/inativo retornam HTTP 401; falta de permissão retorna HTTP 403. O frontend descarta a sessão ao receber 401 e solicita novo login. O segredo deve ser aleatório, mantido fora do controle de versão e fornecido por um gestor de segredos no ambiente de produção; o tráfego externo deve usar HTTPS.
- **Controle otimista:** evita sobrescritas silenciosas, mas o cliente deve reenviar a versão atualizada após conflito HTTP 409.

## Validação de entrada e erros

As entradas são validadas com Zod e as regras de domínio reutilizáveis ficam nos serviços ou no domínio, fora das rotas HTTP. IDs inválidos, CNPJs inválidos e parâmetros de paginação incorretos retornam HTTP 400; recursos inexistentes retornam HTTP 404; conflitos de unicidade ou concorrência retornam HTTP 409. Erros inesperados são registrados no log do servidor e retornam mensagem genérica sem expor stack trace ao cliente.

## Compatibilidade

Os alvos previstos são Windows 10 ou superior e Ubuntu 24.04 LTS ou superior, com Node.js 22+, npm, Docker Engine/Desktop e Docker Compose v2. O repositório inclui preparação via `setup-windows.ps1` e `setup-linux.sh`. Os testes automatizados foram executados em Windows 11 Pro com Node.js 24.18.0 e PostgreSQL 16 em Docker: testes backend, integração HTTP/PostgreSQL, E2E e builds passaram. Conforme informado pelo responsável pelo projeto, a aplicação também foi instalada e testada funcionalmente em Windows 10 e Linux. As versões e distribuições Linux específicas não foram registradas aqui. A CI está configurada para Windows e Ubuntu 24.04, mas seu workflow remoto ainda precisa concluir para fornecer evidência automatizada da matriz. Instale as dependências no sistema operacional de destino (`npm ci`); não transporte `node_modules` entre sistemas.

## Requisitos operacionais de produção

- Termine TLS em um proxy reverso ou serviço de hospedagem confiável e encaminhe somente tráfego HTTPS para clientes; restrinja a origem CORS aos domínios autorizados.
- Em `NODE_ENV=production`, defina `FRONTEND_ORIGIN` com a origem autorizada da interface. A API falha ao iniciar se a configuração estiver ausente; fora de produção, o fallback permissivo existe apenas para desenvolvimento local.
- Injete `JWT_SECRET` e credenciais de banco por um gestor de segredos. Não reutilize os valores de demonstração, não os registre em logs e planeje rotação com invalidação das sessões existentes.
- Configure backups automáticos do PostgreSQL com criptografia em trânsito e em repouso, acesso restrito, retenção definida pela organização e cópia independente do servidor. Registre o RPO/RTO pretendido e teste periodicamente a restauração em ambiente isolado; um backup não testado não é considerado recuperação validada.
- Preserve logs de aplicação e de auditoria conforme uma política de retenção definida pela organização. Não registre senhas, tokens, hashes, dados pessoais desnecessários nem conteúdo sensível de contratos; proteja acesso e retenção dos logs.
- Monitore disponibilidade, falhas de autenticação, erros inesperados e espaço/conectividade do banco. Respostas de erro devem permanecer genéricas para o cliente; os detalhes técnicos devem ficar nos logs protegidos, correlacionados pelo identificador da requisição.
- Antes da operação real, defina responsáveis por resposta a incidentes, atualização de dependências, retenção/exclusão de dados e testes de carga/recuperação. O projeto não substitui a configuração desses controles na infraestrutura de implantação.

## Limitações conhecidas

- O seed é de demonstração. Há um importador transacional para JSON normalizado, mas a descriptografia/exportação dos arquivos antigos depende do código e da chave do CLI, que não estão disponíveis neste repositório.
- O frontend apresenta painel, tabelas, pesquisa/paginação, gestão de usuários e fluxos centrais, mas não equivale a um ERP com todas as telas avançadas.
- Os testes HTTP/PostgreSQL rodam quando `TEST_DATABASE_URL` está configurado; os testes E2E do navegador usam Playwright e estão disponíveis em `frontend/e2e`.
- O repositório fornece a aplicação e recomendações operacionais, mas não configura terminação TLS, gestor de segredos, política de backup/retenção ou monitoramento. Esses controles precisam ser implementados e testados na infraestrutura escolhida antes de produção.
