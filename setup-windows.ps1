$ErrorActionPreference = 'Stop'

Write-Host '=== GreenCode - preparação do ambiente Windows ===' -ForegroundColor Green
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não encontrado. Instale Node.js 22+ e reabra o PowerShell.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm não encontrado. Reinstale Node.js 22+.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker não encontrado. Instale/inicie o Docker Desktop e reexecute este script.' }

$nodeVersion = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeVersion -lt 22) { throw "Node.js 22+ é necessário. Versão detectada: $(node --version)" }

Push-Location $PSScriptRoot
try {
  if (-not (Test-Path 'backend/.env')) {
    Copy-Item 'backend/.env.example' 'backend/.env'
    Write-Host 'Criado backend/.env a partir do modelo. Troque JWT_SECRET antes de uso real.' -ForegroundColor Yellow
  }
  docker compose up -d
  Push-Location 'backend'
  try {
    npm ci
    npx prisma generate
    npx prisma migrate deploy
    npm run db:seed
  } finally { Pop-Location }
  Push-Location 'frontend'
  try { npm ci } finally { Pop-Location }
  Write-Host ''
  Write-Host 'Preparação concluída.' -ForegroundColor Green
  Write-Host 'Terminal 1: cd backend; npm run dev'
  Write-Host 'Terminal 2: cd frontend; npm run dev'
  Write-Host 'Abra http://localhost:5173'
} finally { Pop-Location }
