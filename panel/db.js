const fs = require('fs');
const path = require('path');
const knexFactory = require('knex');

let knex;

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  return value && String(value).trim() ? String(value).trim() : '';
}

function sqlitePath() {
  const configured = process.env.DB_PATH && String(process.env.DB_PATH).trim();
  return path.resolve(process.cwd(), configured || path.join('data', 'gdl.sqlite'));
}

function knexConfig() {
  const url = databaseUrl();
  const migrations = { directory: path.join(__dirname, 'migrations'), tableName: 'knex_migrations' };
  if (url) {
    return { client: 'pg', connection: url, pool: { min: 0, max: 10 }, migrations };
  }
  const filename = sqlitePath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  return {
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn, done) {
        conn.pragma('foreign_keys = ON');
        done();
      }
    },
    migrations
  };
}

function getKnex() {
  if (!knex) knex = knexFactory(knexConfig());
  return knex;
}

async function init() {
  const db = getKnex();
  await db.migrate.latest();
  await require('./seed').run(db);
  await require('./texts').load(db);
  return db;
}

module.exports = { init, getKnex, databaseUrl, sqlitePath, knexConfig };
