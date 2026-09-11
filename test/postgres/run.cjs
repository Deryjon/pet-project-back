// Creates disposable databases only. Never reads DATABASE_URL or application .env.
const { mkdtempSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const net = require('node:net');
const { Client } = require('pg');
const root = resolve(__dirname, '../..');
const cutoff = '20260909090000_product_stock_shop_identity';
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`${command} failed:\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
async function freePort() {
  const server = net.createServer();
  await new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', res);
  });
  const port = server.address().port;
  await new Promise((res) => server.close(res));
  return port;
}
(async () => {
  let directory,
    pgBin,
    started = false,
    admin;
  const databases = [];
  try {
    let adminUrl = process.env.POSTGRES_TEST_ADMIN_URL;
    if (!adminUrl) {
      pgBin = process.env.PG_BIN || '/opt/homebrew/opt/postgresql@16/bin';
      directory = mkdtempSync(join(tmpdir(), 'konkurent-pg-'));
      const port = await freePort();
      run(join(pgBin, 'initdb'), [
        '-D',
        join(directory, 'data'),
        '-U',
        'stage14',
        '--auth=trust',
        '--encoding=UTF8',
        '--no-locale',
      ]);
      run(join(pgBin, 'pg_ctl'), [
        '-D',
        join(directory, 'data'),
        '-l',
        join(directory, 'server.log'),
        '-o',
        `-h 127.0.0.1 -p ${port} -k ${directory}`,
        '-w',
        'start',
      ]);
      started = true;
      adminUrl = `postgresql://stage14@127.0.0.1:${port}/postgres`;
    }
    const parsed = new URL(adminUrl);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
      throw new Error('Test PostgreSQL must be local/loopback');
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const suffix = randomBytes(6).toString('hex');
    const urls = [];
    for (const kind of ['current', 'legacy']) {
      const name = `konkurent_test_${kind}_${suffix}`;
      await admin.query(`CREATE DATABASE "${name}"`);
      databases.push(name);
      const url = new URL(adminUrl);
      url.pathname = '/' + name;
      url.search = '';
      urls.push(url.toString());
    }
    const env = {
      ...process.env,
      DATABASE_URL: urls[0],
      TEST_DATABASE_URL: urls[0],
      TEST_LEGACY_DATABASE_URL: urls[1],
    };
    const prisma = join(root, 'node_modules/prisma/build/index.js');
    console.log('Applying all migrations to a new disposable database...');
    run(process.execPath, [prisma, 'migrate', 'deploy'], env);
    run(
      process.execPath,
      [
        prisma,
        'migrate',
        'diff',
        '--from-url',
        urls[0],
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      env,
    );
    console.log('Migrated schema matches schema.prisma.');
    const legacy = new Client({ connectionString: urls[1] });
    await legacy.connect();
    try {
      const migrations = readdirSync(join(root, 'prisma/migrations'))
        .filter((name) => /^\d/.test(name) && name < cutoff)
        .sort();
      for (const migration of migrations) {
        try {
          await legacy.query(
            readFileSync(
              join(root, 'prisma/migrations', migration, 'migration.sql'),
              'utf8',
            ),
          );
        } catch (error) {
          throw new Error(
            `Legacy preparation failed at ${migration}: ${error.message}`,
          );
        }
      }
      console.log(
        `Legacy database prepared with ${migrations.length} migrations.`,
      );
    } finally {
      await legacy.end();
    }
    if (!process.argv.includes('--migrations-only')) {
      const result = spawnSync(
        process.execPath,
        [
          join(root, 'node_modules/jest/bin/jest.js'),
          '--config',
          'test/postgres/jest.json',
          '--runInBand',
        ],
        { cwd: root, env, stdio: 'inherit' },
      );
      if (result.status !== 0) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (admin) {
      for (const database of databases) {
        try {
          await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
        } catch (error) {
          console.error(
            `Could not remove test database ${database}: ${error.message}`,
          );
          process.exitCode = 1;
        }
      }
      await admin.end();
    }
    if (started)
      run(join(pgBin, 'pg_ctl'), [
        '-D',
        join(directory, 'data'),
        '-m',
        'fast',
        '-w',
        'stop',
      ]);
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
})();
