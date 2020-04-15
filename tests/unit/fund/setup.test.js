import { toWei } from 'web3-utils';
import { send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import getAccounts from '~/deploy/utils/getAccounts';

let deployer, manager, user;
let defaultTxOpts, managerTxOpts, userTxOpts;
let fundFactory;

beforeAll(async () => {
  [deployer, manager, user] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  userTxOpts = { ...defaultTxOpts, from: user };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;
  fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
  const weth = contracts.WETH;
  const mln = contracts.MLN;
  
  await send(
    fundFactory,
    'beginSetup',
    [
      `test-fund-${Date.now()}`,
      [],
      [],
      [],
      [],
      [],
      weth.options.address,
      [mln.options.address, weth.options.address],
    ],
    managerTxOpts
  );
});

test('continue setup of a fund', async () => {
  const amguTxValue = toWei('0.01', 'ether')
  const userTxOptsWithAmgu = { ...userTxOpts, value: amguTxValue };
  
  await send(fundFactory, 'createFeeManagerFor', [manager], userTxOptsWithAmgu);
  await send(fundFactory, 'createPolicyManagerFor', [manager], userTxOptsWithAmgu);
  await send(fundFactory, 'createSharesFor', [manager], userTxOptsWithAmgu);
  await send(fundFactory, 'createVaultFor', [manager], userTxOptsWithAmgu);
  const res = await send(fundFactory, 'completeSetupFor', [manager], userTxOptsWithAmgu);
  expect(res).toBeTruthy();
});
