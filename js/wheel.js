/* Radio wheel: what a station's web stream is playing at a given moment.
 *
 * Everyone hears the same thing at the same minute: the item and the offset into it come from the clock, not from
 * page load, so no streaming server is needed. The station's schedule says which programme is on (the page passes a
 * slot(ms) function); the wheel file says what audio goes with it:
 *   tracks   { id: { src, title, by, dur } }      dur in seconds
 *   cues     { showId: [trackId | {track, at}] }  played in turn from the start of the programme (or `at`
 *                                                 seconds into it)
 *   rotation { showId: [trackId, ...] }           after the cues, looped for the rest of the programme in an order
 *                                                 shuffled by the date, so the day's running order is fixed;
 *                                                 "*" is every programme not listed in `talk`
 * Station furniture (GTA-style loop, 11 Nov 2026; optional, per programme or "*"):
 *   pools    { name: [trackId, ...] }             picked in a date-shuffled cycle, so no repeat until all are used
 *   clock    { showId|"*": [{ at: minute, play: [ref, ...] }] }   items due at that minute of every hour; a song is
 *                                                 never cut: the items wait for it to end, as on a real playout
 *   links    { showId|"*": { pool: name, every: n } }   a link from the pool before every n-th song
 *   intro    { songId: trackId }                  played just before that song
 *   A ref is a track id, "@pool" (the next pick from that pool) or "@time" (track "time-HH" for the Irad hour).
 *   With a clock and no songs yet, only the furniture plays and the gaps are silent.
 * slot(ms) returns { id, title, startMs, endMs } or { off: true, endMs } (closed down until endMs).
 */
(function (global) {
  "use strict";

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffled(list, seed) {
    var a = list.slice(), x = seed || 1;
    for (var i = a.length - 1; i > 0; i--) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; var j = (x >>> 0) % (i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function create(opts) {
    var W = opts.wheel || {}, T = W.tracks || {}, base = opts.base || "";
    function track(id) { var t = T[id]; return t ? { id: id, src: base + t.src, title: t.title, by: t.by || "", dur: t.dur } : null; }
    function now() {
      try { if (global.IradClock && global.IradClock.now) { var v = global.IradClock.now(); return v && v.getTime ? v.getTime() : +v; } } catch (e) {}
      return Date.now();
    }

    function pick(map, id) { return map && (map[id] || ((W.talk || []).indexOf(id) < 0 && map["*"])) || null; }
    var hourOf = opts.hourOf || function (ms) { return new Date(ms + 6 * 3600000).getUTCHours(); };   // Irad Time, UTC+6

    // Clock mode: the programme's running order from its start, until `upto` (ms). [{ track, startMs }]
    function timeline(s, cueEnd, upto) {
      var day = new Date(s.startMs).toISOString().slice(0, 10), out = [], cur = cueEnd, n = 0, k;
      var marks = [], C = pick(W.clock, s.id) || [], L = pick(W.links, s.id), I = W.intro || {}, P = W.pools || {}, used = {};
      for (var h = s.startMs - (s.startMs % 3600000) - 3600000; h < s.endMs; h += 3600000)
        for (k = 0; k < C.length; k++) { var m = h + C[k].at * 60000; if (m >= cueEnd && m < s.endMs) marks.push({ ms: m, play: C[k].play }); }
      marks.sort(function (a, b) { return a.ms - b.ms; });
      var R = W.rotation || {}, songs = shuffled(pick(R, s.id) || [], hash(day + s.id)).map(track).filter(Boolean);
      function ref(r, markMs) {
        if (r === "@time") { var hh = hourOf(markMs + 30000); return track("time-" + (hh < 10 ? "0" : "") + hh); }
        if (r.charAt(0) === "@") {
          var name = r.slice(1), list = P[name] || []; if (!list.length) return null;
          var i = used[name] = (used[name] || 0) + 1, order = shuffled(list, hash(day + s.id + name));
          return track(order[(i - 1) % order.length]);
        }
        return track(r);
      }
      function add(t) { if (t) { out.push({ track: t, startMs: cur }); cur += t.dur * 1000; } }
      var mi = 0, guard = 0;
      while (cur <= upto && cur < s.endMs && guard++ < 5000) {
        if (mi < marks.length && marks[mi].ms <= cur) { var mk = marks[mi++]; for (k = 0; k < mk.play.length; k++) add(ref(mk.play[k], mk.ms)); continue; }
        if (!songs.length) { if (mi < marks.length) { cur = marks[mi].ms; continue; } break; }
        var song = songs[n % songs.length];
        if (L && L.every && n % L.every === 0) add(ref("@" + L.pool, cur));
        if (I[song.id]) add(track(I[song.id]));
        add(song); n++;
      }
      return out;
    }

    // { slot, track, offset (s), untilMs } or { slot, track: null }
    function at(ms) {
      var s = opts.slot(ms);
      if (!s || s.off) return { slot: s, track: null };
      var t = (ms - s.startMs) / 1000, i, tr, pos = 0;
      var cues = (W.cues || {})[s.id] || [];
      for (i = 0; i < cues.length; i++) {          // a cue is a track id, or { track, at } to start `at` s in
        var c = typeof cues[i] === "string" ? { track: cues[i] } : cues[i];
        tr = track(c.track); if (!tr) continue;
        if (c.at !== undefined) pos = c.at;
        if (t >= pos && t < pos + tr.dur) return { slot: s, track: tr, offset: t - pos, untilMs: ms + (pos + tr.dur - t) * 1000 };
        pos += tr.dur;
      }
      t -= pos;
      if (t < 0) return { slot: s, track: null };
      if (pick(W.clock, s.id)) {
        var tl = timeline(s, s.startMs + pos * 1000, ms);
        for (i = tl.length - 1; i >= 0; i--) {
          var e = tl[i], end = e.startMs + e.track.dur * 1000;
          if (e.startMs <= ms) return ms < end ? { slot: s, track: e.track, offset: (ms - e.startMs) / 1000, untilMs: Math.min(end, s.endMs) } : { slot: s, track: null };
        }
        return { slot: s, track: null };
      }
      var R = W.rotation || {}, pool = (R[s.id] || ((W.talk || []).indexOf(s.id) < 0 && R["*"]) || []).map(track).filter(Boolean);
      if (!pool.length) return { slot: s, track: null };
      var order = shuffled(pool, hash(new Date(s.startMs).toISOString().slice(0, 10) + s.id));
      var total = order.reduce(function (a, b) { return a + b.dur; }, 0);
      t = t % total;
      for (i = 0; i < order.length; i++) {
        if (t < order[i].dur) {
          var until = Math.min(ms + (order[i].dur - t) * 1000, s.endMs);
          return { slot: s, track: order[i], offset: t, untilMs: until };
        }
        t -= order[i].dur;
      }
      return { slot: s, track: null };
    }

    // The next moment (within `days`) the web stream has something: { ms, slot, track }
    function next(ms, days) {
      var limit = ms + (days || 8) * 86400000, guard = 0, s;
      while (ms < limit && guard++ < 400) {
        s = opts.slot(ms);
        if (!s) return null;
        if (!s.off && pick(W.clock, s.id)) {
          var tl = timeline(s, s.startMs, Math.min(s.endMs, Math.max(ms, s.startMs) + 2 * 3600000));
          for (var j = 0; j < tl.length; j++) if (tl[j].startMs > ms - 1) return { ms: tl[j].startMs, slot: s, track: tl[j].track };
        } else if (!s.off) {
          var c0 = ((W.cues || {})[s.id] || [])[0], at0 = c0 && typeof c0 === "object" && c0.at ? c0.at * 1000 : 0;
          var first = c0 ? track(typeof c0 === "string" ? c0 : c0.track) : null;
          var R = W.rotation || {}, rot = (R[s.id] || ((W.talk || []).indexOf(s.id) < 0 && R["*"]) || []).map(track).filter(Boolean);
          if ((first || rot.length) && s.startMs + at0 > ms - 1) return { ms: s.startMs + at0, slot: s, track: first || rot[0] };
        }
        ms = Math.max(s.endMs, ms + 60000);
      }
      return null;
    }

    // A player on an <audio> element. ui(state) is called on every change: state.playing (bool), state.item (at()),
    // state.next (next()), state.error.
    function player(audio, ui) {
      var on = false, cur = null, timer = null;
      function draw(extra) {
        var ms = now(), it = at(ms);
        ui({ playing: on && !!cur, armed: on, item: it, next: it.track ? null : next(ms), error: extra && extra.error });
        return it;
      }
      function load() {
        clearTimeout(timer);
        var it = draw();
        if (!on) return;
        if (!it.track) { cur = null; audio.pause(); timer = setTimeout(load, 30000); return; }
        if (!cur || cur.id !== it.track.id || Math.abs(audio.currentTime - it.offset) > 4) {
          cur = it.track;
          audio.src = it.track.src;
          var seek = function () { audio.removeEventListener("loadedmetadata", seek); try { audio.currentTime = at(now()).offset || 0; } catch (e) {} };
          audio.addEventListener("loadedmetadata", seek);
          var p = audio.play(); if (p && p.catch) p.catch(function () { on = false; cur = null; draw({ error: true }); });
          draw();
        }
        timer = setTimeout(load, Math.max(1000, Math.min(30000, it.untilMs - now() + 300)));
      }
      audio.addEventListener("ended", function () { cur = null; load(); });
      audio.addEventListener("error", function () { if (on) { on = false; cur = null; draw({ error: true }); } });
      draw();
      setInterval(function () { if (!on) draw(); }, 30000);
      return {
        toggle: function () { on = !on; if (!on) { audio.pause(); cur = null; clearTimeout(timer); draw(); } else load(); return on; },
        refresh: draw
      };
    }

    return { at: at, next: next, now: now, player: player, track: track };
  }

  global.IradWheel = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
