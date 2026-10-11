# Vidéo promo moto : « Le permis moto, version piste privée »

Vidéo verticale de 32 secondes (1080 × 1920, 30 images/s) pour Instagram Reels et
TikTok, en motion design 3D isométrique. Elle met en avant la piste privée de
l'auto-école et l'offre moto (permis A2, passerelle A2 → A, formation 125).

Vidéo finale : `renders/promo-moto-piste-privee.mp4`

Tout est généré avec [HyperFrames](https://hyperframes.heygen.com) : la vidéo est
une page HTML (scène 3D Three.js + textes animés GSAP) que HyperFrames capture
image par image. Aucun générateur de vidéo par IA n'est utilisé.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `index.html` | Composition : textes, animations, effets, pistes audio |
| `assets/world.js` | Monde 3D isométrique : île, piste, moto, caméra, lumières |
| `assets/audio/music.wav`, `engine.wav` | Musique et moteur, générés par `tools/make_audio.py` |
| `assets/audio/sfx/` | Effets sonores de la bibliothèque HyperFrames (licence Pixabay) |
| `assets/fonts/` | Barlow Condensed et Geist Mono (licence SIL OFL) |
| `assets/vendor/` | GSAP et Three.js, copiés en local |
| `BRIEF.md`, `STORYBOARD.md` | Intention et découpage plan par plan |
| `VOIX.md`, `voix-gemini.json` | Voix off Google Gemini, prête à générer |

## Modifier et refaire le rendu

Prérequis : Node.js 22 ou plus et FFmpeg.

```bash
cd video/moto-promo
npx hyperframes preview          # aperçu interactif dans le navigateur
npx hyperframes check            # vérifications (lint, mise en page, contraste)
npx hyperframes render --video-bitrate 10M -o renders/rendu-brut.mp4
tools/normaliser-son.sh renders/rendu-brut.mp4 renders/promo-moto-piste-privee.mp4
```

Le nom affiché à la fin est une variable de composition : sans toucher au code,
`npx hyperframes render --variables '{"ecole":"MON NOM"}'` change le nom sur
l'écran final et sur les panneaux de la piste.

Les prix et les textes sont directement dans `index.html` (sections `s-a2`,
`s-prix`, `s-aussi`). La musique se régénère avec `python3 tools/make_audio.py`
(numpy et scipy requis).

La seconde commande ajuste le volume sonore à −14 LUFS (niveau visé par
Instagram et TikTok) avec FFmpeg, en deux passes, sans réencoder l'image.

## Voix off

La vidéo est conçue pour fonctionner sans le son (tout le message est à l'écran).
La voix off Google Gemini est prête : voir `VOIX.md`. Il ne manque qu'une clé
`GEMINI_API_KEY`.
