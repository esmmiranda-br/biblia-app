
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());


const databaseUrl = process.env.DATABASE_URL;
const usePostgres = Boolean(databaseUrl) ||
  process.env.NODE_ENV === 'production' ||
  process.env.RENDER === 'true';

let db;
if (usePostgres) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não configurada para o ambiente PostgreSQL.');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  db = {
    query: (sql, params) => pool.query(sql, params),
    end: () => pool.end()
  };
} else {
  const sqliteDb = new sqlite3.Database(path.join(__dirname, 'sermoes.db'));
  db = {
    query(sql, params = []) {
      const sqliteParams = [];
      const sqliteSql = sql
        .replace(/\bSERIAL\s+PRIMARY KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
        .replace(/\$(\d+)/g, (_, index) => {
          sqliteParams.push(params[Number(index) - 1]);
          return '?';
        });
      const returnsRows = /^\s*(SELECT|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);

      return new Promise((resolve, reject) => {
        if (returnsRows) {
          sqliteDb.all(sqliteSql, sqliteParams, (err, rows) => {
            if (err) {
              if (err.code === 'SQLITE_CONSTRAINT' &&
                  /UNIQUE constraint failed|PRIMARY KEY/i.test(err.message)) {
                err.code = '23505';
              }
              return reject(err);
            }
            resolve({ rows, rowCount: rows.length });
          });
          return;
        }

        sqliteDb.run(sqliteSql, sqliteParams, function (err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT' &&
                /UNIQUE constraint failed|PRIMARY KEY/i.test(err.message)) {
              err.code = '23505';
            }
            return reject(err);
          }
          resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
        });
      });
    },
    end: () => new Promise((resolve, reject) => {
      sqliteDb.close((err) => err ? reject(err) : resolve());
    })
  };
}

// Middleware para autenticação simples por header (usuario/perfil)
function authMiddleware(req, res, next) {
  // Espera-se que o frontend envie usuario e perfil nos headers
  const usuario = req.header('x-usuario');
  const perfil = req.header('x-perfil');
  if (!usuario || !perfil) {
    return res.status(401).json({ erro: 'Usuário não autenticado.' });
  }
  req.usuario = usuario;
  req.perfil = perfil;
  next();
}

// Alterar a própria senha
app.post('/api/usuarios/alterar-senha', authMiddleware, async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  const usuario = req.usuario;
  if (!senhaAtual || !novaSenha) {
    return res.status(400).json({ erro: 'Campos obrigatórios.' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    const user = rows[0];
    if (!user) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!bcrypt.compareSync(senhaAtual, user.senha)) {
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }
    const hash = bcrypt.hashSync(novaSenha, 10);
    await db.query('UPDATE usuarios SET senha = $1 WHERE usuario = $2', [hash, usuario]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Admin: resetar senha de outro usuário
app.post('/api/usuarios/resetar-senha', authMiddleware, async (req, res) => {
  const { usuarioAlvo, novaSenha } = req.body;
  const perfil = req.perfil;
  if (perfil !== 'admin') return res.status(403).json({ erro: 'Apenas admin pode resetar senha.' });
  if (!usuarioAlvo || !novaSenha) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  const hash = bcrypt.hashSync(novaSenha, 10);
  try {
    const result = await db.query('UPDATE usuarios SET senha = $1 WHERE usuario = $2', [hash, usuarioAlvo]);
    if (result.rowCount === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Rota para servir o conteúdo da Bíblia
app.get('/api/biblia', (req, res) => {
  const bibliaPath = path.join(__dirname, 'pt_nvi.json');
  console.log('[API] Lendo arquivo:', bibliaPath);
  fs.readFile(bibliaPath, 'utf8', (err, data) => {
    if (err) {
      console.error('[API] Erro ao ler o arquivo:', err);
      return res.status(500).json({ erro: 'Erro ao ler o arquivo da Bíblia.' });
    }
    console.log('[API] Conteúdo lido (primeiros 200 caracteres):', data.slice(0, 200));
    try {
      console.log('[API] Tentando fazer parse do JSON...');
      const biblia = JSON.parse(data);
      console.log('[API] Parse realizado com sucesso!');
      if (Array.isArray(biblia)) {
        console.log('[API] JSON é um array. Tamanho:', biblia.length);
      } else if (biblia && typeof biblia === 'object') {
        console.log('[API] JSON é um objeto. Chaves:', Object.keys(biblia));
      }
      res.json(biblia);
    } catch (e) {
      console.error('[API] Erro ao fazer parse do JSON:', e.message);
      console.error('[API] Stack:', e.stack);
      res.status(500).json({ erro: 'Erro ao processar o arquivo da Bíblia.', detalhe: e.message });
    }
  });
});

// Exemplo de rota para buscar um versículo
app.get('/api/versiculo', (req, res) => {
  // Exemplo de resposta estática
  res.json({
    livro: 'João',
    capitulo: 3,
    versiculo: 16,
    texto: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito...'
  });
});

// Exemplo de rota para listar livros
app.get('/api/livros', (req, res) => {
  res.json([
    'Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio',
    'Josué', 'Juízes', 'Rute', '1 Samuel', '2 Samuel',
    // ... outros livros
  ]);
});



async function initializeDatabase() {
  await db.query(`CREATE TABLE IF NOT EXISTS sermoes (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    datahora TEXT NOT NULL,
    local TEXT NOT NULL,
    usuario TEXT
  )`);
  if (usePostgres) {
    await db.query('ALTER TABLE sermoes ADD COLUMN IF NOT EXISTS usuario TEXT');
  } else {
    const { rows: columns } = await db.query('PRAGMA table_info(sermoes)');
    if (!columns.some(column => column.name === 'usuario')) {
      await db.query('ALTER TABLE sermoes ADD COLUMN usuario TEXT');
    }
  }
  await db.query("UPDATE sermoes SET usuario = 'admin' WHERE usuario IS NULL");

  await db.query(`CREATE TABLE IF NOT EXISTS estudos (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    tema TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    datahora TEXT NOT NULL,
    usuario TEXT
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    usuario TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK(perfil IN ('read','edit','admin'))
  )`);

  const hash = bcrypt.hashSync('123456', 10);
  await db.query(
    'INSERT INTO usuarios (usuario, senha, perfil) VALUES ($1, $2, $3) ON CONFLICT (usuario) DO NOTHING',
    ['admin', hash, 'admin']
  );
}

// --- CRUD de Usuários ---
// Listar usuários (sem senha)
app.get('/api/usuarios', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, usuario, perfil FROM usuarios');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Criar usuário
app.post('/api/usuarios', async (req, res) => {
  const { usuario, senha, perfil } = req.body;
  if (!usuario || !senha || !perfil) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (!['read','edit','admin'].includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido.' });
  const hash = bcrypt.hashSync(senha, 10);
  try {
    const insert = await db.query('INSERT INTO usuarios (usuario, senha, perfil) VALUES ($1, $2, $3) RETURNING id, usuario, perfil', [usuario, hash, perfil]);
    res.status(201).json(insert.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ erro: 'Usuário já existe.' });
    res.status(500).json({ erro: err.message });
  }
});

// Editar usuário (exceto senha)
app.put('/api/usuarios/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { usuario, perfil } = req.body;
  if (!usuario || !perfil) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (!['read','edit','admin'].includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido.' });
  try {
    const update = await db.query('UPDATE usuarios SET usuario = $1, perfil = $2 WHERE id = $3 RETURNING id, usuario, perfil', [usuario, perfil, id]);
    if (update.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(update.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ erro: 'Usuário já existe.' });
    res.status(500).json({ erro: err.message });
  }
});

// Excluir usuário
app.delete('/api/usuarios/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// --- CRUD de Estudos Bíblicos (SQLite) ---
// Listar estudos
app.get('/api/estudos', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, titulo, tema, conteudo, datahora AS "dataHora", usuario FROM estudos ORDER BY datahora DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Criar estudo
app.post('/api/estudos', authMiddleware, async (req, res) => {
  const { titulo, tema, conteudo } = req.body;
  const usuario = req.usuario;
  if (!titulo || !tema || !conteudo) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  const dataHora = new Date().toISOString();
  try {
    const insert = await db.query(
      'INSERT INTO estudos (titulo, tema, conteudo, datahora, usuario) VALUES ($1, $2, $3, $4, $5) RETURNING id, titulo, tema, conteudo, datahora AS "dataHora", usuario',
      [titulo, tema, conteudo, dataHora, usuario]
    );
    res.status(201).json(insert.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Editar estudo
app.put('/api/estudos/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const { titulo, tema, conteudo } = req.body;
  const usuario = req.usuario;
  const perfil = req.perfil;
  if (!titulo || !tema || !conteudo) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  try {
    const { rows } = await db.query(
      'SELECT id, titulo, tema, conteudo, datahora AS "dataHora", usuario FROM estudos WHERE id = $1',
      [id]
    );
    const estudo = rows[0];
    if (!estudo) return res.status(404).json({ erro: 'Estudo não encontrado.' });
    if (perfil !== 'admin' && estudo.usuario !== usuario) {
      return res.status(403).json({ erro: 'Sem permissão para editar.' });
    }
    const update = await db.query(
      'UPDATE estudos SET titulo = $1, tema = $2, conteudo = $3 WHERE id = $4 RETURNING id, titulo, tema, conteudo, datahora AS "dataHora", usuario',
      [titulo, tema, conteudo, id]
    );
    res.json(update.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Excluir estudo
app.delete('/api/estudos/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const usuario = req.usuario;
  const perfil = req.perfil;
  try {
    const { rows } = await db.query(
      'SELECT id, titulo, tema, conteudo, datahora AS "dataHora", usuario FROM estudos WHERE id = $1',
      [id]
    );
    const estudo = rows[0];
    if (!estudo) return res.status(404).json({ erro: 'Estudo não encontrado.' });
    if (perfil !== 'admin' && estudo.usuario !== usuario) {
      return res.status(403).json({ erro: 'Sem permissão para excluir.' });
    }
    await db.query('DELETE FROM estudos WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Listar todos os sermões (restrição de visualização)
app.get('/api/sermoes', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, nome, conteudo, datahora AS "dataHora", local, usuario FROM sermoes'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Criar novo sermão (qualquer perfil pode criar, mas só read não pode)
app.post('/api/sermoes', authMiddleware, async (req, res) => {
  const { nome, conteudo, dataHora, local } = req.body;
  const usuario = req.usuario;
  const perfil = req.perfil;
  if (!nome || !conteudo || !dataHora || !local) {
    return res.status(400).json({ erro: 'Campos obrigatórios não preenchidos.' });
  }
  if (perfil === 'read') {
    return res.status(403).json({ erro: 'Usuário sem permissão para criar sermão.' });
  }
  try {
    const insert = await db.query(
      'INSERT INTO sermoes (nome, conteudo, datahora, local, usuario) VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, conteudo, datahora AS "dataHora", local, usuario',
      [nome, conteudo, dataHora, local, usuario]
    );
    res.status(201).json(insert.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Editar sermão (restrição por perfil)
app.put('/api/sermoes/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, conteudo, dataHora, local } = req.body;
  const usuario = req.usuario;
  const perfil = req.perfil;
  try {
    const { rows } = await db.query(
      'SELECT id, nome, conteudo, datahora AS "dataHora", local, usuario FROM sermoes WHERE id = $1',
      [id]
    );
    const sermao = rows[0];
    if (!sermao) return res.status(404).json({ erro: 'Sermão não encontrado.' });
    if (perfil === 'read') {
      return res.status(403).json({ erro: 'Usuário sem permissão para editar sermão.' });
    }
    if (perfil === 'edit' && sermao.usuario !== usuario) {
      return res.status(403).json({ erro: 'Só pode editar seus próprios sermões.' });
    }
    const update = await db.query(
      'UPDATE sermoes SET nome = $1, conteudo = $2, datahora = $3, local = $4 WHERE id = $5 RETURNING id, nome, conteudo, datahora AS "dataHora", local, usuario',
      [nome, conteudo, dataHora, local, id]
    );
    if (update.rows.length === 0) return res.status(404).json({ erro: 'Sermão não encontrado.' });
    res.json(update.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Excluir sermão (restrição por perfil)
app.delete('/api/sermoes/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const usuario = req.usuario;
  const perfil = req.perfil;
  try {
    const { rows } = await db.query(
      'SELECT id, nome, conteudo, datahora AS "dataHora", local, usuario FROM sermoes WHERE id = $1',
      [id]
    );
    const sermao = rows[0];
    if (!sermao) return res.status(404).json({ erro: 'Sermão não encontrado.' });
    if (perfil === 'read') {
      return res.status(403).json({ erro: 'Usuário sem permissão para excluir sermão.' });
    }
    if (perfil === 'edit' && sermao.usuario !== usuario) {
      return res.status(403).json({ erro: 'Só pode excluir seus próprios sermões.' });
    }
    await db.query('DELETE FROM sermoes WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});


// Rota de login
app.post('/api/login', async (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Usuário e senha obrigatórios.' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    const user = rows[0];
    if (!user) return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    if (!bcrypt.compareSync(senha, user.senha)) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    }
    // Não retorna a senha
    const { id, usuario: nome, perfil } = user;
    res.json({ id, usuario: nome, perfil });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).send('ok');
  } catch (err) {
    console.error('Health check database query failed:', err);
    res.status(503).send('database unavailable');
  }
});

const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendBuildPath));
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ erro: 'Rota não encontrada.' });
  }
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor backend rodando na porta ${PORT}`);
    });
  })
  .catch(async (err) => {
    console.error('Falha ao inicializar o banco de dados:', err);
    await db.end();
    process.exitCode = 1;
  });
