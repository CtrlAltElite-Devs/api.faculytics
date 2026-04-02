-- Faculytics database initialization
-- Runs once on first Postgres container start via /docker-entrypoint-initdb.d/

CREATE DATABASE faculytics_staging;
CREATE DATABASE faculytics_prod;

\c faculytics_staging
CREATE EXTENSION IF NOT EXISTS vector;

\c faculytics_prod
CREATE EXTENSION IF NOT EXISTS vector;
