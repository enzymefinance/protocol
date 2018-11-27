import { EnsureError } from './EnsureError';

const debug = require('debug')('melon:protocol:utils');

/**
 * Similar to asset but throws on runtime if `condition` isn't met.
 * Possibility to add a `message` and some `data` to trace.
 * @throws {EnsureError}
 */
export const ensure = (
  condition: boolean,
  message: string,
  data?: any,
): void => {
  if (condition !== true) {
    debug('EnsureError', { message, data });

    throw new EnsureError(message, data);
  }
};
