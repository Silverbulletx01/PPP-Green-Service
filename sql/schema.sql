-- PPP Green Service MySQL schema
-- Run this file manually in phpMyAdmin if you do not want auto-create on server startup.

CREATE DATABASE IF NOT EXISTS ppp_green_service
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ppp_green_service;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS android_data (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  received_at DATETIME NOT NULL,
  payload LONGTEXT NOT NULL,
  plate_image LONGBLOB NULL,
  plate_image_mime VARCHAR(100) NULL,
  plate_image_name VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_android_data_received_at (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
