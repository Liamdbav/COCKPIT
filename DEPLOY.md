# Déploiement — Cockpit

Ce guide couvre l'installation permanente de Cockpit sur macOS et Linux (Fedora / Debian).

---

## macOS

### 1. Builder l'application

Depuis la racine du projet, sur le MacBook (display requis) :

```bash
cargo tauri build
```

Le bundle est généré dans :

```
src-tauri/target/release/bundle/macos/Cockpit.app
src-tauri/target/release/bundle/dmg/Cockpit_1.1.0_aarch64.dmg
```

### 2. Installer

**Option A — via le DMG (recommandé)**

```bash
open src-tauri/target/release/bundle/dmg/Cockpit_*.dmg
# Glisser Cockpit.app dans /Applications dans la fenêtre qui s'ouvre
```

**Option B — copie directe**

```bash
cp -R src-tauri/target/release/bundle/macos/Cockpit.app /Applications/
```

### 3. Premier lancement

macOS bloque les apps non signées. Au premier lancement :

```
Finder → clic droit sur Cockpit.app → Ouvrir → Ouvrir quand même
```

Ou via terminal (une seule fois) :

```bash
xattr -dr com.apple.quarantine /Applications/Cockpit.app
```

### Désinstaller

```bash
rm -rf /Applications/Cockpit.app
# Les données sont conservées dans :
# ~/Library/Application Support/dev.cockpit.app/
# Supprimer ce dossier efface la base SQLite.
rm -rf ~/Library/Application\ Support/dev.cockpit.app/
```

---

## Linux (Fedora)

Le build sur Fedora se fait en headless — pas de `cargo tauri dev`, uniquement `cargo tauri build`.

### Prérequis système

```bash
# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel

# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libssl-dev curl wget file \
  libayatana-appindicator3-dev librsvg2-dev
```

### 1. Builder

```bash
cargo tauri build
```

Les bundles sont générés dans :

```
src-tauri/target/release/bundle/rpm/cockpit_1.1.0-1.x86_64.rpm   ← Fedora
src-tauri/target/release/bundle/deb/cockpit_1.1.0_amd64.deb      ← Debian/Ubuntu
src-tauri/target/release/bundle/appimage/cockpit_1.1.0.AppImage   ← universel
```

### 2. Installer

**Fedora (RPM)**

```bash
sudo dnf install src-tauri/target/release/bundle/rpm/cockpit_*.rpm
```

**Debian / Ubuntu**

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/cockpit_*.deb
```

**AppImage (toutes distros, sans installation)**

```bash
chmod +x src-tauri/target/release/bundle/appimage/cockpit_*.AppImage
./cockpit_*.AppImage
# Pour l'intégrer au menu d'applications :
cp cockpit_*.AppImage ~/.local/bin/cockpit
```

### Désinstaller

```bash
# Fedora
sudo dnf remove cockpit

# Debian / Ubuntu
sudo dpkg -r cockpit

# Données SQLite
rm -rf ~/.local/share/dev.cockpit.app/
```

---

## Emplacement des données

La base SQLite est créée automatiquement au premier lancement. Elle n'est jamais touchée par une mise à jour du binaire.

| Système | Chemin |
|---------|--------|
| macOS | `~/Library/Application Support/dev.cockpit.app/cockpit.db` |
| Linux | `~/.local/share/dev.cockpit.app/cockpit.db` |

**Sauvegarder les données :**

```bash
# macOS
cp ~/Library/Application\ Support/dev.cockpit.app/cockpit.db ~/cockpit_backup.db

# Linux
cp ~/.local/share/dev.cockpit.app/cockpit.db ~/cockpit_backup.db
```

---

## Mettre à jour

Il n'y a pas d'auto-update. Pour mettre à jour :

1. Rebuilder (`cargo tauri build`) depuis les sources à jour
2. Réinstaller avec la même méthode qu'à l'installation initiale
3. Les données SQLite sont préservées automatiquement
