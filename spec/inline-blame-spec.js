const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { conditionPromise } = require('./async-spec-helpers');

// The github package's inline blame (#424), in a real editor: the annotation
// is drawn, takes the mouse, and leaves the cursor alone when clicked.
describe('inline blame', () => {
  let dir, editor;

  function git(args) {
    execFileSync('git', args, {
      cwd: dir,
      env: Object.assign({}, process.env, {
        GIT_AUTHOR_NAME: 'Gio',
        GIT_AUTHOR_EMAIL: 'gio@example.com',
        GIT_COMMITTER_NAME: 'Gio',
        GIT_COMMITTER_EMAIL: 'gio@example.com'
      })
    });
  }

  const annotation = () =>
    editor.getElement().querySelector('.github-InlineBlame');

  beforeEach(async () => {
    jasmine.useRealClock();
    dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'inline-blame-spec-'))
    );
    git(['init', '-q']);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'First lines']);

    chevron.project.setPaths([dir]);
    jasmine.attachToDOM(chevron.workspace.getElement());
    await chevron.packages.activatePackage('github');
    editor = await chevron.workspace.open(path.join(dir, 'a.txt'));
    editor.setCursorBufferPosition([1, 0]);
    await conditionPromise(() => annotation(), 'the blame annotation', 15000);
  });

  it("annotates the cursor's line with author, age and summary", () => {
    expect(annotation().textContent).toMatch(/^Gio, .+ · First lines$/);
    const line = annotation().closest('.line');
    expect(line.textContent.startsWith('two')).toBe(true);
  });

  it('opens the commit on click without moving the cursor', () => {
    spyOn(chevron.workspace, 'open').andReturn(Promise.resolve());
    annotation().dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0 })
    );
    expect(chevron.workspace.open).toHaveBeenCalled();
    expect(chevron.workspace.open.mostRecentCall.args[0]).toMatch(
      /^atom-github:\/\/commit-detail\?/
    );
    expect(editor.getCursorBufferPosition().toArray()).toEqual([1, 0]);
  });

  it('shows the full commit on hover', () => {
    annotation().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const tooltip = document.querySelector('.github-InlineBlame-tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toContain('First lines');
    expect(tooltip.textContent).toContain('gio@example.com');
  });

  it('says "Not committed yet" for an unsaved line', async () => {
    editor.setCursorBufferPosition([0, 0]);
    editor.insertText('new line\n');
    editor.setCursorBufferPosition([0, 0]);
    await conditionPromise(
      () => annotation() && annotation().textContent === 'Not committed yet',
      'the uncommitted annotation',
      15000
    );
  });

  it('goes away when github.inlineBlame is off', () => {
    chevron.config.set('github.inlineBlame', false);
    expect(annotation()).toBe(null);
  });
});
