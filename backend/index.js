
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));


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
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback({
          query: (sql, params) => client.query(sql, params)
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end()
  };
} else {
  const sqlite3 = require('sqlite3').verbose();
  const sqliteDb = new sqlite3.Database(path.join(__dirname, 'sermoes.db'));
  let sqliteQueue = Promise.resolve();

  const executeSqliteQuery = (sql, params = []) => {
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
          resolve({
            rows: rows.map(row => row.compartilhado === undefined
              ? row
              : { ...row, compartilhado: Boolean(row.compartilhado) }),
            rowCount: rows.length
          });
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
  };

  const runSqliteExclusive = task => {
    const operation = sqliteQueue.then(task);
    sqliteQueue = operation.catch(() => {});
    return operation;
  };

  db = {
    query(sql, params = []) {
      return runSqliteExclusive(() => executeSqliteQuery(sql, params));
    },
    transaction(callback) {
      return runSqliteExclusive(async () => {
        await executeSqliteQuery('BEGIN IMMEDIATE');
        try {
          const result = await callback({ query: executeSqliteQuery });
          await executeSqliteQuery('COMMIT');
          return result;
        } catch (err) {
          await executeSqliteQuery('ROLLBACK');
          throw err;
        }
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

async function agendaAuthMiddleware(req, res, next) {
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer ([a-f0-9]{64})$/i);
  if (!match) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });

  try {
    const tokenHash = crypto.createHash('sha256').update(match[1]).digest('hex');
    const { rows } = await db.query(
      `SELECT u.usuario, u.perfil
       FROM user_sessions s
       JOIN usuarios u ON u.usuario = s.usuario
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash, new Date().toISOString()]
    );
    if (!rows[0]) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    req.usuario = rows[0].usuario;
    req.perfil = rows[0].perfil;
    next();
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
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
    usuario TEXT,
    compartilhado BOOLEAN NOT NULL DEFAULT FALSE,
    criadoem TEXT
  )`);
  if (usePostgres) {
    await db.query('ALTER TABLE sermoes ADD COLUMN IF NOT EXISTS usuario TEXT');
    await db.query('ALTER TABLE sermoes ADD COLUMN IF NOT EXISTS compartilhado BOOLEAN NOT NULL DEFAULT FALSE');
    await db.query('ALTER TABLE sermoes ADD COLUMN IF NOT EXISTS criadoem TEXT');
  } else {
    const { rows: columns } = await db.query('PRAGMA table_info(sermoes)');
    if (!columns.some(column => column.name === 'usuario')) {
      await db.query('ALTER TABLE sermoes ADD COLUMN usuario TEXT');
    }
    if (!columns.some(column => column.name === 'compartilhado')) {
      await db.query('ALTER TABLE sermoes ADD COLUMN compartilhado BOOLEAN NOT NULL DEFAULT 0');
    }
    if (!columns.some(column => column.name === 'criadoem')) {
      await db.query('ALTER TABLE sermoes ADD COLUMN criadoem TEXT');
    }
  }
  await db.query("UPDATE sermoes SET usuario = 'admin' WHERE usuario IS NULL");
  await db.query('UPDATE sermoes SET criadoem = datahora WHERE criadoem IS NULL');

  await db.query(`CREATE TABLE IF NOT EXISTS estudos (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    tema TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    datahora TEXT NOT NULL,
    usuario TEXT,
    compartilhado BOOLEAN NOT NULL DEFAULT FALSE
  )`);
  if (usePostgres) {
    await db.query('ALTER TABLE estudos ADD COLUMN IF NOT EXISTS compartilhado BOOLEAN NOT NULL DEFAULT FALSE');
  } else {
    const { rows: columns } = await db.query('PRAGMA table_info(estudos)');
    if (!columns.some(column => column.name === 'compartilhado')) {
      await db.query('ALTER TABLE estudos ADD COLUMN compartilhado BOOLEAN NOT NULL DEFAULT 0');
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS devocionais (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    tema TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    datahora TEXT NOT NULL,
    usuario TEXT,
    compartilhado BOOLEAN NOT NULL DEFAULT FALSE
  )`);
  if (usePostgres) {
    await db.query('ALTER TABLE devocionais ADD COLUMN IF NOT EXISTS compartilhado BOOLEAN NOT NULL DEFAULT FALSE');
  } else {
    const { rows: columns } = await db.query('PRAGMA table_info(devocionais)');
    if (!columns.some(column => column.name === 'compartilhado')) {
      await db.query('ALTER TABLE devocionais ADD COLUMN compartilhado BOOLEAN NOT NULL DEFAULT 0');
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    usuario TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK(perfil IN ('read','edit','admin'))
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    usuario TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS compromissos (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    datahora TEXT NOT NULL,
    local TEXT NOT NULL DEFAULT '',
    descricao TEXT NOT NULL DEFAULT '',
    usuario TEXT NOT NULL,
    recorrencia_id TEXT
  )`);
  if (usePostgres) {
    await db.query('ALTER TABLE compromissos ADD COLUMN IF NOT EXISTS recorrencia_id TEXT');
  } else {
    const { rows: columns } = await db.query('PRAGMA table_info(compromissos)');
    if (!columns.some(column => column.name === 'recorrencia_id')) {
      await db.query('ALTER TABLE compromissos ADD COLUMN recorrencia_id TEXT');
    }
  }

  const hash = bcrypt.hashSync('123456', 10);
  await db.query(
    'INSERT INTO usuarios (usuario, senha, perfil) VALUES ($1, $2, $3) ON CONFLICT (usuario) DO NOTHING',
    ['admin', hash, 'admin']
  );
}

const backupTables = {
  sermoes: {
    columns: ['id', 'nome', 'conteudo', 'datahora', 'local', 'usuario', 'compartilhado'],
    requiredText: ['nome', 'conteudo', 'datahora', 'local'],
    nullableText: ['usuario'],
    booleanColumns: ['compartilhado']
  },
  estudos: {
    columns: ['id', 'titulo', 'tema', 'conteudo', 'datahora', 'usuario', 'compartilhado'],
    requiredText: ['titulo', 'tema', 'conteudo', 'datahora'],
    nullableText: ['usuario'],
    booleanColumns: ['compartilhado']
  },
  devocionais: {
    columns: ['id', 'titulo', 'tema', 'conteudo', 'datahora', 'usuario', 'compartilhado'],
    requiredText: ['titulo', 'tema', 'conteudo', 'datahora'],
    nullableText: ['usuario'],
    booleanColumns: ['compartilhado']
  },
  usuarios: {
    columns: ['id', 'usuario', 'senha', 'perfil'],
    requiredText: ['usuario', 'senha', 'perfil'],
    nullableText: [],
    booleanColumns: []
  },
  compromissos: {
    columns: ['id', 'titulo', 'datahora', 'local', 'descricao', 'usuario', 'recorrencia_id'],
    requiredText: ['titulo', 'datahora', 'local', 'descricao', 'usuario'],
    nullableText: ['recorrencia_id'],
    booleanColumns: []
  }
};

function validateBackup(backup) {
  if (!backup || typeof backup !== 'object' ||
      backup.formato !== 'biblia-app-backup' ||
      backup.versao !== 1 ||
      !backup.dados || typeof backup.dados !== 'object' ||
      Array.isArray(backup.dados)) {
    throw new Error('Arquivo de backup inválido ou versão não suportada.');
  }

  if (backup.dados.devocionais === undefined) {
    backup.dados.devocionais = [];
  }

  for (const [tableName, definition] of Object.entries(backupTables)) {
    const rows = backup.dados[tableName];
    if (!Array.isArray(rows)) {
      throw new Error(`A lista de dados "${tableName}" está ausente ou inválida.`);
    }

    const ids = new Set();
    const usernames = new Set();
    rows.forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row) ||
          definition.columns.some(column => !Object.prototype.hasOwnProperty.call(row, column)) ||
          Object.keys(row).some(column => !definition.columns.includes(column))) {
        throw new Error(`Registro ${index + 1} da tabela "${tableName}" tem formato inválido.`);
      }
      if (!Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id)) {
        throw new Error(`Registro ${index + 1} da tabela "${tableName}" tem identificador inválido ou duplicado.`);
      }
      ids.add(row.id);

      for (const column of definition.requiredText) {
        if (typeof row[column] !== 'string') {
          throw new Error(`Campo "${column}" inválido no registro ${index + 1} da tabela "${tableName}".`);
        }
      }
      for (const column of definition.nullableText) {
        if (row[column] !== null && typeof row[column] !== 'string') {
          throw new Error(`Campo "${column}" inválido no registro ${index + 1} da tabela "${tableName}".`);
        }
      }
      for (const column of definition.booleanColumns) {
        if (typeof row[column] !== 'boolean') {
          throw new Error(`Campo "${column}" inválido no registro ${index + 1} da tabela "${tableName}".`);
        }
      }
      if (tableName === 'usuarios') {
        if (!['read', 'edit', 'admin'].includes(row.perfil) || usernames.has(row.usuario)) {
          throw new Error(`Usuário inválido ou duplicado no registro ${index + 1} do backup.`);
        }
        usernames.add(row.usuario);
      }
    });
  }

  if (!backup.dados.usuarios.some(user => user.perfil === 'admin')) {
    throw new Error('O backup precisa conter pelo menos um usuário administrador.');
  }

  return backup.dados;
}

app.get('/api/admin/backup', agendaAuthMiddleware, async (req, res) => {
  if (req.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Apenas admin pode realizar backups.' });
  }

  try {
    const dados = await db.transaction(async transaction => {
      const snapshot = {};
      for (const [tableName, definition] of Object.entries(backupTables)) {
        const columns = definition.columns.join(', ');
        const { rows } = await transaction.query(`SELECT ${columns} FROM ${tableName} ORDER BY id`);
        snapshot[tableName] = rows;
      }
      return snapshot;
    });

    const backup = {
      formato: 'biblia-app-backup',
      versao: 1,
      criadoEm: new Date().toISOString(),
      observacao: 'As sessões não são incluídas; todos os usuários precisarão entrar novamente após a restauração.',
      dados
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="biblia-app-backup-${timestamp}.json"`);
    res.type('application/json').send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('Falha ao criar backup:', err);
    res.status(500).json({ erro: 'Não foi possível criar o backup.' });
  }
});

app.post('/api/admin/restore', agendaAuthMiddleware, async (req, res) => {
  if (req.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Apenas admin pode restaurar backups.' });
  }

  let dados;
  try {
    dados = validateBackup(req.body);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }

  const deleteOrder = ['user_sessions', 'compromissos', 'devocionais', 'estudos', 'sermoes', 'usuarios'];
  try {
    await db.transaction(async transaction => {
      for (const tableName of deleteOrder) {
        await transaction.query(`DELETE FROM ${tableName}`);
      }

      for (const [tableName, definition] of Object.entries(backupTables)) {
        const placeholders = definition.columns.map((_, index) => `$${index + 1}`).join(', ');
        const columns = definition.columns.join(', ');
        for (const row of dados[tableName]) {
          await transaction.query(
            `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
            definition.columns.map(column => row[column])
          );
        }
      }

      if (usePostgres) {
        for (const tableName of Object.keys(backupTables)) {
          await transaction.query(
            `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${tableName}`
          );
        }
      } else {
        for (const tableName of Object.keys(backupTables)) {
          await transaction.query('DELETE FROM sqlite_sequence WHERE name = $1', [tableName]);
        }
      }
    });

    res.json({ ok: true, mensagem: 'Backup restaurado. Entre novamente para iniciar uma nova sessão.' });
  } catch (err) {
    console.error('Falha ao restaurar backup:', err);
    res.status(500).json({ erro: 'Não foi possível restaurar o backup. Os dados atuais foram preservados.' });
  }
});

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
      `SELECT id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado
       FROM estudos
       WHERE $1 = 'admin' OR usuario = $2 OR compartilhado = TRUE
       ORDER BY datahora DESC`,
      [req.perfil, req.usuario]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Criar estudo
app.post('/api/estudos', authMiddleware, async (req, res) => {
  const { titulo, tema, conteudo } = req.body;
  const compartilhado = req.body.compartilhado === true;
  const usuario = req.usuario;
  if (!titulo || !tema || !conteudo) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (req.body.compartilhado !== undefined && typeof req.body.compartilhado !== 'boolean') {
    return res.status(400).json({ erro: 'Opção de compartilhamento inválida.' });
  }
  const dataHora = new Date().toISOString();
  try {
    const insert = await db.query(
      'INSERT INTO estudos (titulo, tema, conteudo, datahora, usuario, compartilhado) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado',
      [titulo, tema, conteudo, dataHora, usuario, compartilhado]
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
  let compartilhado = req.body.compartilhado;
  const usuario = req.usuario;
  const perfil = req.perfil;
  if (!titulo || !tema || !conteudo) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (compartilhado !== undefined && typeof compartilhado !== 'boolean') {
    return res.status(400).json({ erro: 'Opção de compartilhamento inválida.' });
  }
  try {
    const { rows } = await db.query(
      `SELECT id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado
       FROM estudos
       WHERE id = $1 AND ($2 = 'admin' OR usuario = $3 OR compartilhado = TRUE)`,
      [id, perfil, usuario]
    );
    const estudo = rows[0];
    if (!estudo) return res.status(404).json({ erro: 'Estudo não encontrado.' });
    if (perfil !== 'admin' && estudo.usuario !== usuario) {
      return res.status(403).json({ erro: 'Sem permissão para editar.' });
    }
    compartilhado = compartilhado === undefined ? estudo.compartilhado : compartilhado;
    const update = await db.query(
      'UPDATE estudos SET titulo = $1, tema = $2, conteudo = $3, compartilhado = $4 WHERE id = $5 RETURNING id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado',
      [titulo, tema, conteudo, compartilhado, id]
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
      `SELECT id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado
       FROM estudos
       WHERE id = $1 AND ($2 = 'admin' OR usuario = $3 OR compartilhado = TRUE)`,
      [id, perfil, usuario]
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

// --- CRUD de Devocionais ---
app.get('/api/devocionais', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado
       FROM devocionais
       WHERE $1 = 'admin' OR usuario = $2 OR compartilhado = TRUE
       ORDER BY datahora DESC`,
      [req.perfil, req.usuario]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post('/api/devocionais', authMiddleware, async (req, res) => {
  const { titulo, tema, conteudo } = req.body;
  const compartilhado = req.body.compartilhado === true;
  if (!titulo || !tema || !conteudo) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (req.perfil === 'read') return res.status(403).json({ erro: 'Usuário sem permissão para criar devocional.' });
  if (req.body.compartilhado !== undefined && typeof req.body.compartilhado !== 'boolean') {
    return res.status(400).json({ erro: 'Opção de compartilhamento inválida.' });
  }
  const dataHora = new Date().toISOString();
  try {
    const insert = await db.query(
      'INSERT INTO devocionais (titulo, tema, conteudo, datahora, usuario, compartilhado) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado',
      [titulo, tema, conteudo, dataHora, req.usuario, compartilhado]
    );
    res.status(201).json(insert.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put('/api/devocionais/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const { titulo, tema, conteudo } = req.body;
  let compartilhado = req.body.compartilhado;
  if (!titulo || !tema || !conteudo) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (compartilhado !== undefined && typeof compartilhado !== 'boolean') {
    return res.status(400).json({ erro: 'Opção de compartilhamento inválida.' });
  }
  try {
    const { rows } = await db.query(
      `SELECT id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado
       FROM devocionais
       WHERE id = $1 AND ($2 = 'admin' OR usuario = $3 OR compartilhado = TRUE)`,
      [id, req.perfil, req.usuario]
    );
    const devocional = rows[0];
    if (!devocional) return res.status(404).json({ erro: 'Devocional não encontrado.' });
    if (req.perfil === 'read') return res.status(403).json({ erro: 'Usuário sem permissão para editar devocional.' });
    if (req.perfil !== 'admin' && devocional.usuario !== req.usuario) {
      return res.status(403).json({ erro: 'Só pode editar seus próprios devocionais.' });
    }
    compartilhado = compartilhado === undefined ? devocional.compartilhado : compartilhado;
    const update = await db.query(
      'UPDATE devocionais SET titulo = $1, tema = $2, conteudo = $3, compartilhado = $4 WHERE id = $5 RETURNING id, titulo, tema, conteudo, datahora AS "dataHora", usuario, compartilhado',
      [titulo, tema, conteudo, compartilhado, id]
    );
    res.json(update.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete('/api/devocionais/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await db.query(
      `SELECT id, usuario FROM devocionais
       WHERE id = $1 AND ($2 = 'admin' OR usuario = $3 OR compartilhado = TRUE)`,
      [id, req.perfil, req.usuario]
    );
    const devocional = rows[0];
    if (!devocional) return res.status(404).json({ erro: 'Devocional não encontrado.' });
    if (req.perfil === 'read') return res.status(403).json({ erro: 'Usuário sem permissão para excluir devocional.' });
    if (req.perfil !== 'admin' && devocional.usuario !== req.usuario) {
      return res.status(403).json({ erro: 'Só pode excluir seus próprios devocionais.' });
    }
    await db.query('DELETE FROM devocionais WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Listar todos os sermões (restrição de visualização)
app.get('/api/sermoes', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nome, conteudo, datahora AS "dataHora", local, usuario, compartilhado, criadoem AS "criadoEm"
       FROM sermoes
       WHERE $1 = 'admin' OR usuario = $2 OR compartilhado = TRUE`,
      [req.perfil, req.usuario]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Criar novo sermão (qualquer perfil pode criar, mas só read não pode)
app.post('/api/sermoes', authMiddleware, async (req, res) => {
  const { nome, conteudo, dataHora, local } = req.body;
  const compartilhado = req.body.compartilhado === true;
  const usuario = req.usuario;
  const perfil = req.perfil;
  if (!nome || !conteudo || !dataHora || !local) {
    return res.status(400).json({ erro: 'Campos obrigatórios não preenchidos.' });
  }
  if (perfil === 'read') {
    return res.status(403).json({ erro: 'Usuário sem permissão para criar sermão.' });
  }
  if (req.body.compartilhado !== undefined && typeof req.body.compartilhado !== 'boolean') {
    return res.status(400).json({ erro: 'Opção de compartilhamento inválida.' });
  }
  try {
    const insert = await db.query(
      'INSERT INTO sermoes (nome, conteudo, datahora, local, usuario, compartilhado, criadoem) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, nome, conteudo, datahora AS "dataHora", local, usuario, compartilhado, criadoem AS "criadoEm"',
      [nome, conteudo, dataHora, local, usuario, compartilhado, new Date().toISOString()]
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
  let compartilhado = req.body.compartilhado;
  const usuario = req.usuario;
  const perfil = req.perfil;
  try {
    const { rows } = await db.query(
      `SELECT id, nome, conteudo, datahora AS "dataHora", local, usuario, compartilhado, criadoem AS "criadoEm"
       FROM sermoes
       WHERE id = $1 AND ($2 = 'admin' OR usuario = $3 OR compartilhado = TRUE)`,
      [id, perfil, usuario]
    );
    const sermao = rows[0];
    if (!sermao) return res.status(404).json({ erro: 'Sermão não encontrado.' });
    if (perfil === 'read') {
      return res.status(403).json({ erro: 'Usuário sem permissão para editar sermão.' });
    }
    if (perfil === 'edit' && sermao.usuario !== usuario) {
      return res.status(403).json({ erro: 'Só pode editar seus próprios sermões.' });
    }
    if (compartilhado !== undefined && typeof compartilhado !== 'boolean') {
      return res.status(400).json({ erro: 'Opção de compartilhamento inválida.' });
    }
    compartilhado = compartilhado === undefined ? sermao.compartilhado : compartilhado;
    const update = await db.query(
      'UPDATE sermoes SET nome = $1, conteudo = $2, datahora = $3, local = $4, compartilhado = $5 WHERE id = $6 RETURNING id, nome, conteudo, datahora AS "dataHora", local, usuario, compartilhado, criadoem AS "criadoEm"',
      [nome, conteudo, dataHora, local, compartilhado, id]
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
      `SELECT id, nome, conteudo, datahora AS "dataHora", local, usuario, compartilhado, criadoem AS "criadoEm"
       FROM sermoes
       WHERE id = $1 AND ($2 = 'admin' OR usuario = $3 OR compartilhado = TRUE)`,
      [id, perfil, usuario]
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

// --- Agenda de Compromissos ---
app.get('/api/compromissos', agendaAuthMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, titulo, datahora AS "dataHora", local, descricao, usuario,
              recorrencia_id AS "recorrenciaId"
       FROM compromissos
       ORDER BY datahora ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post('/api/compromissos', agendaAuthMiddleware, async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ erro: 'Dados do compromisso inválidos.' });
  }
  const {
    titulo,
    dataHora,
    local = '',
    descricao = '',
    recorrente = false,
    semanas = 1,
    datasOcorrencias
  } = req.body;
  if (typeof titulo !== 'string' || !titulo.trim() ||
      typeof dataHora !== 'string' || !dataHora.trim() ||
      typeof local !== 'string' || typeof descricao !== 'string' ||
      Number.isNaN(Date.parse(dataHora)) ||
      typeof recorrente !== 'boolean' ||
      !Number.isInteger(semanas) || semanas < 1 || semanas > 52 ||
      (recorrente && semanas < 2) ||
      (recorrente && datasOcorrencias !== undefined &&
        (!Array.isArray(datasOcorrencias) ||
          datasOcorrencias.length !== semanas ||
          Date.parse(datasOcorrencias[0]) !== Date.parse(dataHora) ||
          datasOcorrencias.some(data => typeof data !== 'string' || Number.isNaN(Date.parse(data)))))) {
    return res.status(400).json({ erro: 'Informe um título e uma data e hora válidos.' });
  }

  try {
    const recorrenciaId = recorrente ? crypto.randomUUID() : null;
    const ocorrencias = recorrente ? semanas : 1;
    const inicio = new Date(dataHora);
    const values = [];
    const placeholders = [];
    for (let semana = 0; semana < ocorrencias; semana += 1) {
      const offset = values.length;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
      values.push(
        titulo.trim(),
        recorrente && Array.isArray(datasOcorrencias)
          ? new Date(datasOcorrencias[semana]).toISOString()
          : new Date(inicio.getTime() + semana * 7 * 24 * 60 * 60 * 1000).toISOString(),
        local.trim(),
        descricao.trim(),
        req.usuario,
        recorrenciaId
      );
    }
    const { rows } = await db.query(
      `INSERT INTO compromissos (titulo, datahora, local, descricao, usuario, recorrencia_id)
       VALUES ${placeholders.join(', ')}
       RETURNING id, titulo, datahora AS "dataHora", local, descricao, usuario,
                 recorrencia_id AS "recorrenciaId"`,
      values
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put('/api/compromissos/:id', agendaAuthMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ erro: 'Compromisso inválido.' });
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ erro: 'Dados do compromisso inválidos.' });
  }

  const { titulo, dataHora, local = '', descricao = '' } = req.body;
  const escopo = req.query.escopo || 'individual';
  if (!['individual', 'serie'].includes(escopo)) {
    return res.status(400).json({ erro: 'Escopo de alteração inválido.' });
  }
  if (typeof titulo !== 'string' || !titulo.trim() ||
      typeof dataHora !== 'string' || !dataHora.trim() ||
      typeof local !== 'string' || typeof descricao !== 'string' ||
      Number.isNaN(Date.parse(dataHora))) {
    return res.status(400).json({ erro: 'Informe um título e uma data e hora válidos.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT usuario, datahora AS "dataHora", recorrencia_id AS "recorrenciaId"
       FROM compromissos WHERE id = $1`,
      [id]
    );
    const compromisso = rows[0];
    if (!compromisso) return res.status(404).json({ erro: 'Compromisso não encontrado.' });
    if (req.perfil !== 'admin' && compromisso.usuario !== req.usuario) {
      return res.status(403).json({ erro: 'Só o criador ou o admin pode alterar este compromisso.' });
    }

    if (escopo === 'serie' && compromisso.recorrenciaId) {
      const { rows: ocorrencias } = await db.query(
        `SELECT id, datahora AS "dataHora" FROM compromissos WHERE recorrencia_id = $1`,
        [compromisso.recorrenciaId]
      );
      const diferenca = new Date(dataHora).getTime() - new Date(compromisso.dataHora).getTime();
      const valores = [titulo.trim(), local.trim(), descricao.trim()];
      const datasCase = ocorrencias.map(ocorrencia => {
        const idIndex = valores.push(ocorrencia.id);
        const dataIndex = valores.push(
          new Date(new Date(ocorrencia.dataHora).getTime() + diferenca).toISOString()
        );
        return `WHEN $${idIndex} THEN $${dataIndex}`;
      }).join(' ');
      valores.push(compromisso.recorrenciaId);
      const { rows: atualizadas } = await db.query(
        `UPDATE compromissos
         SET titulo = $1, local = $2, descricao = $3,
             datahora = CASE id ${datasCase} ELSE datahora END
         WHERE recorrencia_id = $${valores.length}
         RETURNING id, titulo, datahora AS "dataHora", local, descricao, usuario,
                   recorrencia_id AS "recorrenciaId"`,
        valores
      );
      return res.json(atualizadas);
    }

    const update = await db.query(
      `UPDATE compromissos
       SET titulo = $1, datahora = $2, local = $3, descricao = $4
       WHERE id = $5
       RETURNING id, titulo, datahora AS "dataHora", local, descricao, usuario,
                 recorrencia_id AS "recorrenciaId"`,
      [titulo.trim(), new Date(dataHora).toISOString(), local.trim(), descricao.trim(), id]
    );
    res.json(update.rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete('/api/compromissos/:id', agendaAuthMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const escopo = req.query.escopo || 'individual';
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ erro: 'Compromisso inválido.' });
  }
  if (!['individual', 'serie'].includes(escopo)) {
    return res.status(400).json({ erro: 'Escopo de exclusão inválido.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT usuario, recorrencia_id AS "recorrenciaId" FROM compromissos WHERE id = $1',
      [id]
    );
    const compromisso = rows[0];
    if (!compromisso) return res.status(404).json({ erro: 'Compromisso não encontrado.' });
    if (req.perfil !== 'admin' && compromisso.usuario !== req.usuario) {
      return res.status(403).json({ erro: 'Só o criador ou o admin pode excluir este compromisso.' });
    }
    if (escopo === 'serie' && compromisso.recorrenciaId) {
      await db.query('DELETE FROM compromissos WHERE recorrencia_id = $1', [compromisso.recorrenciaId]);
    } else {
      await db.query('DELETE FROM compromissos WHERE id = $1', [id]);
    }
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
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.query(
      'INSERT INTO user_sessions (token_hash, usuario, expires_at) VALUES ($1, $2, $3)',
      [tokenHash, user.usuario, expiresAt]
    );
    const { id, usuario: nome, perfil } = user;
    res.json({ id, usuario: nome, perfil, token });
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
