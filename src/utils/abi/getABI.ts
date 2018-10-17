import * as fs from 'fs';
import * as path from 'path';

import * as R from 'ramda';

export const getAbiAnew = (abiPath: string) => {
  const rawABI = fs.readFileSync(path.join(process.cwd(), 'out', abiPath), {
    encoding: 'utf-8',
  });
  const ABI = JSON.parse(rawABI);
  return ABI;
};

export const getAbi = R.memoize(getAbiAnew);
