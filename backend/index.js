
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('sermoes.db');

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
app.post('/api/usuarios/alterar-senha', authMiddleware, (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  const usuario = req.usuario;
  console.log('Requisição de alteração de senha para:', usuario);
  if (!senhaAtual || !novaSenha) {
    console.log('Campos obrigatórios não preenchidos');
    return res.status(400).json({ erro: 'Campos obrigatórios.' });
  }
  db.get('SELECT * FROM usuarios WHERE usuario = ?', [usuario], (err, user) => {
    if (err) {
      console.log('Erro ao buscar usuário:', err.message);
      return res.status(500).json({ erro: err.message });
    }
    if (!user) {
      console.log('Usuário não encontrado:', usuario);
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    if (!bcrypt.compareSync(senhaAtual, user.senha)) {
      console.log('Senha atual incorreta para usuário:', usuario);
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }
    const hash = bcrypt.hashSync(novaSenha, 10);
    db.run('UPDATE usuarios SET senha = ? WHERE usuario = ?', [hash, usuario], function(err) {
      if (err) {
        console.log('Erro ao atualizar senha:', err.message);
        return res.status(500).json({ erro: err.message });
      }
      console.log('Senha alterada com sucesso para:', usuario);
      res.json({ ok: true });
    });
  });
});

// Admin: resetar senha de outro usuário
app.post('/api/usuarios/resetar-senha', authMiddleware, (req, res) => {
  const { usuarioAlvo, novaSenha } = req.body;
  const perfil = req.perfil;
  if (perfil !== 'admin') return res.status(403).json({ erro: 'Apenas admin pode resetar senha.' });
  if (!usuarioAlvo || !novaSenha) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  const hash = bcrypt.hashSync(novaSenha, 10);
  db.run('UPDATE usuarios SET senha = ? WHERE usuario = ?', [hash, usuarioAlvo], function(err) {
    if (err) return res.status(500).json({ erro: err.message });
    if (this.changes === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({ ok: true });
  });
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



// --- CRUD de Sermões (SQLite) ---

// Cria tabelas se não existirem
db.serialize(() => {
  // Adiciona campo usuario na tabela de sermoes, se não existir
  db.run(`CREATE TABLE IF NOT EXISTS sermoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    dataHora TEXT NOT NULL,
    local TEXT NOT NULL,
    usuario TEXT
  )`);
  // Cria tabela de estudos se não existir
  db.run(`CREATE TABLE IF NOT EXISTS estudos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    tema TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    dataHora TEXT NOT NULL,
    usuario TEXT
  )`);
  // Adiciona a coluna usuario se não existir (para bases já criadas)
  db.get("PRAGMA table_info(sermoes)", (err, info) => {
    db.all("PRAGMA table_info(sermoes)", (err, columns) => {
      if (!columns.some(col => col.name === 'usuario')) {
        db.run('ALTER TABLE sermoes ADD COLUMN usuario TEXT', () => {
          // Após adicionar, atualizar todos para admin
          db.run("UPDATE sermoes SET usuario = 'admin' WHERE usuario IS NULL");
        });
      } else {
        // Se já existe, garantir que registros antigos tenham admin
        db.run("UPDATE sermoes SET usuario = 'admin' WHERE usuario IS NULL");
      }
    });
  });
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK(perfil IN ('read','edit','admin'))
  )`);
  // Cria usuário admin padrão se não existir
  db.get('SELECT * FROM usuarios WHERE usuario = ?', ['admin'], (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync('123456', 10);
      db.run('INSERT INTO usuarios (usuario, senha, perfil) VALUES (?, ?, ?)', ['admin', hash, 'admin']);
    }
  });
});

// --- CRUD de Usuários ---
// Listar usuários (sem senha)
app.get('/api/usuarios', (req, res) => {
  db.all('SELECT id, usuario, perfil FROM usuarios', (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// Criar usuário
app.post('/api/usuarios', (req, res) => {
  const { usuario, senha, perfil } = req.body;
  if (!usuario || !senha || !perfil) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (!['read','edit','admin'].includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido.' });
  const hash = bcrypt.hashSync(senha, 10);
  db.run('INSERT INTO usuarios (usuario, senha, perfil) VALUES (?, ?, ?)', [usuario, hash, perfil], function(err) {
    if (err) return res.status(400).json({ erro: 'Usuário já existe.' });
    db.get('SELECT id, usuario, perfil FROM usuarios WHERE id = ?', [this.lastID], (err, row) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.status(201).json(row);
    });
  });
});

// Editar usuário (exceto senha)
app.put('/api/usuarios/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { usuario, perfil } = req.body;
  if (!usuario || !perfil) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  if (!['read','edit','admin'].includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido.' });
  db.run('UPDATE usuarios SET usuario = ?, perfil = ? WHERE id = ?', [usuario, perfil, id], function(err) {
    if (err) return res.status(400).json({ erro: 'Usuário já existe.' });
    db.get('SELECT id, usuario, perfil FROM usuarios WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ erro: err.message });
      if (!row) return res.status(404).json({ erro: 'Usuário não encontrado.' });
      res.json(row);
    });
  });
});

// Excluir usuário
app.delete('/api/usuarios/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM usuarios WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ erro: err.message });
    res.status(204).end();
  });
});

// --- CRUD de Estudos Bíblicos (SQLite) ---
// Listar estudos
app.get('/api/estudos', authMiddleware, (req, res) => {
  db.all('SELECT * FROM estudos ORDER BY dataHora DESC', (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// Criar estudo
app.post('/api/estudos', authMiddleware, (req, res) => {
  const { titulo, tema, conteudo } = req.body;
  const usuario = req.usuario;
  if (!titulo || !tema || !conteudo) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  const dataHora = new Date().toISOString();
  db.run('INSERT INTO estudos (titulo, tema, conteudo, dataHora, usuario) VALUES (?, ?, ?, ?, ?)',
    [titulo, tema, conteudo, dataHora, usuario], function(err) {
      if (err) return res.status(500).json({ erro: err.message });
      db.get('SELECT * FROM estudos WHERE id = ?', [this.lastID], (err, row) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.status(201).json(row);
      });
    });
});

// Editar estudo
app.put('/api/estudos/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const { titulo, tema, conteudo } = req.body;
  const usuario = req.usuario;
  const perfil = req.perfil;
  if (!titulo || !tema || !conteudo) return res.status(400).json({ erro: 'Campos obrigatórios.' });
  db.get('SELECT * FROM estudos WHERE id = ?', [id], (err, estudo) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!estudo) return res.status(404).json({ erro: 'Estudo não encontrado.' });
    if (perfil !== 'admin' && estudo.usuario !== usuario) {
      return res.status(403).json({ erro: 'Sem permissão para editar.' });
    }
    db.run('UPDATE estudos SET titulo = ?, tema = ?, conteudo = ? WHERE id = ?',
      [titulo, tema, conteudo, id], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        db.get('SELECT * FROM estudos WHERE id = ?', [id], (err, row) => {
          if (err) return res.status(500).json({ erro: err.message });
          res.json(row);
        });
      });
  });
});

// Excluir estudo
app.delete('/api/estudos/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const usuario = req.usuario;
  const perfil = req.perfil;
  db.get('SELECT * FROM estudos WHERE id = ?', [id], (err, estudo) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!estudo) return res.status(404).json({ erro: 'Estudo não encontrado.' });
    if (perfil !== 'admin' && estudo.usuario !== usuario) {
      return res.status(403).json({ erro: 'Sem permissão para excluir.' });
    }
    db.run('DELETE FROM estudos WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ ok: true });
    });
  });
});

// Listar todos os sermões (restrição de visualização)
app.get('/api/sermoes', authMiddleware, (req, res) => {
  const { usuario, perfil } = req;
  let query = 'SELECT * FROM sermoes';
  let params = [];
  if (perfil === 'edit') {
    // Edit pode ver todos, mas só editar/excluir os seus
    // (restrição só nas rotas de edição/exclusão)
  } else if (perfil === 'read') {
    // Read pode ver todos
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// Criar novo sermão (qualquer perfil pode criar, mas só read não pode)
app.post('/api/sermoes', authMiddleware, (req, res) => {
  const { nome, conteudo, dataHora, local } = req.body;
  const usuario = req.usuario;
  const perfil = req.perfil;
  if (!nome || !conteudo || !dataHora || !local) {
    return res.status(400).json({ erro: 'Campos obrigatórios não preenchidos.' });
  }
  if (perfil === 'read') {
    return res.status(403).json({ erro: 'Usuário sem permissão para criar sermão.' });
  }
  db.run(
    'INSERT INTO sermoes (nome, conteudo, dataHora, local, usuario) VALUES (?, ?, ?, ?, ?)',
    [nome, conteudo, dataHora, local, usuario],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      db.get('SELECT * FROM sermoes WHERE id = ?', [this.lastID], (err, row) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.status(201).json(row);
      });
    }
  );
});

// Editar sermão (restrição por perfil)
app.put('/api/sermoes/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, conteudo, dataHora, local } = req.body;
  const usuario = req.usuario;
  const perfil = req.perfil;
  // Admin pode editar tudo, edit só os seus, read não pode
  db.get('SELECT * FROM sermoes WHERE id = ?', [id], (err, sermao) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!sermao) return res.status(404).json({ erro: 'Sermão não encontrado.' });
    if (perfil === 'read') {
      return res.status(403).json({ erro: 'Usuário sem permissão para editar sermão.' });
    }
    if (perfil === 'edit' && sermao.usuario !== usuario) {
      return res.status(403).json({ erro: 'Só pode editar seus próprios sermões.' });
    }
    db.run(
      'UPDATE sermoes SET nome = ?, conteudo = ?, dataHora = ?, local = ? WHERE id = ?',
      [nome, conteudo, dataHora, local, id],
      function (err) {
        if (err) return res.status(500).json({ erro: err.message });
        db.get('SELECT * FROM sermoes WHERE id = ?', [id], (err, row) => {
          if (err) return res.status(500).json({ erro: err.message });
          if (!row) return res.status(404).json({ erro: 'Sermão não encontrado.' });
          res.json(row);
        });
      }
    );
  });
});

// Excluir sermão (restrição por perfil)
app.delete('/api/sermoes/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const usuario = req.usuario;
  const perfil = req.perfil;
  db.get('SELECT * FROM sermoes WHERE id = ?', [id], (err, sermao) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!sermao) return res.status(404).json({ erro: 'Sermão não encontrado.' });
    if (perfil === 'read') {
      return res.status(403).json({ erro: 'Usuário sem permissão para excluir sermão.' });
    }
    if (perfil === 'edit' && sermao.usuario !== usuario) {
      return res.status(403).json({ erro: 'Só pode excluir seus próprios sermões.' });
    }
    db.run('DELETE FROM sermoes WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.status(204).end();
    });
  });
});


// Rota de login
app.post('/api/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Usuário e senha obrigatórios.' });
  }
  db.get('SELECT * FROM usuarios WHERE usuario = ?', [usuario], (err, user) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!user) return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    if (!bcrypt.compareSync(senha, user.senha)) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    }
    // Não retorna a senha
    const { id, usuario: nome, perfil } = user;
    res.json({ id, usuario: nome, perfil });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor backend rodando na porta ${PORT}`);
});
