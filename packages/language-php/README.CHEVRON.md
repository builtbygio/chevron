# language-php (Chevron)

PHP highlighter for Chevron. Tree-sitter is the default:

- `text.html.php` → `tree-sitter-php/php` (HTML + `<?php ?>`, owns the file types)
- `source.php` → `tree-sitter-php/php_only` (PHP-only / injection)

TextMate fallback is `grammars/html.json` and `grammars/php.json`.
Settings and snippets ship as JSON. 13c: no CSON in `grammars/` /
`settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
