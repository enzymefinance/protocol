import { AddressLike, EthereumTestnetProvider, resolveAddress, SignerWithAddress } from '@crestproject/crestproject';
import { Dispatcher, sighash, StandardToken } from '@enzymefinance/protocol';
import { constants, utils } from 'ethers';
import { mainnet, MainnetConfig } from '../../mainnet';
import { ReleaseDeploymentConfig } from './deployment';

type MainnetWhales = {
  [TKey in keyof MainnetConfig['whales']]: SignerWithAddress;
};

type MainnetTokens = {
  [TKey in keyof MainnetConfig['tokens']]: StandardToken;
};

type MainnetCompoundTokens = {
  [TKey in keyof MainnetConfig['derivatives']['compound']]: StandardToken;
};

export interface ForkReleaseDeploymentConfig extends ReleaseDeploymentConfig {
  mainnet: MainnetConfig;
  tokens: MainnetTokens;
  whales: MainnetWhales;
}

export async function configureForkRelease({
  provider,
  deployer,
  dispatcher,
  accounts,
}: {
  provider: EthereumTestnetProvider;
  deployer: SignerWithAddress;
  dispatcher: Dispatcher;
  accounts: SignerWithAddress[];
}): Promise<ForkReleaseDeploymentConfig> {
  const whales = await Object.entries(mainnet.whales).reduce((carry: Promise<MainnetWhales>, [key, address]) => {
    return new Promise(async (resolve) => {
      const previous = await carry;
      const signer = await provider.getSignerWithAddress(address);
      await provider.send('hardhat_impersonateAccount', [address]);

      resolve({ ...previous, [key]: signer });
    });
  }, Promise.resolve({}) as Promise<MainnetWhales>);

  const tokens = Object.entries(mainnet.tokens).reduce((carry: MainnetTokens, [key, address]) => {
    const token = new StandardToken(address, deployer);
    return { ...carry, [key]: token };
  }, {} as MainnetTokens);

  const compoundTokens = Object.entries(mainnet.derivatives.compound).reduce(
    (carry: MainnetCompoundTokens, [key, address]) => {
      const token = new StandardToken(address, deployer);
      return { ...carry, [key]: token };
    },
    {} as MainnetCompoundTokens,
  );

  const compoundComptroller = mainnet.comptroller;
  const chainlinkConfig = Object.values(mainnet.chainlinkAggregators);
  const chainlinkRateAssets = chainlinkConfig.map(([, b]) => b as number);
  const chainlinkAggregators = chainlinkConfig.map(([a]) => a as string);
  const chainlinkPrimitives = Object.keys(mainnet.chainlinkAggregators).map(
    (key) => mainnet.tokens[key as keyof typeof mainnet.chainlinkAggregators],
  );

  // Transfer some ether to all whales.
  await Promise.all(
    Object.values(whales).map(async (whale) => {
      await makeEthRich(deployer, whale);
    }),
  );

  // Distribute tokens (from the each whale) to all accounts.
  await Promise.all(
    [...accounts, deployer].map(async (account) => {
      await Promise.all(
        Object.entries(whales).map(async ([symbol, whale]) => {
          if (Object.keys(tokens).includes(symbol)) {
            const token = tokens[symbol as keyof MainnetTokens];
            await makeTokenRich(token, whale, account);
          } else if (Object.keys(mainnet.derivatives.compound).includes(symbol)) {
            const token = compoundTokens[symbol as keyof MainnetCompoundTokens];
            await makeTokenRich(token, whale, account);
          }
        }),
      );
    }),
  );

  return {
    deployer,
    mainnet,
    tokens,
    whales,
    dispatcher,
    mln: mainnet.tokens.mln,
    weth: mainnet.tokens.weth,
    registeredVaultCalls: {
      contracts: [mainnet.synthetix.delegateApprovals],
      selectors: [sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)'))],
    },
    compoundComptroller,
    chainlink: {
      ethUsdAggregator: mainnet.chainlinkEthUsdAggregator,
      xauUsdAggregator: mainnet.chainlinkXauUsdAggregator,
      staleRateThreshold: 259200, // 72 hours
      aggregators: chainlinkAggregators,
      primitives: chainlinkPrimitives,
      rateAssets: chainlinkRateAssets,
    },
    derivatives: mainnet.derivatives,
    integratees: {
      kyber: mainnet.kyber,
      synthetix: {
        addressResolver: mainnet.synthetix.addressResolver,
        delegateApprovals: mainnet.synthetix.delegateApprovals,
        snx: mainnet.synthetix.snx,
        susd: tokens.susd.address,
        originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
        trackingCode: '0x454e5a594d450000000000000000000000000000000000000000000000000000',
      },
      makerDao: {
        dai: mainnet.maker.dai,
        pot: mainnet.maker.pot,
      },
      paraswap: {
        augustusSwapper: mainnet.paraswap.augustusSwapper,
        tokenTransferProxy: mainnet.paraswap.tokenTransferProxy,
      },
      uniswapV2: {
        router: mainnet.uniswapV2.router,
        factory: mainnet.uniswapV2.factory,
      },
      zeroExV2: {
        allowedMakers: [], // TODO
        exchange: mainnet.zeroExV2.exchange,
        erc20Proxy: mainnet.zeroExV2.erc20Proxy,
      },
    },
    policies: {
      guaranteedRedemption: {
        redemptionWindowBuffer: 300, // 5 minutes
      },
    },
  };
}

async function makeEthRich(sender: SignerWithAddress, receiver: AddressLike) {
  return sender.sendTransaction({
    to: resolveAddress(receiver),
    value: utils.parseEther('100'),
  });
}

async function makeTokenRich(token: StandardToken, sender: SignerWithAddress, receiver: AddressLike) {
  // 100 * 10^(decimals)
  const amount = constants.One.mul(10)
    .pow(await token.decimals())
    .mul(100);

  const senderBalance = await token.balanceOf(sender);
  const symbol = await token.symbol();

  if (senderBalance.lt(amount)) {
    throw new Error(`The current sender's ${symbol} balance is ${senderBalance} which is not enough to send`);
  }

  await token.connect(sender).transfer(receiver, amount);
}
