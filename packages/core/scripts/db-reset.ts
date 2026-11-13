// Drops and recreates a local development database, applies every migration and seeds demo data.
//   npm run db:reset          uses DATABASE_URL, or postgres://zirr:zirr@localhost:5432/zirr_dev
// Never point this at a database you want to keep.
import { createDb } from '../src/lib/db';
import { applyMigrations } from '../src/lib/migrate';
import { createPlatform, install } from '../src/platform';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://zirr:zirr@localhost:5432/zirr_dev');
const name = url.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name) || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('db:reset only works on a local database');

const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = createDb(adminUrl.toString(), 1);
await admin.query(`drop database if exists ${name} with (force)`);
await admin.query(`create database ${name}`);
await admin.close();

const db = createDb(url.toString(), 2);
const files = await applyMigrations(db, { bootstrap: true });
await install(createPlatform(db, { demo: true, webhookSecrets: { payments: 'local', supplier: 'local' } }));
await db.close();
console.log(`${name}: ${files.length} migrations applied, demo data seeded.`);
