export type UserRole = 'ADMINISTRADOR' | 'OPERADOR' | 'CONSULTA';
export type Access = 'read' | 'write' | 'admin';

export function roleCan(role: UserRole, access: Access): boolean {
  if (access === 'read') return true;
  if (access === 'write') return role === 'ADMINISTRADOR' || role === 'OPERADOR';
  return role === 'ADMINISTRADOR';
}
