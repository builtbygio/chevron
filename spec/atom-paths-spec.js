/** @babel */

import { remote } from 'electron';
import atomPaths from '../src/atom-paths';
import fs from 'fs-plus';
import path from 'path';
const app = remote.app;
const temp = require('temp').track();

describe('AtomPaths', () => {
  const portableChevronHomePath = path.join(
    atomPaths.getAppDirectory(),
    '..',
    '.chevron'
  );

  afterEach(() => {
    delete process.env.CHEVRON_HOME;
    delete process.env.ATOM_HOME;
    atomPaths.setAtomHome(app.getPath('home'));
  });

  describe('SetAtomHomePath (Chevron-only)', () => {
    describe('when a portable .chevron folder exists', () => {
      beforeEach(() => {
        delete process.env.ATOM_HOME;
        delete process.env.CHEVRON_HOME;
        if (!fs.existsSync(portableChevronHomePath)) {
          fs.mkdirSync(portableChevronHomePath);
        }
      });

      afterEach(() => {
        delete process.env.ATOM_HOME;
        delete process.env.CHEVRON_HOME;
        fs.removeSync(portableChevronHomePath);
      });

      it('sets home to the portable .chevron folder if it has permission', () => {
        atomPaths.setAtomHome(app.getPath('home'));
        expect(process.env.CHEVRON_HOME).toEqual(portableChevronHomePath);
        expect(process.env.ATOM_HOME).toEqual(portableChevronHomePath);
      });

      it('uses ATOM_HOME if no write access to portable .chevron folder', () => {
        if (process.platform === 'win32') return;

        const readOnlyPath = temp.mkdirSync('atom-path-spec-no-write-access');
        process.env.ATOM_HOME = readOnlyPath;
        fs.chmodSync(portableChevronHomePath, 444);
        atomPaths.setAtomHome(app.getPath('home'));
        expect(process.env.ATOM_HOME).toEqual(readOnlyPath);
        expect(process.env.CHEVRON_HOME).toEqual(readOnlyPath);
      });
    });

    describe('when a portable folder does not exist', () => {
      beforeEach(() => {
        delete process.env.ATOM_HOME;
        delete process.env.CHEVRON_HOME;
        fs.removeSync(portableChevronHomePath);
      });

      afterEach(() => {
        delete process.env.ATOM_HOME;
        delete process.env.CHEVRON_HOME;
      });

      it('leaves home unmodified if ATOM_HOME was already set (legacy override)', () => {
        const temporaryHome = temp.mkdirSync('atom-spec-setatomhomepath');
        process.env.ATOM_HOME = temporaryHome;
        atomPaths.setAtomHome(app.getPath('home'));
        expect(process.env.ATOM_HOME).toEqual(temporaryHome);
        expect(process.env.CHEVRON_HOME).toEqual(temporaryHome);
      });

      it('prefers CHEVRON_HOME over ATOM_HOME when both are set', () => {
        const chevronHome = temp.mkdirSync('chevron-home-env');
        const atomHome = temp.mkdirSync('atom-home-env');
        process.env.CHEVRON_HOME = chevronHome;
        process.env.ATOM_HOME = atomHome;
        atomPaths.setAtomHome(app.getPath('home'));
        expect(process.env.CHEVRON_HOME).toEqual(chevronHome);
        expect(process.env.ATOM_HOME).toEqual(chevronHome);
      });

      it('defaults to ~/.chevron (not ~/.atom)', () => {
        const expectedPath = path.join(app.getPath('home'), '.chevron');
        atomPaths.setAtomHome(app.getPath('home'));
        expect(process.env.CHEVRON_HOME).toEqual(expectedPath);
        expect(process.env.ATOM_HOME).toEqual(expectedPath);
      });
    });
  });

  describe('setUserData', () => {
    let tempAtomConfigPath = null;
    let tempAtomHomePath = null;
    let electronUserDataPath = null;
    let defaultElectronUserDataPath = null;

    beforeEach(() => {
      defaultElectronUserDataPath = app.getPath('userData');
      delete process.env.ATOM_HOME;
      delete process.env.CHEVRON_HOME;
      tempAtomHomePath = temp.mkdirSync('atom-paths-specs-userdata-home');
      // Chevron default home under the temp "user home"
      tempAtomConfigPath = path.join(tempAtomHomePath, '.chevron');
      fs.mkdirSync(tempAtomConfigPath);
      electronUserDataPath = path.join(tempAtomConfigPath, 'electronUserData');
      atomPaths.setAtomHome(tempAtomHomePath);
    });

    afterEach(() => {
      delete process.env.ATOM_HOME;
      delete process.env.CHEVRON_HOME;
      fs.removeSync(electronUserDataPath);
      try {
        temp.cleanupSync();
      } catch (e) {
        // Ignore
      }
      app.setPath('userData', defaultElectronUserDataPath);
    });

    describe('when an electronUserData folder exists', () => {
      it('sets userData path to the folder if it has permission', () => {
        fs.mkdirSync(electronUserDataPath);
        atomPaths.setUserData(app);
        expect(app.getPath('userData')).toEqual(electronUserDataPath);
      });

      it('leaves userData unchanged if no write access to electronUserData folder', () => {
        if (process.platform === 'win32') return;

        fs.mkdirSync(electronUserDataPath);
        fs.chmodSync(electronUserDataPath, 444);
        atomPaths.setUserData(app);
        fs.chmodSync(electronUserDataPath, 666);
        expect(app.getPath('userData')).toEqual(defaultElectronUserDataPath);
      });
    });

    describe('when an electronUserDataPath folder does not exist', () => {
      it('leaves userData app path unchanged', () => {
        atomPaths.setUserData(app);
        expect(app.getPath('userData')).toEqual(defaultElectronUserDataPath);
      });
    });
  });
});
