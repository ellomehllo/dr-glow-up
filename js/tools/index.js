// Treatment registry: config id -> module. A new treatment is one import + one entry
// here and one entry in config.js.
import { ScrubTool } from './scrub.js';
import { PopTool } from './pop.js';
import { ChiselTool } from './chisel.js';
import { MewTool } from './mew.js';
import { RaspTool } from './rasp.js';
import { GoldTool } from './gold.js';
import { PolishTool } from './polish.js';

export const REGISTRY = {
  scrub: ScrubTool,
  pop: PopTool,
  chisel: ChiselTool,
  mew: MewTool,
  rasp: RaspTool,
  gold: GoldTool,
  polish: PolishTool,
};
