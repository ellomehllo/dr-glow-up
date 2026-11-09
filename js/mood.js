// How the patient feels about the service.
//   Hurts: a treatment pressed where there is nothing to treat hurts the skin there and
//          leaves a mark (a burn, a bruise or a rash, by the tool); in an eye it hurts
//          far more. Each one costs aura (HURT) and the patient cries out in their own words.
//   At the end: how happy they are follows the aura and how much it hurt, and a bad job
//          comes out in their own temper: some get angry, some cry, some go cold, some
//          grumble.
export const HURT = { skin: 3, eye: 10 };
// a mark (head space) left by each treatment used in the wrong place
export const HURT_KIND = { laser: 'burn', iron: 'burn', pop: 'bruise', nose: 'bruise', chisel: 'bruise', mew: 'bruise', gold: 'rash', circles: 'rash', teeth: 'rash', polish: 'rash', pierce: 'bruise' };

// how each character takes a bad job
const TEMPER = {
  bully: 'angry', bodybuilder: 'angry', punk: 'angry', gamer: 'angry',
  foodie: 'sad', bookworm: 'sad', glam: 'drama', goth: 'cold', brainiac: 'cold', grandpa: 'grumpy',
};
// regular patients: one of three, fixed by who they are
export const temperOf = (who) => TEMPER[who.kind] || ['angry', 'sad', 'grumpy'][(who.seed >>> 0) % 3];

// what they say: when it hurts (skin, eye) and at the end (one per feeling)
const LINES = {
  goth: { skin: '...OW.', eye: 'MY EYE. GREAT.', thrilled: 'ADEQUATELY DARK.', pleased: 'FINE. I GUESS.', meh: 'WHATEVER.', upset: 'HOW TYPICAL.', furious: "I'M LEAVING." },
  bodybuilder: { skin: 'OOF!', eye: 'MY EYE, BRO!', thrilled: 'ABSOLUTE GAINS!', pleased: 'SOLID WORK, BRO.', meh: 'NEEDS MORE REPS.', upset: 'BRO, SERIOUSLY?', furious: 'THIS IS NOT GAINS!' },
  bookworm: { skin: 'EEP!', eye: 'NOT MY EYE!', thrilled: 'I LOOK WONDERFUL!', pleased: 'OH, THANK YOU!', meh: "IT'S... OKAY.", upset: "I'LL JUST... GO.", furious: 'MY FACE IS RUINED!' },
  brainiac: { skin: 'CAREFUL!', eye: "THAT'S MY EYE!", thrilled: 'FLAWLESS RESULT.', pleased: 'ACCEPTABLE WORK.', meh: 'STATISTICALLY AVERAGE.', upset: 'POOR TECHNIQUE.', furious: 'UNACCEPTABLE!' },
  foodie: { skin: 'OWIE!', eye: 'MY EYE!!', thrilled: 'SO YUMMY! I MEAN PRETTY!', pleased: 'YAY, THANK YOU!', meh: 'I NEED A SNACK.', upset: 'I JUST WANTED TO GLOW...', furious: 'WAAAH!' },
  punk: { skin: 'OI!', eye: 'MY EYE, MATE!', thrilled: 'WICKED!', pleased: 'NOT BAD, DOC.', meh: 'BORING.', upset: 'YOU WRECKED IT.', furious: 'THIS PLACE IS A JOKE!' },
  bully: { skin: 'WATCH IT!', eye: 'YOU BLIND?!', thrilled: 'NOW THAT IS A FACE.', pleased: 'NOT BAD, NERD.', meh: 'MEH.', upset: 'YOU CALL THIS A GLOW UP?', furious: "YOU'RE DONE, DOC!" },
  gamer: { skin: 'OUCH!', eye: 'CRITICAL HIT!', thrilled: 'LEGENDARY SKIN!', pleased: 'GG, DOC.', meh: 'MID.', upset: 'THAT WAS A FAIL.', furious: 'RAGE QUIT!' },
  glam: { skin: 'MY FACE!', eye: 'MY LASHES!', thrilled: 'I AM GLOWING!', pleased: 'CUTE, THANKS!', meh: 'I EXPECTED MORE.', upset: 'NOT MY FACE!', furious: 'NEVER AGAIN!!' },
  grandpa: { skin: 'OH MY!', eye: 'MY GOOD EYE!', thrilled: 'I FEEL 20 AGAIN!', pleased: 'VERY NICE, DEAR.', meh: 'IT WILL DO.', upset: 'IN MY DAY...', furious: 'HMPH! RUBBISH!' },
};
// regular patients, by temper
const BY_TEMPER = {
  angry: { upset: 'WHAT IS THIS?!', furious: 'I WANT A REFUND!' },
  sad: { upset: 'OH NO...', furious: 'MY FACE...' },
  grumpy: { upset: 'NOT GREAT.', furious: 'NEVER AGAIN.' },
};
const PLAIN = { skin: 'OUCH!', eye: 'MY EYE!', thrilled: 'I LOOK AMAZING!', pleased: 'THANK YOU!', meh: "IT'S OKAY." };
export function lineFor(who, key) {
  const own = LINES[who.kind];
  if (own) return own[key];
  return BY_TEMPER[temperOf(who)][key] || PLAIN[key];
}

// thrilled | pleased | meh | upset | furious, from the aura, the level's pass mark,
// and the hurts (pain: 1 per skin hurt, more for an eye; eyes: eye hurts)
export function feelingFor(aura, pass, pain, eyes) {
  if (aura < pass - 15 || eyes >= 2 || pain >= 7) return 'furious';
  if (aura < pass || pain >= 4) return 'upset';
  if (aura >= 85 && pain < 1.5 && !eyes) return 'thrilled';
  if (aura >= 70) return 'pleased';
  return 'meh';
}
export const BAD = new Set(['upset', 'furious']);

// the face for a feeling: [expression, mouth, mood, anger, crying, bored]
export function faceFor(feel, temper) {
  const hard = feel === 'furious';
  if (feel === 'thrilled') return ['happy', 'grin', 1, 0, 0, 0];
  if (feel === 'pleased') return ['normal', null, 0.75, 0, 0, 0];
  if (feel === 'meh') return ['normal', 'flat', 0.05, 0, 0, temper === 'cold' ? 0.8 : 0.45];
  switch (temper) {
    case 'angry': return ['normal', 'grit', -0.4, hard ? 1 : 0.75, 0, 0];
    case 'sad': return ['normal', hard ? 'sob' : null, -1, 0, hard ? 1 : 0.55, 0];
    case 'drama': return ['normal', 'sob', -1, 0, 1, 0];
    case 'cold': return ['normal', 'flat', -0.3, hard ? 0.6 : 0, 0, 1];
    default: return ['normal', hard ? 'grit' : 'flat', -1, hard ? 0.85 : 0.5, 0, 0]; // grumpy
  }
}
