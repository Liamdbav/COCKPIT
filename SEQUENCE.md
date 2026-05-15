# SEQUENCE.md — Pilotage de construction du projet "Cockpit"

## Principe
Construction en 10 prompts isolés P0→P9. Chaque prompt est rédigé en détail
JUSTE AVANT son lancement, contre le codebase réel produit par le précédent.
Un prompt validé = section "Statut" passée à FAIT + note de ce qui a été produit.

## Règle de validation entre prompts
Aucun prompt n'est lancé tant que le précédent n'a pas :
- `cargo check` sans erreur (sortie collée dans la note)
- résultat observable confirmé
- pour les prompts Rust : lecture du code faite et comprise

## Carte de la séquence

| Prompt | Objectif | Dépend de | Statut |
|--------|----------|-----------|--------|
| P0 | Scaffolding Tauri v2 + CLAUDE.md + contrat de design | — | À FAIRE |
| P1 | Couche données : schéma SQLite, module db, structs models.rs | P0 | EN ATTENTE |
| P2 | Commandes Rust CRUD Clients | P1 | EN ATTENTE |
| P3 | Commandes Rust Projets + Chantiers + logique statut/archivage | P2 | EN ATTENTE |
| P4 | Shell frontend : nav 4 onglets + activation contrat de design | P3 | EN ATTENTE |
| P5 | Onglet Dashboard : projets en cours, fiche projet, commentaire chantier | P4 | EN ATTENTE |
| P6 | Onglet Clients : liste, surbrillance client actif, fiche détaillée | P5 | EN ATTENTE |
| P7 | Onglet Projets : archives + historique chantiers documenté | P6 | EN ATTENTE |
| P8 | Onglet Paramètres : gestion thème, persistance préférences | P7 | EN ATTENTE |
| P9 | Polish : animations concrètes, tauri build, packaging self-hosted | P8 | EN ATTENTE |

## Intentions par prompt (à transformer en prompt détaillé au lancement)

### P1 — Couche données
Créer le schéma SQLite (tables : clients, projets, chantiers + relations),
le module `db.rs` (ouverture connexion, init du schéma au démarrage),
les structs Rust correspondantes dans `models.rs` avec dérive serde.
Aucune commande Tauri encore, aucune UI. cargo check vert exigé.

### P2 — Commandes CRUD Clients
Commandes #[tauri::command] : create_client, list_clients, get_client.
Convention de gestion d'erreur posée ici (Result<T, String> ou type dédié).
Enregistrement des commandes dans le handler Tauri. cargo check vert.

### P3 — Commandes Projets + Chantiers
Commandes projets (création, liste par statut, changement de statut,
archivage quand "livré"), commandes chantiers (ajout d'étape documentée
à un projet). Requêtes avec jointure client↔projet. cargo check vert.

### P4 — Shell frontend
Navigation 4 onglets (Dashboard, Clients, Projets, Paramètres).
Activation du contrat de design du CLAUDE.md : fenêtre Tauri transparente,
fichier de tokens CSS (couleurs néon, espacements, durées), structure
de composants. Pas encore de données affichées — juste le squelette stylé.

### P5 — Onglet Dashboard
Câble list_active_projects + le client associé. Fiche projet cliquable
avec les 4 zones de commentaire de chantier (état, dernières actions,
actions du dernier build, défis à venir). Changement de statut prévu→
en cours→livré. "Livré" retire le projet du dashboard.

### P6 — Onglet Clients
Liste complète, surbrillance des lignes dont un projet est en cours,
fiche client cliquable (identité/coordonnées + historique projets+chantiers).

### P7 — Onglet Projets
Archive de tous les projets, chacun avec son historique de chantiers
documenté étape par étape.

### P8 — Onglet Paramètres
Gestion du thème, persistance des préférences (table settings ou fichier
de config Tauri). Onglet pensé pour accueillir des features futures.

### P9 — Polish & livraison
Animations concrètes (à spécifier précisément à ce moment-là, pas avant).
tauri build, packaging self-hosted, vérification du binaire de release.

## Journal d'avancement
(à remplir après chaque prompt : ce qui a été produit, structs/commandes
créées, décisions prises — c'est CE journal qui rend le prompt suivant précis)

- P0 : ...
