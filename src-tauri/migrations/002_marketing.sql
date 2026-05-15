-- Configuration du LLM utilisé pour la génération de contenu marketing
CREATE TABLE IF NOT EXISTS llm_config (
  id       TEXT PRIMARY KEY CHECK(id = 'default'),
  provider TEXT NOT NULL CHECK(provider IN ('anthropic', 'openai', 'gemini', 'ollama')),
  api_key  TEXT,
  base_url TEXT,
  model    TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Ligne unique pré-remplie ; INSERT OR IGNORE rend la migration idempotente
INSERT OR IGNORE INTO llm_config (id, provider, api_key, base_url, model, updated_at)
VALUES ('default', 'anthropic', NULL, NULL, 'claude-sonnet-4-5-20250929', datetime('now'));

-- Configuration par réseau social pour la génération de contenu
CREATE TABLE IF NOT EXISTS social_config (
  platform        TEXT PRIMARY KEY CHECK(platform IN ('linkedin', 'facebook', 'twitter')),
  system_prompt   TEXT NOT NULL DEFAULT '',
  tone            TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  updated_at      TEXT NOT NULL
);

-- Une ligne par plateforme avec des valeurs par défaut sensées ; idempotent grâce à OR IGNORE
INSERT OR IGNORE INTO social_config (platform, system_prompt, tone, target_audience, updated_at)
VALUES
  ('linkedin', 'Adopte un style professionnel et inspirant, avec des insights actionnables.', 'Professionnel et inspirant', 'Entrepreneurs, freelances et professionnels du numérique', datetime('now')),
  ('facebook', 'Adopte un style chaleureux et communautaire, favorisant les réactions et les partages.', 'Chaleureux et communautaire', 'Grand public et communauté entrepreneuriale', datetime('now')),
  ('twitter',  'Adopte un style direct, incisif et percutant. Privilégie une seule idée forte par tweet.', 'Direct et percutant', 'Professionnels tech et startups', datetime('now'));
