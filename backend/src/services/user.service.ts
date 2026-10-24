import type { PrismaClient } from '@prisma/client';
import { createUserRepository } from '../repositories/user.repository.js';

export class UserManagementError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'LAST_ADMIN' | 'SELF_CHANGE') {
    super(code);
    this.name = 'UserManagementError';
  }
}

export function createUserService(db: PrismaClient) {
  const users = createUserRepository(db);
  return {
    async list(page: number, limit: number, query?: string) {
      const [data, total] = await users.list((page - 1) * limit, limit, query);
      return { data, total, page, limit, ...(query ? { q: query } : {}) };
    },
    accessState(id: string) {
      return users.findAccessState(id);
    },
    create(input: { nome: string; email: string; senhaHash: string; papel: 'ADMINISTRADOR' | 'OPERADOR' | 'CONSULTA' }) {
      return users.create(input);
    },
    async update(input: {
      id: string;
      versao: number;
      actorId: string;
      data: {
        nome?: string;
        email?: string;
        senhaHash?: string;
        papel?: 'ADMINISTRADOR' | 'OPERADOR' | 'CONSULTA';
        ativo?: boolean;
      };
    }) {
      return db.$transaction(async (tx) => {
        const repository = createUserRepository(tx);
        const current = await repository.findById(input.id);
        if (!current) throw new UserManagementError('NOT_FOUND');
        if (current.versao !== input.versao) throw new UserManagementError('VERSION_CONFLICT');

        const deactivatesLastAdmin = current.papel === 'ADMINISTRADOR'
          && current.ativo
          && (input.data.ativo === false || (input.data.papel !== undefined && input.data.papel !== 'ADMINISTRADOR'));
        if (deactivatesLastAdmin && await repository.countActiveAdministrators() <= 1) {
          throw new UserManagementError('LAST_ADMIN');
        }

        if (input.id === input.actorId && (input.data.ativo === false || (input.data.papel !== undefined && input.data.papel !== 'ADMINISTRADOR'))) {
          throw new UserManagementError('SELF_CHANGE');
        }

        const changed = await repository.updateVersioned(input.id, input.versao, input.data);
        if (!changed.count) throw new UserManagementError('VERSION_CONFLICT');
        const updated = await repository.findById(input.id);
        if (!updated) throw new UserManagementError('NOT_FOUND');
        const { senhaHash: _senhaHash, ...safeUser } = updated;
        return safeUser;
      }, { isolationLevel: 'Serializable' });
    },
    async remove(id: string, actorId: string) {
      return db.$transaction(async (tx) => {
        const repository = createUserRepository(tx);
        if (id === actorId) throw new UserManagementError('SELF_CHANGE');
        const current = await repository.findById(id);
        if (!current) throw new UserManagementError('NOT_FOUND');
        if (current.papel === 'ADMINISTRADOR' && current.ativo && await repository.countActiveAdministrators() <= 1) {
          throw new UserManagementError('LAST_ADMIN');
        }
        await repository.delete(id);
      }, { isolationLevel: 'Serializable' });
    },
  };
}
