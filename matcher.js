// Quote matcher: finds the Bible verse a spoken phrase is quoting.
// Usage: const qm = createMatcher(BIBLE, {BSB: chapters, ...}); qm.match("for god so loved the world that he gave", {level:'balanced'})
(function (root) {
  const MAP = {
    thou: 'you', thee: 'you', ye: 'you', thy: 'your', thine: 'your', yours: 'your',
    hath: 'have', hast: 'have', has: 'have', had: 'have', hadst: 'have',
    doth: 'do', doeth: 'do', dost: 'do', does: 'do', did: 'do', didst: 'do',
    saith: 'say', said: 'say', says: 'say', sayest: 'say', spake: 'speak', spoke: 'speak', spoken: 'speak',
    unto: 'to', art: 'are', shalt: 'shall', wilt: 'will', wast: 'was', wert: 'were',
    whosoever: 'whoever', whatsoever: 'whatever', wheresoever: 'wherever', whomsoever: 'whoever',
    gave: 'give', given: 'give', came: 'come', went: 'go', gone: 'go', knew: 'know', known: 'know',
    men: 'man', children: 'child', brethren: 'brother', brothers: 'brother',
    shew: 'show', shewed: 'show', sheweth: 'show', behold: 'behold', verily: 'truly',
    everlasting: 'eternal', begotten: 'only', mine: 'my', an: 'a', o: 'oh',
  };
  const LEVELS = { strict: { score: 21, words: 6 }, balanced: { score: 15.5, words: 5 }, loose: { score: 12, words: 4 } };

  function stem(w) {
    if (MAP[w]) w = MAP[w];
    const n = w.length;
    if (n > 4 && w.endsWith('eth')) w = w.slice(0, -3);
    else if (n > 5 && w.endsWith('est')) w = w.slice(0, -3);
    else if (n > 5 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (n > 4 && w.endsWith('ed')) w = w.slice(0, -2);
    else if (n > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
    return MAP[w] || w;
  }
  function tokens(text) {
    return text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean).map(stem);
  }

  // extra: other translations to recognise quotes from, {code: [book][chapter][verse] text}
  function createMatcher(BIBLE, extra) {
    const verses = [];                 // {g, b, c, v, ver, t: [tokens]}; g numbers verses the same in every translation
    const df = new Map();              // token -> number of verses containing it
    const grams = new Map();           // "a b" -> [entry ids]
    const sources = [['KJV', BIBLE.map(([, ch]) => ch)]].concat(Object.entries(extra || {}));
    sources.forEach(([ver, books]) => { let g = 0; books.forEach((chapters, b) => chapters.forEach((ch, ci) => ch.forEach((text, vi) => {
      const gid = g++;
      if (!text) return;
      const t = tokens(text);
      if (ver !== 'KJV' && verses.length && verses[gid] && verses[gid].t.join(' ') === t.join(' ')) return;   // same wording as KJV
      const id = verses.length;
      verses.push({ g: gid, b, c: ci + 1, v: vi + 1, ver, t });
      new Set(t).forEach((w) => df.set(w, (df.get(w) || 0) + 1));
      for (let i = 0; i + 1 < t.length; i++) {
        const g = t[i] + ' ' + t[i + 1];
        let list = grams.get(g);
        if (!list) grams.set(g, (list = []));
        if (list[list.length - 1] !== id) list.push(id);
      }
    }))); });
    const N = verses.length;
    const weight = (w) => { const d = df.get(w); return d ? Math.min(6, Math.log(N / d)) : 0; };

    // Local alignment of spoken words (W) against a verse (V). Rare words count for more.
    function align(W, V) {
      const n = W.length, m = V.length;
      let prevS = new Float32Array(m + 1), prevM = new Uint8Array(m + 1);
      let best = { score: 0, words: 0, end: 0 };
      for (let i = 1; i <= n; i++) {
        const curS = new Float32Array(m + 1), curM = new Uint8Array(m + 1);
        const wi = W[i - 1], wt = weight(wi);
        for (let j = 1; j <= m; j++) {
          let s, k;
          if (wi === V[j - 1]) { s = prevS[j - 1] + Math.max(0.3, wt); k = prevM[j - 1] + 1; }
          else { s = prevS[j - 1] - 1.5; k = prevM[j - 1]; }
          if (prevS[j] - 1 > s) { s = prevS[j] - 1; k = prevM[j]; }
          if (curS[j - 1] - 1 > s) { s = curS[j - 1] - 1; k = curM[j - 1]; }
          if (s <= 0) { s = 0; k = 0; }
          curS[j] = s; curM[j] = k;
          if (s > best.score) best = { score: s, words: k, end: i };
        }
        prevS = curS; prevM = curM;
      }
      return best;
    }

    // Returns the best matches for the spoken text, strongest first.
    function match(text, opts) {
      opts = opts || {};
      const lvl = LEVELS[opts.level] || LEVELS.balanced;
      const W = (Array.isArray(text) ? text : tokens(text)).slice(-45);
      if (W.length < 3) return [];
      const cand = new Map();
      for (let i = 0; i + 1 < W.length; i++) {
        const list = grams.get(W[i] + ' ' + W[i + 1]);
        if (!list || list.length > 500) continue;
        const w = Math.log(N / list.length);
        for (const id of list) cand.set(id, (cand.get(id) || 0) + w);
      }
      const top = [...cand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12 + 6 * (sources.length - 1));
      const byVerse = new Map();       // best result per verse, whichever translation matched it
      for (const [id] of top) {
        const vs = verses[id];
        const a = align(W, vs.t);
        const whole = a.words >= vs.t.length && vs.t.length >= 3;           // a short verse quoted in full
        if (a.score >= lvl.score && a.words >= lvl.words || whole && a.score >= 11) {
          const prev = byVerse.get(vs.g);
          if (!prev || a.score > prev.score) byVerse.set(vs.g, { id: vs.g, entry: id, version: vs.ver, book: vs.b, chapter: vs.c, verse: vs.v, score: a.score, words: a.words, end: a.end, atEnd: a.end >= W.length });
        }
      }
      const out = [...byVerse.values()];
      out.sort((x, y) => y.score - x.score || x.id - y.id);
      if (!out.length) return [];
      let best = out[0];
      if (opts.prefer != null) {            // when it is a near tie, stay on the verse being read or move to the next one
        const near = out.find((o) => o.score >= best.score - 1 && (o.id === opts.prefer || o.id === opts.prefer + 1));
        if (near) best = near;
      }
      const rival = out.find((o) => o.id !== best.id && verses[o.entry].t.join(' ') !== verses[best.entry].t.join(' '));
      best.margin = rival ? best.score - rival.score : 99;
      best.label = BIBLE[best.book][0] + ' ' + best.chapter + ':' + best.verse;
      best.key = best.book + '.' + best.chapter + '.' + best.verse + '.';
      best.verseEnd = null; best.chapterOnly = false; best.quote = true;
      return [best];
    }

    return { match, tokens };
  }

  root.createMatcher = createMatcher;
  if (typeof module !== 'undefined') module.exports = { createMatcher };
})(typeof window !== 'undefined' ? window : globalThis);
