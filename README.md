# GreenCode — Sistema de Logística Reversa

Projeto acadêmico de evolução do GreenCode CLI para uma aplicação web monolítica com SPA, API REST, autenticação JWT, TypeScript, Fastify, Prisma ORM e PostgreSQL, conforme a Atividade de Avaliação Individual 2.

## Funcionalidades

- Login com JWT e senha armazenada com hash bcrypt.
- Controle de acesso por papel: `ADMINISTRADOR`, `OPERADOR` e `CONSULTA`.
- Administração de usuários (criação, atualização, alteração de papel, ativação e exclusão), restrita a administradores.
- Painel com indicadores operacionais.
- Resumo financeiro com total e valores recuperados por status, calculados a partir dos valores registrados nos equipamentos.
- Cadastro e listagem de organizações, contratos, lotes e equipamentos; edição com versionamento otimista e exclusão de organizações, contratos e lotes quando permitido pela integridade referencial.
- Interface com controles de acesso por papel, escolha guiada de destinos de status e histórico de movimentações.
- Fluxo de status do equipamento com regras de transição e histórico de movimentações.
- Transações atômicas para criação de equipamento + movimentação inicial e alteração de status + histórico.
- Paginação e pesquisa nas tabelas, filtro por status de equipamento, validação de entrada, tratamento de conflitos de unicidade e versionamento otimista.
- Validação dos dígitos verificadores de CNPJ (incluindo o formato alfanumérico), restrições de integridade no PostgreSQL e transições de status protegidas também no banco.
- Documentação de arquitetura e API em `docs/`.

## Tecnologias

- **Frontend:** React + TypeScript + Vite (SPA).
- **Backend:** Node.js 22+ + TypeScript + Fastify.
- **Validação:** Zod.
- **Autenticação:** JWT e bcrypt.
- **Banco:** PostgreSQL 16 via Docker Compose.
- **ORM:** Prisma.

## Instalar e iniciar o site (Windows 10 ou superior)

### O que você precisa

- Node.js 22 ou superior (o npm vem junto).
- Docker Desktop instalado e em execução.
- PowerShell aberto na pasta raiz do projeto (`greencode`).
- Conexão à internet na primeira instalação, para baixar as dependências.

O PostgreSQL do projeto usa a porta `5433` no computador para evitar conflito com instalações locais que já utilizem a porta padrão `5432`.

### 1. Preparar o projeto

O jeito mais simples é executar o script de instalação. No PowerShell, na pasta `greencode`, rode:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup-windows.ps1
```

O script inicia o PostgreSQL no Docker, instala as dependências do backend e do frontend, prepara o Prisma, aplica as migrações do banco e carrega dados de demonstração. Também cria `backend/.env` a partir do modelo, caso esse arquivo ainda não exista.

Se preferir fazer a preparação manualmente, execute os passos abaixo. Não sobrescreva `backend/.env` caso já exista.

Na raiz do projeto, inicie o banco de dados:

```powershell
docker compose up -d
```

Em um terminal, instale e prepare o backend:

```powershell
cd backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

Se `backend/.env` já existir, mantenha-o e confira se `DATABASE_URL` aponta para `localhost:5433` e se `JWT_SECRET` tem pelo menos 32 caracteres.

Em outro terminal, instale as dependências do frontend:

```powershell
cd frontend
npm ci
```

### 2. Iniciar o site

Deixe o Docker Desktop aberto. Inicie o backend em um terminal:

```powershell
cd backend
npm run dev
```

Em outro terminal, inicie o frontend:

```powershell
cd frontend
npm run dev
```

Abra **http://localhost:5173** no navegador. Para conferir se a API iniciou, acesse **http://localhost:3333/health**; a resposta esperada contém `"status":"ok"`. Mantenha os dois terminais abertos enquanto usa o site. Para encerrar, pressione `Ctrl+C` em cada terminal.

### Login de demonstração

- E-mail: `admin@greencode.local`
- Senha: `GreenCode@123`

O seed cria esses dados de demonstração. As credenciais são apenas para desenvolvimento local; altere-as antes de qualquer implantação real e nunca publique arquivos `.env`.

Administradores podem abrir **Usuários** no menu para criar contas de operadores e de consulta. Senhas devem ter pelo menos 10 caracteres. Não é permitido desativar, rebaixar ou excluir a própria conta nem deixar o sistema sem um administrador ativo.

Se o navegador ainda mostrar “Autenticação necessária” no painel por causa de uma sessão antiga, atualize a página. O app removerá o token inválido e voltará à tela de login.

## Estrutura de pastas

```text
greencode/
├── backend/
│   ├── prisma/              # Schema, seed e importador do CLI
│   ├── src/domain/          # Regras de transição e autorização
│   ├── src/repositories/    # Acesso Prisma isolado
│   ├── src/services/        # Casos de uso e regras de negócio
│   ├── src/routes/          # Controllers HTTP
│   └── test/                # Testes unitários e integração HTTP
├── frontend/src/            # SPA React
├── frontend/e2e/            # Testes E2E Playwright
├── docs/                    # Arquitetura e API
├── docker-compose.yml
└── setup-windows.ps1
```

## Entidades principais

- `Organizacao`: CNPJ único, contato e endereço; uma organização pode ter um contrato e muitos lotes.
- `Contrato`: número único, datas, valor, cláusulas JSON e relação um-para-um com organização.
- `Lote`: código único, organização e equipamentos.
- `Equipamento`: código de barras interno único, status, dados físicos e versão.
- `Movimentacao`: trilha de auditoria do status anterior/novo, tipo, data, responsável e descrição.
- `Usuario`: credenciais, estado ativo e papel de autorização.

## Regras de status

- `RECEBIDO → EM_TRIAGEM`
- `EM_TRIAGEM → EM_REPARO | RECONDICIONADO | RECICLAGEM | DESCARTADO`
- `EM_REPARO → RECONDICIONADO | RECICLAGEM | DESCARTADO`

`RECONDICIONADO`, `RECICLAGEM` e `DESCARTADO` são finais no fluxo implementado. A API retorna HTTP 422 para transições não permitidas.

## Requisitos no Linux Ubuntu 24.04 LTS ou superior

1. Instale Node.js 22 ou superior e npm.
2. Instale Docker Engine e o plugin Docker Compose e confirme que o usuário pode executar `docker`.
3. Extraia o ZIP e abra um terminal na pasta `greencode`.
4. Execute `chmod +x ./setup-linux.sh && ./setup-linux.sh`.
5. Inicie backend e frontend em terminais separados, conforme as instruções exibidas pelo script.

O script usa `npm ci` para respeitar os arquivos lock e `prisma migrate deploy` para aplicar as migrações versionadas já presentes no repositório. As dependências nativas são instaladas no próprio sistema operacional; não copie a pasta `node_modules` de Windows para Linux ou vice-versa. Distribuições derivadas do Ubuntu podem funcionar se atenderem aos mesmos requisitos, mas não são consideradas validadas até que a instalação e os testes sejam executados nelas. A CI cobre Ubuntu 24.04, não uma matriz de distribuições derivadas. Para detalhes sobre os alvos efetivamente verificados, consulte [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) e [`docs/VALIDACAO.md`](docs/VALIDACAO.md).

## Testes e compilação

No diretório `backend`:

```powershell
npm test
npm run typecheck
npm run build
```

No diretório `frontend`:

```powershell
npm run build
npx playwright install chromium
npm run test:e2e
```

Execute os E2E com o PostgreSQL iniciado e com o seed aplicado; o Playwright inicia a API e o Vite automaticamente. Os testes automatizados cobrem transições, permissões, formato do importador, endpoints HTTP com PostgreSQL e fluxos de navegação/criação/exclusão no site. O teste HTTP só roda com `TEST_DATABASE_URL`; o workflow de CI fornece um banco descartável. Nesta entrega, testes backend (incluindo integração PostgreSQL), E2E, typecheck e builds foram executados com sucesso em Windows 11 Pro, Node.js 24.18.0 e PostgreSQL 16 em Docker. Conforme informado pelo responsável, a aplicação também foi testada e está funcional em Windows 10 e Linux. As versões e distribuições Linux específicas não foram registradas. O workflow de CI configura builds em runner Windows e Ubuntu 24.04, integração HTTP/PostgreSQL e E2E em Ubuntu, mas ainda precisa concluir no GitHub para registrar essa evidência automatizada.

## Documentação da API

Consulte [`docs/API.md`](docs/API.md) para endpoints, papéis de acesso, exemplos de requisição e respostas de erro. Consulte [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) para camadas, entidades, decisões técnicas e limitações conhecidas.
Consulte [`docs/DEFINITION-OF-DONE-E-CRUD.md`](docs/DEFINITION-OF-DONE-E-CRUD.md) para os critérios de conclusão (DoD) e a matriz CRUD dos recursos.
Para importar dados históricos, consulte [`docs/MIGRACAO-CLI.md`](docs/MIGRACAO-CLI.md).

## Segurança e limitações

- Troque o segredo JWT de demonstração por um segredo aleatório de pelo menos 32 caracteres.
- JWT expira em 8 horas; token expirado/inválido ou usuário desativado retorna HTTP 401 e o frontend remove o token e exige novo login. O papel e a situação ativa são consultados no banco em cada rota protegida.
- Em produção, configure HTTPS, CORS restrito, gestão externa de segredos, backups cifrados com política de retenção e testes de restauração, logs protegidos sem credenciais/tokens, monitoramento e resposta a incidentes. Esses controles dependem da infraestrutura escolhida e não são implantados automaticamente pelo repositório.
- O seed cria dados fictícios de demonstração de forma idempotente. A atividade sugere essa massa de dados e não exige importar arquivos históricos reais do CLI para demonstrar o funcionamento; o importador JSON documentado é um recurso adicional e não descriptografa os arquivos antigos.
- Foi incluído um importador transacional para uma exportação JSON normalizada do CLI. Como este repositório não contém o código/chave nem a especificação dos arquivos criptografados antigos, o importador não tenta descriptografá-los: primeiro gere o JSON compatível usando a ferramenta de exportação do CLI ou uma conversão controlada. O formato e o comando estão descritos em `docs/MIGRACAO-CLI.md`.
- Os casos de uso CRUD são delegados das rotas para `catalog.service.ts` e `catalog.repository.ts`. Gestão de usuários e transições possuem serviços/repositórios próprios.
- O projeto é uma base acadêmica funcional no ambiente validado; isso não equivale a uma auditoria de segurança ou validação de todas as plataformas de produção.
