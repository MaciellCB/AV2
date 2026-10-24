# Importação dos dados do CLI

O repositório não inclui o código que criptografava os arquivos do CLI, a chave utilizada nem uma especificação confiável do formato binário. Por isso, o importador não tenta adivinhar ou descriptografar esses arquivos. A extração/descriptografia deve ser feita localmente com a ferramenta e a chave originais; em seguida, converta os dados para o JSON normalizado abaixo.

## Seed de demonstração não é migração

`npm run db:seed` cria uma massa fictícia e repetível para desenvolvimento/testes. Não lê arquivos do CLI e não deve ser usado como substituto da migração de dados reais. A migração histórica usa uma exportação JSON normalizada, validada e produzida a partir dos dados originais. O importador não migra usuários, hashes de senha ou sessões; crie contas novas e force o fluxo normal de autenticação.

## Procedimento recomendado

1. Identifique a versão do CLI, os arquivos de origem, a ferramenta de exportação/descriptografia e a chave original. Mantenha esses recursos e a exportação em armazenamento local com acesso restrito; não envie dados reais a serviços externos.
2. Gere o JSON normalizado sem alterar os originais. Faça uma cópia de segurança dos arquivos fonte e registre contagens de organizações, contratos, lotes, equipamentos e movimentações antes de converter.
3. Verifique o JSON antes da importação: formato, CNPJ, identificadores naturais duplicados, enums, datas, valores, vínculos e contagens. Corrija inconsistências na origem/conversão e preserve o arquivo de exportação usado para a execução.
4. Restaure um backup recente do PostgreSQL em uma base isolada de homologação. Execute as migrações de schema e importe primeiro nessa base; nunca valide a primeira execução diretamente em produção.
5. Compare contagens por entidade, relacionamentos, status e uma amostra de registros/históricos com a origem. Investigue toda diferença antes de aprovar a migração.
6. Antes da execução produtiva, faça e verifique um backup restaurável, defina janela e responsável, interrompa escritas concorrentes durante a importação e confirme que há plano de retorno por restauração.
7. Execute o mesmo arquivo JSON validado e compare novamente os totais. Em caso de erro, a transação cancela as gravações da execução. Para correção/reexecução, mantenha a exportação e restaure o backup se for necessário voltar ao estado anterior.
8. Após a aprovação, restrinja e retenha ou elimine com segurança as exportações e cópias temporárias conforme a política de dados da organização.

O importador é transacional e foi projetado para repetição: organizações, contratos, lotes e equipamentos são criados/atualizados pelos identificadores naturais; movimentações já existentes com a identidade documentada abaixo não são duplicadas. Isso não substitui backup, validação nem conferência dos dados, e alterações feitas na origem após gerar o arquivo exigem uma nova exportação validada.

## Formato de exportação

Salve um objeto JSON UTF-8. `organizacoes` é obrigatório; as outras coleções podem ser omitidas ou enviadas vazias. Os relacionamentos são resolvidos por CNPJ, código do lote e código de barras interno.
Os CNPJs são validados pelos dígitos verificadores, aceitando o formato numérico tradicional ou o formato alfanumérico. Pontuação é removida e letras são convertidas para maiúsculas antes de salvar.

```json
{
  "organizacoes": [
    {
      "nome": "Organização exemplo",
      "cnpj": "12345678000195",
      "email": "contato@exemplo.com",
      "telefone": "(11) 4000-0000",
      "endereco": "Rua exemplo, 100"
    }
  ],
  "contratos": [
    {
      "numero": "CTR-2026-001",
      "organizacaoCnpj": "12345678000195",
      "dataInicio": "2026-01-01T00:00:00.000Z",
      "dataFim": "2026-12-31T23:59:59.000Z",
      "valorTotal": 15000,
      "descricao": "Contrato de logística reversa",
      "clausulas": { "prazoMeses": 12 }
    }
  ],
  "lotes": [
    {
      "codigo": "LOTE-2026-001",
      "organizacaoCnpj": "12345678000195",
      "descricao": "Lote migrado",
      "dataRecebimento": "2026-01-10T13:00:00.000Z"
    }
  ],
  "equipamentos": [
    {
      "codigoBarrasInterno": "EQ-0001",
      "loteCodigo": "LOTE-2026-001",
      "nome": "Notebook",
      "categoria": "Informática",
      "fabricante": "Exemplo",
      "modelo": "X1",
      "numeroSerie": "SN-123",
      "status": "EM_TRIAGEM",
      "pesoKg": 2.4,
      "valorRecuperado": 0,
      "observacoes": "Importado do CLI"
    }
  ],
  "movimentacoes": [
    {
      "equipamentoCodigoBarrasInterno": "EQ-0001",
      "tipo": "RECEBIMENTO",
      "statusAnterior": null,
      "statusNovo": "RECEBIDO",
      "descricao": "Recebimento original",
      "responsavel": "Operador",
      "data": "2026-01-10T13:00:00.000Z"
    }
  ]
}
```

Datas de movimentação devem ser incluídas para permitir que execuções repetidas sejam idempotentes. A identidade usada para evitar duplicação é equipamento, tipo, status novo, data e responsável. Status e tipos devem corresponder aos enums atuais do GreenCode. Campos opcionais podem ser nulos.

## Execução

Execute primeiro em homologação, seguindo o procedimento acima. O importador processa o arquivo dentro de uma transação PostgreSQL; um erro de vínculo ou validação cancela a transação inteira.

No PowerShell, a partir de `backend`:

```powershell
npm run db:import-cli -- "C:\caminho\seguro\exportacao-greencode.json"
```

No Ubuntu:

```bash
npm run db:import-cli -- "/caminho/seguro/exportacao-greencode.json"
```

O arquivo exportado contém dados potencialmente pessoais e deve permanecer local, com acesso restrito, e ser removido de forma segura conforme a política de retenção após a validação da migração. Teste primeiro em uma base de homologação e confira os totais e relacionamentos antes de importar em produção.
