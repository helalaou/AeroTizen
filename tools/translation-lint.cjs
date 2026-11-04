const english = require("../launcher/src/shared/i18n/en.json");

const isKey = (key) => Object.prototype.hasOwnProperty.call(english, key);
const hasWords = (text) => typeof text === "string" && /\p{L}/u.test(text);
const textAttributes = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "label",
  "placeholder",
  "title",
]);

const nameOf = (node) => node?.name ?? node?.value;
const memberName = (node) => (node?.type === "MemberExpression" ? nameOf(node.property) : undefined);

module.exports = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      rawCopy: "Put launcher text in the English catalogue and render it through the translator.",
      unknownKey: "Add {{key}} to the English catalogue.",
      legacyKey: "Use a literal catalogue key at the legacy translation boundary.",
    },
  },
  create(context) {
    const legacy = ("/" + context.filename.replaceAll("\\", "/")).includes("/launcher/js/");
    const checkKey = (node, literalRequired = false) => {
      if (node?.type === "Literal" && typeof node.value === "string") {
        if (!isKey(node.value)) context.report({ node, messageId: "unknownKey", data: { key: node.value } });
      } else if (literalRequired) {
        context.report({ node, messageId: "legacyKey" });
      }
    };
    const checkMessageKey = (node) => {
      if (node.type === "ConditionalExpression") {
        checkMessageKey(node.consequent);
        checkMessageKey(node.alternate);
      } else if (node.type !== "Literal" || node.value !== "") {
        checkKey(node, legacy);
      }
    };
    // Follow expressions that pass text through to the UI without examining
    // conditions, IDs, arguments to t(), or text supplied by other systems.
    const checkCopy = (node, allowKey = false) => {
      if (!node) return;
      switch (node.type) {
        case "JSXText":
        case "Literal":
          if (hasWords(node.value) && !(allowKey && isKey(node.value))) {
            context.report({ node, messageId: "rawCopy" });
          }
          break;
        case "JSXExpressionContainer":
          checkCopy(node.expression, allowKey);
          break;
        case "ConditionalExpression":
          checkCopy(node.consequent, allowKey);
          checkCopy(node.alternate, allowKey);
          break;
        case "LogicalExpression":
          if (node.operator !== "&&") checkCopy(node.left, allowKey);
          checkCopy(node.right, allowKey);
          break;
        case "BinaryExpression":
          if (node.operator === "+") {
            checkCopy(node.left);
            checkCopy(node.right);
          }
          break;
        case "TemplateLiteral":
          if (node.quasis.some((part) => hasWords(part.value.cooked))) context.report({ node, messageId: "rawCopy" });
          break;
      }
    };
    return {
      JSXText: checkCopy,
      JSXExpressionContainer(node) {
        if (node.parent.type !== "JSXAttribute") checkCopy(node);
      },
      JSXAttribute(node) {
        if (textAttributes.has(nameOf(node.name))) checkCopy(node.value);
      },
      Property(node) {
        const name = nameOf(node.key);
        if (name === "labelKey") checkKey(node.value);
        if (name === "messageKey") checkMessageKey(node.value);
        if (!legacy && ["label", "title", "hint"].includes(name)) checkCopy(node.value, true);
      },
      AssignmentExpression(node) {
        const member = memberName(node.left);
        if (member === "messageKey") checkMessageKey(node.right);
        if (["textContent", "innerText", "innerHTML"].includes(member) || textAttributes.has(member))
          checkCopy(node.right);
      },
      CallExpression(node) {
        const [first, second, third] = node.arguments;
        const member = memberName(node.callee);
        if (["t", "translate"].includes(nameOf(node.callee)) || member === "translate") {
          if (first) checkKey(first, legacy);
        }
        if (["toast", "createTextNode", "alert", "confirm"].includes(member ?? nameOf(node.callee))) checkCopy(first);
        if (member === "setAttribute" && textAttributes.has(first?.value)) checkCopy(second);
        if (member === "el") checkCopy(third);
      },
    };
  },
};
