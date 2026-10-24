export function hasValidContractDates(dataInicio: Date, dataFim?: Date | null): boolean {
  return dataFim == null || dataFim >= dataInicio;
}
