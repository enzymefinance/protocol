import fs from 'fs-extra';
import path from 'path';

export function regexOrString(matcher: RegExp | string) {
  try {
    if (matcher instanceof RegExp) {
      return matcher;
    }

    if ((matcher.startsWith('/') && matcher.endsWith('/')) || matcher.endsWith('/i')) {
      const [, regex, flags] = matcher.split('/');

      return new RegExp(regex, flags);
    }

    return matcher;
  } catch (e) {
    return matcher;
  }
}

export function validateDir(root: string, relative: string) {
  const dir = path.resolve(root, relative);

  if (!dir.startsWith(root)) {
    throw new Error('@enzymefinance/hardhat: resolved path must be inside of project directory');
  }

  if (dir === root) {
    throw new Error('@enzymefinance/hardhat: resolved path must not be root directory');
  }

  return dir;
}

export async function clearDirectory(dir: string) {
  if (await fs.pathExists(dir)) {
    await fs.remove(dir);
  }
}

export async function createDirectory(dir: string) {
  if (!(await fs.pathExists(dir))) {
    await fs.mkdirp(dir);
  }
}

export async function prepareDirectory(dir: string, clear = false) {
  if (clear) {
    await clearDirectory(dir);
  }

  return createDirectory(dir);
}
