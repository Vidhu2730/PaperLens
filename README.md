# PaperLens

Chrome extension for research paper insights. Built with WXT + React (extension) and FastAPI (backend).

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >=20.9 | https://nodejs.org |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker | any recent version | https://www.docker.com |
| Chrome | any | https://www.google.com/chrome |

## First-time setup

**Backend**:
```bash
cd server
cp .env.example .env
```

**Frontend** (Node dependencies):
```bash
cd extension
npm install
```

## Start dev environment

Run each in a separate terminal:

**Backend** (Postgres + FastAPI via Docker Compose):
```bash
cd server
docker compose up --build
```

**Frontend** (WXT extension watcher):
```bash
cd extension
npm run dev
```

The API will be available at `http://localhost:8000`.

To stop the backend stack:
```bash
cd server
docker compose down
```

## Load extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select `extension/.output/chrome-mv3/`
4. After WXT rebuilds, click the reload icon on the extension card

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/projects` | List projects for `X-User-Email` |
| POST | `/projects` | Create a project |
| GET | `/projects/{project_id}` | Get project criteria and saved article references |
| PUT | `/projects/{project_id}/criteria` | Replace ordered criteria |
| GET | `/search` | Search Scopus records |
| GET | `/article` | Get an article from Elasticsearch by SGRID |
