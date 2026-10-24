# Referência da API GreenCode

Base local: `http://localhost:3333`. JSON em requisições e respostas. Exceto `/health` e `POST /api/auth/login`, os endpoints exigem `Authorization: Bearer <token>`.

## Autenticação

- `POST /api/auth/login` — `{ "email": "...", "senha": "..." }`; retorna token e usuário.
- `GET /api/auth/me` — retorna o usuário autenticado.
- `GET /health` — estado do servidor.

O token JWT expira em 8 horas. Envie-o em `Authorization: Bearer <token>`; token ausente, inválido ou expirado retorna `401`. O endpoint `/me` e as rotas protegidas também retornam `401` para usuário removido ou desativado. O papel e o estado ativo são consultados no banco a cada requisição protegida, então alterações de papel e desativação têm efeito imediato. `403` indica usuário autenticado sem autorização para a operação. O frontend limpa o token e solicita novo login quando recebe `401`.

## Operação

| Método | Endpoint | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/dashboard` | Todos | Indicadores resumidos |
| GET | `/api/organizacoes?page=1&limit=20` | Todos | Lista organizações paginada |
| POST | `/api/organizacoes` | Operador/Admin | Cria organização |
| GET | `/api/organizacoes/:id` | Todos | Detalha organização, contrato e lotes |
| PUT | `/api/organizacoes/:id` | Operador/Admin | Atualiza organização; envie a `versao` atual retornada pela API |
| DELETE | `/api/organizacoes/:id` | Admin | Exclui quando não houver lotes vinculados |
| GET | `/api/contratos?page=1&limit=20&q=CTR` | Todos | Lista contratos paginados e pesquisáveis |
| POST | `/api/contratos` | Operador/Admin | Cria contrato |
| PUT | `/api/contratos/:id` | Operador/Admin | Atualiza contrato; envie a `versao` atual retornada pela API |
| DELETE | `/api/contratos/:id` | Admin | Exclui contrato |
| GET | `/api/lotes?page=1&limit=20` | Todos | Lista lotes |
| POST | `/api/lotes` | Operador/Admin | Cria lote; opcionalmente recebe `equipamentos[]` para criar lote, equipamentos e movimentações iniciais atomicamente |
| PUT | `/api/lotes/:id` | Operador/Admin | Atualiza lote; envie a `versao` atual retornada pela API |
| DELETE | `/api/lotes/:id` | Admin | Exclui lote sem equipamentos vinculados |
| GET | `/api/equipamentos?page=1&limit=20&status=RECEBIDO&q=note` | Todos | Lista e filtra equipamentos |
| POST | `/api/equipamentos` | Operador/Admin | Cria equipamento e movimento inicial atomicamente |
| PUT | `/api/equipamentos/:id` | Operador/Admin | Atualiza dados cadastrais; envie a `versao` atual retornada pela API |
| PATCH | `/api/equipamentos/:id/status` | Operador/Admin | Transiciona status e registra movimento atomicamente |
| GET | `/api/equipamentos/:id/movimentacoes` | Todos | Histórico de um equipamento |
| GET | `/api/movimentacoes?page=1&limit=20&q=triagem` | Todos | Lista histórico de movimentações paginado e pesquisável |
| GET | `/api/admin/usuarios?page=1&limit=20&q=nome` | Admin | Lista usuários paginados sem expor hashes de senha |
| POST | `/api/admin/usuarios` | Admin | Cria usuário; senha mínima de 10 caracteres |
| PUT | `/api/admin/usuarios/:id` | Admin | Atualiza usuário, papel, senha ou estado; exige `versao` |
| DELETE | `/api/admin/usuarios/:id` | Admin | Exclui usuário, exceto a própria conta ou o último administrador ativo |

Na interface, organizações, lotes e contratos podem ser criados, editados e excluídos por um administrador; equipamentos podem ser criados e editados, mas não excluídos, para preservar seu histórico de movimentações. Operadores podem criar e editar, mas não excluir. A escolha de destino de status do equipamento segue apenas as transições permitidas.

## Status do equipamento

Valores: `RECEBIDO`, `EM_TRIAGEM`, `EM_REPARO`, `RECONDICIONADO`, `RECICLAGEM`, `DESCARTADO`.

Exemplo de atualização:

```json
{
  "status": "EM_TRIAGEM",
  "descricao": "Inspeção inicial",
  "responsavel": "Operador 01",
  "versao": 1
}
```

Respostas de erro relevantes: `400` dados inválidos, `401` sem token válido, `403` sem permissão, `404` registro inexistente, `409` conflito de unicidade/concorrência, `422` transição de status proibida.

Requisições de leitura limitam `limit` a 100 e retornam `data`, `total`, `page` e `limit`. O erro `401` encerra a sessão no frontend; o usuário precisa autenticar-se novamente. Respostas inesperadas usam mensagem genérica e não incluem stack trace; detalhes são registrados no log do servidor.

## Exemplos PowerShell

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3333/api/auth/login `
  -ContentType 'application/json' `
  -Body '{"email":"admin@greencode.local","senha":"GreenCode@123"}'
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Uri http://localhost:3333/api/dashboard -Headers $headers
```


## Concorrência otimista

Todas as operações `PUT` exigem o campo numérico `versao` obtido na leitura do registro. A atualização só é aplicada se a versão ainda for a mesma; em caso de conflito, a API retorna HTTP `409` e o cliente deve recarregar o registro antes de tentar novamente. A versão é incrementada automaticamente após uma atualização bem-sucedida.

## Validações adicionais

- Paginação limita `limit` a 100 registros.
- Organizações, contratos, lotes, equipamentos e movimentações aceitam pesquisa `q`; equipamentos também aceitam filtro por `status`. As listas retornam `data`, `total`, `page` e `limit`.
- A lista de contratos também é paginada; a interface solicita 10 registros por página.
- `POST /api/lotes` aceita opcionalmente de 1 a 100 equipamentos em `equipamentos`; lote, equipamentos e movimentações iniciais são persistidos atomicamente.
- IDs de recursos devem ser UUIDs válidos.
- Campos únicos (CNPJ, número de contrato, código de lote e código de barras interno) são protegidos pelo banco e conflitos retornam HTTP `409`.
- CNPJ é validado por dígitos verificadores, aceita o formato tradicional ou alfanumérico e é armazenado normalizado.
- O dashboard apresenta `financeiro.valorRecuperadoTotal` e `financeiro.porStatus`, somando com precisão decimal os valores `valorRecuperado` registrados nos equipamentos. O campo pode ser informado na criação ou edição do equipamento; sem regra de margem definida, não se calcula lucro.
- O banco também impede valores e pesos negativos, contratos com datas inconsistentes, versões inválidas e transições de equipamento fora do fluxo permitido.
- A data de término de contrato não pode ser anterior à data de início, tanto na criação quanto na edição; a API retorna HTTP `400` para esse caso.
- Campos opcionais podem ser limpos com `null` nos endpoints de atualização que permitem valores nulos.
- As mudanças de status só aceitam transições previstas no domínio e gravam o histórico na mesma transação.
- Os papéis e o estado ativo do usuário são consultados no banco em cada requisição protegida, portanto uma conta desativada perde acesso sem esperar o JWT expirar.
