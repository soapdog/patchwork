// Modified from ManyVerse, adapted to Patchwork
// SPDX-FileCopyrightText: 2021-2022 The Manyverse Authors
//
// SPDX-License-Identifier: CC0-1.0

const path = require('path');
const rimraf = require('rimraf');
const packageJSON = require('./package.json');

const copyrightYear = new Date().getFullYear();
const AUTHOR = 'The Scuttlebutt Consortium';
const NAME_HUMAN = 'Patchwork';
const NAME_COMPUTER = 'Patchwork';

module.exports = {
  // Metadata ------------------------------------------------------------------
  appId: 'org.ssbc.patchwork',
  productName: NAME_HUMAN,
  copyright: `${copyrightYear} ${AUTHOR}`,
  buildVersion: packageJSON.version,
  extraMetadata: {
    name: NAME_COMPUTER,
    version: packageJSON.version,
    description: 'A social network off the rest of us',
    author: AUTHOR,
    homepage: 'https://scuttlebutt.nz',
    license: 'AGPL-3.0',
    repository: 'https://github.com/soapdog/patchwork/',
  },
  protocols: [{name: 'ssb', schemes: ['ssb']}],

  // Electron-builder options --------------------------------------------------
  asar: false,
  npmRebuild: false,
  electronVersion: packageJSON.devDependencies.electron,

  // All things files and directories ------------------------------------------
  directories: {
    app: __dirname,
    buildResources: path.join(__dirname, 'build'),
    output: path.join(__dirname, 'dist'),
  },

  // Linux-specific configurations ---------------------------------------------
  linux: {
    icon: path.join(__dirname, 'build', 'icon.png'),
    target: [
      {target: 'deb', arch: ['x64', 'arm64']},
      {target: 'tar.gz', arch: ['x64', 'arm64']},
    ],
    category: 'Network',
    maintainer: "André Alves Garzia <andre@andregarzia.com>",
  },

  deb: {
    packageCategory: 'net',
    priority: 'optional',
    depends: [
      'libnotify4',
      'libxtst6',
      'libnss3',
      'libc6 >= 2.28',

      // Disabled to support KDE:
      // 'gconf2',
      // 'gconf-service',

      // Disabled to support Debian 10+:
      // 'libappindicator1',
    ],
  },

  appImage: {
  },

  // Mac-specific configurations -----------------------------------------------
  mac: {
    icon: path.join(__dirname, 'build', 'icon.png'),
    category: 'public.app-category.social-networking',
    darkModeSupport: true,
    target: [{target: 'dmg'}],
    identity: null,
  },

  dmg: {
    icon: path.join(__dirname, 'build', 'icon.png'),
    // background: path.join(__dirname, 'build', 'dmg-background.png'),
  },

  // Windows-specific configurations -------------------------------------------


  nsis: {
    artifactName: '${name}-${version}-windows-${arch}-nsis-installer.${ext}',
    oneClick: false,
    perMachine: false,
  },


  // Publish options -----------------------------------------------------------
  publish: {
    provider: 'github',
    protocol: 'https',
    owner: 'soapdog',
    repo: 'patchwork',
    releaseType: 'release',
  },
};
