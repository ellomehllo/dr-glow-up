// Drawn colour art for the treatments: each one is the tool itself, in the game's look
// (ink outlines, flat bright fills, a white shine) and matching how it is drawn on the
// patient. 48x48, keyed like the icon names in config.js TOOLS and STYLES. Used in the tool kit,
// the order row under the aura, the prompt card, the level splash and the results.
const INK = '#3a2747';
const art = (body, label = '') => `<svg class="ico art${label ? ` art-${label}` : ''}" viewBox="0 0 48 48" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// a four-point sparkle centred on (x, y)
const sparkle = (x, y, r, fill = '#ffc93c', w = 1.7) => {
  const k = r * 0.22;
  return `<path d="M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z" fill="${fill}" stroke-width="${w}"/>`;
};

// a cucumber slice: dark rind, pale flesh, seeds in a ring
const slice = (cx, cy, r) => {
  let seeds = '';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3, x = cx + Math.cos(a) * r * 0.52, y = cy + Math.sin(a) * r * 0.52;
    seeds += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(r * 0.13).toFixed(1)}" ry="${(r * 0.075).toFixed(1)}" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#3f9a4a"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.78).toFixed(1)}" fill="#c4ef94" stroke="none"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.45).toFixed(1)}" fill="#e6ffc8" stroke="none"/>
    <g fill="#fff" stroke="rgba(58,39,71,.4)" stroke-width="1">${seeds}</g>
    <ellipse cx="${cx - r * 0.34}" cy="${cy - r * 0.44}" rx="${(r * 0.26).toFixed(1)}" ry="${(r * 0.13).toFixed(1)}" transform="rotate(-35 ${cx - r * 0.34} ${cy - r * 0.44})" fill="#fff" stroke="none" opacity=".6"/>`;
};

const TOOTH = 'M7.6 3.5C5 3.5 3.5 5.5 3.5 8c0 3 1.4 4.4 2 7.4.5 2.6.9 5.1 2.4 5.1 1.6 0 1.6-4.6 4.1-4.6s2.5 4.6 4.1 4.6c1.5 0 1.9-2.5 2.4-5.1.6-3 2-4.4 2-7.4 0-2.5-1.5-4.5-4.1-4.5-1.8 0-2.7 1-4.4 1s-2.6-1-4.4-1z';
const PUFF = 'M-46-8C-50-34-20-40-4-30C10-46 44-38 44-14C60-2 54 26 30 28C18 44-16 44-26 28C-50 30-60 6-46-8Z';
const IRON = 'M-32 0L38 0Q24-22-2-27L-30-27Q-35-14-32 0Z';

// foam: circles stroked thick, then filled over, so only the outside edge shows
const foam = (cs) => `<g stroke-width="5.2">${cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g><g fill="#fff" stroke="none">${cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;

export const TOOL_ART = {
  // wash: a foamy pink sponge
  sponge: art(`
    <g transform="rotate(-14 24 30)">
      <rect x="6" y="22" width="35" height="19" rx="6" fill="#ffa8c8"/>
      <g fill="#f37aa7" stroke="none"><circle cx="13" cy="34" r="2.4"/><circle cx="21" cy="37" r="1.7"/><circle cx="28.5" cy="32.5" r="2.5"/><circle cx="35" cy="36.5" r="1.6"/><circle cx="18.5" cy="30" r="1.4"/></g>
      ${foam([[11, 22, 4.6], [17.5, 19.5, 6], [25.5, 19, 5.8], [32.5, 21, 5], [38, 23.5, 3.6]])}
      <path d="M15 17.2a4 4 0 0 1 3.2-1.4" stroke="#ffd1e3" stroke-width="1.8"/>
    </g>
    <g fill="#fff" stroke-width="1.8"><circle cx="39" cy="9" r="3.2"/><circle cx="31.5" cy="6" r="2"/><circle cx="43.5" cy="15.5" r="1.5"/></g>`, 'sponge'),

  // pimples: a steel extractor whose loop rings a pimple
  pop: art(`
    <circle cx="16" cy="32" r="10.5" stroke-width="6.4"/>
    <path d="M23.4 24.6L40.5 7.5" stroke-width="7"/>
    <circle cx="16" cy="32" r="10.5" stroke="#e3e8f4" stroke-width="2.4"/>
    <path d="M23.4 24.6L40.5 7.5" stroke="#e3e8f4" stroke-width="2.6"/>
    <rect x="33.2" y="3.8" width="7" height="15" rx="3.5" transform="rotate(45 36.7 11.3)" fill="#ff6fae"/>
    <circle cx="16" cy="32" r="6.2" fill="#ff7d9a"/>
    <circle cx="16.9" cy="30.7" r="2.6" fill="#fff4c4" stroke-width="1.6"/>
    <path d="M11.6 31.4a4.6 4.6 0 0 1 1.6-3.4" stroke="#fff" stroke-width="1.6" opacity=".85"/>`, 'pop'),

  // jaw: a jade face roller on a gold frame
  roller: art(`
    <g transform="translate(24 25) scale(.9) rotate(-32) translate(-24 -25)">
      <path d="M10 11H7v10h17v11M38 11h3v10H24" stroke-width="6"/>
      <path d="M10 11H7v10h17v11M38 11h3v10H24" stroke="#ffd36b" stroke-width="2.4"/>
      <rect x="20" y="29" width="8" height="17" rx="4" fill="#7ee0b8"/>
      <rect x="22" y="32" width="2" height="9" rx="1" fill="#fff" stroke="none" opacity=".55"/>
      <rect x="9" y="5" width="30" height="12" rx="6" fill="#5fd0a0"/>
      <path d="M15.5 6.6l-2.4 8.8M22.5 6.6l-2.4 8.8M29.5 6.6l-2.4 8.8M36 7.2l-1.8 6.6" stroke="#fff" stroke-width="2" opacity=".55"/>
      <rect x="12.5" y="7.2" width="23" height="2.4" rx="1.2" fill="#fff" stroke="none" opacity=".5"/>
      <rect x="9" y="5" width="30" height="12" rx="6"/>
    </g>`, 'roller'),

  // posture: a spirit level, bubble nearly centred
  mew: art(`
    <g transform="rotate(-9 24 27)">
      <rect x="3.5" y="19" width="41" height="14" rx="4" fill="#45c8ff"/>
      <rect x="7.5" y="21.4" width="8" height="2.4" rx="1.2" fill="#fff" stroke="none" opacity=".55"/>
      <rect x="16" y="22" width="16" height="8" rx="4" fill="#e9fff6"/>
      <path d="M20.5 22.4v7.2M27.5 22.4v7.2" stroke-width="1.5"/>
      <ellipse cx="25" cy="26" rx="3.4" ry="2.2" fill="#b7f26e" stroke-width="1.6"/>
      <circle cx="9.5" cy="28" r="1.9" fill="#fff" stroke-width="1.5"/>
      <circle cx="38.5" cy="28" r="1.9" fill="#fff" stroke-width="1.5"/>
    </g>
    ${sparkle(37, 9, 5)}${sparkle(11, 11, 3, '#fff', 1.5)}`, 'mew'),

  // hair and brows: a paintbrush loaded with brown
  brush: art(`
    <g transform="rotate(38 24 24)">
      <rect x="20" y="1" width="8" height="23" rx="4" fill="#ff6fae"/>
      <rect x="22" y="4" width="2" height="15" rx="1" fill="#fff" stroke="none" opacity=".55"/>
      <rect x="17.5" y="22.5" width="13" height="8.5" rx="2" fill="#e3dcec"/>
      <path d="M18 26.7h12" stroke-width="1.6"/>
      <path d="M24 47c-5.5-3.5-7.5-9-6.4-16h12.8c1.1 7-.9 12.5-6.4 16z" fill="#8b5a3c"/>
      <path d="M21.4 34c-.5 4 .3 7.2 2 9.5" stroke="#c48a63" stroke-width="1.7"/>
    </g>`, 'brush'),

  // scars: a squeezy tube of mint healing gel
  tube: art(`
    <g transform="translate(24 24) scale(.88) rotate(40) translate(-24 -25)">
      <path d="M14 8h20c1.2 9.5.2 18-3 25H17c-3.2-7-4.2-15.5-3-25z" fill="#fff"/>
      <rect x="15.8" y="14" width="16.4" height="12" rx="3" fill="#c6f2dc" stroke="none"/>
      <path d="M21 20h6M24 17v6" stroke="#2fc79f" stroke-width="2.4"/>
      <path d="M14 8h20c1.2 9.5.2 18-3 25H17c-3.2-7-4.2-15.5-3-25z"/>
      <rect x="12.5" y="4.5" width="23" height="5" rx="1.6" fill="#e3dcec"/>
      <rect x="19" y="33" width="10" height="6" rx="1.6" fill="#ff6fae"/>
      <path d="M21.5 39l1 5h3l1-5z" fill="#fff"/>
    </g>
    <path d="M8.2 40c-1.6 2.2-2.4 3.4-2.4 4.5a2.4 2.4 0 0 0 4.8 0c0-1.1-.8-2.3-2.4-4.5z" fill="#3fe0b5" stroke-width="1.8"/>`, 'tube'),

  // glow: a fluffy powder puff with a ribbon loop
  glow: art(`
    <g transform="translate(22 29) scale(.36)" stroke-width="7.2">
      <path d="${PUFF}" fill="#ffe1ee"/>
      <ellipse cx="6" cy="10" rx="30" ry="16" fill="#ffaacd" stroke="none" opacity=".6"/>
      <ellipse cx="0" cy="-34" rx="20" ry="11" fill="#ff6fae"/>
      <ellipse cx="0" cy="-34" rx="10" ry="4" fill="#ffe1ee" stroke="none"/>
      <ellipse cx="-22" cy="-10" rx="9" ry="6" transform="rotate(-25 -22 -10)" fill="#fff" stroke="none" opacity=".85"/>
    </g>
    ${sparkle(40, 9, 5.5)}${sparkle(42.5, 27, 3.2, '#fff', 1.5)}`, 'glow'),

  // nose: a little rubber mallet
  nose: art(`
    <g transform="translate(-2 0) rotate(-40 24 26)">
      <path d="M5 26H29" stroke-width="7.5"/>
      <path d="M5 26H29" stroke="#f2b979" stroke-width="3.6"/>
      <rect x="28" y="12" width="14" height="28" rx="6" fill="#ff8fb8"/>
      <rect x="31" y="15.5" width="3.2" height="16" rx="1.6" fill="#fff" stroke="none" opacity=".6"/>
      <rect x="27.4" y="22.6" width="15.2" height="6.8" rx="2.2" fill="#ffd36b" stroke-width="2.2"/>
    </g>
    <path d="M40 37.5l3 1.5M37.5 41.5l1.6 2.8M42 32.5l3.2-.3" stroke-width="2"/>`, 'nose'),

  // dark circles: two cool cucumber slices
  cucumber: art(`${slice(31, 17, 11.5)}${slice(18, 30, 14)}`, 'cucumber'),

  // sun spots: a laser pen and its beam
  laser: art(`
    <g transform="rotate(35 24 24)">
      <path d="M24 37v9" stroke="#ff9fc4" stroke-width="6.5" opacity=".75"/>
      <path d="M24 37v9" stroke="#ff4f8b" stroke-width="2.6"/>
      <rect x="18" y="2" width="12" height="27" rx="6" fill="#c9b6ff"/>
      <rect x="21" y="5" width="2.4" height="18" rx="1.2" fill="#fff" stroke="none" opacity=".55"/>
      <rect x="20" y="11" width="8" height="5.5" rx="2.2" fill="#ff4f8b" stroke-width="2"/>
      <path d="M18 29h12l-2.6 8h-6.8z" fill="#e3e8f4"/>
    </g>
    ${sparkle(11.4, 42, 5)}`, 'laser'),

  // teeth: a whitening lamp shining on a tooth
  tooth: art(`
    <path d="M21 16.6L31.2 26.8 22.5 40.5 7 25.5z" fill="#bff0ff" stroke="none" opacity=".8"/>
    <g transform="translate(5 22) scale(.92)" stroke-width="2.8">
      <path d="${TOOTH}" fill="#fff"/>
      <path d="M7.2 6.6c-1 .4-1.7 1.3-1.7 2.6" stroke="#9fe2ff" stroke-width="2"/>
    </g>
    <g transform="translate(31 17) rotate(-135)">
      <rect x="-3.6" y="0" width="7.2" height="17" rx="3.6" fill="#b9a6ff"/>
      <rect x="-1.8" y="3" width="1.6" height="11" rx=".8" fill="#fff" stroke="none" opacity=".55"/>
      <rect x="-8" y="-7" width="16" height="7.5" rx="3.4" fill="#4d5470"/>
      <rect x="-5.6" y="-6" width="11.2" height="3" rx="1.5" fill="#bff0ff" stroke="none"/>
    </g>
    ${sparkle(26, 41, 3.6, '#fff', 1.5)}`, 'tooth'),

  // wrinkles: a little steam iron
  iron: art(`
    <g transform="translate(23 38) scale(.56)">
      <path d="M-22-24C-24-50 18-50 12-26" stroke-width="13"/>
      <path d="M-22-24C-24-50 18-50 12-26" stroke="#ff8fb8" stroke-width="6.5"/>
      <path d="${IRON}" fill="#8fd6ff" stroke="none"/>
      <path d="M-33-7H32.9Q35.5-3.4 38 0H-32Q-33.2-3.5-33-7Z" fill="#e3e8f4" stroke="none"/>
      <path d="M-33-7H32.9" stroke-width="3"/>
      <path d="${IRON}" stroke-width="4.6"/>
      <rect x="-24" y="-22" width="22" height="5" rx="2.5" fill="#fff" stroke="none" opacity=".6"/>
      <circle cx="8" cy="-15" r="4.5" fill="#ff4f7b" stroke-width="3"/>
    </g>
    <g fill="#fff" stroke-width="1.8"><circle cx="7" cy="12" r="3.2"/><circle cx="11.5" cy="8" r="2.2"/><circle cx="4.5" cy="18" r="1.8"/></g>`, 'iron'),

  // hair colour: a squeeze bottle of dye, dripping
  dye: art(`
    <g transform="rotate(-30 24 26)">
      <path d="M17 18h14v21a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z" fill="#b28cff"/>
      <rect x="19" y="21" width="2.4" height="17" rx="1.2" fill="#fff" stroke="none" opacity=".5"/>
      <rect x="21.5" y="25" width="9" height="12" rx="2.6" fill="#fff" stroke-width="2"/>
      <path d="M26 27.6c-1.5 2.1-2.3 3.2-2.3 4.3a2.3 2.3 0 0 0 4.6 0c0-1.1-.8-2.2-2.3-4.3z" fill="#ff6fb5" stroke-width="1.6"/>
      <rect x="18" y="12.5" width="12" height="6" rx="2.2" fill="#ff6fae"/>
      <path d="M21.2 12.5L23 4h2l1.8 8.5z" fill="#fff"/>
    </g>
    <path d="M10.2 12.5c-1.9 2.6-2.9 4-2.9 5.4a2.9 2.9 0 0 0 5.8 0c0-1.4-1-2.8-2.9-5.4z" fill="#ff6fb5" stroke-width="2"/>
    <circle cx="6" cy="25.5" r="2" fill="#45c8ff" stroke-width="1.6"/>
    ${sparkle(40, 9, 5)}`, 'dye'),

  // piercing: an ear with a hoop in the lobe and studs up the rim
  pierce: art(`
    <path d="M15 30C11.5 21 13 8.5 25 5.5c9.5-2.4 17.5 4.5 16.5 14-.6 6-4.6 8.6-6.6 11.2-1.9 2.5-1.6 5.4-2.8 8-1.8 3.9-7.6 4.8-10.4 1.4" fill="#ffd2b8"/>
    <path d="M22.5 26.5c-1.4-6.4 1-11.6 6.2-12.4 4.2-.7 7.2 2.2 6.6 6.2" stroke-width="2.3"/>
    <path d="M27.5 23.5c.4-2 1.8-3 3.4-2.8" stroke-width="2"/>
    <circle cx="26.5" cy="40.4" r="4.2" stroke-width="5.4"/>
    <circle cx="26.5" cy="40.4" r="4.2" stroke="#ffc93c" stroke-width="2.4"/>
    <circle cx="35" cy="8.6" r="2.9" fill="#e3e8f4" stroke-width="2"/>
    <circle cx="40.6" cy="15" r="2.5" fill="#e3e8f4" stroke-width="2"/>
    ${sparkle(8.5, 11, 5)}${sparkle(6, 38, 3, '#fff', 1.5)}`, 'pierce'),

  // lipstick: a red bullet out of its gold case, with a kiss mark
  lips: art(`
    <g transform="rotate(28 24 26)">
      <path d="M18.5 15.5V9.5Q18.5 3.5 24.5 2.5L29.5 5.5V15.5z" fill="#e0284f"/>
      <path d="M21 13V9.6Q21 6.5 23.6 5.4" stroke="#fff" stroke-width="2" opacity=".55"/>
      <rect x="16.5" y="15.5" width="15" height="7" rx="1.6" fill="#ffc93c"/>
      <rect x="15" y="22.5" width="18" height="21" rx="3" fill="#ff8ab5"/>
      <rect x="18" y="25.5" width="3" height="15" rx="1.5" fill="#fff" stroke="none" opacity=".5"/>
    </g>
    <path d="M4.5 33.5q3.2-3 6 0q2.8-3 6 0q-2.5 5.5-6 5.5t-6-5.5z" fill="#ff5fa2" stroke-width="2"/>
    <path d="M4.5 33.5q6 2.4 12 0" stroke-width="1.6"/>
    ${sparkle(41, 8, 4.5)}`, 'lips'),

  // blush: a round compact of pink powder and a fluffy brush
  blush: art(`
    <ellipse cx="18" cy="34" rx="14" ry="9" fill="#ffd2e2"/>
    <ellipse cx="18" cy="32.5" rx="10.5" ry="5.6" fill="#ff7fb0" stroke-width="2"/>
    <ellipse cx="14.5" cy="31.3" rx="3.4" ry="1.4" fill="#fff" stroke="none" opacity=".6"/>
    <g transform="rotate(38 33 20)">
      <rect x="30.5" y="18" width="5" height="25" rx="2.5" fill="#b28cff"/>
      <rect x="29.5" y="15" width="7" height="5" rx="1.5" fill="#e3e8f4"/>
      <path d="M28 15.5Q25.5 6 33 2.5Q40.5 6 38 15.5z" fill="#ffc4dc"/>
      <path d="M31 13Q30 8 33 5" stroke="#fff" stroke-width="1.8" opacity=".7"/>
    </g>
    ${sparkle(7, 10, 4.5)}${sparkle(42, 40, 3, '#fff', 1.5)}`, 'blush'),

  // face gems: a sticker sheet with a star, a heart and a diamond, one peeling off
  gems: art(`
    <rect x="5" y="9" width="30" height="32" rx="5" fill="#fff"/>
    <path d="M14 15.5l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#ffd25e" stroke-width="2"/>
    <path d="M27 34.5q-6.5-4-6.5-7.6a3.2 3.2 0 0 1 6.5-.8 3.2 3.2 0 0 1 6.5.8q0 3.6-6.5 7.6z" fill="#ff6fb5" stroke-width="2"/>
    <path d="M13 29.5l4 5-4 5-4-5z" fill="#6fd3ff" stroke-width="2"/>
    <g transform="rotate(18 36 12)">
      <path d="M36 4.5l6 7.5-6 7.5-6-7.5z" fill="#c08bff"/>
      <path d="M33.6 9.5l2.4-2.6" stroke="#fff" stroke-width="1.6"/>
    </g>
    ${sparkle(43, 30, 4)}`, 'gems'),

  // glitter: a little pot of sparkles with a shaker lid, glitter falling out
  glitter: art(`
    <rect x="10" y="20" width="22" height="22" rx="5" fill="#d8c4ff"/>
    <g fill="#ffc93c" stroke="none"><circle cx="16" cy="30" r="1.8"/><circle cx="24" cy="35" r="1.6"/><circle cx="20" cy="26" r="1.3"/><circle cx="27" cy="28" r="1.8"/><circle cx="15" cy="37" r="1.3"/></g>
    <rect x="8" y="13" width="26" height="8" rx="3" fill="#ff6fb5"/>
    <g fill="${INK}" stroke="none"><circle cx="15" cy="17" r="1"/><circle cx="21" cy="17" r="1"/><circle cx="27" cy="17" r="1"/></g>
    ${sparkle(40, 10, 5)}${sparkle(41, 27, 3, '#6fd3ff', 1.5)}${sparkle(30, 5, 2.6, '#fff', 1.4)}`, 'glitter'),

  // eyeshadow: a palette of three pans and an applicator
  shadow: art(`
    <rect x="4" y="16" width="32" height="22" rx="5" fill="#fff"/>
    <circle cx="12" cy="27" r="5" fill="#ff7fb0" stroke-width="2"/>
    <circle cx="20" cy="27" r="5" fill="#9a5ce6" stroke-width="2"/>
    <circle cx="28" cy="27" r="5" fill="#4f8fff" stroke-width="2"/>
    <g transform="rotate(40 38 24)">
      <rect x="35.5" y="16" width="4" height="26" rx="2" fill="#ffc93c"/>
      <ellipse cx="37.5" cy="13" rx="3.6" ry="5.5" fill="#d6b8ff"/>
    </g>
    ${sparkle(9, 8, 4)}`, 'shadow'),

  // freckles: a cheek with a speckle of freckles and a fine brush
  freckles: art(`
    <circle cx="20" cy="27" r="15" fill="#ffd8be"/>
    <g fill="#9a5a36" stroke="none"><circle cx="14" cy="24" r="1.8"/><circle cx="19" cy="21" r="1.5"/><circle cx="24" cy="25" r="1.9"/><circle cx="17" cy="30" r="1.6"/><circle cx="26" cy="31" r="1.4"/><circle cx="21" cy="34" r="1.5"/></g>
    <g transform="rotate(35 38 18)">
      <rect x="36" y="12" width="4" height="26" rx="2" fill="#6fd3ff"/>
      <path d="M36 12q2-8 4 0z" fill="#9a5a36" stroke-width="2"/>
    </g>
    ${sparkle(40, 40, 3.5, '#fff', 1.5)}`, 'freckles'),

  // mascara: a wand and its tube, lashes curling up
  lashes: art(`
    <g transform="rotate(-30 22 26)">
      <rect x="18" y="22" width="9" height="22" rx="3" fill="#b48cff"/>
      <rect x="19.5" y="18" width="6" height="5" rx="1.5" fill="#e3e8f4"/>
      <path d="M22.5 18V5" stroke-width="2.4"/>
      <path d="M19 6h7M19 9h7M19 12h7" stroke-width="2.2"/>
    </g>
    <path d="M28 40q8-6 16 0" stroke-width="2.6"/>
    <path d="M30 38.5l-2-4M34 37l-1-4.5M38 37l1-4.5M42 38.5l2-4" stroke-width="2"/>
    ${sparkle(40, 10, 4.5)}`, 'lashes'),

  // brow tint: a brow and an angled brush
  brows: art(`
    <path d="M5 28Q16 15 34 20Q20 19 7 31z" fill="#6b4128" stroke-width="2.2"/>
    <g transform="rotate(-40 34 32)">
      <rect x="32" y="26" width="4" height="20" rx="2" fill="#ff6fb5"/>
      <path d="M31 26l5-7v7z" fill="#6b4128" stroke-width="2"/>
    </g>
    ${sparkle(41, 9, 4.5)}${sparkle(10, 42, 3, '#fff', 1.5)}`, 'brows'),

  // hair clips: a bow and a star clip
  clips: art(`
    <path d="M18 18C14 10 4 9 5 18C4 27 14 26 18 18C22 10 32 9 31 18C32 27 22 26 18 18Z" fill="#ff6fb5"/>
    <ellipse cx="18" cy="18" rx="3" ry="3.6" fill="#ffc2df" stroke-width="2"/>
    <rect x="18" y="34" width="26" height="4.5" rx="2.2" fill="#e3e8f4" stroke-width="2"/>
    <path d="M34 26.5l1.9 3.8 4.2.6-3 3 .7 4.1-3.8-2-3.8 2 .7-4.1-3-3 4.2-.6z" fill="#ffd25e" stroke-width="2"/>
    ${sparkle(40, 10, 4.5)}`, 'clips'),

  // highlighter: a round pearly pan with a shine sweep and a fan brush
  highlight: art(`
    <circle cx="18" cy="28" r="14" fill="#fff4e6"/>
    <path d="M9 31q9-10 18-6" stroke="#ffd98a" stroke-width="3.4"/>
    <path d="M11 24q6-5 12-4" stroke="#fff" stroke-width="2.4"/>
    <g transform="rotate(40 36 18)">
      <rect x="34" y="18" width="4" height="22" rx="2" fill="#e3cfff"/>
      <path d="M30 18q6-14 12 0z" fill="#fff0c4" stroke-width="2.2"/>
    </g>
    ${sparkle(8, 9, 4.5)}${sparkle(42, 42, 3, '#ffc93c', 1.5)}`, 'highlight'),

  // sunglasses: heart-shaped shades with a shine
  shades: art(`
    <path d="M14 36C2 28 3 18 9 17C12 16.5 14 18 14 20C14 18 16 16.5 19 17C25 18 26 28 14 36Z" fill="#2a1e33"/>
    <path d="M34 36C22 28 23 18 29 17C32 16.5 34 18 34 20C34 18 36 16.5 39 17C45 18 46 28 34 36Z" fill="#2a1e33"/>
    <path d="M20 21q4-3 8 0" stroke-width="2.6"/>
    <path d="M8 22l4-2M28 22l4-2" stroke="#fff" stroke-width="2" opacity=".6"/>
    <path d="M14 17q0-5 4-6" stroke="#ff3f7f" stroke-width="2.2"/>
    ${sparkle(41, 8, 4.5)}`, 'shades'),

  // tweezers: silver tweezers pulling a leaf
  tweezers: art(`
    <g transform="rotate(-38 14 32)">
      <path d="M6.5 30c3.5-4.5 10.5-6 16-3.5c-4 4.5-11 6-16 3.5z" fill="#6fd35a"/>
      <path d="M8.5 29.5c4-1.4 8.5-2 12.5-2.6" stroke-width="1.6" stroke="#2f8a3a"/>
    </g>
    <path d="M19.5 28.5L41 7.5l3 3L22.5 31z" fill="#e3e8f4"/>
    <path d="M17 26L36 3.5l3.4 2.6L20 28.6z" fill="#e3e8f4"/>
    <path d="M30 13.5l2.4 2.2M33 10.2l2.4 2.2" stroke-width="1.8"/>
    <rect x="37" y="2" width="9" height="7" rx="3" transform="rotate(45 41.5 5.5)" fill="#ffc93c" stroke-width="2.2"/>
    ${sparkle(9, 9, 4.5)}`, 'tweezers'),

  // brush teeth: a toothbrush with foam on its bristles
  toothbrush: art(`
    <path d="M19 27L40 42" stroke-width="9"/>
    <path d="M19 27L40 42" stroke="#45c8ff" stroke-width="4.6"/>
    <path d="M24 28.5l12 8.5" stroke="#fff" stroke-width="1.6" opacity=".6"/>
    <g transform="rotate(36 14 21)">
      <rect x="4" y="22" width="22" height="6.5" rx="3" fill="#45c8ff"/>
      <g stroke-width="1.6"><rect x="5.5" y="14" width="3.6" height="8" rx="1.5" fill="#ff9fc4"/><rect x="10.2" y="14" width="3.6" height="8" rx="1.5" fill="#fff"/><rect x="14.9" y="14" width="3.6" height="8" rx="1.5" fill="#ff9fc4"/><rect x="19.6" y="14" width="3.6" height="8" rx="1.5" fill="#fff"/></g>
    </g>
    <g fill="#fff" stroke-width="1.8"><circle cx="9" cy="9.5" r="4.4"/><circle cx="16" cy="6.5" r="3.4"/><circle cx="5" cy="15.5" r="2.6"/></g>
    ${sparkle(40, 10, 5)}`, 'toothbrush'),

  // fill cavities: a dentist's drill at a tooth
  drill: art(`
    <g transform="translate(3 4) scale(.82)" stroke-width="3">
      <path d="${TOOTH}" fill="#fff"/>
      <ellipse cx="12.3" cy="9.5" rx="2.6" ry="2.2" fill="#3a2747" stroke="none"/>
    </g>
    <path d="M16 15.5l5-4" stroke-width="4.4"/>
    <path d="M16 15.5l5-4" stroke="#e3e8f4" stroke-width="1.8"/>
    <rect x="19" y="5.5" width="10" height="8" rx="3" fill="#e3e8f4" stroke-width="2.4"/>
    <path d="M27 11.5L35 23l8 18" stroke-width="9.5"/>
    <path d="M27 11.5L35 23l8 18" stroke="#b9a6ff" stroke-width="5"/>
    <circle cx="35" cy="23" r="2.6" fill="#ffc93c" stroke-width="1.8"/>
    <g stroke-width="1.8"><path d="M8 34.5l-3 2.5M12 37l-1 3.6M5 30l-3.4.6"/></g>`, 'drill'),

  // pull a bad tooth: pliers gripping a brown tooth
  pliers: art(`
    <g transform="translate(13 2) scale(.9)" stroke-width="2.8">
      <path d="${TOOTH}" fill="#c49a56"/>
      <ellipse cx="9" cy="10.5" rx="2.6" ry="2.2" fill="#6b4c24" stroke="none"/>
    </g>
    <path d="M17 12q-3 6 3 12l-3 13q-1.8 4.5-.6 9" stroke-width="7"/>
    <path d="M17 12q-3 6 3 12l-3 13q-1.8 4.5-.6 9" stroke="#e3e8f4" stroke-width="3"/>
    <path d="M33 12q3 6-3 12l3 13q1.8 4.5.6 9" stroke-width="7"/>
    <path d="M33 12q3 6-3 12l3 13q1.8 4.5.6 9" stroke="#e3e8f4" stroke-width="3"/>
    <path d="M17 36q-1.6 4.6-.6 9.5M33 36q1.6 4.6.6 9.5" stroke="#ff6fae" stroke-width="3.4"/>
    <circle cx="25" cy="25.5" r="3.2" fill="#e3e8f4" stroke-width="2.2"/>
    ${sparkle(6, 9, 4.5)}`, 'pliers'),

  // the kit itself: a doctor's bag
  kit: art(`
    <path d="M17 13.5V10a3.5 3.5 0 0 1 3.5-3.5h7A3.5 3.5 0 0 1 31 10v3.5" stroke-width="5.6"/>
    <path d="M17 13.5V10a3.5 3.5 0 0 1 3.5-3.5h7A3.5 3.5 0 0 1 31 10v3.5" stroke="#e3dcec" stroke-width="2"/>
    <rect x="4.5" y="13" width="39" height="29" rx="7" fill="#ff6fae"/>
    <path d="M5 21.5h38" stroke-width="2.2"/>
    <rect x="8.5" y="15.6" width="9" height="2.6" rx="1.3" fill="#fff" stroke="none" opacity=".55"/>
    <rect x="20" y="18" width="8" height="6.5" rx="2" fill="#ffc93c" stroke-width="2.2"/>
    <path d="M21.6 26.5h4.8v4.1h4.1v4.8h-4.1v4.1h-4.8v-4.1h-4.1v-4.8h4.1z" fill="#fff" stroke-width="2"/>`, 'kit'),
};
