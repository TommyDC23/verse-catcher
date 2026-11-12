// Scripture reference detector. Works in the browser and in Node (for tests).
// Usage: const det = createDetector(BIBLE); det.detect("john chapter three verse sixteen")
// BIBLE is an array of [bookName, [[verse, ...], ...]] in canonical order.
(function (root) {
  const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

  // Extra spoken names for each book (the canonical name is always included).
  const ALIASES = {
    Psalms: ['psalm', 'psalms', 'palm', 'palms'],
    'Song of Solomon': ['song of solomon', 'song of songs', 'songs of solomon', 'canticles'],
    Revelation: ['revelation', 'revelations'],
    Ecclesiastes: ['ecclesiastes', 'ecclesiaste'],
    Philippians: ['philippians', 'philippian'],
    Colossians: ['colossians', 'colossian'],
    Galatians: ['galatians', 'galatian'],
    Ephesians: ['ephesians', 'ephesian'],
    Hebrews: ['hebrews', 'hebrew'],
    Romans: ['romans', 'roman'],
    Proverbs: ['proverbs', 'proverb'],
    Acts: ['acts', 'acts of the apostles', 'act'],
    Judges: ['judges'],
    Habakkuk: ['habakkuk', 'habakuk', 'habbakuk'],
    Philemon: ['philemon'],
    Corinthians: ['corinthians', 'corinthian'],
    Thessalonians: ['thessalonians', 'thessalonian'],
    Chronicles: ['chronicles', 'chronicle'],
    Kings: ['kings', 'king'],
    Samuel: ['samuel'],
    Timothy: ['timothy'],
    Peter: ['peter'],
    John: ['john'],
  };
  const PREFIX = { '1': 1, '1st': 1, first: 1, i: 1, '2': 2, '2nd': 2, second: 2, ii: 2, '3': 3, '3rd': 3, third: 3, iii: 3 };

  function wordsToDigits(text) {
    const t = text.split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < t.length; i++) {
      const w = t[i];
      if (w in UNITS) {
        let v = UNITS[w];
        if (v > 0 && t[i + 1] === 'hundred') {
          v *= 100; i++;
          if (t[i + 1] === 'and' && (t[i + 2] in UNITS || t[i + 2] in TEENS || t[i + 2] in TENS)) i++;
          const n = t[i + 1];
          if (n in TENS) { v += TENS[n]; i++; if (t[i + 1] in UNITS && UNITS[t[i + 1]] > 0) { v += UNITS[t[i + 1]]; i++; } }
          else if (n in TEENS) { v += TEENS[n]; i++; }
          else if (n in UNITS && UNITS[n] > 0) { v += UNITS[n]; i++; }
        }
        out.push(String(v));
      } else if (w in TEENS) {
        out.push(String(TEENS[w]));
      } else if (w in TENS) {
        let v = TENS[w];
        if (t[i + 1] in UNITS && UNITS[t[i + 1]] > 0) { v += UNITS[t[i + 1]]; i++; }
        out.push(String(v));
      } else out.push(w);
    }
    return out.join(' ');
  }

  function normalize(text) {
    let s = ' ' + text.toLowerCase() + ' ';
    s = s.replace(/[’']/g, '');
    s = s.replace(/(\d)\s*[:.]\s*(\d)/g, '$1 : $2');        // 3:16 or 3.16
    s = s.replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 to $2');       // 16-18
    s = s.replace(/[^a-z0-9: ]+/g, ' ');
    s = s.replace(/-/g, ' ');
    s = wordsToDigits(s);
    return ' ' + s.replace(/\s+/g, ' ').trim() + ' ';
  }

  function createDetector(BIBLE) {
    const lookup = {};   // "1 john" -> book index, "john" -> book index
    const names = new Set();
    const hasPrefix = new Set();
    BIBLE.forEach(([name], idx) => {
      const m = name.match(/^([123]) (.+)$/);
      const base = m ? m[2] : name;
      const list = (ALIASES[base] || [base.toLowerCase()]).slice();
      if (!list.includes(base.toLowerCase())) list.push(base.toLowerCase());
      list.forEach((a) => {
        names.add(a);
        if (m) { lookup[m[1] + ' ' + a] = idx; hasPrefix.add(a); }
        else lookup[a] = idx;
      });
    });
    const alt = [...names].sort((a, b) => b.length - a.length).join('|');
    const NUM = '(\\d{1,3})';
    const re = new RegExp(
      ' (?:(1|2|3|1st|2nd|3rd|first|second|third|i|ii|iii) )?(' + alt + ')' +
      '(?: (?:chapter|chapters|chap|ch))?(?: number)? ' + NUM +
      '(?:(?: :| verse| verses| vs| v| from verse| and verse| reading from verse)? ' + NUM +
      '(?: (?:to|through|thru|till|until|down to|and)(?: verse)? ' + NUM + ')?)?(?= )',
      'g'
    );
    const single = [];
    BIBLE.forEach(([name, ch]) => { if (ch.length === 1) single.push(name.toLowerCase().replace(/^[123] /, '')); });
    const reSingle = new RegExp(' (?:(1|2|3|1st|2nd|3rd|first|second|third|i|ii|iii) )?(' + [...new Set(single)].join('|') + ') (?:verse|verses|vs|v) ' + NUM + '(?: (?:to|through|thru|till|until|and)(?: verse)? ' + NUM + ')?(?= )', 'g');
    const reVerseOnly = / (?:verse|verses) (\d{1,3})(?: (?:to|through|thru|till|until|and)(?: verse)? (\d{1,3}))?(?= )/g;

    function build(bi, ch, vs, ve, extra) {
      const chapters = BIBLE[bi][1];
      if (chapters.length === 1 && vs == null) { vs = ch; ch = 1; }      // "Jude 5"
      if (ch < 1 || ch > chapters.length) return null;
      const count = chapters[ch - 1].length;
      const chapterOnly = vs == null;
      if (chapterOnly) vs = 1;
      if (vs < 1 || vs > count) return null;
      if (ve != null && (ve <= vs || ve > count)) ve = null;
      const name = BIBLE[bi][0];
      const label = name + ' ' + ch + (chapterOnly ? '' : ':' + vs + (ve ? '-' + ve : ''));
      return Object.assign({ book: bi, chapter: ch, verse: vs, verseEnd: ve || null, chapterOnly, label, key: bi + '.' + ch + '.' + vs + '.' + (ve || '') }, extra || {});
    }

    // context: an earlier result (from detect) so a bare "verse 17" can be resolved.
    function detect(text, context) {
      const s = normalize(text);
      const found = [];
      const covered = [];
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(s))) {
        const [whole, pre, book, c, v, e] = m;
        let bi;
        if (pre && lookup[PREFIX[pre] + ' ' + book] != null) bi = lookup[PREFIX[pre] + ' ' + book];
        else if (lookup[book] != null) bi = lookup[book];
        else { re.lastIndex = m.index + 1; continue; }                  // "corinthians 13" without a number
        const r = build(bi, +c, v ? +v : null, e ? +e : null, { index: m.index, end: m.index + whole.length });
        if (r) { found.push(r); covered.push([m.index, m.index + whole.length]); }
        re.lastIndex = m.index + whole.length - 0;                      // lookahead keeps the trailing space
      }
      reSingle.lastIndex = 0;
      while ((m = reSingle.exec(s))) {
        const key = m[1] ? PREFIX[m[1]] + ' ' + m[2] : m[2];
        const bi = lookup[key];
        if (bi == null || BIBLE[bi][1].length !== 1) continue;
        const r = build(bi, 1, +m[3], m[4] ? +m[4] : null, { index: m.index, end: m.index + m[0].length });
        if (r) { found.push(r); covered.push([m.index, m.index + m[0].length]); }
      }
      reVerseOnly.lastIndex = 0;
      while ((m = reVerseOnly.exec(s))) {
        if (covered.some(([a, b]) => m.index >= a && m.index < b)) continue;
        const prev = found.filter((f) => f.index < m.index).pop() || context;
        if (!prev) continue;
        const r = build(prev.book, prev.chapter, +m[1], m[2] ? +m[2] : null, { index: m.index, end: m.index + m[0].length, fromContext: true });
        if (r) found.push(r);
      }
      found.forEach((f) => { f.atEnd = f.end >= s.length - 1; });
      found.sort((a, b) => a.index - b.index);
      // "John 3 ... verse 16" in one phrase: drop the chapter-only hit in favour of the fuller one.
      return found.filter((f, i) => !(f.chapterOnly && found[i + 1] && found[i + 1].fromContext && found[i + 1].book === f.book && found[i + 1].chapter === f.chapter));
    }

    return { detect, normalize };
  }

  root.createDetector = createDetector;
  if (typeof module !== 'undefined') module.exports = { createDetector };
})(typeof window !== 'undefined' ? window : globalThis);
