'use strict';

const { app, clipboard } = require('electron');
const { createClipboardCompat } = require('./clipboard-compat');

const compat = createClipboardCompat(clipboard);
compat.installRefresh(app);

module.exports = compat;
