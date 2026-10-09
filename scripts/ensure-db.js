// Render build step: make sure the men_db database exists on the shared
// Postgres instance before `prisma migrate deploy` runs. Uses DB_ADMIN_URL
// (internal connection string to an existing database on the same instance).
// Never touches existing data — only CREATE DATABASE if missing.
const { Client } = require("pg");

(async () => {
  const adminUrl = process.env.DB_ADMIN_URL;
  if (!adminUrl) {
    console.log("ensure-db: DB_ADMIN_URL not set, skipping.");
    return;
  }
  const client = new Client({
    connectionString: adminUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'men_db'"
    );
    if (r.rowCount === 0) {
      await client.query("CREATE DATABASE men_db");
      console.log("ensure-db: created database men_db");
    } else {
      console.log("ensure-db: men_db already exists");
    }
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error("ensure-db failed:", e.message);
  process.exit(1);
});
