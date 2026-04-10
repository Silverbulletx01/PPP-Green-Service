# PPP Palm Service - API Integration Guide

คู่มือการเชื่อมต่อ Android Application กับ PPP Palm Service

## Base URL

```
http://YOUR_SERVER_IP:3000
```

> เปลี่ยน `YOUR_SERVER_IP` เป็น IP ของเครื่อง server ที่รัน เช่น `http://192.168.1.100:3000`

---

## 1. Authentication (การยืนยันตัวตน)

### Login - เข้าสู่ระบบ

```
POST /api/v1/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (สำเร็จ):**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "displayName": "Administrator"
    }
  }
}
```

> เก็บ `token` ไว้ใช้ใน header สำหรับ API ที่ต้องการ authentication

### Android (Kotlin) ตัวอย่าง Login:
```kotlin
val url = URL("http://YOUR_SERVER_IP:3000/api/v1/auth/login")
val conn = url.openConnection() as HttpURLConnection
conn.requestMethod = "POST"
conn.setRequestProperty("Content-Type", "application/json")
conn.doOutput = true

val body = """{"username":"admin","password":"admin123"}"""
conn.outputStream.write(body.toByteArray())

val response = conn.inputStream.bufferedReader().readText()
// Parse JSON → เก็บ token ไว้ใน SharedPreferences
```

---

## 2. ส่งข้อมูลจาก Android App (สำคัญที่สุด)

### วิธีที่ 1: ส่งแบบ JSON (ไม่มีรูปภาพ)

```
POST /api/v1/android/data
Content-Type: application/json
```

**Request Body:**
```json
{
  "license_plate": "กข 1234",
  "weight": 1500,
  "driver": "สมชาย",
  "notes": "ปาล์มสุก"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Data received successfully.",
  "data": {
    "id": 1,
    "receivedAt": "2024-01-15T10:30:00.000Z",
    "payload": {
      "license_plate": "กข 1234",
      "weight": 1500,
      "driver": "สมชาย",
      "notes": "ปาล์มสุก"
    }
  }
}
```

### Android (Kotlin) ตัวอย่าง ส่ง JSON:
```kotlin
fun sendData(licensePlate: String, weight: Int, driver: String) {
    Thread {
        val url = URL("http://YOUR_SERVER_IP:3000/api/v1/android/data")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true

        val json = JSONObject().apply {
            put("license_plate", licensePlate)
            put("weight", weight)
            put("driver", driver)
        }

        conn.outputStream.write(json.toString().toByteArray())

        val responseCode = conn.responseCode
        val response = conn.inputStream.bufferedReader().readText()
        Log.d("API", "Code: $responseCode, Response: $response")
    }.start()
}
```

---

### วิธีที่ 2: ส่งแบบ Multipart (พร้อมรูปภาพ)

```
POST /api/v1/android/data
Content-Type: multipart/form-data
```

**Form Fields:**
| Field     | Type   | Description                        |
|-----------|--------|------------------------------------|
| `photo`   | File   | ไฟล์รูปภาพ (JPG, PNG, WEBP ≤ 5MB) |
| `payload` | String | JSON string ของข้อมูลเพิ่มเติม     |

**Response:**
```json
{
  "success": true,
  "message": "Data received successfully.",
  "data": {
    "id": 2,
    "receivedAt": "2024-01-15T11:00:00.000Z",
    "payload": {
      "license_plate": "กข 5678",
      "weight": 2000,
      "photoUrl": "http://YOUR_SERVER_IP:3000/uploads/1705312800-photo.jpg",
      "photoOriginalName": "photo.jpg"
    }
  }
}
```

### Android (Kotlin) ตัวอย่าง ส่งพร้อมรูปภาพ:
```kotlin
fun sendDataWithPhoto(photoFile: File, licensePlate: String, weight: Int) {
    Thread {
        val boundary = "----Boundary${System.currentTimeMillis()}"
        val url = URL("http://YOUR_SERVER_IP:3000/api/v1/android/data")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        conn.doOutput = true

        val outputStream = conn.outputStream
        val writer = outputStream.bufferedWriter()

        // ส่วน payload (JSON string)
        val payload = JSONObject().apply {
            put("license_plate", licensePlate)
            put("weight", weight)
        }
        writer.write("--$boundary\r\n")
        writer.write("Content-Disposition: form-data; name=\"payload\"\r\n\r\n")
        writer.write("${payload.toString()}\r\n")

        // ส่วนรูปภาพ
        writer.write("--$boundary\r\n")
        writer.write("Content-Disposition: form-data; name=\"photo\"; filename=\"${photoFile.name}\"\r\n")
        writer.write("Content-Type: image/jpeg\r\n\r\n")
        writer.flush()
        photoFile.inputStream().copyTo(outputStream)
        outputStream.write("\r\n".toByteArray())

        // ปิด boundary
        writer.write("--$boundary--\r\n")
        writer.flush()
        writer.close()

        val responseCode = conn.responseCode
        val response = conn.inputStream.bufferedReader().readText()
        Log.d("API", "Code: $responseCode, Response: $response")
    }.start()
}
```

### ใช้กับ OkHttp (แนะนำ):
```kotlin
// build.gradle
// implementation("com.squareup.okhttp3:okhttp:4.12.0")

fun sendWithOkHttp(photoFile: File?, licensePlate: String, weight: Int) {
    val client = OkHttpClient()

    val builder = MultipartBody.Builder()
        .setType(MultipartBody.FORM)
        .addFormDataPart("payload", JSONObject().apply {
            put("license_plate", licensePlate)
            put("weight", weight)
        }.toString())

    // แนบรูปภาพ (ถ้ามี)
    photoFile?.let {
        val mediaType = "image/jpeg".toMediaType()
        builder.addFormDataPart("photo", it.name, it.asRequestBody(mediaType))
    }

    val request = Request.Builder()
        .url("http://YOUR_SERVER_IP:3000/api/v1/android/data")
        .post(builder.build())
        .build()

    client.newCall(request).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            Log.e("API", "Failed: ${e.message}")
        }
        override fun onResponse(call: Call, response: Response) {
            Log.d("API", "Success: ${response.body?.string()}")
        }
    })
}
```

### ใช้กับ Retrofit (แนะนำสำหรับโปรเจกต์ใหญ่):
```kotlin
// build.gradle
// implementation("com.squareup.retrofit2:retrofit:2.9.0")
// implementation("com.squareup.retrofit2:converter-gson:2.9.0")

interface PalmApi {
    @Multipart
    @POST("api/v1/android/data")
    suspend fun sendData(
        @Part photo: MultipartBody.Part?,
        @Part("payload") payload: RequestBody
    ): Response<ApiResponse>

    @POST("api/v1/auth/login")
    suspend fun login(@Body credentials: LoginRequest): Response<LoginResponse>
}

// Usage
val retrofit = Retrofit.Builder()
    .baseUrl("http://YOUR_SERVER_IP:3000/")
    .addConverterFactory(GsonConverterFactory.create())
    .build()

val api = retrofit.create(PalmApi::class.java)
```

---

## 3. ดึงข้อมูลทั้งหมด

```
GET /api/v1/android/data
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "abc123",
      "receivedAt": "2024-01-15T10:30:00.000Z",
      "payload": { "license_plate": "กข 1234", "weight": 1500 }
    }
  ]
}
```

---

## 4. ลบข้อมูล (ต้อง Login ก่อน)

```
DELETE /api/v1/android/data/:id
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "Record deleted."
}
```

---

## 5. ดูสถิติ Dashboard

```
GET /api/v1/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRecords": 150,
    "withPhotos": 45,
    "todayRecords": 12,
    "activeConnections": 3,
    "dailyStats": { "2024-01-09": 5, "2024-01-10": 8 },
    "hourlyStats": [0, 0, 0, 0, 0, 1, 3, 5, 8, 4, 2, 1, ...],
    "storageType": "In-Memory"
  }
}
```

---

## 6. Real-time Stream (SSE)

เชื่อมต่อเพื่อรับข้อมูลใหม่แบบ real-time:

```
GET /api/v1/android/data/stream
```

ข้อมูลจะถูกส่งมาเป็น Server-Sent Events:
- Event `connected` - เชื่อมต่อสำเร็จ
- Event `new-record` - มีข้อมูลใหม่เข้ามา
- Event `heartbeat` - ทุก 30 วินาที

### Android ตัวอย่าง SSE:
```kotlin
// ใช้ OkHttp SSE
val client = OkHttpClient.Builder()
    .readTimeout(0, TimeUnit.SECONDS)
    .build()

val request = Request.Builder()
    .url("http://YOUR_SERVER_IP:3000/api/v1/android/data/stream")
    .build()

val sse = EventSources.createFactory(client)
    .newEventSource(request, object : EventSourceListener() {
        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            when (type) {
                "new-record" -> {
                    // แสดง notification หรืออัปเดต UI
                    Log.d("SSE", "New record: $data")
                }
            }
        }
    })
```

---

## 7. Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "ppp-palm-service",
  "version": "2.0.0",
  "storage": "In-Memory",
  "uptime": 3600.5
}
```

---

## สรุป Endpoints ทั้งหมด

| Method   | Endpoint                         | Auth     | Description               |
|----------|----------------------------------|----------|---------------------------|
| `POST`   | `/api/v1/auth/login`             | ❌       | เข้าสู่ระบบ                |
| `GET`    | `/api/v1/auth/me`                | ✅ Token | ดูข้อมูลผู้ใช้               |
| `POST`   | `/api/v1/android/data`           | ❌       | **ส่งข้อมูลจาก Android**   |
| `GET`    | `/api/v1/android/data`           | ❌       | ดึงข้อมูลทั้งหมด            |
| `DELETE` | `/api/v1/android/data/:id`       | ✅ Token | ลบข้อมูล                   |
| `GET`    | `/api/v1/android/data/stream`    | ❌       | Real-time SSE stream      |
| `GET`    | `/api/v1/stats`                  | ❌       | สถิติ Dashboard            |
| `GET`    | `/health`                        | ❌       | Health check              |

---

## ขั้นตอนการเชื่อมต่อจาก Android App

1. **ตั้งค่า Network Permission** ใน `AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   ```

2. **อนุญาต HTTP (ถ้าไม่ใช้ HTTPS)** ใน `AndroidManifest.xml`:
   ```xml
   <application android:usesCleartextTraffic="true" ...>
   ```

3. **เพิ่ม Dependencies** ใน `build.gradle`:
   ```groovy
   implementation 'com.squareup.okhttp3:okhttp:4.12.0'
   implementation 'com.squareup.retrofit2:retrofit:2.9.0'
   implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
   ```

4. **เรียก API** ตาม endpoint ด้านบน - endpoint หลักคือ `POST /api/v1/android/data`

5. **ข้อมูลจะปรากฏบน Dashboard** แบบ real-time ทันที

> **หมายเหตุ:** `POST /api/v1/android/data` ไม่ต้องใช้ token — Android app สามารถส่งข้อมูลได้เลยโดยไม่ต้อง login
