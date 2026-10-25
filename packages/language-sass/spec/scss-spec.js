const dedent = require('dedent')

describe('Language sass', () => {
  beforeEach(async () => {
    chevron.config.set('core.useTreeSitterParsers', false)
    await chevron.packages.activatePackage('language-sass')
  })

  it('Should tokenize - as selector', async () => {
    const editor = await chevron.workspace.open("foo.scss")

    editor.setText(dedent`
      .foo {
        @extend .foo-bar-baz;
      }`)

    expect(editor.scopeDescriptorForBufferPosition([1,14]).toString()).toBe('.source.css.scss .meta.property-list.scss .meta.at-rule.extend.scss .entity.other.attribute-name.class.css')
  })
})
