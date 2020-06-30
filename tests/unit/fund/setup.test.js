import { toWei } from 'web3-utils';
import { send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager, user;
let defaultTxOpts, managerTxOpts, userTxOpts;
let fundFactory;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, user] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  userTxOpts = { ...defaultTxOpts, from: user };

  const mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  const weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  
  await send(
    fundFactory,
    'beginFundSetup',
    [
      `test-fund-${Date.now()}`,
      [],
      [],
      [],
      [],
      [],
      [],
      weth.options.address
    ],
    managerTxOpts,
    web3
  );
});

test('continue setup of a fund', async () => {
  const amguTxValue = toWei('0.01', 'ether')
  const userTxOptsWithAmgu = { ...userTxOpts, value: amguTxValue };
  
  await send(fundFactory, 'createFeeManagerFor', [manager], userTxOptsWithAmgu, web3);
  await send(fundFactory, 'createPolicyManagerFor', [manager], userTxOptsWithAmgu, web3);
  await send(fundFactory, 'createSharesFor', [manager], userTxOptsWithAmgu, web3);
  await send(fundFactory, 'createVaultFor', [manager], userTxOptsWithAmgu, web3);
  const res = await send(fundFactory, 'completeFundSetupFor', [manager], userTxOptsWithAmgu, web3);
  expect(res).toBeTruthy();
});
