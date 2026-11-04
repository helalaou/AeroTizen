// Original toast renderer for the frozen comparison page.
(function (A) {
  "use strict";

  A.toast = function (text) {
    var t = A.$("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(A.toast.timer);
    A.toast.timer = setTimeout(function () {
      t.hidden = true;
    }, 2500);
  };
  A.hideToast = function () {
    A.$("toast").hidden = true;
  };
})(window.AeroTizen);
