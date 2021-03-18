import { ISynthetixAddressResolver, ISynthetixExchanger, StandardToken } from '@enzymefinance/protocol';
import {
  createNewFund,
  ProtocolDeployment,
  getAssetBalances,
  deployProtocolFixture,
  synthetixAssignExchangeDelegate,
  synthetixResolveAddress,
  synthetixTakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const sbtcCurrencyKey = utils.formatBytes32String('sBTC');
const susdCurrencyKey = utils.formatBytes32String('sUSD');

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

// HAPPY PATHS

it('works as expected when called by a fund (synth to synth)', async () => {
  const outgoingAsset = new StandardToken(fork.config.primitives.susd, whales.susd);
  const incomingAsset = new StandardToken(fork.config.synthetix.synths.sbtc, provider);
  const [fundOwner] = fork.accounts;
  const synthetixAddressResolver = new ISynthetixAddressResolver(fork.config.synthetix.addressResolver, provider);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    denominationAsset: new StandardToken(fork.config.primitives.susd, provider),
    fundDeployer: fork.deployment.fundDeployer,
  });

  // Load the SynthetixExchange contract
  const exchangerAddress = await synthetixResolveAddress({
    addressResolver: synthetixAddressResolver,
    name: 'Exchanger',
  });
  const synthetixExchanger = new ISynthetixExchanger(exchangerAddress, provider);

  // Delegate SynthetixAdapter to exchangeOnBehalf of VaultProxy
  await synthetixAssignExchangeDelegate({
    comptrollerProxy,
    addressResolver: synthetixAddressResolver,
    fundOwner,
    delegate: fork.deployment.synthetixAdapter,
  });

  // Define order params
  const outgoingAssetAmount = utils.parseEther('100');
  const { 0: expectedIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
    outgoingAssetAmount,
    susdCurrencyKey,
    sbtcCurrencyKey,
  );

  // Get incoming asset balance prior to tx
  const [preTxIncomingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset],
  });

  // Seed fund and execute Synthetix order
  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
  await synthetixTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager: fork.deployment.integrationManager,
    fundOwner,
    synthetixAdapter: fork.deployment.synthetixAdapter,
    outgoingAsset,
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount: expectedIncomingAssetAmount,
  });

  // Get incoming and outgoing asset balances after the tx
  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });

  // Assert the expected final token balances of the VaultProxy
  const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
  expect(incomingAssetAmount).toEqBigNumber(expectedIncomingAssetAmount);
  expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
});
