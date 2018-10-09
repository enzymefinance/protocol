import debug from 'debug';
import * as path from 'path';

const getDebug = moduleFile => {
  const root = path.join(__filename, '../..');
  const relative = path.relative(root, moduleFile);
  const extension = path.extname(relative);
  const basename = path.basename(relative, extension);
  const dirname = path.dirname(relative);
  const modulePath = path.join(dirname, basename);
  const moduleName = `melon:protocol:${modulePath.split(path.sep).join(':')}`;
  return debug(moduleName);
};

export default getDebug;
