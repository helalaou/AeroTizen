// Small DOM helpers shared by every module.
(function (A) {
  "use strict";

  A.$ = function (id) {
    return document.getElementById(id);
  };

  A.tizen = window.tizen || null;
})(window.AeroTizen);
