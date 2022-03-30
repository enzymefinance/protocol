export function prettierConfig(cwd: string = process.cwd()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prettier = require('prettier');

    return prettier.resolveConfig.sync(cwd);
  } catch (error) {
    return {};
  }
}

export function formatOutput(value: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prettier = require('prettier');
    const defaults = prettierConfig();
    const options = {
      ...defaults,
      parser: 'typescript',
    };

    return prettier.format(value, options);
  } catch (error) {}

  return value;
}
