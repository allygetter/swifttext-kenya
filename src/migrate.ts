import fs from 'fs'; import path from 'path'; import { pool } from './db';
(async () => {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text primary key, at timestamptz default now())');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f]);
    if (done.rowCount) continue;
    await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await pool.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]);
    console.log('applied', f);
  }
  await pool.end();
})();
