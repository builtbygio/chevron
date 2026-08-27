'use strict';

const path = require('path');
const { spawn } = require('child_process');
const process = require('process');

const CONFIG = require('../config');

module.exports = async function() {
  return new Promise((resolve, reject) => {
    const eslintArgs = [
      '--cache',
      '--format',
      'json',
      '--resolve-plugins-relative-to',
      path.join(CONFIG.repositoryRootPath, 'script', 'node_modules')
    ];

    if (process.argv.includes('--fix')) {
      eslintArgs.push('--fix');
    }

    const eslintBinary = process.platform === 'win32' ? 'eslint.cmd' : 'eslint';
    const eslint = spawn(
      path.join('script', 'node_modules', '.bin', eslintBinary),
      [...eslintArgs, '.'],
      {
        cwd: CONFIG.repositoryRootPath,
        env: Object.assign({}, process.env, {
          // Keep .eslintrc.json until a dedicated flat-config pass.
          // eslint-config-standard 17 is still eslintrc; ESLint 9 honors
          // it when this is false. ESLint 10 drops eslintrc entirely.
          ESLINT_USE_FLAT_CONFIG: 'false'
        })
      }
    );

    let output = '';
    let errorOutput = '';
    eslint.stdout.on('data', data => {
      output += data.toString();
    });

    eslint.stderr.on('data', data => {
      errorOutput += data.toString();
    });

    eslint.on('error', error => reject(error));
    eslint.on('close', exitCode => {
      const errors = [];
      let files;

      try {
        files = JSON.parse(output);
      } catch (_) {
        reject(errorOutput);
        return;
      }

      for (const file of files) {
        for (const error of file.messages) {
          errors.push({
            path: file.filePath,
            message: error.message,
            lineNumber: error.line,
            rule: error.ruleId
          });
        }
      }

      resolve(errors);
    });
  });
};
