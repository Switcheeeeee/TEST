# Auto-École Wissous — site vitrine

Site statique (HTML, CSS, JavaScript, sans dépendance ni étape de build) pour une auto-école basée à Wissous (91).

## Forfaits présentés

| Formation | Forfait | Prix |
| --- | --- | --- |
| Permis B, boîte manuelle | 20 heures | 1 000 € |
| Permis B, boîte manuelle | 30 heures | 1 400 € |
| Permis B, boîte automatique | 13 heures | 1 000 € |
| Permis B, boîte automatique | 20 heures | 1 400 € |
| Option conduite accompagnée | en plus d'un forfait voiture | +200 € |
| Option conduite supervisée | en plus d'un forfait voiture | +200 € |
| Passerelle boîte automatique → manuelle (B78 → B) | 7 heures | 400 € |
| Permis moto A2 | 20 heures (8 h plateau + 12 h circulation) | 790 € |
| Passerelle moto A2 → A | 7 heures | 300 € |
| Formation 125 cm³ | 7 heures | 400 € |

Les prix sont repris à trois endroits : les cartes de `index.html`, les options du formulaire (attribut `data-price`) et les données `ld+json` en tête de page.

## Animations

- **Accueil** : scène 3D en CSS (route en perspective, arbres qui défilent, voiture d'auto-école). Sur ordinateur, la voiture suit la souris ; sur mobile, elle se balance seule.
- **Boîte manuelle** : grille de vitesses animée (1 → 5).
- **Boîte automatique** : sélecteur P R N D animé.
- **Moto** : slalom de plateau vu du dessus.
- **Cartes** : effet 3D qui suit la souris, avec reflet.
- **Défilement** : apparition des blocs, compteurs d'heures, bandeau défilant.

Toutes les animations s'arrêtent si le visiteur a activé « réduire les animations » sur son appareil.

## Structure

```
index.html            Page unique : accueil, forfaits, options, moto, passerelles, questions, contact
assets/css/styles.css Styles (thème clair et sombre automatiques)
assets/js/main.js     Menu mobile, effets 3D, apparitions, formulaire et total estimé
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
