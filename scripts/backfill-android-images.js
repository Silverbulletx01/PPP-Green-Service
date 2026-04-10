require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function resolveUploadPathFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const photoUrl = payload.photoUrl;
  if (!photoUrl || typeof photoUrl !== 'string') return null;
  const marker = '/uploads/';
  const idx = photoUrl.indexOf(marker);
  if (idx < 0) return null;
  const fileName = photoUrl.slice(idx + marker.length).split('?')[0];
  if (!fileName) return null;
  return path.join(process.cwd(), 'public', 'uploads', fileName);
}

async function main() {
  const fallbackPathArg = process.argv[2] || '';
  const fallbackPath = fallbackPathArg ? path.resolve(process.cwd(), fallbackPathArg) : null;

  if (fallbackPath && !fs.existsSync(fallbackPath)) {
    console.error(`Fallback image not found: ${fallbackPath}`);
    process.exit(1);
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ppp_green_service'
  });

  const [rows] = await db.query(
    `SELECT id, payload
     FROM android_data
     WHERE plate_image IS NULL
     ORDER BY id ASC`
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    let payload = {};
    try {
      payload = row.payload ? JSON.parse(row.payload) : {};
    } catch (_error) {
      payload = {};
    }

    const uploadPath = resolveUploadPathFromPayload(payload);
    const sourcePath = uploadPath && fs.existsSync(uploadPath)
      ? uploadPath
      : fallbackPath;

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      skipped += 1;
      continue;
    }

    const imageBuffer = fs.readFileSync(sourcePath);
    const mimeType = getMimeType(sourcePath);
    const fileName = path.basename(sourcePath);

    await db.query(
      `UPDATE android_data
       SET plate_image = ?, plate_image_mime = ?, plate_image_name = ?
       WHERE id = ?`,
      [imageBuffer, mimeType, fileName, row.id]
    );
    updated += 1;
  }

  await db.end();

  console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}, Total candidates: ${rows.length}`);
  if (!fallbackPath) {
    console.log('Tip: pass fallback image path, e.g. node scripts/backfill-android-images.js public/images/seed-traffic.png');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
