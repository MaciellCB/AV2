ALTER TABLE "Usuario"
  ADD CONSTRAINT "Usuario_versao_positive_check" CHECK ("versao" > 0);

ALTER TABLE "Organizacao"
  ADD CONSTRAINT "Organizacao_versao_positive_check" CHECK ("versao" > 0);

ALTER TABLE "Contrato"
  ADD CONSTRAINT "Contrato_versao_positive_check" CHECK ("versao" > 0),
  ADD CONSTRAINT "Contrato_dates_check" CHECK ("dataFim" IS NULL OR "dataFim" >= "dataInicio"),
  ADD CONSTRAINT "Contrato_valorTotal_nonnegative_check" CHECK ("valorTotal" IS NULL OR "valorTotal" >= 0);

ALTER TABLE "Lote"
  ADD CONSTRAINT "Lote_versao_positive_check" CHECK ("versao" > 0);

ALTER TABLE "Equipamento"
  ADD CONSTRAINT "Equipamento_versao_positive_check" CHECK ("versao" > 0),
  ADD CONSTRAINT "Equipamento_pesoKg_nonnegative_check" CHECK ("pesoKg" IS NULL OR "pesoKg" >= 0),
  ADD CONSTRAINT "Equipamento_valorRecuperado_nonnegative_check" CHECK ("valorRecuperado" IS NULL OR "valorRecuperado" >= 0);

ALTER TABLE "Movimentacao"
  ADD CONSTRAINT "Movimentacao_versao_positive_check" CHECK ("versao" > 0);

CREATE FUNCTION "enforce_equipment_status_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'RECEBIDO' AND NEW."status" = 'EM_TRIAGEM')
    OR (OLD."status" = 'EM_TRIAGEM' AND NEW."status" IN ('EM_REPARO', 'RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO'))
    OR (OLD."status" = 'EM_REPARO' AND NEW."status" IN ('RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO'))
  ) THEN
    RAISE EXCEPTION 'Transição de status de equipamento não permitida: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514', CONSTRAINT = 'Equipamento_status_transition_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Equipamento_status_transition_trigger"
BEFORE UPDATE OF "status" ON "Equipamento"
FOR EACH ROW
EXECUTE FUNCTION "enforce_equipment_status_transition"();
