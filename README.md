# Bíblia-App

Aplicativo para leitura da Bíblia, busca de versículos, navegação por livros e capítulos, estudos, sermões e agenda de compromissos.

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

No computador local, o backend usa SQLite e persiste os dados em `backend/sermoes.db`. Não é necessário instalar nem configurar um servidor de banco de dados.

```powershell
cd backend
npm run dev
```

Para iniciar sem o Nodemon, use `npm start` dentro da pasta `backend`.

No Render, configure `DATABASE_URL` nas variáveis de ambiente do serviço backend para usar PostgreSQL. O backend escolhe PostgreSQL quando essa variável está definida ou quando roda no Render; localmente, sem ela, usa SQLite.

## Exemplo de uso

- Acesse http://localhost:3000 para o frontend
- O frontend consome a API do backend em http://localhost:4000
- Use **Devocionais** no menu para criar, consultar, editar, imprimir e excluir devocionais com tema, conteúdo, referências bíblicas e opção de compartilhamento.
- Use **Agenda de Compromissos** no menu para cadastrar e consultar compromissos da igreja. A agenda exibe um calendário mensal com indicadores nos dias ocupados; selecione um dia para ver seus eventos. Ao criar um compromisso, é possível repeti-lo semanalmente por até 52 semanas. Eventos recorrentes podem ser alterados ou excluídos individualmente ou em toda a série. Todos os usuários autenticados podem consultar a agenda; cada usuário pode alterar ou excluir os próprios compromissos, e o administrador pode gerenciar todos.

## Publicar no Render

O serviço web pode servir o frontend React e a API Express no mesmo domínio. Configure-o para usar o repositório `esmmiranda-br/biblia-app`, branch `main`, sem Root Directory, com:

- Build Command: `npm ci --prefix frontend && npm ci --prefix backend && npm run build --prefix frontend`
- Start Command: `npm start --prefix backend`
- Environment: `NODE_ENV=production` e `DATABASE_URL` apontando para o banco `biblia_app` no Neon.

Use um banco separado para este aplicativo. O banco `neondb` pode conter dados de outra aplicação e não deve ser reutilizado com o esquema do Bíblia-app.

As chamadas do frontend usam caminhos `/api/...`, então o proxy de desenvolvimento as direciona para a API local e, em produção, elas permanecem no mesmo domínio. O backend serve os arquivos gerados em `frontend/build`.

Para migrar os registros locais para um banco Neon vazio, primeiro confira o plano sem gravar:

```powershell
cd backend
npm run db:import-sqlite
```

Depois de configurar `DATABASE_URL` para o banco Neon separado:

```powershell
npm run db:import-sqlite -- --apply
```

O importador preserva IDs e hashes de senha e cancela a operação se as tabelas de destino já tiverem registros.

## Rotas de exemplo (backend)
- `/api/versiculo` — retorna um versículo exemplo
- `/api/livros` — retorna lista de livros

---

Personalize conforme necessário para seu projeto!