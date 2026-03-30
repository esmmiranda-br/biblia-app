# Bíblia-App

Aplicativo para leitura da Bíblia, busca de versículos, navegação por livros e capítulos.

## Estrutura do Projeto

- **frontend/**: React + TypeScript
- **backend/**: Node.js + Express

## Scripts

### Frontend

```bash
cd frontend
npm start # inicia o frontend em modo desenvolvimento
npm run build # build de produção
```

### Backend

```bash
cd backend
npm run dev # inicia o backend com nodemon
npm start   # inicia o backend normalmente
```

## Exemplo de uso

- Acesse http://localhost:3000 para o frontend
- O frontend consome a API do backend em http://localhost:4000

## Rotas de exemplo (backend)
- `/api/versiculo` — retorna um versículo exemplo
- `/api/livros` — retorna lista de livros

---

Personalize conforme necessário para seu projeto!