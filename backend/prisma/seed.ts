import 'dotenv/config';
import { PrismaClient, type StatusEquipamento, type TipoMovimentacao } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const movementForStatus: Record<StatusEquipamento, TipoMovimentacao> = {
  RECEBIDO: 'RECEBIMENTO',
  EM_TRIAGEM: 'TRIAGEM',
  EM_REPARO: 'REPARO',
  RECONDICIONADO: 'RECONDICIONAMENTO',
  RECICLAGEM: 'RECICLAGEM',
  DESCARTADO: 'DESCARTE',
};

const paths: Record<StatusEquipamento, StatusEquipamento[]> = {
  RECEBIDO: ['RECEBIDO'],
  EM_TRIAGEM: ['RECEBIDO', 'EM_TRIAGEM'],
  EM_REPARO: ['RECEBIDO', 'EM_TRIAGEM', 'EM_REPARO'],
  RECONDICIONADO: ['RECEBIDO', 'EM_TRIAGEM', 'RECONDICIONADO'],
  RECICLAGEM: ['RECEBIDO', 'EM_TRIAGEM', 'RECICLAGEM'],
  DESCARTADO: ['RECEBIDO', 'EM_TRIAGEM', 'DESCARTADO'],
};

async function main() {
  const demoUsers = [
    { nome: 'Administrador GreenCode', email: 'admin@greencode.local', senha: 'GreenCode@123', papel: 'ADMINISTRADOR' as const },
    { nome: 'Operador GreenCode', email: 'operador@greencode.local', senha: 'Operador@123', papel: 'OPERADOR' as const },
    { nome: 'Consulta GreenCode', email: 'consulta@greencode.local', senha: 'Consulta@123', papel: 'CONSULTA' as const },
  ];
  for (const user of demoUsers) {
    await prisma.usuario.upsert({
      where: { email: user.email },
      update: {},
      create: {
        nome: user.nome,
        email: user.email,
        senhaHash: await bcrypt.hash(user.senha, 12),
        papel: user.papel,
      },
    });
  }

  const organizations = [
    { nome: 'Organização Exemplo', cnpj: '00000000000191', email: 'contato@exemplo.local', telefone: '(11) 4000-1000' },
    { nome: 'EcoTech Recondicionamento', cnpj: '00000000000272', email: 'operacao@ecotech.local', telefone: '(11) 4000-2000' },
    { nome: 'Circular Eletrônicos', cnpj: '00000000000353', email: 'logistica@circular.local', telefone: '(21) 4000-3000' },
  ];
  const orgByName = new Map<string, string>();
  for (const data of organizations) {
    const org = await prisma.organizacao.upsert({
      where: { cnpj: data.cnpj },
      update: { nome: data.nome, email: data.email, telefone: data.telefone },
      create: data,
    });
    orgByName.set(data.nome, org.id);
  }

  const contractSeeds = [
    { numero: 'GC-CONTRATO-2026-001', descricao: 'Coleta e triagem de equipamentos de informática', dataInicio: new Date('2026-01-01T12:00:00.000Z'), dataFim: new Date('2026-12-31T12:00:00.000Z'), valorTotal: '18500.00', organizacaoId: orgByName.get('Organização Exemplo')! },
    { numero: 'GC-CONTRATO-2026-002', descricao: 'Recondicionamento e destinação ambiental', dataInicio: new Date('2026-02-01T12:00:00.000Z'), dataFim: new Date('2027-01-31T12:00:00.000Z'), valorTotal: '27300.00', organizacaoId: orgByName.get('EcoTech Recondicionamento')! },
  ];
  for (const data of contractSeeds) {
    await prisma.contrato.upsert({
      where: { numero: data.numero },
      update: {},
      create: { ...data, valorTotal: data.valorTotal },
    });
  }

  const lotSeeds = [
    { codigo: 'LOTE-DEMO-001', descricao: 'Lote inicial para demonstração', organizacaoId: orgByName.get('Organização Exemplo')! },
    { codigo: 'LOTE-DEMO-002', descricao: 'Equipamentos recebidos para diagnóstico', organizacaoId: orgByName.get('EcoTech Recondicionamento')! },
    { codigo: 'LOTE-DEMO-003', descricao: 'Equipamentos aguardando destinação final', organizacaoId: orgByName.get('Circular Eletrônicos')! },
  ];
  const lotByCode = new Map<string, string>();
  for (const data of lotSeeds) {
    const lot = await prisma.lote.upsert({ where: { codigo: data.codigo }, update: {}, create: data });
    lotByCode.set(data.codigo, lot.id);
  }

  const equipmentSeeds: Array<{
    codigoBarrasInterno: string; nome: string; categoria: string; fabricante: string;
    loteCode: string; status: StatusEquipamento; observacoes: string;
  }> = [
    { codigoBarrasInterno: 'GC-DEMO-0001', nome: 'Notebook para triagem', categoria: 'Informática', fabricante: 'Exemplo', loteCode: 'LOTE-DEMO-001', status: 'EM_TRIAGEM', observacoes: 'Equipamento em avaliação técnica' },
    { codigoBarrasInterno: 'GC-DEMO-0002', nome: 'Desktop corporativo', categoria: 'Informática', fabricante: 'Circular', loteCode: 'LOTE-DEMO-002', status: 'EM_REPARO', observacoes: 'Aguardando substituição de componente' },
    { codigoBarrasInterno: 'GC-DEMO-0003', nome: 'Monitor LCD', categoria: 'Monitor', fabricante: 'EcoView', loteCode: 'LOTE-DEMO-002', status: 'RECONDICIONADO', observacoes: 'Aprovado para reutilização' },
    { codigoBarrasInterno: 'GC-DEMO-0004', nome: 'Impressora antiga', categoria: 'Periférico', fabricante: 'PrintMax', loteCode: 'LOTE-DEMO-003', status: 'RECICLAGEM', observacoes: 'Encaminhada para recuperação de materiais' },
    { codigoBarrasInterno: 'GC-DEMO-0005', nome: 'Roteador danificado', categoria: 'Rede', fabricante: 'NetLink', loteCode: 'LOTE-DEMO-003', status: 'DESCARTADO', observacoes: 'Sem possibilidade de recuperação segura' },
  ];

  for (const data of equipmentSeeds) {
    const { loteCode, status, ...equipmentData } = data;
    const equipment = await prisma.equipamento.upsert({
      where: { codigoBarrasInterno: data.codigoBarrasInterno },
      update: { nome: data.nome, categoria: data.categoria, fabricante: data.fabricante, observacoes: data.observacoes, loteId: lotByCode.get(loteCode)!, status },
      create: { ...equipmentData, loteId: lotByCode.get(loteCode)!, status },
    });

    const path = paths[status];
    for (let index = 0; index < path.length; index++) {
      const state = path[index];
      const previous = index > 0 ? path[index - 1] : null;
      const existing = await prisma.movimentacao.findFirst({
        where: { equipamentoId: equipment.id, statusNovo: state, tipo: movementForStatus[state] },
      });
      if (!existing) {
        await prisma.movimentacao.create({
          data: {
            equipamentoId: equipment.id,
            tipo: movementForStatus[state],
            statusAnterior: previous,
            statusNovo: state,
            descricao: index === 0 ? 'Recebimento inicial para massa de demonstração' : `Etapa de demonstração: ${state}`,
            responsavel: 'Seed GreenCode',
          },
        });
      }
    }
  }

  console.log('Seed concluído: 3 usuários, 3 organizações, 2 contratos, 3 lotes, 5 equipamentos e histórico de movimentações.');
  console.log('Contas de demonstração: admin@greencode.local, operador@greencode.local e consulta@greencode.local.');
}

main()
  .catch((error) => {
    console.error('Falha ao popular o banco de demonstração:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
