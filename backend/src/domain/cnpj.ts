import { z } from 'zod';

export function normalizeCnpj(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(digits) || /^([A-Z0-9])\1{11}\d{2}$/.test(digits)) return false;

  const calculateDigit = (base: string) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...base].reduce((total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calculateDigit(digits.slice(0, 12));
  const secondDigit = calculateDigit(`${digits.slice(0, 12)}${firstDigit}`);
  return digits.endsWith(`${firstDigit}${secondDigit}`);
}

export const cnpjSchema = z.string()
  .refine(isValidCnpj, 'CNPJ inválido')
  .transform(normalizeCnpj);
