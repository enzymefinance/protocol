import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { v4 as uuid } from 'uuid';

export default async () => {
  // Make the shared tmp directory available to the test environment.
  process.env.__HARDHAT_COVERAGE_TEMPDIR__ = path.join(await fs.realpath(os.tmpdir()), uuid());
};
