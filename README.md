# 🌿 PPP Green Service version DEMO
**The website service information for PPP Green Service**

[![Node.js](https://img.shields.io/badge/Node.js-18+-6ab344?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![XAMPP](https://img.shields.io/badge/XAMPP-MySQL-FB7A24)](https://www.apachefriends.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A robust backend and beautiful administration dashboard designed for monitoring palm oil plantation data received from Android devices. Built for efficiency, transparency, and ease of use.

---

## 📑 Table of Contents
- [✨ Key Features](#-key-features)
- [🛠 Tech Stack](#-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🚀 End-to-End Setup (Mobile -> Web -> XAMPP/MySQL)](#-end-to-end-setup-mobile---web---xamppmysql)
- [🧾 Environment Variables Reference](#-environment-variables-reference)
- [🗄 XAMPP & MySQL Setup (Detailed)](#-xampp--mysql-setup-detailed)
- [📱 Mobile App Integration Guide](#-mobile-app-integration-guide)
- [🖥 Dashboard Setup & Verification](#-dashboard-setup--verification)
- [🔐 Authentication & Security](#-authentication--security)
- [🗺 API Reference](#-api-reference)
- [🧯 Troubleshooting](#-troubleshooting)
- [🌍 Internationalization](#-internationalization)

---

## ✨ Key Features

### 👤 Profile & Account Management
- **Personalized Profile**: View and edit your personal details (First Name, Last Name, Email).
- **Profile Photo**: Upload and crop your profile photo directly in the dashboard using **Cropper.js**.
- **Secure Password**: Change your password at any time via the profile settings.

### 📊 Advanced Dashboard
- **Real-time Stats**: Track total records, today's activity, photo uploads, and active stream connections.
- **Dynamic Charts**: Interactive daily and hourly volume charts powered by **Chart.js 4.4**.
- **Recent Activity**: A live-updated list of the last 5 records received from devices.
- **System Overview**: Instant visibility into storage type (MySQL/XAMPP) and server status.

### 📋 Data Management
- **Centralized Records**: Search, sort, and filter through all incoming data.
- **Gallery Mode**: A dedicated image gallery with a built-in **Lightbox** for high-quality inspections.
- **Live Feed**: Watch incoming data stream in real-time via **Server-Sent Events (SSE)**.

### ⚙️ Modern Settings & UI
- **Green Aesthetics**: A premium UI inspired by PPP Green Complex branding.
- **Dark/Light Mode**: Smooth theme transitions that persist across sessions.
- **Global Settings**: Centralized theme and language toggles within the Settings page.
- **Responsive Design**: Fully optimized for Desktop, Tablet, and Mobile devices.

---

## 🛠 Tech Stack

| Layer | Technology | Usage in this project |
|---|---|---|
| **Backend Runtime** | Node.js 18+ | API server runtime |
| **Web Framework** | Express.js 4.21 | REST API, middleware, static files |
| **Database** | MySQL / MariaDB (XAMPP) | Users + Android records persistence |
| **DB Driver** | mysql2 (promise API) | SQL queries and pooling |
| **Authentication** | JWT + HttpOnly cookie session | Login, protected routes, role checks |
| **Password Security** | bcryptjs (cost factor 12) | Password hashing/verification |
| **Security Middleware** | helmet, cors, express-rate-limit | HTTP headers, CORS, brute-force mitigation |
| **Upload Handling** | multer | JPG/PNG/WEBP upload, 5MB max |
| **Realtime** | Server-Sent Events (SSE) | Live stream of incoming records |
| **Frontend** | Vanilla JS (ES6+) + CSS3 | Login + dashboard UI |
| **UI Libraries** | Chart.js, Cropper.js, Particles.js | Charts, image crop, login background |

---

## 📁 Project Structure

```text
web-server/
├── server.js                # Express Server (API, Auth, SSE, User Management)
├── package.json             # Core dependencies and scripts
├── .env                     # Environment Variables (not committed)
├── sql/
│   └── schema.sql           # Optional manual SQL schema
├── public/
│   ├── index.html           # Professional Login Page
│   ├── dashboard.html       # Main Admin Terminal
│   ├── css/
│   │   └── style.css        # Comprehensive Design System
│   ├── js/
│   │   ├── app.js           # Core Dashboard Logic & UI Sync
│   │   ├── auth.js          # Login / session flow
│   │   ├── i18n.js          # Multi-language Engine (TH/EN)
│   │   ├── theme.js         # Theme & Appearance Engine
│   │   └── particles.js     # Background Visuals
│   └── uploads/             # Managed Image Storage
```

---

## 🚀 End-to-End Setup (Mobile -> Web -> XAMPP/MySQL)

This section walks you through full setup so that:
- Mobile app sends data to API
- API stores data in MySQL
- Web dashboard shows data in real time

### 1. Prerequisites
- **Node.js** 18+
- **npm**
- **XAMPP** installed (or a standalone MySQL/MariaDB server)

### 2. Install dependencies
```bash
npm install
```

### 3. Create environment file

Create `.env` from `.env.example`:

PowerShell:
```powershell
Copy-Item .env.example .env
```

CMD:
```cmd
copy .env.example .env
```

### 4. Configure `.env`

Use values similar to this:

```env
PORT=3000
HTTPS_ENABLED=false

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ppp_green_service

JWT_SECRET=your-strong-random-secret-at-least-32-chars
JWT_EXPIRES_IN=24h
DEVICE_API_KEY=your-strong-device-api-key

ADMIN_EMAIL=admin@pppgreen.com
ADMIN_PASSWORD=your-strong-admin-password
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=System
```

Important security notes:
- `JWT_SECRET` must be strong (minimum 32 characters)
- `ADMIN_PASSWORD` must not be default/weak
- `DEVICE_API_KEY` must be set and used by mobile clients

### 5. Run server
```bash
npm start
```

Expected startup behavior:
- `MySQL connected.`
- `Default admin user created: ...` (first run only)
- `Server running on http://localhost:3000`

Port fallback behavior:
- If `3000` is already in use, server automatically retries `3001`, `3002`, ... up to 10 attempts
- Always use the latest port shown in startup logs

### 6. Open dashboard
- Open `http://localhost:<active-port>`
- Login with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`

---

## 🧾 Environment Variables Reference

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `PORT` | No | `3000` | Initial HTTP port |
| `HTTPS_ENABLED` | No | `false` | Enable HTTPS mode |
| `SSL_KEY_PATH` | If HTTPS | `certs/key.pem` | TLS private key path |
| `SSL_CERT_PATH` | If HTTPS | `certs/cert.pem` | TLS cert path |
| `DB_HOST` | Yes | `127.0.0.1` | MySQL host |
| `DB_PORT` | Yes | `3306` | MySQL port |
| `DB_USER` | Yes | `root` | MySQL username |
| `DB_PASSWORD` | Yes | `` | MySQL password |
| `DB_NAME` | Yes | `ppp_green_service` | Database name |
| `JWT_SECRET` | Yes | `your-32+-char-secret...` | JWT signing secret |
| `JWT_EXPIRES_IN` | No | `24h` | JWT expiration |
| `DEVICE_API_KEY` | Yes | `your-strong-device-api-key` | Required for Android ingest API |
| `PPP_WIFI_ENFORCE` | No | `true` | Enable IP-based PPP WiFi restriction for Android ingest API |
| `PPP_WIFI_ALLOWED_CIDRS` | No | `192.168.10.0/24,10.20.0.0/16` | Allowed PPP WiFi IPv4 networks/CIDRs |
| `PPP_WIFI_ALLOW_LOCALHOST` | No | `true` | Allow `127.0.0.1` and `::1` for local testing |
| `ADMIN_EMAIL` | Yes | `admin@pppgreen.com` | Default admin login email |
| `ADMIN_PASSWORD` | Yes | `your-strong-admin-password` | Default admin login password |
| `ADMIN_FIRST_NAME` | No | `Admin` | Default admin profile |
| `ADMIN_LAST_NAME` | No | `System` | Default admin profile |

---

## 🗄 XAMPP & MySQL Setup (Detailed)

### Step 1: Start XAMPP
1. Open XAMPP Control Panel
2. Start **MySQL**
3. Optional: Start **Apache** if you want to use phpMyAdmin

### Step 2: Create database
1. Open `http://localhost/phpmyadmin`
2. Create a database named `ppp_green_service`
3. Keep charset as `utf8mb4`

### Step 3: Configure backend connection
Set in `.env`:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ppp_green_service
```

### Step 4: Auto-create tables
1. Start the API with `npm start`
2. The server will auto-create `users` and `android_data` tables if they do not exist
3. Optional: run `sql/schema.sql` manually if you prefer pre-provisioning schema

`android_data` now stores plate images directly in database fields:
- `plate_image` (LONGBLOB)
- `plate_image_mime` (MIME type)
- `plate_image_name` (original filename)

### Step 5: Verify data is being saved
1. Send one test record (see Mobile Integration section below)
2. Open phpMyAdmin
3. Confirm row appears in `android_data`
4. Document structure should include:

```json
{
    "receivedAt": "2026-04-09T10:00:00.000Z",
    "payload": {
        "licensePlate": "กข 1234",
        "province": "กรุงเทพมหานคร",
        "photoUrl": "http://localhost:3000/uploads/..."
    }
}
```

---

## 📱 Mobile App Integration Guide

Backend endpoint for mobile submission:
- `POST /api/v1/android/data`
- Auth: **Header `X-Device-Key` required**
- Content-Type: `multipart/form-data`

### Request fields
- `payload`: JSON string of vehicle data
- `photo`: optional image file (JPG/PNG/WEBP, max 5MB)

### Minimal payload example
```json
{
    "licensePlate": "กข 1234",
    "province": "กรุงเทพมหานคร",
    "vehicleType": "รถบรรทุก 6 ล้อ",
    "driverName": "สมชาย ใจดี",
    "weight": "18,500 kg",
    "destination": "โรงงาน A",
    "purpose": "ขนส่งปาล์มน้ำมัน",
    "status": "เข้า"
}
```

### cURL test from local machine
```bash
curl -X POST http://localhost:3000/api/v1/android/data \
    -H "X-Device-Key: your-strong-device-api-key" \
    -F 'payload={"licensePlate":"กข 1234","province":"กรุงเทพมหานคร","status":"เข้า"}' \
    -F "photo=@./public/images/seed-traffic.png"
```

### Expected success response
```json
{
    "success": true,
    "message": "Data received successfully.",
    "data": {
        "id": "<mysql-row-id>",
        "receivedAt": "<ISO-date>",
        "payload": {
            "licensePlate": "กข 1234",
            "province": "กรุงเทพมหานคร",
            "status": "เข้า",
            "photoUrl": "http://localhost:3000/uploads/<filename>"
        }
    }
}
```

### Kotlin (Android) request outline
Use multipart request with two parts:
1. Text part named `payload` (JSON string)
2. File part named `photo`

Important:
- Server file field name must be `photo`
- JSON field name must be `payload`
- Header `X-Device-Key` must match backend `DEVICE_API_KEY`
- If deploying to HTTPS, make sure app sends to HTTPS URL and trusts certificate

---

## 🖥 Dashboard Setup & Verification

### 1. Login and token flow
1. Open `http://localhost:<active-port>`
2. Login with admin account
3. Server sets an HttpOnly auth cookie for protected APIs

Compatibility note:
- API still accepts Bearer token in `Authorization` header for compatibility
- Dashboard primarily uses cookie session for browser security

### 2. APIs used by dashboard
- `GET /api/v1/android/data` for table/history
- `GET /api/v1/stats` for summary widgets/charts
- `GET /api/v1/android/data/stream` for live updates (SSE)

### 3. Verify real-time updates
1. Keep dashboard open
2. Send new record from mobile app
3. Confirm:
- New row appears in recent activity/data table
- Stats counters update
- Image appears if `photo` was included

### 4. Troubleshooting checklist
- If dashboard shows no data:
    - Check server logs for API errors
    - Verify `.env` points to the correct MySQL host/port/user/password/database
    - Confirm XAMPP MySQL service is running
    - If logs show `ECONNREFUSED`, check MySQL port and credentials
- If photo upload fails:
    - Ensure file is JPG/PNG/WEBP
    - Ensure file size <= 5MB
- If mobile app cannot connect:
    - On real device, replace `localhost` with PC IP (for same Wi-Fi)
    - Open firewall port for backend if required

---

## 🔐 Authentication & Security

### Security Features
- **JWT Middleware**: All admin/user endpoints are protected by signed JWT sessions.
- **HttpOnly Auth Cookie**: Login sets server-managed cookie to reduce token exposure in browser storage.
- **Encrypted Storage**: Passwords are never stored in plain text (bcrypt hashing).
- **Startup Security Validation**: Server fails fast if required security secrets are missing/weak.
- **Role-Based Access (RBAC)**:
    - `admin`: Full control over data, users, and system settings.
    - `user`: Read-only access to monitoring data and own profile.
- **Device Key Protection**: Android ingestion endpoint requires `X-Device-Key`.
- **Rate Limiting**: Global API limit + strict login attempt limit + data submission throttling.
- **Secure File Validation**: Strict MIME-type checking and file size limits for all uploads.

---

## 🗺 API Reference

### 🔐 Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Retrieve access token |
| `POST` | `/api/v1/auth/logout` | Clear session cookie |
| `GET` | `/api/v1/auth/me` | Get current user context |
| `POST` | `/api/v1/auth/change-password` | Update current user password |
| `PUT` | `/api/v1/auth/profile` | Update profile information |
| `POST` | `/api/v1/auth/profile/photo` | Upload profile photo |

### 👥 User Management (Admin Only)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/users` | List all system users |
| `POST` | `/api/v1/users` | Create a new user/employee |
| `PUT` | `/api/v1/users/:id` | Update specific user details |
| `DELETE` | `/api/v1/users/:id` | Remove user from system |

### 📱 Android Data
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/android/data` | `X-Device-Key` | Device data submission |
| `GET` | `/api/v1/android/data` | Session cookie or Bearer JWT | Fetch historical records |
| `GET` | `/api/v1/android/data/:id/plate-image` | Session cookie or Bearer JWT | Fetch stored plate image blob |
| `DELETE` | `/api/v1/android/data/:id` | Session cookie or Bearer JWT | Remove a single record |
| `GET` | `/api/v1/android/data/stream` | None | Real-time SSE Stream |

---

## 🧯 Troubleshooting

### Server started on 3001 instead of 3000
- Cause: Port 3000 is already in use by another process
- Behavior: Server auto-retries next ports (3001+)
- Action: Use the exact URL shown in server startup logs

### Login works but dashboard APIs fail
- Ensure browser allows cookies for localhost
- Confirm server and browser are using the same host and port
- If using custom client, send `Authorization: Bearer <token>` as fallback

### Android POST returns 401 Invalid device key
- Verify `DEVICE_API_KEY` in `.env`
- Verify mobile request sends `X-Device-Key` exactly

### MySQL connection refused
- Start MySQL in XAMPP
- Recheck `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

---

## 🌍 Internationalization
The dashboard fully supports **Thai** and **English**. Language toggles are available on the **Settings** page, updating the entire interface instantly without page reloads.

- **Primary Translation Engine**: `i18n.js`
- **Supported Locales**: `th` (Default), `en`

---

## 📄 License
Released under the [MIT License](LICENSE).

**PPP Green Complex** — Driving innovation in palm oil plantation management.
