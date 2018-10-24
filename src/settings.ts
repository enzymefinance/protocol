import * as path from 'path';

export const soliditySourceDirectory = path.join(
  __dirname,
  '..',
  'src',
  'contracts',
);
export const solidityCompileTarget = path.join(__dirname, '..', 'out');
