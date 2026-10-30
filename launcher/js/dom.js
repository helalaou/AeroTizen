// Small DOM helpers shared by every module.
(function (A) {
  'use strict';

  A.$ = function (id) { return document.getElementById(id); };

  A.el = function (tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  };

  A.toast = function (text) {
    var t = A.$('toast');
    t.textContent = A.i18n ? A.i18n.displayMessage(text) : text; t.hidden = false;
    clearTimeout(A.toast.timer);
    A.toast.timer = setTimeout(function () { t.hidden = true; }, 2500);
  };
  A.hideToast = function () { A.$('toast').hidden = true; };

  A.clearFocus = function () {
    var prev = document.querySelectorAll('.focused');
    for (var i = 0; i < prev.length; i++) { prev[i].classList.remove('focused'); }
  };

  A.chunk = function (list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) { out.push(list.slice(i, i + size)); }
    return out;
  };

  A.tizen = window.tizen || null;
})(window.AeroTizen);
