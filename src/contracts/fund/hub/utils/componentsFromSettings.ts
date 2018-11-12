import * as R from 'ramda';

const componentsFromSettings = settings => {
  return R.pick(
    [
      'accountingAddress',
      'feeManagerAddress',
      'participationAddress',
      'policyManagerAddress',
      'sharesAddress',
      'tradingAddress',
      'vaultAddress',
    ],
    settings,
  );
};

export { componentsFromSettings };
