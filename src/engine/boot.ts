import configSrc from './config.js?raw';
import audioSrc from './audio.js?raw';
import uiSrc from './ui.js?raw';
import cutsceneSrc from './cutscene.js?raw';
import gameSrc from './game.js?raw';
import renderSrc from './render.js?raw';
import introSrc from './intro.js?raw';
import supabaseSrc from './supabase-config.js?raw';
import lbSrc from './lb.js?raw';
import cloudSaveSrc from './cloud-save.js?raw';
import shareSrc from './share.js?raw';
import charmsSrc from './charms.js?raw';
import codexSrc from './codex.js?raw';
import mainSrc from './main.js?raw';

declare global {
  interface Window {
    __OM_BOOTED__?: boolean;
  }
}

const stripStrict = (src: string) => src.replace(/^\s*['"]use strict['"];?/, '');

export function bootOneMore(): void {
  if (typeof window === 'undefined' || window.__OM_BOOTED__) return;
  window.__OM_BOOTED__ = true;

  const modules: Array<[string, string]> = [
    ['config.js', configSrc],
    ['audio.js', audioSrc],
    ['ui.js', uiSrc],
    ['cutscene.js', cutsceneSrc],
    ['game.js', gameSrc],
    ['render.js', renderSrc],
    ['intro.js', introSrc],
    ['supabase-config.js', supabaseSrc],
    ['lb.js', lbSrc],
    ['cloud-save.js', cloudSaveSrc],
    ['share.js', shareSrc],
    ['charms.js', charmsSrc],
    ['codex.js', codexSrc],
    ['main.js', mainSrc],
  ];

  const exportTail = `
    Object.assign(window, {
      CFG, ENEMIES, ENEMY_WEIGHTS, AREAS, UPGRADES, CONFLUENCES, CHARMS,
      BOSS_TAUNTS, SFX, UI, CUT, G, R, INTRO, LB, CH, CODEX
    });
  `;

  const bundle =
    '"use strict";\n' +
    modules.map(([name, src]) => `\n/* === ${name} === */\n${stripStrict(src)}`).join('\n;\n') +
    '\n;\n' +
    exportTail;

  // Execute in unified classic lexical scope after #stage DOM is committed
  const runner = new Function(bundle);
  runner();
}
