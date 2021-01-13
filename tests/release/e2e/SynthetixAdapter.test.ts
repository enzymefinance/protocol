import { SignerWithAddress } from '@crestproject/crestproject';
import { ISynthetixAddressResolver, ISynthetixExchanger, StandardToken } from '@enzymefinance/protocol';
import {
  createNewFund,
  ForkDeployment,
  getAssetBalances,
  loadForkDeployment,
  mainnetWhales,
  synthetixAssignExchangeDelegate,
  synthetixResolveAddress,
  synthetixTakeOrder,
  unlockWhales,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';

const sbtcCurrencyKey = utils.formatBytes32String('sBTC');
const susdCurrencyKey = utils.formatBytes32String('sUSD');
const whales: Record<string, SignerWithAddress> = {};
let fork: ForkDeployment;

beforeAll(async () => {
  whales.susd = ((await hre.ethers.getSigner(mainnetWhales.susd)) as any) as SignerWithAddress;

  await unlockWhales({
    provider: hre.ethers.provider,
    whales: Object.values(whales),
  });
});

beforeEach(async () => {
  fork = await loadForkDeployment();
});

// HAPPY PATHS

it('works as expected when called by a fund (synth to synth)', async () => {
  const outgoingAsset = new StandardToken(fork.config.primitives.susd, whales.susd);
  const incomingAsset = new StandardToken(fork.config.synthetix.synths.sbtc, hre.ethers.provider);
  const [fundOwner] = fork.accounts;
  const synthetixAddressResolver = new ISynthetixAddressResolver(
    fork.config.synthetix.addressResolver,
    hre.ethers.provider,
  );

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.FundDeployer,
    denominationAsset: new StandardToken(fork.config.primitives.susd, hre.ethers.provider),
  });

  // Load the SynthetixExchange contract
  const exchangerAddress = await synthetixResolveAddress({
    addressResolver: synthetixAddressResolver,
    name: 'Exchanger',
  });
  const synthetixExchanger = new ISynthetixExchanger(exchangerAddress, hre.ethers.provider);

  // Delegate SynthetixAdapter to exchangeOnBehalf of VaultProxy
  await synthetixAssignExchangeDelegate({
    comptrollerProxy,
    addressResolver: synthetixAddressResolver,
    fundOwner,
    delegate: fork.deployment.SynthetixAdapter,
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
    integrationManager: fork.deployment.IntegrationManager,
    fundOwner,
    synthetixAdapter: fork.deployment.SynthetixAdapter,
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
