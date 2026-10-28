-- Least-privilege API account. Run as a DB administrator. Replace <API_HOST_PATTERN> with the
-- Docker network subnet pattern of the API container (never '%') and supply the password
-- interactively; never commit it. Replace `radius` / `weonet_api` if names differ.
CREATE USER IF NOT EXISTS 'weonet_api'@'<API_HOST_PATTERN>' IDENTIFIED BY '<SET_INTERACTIVELY>';

-- FreeRADIUS tables: only what the API writes/reads. No DDL, no userbillinfo, no userinfo.
GRANT SELECT, INSERT, UPDATE, DELETE ON radius.radcheck      TO 'weonet_api'@'<API_HOST_PATTERN>';
GRANT SELECT, INSERT, DELETE         ON radius.radusergroup  TO 'weonet_api'@'<API_HOST_PATTERN>';
GRANT SELECT                         ON radius.radgroupcheck TO 'weonet_api'@'<API_HOST_PATTERN>';
GRANT SELECT                         ON radius.radgroupreply TO 'weonet_api'@'<API_HOST_PATTERN>';
GRANT SELECT                         ON radius.radacct       TO 'weonet_api'@'<API_HOST_PATTERN>';
-- NAS: column-level grant so the shared secret column is unreadable.
GRANT SELECT (id, nasname, shortname) ON radius.nas          TO 'weonet_api'@'<API_HOST_PATTERN>';

-- API state schema.
GRANT SELECT, INSERT, UPDATE ON weonet_api.subscriber  TO 'weonet_api'@'<API_HOST_PATTERN>';
GRANT SELECT                 ON weonet_api.plan        TO 'weonet_api'@'<API_HOST_PATTERN>';
GRANT SELECT, INSERT         ON weonet_api.idempotency TO 'weonet_api'@'<API_HOST_PATTERN>';
GRANT SELECT, INSERT         ON weonet_api.audit_log   TO 'weonet_api'@'<API_HOST_PATTERN>';
GRANT SELECT, INSERT, DELETE ON weonet_api.token_jti   TO 'weonet_api'@'<API_HOST_PATTERN>';
