import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, StatusEquipamento } from '@prisma/client';
import { prisma } from '../server.js';
import { roleCan, type Access, type UserRole } from '../domain/authorization.js';
import { cnpjSchema } from '../domain/cnpj.js';
import { DomainError, transitionEquipmentAtomically } from '../services/equipment.service.js';
import { CatalogBusinessError, createCatalogService } from '../services/catalog.service.js';
import { createUserService } from '../services/user.service.js';

const uuid = z.string().uuid();
const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
const orgInput = z.object({ nome:z.string().min(2), cnpj:cnpjSchema, email:z.string().email().optional().nullable(), telefone:z.string().optional().nullable(), endereco:z.string().optional().nullable() });
const lotInput = z.object({ codigo:z.string().min(1), descricao:z.string().optional(), organizacaoId:uuid });
const equipmentInLotInput = z.array(z.object({
    codigoBarrasInterno: z.string().min(1),
    nome: z.string().min(2),
    categoria: z.string().optional(),
    fabricante: z.string().optional(),
    modelo: z.string().optional(),
    numeroSerie: z.string().optional(),
    pesoKg: z.coerce.number().nonnegative().optional(),
    valorRecuperado: z.coerce.number().nonnegative().optional(),
    observacoes: z.string().optional(),
  })).min(1).max(100);
const lotRequestInput = lotInput.extend({ equipamentos: equipmentInLotInput.optional() });
const equipmentInput = z.object({ codigoBarrasInterno:z.string().min(1), nome:z.string().min(2), categoria:z.string().optional(), fabricante:z.string().optional(), modelo:z.string().optional(), numeroSerie:z.string().optional(), pesoKg:z.coerce.number().nonnegative().optional(), valorRecuperado:z.coerce.number().nonnegative().optional(), loteId:uuid, observacoes:z.string().optional() });
const equipmentUpdateInput = equipmentInput.partial().extend({
  categoria:z.string().nullable().optional(),
  fabricante:z.string().nullable().optional(),
  modelo:z.string().nullable().optional(),
  numeroSerie:z.string().nullable().optional(),
  pesoKg:z.coerce.number().nonnegative().nullable().optional(),
  valorRecuperado:z.coerce.number().nonnegative().nullable().optional(),
  observacoes:z.string().nullable().optional(),
  versao:z.number().int().positive(),
});

export async function apiRoutes(app: FastifyInstance) {
  const catalog = createCatalogService(prisma);
  const users = createUserService(prisma);
  app.addHook('preHandler', async (req: any, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ erro: 'Autenticação necessária' }); }
    const method = req.method as string;
    const access: Access = method === 'GET' || method === 'HEAD' ? 'read' : method === 'DELETE' ? 'admin' : 'write';
    const userId = req.user?.sub as string | undefined;
    const user = userId ? await users.accessState(userId) : null;
    if (!user?.ativo) return reply.code(401).send({ erro: 'Sessão inválida ou usuário inativo' });
    const role = user.papel as UserRole;
    if (!role || !roleCan(role, access)) {
      return reply.code(403).send({ erro: 'Seu perfil não tem permissão para esta operação' });
    }
  });

  app.get('/dashboard', async () => catalog.dashboard());

  app.get('/organizacoes', async (req: any) => { const p = pageSchema.extend({q:z.string().optional()}).parse(req.query); return catalog.listOrganizations(p.page,p.limit,p.q); });
  app.post('/organizacoes', async (req, reply) => { const x=orgInput.safeParse(req.body); if(!x.success)return reply.code(400).send({erro:'Dados inválidos',detalhes:x.error.flatten()}); try{return reply.code(201).send(await catalog.createOrganization(x.data));}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')return reply.code(409).send({erro:'CNPJ já cadastrado'});throw e;} });
  app.get('/organizacoes/:id', async (req: any, reply) => { const id=uuid.safeParse(req.params.id);if(!id.success)return reply.code(400).send({erro:'ID inválido'});const item=await catalog.getOrganization(id.data);return item??reply.code(404).send({erro:'Organização não encontrada'}); });
  app.put('/organizacoes/:id', async (req: any, reply) => { const id=uuid.safeParse(req.params.id), x=orgInput.partial().extend({versao:z.number().int().positive()}).safeParse(req.body);if(!id.success||!x.success)return reply.code(400).send({erro:'ID ou dados inválidos'});const {versao,...data}=x.data;const result=await catalog.updateOrganization(id.data,versao,data);if(!result.count)return reply.code(409).send({erro:'Registro não encontrado ou versão desatualizada'});return catalog.findOrganization(id.data); });
  app.delete('/organizacoes/:id', async (req: any, reply) => { const id=uuid.safeParse(req.params.id);if(!id.success)return reply.code(400).send({erro:'ID inválido'});try{await catalog.deleteOrganization(id.data);return reply.code(204).send();}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2025')return reply.code(404).send({erro:'Organização não encontrada'});if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2003')return reply.code(409).send({erro:'Organização possui lotes vinculados'});throw e;} });

  app.get('/contratos', async (req: any) => { const p=pageSchema.extend({q:z.string().optional()}).parse(req.query);return catalog.listContracts(p.page,p.limit,p.q); });
  app.post('/contratos', async (req: any, reply) => { const s=z.object({numero:z.string().min(1),descricao:z.string().optional(),dataInicio:z.coerce.date(),dataFim:z.coerce.date().optional(),valorTotal:z.coerce.number().nonnegative().optional(),clausulas:z.unknown().optional(),organizacaoId:uuid}).safeParse(req.body);if(!s.success)return reply.code(400).send({erro:'Dados inválidos',detalhes:s.error.flatten()});try{return reply.code(201).send(await catalog.createContract(s.data));}catch(e){if(e instanceof CatalogBusinessError)return reply.code(400).send({erro:e.message});if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')return reply.code(409).send({erro:'Número de contrato ou organização já possui contrato'});throw e;} });
  app.put('/contratos/:id', async (req: any, reply) => {
    const id=uuid.safeParse(req.params.id); const s=z.object({numero:z.string().min(1).optional(),descricao:z.string().optional().nullable(),dataInicio:z.coerce.date().optional(),dataFim:z.coerce.date().optional().nullable(),valorTotal:z.coerce.number().nonnegative().optional().nullable(),clausulas:z.unknown().optional(),organizacaoId:uuid.optional(),versao:z.number().int().positive()}).safeParse(req.body);
    if(!id.success||!s.success)return reply.code(400).send({erro:'ID ou dados inválidos. Informe a versão atual do registro em versao.',detalhes:s.success?undefined:s.error.flatten()});
    const {versao,...data}=s.data;
    try{return await catalog.updateContractVersioned(id.data,versao,data);}catch(e){if(e instanceof CatalogBusinessError){const status=e.code==='NOT_FOUND'?404:e.code==='VERSION_CONFLICT'?409:400;return reply.code(status).send({erro:e.message});}if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')return reply.code(409).send({erro:'Número de contrato ou organização já possui contrato'});throw e;}
  });
  app.delete('/contratos/:id', async (req:any,reply)=>{const id=uuid.safeParse(req.params.id);if(!id.success)return reply.code(400).send({erro:'ID inválido'});try{await catalog.deleteContract(id.data);return reply.code(204).send();}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2025')return reply.code(404).send({erro:'Contrato não encontrado'});throw e;}});

  app.get('/lotes', async (req:any) => { const p=pageSchema.extend({q:z.string().optional()}).parse(req.query);return catalog.listLots(p.page,p.limit,p.q); });
  app.post('/lotes', async (req:any,reply) => {const parsed=lotRequestInput.safeParse(req.body);if(!parsed.success)return reply.code(400).send({erro:'Dados inválidos',detalhes:parsed.error.flatten()});try{const {equipamentos,...lot}=parsed.data;const result=equipamentos?await catalog.createLotWithEquipment({...lot,equipamentos}):await catalog.createLot(lot);return reply.code(201).send(result);}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')return reply.code(409).send({erro:'Código de lote ou código de barras interno já cadastrado'});throw e;} });
  app.put('/lotes/:id', async (req:any,reply)=>{const id=uuid.safeParse(req.params.id);const s=z.object({codigo:z.string().min(1).optional(),descricao:z.string().optional().nullable(),organizacaoId:uuid.optional(),versao:z.number().int().positive()}).safeParse(req.body);if(!id.success||!s.success)return reply.code(400).send({erro:'ID ou dados inválidos. Informe a versão atual do registro em versao.',detalhes:s.success?undefined:s.error.flatten()});const {versao,...data}=s.data;try{const changed=await catalog.updateLot(id.data,versao,data);if(!changed.count)return reply.code(409).send({erro:'Lote não encontrado ou versão desatualizada'});return catalog.getLot(id.data);}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')return reply.code(409).send({erro:'Código de lote já cadastrado'});throw e;}});
  app.delete('/lotes/:id', async (req:any,reply)=>{const id=uuid.safeParse(req.params.id);if(!id.success)return reply.code(400).send({erro:'ID inválido'});try{await catalog.deleteLot(id.data);return reply.code(204).send();}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2025')return reply.code(404).send({erro:'Lote não encontrado'});if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2003')return reply.code(409).send({erro:'Lote possui equipamentos vinculados'});throw e;}});

  app.get('/equipamentos', async (req:any) => {const p=pageSchema.extend({status:z.nativeEnum(StatusEquipamento).optional(),q:z.string().optional()}).parse(req.query);return catalog.listEquipment(p.page,p.limit,p.status,p.q);});
  app.post('/equipamentos', async (req:any,reply) => {const s=equipmentInput.safeParse(req.body);if(!s.success)return reply.code(400).send({erro:'Dados inválidos',detalhes:s.error.flatten()});try{return reply.code(201).send(await catalog.createEquipment(s.data));}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')return reply.code(409).send({erro:'Código de barras interno já cadastrado'});throw e;} });
  app.put('/equipamentos/:id', async (req:any,reply)=>{const id=uuid.safeParse(req.params.id);const s=equipmentUpdateInput.safeParse(req.body);if(!id.success||!s.success)return reply.code(400).send({erro:'ID ou dados inválidos. Informe a versão atual do registro em versao.',detalhes:s.success?undefined:s.error.flatten()});const {versao,pesoKg,valorRecuperado,...data}=s.data;try{const changed=await catalog.updateEquipment(id.data,versao,{...data,...(pesoKg===undefined?{}:{pesoKg:pesoKg===null?null:new Prisma.Decimal(pesoKg)}),...(valorRecuperado===undefined?{}:{valorRecuperado:valorRecuperado===null?null:new Prisma.Decimal(valorRecuperado)})});if(!changed.count)return reply.code(409).send({erro:'Equipamento não encontrado ou versão desatualizada'});return catalog.getEquipment(id.data);}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')return reply.code(409).send({erro:'Código de barras interno já cadastrado'});throw e;}});
  app.get('/equipamentos/:id/movimentacoes', async (req:any,reply) => {const id=uuid.safeParse(req.params.id);if(!id.success)return reply.code(400).send({erro:'ID inválido'});return catalog.equipmentMovements(id.data);});
  app.patch('/equipamentos/:id/status', async (req: any, reply) => {
    const id = uuid.safeParse(req.params.id);
    const parsed = z.object({ status: z.nativeEnum(StatusEquipamento), descricao: z.string().max(1000).optional(), responsavel: z.string().max(160).optional(), versao: z.number().int().positive() }).safeParse(req.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ erro: 'ID ou dados inválidos', ...(parsed.success ? {} : { detalhes: parsed.error.flatten() }) });
    try {
      const item = await transitionEquipmentAtomically(prisma, { id: id.data, ...parsed.data });
      return item;
    } catch (error) {
      if (error instanceof DomainError) {
        const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_TRANSITION' ? 422 : error.code === 'SAME_STATUS' ? 400 : 409;
        return reply.code(status).send({ erro: error.message, codigo: error.code });
      }
      throw error;
    }
  });
  app.get('/movimentacoes', async (req:any) => {const p=pageSchema.extend({q:z.string().optional()}).parse(req.query);return catalog.listMovements(p.page,p.limit,p.q);});
}
