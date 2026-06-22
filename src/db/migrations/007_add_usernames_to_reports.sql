-- H9: en algunos entornos la tabla `reports` ya existía de un intento anterior
-- (sin columnas de username denormalizado), por lo que 006_create_reports.sql
-- no la recreó (usa CREATE TABLE IF NOT EXISTS). Esta migración la pone al día.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_username VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reported_username VARCHAR(255) NOT NULL DEFAULT '';
