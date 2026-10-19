'use strict';
/* ============================================================
   ONE MORE — synthesized ink sound kit (WebAudio, zero assets)
   Wet splats, taiko drums, brush flicks, pentatonic plucks.
   ============================================================ */

const SFX = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('om_muted_v1') === '1'; } catch (e) {}

  function ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(o) {
    if (!ctx || muted) return;
    const f = o.f ?? 440, f2 = o.f2 ?? f, type = o.type ?? 'sine';
    const dur = o.dur ?? 0.1, vol = o.vol ?? 0.15, delay = o.delay ?? 0;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  let noiseBuf = null;
  function noise(o) {
    if (!ctx || muted) return;
    const dur = o.dur ?? 0.08, vol = o.vol ?? 0.12, delay = o.delay ?? 0;
    const hp = o.hp ?? 0, lp = o.lp ?? 0;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const g = ctx.createGain();
    let node = src;
    if (hp > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = hp;
      node.connect(f); node = f;
    }
    if (lp > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lp;
      f.Q.value = o.q ?? 0.8;
      node.connect(f); node = f;
    }
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }

  /* wet ink splat: filtered noise body + sub thump */
  function splat(size, delay = 0) {
    const v = 0.05 + 0.06 * size;
    noise({ dur: 0.06 + 0.05 * size, vol: v, lp: 900 - 380 * size, q: 1.4, delay });
    tone({ f: 170 - 40 * size, f2: 52, type: 'sine', dur: 0.1 + 0.06 * size, vol: 0.09 + 0.07 * size, delay });
  }

  return {
    get muted() { return muted; },
    ensure,
    toggle() {
      muted = !muted;
      try { localStorage.setItem('om_muted_v1', muted ? '1' : '0'); } catch (e) {}
      return muted;
    },

    /* brush flicks a droplet */
    shoot() {
      tone({ f: 1350, f2: 780, type: 'triangle', dur: 0.035, vol: 0.026 });
      noise({ dur: 0.025, vol: 0.014, hp: 2600 });
    },
    /* droplet breaks on a blot */
    hit() { noise({ dur: 0.03, vol: 0.05, lp: 1800, q: 1.2 }); },
    /* a creature bursts into stain */
    kill() { splat(1); tone({ f: 520, f2: 240, type: 'triangle', dur: 0.06, vol: 0.045, delay: 0.015 }); },
    /* big creature dies */
    bigKill() { splat(2.1); tone({ f: 96, f2: 38, type: 'sine', dur: 0.3, vol: 0.2 }); },
    /* the player bleeds ink */
    hurt() {
      tone({ f: 130, f2: 42, type: 'sawtooth', dur: 0.3, vol: 0.24 });
      noise({ dur: 0.22, vol: 0.17, lp: 420, q: 1 });
      noise({ dur: 0.08, vol: 0.06, hp: 900, delay: 0.02 });
    },
    /* taiko announces the wave */
    wave(surge) {
      tone({ f: 108, f2: 44, type: 'sine', dur: 0.42, vol: surge ? 0.34 : 0.26 });
      noise({ dur: 0.06, vol: 0.1, lp: 300, delay: 0.004 });
      if (surge) {
        tone({ f: 96, f2: 40, type: 'sine', dur: 0.5, vol: 0.3, delay: 0.24 });
        tone({ f: 1308, type: 'triangle', dur: 0.2, vol: 0.05, delay: 0.24 });
      }
    },
    /* pentatonic selection pluck (D minor pentatonic-ish) */
    pick(step) {
      const scale = [587.3, 698.5, 784, 880];
      tone({ f: scale[step % 4], type: 'triangle', dur: 0.09, vol: 0.07 });
    },
    deploy() {
      tone({ f: 587.3, type: 'triangle', dur: 0.1, vol: 0.1 });
      tone({ f: 880, type: 'triangle', dur: 0.14, vol: 0.1, delay: 0.08 });
      splat(0.6, 0.08);
    },
    tick() { tone({ f: 1250, type: 'square', dur: 0.03, vol: 0.035 }); },
    /* spear creature winds up */
    wind() { tone({ f: 220, f2: 440, type: 'sawtooth', dur: 0.16, vol: 0.028 }); },
    /* the spitter lobs a glob */
    glob() {
      tone({ f: 340, f2: 150, type: 'triangle', dur: 0.07, vol: 0.05 });
      noise({ dur: 0.04, vol: 0.03, lp: 1200, q: 1.2 });
    },
    /* black tide breathes outward */
    nova() {
      noise({ dur: 0.3, vol: 0.1, lp: 520, q: 1.1 });
      tone({ f: 180, f2: 46, type: 'sine', dur: 0.32, vol: 0.16 });
    },
    /* the paper ward drinks a blow */
    ward() {
      tone({ f: 660, f2: 990, type: 'triangle', dur: 0.08, vol: 0.09 });
      tone({ f: 1320, type: 'square', dur: 0.03, vol: 0.04, delay: 0.05 });
      noise({ dur: 0.06, vol: 0.05, hp: 1400, delay: 0.01 });
    },
    /* the shade blinks */
    blink() {
      noise({ dur: 0.09, vol: 0.05, hp: 900, lp: 3200, q: 1.4 });
      tone({ f: 520, f2: 1240, type: 'sine', dur: 0.07, vol: 0.035 });
    },
    /* the scroll turns — a low bronze gong with a breath of shimmer */
    gong() {
      tone({ f: 138, f2: 128, type: 'sine', dur: 1.3, vol: 0.3 });
      tone({ f: 276, f2: 252, type: 'triangle', dur: 0.9, vol: 0.1, delay: 0.02 });
      tone({ f: 552, f2: 530, type: 'sine', dur: 0.6, vol: 0.045, delay: 0.04 });
      noise({ dur: 0.5, vol: 0.05, hp: 1800, q: 1.2, delay: 0.02 });
    },
    /* the folded fan snaps open */
    fan() {
      noise({ dur: 0.07, vol: 0.06, hp: 1400, lp: 5200, q: 1.6 });
      tone({ f: 740, f2: 1180, type: 'triangle', dur: 0.05, vol: 0.04 });
    },
    /* the spirit scribes wake */
    spirit() {
      tone({ f: 880, f2: 1320, type: 'sine', dur: 0.12, vol: 0.045 });
      tone({ f: 1174, type: 'triangle', dur: 0.08, vol: 0.03, delay: 0.07 });
    },
    /* the crimson hanko falls — a stamp, a knock, a thud */
    hanko() {
      tone({ f: 96, f2: 36, type: 'sine', dur: 0.28, vol: 0.3 });
      noise({ dur: 0.09, vol: 0.14, lp: 700, q: 1.1 });
      tone({ f: 1650, type: 'square', dur: 0.03, vol: 0.05, delay: 0.015 });
    },
    /* the sniper fires its needle */
    needle() {
      tone({ f: 1900, f2: 900, type: 'square', dur: 0.045, vol: 0.04 });
      noise({ dur: 0.035, vol: 0.035, hp: 2200 });
    },
    /* a guardian enters the sheet */
    elite() {
      tone({ f: 82, f2: 34, type: 'sine', dur: 0.7, vol: 0.32 });
      tone({ f: 110, f2: 55, type: 'sine', dur: 0.5, vol: 0.2, delay: 0.22 });
      noise({ dur: 0.4, vol: 0.1, lp: 300, delay: 0.05 });
    },
    /* three sheets painted — the scroll ends */
    victory() {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.3, vol: 0.11, delay: i * 0.16 }));
      tone({ f: 130, f2: 65, type: 'sine', dur: 0.8, vol: 0.2, delay: 0.64 });
    },
    /* the ink dries — a long, low exhale */
    over() {
      [392, 311, 233, 155].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.3, vol: 0.13, delay: i * 0.2 }));
      splat(2.6, 0.1);
      tone({ f: 72, f2: 30, type: 'sine', dur: 1.1, vol: 0.22, delay: 0.35 });
    },

    /* ---- v4: the five scrolls ---- */
    /* a mote of ink finds the brush */
    pickup() {
      tone({ f: 1560, f2: 2100, type: 'sine', dur: 0.045, vol: 0.022 });
    },
    /* the paper mends / the pot is drunk */
    heal() {
      tone({ f: 660, f2: 880, type: 'sine', dur: 0.12, vol: 0.07 });
      tone({ f: 990, type: 'triangle', dur: 0.1, vol: 0.05, delay: 0.09 });
    },
    /* the magnet talisman gathers everything */
    magnet() {
      tone({ f: 320, f2: 1240, type: 'sine', dur: 0.3, vol: 0.07 });
      noise({ dur: 0.24, vol: 0.05, hp: 800, lp: 3600, q: 1.2 });
    },
    /* the ink bomb swallows the sheet */
    bomb() {
      tone({ f: 120, f2: 30, type: 'sine', dur: 0.5, vol: 0.34 });
      noise({ dur: 0.4, vol: 0.2, lp: 500, q: 0.9 });
      noise({ dur: 0.1, vol: 0.09, hp: 1200, delay: 0.01 });
    },
    /* the guardian's chest unseals */
    chest() {
      [784, 988, 1175].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.14, vol: 0.08, delay: i * 0.09 }));
      splat(1.2, 0.28);
    },
    /* thunder over the storm sheet */
    thunder() {
      noise({ dur: 0.7, vol: 0.16, lp: 380, q: 0.7 });
      noise({ dur: 0.12, vol: 0.1, hp: 900, delay: 0.02 });
      tone({ f: 88, f2: 34, type: 'sine', dur: 0.55, vol: 0.16, delay: 0.03 });
    },
    /* the sumi arc leaps */
    arc() {
      tone({ f: 1750, f2: 420, type: 'sawtooth', dur: 0.07, vol: 0.045 });
      noise({ dur: 0.05, vol: 0.04, hp: 2000 });
    },
    /* the returning stroke whips out */
    boomer() {
      noise({ dur: 0.12, vol: 0.05, hp: 700, lp: 2800, q: 2 });
      tone({ f: 520, f2: 900, type: 'triangle', dur: 0.1, vol: 0.04 });
    },
    /* the vortex opens */
    vortex() {
      tone({ f: 240, f2: 95, type: 'sine', dur: 0.55, vol: 0.14 });
      noise({ dur: 0.5, vol: 0.07, lp: 700, q: 1.6 });
    },
    /* the gate turns a frontal stroke */
    ping() {
      tone({ f: 1980, f2: 1400, type: 'square', dur: 0.035, vol: 0.03 });
    },
  };
})();
