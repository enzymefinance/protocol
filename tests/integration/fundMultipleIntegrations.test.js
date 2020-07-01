/*
 * @file Tests a fund vault with multiple integration adapters
 *
 * @test A fund can add an integration adapter after it is created
 * @test A fund can take an order with the newly-added integration
 * @test TODO: multiple tests for take orders on multiple integrations
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpMul } from '~/utils/BNmath';
import { CONTRACT_NAMES, KYBER_ETH_ADDRESS } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeTakeOrderArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let takeOrderSignature;
let mln, weth;
let oasisDexAdapter;
let kyberNetworkProxy, kyberAdapter;
let fundFactory, fund;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.MLN);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER, web3);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, web3, mainnetAddrs.kyber.KyberNetworkProxy);

  fund = await setupFundWithParams({
    integrationAdapters: [oasisDexAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
  });
});

test("add Kyber to fund's enabled integrations", async () => {
  const { vault } = fund;

  const preAddIntegrations = await call(vault, 'getEnabledAdapters');
  expect(preAddIntegrations).not.toContain(kyberAdapter.options.address);

  await send(
    vault,
    'enableAdapters',
    [[kyberAdapter.options.address]],
    managerTxOpts,
    web3
  );

  const postAddIntegrations = await call(vault, 'getEnabledAdapters');

  expect(postAddIntegrations.length).toBe(preAddIntegrations.length + 1);
  expect(postAddIntegrations).toContain(kyberAdapter.options.address);
});

test('fund takes an order on Kyber', async () => {
  const { vault } = fund;

  const takerAsset = weth.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = mln.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, makerAsset, takerQuantity],
    defaultTxOpts
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
  }, web3);

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
    web3
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

  // Confirm that expected asset amounts were filled
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(makerQuantity));
});
