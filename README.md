# Dr. Glow Up

A hyper-casual skin clinic game: wash, squeeze, sculpt and heal a different patient on every level. Pick each treatment from the tool kit (tools you haven't unlocked yet are empty slots), then press and hold each problem to treat it; the hair brush paints and the laser zaps. Every patient comes in dirty, so the wash is always first and the glow always last; the treatments in between come in the level's own order, shown as numbered tools under the aura. Each treatment done out of turn costs 20 aura.

The kit also has two style tools you can use between treatments: hair colour (pick a dye, rub it into the hair) and piercings (tap anywhere on the head; each one costs aura, more away from the usual ears, nose, brows and lip).

Patients feel what you do. A treatment pressed on the face where there is nothing to treat hurts there: it leaves a burn, bruise or rash, the patient cries out in their own words, and it costs 3 aura. The eyes are worst: a press, a laser beam or a piercing in an eye costs 10, and the eye squeezes shut, waters and stays red. At the end each patient reacts to the job in their own way: a good job gets happy hops, a bad one (low aura or a lot of pain) gets anger, tears, a cold shoulder or grumbling, depending on who they are. Their verdict shows in a speech bubble on the results card. The rules are in `js/mood.js`.

100 levels in 10 chapters. Each chapter unlocks new treatments (dark circles, nose jobs, laser spots, teeth whitening, a wrinkle iron). Unlocking one pops up a card with a button straight into its level, which has just that treatment between the wash and the glow; the levels after mix it in with the older ones. Level 10 of each chapter is a boss. The level list is generated in `js/config.js`.

Play: https://ellomehllo.github.io/dr-glow-up/

Static site, Canvas 2D, no build step. Run locally with any static server, for example `python3 -m http.server`.
