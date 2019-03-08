import * as R from 'ramda';

import { Environment, LogLevels } from './Environment';

const getLogCurried = R.curry(
  (namespace: string, environment: Environment) => ({
    // tslint:disable:object-literal-sort-keys
    debug: environment.logger(namespace, LogLevels.DEBUG),
    info: environment.logger(namespace, LogLevels.INFO),
    warn: environment.logger(namespace, LogLevels.WARN),
    error: environment.logger(namespace, LogLevels.ERROR),
  }),
);

export { getLogCurried };
