/* Радио ИрадОдин: веб-трансляция (HTML5). Нужны odin.js (ODIN.day) и wheel.js. Звук идёт с iradone.com (сеть Radio Irad). */
document.addEventListener("DOMContentLoaded", function () {
  var box = document.getElementById("odin-live");
  if (!box || !window.IradWheel || !window.ODIN) return;
  var H = 3600000, DOWS = ["в воскресенье", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function root() { var s = document.querySelector("script[src*='odin-radio.js']"); return s ? s.getAttribute("src").replace(/js\/odin-radio\.js.*$/, "") : ""; }
  function getJson(u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw r; return r.json(); }); }
  function asLocal(ms) { var d = new Date(ms); return new Date(ms + d.getTimezoneOffset() * 60000 + 6 * H); } /* fields read as Nurzhan time */
  function midnight(ms) { var d = new Date(ms + 6 * H); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 6 * H; }
  function hm(ms) { var d = new Date(ms + 6 * H); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
  function when(ms, now) {
    var n = Math.round((midnight(ms) - midnight(now)) / 86400000);
    return (n === 0 ? "сегодня" : n === 1 ? "завтра" : DOWS[new Date(ms + 6 * H).getUTCDay()]) + " в " + hm(ms);
  }
  Promise.all([getJson(root() + "data/radio.json"), getJson(root() + "data/wheel.json")]).then(function (r) {
    var radio = r[0], wheel = r[1];
    function slot(ms) {
      var m0 = midnight(ms), m = (ms - m0) / 60000, base = m < 300 ? m0 - 86400000 : m0;
      if (m < 300) m += 1440;
      var L = ODIN.day(radio, asLocal(base + 12 * H)), i = -1;
      L.forEach(function (s, k) { if (s.m <= m) i = k; });
      if (i < 0) return { off: true, endMs: base + L[0].m * 60000 };
      var end = L[i + 1] ? L[i + 1].m : 1740;
      return { id: L[i].id, title: L[i].title, startMs: base + L[i].m * 60000, endMs: base + end * 60000 };
    }
    var W = IradWheel.create({ wheel: wheel, slot: slot, base: box.getAttribute("data-base") || "https://iradone.com/radio/" });
    var btn = box.querySelector("button"), line = box.querySelector(".l1"), sub = box.querySelector(".l2"), audio = box.querySelector("audio");
    var p = W.player(audio, function (st) {
      var it = st.item, now = W.now();
      btn.innerHTML = st.armed ? "&#9632; Стоп" : "&#9658; Слушать";
      if (st.error) { line.innerHTML = "Не удалось подключиться к трансляции."; sub.innerHTML = "Попробуйте позже или слушайте нас на 101,7 FM."; return; }
      if (it.track) {
        line.innerHTML = (st.playing ? "Звучит: " : "В интернет-эфире: ") + "<b>" + it.track.title + "</b>";
        sub.innerHTML = it.track.by + " · " + it.slot.title + ", " + hm(it.slot.startMs);
        return;
      }
      line.innerHTML = it.slot && !it.slot.off ? "В эфире на FM: <b>" + it.slot.title + "</b>" : "Перерыв в вещании";
      sub.innerHTML = st.next ? (st.armed ? "Не закрывайте страницу: " : "") + "интернет-трансляция начнётся " + when(st.next.ms, now) + " (" + st.next.track.title.replace(/^Государственный гимн /, "гимн ") + ")." : "";
    });
    btn.disabled = false;
    btn.addEventListener("click", function () { p.toggle(); });
  }).catch(function () { var l = box.querySelector(".l1"); if (l) l.innerHTML = "Трансляция временно недоступна."; });
});
