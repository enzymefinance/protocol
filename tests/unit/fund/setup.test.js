import { toWei } from 'web3-utils';
import { send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import getAccounts from '~/deploy/utils/getAccounts';

let deployer, manager, user;
let defaultTxOpts, managerTxOpts, userTxOpts;
let version;

beforeAll(async () => {
  [deployer, manager, user] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  userTxOpts = { ...defaultTxOpts, from: user };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  const contracts = deployed.contracts;
  version = contracts[CONTRACT_NAMES.VERSION];
  const weth = contracts.WETH;
  const mln = contracts.MLN;
  
  await send(
    version,
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
  
  await send(version, 'createAccountingFor', [manager], userTxOptsWithAmgu);
  await send(version, 'createFeeManagerFor', [manager], userTxOptsWithAmgu);
  await send(version, 'createParticipationFor', [manager], userTxOptsWithAmgu);
  await send(version, 'createPolicyManagerFor', [manager], userTxOptsWithAmgu);
  await send(version, 'createSharesFor', [manager], userTxOptsWithAmgu);
  await send(version, 'createTradingFor', [manager], userTxOptsWithAmgu);
  await send(version, 'createVaultFor', [manager], userTxOptsWithAmgu);
  const res = await send(version, 'completeSetupFor', [manager], userTxOptsWithAmgu);
  expect(res).toBeTruthy();
});
