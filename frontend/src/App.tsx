import { useEffect, useState, type FormEvent } from 'react';
import { Recycle, LayoutDashboard, Building2, Package, Cpu, History, LogOut, Search, Leaf, ArrowUpRight, Menu, X, RefreshCw, Pencil, Trash2, Check, XCircle, Users } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api';
const sections = ['Visão geral', 'Organizações', 'Lotes', 'Contratos', 'Equipamentos', 'Movimentações', 'Usuários'] as const;
type Section = typeof sections[number];
type Stats = {
  organizacoes: number;
  lotes: number;
  equipamentos: number;
  emTriagem: number;
  recuperados: number;
  reciclados: number;
  financeiro: { valorRecuperadoTotal: string; porStatus: Record<string, string> };
};
type RecordData = Record<string, any>;
type Role = 'ADMINISTRADOR' | 'OPERADOR' | 'CONSULTA';
type FormValues = Record<string, string>;
const pageSize = 10;
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const transitions: Record<string, string[]> = {
  RECEBIDO: ['EM_TRIAGEM'],
  EM_TRIAGEM: ['EM_REPARO', 'RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO'],
  EM_REPARO: ['RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO'],
};

function resourceFor(section: Section) {
  return section === 'Organizações' ? 'organizacoes'
    : section === 'Lotes' ? 'lotes'
      : section === 'Contratos' ? 'contratos'
        : section === 'Equipamentos' ? 'equipamentos'
          : section === 'Usuários' ? 'admin/usuarios'
        : 'movimentacoes';
}

function dateInput(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function fieldsFor(section: Section, item?: RecordData): FormValues {
  if (section === 'Organizações') {
    return { nome: item?.nome ?? '', cnpj: item?.cnpj ?? '', email: item?.email ?? '', telefone: item?.telefone ?? '', endereco: item?.endereco ?? '' };
  }
  if (section === 'Lotes') {
    return { codigo: item?.codigo ?? '', organizacaoId: item?.organizacaoId ?? '', descricao: item?.descricao ?? '' };
  }
  if (section === 'Contratos') {
    return {
      numero: item?.numero ?? '',
      organizacaoId: item?.organizacaoId ?? '',
      dataInicio: dateInput(item?.dataInicio),
      dataFim: dateInput(item?.dataFim),
      valorTotal: item?.valorTotal == null ? '' : String(item.valorTotal),
      descricao: item?.descricao ?? '',
    };
  }
  if (section === 'Equipamentos') {
    return {
      codigoBarrasInterno: item?.codigoBarrasInterno ?? '',
      nome: item?.nome ?? '',
      loteId: item?.loteId ?? '',
      categoria: item?.categoria ?? '',
      fabricante: item?.fabricante ?? '',
      modelo: item?.modelo ?? '',
      numeroSerie: item?.numeroSerie ?? '',
      pesoKg: item?.pesoKg == null ? '' : String(item.pesoKg),
      valorRecuperado: item?.valorRecuperado == null ? '' : String(item.valorRecuperado),
      observacoes: item?.observacoes ?? '',
    };
  }
  if (section === 'Usuários') {
    return {
      nome: item?.nome ?? '',
      email: item?.email ?? '',
      senha: '',
      papel: item?.papel ?? 'OPERADOR',
      ativo: String(item?.ativo ?? true),
    };
  }
  return {};
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('gc_token') ?? '');
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [section, setSection] = useState<Section>('Visão geral');
  const [items, setItems] = useState<RecordData[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecordData | null>(null);
  const [form, setForm] = useState<FormValues>({});
  const [relatedOrgs, setRelatedOrgs] = useState<RecordData[]>([]);
  const [relatedLots, setRelatedLots] = useState<RecordData[]>([]);
  const [transitionId, setTransitionId] = useState<string | null>(null);
  const [transitionStatus, setTransitionStatus] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [equipmentStatus, setEquipmentStatus] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [total, setTotal] = useState(0);

  const canWrite = role === 'ADMINISTRADOR' || role === 'OPERADOR';
  const canDelete = role === 'ADMINISTRADOR';
  const canDeleteRecord = canDelete && section !== 'Equipamentos';

  async function api(path: string, opts: RequestInit = {}) {
    const response = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
    });
    const data = response.status === 204 ? null : await response.json();
    if (response.status === 401 && path !== '/auth/login') {
      localStorage.removeItem('gc_token');
      localStorage.removeItem('gc_role');
      setToken('');
      setRole(null);
      setStats(null);
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    if (!response.ok) throw new Error(data?.erro ?? 'Não foi possível concluir a operação');
    return data;
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      const userRole = result.usuario.papel as Role;
      localStorage.setItem('gc_token', result.token);
      localStorage.setItem('gc_role', userRole);
      setRole(userRole);
      setToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    try {
      setError('');
      if (section === 'Visão geral') {
        setStats(await api('/dashboard'));
        return;
      }
      const resource = resourceFor(section);
      const query = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search.trim()) query.set('q', search.trim());
      if (section === 'Equipamentos' && statusFilter) query.set('status', statusFilter);
      const result = await api(`/${resource}?${query.toString()}`);
      const records: RecordData[] = Array.isArray(result) ? result : (result?.data ?? []);
      setItems(records);
      setTotal(Array.isArray(result) ? records.length : (result?.total ?? records.length));
      if (section === 'Lotes' || section === 'Equipamentos' || section === 'Contratos') {
        const organizations = await api('/organizacoes?limit=100');
        setRelatedOrgs(organizations?.data ?? []);
      }
      if (section === 'Equipamentos') {
        const lots = await api('/lotes?limit=100');
        setRelatedLots(lots?.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    }
  }

  useEffect(() => {
    if (!token) return;
    setRole((localStorage.getItem('gc_role') as Role | null) ?? null);
    void api('/auth/me').then((result) => {
      const userRole = result.usuario.papel as Role;
      localStorage.setItem('gc_role', userRole);
      setRole(userRole);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Não foi possível validar a sessão');
    });
  }, [token]);

  useEffect(() => {
    if (token) void load();
  }, [token, section, page, search, statusFilter]);

  function logout() {
    localStorage.removeItem('gc_token');
    localStorage.removeItem('gc_role');
    setToken('');
    setRole(null);
    setStats(null);
  }

  function openCreateForm() {
    setEditing(null);
    setForm(fieldsFor(section));
    setShowForm(true);
  }

  function applySearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchText);
    setStatusFilter(equipmentStatus);
  }

  function openEditForm(item: RecordData) {
    setEditing(item);
    setForm(fieldsFor(section, item));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm({});
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body: Record<string, unknown> = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value.trim() !== ''),
    );
    if (section === 'Contratos') {
      body.dataInicio = form.dataInicio;
      if (form.dataFim) body.dataFim = form.dataFim;
      if (form.valorTotal) body.valorTotal = Number(form.valorTotal);
    }
    if (section === 'Equipamentos') {
      if (form.pesoKg) body.pesoKg = Number(form.pesoKg);
      if (form.valorRecuperado) body.valorRecuperado = Number(form.valorRecuperado);
    }
    if (section === 'Usuários') {
      if (!editing && !form.senha.trim()) {
        setError('Informe uma senha com pelo menos 10 caracteres.');
        setBusy(false);
        return;
      }
      if (editing) {
        if (!form.senha.trim()) delete body.senha;
        body.ativo = form.ativo === 'true';
      }
    }
    if (editing) {
      body.versao = editing.versao;
      if (section === 'Organizações') {
        for (const key of ['email', 'telefone', 'endereco']) if (!form[key]?.trim()) body[key] = null;
      }
      if (section === 'Lotes' && !form.descricao?.trim()) body.descricao = null;
      if (section === 'Contratos') {
        if (!form.descricao?.trim()) body.descricao = null;
        if (!form.dataFim?.trim()) body.dataFim = null;
        if (!form.valorTotal?.trim()) body.valorTotal = null;
      }
      if (section === 'Equipamentos') {
        for (const key of ['categoria', 'fabricante', 'modelo', 'numeroSerie', 'observacoes']) {
          if (!form[key]?.trim()) body[key] = null;
        }
        if (!form.pesoKg?.trim()) body.pesoKg = null;
        if (!form.valorRecuperado?.trim()) body.valorRecuperado = null;
      }
    }
    try {
      await api(`/${resourceFor(section)}${editing ? `/${editing.id}` : ''}`, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar registro');
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/${resourceFor(section)}/${id}`, { method: 'DELETE' });
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir registro');
    } finally {
      setBusy(false);
    }
  }

  async function transitionEquipment(item: RecordData) {
    const choices = transitions[item.status] ?? [];
    const status = transitionStatus;
    if (!choices.includes(status)) {
      setError('Selecione um dos destinos permitidos para este equipamento.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/equipamentos/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, versao: item.versao, descricao: 'Atualização pela interface GreenCode' }),
      });
      setTransitionId(null);
      setTransitionStatus('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar status');
    } finally {
      setBusy(false);
    }
  }

  function renderFormFields() {
    const textInput = (name: string, label: string, required = false, type = 'text') => (
      <label key={name}>{label}<input
        type={type}
        required={required}
        step={type === 'number' ? 'any' : undefined}
        min={type === 'number' ? '0' : undefined}
        minLength={required && type === 'text' ? 2 : undefined}
        value={form[name] ?? ''}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
      /></label>
    );
    const selectInput = (name: string, label: string, options: RecordData[]) => (
      <label key={name}>{label}<select
        required
        value={form[name] ?? ''}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
      >
        <option value="">Selecione…</option>
        {options.map((option) => <option key={option.id} value={option.id}>
          {option.nome ?? option.codigo}
        </option>)}
      </select></label>
    );

    if (section === 'Organizações') return <>
      {textInput('nome', 'Nome', true)}
      {textInput('cnpj', 'CNPJ', true)}
      {textInput('email', 'E-mail', false, 'email')}
      {textInput('telefone', 'Telefone')}
      {textInput('endereco', 'Endereço')}
    </>;
    if (section === 'Lotes') return <>
      {textInput('codigo', 'Código do lote', true)}
      {selectInput('organizacaoId', 'Organização', relatedOrgs)}
      {textInput('descricao', 'Descrição')}
    </>;
    if (section === 'Contratos') return <>
      {textInput('numero', 'Número do contrato', true)}
      {selectInput('organizacaoId', 'Organização', relatedOrgs)}
      {textInput('dataInicio', 'Data de início', true, 'date')}
      {textInput('dataFim', 'Data de término', false, 'date')}
      {textInput('valorTotal', 'Valor total (R$)', false, 'number')}
      {textInput('descricao', 'Descrição')}
    </>;
    if (section === 'Equipamentos') return <>
      {textInput('codigoBarrasInterno', 'Código de barras interno', true)}
      {textInput('nome', 'Nome do equipamento', true)}
      {selectInput('loteId', 'Lote', relatedLots)}
      {textInput('categoria', 'Categoria')}
      {textInput('fabricante', 'Fabricante')}
      {textInput('modelo', 'Modelo')}
      {textInput('numeroSerie', 'Número de série')}
      {textInput('pesoKg', 'Peso (kg)', false, 'number')}
      {textInput('valorRecuperado', 'Valor recuperado (R$)', false, 'number')}
      {textInput('observacoes', 'Observações')}
    </>;
    if (section === 'Usuários') return <>
      {textInput('nome', 'Nome', true)}
      {textInput('email', 'E-mail', true, 'email')}
      {textInput('senha', editing ? 'Nova senha (opcional)' : 'Senha (mínimo 10 caracteres)', !editing, 'password')}
      <label>Papel<select required value={form.papel ?? 'OPERADOR'} onChange={(event) => setForm({ ...form, papel: event.target.value })}>
        <option value="ADMINISTRADOR">Administrador</option>
        <option value="OPERADOR">Operador</option>
        <option value="CONSULTA">Consulta</option>
      </select></label>
      {editing && <label>Status<select value={form.ativo ?? 'true'} onChange={(event) => setForm({ ...form, ativo: event.target.value })}>
        <option value="true">Ativo</option><option value="false">Inativo</option>
      </select></label>}
    </>;
    return null;
  }

  if (!token) return <div className="login-wrap"><div className="login-card">
    <div className="brand-mark"><Recycle size={30} /></div>
    <p className="eyebrow">LOGÍSTICA REVERSA INTELIGENTE</p>
    <h1>GreenCode</h1>
    <p className="muted">Gestão sustentável de equipamentos e materiais.</p>
    <form onSubmit={login}>
      <label>E-mail</label><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <label>Senha</label><input type="password" autoComplete="current-password" value={senha} onChange={(event) => setSenha(event.target.value)} required />
      <button className="primary full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no sistema'}</button>
      {error && <p className="error">{error}</p>}
    </form>
    <p className="hint">Ambiente de demonstração. Configure a API e execute o seed para entrar.</p>
  </div></div>;

  const columns: Record<Exclude<Section, 'Visão geral'>, Array<[string, string]>> = {
    Organizações: [['nome', 'Organização'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['telefone', 'Telefone']],
    Lotes: [['codigo', 'Código'], ['organizacao', 'Organização'], ['descricao', 'Descrição'], ['dataRecebimento', 'Recebimento']],
    Contratos: [['numero', 'Número'], ['organizacao', 'Organização'], ['dataInicio', 'Início'], ['dataFim', 'Término'], ['valorTotal', 'Valor']],
    Equipamentos: [['codigoBarrasInterno', 'Código interno'], ['nome', 'Equipamento'], ['status', 'Status'], ['categoria', 'Categoria'], ['valorRecuperado', 'Valor recuperado'], ['lote', 'Lote']],
    Movimentações: [['tipo', 'Tipo'], ['statusAnterior', 'Status anterior'], ['statusNovo', 'Status novo'], ['data', 'Data'], ['equipamento', 'Equipamento'], ['responsavel', 'Responsável']],
    Usuários: [['nome', 'Nome'], ['email', 'E-mail'], ['papel', 'Papel'], ['ativo', 'Status']],
  };

  return <div className="layout">
    <aside className={mobile ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <div className="brand-mark small"><Recycle size={22} /></div>
        <div><strong>GreenCode</strong><span>Eco management</span></div>
        <button type="button" className="icon-button close-mobile" aria-label="Fechar menu" title="Fechar menu" onClick={() => setMobile(false)}><X /></button>
      </div>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav>{sections.filter((name) => name !== 'Usuários' || role === 'ADMINISTRADOR').map((name) => {
        const Icon = name === 'Visão geral' ? LayoutDashboard
          : name === 'Organizações' ? Building2
            : name === 'Lotes' ? Package
              : name === 'Equipamentos' ? Cpu : name === 'Usuários' ? Users : History;
        return <button key={name} className={section === name ? 'nav-item active' : 'nav-item'} onClick={() => { setSection(name); setPage(1); setSearch(''); setSearchText(''); setStatusFilter(''); setEquipmentStatus(''); setMobile(false); closeForm(); setDeleteId(null); setTransitionId(null); }}>
          <Icon size={18} />{name}{name === 'Visão geral' && <span className="nav-dot" />}
        </button>;
      })}</nav>
      <div className="sidebar-bottom">
        <div className="eco-note"><Leaf size={18} /><p><b>Um futuro mais verde</b><span>Cada equipamento recuperado faz diferença.</span></p></div>
        <button className="nav-item" onClick={logout}><LogOut size={18} />Sair da conta</button>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMobile(true)}><Menu /></button>
        <div className="breadcrumb">GreenCode <span>/</span> <b>{section}</b></div>
        <div className="top-actions"><span className="status-pill"><i /> Sistema conectado</span><div className="avatar">{role === 'ADMINISTRADOR' ? 'AD' : role === 'OPERADOR' ? 'OP' : 'CO'}</div></div>
      </header>
      <section className="content">
        <div className="page-heading">
          <div><p className="eyebrow">CENTRAL DE OPERAÇÕES</p><h1>{section}</h1><p className="muted">Acompanhe a operação e o impacto ambiental em um só lugar.</p></div>
          <button className="secondary" onClick={() => void load()}><RefreshCw size={16} /> Atualizar</button>
        </div>
        {error && <div className="alert">{error}</div>}
        {section === 'Visão geral' ? <>
          <div className="welcome"><div><span className="welcome-tag"><Leaf size={14} /> IMPACTO POSITIVO</span><h2>Transformando resíduos em<br />novas possibilidades.</h2><p>Gerencie o ciclo de vida dos equipamentos com rastreabilidade e responsabilidade.</p></div><div className="welcome-art"><Recycle size={100} strokeWidth={1.1} /><span>REDUZIR · REUTILIZAR · RECICLAR</span></div></div>
          <div className="section-title"><div><h2>Indicadores operacionais</h2><p>Resumo atualizado da sua operação</p></div><span className="live-label"><i /> Dados do sistema</span></div>
          <div className="stats-grid">{[
            { label: 'Organizações', value: stats?.organizacoes, icon: Building2, sub: 'Parceiros cadastrados' },
            { label: 'Lotes recebidos', value: stats?.lotes, icon: Package, sub: 'Lotes registrados' },
            { label: 'Equipamentos', value: stats?.equipamentos, icon: Cpu, sub: 'Itens rastreados' },
            { label: 'Em triagem', value: stats?.emTriagem, icon: Search, sub: 'Aguardando avaliação' },
          ].map((stat, index) => <div className="stat-card" key={stat.label}><div className={`stat-icon icon-${index}`}><stat.icon size={20} /></div><p>{stat.label}</p><strong>{stat.value ?? '—'}</strong><div className="stat-foot"><span>{stat.sub}</span><ArrowUpRight size={15} /></div></div>)}</div>
          <div className="bottom-grid">
            <div className="panel"><div className="panel-head"><div><h3>Destino dos equipamentos</h3><p>Indicadores de recuperação e reciclagem</p></div><Recycle size={20} /></div>
              <div className="outcome-row"><div className="outcome-icon recovered"><RefreshCw size={18} /></div><div className="outcome-label"><b>Recondicionados</b><span>Prontos para novo ciclo de uso</span></div><strong>{stats?.recuperados ?? '—'}</strong></div>
              <div className="outcome-row"><div className="outcome-icon recycled"><Recycle size={18} /></div><div className="outcome-label"><b>Encaminhados à reciclagem</b><span>Materiais destinados à recuperação</span></div><strong>{stats?.reciclados ?? '—'}</strong></div>
            </div>
            <div className="panel impact-panel"><div className="impact-circle"><Leaf size={34} /></div><p className="eyebrow">NOSSO PROPÓSITO</p><h3>Economia circular<br />em movimento.</h3><p>Rastreabilidade de ponta a ponta para decisões mais sustentáveis e responsáveis.</p><button className="text-button" onClick={() => setSection('Equipamentos')}>Explorar equipamentos <ArrowUpRight size={16} /></button></div>
          </div>
          <div className="panel finance-panel">
            <div className="panel-head"><div><h3>Valores recuperados</h3><p>Soma dos valores informados nos equipamentos</p></div><strong>{currency.format(Number(stats?.financeiro.valorRecuperadoTotal ?? 0))}</strong></div>
            <div className="finance-breakdown">{Object.entries(stats?.financeiro.porStatus ?? {}).map(([status, value]) => (
              <div key={status}><span>{status.replace(/_/g, ' ')}</span><b>{currency.format(Number(value))}</b></div>
            ))}</div>
          </div>
        </> : <div className="panel table-panel">
          <div className="panel-head"><div><h3>{section} cadastrados</h3><p>Dados retornados pela API do GreenCode</p></div><div className="table-actions"><span className="count-pill">{total} registros</span>{section !== 'Movimentações' && canWrite && <button className="primary" onClick={openCreateForm}>Novo cadastro</button>}</div></div>
          <form className="table-filters" onSubmit={applySearch}>
            <input aria-label="Pesquisar registros" placeholder="Pesquisar..." value={searchText} onChange={(event) => setSearchText(event.target.value)} />
            {section === 'Equipamentos' && <select aria-label="Filtrar por status" value={equipmentStatus} onChange={(event) => setEquipmentStatus(event.target.value)}>
              <option value="">Todos os status</option>
              {['RECEBIDO', 'EM_TRIAGEM', 'EM_REPARO', 'RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO'].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>}
            <button className="secondary" type="submit"><Search size={15} />Pesquisar</button>
          </form>
          {showForm && <form className="create-form" onSubmit={saveRecord}>
            <div className="form-heading"><h3>{editing ? 'Editar registro' : 'Novo cadastro'}</h3><button type="button" className="icon-button" aria-label="Fechar formulário" onClick={closeForm}><X /></button></div>
            <div className="form-grid">{renderFormFields()}</div>
            <div className="form-actions"><button type="button" className="secondary" onClick={closeForm}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar cadastro'}</button></div>
          </form>}
          {items.length === 0 ? <div className="empty"><Package size={30} /><b>Nenhum registro encontrado</b><span>Cadastre dados pela API ou execute o script de seed.</span></div> : <div className="table-scroll"><table>
            <thead><tr>{columns[section].map(([, label]) => <th key={label}>{label}</th>)}{section !== 'Movimentações' && canWrite && <th>Ações</th>}</tr></thead>
            <tbody>{items.map((item) => <tr key={item.id}>
              {columns[section].map(([key]) => {
                const value = item[key];
                const display = value && typeof value === 'object'
                  ? (value.nome ?? value.codigo ?? value.numero ?? '—')
                  : value == null ? '—' : String(value);
                return <td key={key}>{key.toLowerCase().includes('data') || key === 'dataInicio' || key === 'dataFim'
                  ? (value ? new Date(value).toLocaleDateString() : '—')
                  : key === 'valorRecuperado' || key === 'valorTotal' ? (value == null ? '—' : currency.format(Number(value)))
                    : display.slice(0, 70)}</td>;
              })}
              {section !== 'Movimentações' && canWrite && <td><div className="row-actions">
                {section === 'Equipamentos' && (transitions[item.status]?.length ?? 0) > 0 && (transitionId === item.id
                  ? <div className="inline-transition"><select aria-label="Destino do equipamento" value={transitionStatus} onChange={(event) => setTransitionStatus(event.target.value)}><option value="">Escolha o destino…</option>{transitions[item.status].map((status) => <option key={status} value={status}>{status}</option>)}</select><button className="icon-button success" aria-label="Confirmar transição" disabled={busy || !transitionStatus} onClick={() => void transitionEquipment(item)}><Check size={16} /></button><button className="icon-button" aria-label="Cancelar transição" onClick={() => { setTransitionId(null); setTransitionStatus(''); }}><XCircle size={16} /></button></div>
                  : <button className="secondary compact" onClick={() => { setTransitionId(item.id); setTransitionStatus(transitions[item.status][0]); }}>Avançar etapa</button>)}
                <button className="icon-button" aria-label={`Editar ${item.nome ?? item.codigo ?? item.numero ?? item.codigoBarrasInterno}`} onClick={() => openEditForm(item)}><Pencil size={16} /></button>
                {canDeleteRecord && (deleteId === item.id
                  ? <span className="delete-confirm"><span>Excluir?</span><button className="icon-button danger" aria-label="Confirmar exclusão" disabled={busy} onClick={() => void deleteRecord(item.id)}><Check size={16} /></button><button className="icon-button" aria-label="Cancelar exclusão" onClick={() => setDeleteId(null)}><XCircle size={16} /></button></span>
                  : <button className="icon-button danger" aria-label={`Excluir ${item.nome ?? item.codigo ?? item.numero ?? item.codigoBarrasInterno}`} onClick={() => setDeleteId(item.id)}><Trash2 size={16} /></button>)}
              </div></td>}
            </tr>)}</tbody>
          </table></div>}
          <div className="pagination">
            <span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span>
            <div><button className="secondary" disabled={page <= 1 || busy} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
              <button className="secondary" disabled={page >= Math.ceil(total / pageSize) || busy} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
          </div>
        </div>}
        <footer>© 2026 GreenCode <span>Desenvolvido para uma cadeia de logística reversa mais sustentável.</span></footer>
      </section>
    </main>
  </div>;
}
