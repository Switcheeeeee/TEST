# Voix off (Google Gemini TTS)

La vidéo fonctionne sans voix : chaque phrase est déjà écrite à l'écran.
La voix off Google reprend exactement ces textes, calés sur les plans.

## Script et placement

| Id | Début | Texte |
| --- | --- | --- |
| v01 | 0,25 s | Le permis moto… version piste privée. |
| v02 | 4,0 s | La piste ? Elle est à nous. |
| v03 | 6,2 s | Rien que pour nos élèves. |
| v04 | 8,1 s | Slalom. |
| v05 | 10,1 s | Freinage. |
| v06 | 12,1 s | Évitement. |
| v07 | 14,0 s | À ton rythme, en toute sécurité… |
| v08 | 16,2 s | Puis… la route. |
| v09 | 18,1 s | Permis A2 : vingt heures de formation. |
| v10 | 20,1 s | Huit sur notre piste, douze sur la route. |
| v11 | 22,05 s | Sept cent quatre-vingt-dix euros. Prix fixe. |
| v12 | 24,1 s | Et aussi : passerelle A2 et formation 125. |
| v13 | 26,2 s | Auto-École Wissous. Réserve ta place : lien en bio ! |

Voix par défaut : `Puck` (enjouée). Autres voix Gemini adaptées : `Fenrir`
(excitée), `Zephyr` (lumineuse), `Kore` (ferme). Pour changer, modifiez
`voice` dans `voix-gemini.json`.

## Générer la voix

Il faut une clé Gemini (Google AI Studio) dans la variable d'environnement
`GEMINI_API_KEY`. Dans un environnement cloud Claude Code, ajoutez-la dans les
réglages de l'environnement (secrets réseau ou variable d'environnement), puis
ouvrez une nouvelle session.

```bash
node ~/.agents/skills/media-use/audio/scripts/audio.mjs \
  --request ./voix-gemini.json --hyperframes . --out ./voix-meta.json --only tts
```

Les fichiers arrivent dans `assets/voice/` (`v01.wav` à `v13.wav`).

## Intégrer la voix

1. Ajoutez une balise par phrase dans `index.html`, à côté des autres pistes audio :

   ```html
   <audio id="vo-01" src="assets/voice/v01.wav" data-start="0.25" data-track-index="20" data-volume="1"></audio>
   ```

   (une ligne par id, avec le début indiqué dans le tableau ; sans `data-duration`,
   la durée réelle du fichier est utilisée).
2. Baissez la musique pour que la voix passe devant : `data-volume="0.55"` sur `#a-music`.
3. Vérifiez puis relancez le rendu : `npx hyperframes check` puis
   `npx hyperframes render -o renders/promo-moto-voix.mp4`.
