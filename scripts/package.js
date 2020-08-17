const fs = require('fs-extra');
const { basename } = require('path');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = process.cwd();
const package = fs.readJSONSync(path.join(dir, 'package.json'));
const out = path.join(dir, 'package');

const copy = [
  path.join(root, 'LICENSE'),
  path.join(root, 'README.md'),
  path.join(root, 'CODE_OF_CONDUCT.md'),
  path.join(dir, 'buidler.config.js'),
  path.join(dir, 'contracts'),
  path.join(dir, 'cache'),
];

copy.forEach((file) => {
  const filename = basename(file);
  fs.copySync(file, path.join(out, filename));
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
    main: 'index.js',
    dependencies: package.dependencies,
  },
  {
    spaces: 2,
  },
);
