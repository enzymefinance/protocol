const fs = require('fs-extra');
const path = require('path');

const package = require('../package.json');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'package');

fs.copySync(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));
fs.copySync(path.join(root, 'README.md'), path.join(out, 'README.md'));
fs.copySync(path.join(root, 'contracts'), path.join(out, 'contracts'));
fs.copySync(
  path.join(root, 'tests/contracts'),
  path.join(out, 'tests/contracts'),
);

fs.writeJSON(
  path.join(out, 'package.json'),
  {
    name: package.name,
    version: package.version,
    description: package.description,
    author: package.author,
    license: package.license,
    homepage: package.homepage,
    repository: package.repository,
    bugs: package.bugs,
    keywords: package.keywords,
    dependencies: package.dependencies,
  },
  {
    spaces: 2,
  },
);
