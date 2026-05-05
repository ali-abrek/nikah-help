-- 0001_enums.sql
-- Phase 1: Extensions and all ENUM types used across the schema

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enum types
CREATE TYPE user_role            AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE gender_type          AS ENUM ('male', 'female');
CREATE TYPE ai_bio_status        AS ENUM ('ready', 'regenerating', 'rate_limited');
CREATE TYPE photo_status         AS ENUM ('pending', 'uploaded', 'processing', 'processed');
CREATE TYPE moderation_status    AS ENUM ('queued', 'approved', 'rejected', 'manual_review');
CREATE TYPE message_type         AS ENUM ('text', 'image', 'voice');
CREATE TYPE message_status       AS ENUM ('sent', 'delivered', 'read');
CREATE TYPE notification_status  AS ENUM ('unread', 'read');
CREATE TYPE report_type          AS ENUM ('profile', 'photo');
CREATE TYPE report_status        AS ENUM ('new', 'in_progress', 'resolved');
CREATE TYPE subscription_status  AS ENUM ('active', 'expired', 'cancelled', 'inactive');
CREATE TYPE push_kind            AS ENUM ('web', 'apns', 'fcm');
CREATE TYPE suspension_kind      AS ENUM ('warning', 'temp_ban', 'permanent_ban');
