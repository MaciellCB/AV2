CREATE TYPE "Papel" AS ENUM ('ADMINISTRADOR', 'OPERADOR', 'CONSULTA');
CREATE TYPE "StatusEquipamento" AS ENUM ('RECEBIDO', 'EM_TRIAGEM', 'EM_REPARO', 'RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO');
CREATE TYPE "TipoMovimentacao" AS ENUM ('RECEBIMENTO', 'TRIAGEM', 'REPARO', 'RECONDICIONAMENTO', 'RECICLAGEM', 'DESCARTE', 'TRANSFERENCIA');

CREATE TABLE "Usuario" (
  "id" UUID NOT NULL,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "senhaHash" TEXT NOT NULL,
  "papel" "Papel" NOT NULL DEFAULT 'OPERADOR',
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Organizacao" (
  "id" UUID NOT NULL,
  "nome" TEXT NOT NULL,
  "cnpj" TEXT NOT NULL,
  "email" TEXT,
  "telefone" TEXT,
  "endereco" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Organizacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contrato" (
  "id" UUID NOT NULL,
  "numero" TEXT NOT NULL,
  "descricao" TEXT,
  "dataInicio" TIMESTAMP(3) NOT NULL,
  "dataFim" TIMESTAMP(3),
  "valorTotal" DECIMAL(12,2),
  "clausulas" JSONB,
  "organizacaoId" UUID NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lote" (
  "id" UUID NOT NULL,
  "codigo" TEXT NOT NULL,
  "descricao" TEXT,
  "dataRecebimento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizacaoId" UUID NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Equipamento" (
  "id" UUID NOT NULL,
  "codigoBarrasInterno" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "categoria" TEXT,
  "fabricante" TEXT,
  "modelo" TEXT,
  "numeroSerie" TEXT,
  "status" "StatusEquipamento" NOT NULL DEFAULT 'RECEBIDO',
  "pesoKg" DECIMAL(10,3),
  "valorRecuperado" DECIMAL(12,2),
  "observacoes" TEXT,
  "loteId" UUID NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Equipamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Movimentacao" (
  "id" UUID NOT NULL,
  "equipamentoId" UUID NOT NULL,
  "tipo" "TipoMovimentacao" NOT NULL,
  "statusAnterior" "StatusEquipamento",
  "statusNovo" "StatusEquipamento" NOT NULL,
  "descricao" TEXT,
  "responsavel" TEXT,
  "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Movimentacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX "Organizacao_cnpj_key" ON "Organizacao"("cnpj");
CREATE UNIQUE INDEX "Contrato_numero_key" ON "Contrato"("numero");
CREATE UNIQUE INDEX "Contrato_organizacaoId_key" ON "Contrato"("organizacaoId");
CREATE UNIQUE INDEX "Lote_codigo_key" ON "Lote"("codigo");
CREATE UNIQUE INDEX "Equipamento_codigoBarrasInterno_key" ON "Equipamento"("codigoBarrasInterno");
CREATE INDEX "Movimentacao_equipamentoId_data_idx" ON "Movimentacao"("equipamentoId", "data");

ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Movimentacao" ADD CONSTRAINT "Movimentacao_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
