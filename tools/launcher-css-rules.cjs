// Rules shared by source lint and the check of the styles shipped to the TV.
module.exports = {
  "property-disallowed-list": [
    "inset",
    "gap",
    "row-gap",
    "column-gap",
    "/^(?:margin|padding|border|inset)-(?:inline|block)(?:-|$)/",
    "/^(?:(?:min|max)-)?(?:inline|block)-size$/",
  ],
  "selector-pseudo-class-disallowed-list": ["dir", "focus-visible", "has", "is", "where"],
  "at-rule-disallowed-list": ["container", "layer", "scope", "starting-style"],
};
