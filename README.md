# Auto-École Wissous — site vitrine

Site statique (HTML, CSS, JavaScript, sans dépendance ni étape de build) pour une auto-école basée à Wissous (91).

## Forfaits présentés

| Formation | Forfait | Prix |
| --- | --- | --- |
| Permis B, boîte manuelle | 20 heures | 1 000 € |
| Permis B, boîte manuelle | 30 heures | 1 400 € |
| Permis B, boîte automatique | 13 heures | 1 000 € |
| Permis B, boîte automatique | 20 heures | 1 400 € |
| Permis moto A2 | 20 heures (8 h plateau + 12 h circulation) | 790 € |

## Structure

```
index.html            Page unique : accueil, forfaits, moto, questions, contact
assets/css/styles.css Styles (thème clair et sombre automatiques)
assets/js/main.js     Menu mobile, formulaire de contact, effets au défilement
assets/favicon.svg    Icône de l'onglet
```

## À personnaliser avant la mise en ligne

- **Nom** : « Auto-École Wissous » est un nom provisoire (balise `<title>`, en-tête, pied de page, données `ld+json` dans `index.html`).
- **Téléphone** : `01 00 00 00 00` est un numéro fictif (section Contact de `index.html`).
- **E-mail** : `contact@example.com` est une adresse fictive, à remplacer dans `index.html` **et** dans `CONTACT_EMAIL` en haut de `assets/js/main.js`.
- **Adresse** : seule la ville est indiquée ; ajoutez le numéro et la rue si besoin.
- **Mentions légales** : obligatoires pour un site professionnel en France (éditeur, SIRET, hébergeur), à ajouter.

Le formulaire de contact n'a pas besoin de serveur : il ouvre la messagerie du visiteur avec la demande pré-remplie. Pour recevoir les demandes directement, branchez-le à un service de formulaires (Formspree, Netlify Forms…).

## Aperçu local

Ouvrez `index.html` dans un navigateur, ou lancez un petit serveur :

```
python3 -m http.server 8000
```

## Mise en ligne

N'importe quel hébergement statique convient : GitHub Pages (Settings → Pages → branche et dossier racine), Netlify, Vercel, OVH…
