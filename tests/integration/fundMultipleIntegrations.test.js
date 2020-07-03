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
import {
  CALL_ON_INTEGRATION_ENCODING_TYPES,
  CONTRACT_NAMES,
  KYBER_ETH_ADDRESS
} from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let takeOrderSignature;
let mln, weth;
let kyberAdapter, uniswapAdapter;
let kyberNetworkProxy;
let fundFactory, fund;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.KYBER_ADAPTER,
    'takeOrder',
  );

  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, mainnetAddrs.kyber.KyberNetworkProxy);
  uniswapAdapter = getDeployed(CONTRACT_NAMES.UNISWAP_ADAPTER);

  fund = await setupFundWithParams({
    integrationAdapters: [uniswapAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
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
    managerTxOpts
  );

  const postAddIntegrations = await call(vault, 'getEnabledAdapters');

  expect(postAddIntegrations.length).toBe(preAddIntegrations.length + 1);
  expect(postAddIntegrations).toContain(kyberAdapter.options.address);
});

test('fund takes an order on Kyber', async () => {
  const { vault } = fund;

  const outgoingAsset = weth.options.address;
  const outgoingAssetAmount = toWei('0.1', 'ether');
  const incomingAsset = mln.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, incomingAsset, outgoingAssetAmount],
  );

  const expectedIncomingAssetAmount = BNExpMul(
    new BN(outgoingAssetAmount),
    new BN(expectedRate),
  ).toString();

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      expectedIncomingAssetAmount, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

  // Confirm that expected asset amounts were filled
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(outgoingAssetAmount));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(expectedIncomingAssetAmount));
});
