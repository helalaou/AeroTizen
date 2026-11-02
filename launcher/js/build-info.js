/* global module */
// Replaced by tools/build-launcher.mjs in compiled packages.
(function (root) {
  var value = { version: null, build_id: null, commit: null, dirty: null };
  if (typeof module !== 'undefined' && module.exports) { module.exports = value; }
  else { root.AeroBuildInfo = value; }
})(typeof window !== 'undefined' ? window : this);
