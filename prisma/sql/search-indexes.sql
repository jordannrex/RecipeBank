-- Trigram (pg_trgm) GIN indexes to accelerate the case-insensitive
-- `contains` (ILIKE '%q%') search used by GET /api/recipes.
-- Without these, that search is a sequential scan; with them, Postgres can
-- use the index for substring matches. Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS recipes_title_trgm
  ON recipes USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS recipes_description_trgm
  ON recipes USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS recipes_cuisine_trgm
  ON recipes USING gin (cuisine gin_trgm_ops);

CREATE INDEX IF NOT EXISTS recipes_dish_type_trgm
  ON recipes USING gin (dish_type gin_trgm_ops);

CREATE INDEX IF NOT EXISTS recipes_flavor_profile_trgm
  ON recipes USING gin (flavor_profile gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ingredients_name_trgm
  ON ingredients USING gin (name gin_trgm_ops);
