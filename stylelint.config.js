const path = require('path');

module.exports = {
  extends: 'stylelint-config-standard',
  customSyntax: 'postcss-less',
  ignoreFiles: [path.resolve(__dirname, 'static', 'chevron.less')],
  rules: {
    // Keep lint permissive like the stylelint 9 config: ship Dependabot
    // hygiene without rewriting every LESS file to modern CSS notation.
    'alpha-value-notation': null,
    'at-rule-empty-line-before': null,
    'block-no-redundant-nested-style-rules': null,
    'color-function-alias-notation': null,
    'color-function-notation': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'declaration-block-single-line-max-declarations': null,
    'declaration-empty-line-before': null,
    'declaration-property-value-no-unknown': null,
    'font-family-name-quotes': null,
    'font-family-no-duplicate-names': null,
    'font-family-no-missing-generic-family-keyword': null, // octicons
    'function-url-quotes': null,
    'hue-degree-notation': null,
    'import-notation': null,
    'media-feature-range-notation': null,
    'media-query-no-invalid': null,
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    'no-invalid-double-slash-comments': null,
    'number-max-precision': null,
    'property-no-deprecated': null,
    'property-no-unknown': null,
    'property-no-vendor-prefix': null,
    'rule-empty-line-before': null,
    'selector-class-pattern': null,
    'selector-no-vendor-prefix': null,
    'selector-not-notation': null,
    'selector-pseudo-element-colon-notation': null,
    'selector-type-no-unknown': null,
    'shorthand-property-no-redundant-values': null,
    'value-keyword-case': null,
    'value-no-vendor-prefix': null,
    'unit-no-unknown': [true, { ignoreUnits: ['x'] }] // -webkit-image-set 1x/2x
  }
};
