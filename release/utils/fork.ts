import {
  AddressLike,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { Dispatcher } from '@melonproject/persistent';
import { constants, providers, Signer, utils } from 'ethers';
import { StandardERC20 } from '../codegen/StandardERC20';
import { ReleaseDeploymentConfig } from './deployment';
import { mainnet } from './network/mainnet';

export interface ForkReleaseDeploymentConfig extends ReleaseDeploymentConfig {
  mainnet: typeof mainnet;
  tokens: {
    [TKey in keyof typeof mainnet.tokens]: StandardERC20;
  };
  whales: {
    [TKey in keyof typeof mainnet.whales]: Signer;
  };
}

export async function configureForkRelease({
  provider,
  deployer,
  mgm,
  dispatcher,
  accounts,
}: {
  provider: providers.JsonRpcProvider;
  deployer: Signer;
  mgm: Signer;
  dispatcher: Dispatcher;
  accounts: Signer[];
}): Promise<ForkReleaseDeploymentConfig> {
  const whales = Object.keys(mainnet.whales).reduce(
    (carry, current) => ({
      ...carry,
      [current]: provider.getSigner((mainnet.whales as any)[current]),
    }),
    {},
  ) as {
    [TKey in keyof typeof mainnet.whales]: Signer;
  };

  const tokens = Object.keys(mainnet.tokens).reduce(
    (carry, current) => ({
      ...carry,
      [current]: new StandardERC20(
        (mainnet.tokens as any)[current],
        provider,
      ).connect(accounts[0]),
    }),
    {},
  ) as {
    [TKey in keyof typeof mainnet.tokens]: StandardERC20;
  };

  const poorAccounts = Object.entries(whales)
    .filter(([key]) => key !== 'eth')
    .map(([, whale]) => whale)
    .concat(accounts);

  await Promise.all(
    poorAccounts.map((account) => {
      return makeEthRich(whales.eth, account);
    }),
  );

  const tokenWhales = Object.entries(whales).filter(([symbol]) => {
    return tokens.hasOwnProperty(symbol);
  });

  await Promise.all(
    accounts.map((signer) => {
      return Promise.all(
        tokenWhales.map(([symbol, whale]) => {
          const token = tokens[symbol as keyof typeof tokens];
          return makeTokenRich(token, whale, signer);
        }),
      );
    }),
  );

  return {
    deployer,
    mgm,
    mainnet,
    tokens,
    whales,
    dispatcher: dispatcher.address,
    mln: mainnet.tokens.mln,
    weth: mainnet.tokens.weth,
    registeredVaultCalls: {
      contracts: [],
      selectors: [],
    },
    engine: {
      thawDelay: 10000000000,
    },
    chainlink: {
      rateQuoteAsset: mainnet.tokens.weth,
      aggregators: Object.values(mainnet.chainlinkPriceSources),
      primitives: Object.keys(mainnet.chainlinkPriceSources).map(
        (key) => (mainnet.tokens as any)[key],
      ),
    },
    integratees: {
      chai: mainnet.chai,
      kyber: mainnet.kyber,
      makerDao: {
        dai: randomAddress(), // TODO
        pot: randomAddress(), // TODO
      },
      uniswapV2: {
        factory: randomAddress(), // TODO
      },
    },
  };
}

export async function makeEthRich(sender: Signer, receiver: AddressLike) {
  return sender.sendTransaction({
    to: await resolveAddress(receiver),
    value: utils.parseEther('100'),
  });
}

export async function makeTokenRich(
  token: StandardERC20,
  sender: Signer,
  receiver: AddressLike,
) {
  // 100 * 10^(decimals)
  const amount = constants.One.mul(10)
    .pow(await token.decimals())
    .mul(100);
  await token.connect(sender).transfer(receiver, amount);
}
