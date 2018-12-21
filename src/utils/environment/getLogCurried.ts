import * as R from 'ramda';

import { Environment, LogLevels } from './Environment';

const getLogCurried = R.curry(
  (namespace: string, environment: Environment) => ({
    debug: environment.logger(namespace, LogLevels.DEBUG),
    info: environment.logger(namespace, LogLevels.INFO),
  }),
);

export { getLogCurried };
