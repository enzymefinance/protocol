import * as R from 'ramda';

const componentsFromRoutes = routes => {
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
    routes,
  );
};

export { componentsFromRoutes };
