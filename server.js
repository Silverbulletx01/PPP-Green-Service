require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mysql = require('mysql2/promise');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HTTPS_ENABLED = String(process.env.HTTPS_ENABLED || '').toLowerCase() === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const DEVICE_API_KEY = (process.env.DEVICE_API_KEY || '').trim();
const DEVICE_AUTH_REQUIRED = String(process.env.DEVICE_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
const AUTH_COOKIE_NAME = 'ppp_auth';

const DB_HOST = process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306);
const DB_USER = process.env.DB_USER || process.env.MYSQLUSER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQLDATABASE || 'ppp_green_service';

if (process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL) {
  // Respect reverse proxy headers on managed platforms for correct rate limiting and client IP detection.
  app.set('trust proxy', 1);
}

let dbPool = null;
const sseClients = new Set();

function validateRequiredSecurityConfig() {
  if (!JWT_SECRET || JWT_SECRET === 'ppp-palm-default-secret' || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET is missing or weak. Set a strong random secret (min 32 chars) in .env.');
  }

  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin123') {
    throw new Error('ADMIN_PASSWORD is missing or insecure. Set a strong admin password in .env.');
  }

  if (DEVICE_AUTH_REQUIRED && (!DEVICE_API_KEY || DEVICE_API_KEY.length < 16)) {
    throw new Error('DEVICE_API_KEY is missing or too short. Set a strong device API key (min 16 chars) in .env.');
  }
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx <= 0) return acc;
      const key = part.slice(0, idx).trim();
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function extractTokenFromRequest(req) {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (bearerToken && bearerToken !== 'null' && bearerToken !== 'undefined') {
    return bearerToken;
  }

  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[AUTH_COOKIE_NAME] || '';
}

function setAuthCookie(res, token, remember = false) {
  const cookieOptions = {
    httpOnly: true,
    secure: HTTPS_ENABLED,
    sameSite: 'lax',
    path: '/'
  };
  if (remember) {
    cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
  }
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: HTTPS_ENABLED,
    sameSite: 'lax',
    path: '/'
  });
}

function toMySqlDate(inputDate = new Date()) {
  const d = inputDate instanceof Date ? inputDate : new Date(inputDate);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function parsePayload(rawPayload) {
  if (!rawPayload) return {};
  if (typeof rawPayload === 'object') return rawPayload;
  try {
    return JSON.parse(rawPayload);
  } catch (_error) {
    return {};
  }
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    email: row.email,
    username: row.username,
    password: row.password,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    department: row.department,
    photoUrl: row.photo_url,
    active: Boolean(row.active),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: row.updated_at ? normalizeTimestamp(row.updated_at) : null
  };
}

function mapRecordRow(row) {
  return {
    id: String(row.id),
    receivedAt: normalizeTimestamp(row.received_at),
    payload: parsePayload(row.payload),
    hasPlateImage: Boolean(row.has_plate_image),
    plateImageName: row.plate_image_name || null,
    plateImageMime: row.plate_image_mime || null
  };
}

// Helper: get all users
async function getAllUsers() {
  const [rows] = await dbPool.query('SELECT * FROM users ORDER BY id ASC');
  return rows.map(mapUserRow);
}

// Helper: find user by email
async function findUserByEmail(email) {
  const [rows] = await dbPool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows.length ? mapUserRow(rows[0]) : null;
}

// Helper: find user by id
async function findUserById(id) {
  const [rows] = await dbPool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows.length ? mapUserRow(rows[0]) : null;
}

// Helper: create user
async function createUser(userData) {
  const [result] = await dbPool.query(
    `INSERT INTO users (
      email, username, password, role, first_name, last_name, display_name,
      department, photo_url, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      userData.email,
      userData.username,
      userData.password,
      userData.role || 'user',
      userData.firstName || '',
      userData.lastName || null,
      userData.displayName || userData.firstName || '',
      userData.department || null,
      userData.photoUrl || null,
      userData.active ? 1 : 0,
      userData.createdAt ? toMySqlDate(userData.createdAt) : toMySqlDate(),
      userData.updatedAt ? toMySqlDate(userData.updatedAt) : null
    ]
  );
  return findUserById(result.insertId);
}

// Helper: update user
async function updateUser(id, updates) {
  const fields = [];
  const values = [];
  const mappings = {
    email: 'email',
    username: 'username',
    password: 'password',
    role: 'role',
    firstName: 'first_name',
    lastName: 'last_name',
    displayName: 'display_name',
    department: 'department',
    photoUrl: 'photo_url',
    active: 'active',
    updatedAt: 'updated_at'
  };

  for (const [key, dbField] of Object.entries(mappings)) {
    if (updates[key] === undefined) continue;
    fields.push(`${dbField} = ?`);
    if (key === 'active') {
      values.push(updates[key] ? 1 : 0);
    } else if (key === 'updatedAt') {
      values.push(toMySqlDate(updates[key]));
    } else {
      values.push(updates[key]);
    }
  }

  if (!fields.length) {
    return findUserById(id);
  }

  values.push(id);
  await dbPool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  return findUserById(id);
}

// Helper: delete user
async function deleteUser(id) {
  const [result] = await dbPool.query('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// Helper: create android data record
async function createDataRecord(recordPayload) {
  const [result] = await dbPool.query(
    `INSERT INTO android_data (
      received_at, payload, plate_image, plate_image_mime, plate_image_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      toMySqlDate(recordPayload.receivedAt),
      JSON.stringify(recordPayload.payload || {}),
      recordPayload.plateImage || null,
      recordPayload.plateImageMime || null,
      recordPayload.plateImageName || null,
      toMySqlDate()
    ]
  );
  const [rows] = await dbPool.query(
    `SELECT
      id,
      received_at,
      payload,
      plate_image_name,
      plate_image_mime,
      (plate_image IS NOT NULL) AS has_plate_image
    FROM android_data
    WHERE id = ?
    LIMIT 1`,
    [result.insertId]
  );
  return rows.length ? mapRecordRow(rows[0]) : null;
}

// Helper: fetch data records
async function getDataRecords() {
  const [rows] = await dbPool.query(
    `SELECT
      id,
      received_at,
      payload,
      plate_image_name,
      plate_image_mime,
      (plate_image IS NOT NULL) AS has_plate_image
    FROM android_data
    ORDER BY received_at DESC`
  );
  return rows.map(mapRecordRow);
}

// Helper: fetch image blob for a record
async function getDataRecordImageById(id) {
  const [rows] = await dbPool.query(
    `SELECT plate_image, plate_image_mime, plate_image_name
     FROM android_data
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  if (!rows[0].plate_image) return { hasImage: false };
  return {
    hasImage: true,
    imageBuffer: rows[0].plate_image,
    mimeType: rows[0].plate_image_mime || 'application/octet-stream',
    fileName: rows[0].plate_image_name || `plate-image-${id}`
  };
}

// Helper: delete data record
async function deleteDataRecord(id) {
  const [result] = await dbPool.query('DELETE FROM android_data WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// Initialize default admin user (only if no users exist yet)
async function ensureAdminUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@pppgreen.com';
    const existing = await findUserByEmail(adminEmail);
    if (existing) {
      console.log(`Admin user already exists: ${existing.email}`);
      return;
    }
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    const firstName = process.env.ADMIN_FIRST_NAME || 'Admin';
    const lastName = process.env.ADMIN_LAST_NAME || 'System';
    
    await createUser({
      email: adminEmail,
      username: adminEmail, // keep username as fallback for now
      password: hashedPassword,
      role: 'admin',
      firstName: firstName,
      lastName: lastName,
      displayName: firstName,
      department: 'IT',
      active: true,
      createdAt: new Date().toISOString()
    });
    console.log(`Default admin user created: ${adminEmail}`);
  } catch (err) {
    console.error('Failed to initialize admin user:', err.message);
  }
}

// File upload setup
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME_TO_EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

function parseBase64Image(imageValue) {
  if (typeof imageValue !== 'string') {
    throw new Error('Base64 image payload must be a string.');
  }

  const trimmed = imageValue.trim();
  if (!trimmed) {
    throw new Error('Base64 image payload is empty.');
  }

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  let mimeType = 'image/jpeg';
  let base64Data = trimmed;

  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    base64Data = dataUrlMatch[2];
  }

  if (mimeType === 'image/jpg') {
    mimeType = 'image/jpeg';
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported image type. Only JPG, PNG, WEBP are allowed.');
  }

  const normalizedBase64 = base64Data.replace(/\s+/g, '');
  const buffer = Buffer.from(normalizedBase64, 'base64');

  if (!buffer.length) {
    throw new Error('Invalid base64 image data.');
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image size must be less than or equal to 5MB.');
  }

  const extension = IMAGE_MIME_TO_EXTENSION[mimeType] || '.jpg';
  return {
    buffer,
    mimeType,
    fileName: `base64-upload-${Date.now()}${extension}`
  };
}

function removeInlineImagePayloadFields(payload) {
  if (!payload || typeof payload !== 'object') return;
  delete payload.photoBase64;
  delete payload.imageBase64;
  delete payload.photoDataUrl;
  delete payload.imageDataUrl;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, uploadsDir);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname) || '.jpg';
      const baseName = path.basename(file.originalname, extension)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      const safeBaseName = baseName || 'photo';
      callback(null, `${Date.now()}-${safeBaseName}${extension.toLowerCase()}`);
    }
  }),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(new Error('Unsupported file type. Only JPG, PNG, WEBP are allowed.'));
      return;
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext && !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      callback(new Error('Unsupported file extension. Only .jpg, .jpeg, .png, .webp are allowed.'));
      return;
    }
    callback(null, true);
  }
});

// SSE helpers
function sendSseEvent(client, event, data) {
  client.write(`event: ${event}\n`);
  client.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastNewRecord(record) {
  for (const client of sseClients) {
    sendSseEvent(client, 'new-record', record);
  }
}

async function initializeDatabase() {
  try {
    const rootPool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    await rootPool.query('SELECT 1');
    await rootPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await rootPool.end();

    dbPool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    await dbPool.query('SELECT 1');

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(191) NOT NULL,
        username VARCHAR(191) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NULL,
        display_name VARCHAR(100) NOT NULL,
        department VARCHAR(100) NULL,
        photo_url TEXT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS android_data (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        received_at DATETIME NOT NULL,
        payload LONGTEXT NOT NULL,
        plate_image LONGBLOB NULL,
        plate_image_mime VARCHAR(100) NULL,
        plate_image_name VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_android_data_received_at (received_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [androidDataColumns] = await dbPool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'android_data'
         AND COLUMN_NAME IN ('plate_image', 'plate_image_mime', 'plate_image_name')`,
      [DB_NAME]
    );

    const existingColumns = new Set(androidDataColumns.map(col => col.COLUMN_NAME));
    if (!existingColumns.has('plate_image')) {
      await dbPool.query('ALTER TABLE android_data ADD COLUMN plate_image LONGBLOB NULL');
    }
    if (!existingColumns.has('plate_image_mime')) {
      await dbPool.query('ALTER TABLE android_data ADD COLUMN plate_image_mime VARCHAR(100) NULL');
    }
    if (!existingColumns.has('plate_image_name')) {
      await dbPool.query('ALTER TABLE android_data ADD COLUMN plate_image_name VARCHAR(255) NULL');
    }

    console.log('MySQL connected.');
  } catch (error) {
    console.error('MySQL initialization failed.', error.message);
    throw error;
  }

  await ensureAdminUser();
}

// ==================== SECURITY MIDDLEWARE ====================

// Helmet - sets various HTTP security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS - restrict to same origin (adjust allowed origins as needed)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [];
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (same-origin, mobile apps, curl)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Key'],
}));

// Rate limiting - general API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', generalLimiter);

// Rate limiting - strict for login (prevent brute force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again after 15 minutes.' },
});

// Rate limiting - for data submission from devices
const dataSubmitLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 data submissions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many data submissions, please slow down.' },
});

// Input sanitization helper
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>"'&]/g, (char) => {
    const entities = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' };
    return entities[char] || char;
  });
}

// Email validation helper
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// JWT middleware
function authenticateToken(req, res, next) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required.' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

// Optional auth - passes through if no token
function optionalAuth(req, res, next) {
  const token = extractTokenFromRequest(req);
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) req.user = user;
    });
  }
  next();
}

// Admin-only middleware
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

// ==================== AUTH ROUTES ====================

app.post('/api/v1/auth/login', loginLimiter, async (req, res) => {
  const { email, password, remember } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email format.' });
  }
  try {
    const user = await findUserByEmail(email);
    if (!user || !user.active) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    setAuthCookie(res, token, Boolean(remember));

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName, email: user.email, department: user.department, firstName: user.firstName, lastName: user.lastName, photoUrl: user.photoUrl }
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

app.post('/api/v1/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logout successful.' });
});

app.get('/api/v1/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const { password, ...safeUser } = user;
    res.json({ success: true, data: safeUser });
  } catch (err) {
    res.json({ success: true, data: req.user });
  }
});

// Change own password
app.post('/api/v1/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
  }
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await updateUser(user.id, { password: hashed, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
});

// ==================== SELF PROFILE UPDATE ====================

// Update own profile (any authenticated user)
app.put('/api/v1/auth/profile', authenticateToken, async (req, res) => {
  const { firstName, lastName, displayName } = req.body;
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const updates = { updatedAt: new Date().toISOString() };
    if (firstName !== undefined) updates.firstName = sanitizeString(String(firstName).trim().slice(0, 100));
    if (lastName !== undefined) updates.lastName = sanitizeString(String(lastName).trim().slice(0, 100));
    if (displayName !== undefined) updates.displayName = sanitizeString(String(displayName).trim().slice(0, 100));
    else if (firstName !== undefined) updates.displayName = updates.firstName;
    await updateUser(req.user.id, updates);
    const updated = await findUserById(req.user.id);
    const { password, ...safeUser } = updated;
    res.json({ success: true, message: 'Profile updated.', data: safeUser });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

// Upload own profile photo (any authenticated user)
app.post('/api/v1/auth/profile/photo', authenticateToken, (req, res, next) => {
  upload.single('photo')(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No photo uploaded.' });
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const requestProtocol = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() || req.protocol;
    const photoUrl = `${requestProtocol}://${req.get('host')}/uploads/${req.file.filename}`;
    await updateUser(req.user.id, { photoUrl, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: 'Photo uploaded.', data: { photoUrl } });
  } catch (err) {
    console.error('Upload photo error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to upload photo.' });
  }
});

// ==================== USER MANAGEMENT (Admin only) ====================

// List all users
app.get('/api/v1/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    const safeUsers = users.map(({ password, ...u }) => u);
    res.json({ success: true, count: safeUsers.length, data: safeUsers });
  } catch (err) {
    console.error('Fetch users error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// Create user
app.post('/api/v1/users', authenticateToken, requireAdmin, async (req, res) => {
  const { email, password, firstName, lastName, role, department } = req.body;
  if (!email || !password || !firstName) {
    return res.status(400).json({ success: false, message: 'Email, password, and first name are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email format.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }
  const allowedRoles = ['admin', 'user'];
  const safeRole = allowedRoles.includes(role) ? role : 'user';
  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }
    const hashed = await bcrypt.hash(password, 12);
    const safeFirstName = sanitizeString(String(firstName).trim().slice(0, 100));
    const safeLastName = sanitizeString(String(lastName || '').trim().slice(0, 100));
    const safeDepartment = sanitizeString(String(department || '').trim().slice(0, 100));
    const user = await createUser({
      email: email.trim().toLowerCase(),
      username: email.trim().toLowerCase(),
      password: hashed,
      firstName: safeFirstName,
      lastName: safeLastName,
      displayName: safeFirstName,
      role: safeRole,
      department: safeDepartment,
      active: true,
      createdAt: new Date().toISOString()
    });
    const { password: _, ...safeUser } = user;
    res.status(201).json({ success: true, message: 'User created.', data: safeUser });
  } catch (err) {
    console.error('Create user error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
});

// Update user
app.put('/api/v1/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { email, firstName, lastName, role, department, active } = req.body;
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const updates = { updatedAt: new Date().toISOString() };
    if (email !== undefined) {
      if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'Invalid email format.' });
      updates.email = email.trim().toLowerCase();
    }
    if (firstName !== undefined) {
      updates.firstName = sanitizeString(String(firstName).trim().slice(0, 100));
      updates.displayName = updates.firstName;
    }
    if (lastName !== undefined) updates.lastName = sanitizeString(String(lastName).trim().slice(0, 100));
    if (role !== undefined) {
      const allowedRoles = ['admin', 'user'];
      if (allowedRoles.includes(role)) updates.role = role;
    }
    if (department !== undefined) updates.department = sanitizeString(String(department).trim().slice(0, 100));
    if (active !== undefined) updates.active = Boolean(active);
    const updated = await updateUser(req.params.id, updates);
    const { password, ...safeUser } = updated;
    res.json({ success: true, message: 'User updated.', data: safeUser });
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

// Admin reset password for a user
app.post('/api/v1/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
  }
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await updateUser(req.params.id, { password: hashed, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: `Password reset for ${user.username}.` });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

// Upload user profile photo
app.post('/api/v1/users/:id/photo', authenticateToken, requireAdmin, (req, res, next) => {
  upload.single('photo')(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No photo uploaded.' });
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const requestProtocol = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() || req.protocol;
    const photoUrl = `${requestProtocol}://${req.get('host')}/uploads/${req.file.filename}`;
    await updateUser(req.params.id, { photoUrl, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: 'Photo uploaded.', data: { photoUrl } });
  } catch (err) {
    console.error('Upload user photo error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to upload photo.' });
  }
});

// Delete user
app.delete('/api/v1/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') {
      const allUsers = await getAllUsers();
      const adminCount = allUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the last admin user.' });
      }
    }
    await deleteUser(req.params.id);
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
});

// ==================== SSE STREAM ====================

app.get('/api/v1/android/data/stream', optionalAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  sendSseEvent(res, 'connected', { connectedAt: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    sendSseEvent(res, 'heartbeat', { time: new Date().toISOString() });
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ==================== HEALTH ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ppp-palm-service',
    version: '2.0.0',
    storage: 'mysql',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

function authenticateDevice(req, res, next) {
  if (!DEVICE_AUTH_REQUIRED) {
    return next();
  }

  const deviceKey = (req.headers['x-device-key'] || '').toString().trim();
  if (!deviceKey || deviceKey !== DEVICE_API_KEY) {
    return res.status(401).json({ success: false, message: 'Invalid device key.' });
  }
  next();
}

// ==================== DATA ROUTES ====================

// POST - receive data from Android app (no auth required for device submission)
app.post('/api/v1/android/data', dataSubmitLimiter, authenticateDevice, (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    next();
    return;
  }
  upload.single('photo')(req, res, (error) => {
    if (!error) { next(); return; }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Image size must be less than or equal to 5MB.' });
    }
    res.status(400).json({ success: false, message: error.message || 'Failed to upload image file.' });
  });
}, async (req, res) => {
  let payload = {};
  let plateImageBuffer = null;
  let plateImageMime = null;
  let plateImageName = null;

  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    if (typeof req.body.payload === 'string') {
      try {
        const parsedPayload = JSON.parse(req.body.payload);
        payload = parsedPayload && typeof parsedPayload === 'object' ? parsedPayload : {};
      } catch (_error) {
        payload = { ...req.body, payload: req.body.payload };
      }
    } else if (req.body.payload && typeof req.body.payload === 'object') {
      payload = req.body.payload;
    } else {
      payload = { ...req.body };
    }
  }

  if (req.file) {
    const requestProtocol = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() || req.protocol;
    payload.photoUrl = `${requestProtocol}://${req.get('host')}/uploads/${req.file.filename}`;
    payload.photoOriginalName = req.file.originalname;
    try {
      plateImageBuffer = fs.readFileSync(req.file.path);
      plateImageMime = req.file.mimetype || null;
      plateImageName = req.file.originalname || req.file.filename || null;
    } catch (error) {
      console.error('Failed to read uploaded image for DB storage:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to process uploaded image.' });
    }
  }

  const inlineImageValue = payload.photoBase64 || payload.imageBase64 || payload.photoDataUrl || payload.imageDataUrl;
  if (!req.file && typeof inlineImageValue === 'string' && inlineImageValue.trim()) {
    try {
      const parsedImage = parseBase64Image(inlineImageValue);
      plateImageBuffer = parsedImage.buffer;
      plateImageMime = parsedImage.mimeType;
      plateImageName = parsedImage.fileName;
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Invalid base64 image payload.' });
    }
  }

  // Do not keep large inline image strings inside JSON payload.
  removeInlineImagePayloadFields(payload);

  if ((!payload || Object.keys(payload).length === 0) && !plateImageBuffer) {
    return res.status(400).json({ success: false, message: 'Request must include data fields or an image file.' });
  }

  const recordPayload = {
    receivedAt: new Date().toISOString(),
    payload,
    plateImage: plateImageBuffer,
    plateImageMime,
    plateImageName
  };
  try {
    const savedRecord = await createDataRecord(recordPayload);
    broadcastNewRecord(savedRecord);
    return res.status(201).json({ success: true, message: 'Data received successfully.', data: savedRecord });
  } catch (error) {
    console.error('Save data error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to save data.' });
  }
});

// GET - fetch all data (protected)
app.get('/api/v1/android/data', authenticateToken, async (req, res) => {
  try {
    const data = await getDataRecords();
    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Fetch data error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch data.' });
  }
});

// GET - fetch stored plate image by record id (protected)
app.get('/api/v1/android/data/:id/plate-image', authenticateToken, async (req, res) => {
  try {
    const imageData = await getDataRecordImageById(req.params.id);
    if (!imageData) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
    if (!imageData.hasImage) {
      return res.status(404).json({ success: false, message: 'No plate image found for this record.' });
    }

    res.setHeader('Content-Type', imageData.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${imageData.fileName.replace(/"/g, '')}"`);
    return res.status(200).send(imageData.imageBuffer);
  } catch (error) {
    console.error('Fetch plate image error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch plate image.' });
  }
});

// DELETE - delete a record (protected)
app.delete('/api/v1/android/data/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await deleteDataRecord(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
    return res.json({ success: true, message: 'Record deleted.' });
  } catch (error) {
    console.error('Delete record error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete record.' });
  }
});

// GET - dashboard stats
app.get('/api/v1/stats', authenticateToken, async (req, res) => {
  let records = [];
  try {
    records = await getDataRecords();
  } catch (error) {
    console.error('Fetch stats error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }

  const totalRecords = records.length;
  const withPhotos = records.filter(r => r.payload?.photoUrl).length;
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = records.filter(r => r.receivedAt?.startsWith(today)).length;

  // Records per day (last 7 days)
  const dailyStats = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dailyStats[key] = 0;
  }
  records.forEach(r => {
    const day = r.receivedAt?.split('T')[0];
    if (day && dailyStats.hasOwnProperty(day)) {
      dailyStats[day]++;
    }
  });

  // Hourly distribution for today
  const hourlyStats = Array(24).fill(0);
  records.forEach(r => {
    if (r.receivedAt?.startsWith(today)) {
      const hour = new Date(r.receivedAt).getHours();
      hourlyStats[hour]++;
    }
  });

  res.json({
    success: true,
    data: {
      totalRecords,
      withPhotos,
      todayRecords,
      activeConnections: sseClients.size,
      dailyStats,
      hourlyStats,
      storageType: 'MySQL (XAMPP)'
    }
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// Start server
function startServer(initialPort) {
  const maxPortAttempts = 10;
  let currentPort = initialPort;
  let attempts = 0;

  let serverFactory = http.createServer;
  let protocol = 'http';

  if (HTTPS_ENABLED) {
    if (!SSL_KEY_PATH || !SSL_CERT_PATH) {
      console.warn('HTTPS_ENABLED is true but SSL_KEY_PATH/SSL_CERT_PATH are missing. Falling back to HTTP.');
    } else {
      try {
        const sslKey = fs.readFileSync(path.resolve(process.cwd(), SSL_KEY_PATH));
        const sslCert = fs.readFileSync(path.resolve(process.cwd(), SSL_CERT_PATH));
        serverFactory = (expressApp) => https.createServer({ key: sslKey, cert: sslCert }, expressApp);
        protocol = 'https';
      } catch (error) {
        console.warn(`Failed to load SSL files (${error.message}). Falling back to HTTP.`);
      }
    }
  }

  const listen = () => {
    const server = serverFactory(app).listen(currentPort, () => {
      console.log(`\n  PPP Palm Service v2.0.0`);
      console.log(`  Server running on ${protocol}://localhost:${currentPort}`);
      console.log('  Storage: MySQL (XAMPP)\n');
    });
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' && attempts < maxPortAttempts) {
        attempts += 1;
        currentPort += 1;
        console.warn(`Port is in use. Retrying on ${protocol}://localhost:${currentPort}`);
        listen();
        return;
      }
      console.error('Failed to start server.', error.message);
      process.exit(1);
    });
  };
  listen();
}

// ==================== STARTUP ====================
// When run directly (npm start / node server.js) boot as standalone HTTP server.
// When imported as a module (Vercel serverless) export the Express app and
// initialise the database lazily so the function handler is returned immediately.

let dbInitPromise = null;

function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = initializeDatabase().catch((err) => {
      console.error('DB init error:', err.message);
      dbInitPromise = null; // allow retry on next request
    });
  }
  return dbInitPromise;
}

if (require.main === module) {
  // ---- Standalone mode ----
  try {
    validateRequiredSecurityConfig();
  } catch (error) {
    console.error('Security configuration error:', error.message);
    process.exit(1);
  }

  initializeDatabase()
    .then(() => {
      startServer(PORT);
    })
    .catch((error) => {
      console.error('Unable to start server because MySQL is not ready.', error.message);
      process.exit(1);
    });
} else {
  // ---- Serverless mode (Vercel) ----
  // Validate config but do NOT call process.exit so the function can still
  // return an informative error response instead of crashing silently.
  try {
    validateRequiredSecurityConfig();
  } catch (error) {
    console.error('Security configuration error:', error.message);
  }

  // Kick off DB init eagerly; requests will wait via ensureDb() if needed.
  ensureDb();
}

module.exports = app;
