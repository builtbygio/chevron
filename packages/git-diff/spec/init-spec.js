const path = require('path');
const fs = require('fs-plus');
const temp = require('temp').track();

const commands = [
  'git-diff:toggle-diff-list',
  'git-diff:move-to-next-diff',
  'git-diff:move-to-previous-diff'
];

describe('git-diff', () => {
  let editor, element;

  beforeEach(() => {
    const projectPath = temp.mkdirSync('git-diff-spec-');
    fs.copySync(path.join(__dirname, 'fixtures', 'working-dir'), projectPath);
    fs.moveSync(
      path.join(projectPath, 'git.git'),
      path.join(projectPath, '.git')
    );
    chevron.project.setPaths([projectPath]);

    jasmine.attachToDOM(chevron.workspace.getElement());

    waitsForPromise(() => chevron.workspace.open('sample.js'));

    runs(() => {
      editor = chevron.workspace.getActiveTextEditor();
      element = chevron.views.getView(editor);
    });
  });

  describe('When the module is deactivated', () => {
    it('removes all registered command hooks after deactivation.', () => {
      waitsForPromise(() => chevron.packages.activatePackage('git-diff'));
      waitsForPromise(() => chevron.packages.deactivatePackage('git-diff'));
      runs(() => {
        // NOTE: don't use enable and disable from the Public API.
        expect(chevron.packages.isPackageActive('git-diff')).toBe(false);

        chevron.commands
          .findCommands({ target: element })
          .filter(({ name }) => commands.includes(name))
          .forEach(command => expect(commands).not.toContain(command.name));
      });
    });
  });
});
