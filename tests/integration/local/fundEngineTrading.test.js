/*
 * @file Tests a fund vault with the Melon Engine
 *
 * @test A fund can take an order once liquid ETH is thawed
 * @test The amount of WETH being asked for by the fund is respected as a minimum
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpMul } from '~/utils/BNmath';
import { CALL_ON_INTEGRATION_ENCODING_TYPES, CONTRACT_NAMES } from '~/utils/constants';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { increaseTime } from '~/utils/rpc';
import { setupInvestedTestFund } from '~/utils/fund';
import { updateKyberPriceFeed } from '~/utils/updateKyberPriceFeed';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager;
let defaultTxOpts, managerTxOpts;
let engine, mln, fund, weth, engineAdapter, kyberAdapter, priceSource, valueInterpreter;
let mlnPrice, mlnQuantity, wethQuantity;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  engine = getDeployed(CONTRACT_NAMES.ENGINE);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);
  valueInterpreter = getDeployed(CONTRACT_NAMES.VALUE_INTERPRETER);

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ENGINE_ADAPTER,
    'takeOrder',
  );
  mlnPrice = (await priceSource.methods
    .getCanonicalRate(mln.options.address, weth.options.address)
    .call())[0];
  mlnQuantity = toWei('0.001', 'ether');
  wethQuantity = BNExpMul(
    new BN(mlnQuantity.toString()),
    new BN(mlnPrice.toString()),
  ).toString();
});

test('Setup a fund with amgu charged to seed Melon Engine', async () => {
  await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts);

  // TODO: Need to calculate this in fund.js
  const amguTxValue = toWei('10', 'ether');
  fund = await setupInvestedTestFund(mainnetAddrs, manager, amguTxValue);
});

test('Take an order for MLN on Kyber (in order to take ETH from Engine)', async () => {
  const { vault } = fund;

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
    [
      mln.options.address, // incoming asset
      1, // min incoming asset amount
      weth.options.address, // outgoing asset,
      toWei('0.1', 'ether') // exact outgoing asset amount
    ]
  );

  await expect(
    send(
      vault,
      'callOnIntegration',
      [
        kyberAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    )
  ).resolves.not.toThrow()
});

test('Trade on Melon Engine', async () => {
  const { vault } = fund;

  // Thaw frozen eth
  await increaseTime(86400 * 32);
  await send(engine, 'thaw', [], defaultTxOpts);

  const preLiquidEther = new BN(await call(engine, 'liquidEther'));
  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.ENGINE.TAKE_ORDER,
    [
      wethQuantity, // min incoming asset (WETH) amount
      mlnQuantity // exact outgoing asset (MLN) amount
    ]
  );

  // get fresh price since we changed blocktime
  await updateKyberPriceFeed(priceSource);

  await send(
    vault,
    'callOnIntegration',
    [
      engineAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts
  );

  const postLiquidEther = new BN(await call(engine, 'liquidEther'));
  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = postFundBalanceOfWeth.sub(preFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = preFundBalanceOfMln.sub(postFundBalanceOfMln);

  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(mlnQuantity));
  expect(fundBalanceOfWethDiff).bigNumberEq(preLiquidEther.sub(postLiquidEther));
});

test('min WETH is respected', async () => {
  const { vault } = fund;

  const expectedWethQuantity = (await call(
    valueInterpreter,
    'calcCanonicalAssetValue',
    [mln.options.address, mlnQuantity, weth.options.address]
  ))[0];
  const tooHighWethQuantity = new BN(expectedWethQuantity).add(new BN(1)).toString();

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.ENGINE.TAKE_ORDER,
    [
      tooHighWethQuantity, // min incoming asset (WETH) amount
      mlnQuantity // exact outgoing asset (MLN) amount
    ]
  );

  await expect(
    send(
      vault,
      'callOnIntegration',
      [
        engineAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    )
  ).rejects.toThrowFlexible(
    "received incoming asset less than expected"
  );
});
