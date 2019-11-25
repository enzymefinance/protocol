import { toWei, padLeft } from 'web3-utils';
import { AssetProxyId } from '@0x/types';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { CONTRACT_NAMES, EXCHANGES } from '~/tests/utils/new/constants';
import { getContract } from '~/utils/solidity/getContract';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/new/zeroEx';
import { getFunctionSignature } from '~/tests/utils/new/metadata';
import { EMPTY_ADDRESS } from '~/tests/utils/new/constants';

let environment, user, defaultTxOpts;
let zeroEx, zeroExWrapperLock;
let makeOrderSignature;
let ethfinexConfig, ethfinexExchange;
let trading;

beforeAll(async () => {
  environment = await deployAndInitTestEnv();
  user = environment.wallet.address;
  defaultTxOpts = { from: user, gas: 8000000 };

  makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );

  const wrapperRegistryEFXAddress =
    environment.deployment.thirdPartyContracts.exchanges.ethfinex.wrapperRegistryEFX;

  const routes = await setupInvestedTestFund(environment);

  trading = getContract(
    environment,
    CONTRACT_NAMES.TRADING,
    routes.tradingAddress
  );

  ethfinexConfig =
    environment.deployment.exchangeConfigs[EXCHANGES.ETHFINEX];

  ethfinexExchange = getContract(
    environment,
    CONTRACT_NAMES.ZERO_EX_EXCHANGE,
    ethfinexConfig.exchange,
  );

  const zeroExInfo = getTokenBySymbol(environment, 'ZRX');

  zeroEx = getContract(
    environment,
    CONTRACT_NAMES.STANDARD_TOKEN,
    zeroExInfo.address
  );

  const wrapperRegistry = getContract(
    environment,
    CONTRACT_NAMES.WRAPPER_REGISTRY_EFX,
    wrapperRegistryEFXAddress,
  );

  const zeroExWrapperLockAddress = await wrapperRegistry.methods
    .token2WrapperLookup(zeroExInfo.address).call();

  zeroExWrapperLock = getContract(
    environment,
    CONTRACT_NAMES.WRAPPER_LOCK,
    zeroExWrapperLockAddress,
  );
});

// tslint:disable-next-line:max-line-length
test('Make ethfinex order from fund and take it from account in which makerToken is a non-native asset', async () => {
  const mlnInfo = getTokenBySymbol(environment, 'MLN');
  const hubAddress = await trading.methods.hub().call();
  const hub = getContract(environment, CONTRACT_NAMES.HUB, hubAddress);
  const routes = await hub.methods.routes().call();
  const vaultAddress = routes.vault;
  const amount = toWei('1', 'ether');

  await zeroEx.methods
    .transfer(vaultAddress, amount).send(defaultTxOpts);

  const makerAssetAmount = toWei('0.05', 'ether');
  const takerAssetAmount = toWei('1', 'ether');

  const unsignedOrder = await createUnsignedZeroExOrder(
    environment,
    ethfinexConfig.exchange,
    {
      makerAddress: routes.trading,
      makerTokenAddress: zeroExWrapperLock.options.address,
      makerAssetAmount,
      takerTokenAddress: mlnInfo.address,
      takerAssetAmount,
    },
  );

  const signedOrder = await signZeroExOrder(
    environment,
    unsignedOrder,
    user,
  );

  const makerTokenAddress = await zeroExWrapperLock.methods
    .originalToken().call();

  const exchanges = await trading.methods.getExchangeInfo().call();
  const exchangeIndex = exchanges[1].findIndex(
    e => e.toLowerCase() === ethfinexConfig.adapter.toLowerCase(),
  );

  await trading.methods.callOnExchange(
    exchangeIndex,
    makeOrderSignature,
    [
      routes.trading,
      EMPTY_ADDRESS,
      makerTokenAddress,
      mlnInfo.address,
      signedOrder.feeRecipientAddress,
      EMPTY_ADDRESS,
    ],
    [
      signedOrder.makerAssetAmount,
      signedOrder.takerAssetAmount,
      signedOrder.makerFee,
      signedOrder.takerFee,
      signedOrder.expirationTimeSeconds,
      signedOrder.salt,
      0,
      0,
    ],
    padLeft('0x0', 64),
    signedOrder.makerAssetData,
    signedOrder.takerAssetData,
    signedOrder.signature,
  ).send(defaultTxOpts);

  const erc20ProxyAddress = await ethfinexExchange.methods
    .getAssetProxy(AssetProxyId.ERC20)
    .call();

  const mln = getContract(
    environment,
    CONTRACT_NAMES.STANDARD_TOKEN,
    mlnInfo.address,
  );

  await mln.methods
    .approve(erc20ProxyAddress, takerAssetAmount)
    .send(defaultTxOpts);

  const result = await ethfinexExchange.methods
    .fillOrder(
      unsignedOrder,
      takerAssetAmount,
      signedOrder.signature,
    ).send(defaultTxOpts);

  expect(result).toBeTruthy();
});
