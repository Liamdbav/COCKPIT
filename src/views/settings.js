import { applyTheme } from '../main.js';

const SETTINGS_KEY = 'cockpit_settings';
const invoke = (...args) => window.__TAURI__.core.invoke(...args);

const MODEL_PLACEHOLDERS = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai:    'gpt-4o',
  gemini:    'gemini-1.5-pro',
  ollama:    'llama3',
};

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {};
  } catch (_) { return {}; }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

export async function renderSettings(container) {
  const settings = loadSettings();
  const isLight  = settings.theme === 'light';

  container.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">Paramètres</h1>
    </div>
    <div class="section-content settings-content">

      <div class="settings-section open" data-section="appearance">
        <button class="settings-section-header" aria-expanded="true">
          <span class="settings-section-title">Apparence</span>
          <span class="settings-section-chevron">›</span>
        </button>
        <div class="settings-section-body">
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">Mode clair</span>
              <span class="settings-row-desc">Bascule entre le thème sombre et clair</span>
            </div>
            <label class="theme-switch">
              <input type="checkbox" id="theme-toggle" ${isLight ? 'checked' : ''}>
              <span class="theme-switch-track">
                <span class="theme-switch-thumb"></span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-section" data-section="llm">
        <button class="settings-section-header" aria-expanded="false">
          <span class="settings-section-title">Modèle IA</span>
          <span class="settings-section-chevron">›</span>
        </button>
        <div class="settings-section-body">
          <div class="settings-form">
            <div class="settings-form-row">
              <label class="detail-label" for="llm-provider">Provider</label>
              <select class="input" id="llm-provider">
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
            <div class="settings-form-row">
              <label class="detail-label" for="llm-api-key">Clé API</label>
              <div class="input-action-row">
                <input class="input" type="password" id="llm-api-key" placeholder="sk-…" autocomplete="off">
                <button class="btn btn-sm" id="llm-api-key-toggle" type="button">Afficher</button>
              </div>
            </div>
            <div class="settings-form-row" id="llm-base-url-row" style="display:none">
              <label class="detail-label" for="llm-base-url">URL de base</label>
              <input class="input" type="text" id="llm-base-url" placeholder="http://localhost:11434">
            </div>
            <div class="settings-form-row">
              <label class="detail-label" for="llm-model">Modèle</label>
              <input class="input" type="text" id="llm-model" placeholder="claude-sonnet-4-5-20250929">
            </div>
            <div class="llm-test-row">
              <button class="btn" id="llm-test-btn" type="button">Tester la connexion</button>
              <span class="llm-test-result" id="llm-test-result"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section" data-section="social">
        <button class="settings-section-header" aria-expanded="false">
          <span class="settings-section-title">Réseaux sociaux</span>
          <span class="settings-section-chevron">›</span>
        </button>
        <div class="settings-section-body">
          <div class="social-sections">
            ${['linkedin', 'facebook', 'twitter'].map(p => `
            <div class="social-sub" data-platform="${p}">
              <div class="social-sub-title">${p.charAt(0).toUpperCase() + p.slice(1)}</div>
              <div class="settings-form">
                <div class="settings-form-row">
                  <label class="detail-label">Prompt système</label>
                  <textarea class="input" data-field="system_prompt" style="min-height:120px;resize:vertical" placeholder="Ton rôle et tes instructions pour ce réseau…"></textarea>
                </div>
                <div class="settings-form-row">
                  <label class="detail-label">Ton</label>
                  <input class="input" type="text" data-field="tone" placeholder="ex : professionnel, inspirant…">
                </div>
                <div class="settings-form-row">
                  <label class="detail-label">Audience cible</label>
                  <input class="input" type="text" data-field="target_audience" placeholder="ex : entrepreneurs, DSI…">
                </div>
              </div>
            </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="settings-section" data-section="about">
        <button class="settings-section-header" aria-expanded="false">
          <span class="settings-section-title">À propos</span>
          <span class="settings-section-chevron">›</span>
        </button>
        <div class="settings-section-body">
          <div class="terminal-block" id="terminal-about">
            <span class="terminal-line dim">$ cockpit --version</span>
            <span class="terminal-line accent" id="terminal-version">Cockpit 0.1.0</span>
            <span class="terminal-line dim">$ cockpit --info</span>
            <span class="terminal-line">Backend    <span class="terminal-value">Rust + Tauri v2</span></span>
            <span class="terminal-line">Données    <span class="terminal-value">SQLite (bundled)</span></span>
            <span class="terminal-line">Frontend   <span class="terminal-value">Vanilla JS — pas de framework</span></span>
            <span class="terminal-line">Identifiant <span class="terminal-value">dev.cockpit.app</span></span>
          </div>
        </div>
      </div>

    </div>
  `;

  bindSections(container);
  bindThemeToggle(container);
  loadVersion(container);
  await loadLlmConfig(container);
  await loadSocialConfigs(container);
  bindLlmFields(container);
  bindSocialFields(container);
}

// ── Sections expandables ──────────────────────────────────────────────────────

function bindSections(container) {
  container.querySelectorAll('.settings-section-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.settings-section');
      const isOpen  = section.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  });
}

// ── Toggle thème ──────────────────────────────────────────────────────────────

function bindThemeToggle(container) {
  container.querySelector('#theme-toggle').addEventListener('change', (e) => {
    const theme = e.target.checked ? 'light' : 'dark';
    applyTheme(theme);
    const settings = loadSettings();
    saveSettings({ ...settings, theme });
  });
}

// ── Version Tauri ─────────────────────────────────────────────────────────────

async function loadVersion(container) {
  try {
    const version = await window.__TAURI__.app.getVersion();
    const el = container.querySelector('#terminal-version');
    if (el) el.textContent = `Cockpit ${version}`;
  } catch (_) { /* reste sur la valeur statique */ }
}

// ── Configuration LLM ─────────────────────────────────────────────────────────

async function loadLlmConfig(container) {
  try {
    const cfg = await invoke('get_llm_config');
    container.querySelector('#llm-provider').value  = cfg.provider ?? 'anthropic';
    // La clé n'est jamais renvoyée en clair — on indique juste si une clé est déjà enregistrée
    const apiKeyInput = container.querySelector('#llm-api-key');
    apiKeyInput.value = '';
    apiKeyInput.placeholder = cfg.has_api_key
      ? '••••••••  (clé enregistrée — saisir pour remplacer)'
      : 'sk-…';
    container.querySelector('#llm-base-url').value  = cfg.base_url ?? '';
    container.querySelector('#llm-model').value     = cfg.model    ?? '';
    updateProviderUI(container, cfg.provider ?? 'anthropic');
  } catch (_) { /* DB pas encore prête, on laisse les valeurs par défaut */ }
}

function updateProviderUI(container, provider) {
  const baseUrlRow = container.querySelector('#llm-base-url-row');
  const modelInput = container.querySelector('#llm-model');
  baseUrlRow.style.display = provider === 'ollama' ? '' : 'none';
  // On met à jour le placeholder seulement si le champ est vide
  if (!modelInput.value) {
    modelInput.placeholder = MODEL_PLACEHOLDERS[provider] ?? '';
  }
}

async function saveLlmConfig(container) {
  const provider = container.querySelector('#llm-provider').value;
  const api_key  = container.querySelector('#llm-api-key').value || null;
  const base_url = container.querySelector('#llm-base-url').value || null;
  const model    = container.querySelector('#llm-model').value;
  try {
    await invoke('save_llm_config', {
      payload: {
        id: 'default',
        provider,
        api_key,
        base_url,
        model,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (_) {}
}

function bindLlmFields(container) {
  const providerSel  = container.querySelector('#llm-provider');
  const apiKeyInput  = container.querySelector('#llm-api-key');
  const toggleBtn    = container.querySelector('#llm-api-key-toggle');
  const baseUrlInput = container.querySelector('#llm-base-url');
  const modelInput   = container.querySelector('#llm-model');
  const testBtn      = container.querySelector('#llm-test-btn');
  const testResult   = container.querySelector('#llm-test-result');

  providerSel.addEventListener('change', () => {
    updateProviderUI(container, providerSel.value);
    saveLlmConfig(container);
  });

  toggleBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleBtn.textContent = isPassword ? 'Masquer' : 'Afficher';
  });

  // La clé est traitée séparément : on efface le champ après sauvegarde pour ne pas la laisser visible
  apiKeyInput.addEventListener('blur', async () => {
    const hadValue = apiKeyInput.value.trim().length > 0;
    await saveLlmConfig(container);
    if (hadValue) {
      apiKeyInput.value = '';
      apiKeyInput.type = 'password';
      toggleBtn.textContent = 'Afficher';
      apiKeyInput.placeholder = '••••••••  (clé enregistrée — saisir pour remplacer)';
    }
  });

  [baseUrlInput, modelInput].forEach(input => {
    input.addEventListener('blur', () => saveLlmConfig(container));
  });

  testBtn.addEventListener('click', async () => {
    testResult.textContent = '';
    testResult.className   = 'llm-test-result';
    testBtn.disabled = true;
    testBtn.textContent = 'Test en cours…';
    try {
      // Sauvegarde d'abord pour que le backend lise les valeurs courantes du formulaire
      await saveLlmConfig(container);
      // Efface la clé si l'utilisateur venait de la saisir
      if (apiKeyInput.value.trim()) {
        apiKeyInput.value = '';
        apiKeyInput.type = 'password';
        toggleBtn.textContent = 'Afficher';
        apiKeyInput.placeholder = '••••••••  (clé enregistrée — saisir pour remplacer)';
      }
      const msg = await invoke('test_llm_connection');
      testResult.textContent = msg;
      testResult.classList.add('llm-test-ok');
    } catch (err) {
      testResult.textContent = typeof err === 'string' ? err : (err.message ?? 'Erreur inconnue');
      testResult.classList.add('llm-test-err');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Tester la connexion';
    }
  });
}

// ── Configuration réseaux sociaux ─────────────────────────────────────────────

async function loadSocialConfigs(container) {
  for (const platform of ['linkedin', 'facebook', 'twitter']) {
    try {
      const cfg = await invoke('get_social_config', { platform });
      const sub = container.querySelector(`.social-sub[data-platform="${platform}"]`);
      if (!sub) continue;
      sub.querySelector('[data-field="system_prompt"]').value   = cfg.system_prompt   ?? '';
      sub.querySelector('[data-field="tone"]').value            = cfg.tone            ?? '';
      sub.querySelector('[data-field="target_audience"]').value = cfg.target_audience ?? '';
    } catch (_) {}
  }
}

async function saveSocialConfig(platform, container) {
  const sub = container.querySelector(`.social-sub[data-platform="${platform}"]`);
  if (!sub) return;
  const system_prompt   = sub.querySelector('[data-field="system_prompt"]').value;
  const tone            = sub.querySelector('[data-field="tone"]').value;
  const target_audience = sub.querySelector('[data-field="target_audience"]').value;
  try {
    await invoke('save_social_config', {
      platform,
      payload: {
        platform,
        system_prompt,
        tone,
        target_audience,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (_) {}
}

function bindSocialFields(container) {
  for (const platform of ['linkedin', 'facebook', 'twitter']) {
    const sub = container.querySelector(`.social-sub[data-platform="${platform}"]`);
    if (!sub) continue;
    sub.querySelectorAll('.input').forEach(input => {
      input.addEventListener('blur', () => saveSocialConfig(platform, container));
    });
  }
}
