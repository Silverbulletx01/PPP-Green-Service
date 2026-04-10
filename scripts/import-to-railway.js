require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  const sqlFile = path.join(__dirname, '..', 'sql', 'railway_import.sql');
  if (!fs.existsSync(sqlFile)) {
    throw new Error('railway_import.sql not found. Run mysqldump first.');
  }

  const sql = fs.readFileSync(sqlFile, 'utf8');

  const conn = await mysql.createConnection({
    host: 'mainline.proxy.rlwy.net',
    port: 34635,
    user: 'root',
    password: 'THPsgnKOqyINEpbEpDKtAKaqdUUdYVjw',
    database: 'railway',
    multipleStatements: true,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Connected to Railway MySQL.');

  // Split statements manually to avoid issues with multipleStatements on large files
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

  let ok = 0;
  let skip = 0;
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
      ok++;
    } catch (err) {
      // Ignore "table already exists" type errors
      if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_ENTRY') {
        skip++;
      } else {
        console.warn(`  WARN [${err.code}]: ${err.message.slice(0, 100)}`);
        skip++;
      }
    }
  }

  await conn.end();
  console.log(`Import complete. OK: ${ok}  Skipped/warned: ${skip}`);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
