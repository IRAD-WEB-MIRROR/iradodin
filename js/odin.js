/* ИрадОдин Онлайн v2.3 */
var ODIN = (function () {
  var MON = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  var DOW = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
  var DOWS = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function irNow() { var d = new Date(); return new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 6 * 3600000); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dayNo(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  function $(id) { return document.getElementById(id); }
  function getJson(u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw r; return r.json(); }); }
  function root() { var s = document.querySelector("script[src*='odin.js']"); return s ? s.getAttribute("src").replace(/js\/odin\.js.*$/, "") : ""; }
  function min(t) { var p = t.split(":"); var m = +p[0] * 60 + +p[1]; return m < 300 ? m + 1440 : m; } /* day runs 05:00-05:00 */

  /* one day of the grid */
  function day(data, d) {
    var n = dayNo(d), wd = d.getDay(), F = data.films || [];
    var out = data.grid.map(function (s) {
      var id = (s.days && s.days[wd]) || s.show; return { t: s.t, id: id };
    });
    (data.specials || []).forEach(function (sp) {
      if (sp.date !== iso(d)) return;
      var a = min(sp.from), b = min(sp.to);
      out = out.filter(function (s) { var m = min(s.t); return m < a || m >= b; }).concat(sp.slots.map(function (s) { return { t: s.t, id: s.show }; }));
    });
    out.sort(function (x, y) { return min(x.t) - min(y.t); });
    return out.map(function (s) {
      var sh = data.shows[s.id] || { title: s.id };
      var title = sh.title.replace("{film1}", F.length ? F[n % F.length] : "").replace("{film2}", F.length ? F[(n + 4) % F.length] : "");
      return { t: s.t, m: min(s.t), title: title, desc: sh.desc || "", hl: !!sh.hl, id: s.id };
    });
  }
  /* broadcast date: before 05:00 belongs to the day before */
  function bday(now) { var d = new Date(now); if (now.getHours() < 5) d.setDate(d.getDate() - 1); return d; }
  function nowIndex(L, now) {
    var m = now.getHours() * 60 + now.getMinutes(); if (m < 300) m += 1440;
    var cur = -1; L.forEach(function (s, i) { if (s.m <= m) cur = i; }); return cur;
  }
  function onAir(data, now) {
    var L = day(data, bday(now)), i = nowIndex(L, now);
    if (i < 0 || L[i].id === "signoff") return { off: true, next: "06:00" };
    return { off: false, cur: L[i], next: L[i + 1] };
  }
  function row(s, cls) {
    return '<tr class="' + (cls || "") + (s.hl ? " hl" : "") + '"><td class="t">' + s.t + '</td><td><b>' + s.title + "</b>" + (s.desc ? '<div class="d">' + s.desc + "</div>" : "") + "</td></tr>";
  }

  function header() {
    var n = irNow(), el = $("odin-date");
    if (el) el.innerHTML = DOW[n.getDay()] + ", " + n.getDate() + " " + MON[n.getMonth()] + " " + n.getFullYear() + " г., <b>" + pad(n.getHours()) + ":" + pad(n.getMinutes()) + "</b> (Нуржан)";
    getJson("https://iradone.com/data/today.json").then(function (d) {
      var rows = d.rates && d.rates.official && d.rates.official.rows || [], s = [];
      rows.forEach(function (r) { if ({ USD: 1, EUR: 1, RUB: 1 }[r.code]) s.push(r.code + (r.units > 1 ? "×" + r.units : "") + " " + (+r.som).toFixed(2).replace(".", ",")); });
      if (s.length && $("odin-rates")) $("odin-rates").innerHTML = "Курс БИ: " + s.join(" | ");
      var w = (d.weather && d.weather.places || []).filter(function (p) { return p.id === "nurzhan"; })[0];
      if (w && $("odin-w")) $("odin-w").innerHTML = "Нуржан " + (w.high > 0 ? "+" : "") + w.high + "°C, " + (w.label && w.label.ru || "").toLowerCase();
      var t = (d.weather && d.weather.places || []).filter(function (p) { return p.id === "talas"; })[0];
      if (t && $("odin-w")) $("odin-w").innerHTML += " &nbsp; Талас " + (t.high > 0 ? "+" : "") + t.high + "°C";
    }).catch(function () {});
  }

  function nowBox() {
    var box = $("odin-now"); if (!box) return;
    getJson(root() + "data/schedule.json").then(function (data) {
      var now = irNow(), L = day(data, bday(now)), i = nowIndex(L, now), h = "<table class=\"tv\">";
      if (i < 0 || L[i].id === "signoff") h += '<tr class="now"><td class="t">--:--</td><td><b>Перерыв в вещании</b><div class="d">Вещание возобновится в 06:00</div></td></tr>';
      L.slice(Math.max(i, 0), Math.max(i, 0) + 5).forEach(function (s, k) { if (s.id !== "signoff") h += row(s, k === 0 && i >= 0 ? "now" : ""); });
      box.innerHTML = h + "</table>";
    }).catch(function () { box.innerHTML = '<div class="d">Программа временно недоступна.</div>'; });
  }

  function guide(elId, tabsId, file) {
    var box = $(elId), tabs = $(tabsId); if (!box) return;
    getJson(root() + "data/" + file).then(function (data) {
      var now = irNow(), today = bday(now), mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      var days = []; for (var i = 0; i < 7; i++) { var d = new Date(mon); d.setDate(mon.getDate() + i); days.push(d); }
      function show(d) {
        Array.prototype.forEach.call(tabs.children, function (b) { b.className = b.getAttribute("data-d") === iso(d) ? "on" : ""; });
        var L = day(data, d), cur = iso(d) === iso(today) ? nowIndex(L, now) : -1;
        box.innerHTML = '<h3 class="gday">' + DOW[d.getDay()] + ", " + d.getDate() + " " + MON[d.getMonth()] + '</h3><table class="tv big">' + L.map(function (s, k) { return row(s, k === cur ? "now" : (cur >= 0 && k < cur ? "past" : "")); }).join("") + "</table>";
      }
      days.forEach(function (d) {
        var a = document.createElement("a"); a.href = "#"; a.setAttribute("data-d", iso(d));
        a.innerHTML = DOWS[d.getDay()] + "<br>" + d.getDate() + "." + pad(d.getMonth() + 1);
        a.onclick = function (e) { e.preventDefault(); show(d); }; tabs.appendChild(a);
      });
      show(today);
    }).catch(function () { box.innerHTML = "Ошибка загрузки программы. Обновите страницу."; });
  }

  function player() {
    var p = $("odin-player"); if (!p) return;
    getJson(root() + "data/schedule.json").then(function (data) {
      var a = onAir(data, irNow()), cap = $("odin-player-cap");
      if (a.off) {
        p.className = "player testcard";
        p.innerHTML = '<div class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="tc-logo">ИрадОдин</div><div class="tc-t">Вещание возобновится в 06:00</div>';
        if (cap) cap.innerHTML = "Сейчас перерыв в вещании.";
      } else if (cap) {
        cap.innerHTML = "<b>Сейчас в эфире:</b> " + a.cur.title + (a.next && a.next.id !== "signoff" ? "<br><b>Далее, " + a.next.t + ":</b> " + a.next.title : "");
      }
    }).catch(function () {});
  }

  function strip() {
    var n = $("onair-now"); if (!n) return;
    getJson(root() + "data/schedule.json").then(function (data) {
      var a = onAir(data, irNow());
      if (a.off) { n.innerHTML = "Перерыв в вещании"; $("onair-next").innerHTML = "Начало вещания в 06:00"; return; }
      n.innerHTML = "<b>" + a.cur.t + "</b> " + a.cur.title;
      if (a.next && a.next.id !== "signoff") $("onair-next").innerHTML = "Далее: " + a.next.t + " " + a.next.title;
    }).catch(function () { n.innerHTML = "Программа временно недоступна"; });
  }
  function radioNow() {
    var box = $("odin-radio-now"); if (!box) return;
    getJson(root() + "data/radio.json").then(function (data) {
      var now = irNow(), L = day(data, bday(now)), i = nowIndex(L, now);
      box.innerHTML = i >= 0 ? "<b>" + L[i].title + "</b>" : "<b>Ночная эстрада</b>";
    }).catch(function () {});
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-flash]");
    if (t) { e.preventDefault(); var m = $("odin-flash-msg"); if (m) m.style.display = "block"; }
  });

  function init() { header(); nowBox(); guide("odin-tv", "odin-tvtabs", "schedule.json"); guide("odin-radio", "odin-radiotabs", "radio.json"); player(); radioNow(); strip(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  return { day: day };
})();
