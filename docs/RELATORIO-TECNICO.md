# Relatório técnico — GreenCode

## 1. Introdução

O GreenCode é uma proposta de sistema para apoiar a logística reversa de equipamentos. A atividade propõe evoluir uma aplicação CLI com persistência em arquivos criptografados para uma aplicação servidora que permita acesso simultâneo, exponha uma API REST e armazene dados em banco relacional.

## 2. Objetivo geral

Implementar uma base web para registrar organizações, contratos, lotes, equipamentos e movimentações, preservando o histórico das mudanças de estado dos equipamentos.

## 3. Objetivos específicos

- disponibilizar interface SPA e API HTTP;
- persistir os dados em PostgreSQL por meio do Prisma ORM;
- validar entradas e impor unicidade de identificadores relevantes;
- autenticar usuários por JWT e armazenar hashes de senha;
- separar regras de negócio críticas da camada HTTP;
- registrar as transições de status com consistência transacional;
- documentar instalação, endpoints e decisões técnicas.

## 4. Arquitetura proposta

A solução utiliza um monólito modular. O React apresenta a interface; o Fastify recebe requisições e retorna JSON; os serviços aplicam regras; o Prisma acessa PostgreSQL. Essa escolha reduz o custo de execução e depuração para o estágio acadêmico em comparação com microsserviços.

## 5. Decisões arquiteturais e trade-offs

O sistema foi organizado como monólito modular porque a atividade prioriza uma aplicação servidora coesa e a simplicidade de desenvolvimento e implantação. Microsserviços aumentariam a complexidade operacional e de comunicação entre componentes sem uma necessidade demonstrada nesta etapa.

O **Fastify** foi escolhido para o servidor HTTP por oferecer validação de requisições por schemas, hooks e organização por plugins, recursos úteis para manter validações e autenticação consistentes nas rotas. O trade-off é que seu modelo de plugins exige familiaridade com a encapsulação do framework e parte dos desenvolvedores pode conhecer melhor o Express. Express continua sendo uma alternativa válida, mas exigiria selecionar e compor mais peças para alcançar a mesma estrutura.

O **PostgreSQL** foi escolhido como banco relacional por oferecer transações, constraints e suporte a JSON para cláusulas de contrato. Esses recursos permitem manter regras de integridade também no banco, além da validação na aplicação. O trade-off é o acoplamento a recursos SQL específicos nas migrações e a operação de um serviço PostgreSQL; MySQL também atenderia às relações do domínio, mas não é o banco configurado para esta entrega.

A interface foi implementada como **SPA com React** para oferecer navegação e atualização das tabelas sem recarregar a página, consumindo a API REST separadamente. Isso favorece os fluxos interativos e autenticados do painel. Como trade-off, o navegador precisa baixar e executar JavaScript e a primeira carga pode ser maior; renderização no servidor poderia melhorar a carga inicial e indexação, mas esses benefícios são menos importantes para uma área operacional autenticada e adicionariam complexidade.

## 6. Modelo de dados

A organização possui muitos lotes e pode possuir um contrato opcional. O contrato é limitado a uma organização por uma chave única em `organizacaoId`. Cada lote pertence a uma organização e agrupa equipamentos. Cada equipamento possui um status atual e muitas movimentações. O usuário é uma entidade adicional para autenticação e autorização.

As chaves únicas incluem CNPJ, número do contrato, código do lote e código de barras interno. O CNPJ é validado pelos dígitos verificadores nos formatos numérico tradicional e alfanumérico. Os relacionamentos utilizam chaves estrangeiras para preservar integridade referencial. As operações de atualização exigem o campo de versão atual e usam atualização condicional para detectar conflitos concorrentes.

## 7. Segurança

As senhas são verificadas por bcrypt e nunca devem ser armazenadas em texto puro. O login emite um JWT com validade limitada. A política de papéis define leitura para todos os perfis autenticados, escrita para `OPERADOR` e `ADMINISTRADOR`, e exclusão para `ADMINISTRADOR`. O segredo JWT deve ser configurado por variável de ambiente e substituído antes de qualquer uso fora do ambiente local.

## 8. Integridade e concorrência

A criação de um equipamento e a movimentação inicial são agrupadas em transação. A API também permite criar um lote com até 100 equipamentos e movimentos iniciais em uma única escrita aninhada atômica. A mudança de status e a movimentação correspondente também são gravadas atomicamente. Além das regras na aplicação, uma trigger PostgreSQL impede transições de status fora do fluxo permitido; constraints verificam versões positivas, valores não negativos e datas contratuais consistentes. A atualização condicional por versão permite detectar conflitos e responder com HTTP 409.

## 9. Regras de transição

O equipamento recebido pode entrar em triagem. Em triagem, pode seguir para reparo, recondicionamento, reciclagem ou descarte. Em reparo, pode ser recondicionado, reciclado ou descartado. Os três últimos destinos são tratados como estados finais no fluxo atual. Toda transição aceita cria um registro de movimentação. O dashboard apresenta a soma decimal dos valores recuperados informados nos equipamentos, com subtotais por status; não infere lucro ou margem.

## 10. Testes e validação

A suíte inclui testes unitários para transições, autorização, CNPJ, datas contratuais, cálculos financeiros e validação do importador, um smoke test HTTP, testes de integração PostgreSQL e testes E2E com Playwright. A validação automatizada foi executada em Windows 11 Pro, com Node.js 24.18.0 e PostgreSQL 16 em Docker: os 12 testes backend passaram, incluindo integração PostgreSQL; os 2 testes E2E passaram; typecheck e builds de produção do backend e frontend também passaram. Conforme informado pelo responsável, a aplicação também foi executada e testada funcionalmente em Windows 10 e Linux. As distribuições e versões Linux específicas não foram registradas neste documento.

## 11. Dados de demonstração e limites

O seed cria uma massa demonstrativa idempotente com três organizações, dois contratos, três lotes, cinco equipamentos em estados variados e o histórico de movimentações correspondente. Isso atende à finalidade de popular o sistema para desenvolvimento e validação, conforme a atividade sugere. A atividade não exige importar arquivos reais do CLI; a importação de dados históricos é um recurso adicional documentado, condicionado à existência de uma exportação normalizada, pois o repositório não contém o código ou a chave necessários para descriptografar os arquivos originais. CRUDs estão extraídos em controllers, services e repositories.

## 12. Trabalhos futuros

Também são recomendados documentação OpenAPI automatizada, auditoria, backup e HTTPS para uso produtivo. O workflow de CI está configurado para builds em Windows e Ubuntu 24.04, mas ainda precisa ser executado no GitHub; distribuições e versões específicas do Linux não foram registradas individualmente.

## 13. Conclusão

A implementação estabelece a evolução do GreenCode para um sistema web funcional, com API REST, autenticação, persistência relacional e rastreabilidade de equipamentos. Os testes automatizados foram executados no ambiente Windows 11 descrito; conforme informado pelo responsável, a aplicação também funciona nos ambientes Windows 10 e Linux em que foi testada. A separação modular, as transações e as regras de transição favorecem manutenção e integridade. A execução da CI continua recomendada para obter uma evidência automatizada adicional da matriz configurada.
