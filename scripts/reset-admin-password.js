require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL or ADMIN_PASSWORD is missing in .env');
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ppp_green_service',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  try {
    const hashed = await bcrypt.hash(adminPassword, 12);
    const [result] = await pool.query(
      'UPDATE users SET password = ?, active = 1, updated_at = NOW() WHERE email = ? LIMIT 1',
      [hashed, adminEmail]
    );

    if (!result.affectedRows) {
      throw new Error(`Admin user not found for email: ${adminEmail}`);
    }

    console.log(`Admin password reset successful for: ${adminEmail}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Reset admin password failed:', err.message);
  process.exit(1);
});
