---
workflow: general-video
flow: automation
storyboard: no
message: "Le permis moto se passe chez nous, sur notre piste privée."
destination: Instagram Reels + TikTok
aspect: "9:16 (1080x1920, 30 fps)"
language: fr
audience: "18-40 ans, futurs motards (permis A2, passerelle A, 125)"
length: 32s
angle: "Piste privée = l'argument n°1"
---

# Brief : promo moto, Auto-École Wissous

## Intent

Vidéo promotionnelle en motion design 3D isométrique, tournée vers la partie
moto de l'auto-école. Argument central : **l'auto-école a sa propre piste
privée**. Ton direct, tutoiement, rythme TikTok : accroche dans la première
seconde, zooms caméra, mises en avant animées, appel à l'action à la fin.

## Faits utilisés (repris du site, `index.html`)

- Permis moto A2 : 20 h (8 h de plateau sur piste fermée + 12 h de circulation), 790 €, prix fixe.
- Accessible dès 18 ans.
- Plateau : maniabilité, freinage, évitement.
- Passerelle A2 → A : 7 h, 300 €. Formation 125 cm³ : 7 h, 400 €.
- Wissous, Essonne (91).

## Customizations

- Monde 3D isométrique (Three.js, caméra orthographique) aux couleurs du site :
  bleu de marque `#0d52d9`, marine `#061a47`, accent signal `#ff5b3a`.
- Textes : Barlow Condensed (titres, italique 800/900) + Geist Mono (étiquettes), fichiers en local.
- Musique : boucle électro à 120 BPM générée par `tools/make_audio.py` (aucun échantillon externe).
- Effets sonores : bibliothèque fournie avec HyperFrames (Pixabay, voir `assets/audio/sfx/CREDITS.md`).
- Voix off : Google Gemini TTS (voir `VOIX.md`) ; nécessite une clé `GEMINI_API_KEY`.

## Notes

- Zones sûres Reels/TikTok : rien d'important dans les 230 px du haut, les 420 px du bas
  ni les 150 px de droite.
- « Auto-École Wissous » est le nom provisoire du site : à changer dans `index.html` si besoin.
- Aucun numéro de téléphone (celui du site est fictif) : l'appel à l'action est « lien en bio ».
