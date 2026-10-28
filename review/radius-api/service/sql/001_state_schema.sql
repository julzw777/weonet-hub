-- Weonet RADIUS Provisioning API state schema. Run ONCE as a DB administrator (not as the API account).
-- Replace weonet_api if RADIUS_STATE_DB_NAME differs. Does not modify any FreeRADIUS/daloRADIUS table.
CREATE DATABASE IF NOT EXISTS weonet_api CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- Stable subscriber identity owned by the API. daloRADIUS userinfo is NOT used as identity (nullable, non-unique).
CREATE TABLE IF NOT EXISTS weonet_api.subscriber (
  seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  id CHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  status ENUM('active','suspended') NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NULL
) ENGINE=InnoDB;

-- Operator-maintained mapping from API plan to an existing FreeRADIUS group (radgroupcheck/radgroupreply).
CREATE TABLE IF NOT EXISTS weonet_api.plan (
  seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  groupname VARCHAR(64) NOT NULL UNIQUE,
  speed_profile VARCHAR(64) NOT NULL,
  session_limit INT NOT NULL CHECK (session_limit BETWEEN 1 AND 100),
  expiry_days INT NOT NULL DEFAULT 0 CHECK (expiry_days BETWEEN 0 AND 3650),
  enabled TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- Durable idempotency. Credentials are never stored; reset-password replays are refused.
CREATE TABLE IF NOT EXISTS weonet_api.idempotency (
  idem_key CHAR(36) NOT NULL PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  operation VARCHAR(32) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status SMALLINT NOT NULL,
  response_body MEDIUMTEXT NULL,
  credential_issued TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

-- Append-only audit (API account gets INSERT/SELECT only).
CREATE TABLE IF NOT EXISTS weonet_api.audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  service_subject VARCHAR(200) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  actor_roles VARCHAR(64) NOT NULL,
  operation VARCHAR(32) NOT NULL,
  target VARCHAR(64) NULL,
  request_id CHAR(36) NOT NULL,
  idempotency_key CHAR(36) NULL,
  outcome ENUM('started','applied','rejected','failed','denied','unknown') NOT NULL,
  code VARCHAR(64) NOT NULL,
  detail VARCHAR(512) NULL,
  KEY (request_id), KEY (actor_id, at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS weonet_api.token_jti (
  jti CHAR(36) NOT NULL PRIMARY KEY,
  expires_at DATETIME(3) NOT NULL,
  KEY (expires_at)
) ENGINE=InnoDB;
