const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const sourcePath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'sermoes.db');
const apply = process.argv.includes('--apply');

function readRows(source, sql) {
  return new Promise((resolve, reject) => {
    source.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function main() {
  const source = new sqlite3.Database(sourcePath, sqlite3.OPEN_READONLY);
  let pool;

  try {
    const [sermonColumns, studyColumns] = await Promise.all([
      readRows(source, 'PRAGMA table_info(sermoes)'),
      readRows(source, 'PRAGMA table_info(estudos)')
    ]);
    const sermonSharedColumn = sermonColumns.some(column => column.name === 'compartilhado')
      ? 'compartilhado'
      : '0 AS compartilhado';
    const sermonCreatedColumn = sermonColumns.some(column => column.name === 'criadoem')
      ? 'criadoem'
      : 'dataHora AS criadoem';
    const studySharedColumn = studyColumns.some(column => column.name === 'compartilhado')
      ? 'compartilhado'
      : '0 AS compartilhado';
    const commitmentTable = await readRows(
      source,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'compromissos'"
    );
    const devotionalTable = await readRows(
      source,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devocionais'"
    );
    const devotionalColumns = devotionalTable.length > 0
      ? await readRows(source, 'PRAGMA table_info(devocionais)')
      : [];
    const devotionalSharedColumn = devotionalColumns.some(column => column.name === 'compartilhado')
      ? 'compartilhado'
      : '0 AS compartilhado';
    const commitmentColumns = commitmentTable.length > 0
      ? await readRows(source, 'PRAGMA table_info(compromissos)')
      : [];
    const commitmentRecurrenceColumn = commitmentColumns.some(column => column.name === 'recorrencia_id')
      ? 'recorrencia_id'
      : 'NULL AS recorrencia_id';
    const [users, sermons, studies, devotionals, appointments] = await Promise.all([
      readRows(source, 'SELECT id, usuario, senha, perfil FROM usuarios ORDER BY id'),
      readRows(source, `SELECT id, nome, conteudo, dataHora, local, usuario, ${sermonSharedColumn}, ${sermonCreatedColumn} FROM sermoes ORDER BY id`),
      readRows(source, `SELECT id, titulo, tema, conteudo, dataHora, usuario, ${studySharedColumn} FROM estudos ORDER BY id`),
      devotionalTable.length > 0
        ? readRows(source, `SELECT id, titulo, tema, conteudo, dataHora, usuario, ${devotionalSharedColumn} FROM devocionais ORDER BY id`)
        : Promise.resolve([]),
      commitmentTable.length > 0
        ? readRows(source, `SELECT id, titulo, datahora, local, descricao, usuario, ${commitmentRecurrenceColumn} FROM compromissos ORDER BY id`)
        : Promise.resolve([])
    ]);

    console.log(`SQLite source: ${sourcePath}`);
    console.log(`Users to import: ${users.length}`);
    console.log(`Sermons to import: ${sermons.length}`);
    console.log(`Studies to import: ${studies.length}`);
    console.log(`Devotionals to import: ${devotionals.length}`);
    console.log(`Appointments to import: ${appointments.length}`);

    if (!apply) {
      console.log('Dry run only; no data was written. Add --apply to import these records.');
      return;
    }

    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required to apply the migration.');
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(`CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        usuario TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        perfil TEXT NOT NULL CHECK(perfil IN ('read', 'edit', 'admin'))
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS sermoes (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        conteudo TEXT NOT NULL,
        datahora TEXT NOT NULL,
        local TEXT NOT NULL,
        usuario TEXT,
        compartilhado BOOLEAN NOT NULL DEFAULT FALSE,
        criadoem TEXT
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS estudos (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        tema TEXT NOT NULL,
        conteudo TEXT NOT NULL,
        datahora TEXT NOT NULL,
        usuario TEXT,
        compartilhado BOOLEAN NOT NULL DEFAULT FALSE
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS devocionais (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        tema TEXT NOT NULL,
        conteudo TEXT NOT NULL,
        datahora TEXT NOT NULL,
        usuario TEXT,
        compartilhado BOOLEAN NOT NULL DEFAULT FALSE
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS compromissos (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        datahora TEXT NOT NULL,
        local TEXT NOT NULL DEFAULT '',
        descricao TEXT NOT NULL DEFAULT '',
        usuario TEXT NOT NULL,
        recorrencia_id TEXT
      )`);
      await client.query('ALTER TABLE compromissos ADD COLUMN IF NOT EXISTS recorrencia_id TEXT');
      await client.query('ALTER TABLE sermoes ADD COLUMN IF NOT EXISTS compartilhado BOOLEAN NOT NULL DEFAULT FALSE');
      await client.query('ALTER TABLE sermoes ADD COLUMN IF NOT EXISTS criadoem TEXT');
      await client.query('ALTER TABLE estudos ADD COLUMN IF NOT EXISTS compartilhado BOOLEAN NOT NULL DEFAULT FALSE');
      await client.query('ALTER TABLE devocionais ADD COLUMN IF NOT EXISTS compartilhado BOOLEAN NOT NULL DEFAULT FALSE');

      const existing = await client.query(`SELECT
        (SELECT COUNT(*)::int FROM usuarios) AS users,
        (SELECT COUNT(*)::int FROM sermoes) AS sermons,
        (SELECT COUNT(*)::int FROM estudos) AS studies,
        (SELECT COUNT(*)::int FROM devocionais) AS devotionals,
        (SELECT COUNT(*)::int FROM compromissos) AS appointments`);
      if (Object.values(existing.rows[0]).some((count) => count !== 0)) {
        throw new Error('Target database is not empty; import cancelled to prevent duplicate or mixed records.');
      }

      for (const user of users) {
        await client.query(
          'INSERT INTO usuarios (id, usuario, senha, perfil) VALUES ($1, $2, $3, $4)',
          [user.id, user.usuario, user.senha, user.perfil]
        );
      }
      for (const sermon of sermons) {
        await client.query(
          `INSERT INTO sermoes (id, nome, conteudo, datahora, local, usuario, compartilhado, criadoem)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [sermon.id, sermon.nome, sermon.conteudo, sermon.dataHora, sermon.local, sermon.usuario, Boolean(sermon.compartilhado), sermon.criadoem || sermon.dataHora]
        );
      }
      for (const study of studies) {
        await client.query(
          `INSERT INTO estudos (id, titulo, tema, conteudo, datahora, usuario, compartilhado)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [study.id, study.titulo, study.tema, study.conteudo, study.dataHora, study.usuario, Boolean(study.compartilhado)]
        );
      }
      for (const devotional of devotionals) {
        await client.query(
          `INSERT INTO devocionais (id, titulo, tema, conteudo, datahora, usuario, compartilhado)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [devotional.id, devotional.titulo, devotional.tema, devotional.conteudo, devotional.dataHora, devotional.usuario, Boolean(devotional.compartilhado)]
        );
      }
      for (const appointment of appointments) {
        await client.query(
          `INSERT INTO compromissos (id, titulo, datahora, local, descricao, usuario, recorrencia_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [appointment.id, appointment.titulo, appointment.datahora, appointment.local, appointment.descricao, appointment.usuario, appointment.recorrencia_id]
        );
      }

      for (const table of ['usuarios', 'sermoes', 'estudos', 'devocionais', 'compromissos']) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
            COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${table}`
        );
      }

      await client.query('COMMIT');
      console.log('SQLite records imported successfully.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await new Promise((resolve, reject) => {
      source.close((error) => error ? reject(error) : resolve());
    });
    if (pool) await pool.end();
  }
}

main().catch((error) => {
  console.error('SQLite import failed:', error.message);
  process.exitCode = 1;
});
