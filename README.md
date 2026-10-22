# Irizée Studio

Plateforme de création de shootings photo IA pour le site et les réseaux d'Irizée : produit + images d'inspiration + consigne → plusieurs variantes contrôlées automatiquement, avec corrections, mannequins, bibliothèque de concepts, déclinaison en formats et validation avant publication.

**Stack** : Next.js 14 (App Router) · Supabase (Postgres, Auth, Storage) · Vercel · Gemini (images + contrôle qualité).

## Rôles

| Rôle | Accès |
|---|---|
| `admin` | Tout : produits, mannequins, règles de marque, projets, équipe & quotas, validation |
| `employee` (Équipe Irizée) | Shootings, produits, mannequins, bibliothèque, validation |
| `creator` (Créateur / agence) | Uniquement les produits des projets auxquels il est assigné ; soumet ses images à validation |

Le premier compte créé devient `admin`. Les suivants sont `creator` sans aucun accès jusqu'à ce que l'admin les ajoute à un projet (page *Projets*). Toute la sécurité repose sur les règles RLS de Supabase (voir `supabase/migrations`).

## Lancer en local

```bash
cp .env.local.example .env.local   # renseigner les clés
npm install
npm run dev
```

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Connexion Supabase (publiques) |
| `GEMINI_API_KEY` | Clé Google AI Studio, **serveur uniquement** |
| `SUPABASE_SERVICE_ROLE_KEY` | Optionnel : active les invitations par email dans *Équipe* |

## Fonctionnement d'un shooting

1. `POST /api/shoots` crée le shooting et N images (état `generating`), après analyse des inspirations.
2. Le navigateur appelle `POST /api/images/[id]/generate` puis `/qc` pour chaque image (3 en parallèle) : une génération par requête, pour rester sous les limites de durée de Vercel.
3. Corrections (`/correct`), réparation d'étiquette et déclinaisons de format (`/formats`) créent de nouvelles images liées à l'image d'origine.
4. Le quota mensuel de chaque utilisateur est vérifié avant chaque génération.

## Base de données

Les migrations sont dans `supabase/migrations/`. Elles ont été appliquées au projet Supabase `irizee-studio`.
