const fs = require('fs-extra');
const path = require('path');

const package = require('../package.json');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'package');

const copy = [
  'LICENSE',
  'README.md',
  'CODE_OF_CONDUCT.md',
  'contracts',
  'cache',
];

copy.forEach((file) => {
  fs.copySync(path.join(root, file), path.join(out, file));
});

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
