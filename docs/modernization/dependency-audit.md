# Dependency Audit Report

## Summary
| Category | Count |
| :--- | :--- |
| Registry | 285 |
| Git-pinned | 87 |
| Local (file:) | 31 |
| Package Deps | 0 |

## High Priority: Git-Pinned Dependencies

**Status: unchanged (pins).** These stay git SHAs until each fork is published as `@builtbygio/<id>` on npmjs.com. Chevron strips that scope for editor ids (`src/main-process/package-id.js`). Install alias: `"tree-view": "npm:@builtbygio/tree-view@<semver>"`. Do not change the git pins until the package exists on the registry.

These dependencies are pinned to specific Git hashes. They are hard to maintain and risk breaking if the upstream repository changes or is deleted.

| Package | Dependency | Source |
| :--- | :--- | :--- |
| chevron | @atom/fuzzy-native | `git+https://github.com/builtbygio/fuzzy-native.git#c99ea0dd291004c4ebe937722bb9b1e1eee3f2ac` |
| chevron | @atom/nsfw | `git+https://github.com/builtbygio/nsfw.git#081d4c11e8b50ba05e0a2d6aa6e25792c4397883` |
| chevron | archive-view | `git+https://github.com/builtbygio/archive-view.git#9f798bea12b04c693125703372b129299db2984b` |
| chevron | atom-keymap | `git+https://github.com/builtbygio/atom-keymap.git#c69e83105bb9a60939ba278b35b561b46bfd5107` |
| chevron | atom-pathspec | `git+https://github.com/builtbygio/atom-pathspec.git#12d5caf819103e817048d662b7faf52ff53c683a` |
| chevron | atom-select-list | `git+https://github.com/builtbygio/atom-select-list.git#c4ed4b2bbf0079e13597b4d5db54fc2e97c995f3` |
| chevron | autocomplete-chevron-api | `git+https://github.com/builtbygio/autocomplete-chevron-api.git#d0cf3eaa9f32f20316c0097fbe20eac931604755` |
| chevron | autocomplete-css | `git+https://github.com/builtbygio/autocomplete-css.git#d1427d2832de57d4fd17e9c4fcf30fe8fc806522` |
| chevron | autocomplete-html | `git+https://github.com/builtbygio/autocomplete-html.git#fa18910fada7777c3a26059a18a0895654c83789` |
| chevron | autocomplete-plus | `git+https://github.com/builtbygio/autocomplete-plus.git#7090254a46851b2868bf88379532f5abfc5a018c` |
| chevron | autocomplete-snippets | `git+https://github.com/builtbygio/autocomplete-snippets.git#7f048bffe896e745030e3a5b9e6d9f9f10aab248` |
| chevron | autosave | `git+https://github.com/builtbygio/autosave.git#e861988ea958422447cbcec9985f38386ce1be0c` |
| chevron | background-tips | `git+https://github.com/builtbygio/background-tips.git#7e0afe2c55643bef2b8a1e42ce472b4efcd82e7f` |
| chevron | bookmarks | `git+https://github.com/builtbygio/bookmarks.git#8e6aa92eb462d16821bc47c8b23f74921591b2cf` |
| chevron | bracket-matcher | `git+https://github.com/builtbygio/bracket-matcher.git#b8d2caa77f9ca0de3be90289b49f3e15fd508a5f` |
| chevron | command-palette | `git+https://github.com/builtbygio/command-palette.git#854f5f4801189602a6e78b6138e9df18eda9bea9` |
| chevron | ctags | `git+https://github.com/builtbygio/node-ctags.git#beb9d9b366fa206e03ab102cc8dd58894940a5e1` |
| chevron | encoding-selector | `git+https://github.com/builtbygio/encoding-selector.git#9833bc928fe92f724b6ceeb1ad625d781b89f36f` |
| chevron | find-and-replace | `git+https://github.com/builtbygio/find-and-replace.git#09e428db55a5d6366d6d48a0d4ff1402714c0602` |
| chevron | first-mate | `git+https://github.com/builtbygio/first-mate.git#e52aeda272b034e70d6af2f0a77c9d201d8a6df5` |
| chevron | fs-admin | `git+https://github.com/builtbygio/fs-admin.git#84acd0b81a2c1920ceaef9028a12e6a4fb724d42` |
| chevron | fuzzy-finder | `git+https://github.com/builtbygio/fuzzy-finder.git#c17b00d81df94c2501f07950e729bf662320eec6` |
| chevron | git-utils | `git+https://github.com/builtbygio/git-utils.git#10e1560cc2b3e0c758cb4ea59f40d894a7117d25` |
| chevron | github | `git+https://github.com/builtbygio/github.git#1645d1a61c6d4f3589ef0f290f32dd4c27cf9e88` |
| chevron | image-view | `git+https://github.com/builtbygio/image-view.git#1e4f2180b33c6aec68717e18d7394c0813039c86` |
| chevron | keybinding-resolver | `git+https://github.com/builtbygio/keybinding-resolver.git#f91789ebd8fbee4b43953b5c90211592a7f8abe6` |
| chevron | keyboard-layout | `git+https://github.com/builtbygio/keyboard-layout.git#8d75e44de137477f6a498e6d6eb8301cedf46439` |
| chevron | keytar | `git+https://github.com/builtbygio/node-keytar.git#702b53b589fc7c3d53970627885f2a21a5764c58` |
| chevron | language-c | `git+https://github.com/builtbygio/language-c.git#bd6feff7900afece2613a8650ccd118a2aeb8254` |
| chevron | language-clojure | `git+https://github.com/builtbygio/language-clojure.git#b2a1b5988de7b715c8190e9808a5e34d2541bc29` |
| chevron | language-coffee-script | `git+https://github.com/builtbygio/language-coffee-script.git#0166e787d1d8e7f09d3b1670c210f25fa19ffa41` |
| chevron | language-csharp | `git+https://github.com/builtbygio/language-csharp.git#4a56d789a605021a40ea4437e62139a92760ba30` |
| chevron | language-css | `git+https://github.com/builtbygio/language-css.git#e9fcf9826783bad61e37c3f93a0ee59852f3d513` |
| chevron | language-gfm | `git+https://github.com/builtbygio/language-gfm.git#4f097e129fbaab7f163c2ea798b3fa223c1c04d9` |
| chevron | language-git | `git+https://github.com/builtbygio/language-git.git#d7337822b68893fe5f43514da91f73a04f921743` |
| chevron | language-go | `git+https://github.com/builtbygio/language-go.git#910aee6b915eb0deec3f02680a2bbede779625e5` |
| chevron | language-html | `git+https://github.com/builtbygio/language-html.git#f8e65a8e96cd53b9e0c3cfa8d7d4dfa1536e5039` |
| chevron | language-hyperlink | `git+https://github.com/builtbygio/language-hyperlink.git#8b03750b3bc6e2bd1f1158b13d2f9076668c68ee` |
| chevron | language-java | `git+https://github.com/builtbygio/language-java.git#c51748fe85c980de5ff9b1d5d2d4a5ec0233e185` |
| chevron | language-javascript | `git+https://github.com/builtbygio/language-javascript.git#764b896dc0938aa4cb79ff919e5015ea4c4f2c80` |
| chevron | language-json | `git+https://github.com/builtbygio/language-json.git#8952fc9f3f616a3ebf9bd498e5475fd28d63ca1a` |
| chevron | language-less | `git+https://github.com/builtbygio/language-less.git#c173485ed068c3185c612de7ba98e2f7813a4a6e` |
| chevron | language-make | `git+https://github.com/builtbygio/language-make.git#d27df5026da9aca252bef9f1be4d1c7818890c8c` |
| chevron | language-mustache | `git+https://github.com/builtbygio/language-mustache.git#af395e2094b0446bdabbe6a88a3e67cee2758e81` |
| chevron | language-objective-c | `git+https://github.com/builtbygio/language-objective-c.git#20a49c73e62317294e7411b050f0d5b2b9c6124c` |
| chevron | language-perl | `git+https://github.com/builtbygio/language-perl.git#a4b1bddf3a432cc6cad07c0b7052853691c90082` |
| chevron | language-php | `git+https://github.com/builtbygio/language-php.git#6c88850bb37e497adfe7cc7a0a3ae65d857210bf` |
| chevron | language-property-list | `git+https://github.com/builtbygio/language-property-list.git#f2689f2080644b165867edf20d7eaf78f14c5211` |
| chevron | language-python | `git+https://github.com/builtbygio/language-python.git#c09e38692ed6a0df86db943cb1f2faaca2a04069` |
| chevron | language-ruby | `git+https://github.com/builtbygio/language-ruby.git#8611125bd8ae55782b047ae8197c7f64975a13ae` |
| chevron | language-ruby-on-rails | `git+https://github.com/builtbygio/language-ruby-on-rails.git#f8e608067e8a639d011d618b76b81ce2335f3f1d` |
| chevron | language-sass | `git+https://github.com/builtbygio/language-sass.git#99fc6dcf1a828792793a4d1cfff60a5ccfd861d4` |
| chevron | language-shellscript | `git+https://github.com/builtbygio/language-shellscript.git#b06915c59c0f6ff0e73daacad99f044a7112be72` |
| chevron | language-source | `git+https://github.com/builtbygio/language-source.git#931fb9b1fc148da6a445c05c33b79fcd561a81bd` |
| chevron | language-sql | `git+https://github.com/builtbygio/language-sql.git#cdc2745dc4525a9c16a8f59d725f436b476f9a28` |
| chevron | language-text | `git+https://github.com/builtbygio/language-text.git#bc28d229f8114f598f7832a9296f2a38f0682a79` |
| chevron | language-todo | `git+https://github.com/builtbygio/language-todo.git#c0f98d6927aaf0b1fca0848199fa89b4750cf6de` |
| chevron | language-toml | `git+https://github.com/builtbygio/language-toml.git#4acacfc1822405b02e430c0d08763c73f05f918f` |
| chevron | language-typescript | `git+https://github.com/builtbygio/language-typescript.git#dc7850f010f7e41976f527d483196f6883b4630a` |
| chevron | language-xml | `git+https://github.com/builtbygio/language-xml.git#6e41bd80dadb57b1faad017dfda907ddfaa7d709` |
| chevron | language-yaml | `git+https://github.com/builtbygio/language-yaml.git#a3a42a6abf5792e9c9776407791f5bfd12355376` |
| chevron | markdown-preview | `git+https://github.com/builtbygio/markdown-preview.git#2725ebc73763962a99fcf743f89204d4af831aff` |
| chevron | notifications | `git+https://github.com/builtbygio/notifications.git#b479d8056a8387756431b5fbe415e9ed2f8f5cbb` |
| chevron | nslog | `git+https://github.com/builtbygio/node-nslog.git#c1732b85fa32a648cd775c2045f7871293a76e2c` |
| chevron | oniguruma | `git+https://github.com/builtbygio/node-oniguruma.git#4cd8873b4f965081b7b56a3c016bcaef286f5120` |
| chevron | open-on-github | `git+https://github.com/builtbygio/open-on-github.git#125059f436091d22eb36571f5e782c1f4ad8460f` |
| chevron | package-generator | `git+https://github.com/builtbygio/package-generator.git#38eda212a28fa470d43830e500a25bacf6e560ef` |
| chevron | pathwatcher | `git+https://github.com/builtbygio/node-pathwatcher.git#3b869abf7557d4251f1fd82e000e41eaaf117a00` |
| chevron | scrollbar-style | `git+https://github.com/builtbygio/scrollbar-style.git#3b35400e1265ec989d44430f85e9c382fee8ced0` |
| chevron | season | `git+https://github.com/builtbygio/season.git#1ae70ba41cbe93797f7cb6bcf9322200d0a8311e` |
| chevron | settings-view | `git+https://github.com/builtbygio/settings-view.git#ea0a17f12cf37525fd8b9499cce6dd43ae8220aa` |
| chevron | snippets | `git+https://github.com/builtbygio/snippets.git#1e1bef9076534cd1d22f693aec01cdf752e3ce6c` |
| chevron | spell-check | `git+https://github.com/builtbygio/spell-check.git#ebd7c37aa72a792d57ecb05d9bf788ef4327b701` |
| chevron | spellchecker | `git+https://github.com/builtbygio/node-spellchecker.git#0d77962cea074dc1c913b4f82a55cfaafe28e8fd` |
| chevron | status-bar | `git+https://github.com/builtbygio/status-bar.git#f59e9308ce85485665a419692537159d684e7fa2` |
| chevron | styleguide | `git+https://github.com/builtbygio/styleguide.git#24bfb4f362666fdb3d8507598d4e75fba86e3daa` |
| chevron | symbols-view | `git+https://github.com/builtbygio/symbols-view.git#5d7ddfee6b0dd9f316cc2a17ba2ad0810a26bba1` |
| chevron | tabs | `git+https://github.com/builtbygio/tabs.git#5696be8e3b69b39b14c6ccf22a97e439eeb43fe6` |
| chevron | text-buffer | `git+https://github.com/builtbygio/text-buffer.git#1c5c61633d7e635951af3974f76782636f3f8546` |
| chevron | timecop | `git+https://github.com/builtbygio/timecop.git#fd4796a3bea992d9777261316bf2000edc610c31` |
| chevron | tree-view | `git+https://github.com/builtbygio/tree-view.git#aba271237c084e6086b267a77ef6135f5aefc1b0` |
| chevron | whitespace | `git+https://github.com/builtbygio/whitespace.git#07dfe7f4b8a8ffd5f137f7fd57e61986f35a4366` |
| chevron | wrap-guide | `git+https://github.com/builtbygio/wrap-guide.git#313607a53a58219eeec15761a289e7fa737cad19` |
| test | spell-check | `git+https://github.com/atom/spell-check/versions/0.79.1/tarball` |
| test | status-bar | `git+https://github.com/atom/status-bar/versions/2.8.17/tarball` |
| test | styleguide | `git+https://github.com/atom/styleguide/versions/1.49.12/tarball` |
| test | symbols-view | `git+https://github.com/atom/symbols-view/versions/0.118.5/tarball` |

## Local Dependencies (file: → workspace:* → npm:@builtbygio)

**Status: migrated.** Root `dependencies` for these packages now use `npm:@builtbygio/<id>@<ver>`. Sources remain in `packages/*`. `packageDependencies` stores the matching unscoped semver (not an install spec). See `workspace-transition-plan.md`.

| Package | Dependency |
| :--- | :--- |
| chevron | @atom/watcher |
| chevron | about |
| chevron | autoflow |
| chevron | base16-tomorrow-dark-theme |
| chevron | base16-tomorrow-light-theme |
| chevron | chevron-dark-syntax |
| chevron | chevron-dark-ui |
| chevron | chevron-light-syntax |
| chevron | chevron-light-ui |
| chevron | dalek |
| chevron | deprecation-cop |
| chevron | dev-live-reload |
| chevron | git-diff |
| chevron | go-to-line |
| chevron | grammar-selector |
| chevron | incompatible-packages |
| chevron | language-rust-bundled |
| chevron | line-ending-selector |
| chevron | link |
| chevron | lsp-diagnostics-stub |
| chevron | lsp-servers |
| chevron | lsp-ui |
| chevron | one-dark-syntax |
| chevron | one-dark-ui |
| chevron | one-light-syntax |
| chevron | one-light-ui |
| chevron | solarized-dark-syntax |
| chevron | solarized-light-syntax |
| chevron | superstring |
| chevron | update-package-dependencies |
| chevron | welcome |

