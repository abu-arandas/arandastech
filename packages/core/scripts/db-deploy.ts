// Brings a hosted database up to date and installs the company's starting data. Safe to run on every deploy.
//   npm run db:deploy   uses DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING or DATABASE_URL, in that order
// On Vercel it runs inside the build for production deploys only, so a preview never changes the live database.
import { createDb } from '../src/lib/db';
import { checkInstallMode, deployMigrations } from '../src/lib/migrate';
import { createPlatform, install } from '../src/platform';

const target = process.env.VERCEL_ENV;
if (target && target !== 'production') {
  console.log(`db:deploy skipped: this is a ${target} build, and only production builds change the database.`);
  process.exit(0);
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL (or DATABASE_URL_UNPOOLED) to the database to deploy to.');

const demo = process.env.DEMO_MODE === 'true';
const db = createDb(url, 1);
try {
  const { applied, bootstrapped } = await deployMigrations(db);
  // A database stays in the mode it was installed in, so demo data never reaches live customers.
  await checkInstallMode(db, demo);
  // install() only adds what is missing, so the owner's own edits survive every deploy.
  // The departments' names and missions are the exception: they always follow the code, and nothing else edits them.
  await install(createPlatform(db, { demo, webhookSecrets: { payments: 'unused', supplier: 'unused' } }));
  console.log(
    [
      bootstrapped ? 'Added the Supabase roles and auth.uid() to a plain PostgreSQL.' : null,
      applied.length ? `Applied ${applied.length} migration(s): ${applied.join(', ')}.` : 'No new migrations.',
      `Starting data checked${demo ? ' (demo mode)' : ''}.`,
    ]
      .filter(Boolean)
      .join(' '),
  );
} finally {
  await db.close();
}
