#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  if [[ "${ID:-}" == "ubuntu" ]]; then
    if ! dpkg --compare-versions "${VERSION_ID:-0}" ge "24.04"; then
      echo "Ubuntu 24.04 ou superior é necessário (detectado ${VERSION_ID:-desconhecido})." >&2
      exit 1
    fi
  elif [[ " ${ID_LIKE:-} " != *" ubuntu "* ]]; then
    echo 'Este instalador requer Ubuntu 24.04 ou uma distribuição derivada do Ubuntu.' >&2
    exit 1
  fi
fi

command -v node >/dev/null || { echo 'Instale Node.js 22 ou superior.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm não encontrado; instale Node.js com npm.' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Instale Docker Engine e o plugin Docker Compose.' >&2; exit 1; }
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 22 )) || { echo "Node.js 22+ necessário (detectado $(node --version))." >&2; exit 1; }
docker compose version >/dev/null

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  echo 'Criado backend/.env. Defina JWT_SECRET com um segredo aleatório de pelo menos 32 caracteres antes de uso real.'
fi

docker compose up -d
(
  cd backend
  npm ci
  npx prisma generate
  npx prisma migrate deploy
  npm run db:seed
)
(
  cd frontend
  npm ci
)

echo
echo 'Preparação concluída.'
echo 'Terminal 1: cd backend && npm run dev'
echo 'Terminal 2: cd frontend && npm run dev'
echo 'Abra http://localhost:5173'
