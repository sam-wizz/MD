DO $$
BEGIN
  CREATE TYPE integration_scope AS ENUM ('branches.read', 'stock.read', 'consumption.read');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE external_map_source AS ENUM ('auto', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE reorder_suggestion_status AS ENUM ('pending_review', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE reorder_run_source AS ENUM ('manual', 'scheduled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE integration_adapter AS ENUM ('mock', 'hmztwsl');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE integration_audit_operation AS ENUM ('listBranches', 'getStockLevels', 'getConsumptionHistory');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS products (
  id serial PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  sales_unit text NOT NULL,
  cost_price numeric(10, 2) NOT NULL,
  sell_price numeric(10, 2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_consents (
  id serial PRIMARY KEY,
  client_id text NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  scope integration_scope NOT NULL,
  granted_at timestamp NOT NULL DEFAULT now(),
  granted_by text NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  revoked_at timestamp,
  revoked_by text REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_item_map (
  id serial PRIMARY KEY,
  client_id text NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  external_item_id text NOT NULL,
  external_item_name text NOT NULL,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_conversion_factor numeric(14, 6) NOT NULL DEFAULT 1,
  confidence numeric(5, 4) NOT NULL DEFAULT 0,
  mapped_by external_map_source NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_reorder_policy (
  client_id text PRIMARY KEY REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  default_branch_id text,
  lookback_days integer NOT NULL DEFAULT 7,
  lead_time_days integer NOT NULL DEFAULT 1,
  safety_stock_ratio numeric(6, 4) NOT NULL DEFAULT 0.2,
  coverage_days integer NOT NULL DEFAULT 3,
  rounding_step numeric(10, 4) NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reorder_suggestions (
  id serial PRIMARY KEY,
  client_id text NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  branch_id text NOT NULL,
  branch_name text NOT NULL,
  status reorder_suggestion_status NOT NULL DEFAULT 'pending_review',
  run_source reorder_run_source NOT NULL DEFAULT 'manual',
  generated_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp,
  reviewed_by text REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  approved_order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  missing_mapping_count integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reorder_suggestion_items (
  id serial PRIMARY KEY,
  suggestion_id integer NOT NULL REFERENCES reorder_suggestions(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name_snapshot text NOT NULL,
  product_category_snapshot text NOT NULL,
  external_item_id text NOT NULL,
  external_item_name text NOT NULL,
  unit_snapshot text NOT NULL,
  current_stock numeric(14, 4) NOT NULL,
  avg_daily_consumption numeric(14, 4) NOT NULL,
  reorder_point numeric(14, 4) NOT NULL,
  suggested_qty_raw numeric(14, 4) NOT NULL,
  suggested_qty_rounded numeric(14, 4) NOT NULL,
  editable_qty numeric(14, 4) NOT NULL,
  editable_unit_price numeric(10, 2) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reorder_unmapped_items (
  id serial PRIMARY KEY,
  suggestion_id integer NOT NULL REFERENCES reorder_suggestions(id) ON DELETE CASCADE,
  external_item_id text NOT NULL,
  external_item_name text NOT NULL,
  reason text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_audit_log (
  id serial PRIMARY KEY,
  client_id text NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  consent_id integer REFERENCES integration_consents(id) ON DELETE SET NULL,
  adapter integration_adapter NOT NULL,
  operation integration_audit_operation NOT NULL,
  scope integration_scope NOT NULL,
  branch_id text,
  request_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  success boolean NOT NULL,
  error_message text,
  duration_ms integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_consents_client_idx
  ON integration_consents (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS integration_consents_active_scope_idx
  ON integration_consents (client_id, scope)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS external_item_map_client_idx
  ON external_item_map (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS external_item_map_active_idx
  ON external_item_map (client_id, external_item_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS reorder_suggestions_client_idx
  ON reorder_suggestions (client_id, status);

CREATE INDEX IF NOT EXISTS reorder_suggestion_items_suggestion_idx
  ON reorder_suggestion_items (suggestion_id);

CREATE INDEX IF NOT EXISTS reorder_unmapped_items_suggestion_idx
  ON reorder_unmapped_items (suggestion_id);

CREATE INDEX IF NOT EXISTS integration_audit_client_created_idx
  ON integration_audit_log (client_id, created_at);
