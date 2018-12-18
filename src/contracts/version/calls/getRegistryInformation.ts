import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';
import { TokenInterface } from '@melonproject/token-math/token';
import { getContract } from '~/utils/solidity/getContract';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { isEmptyAddress } from '~/utils/checks/isEmptyAddress';

interface AssetInformation extends TokenInterface {
  name?: string;
  url?: string;
  standards: number[];
  sigs: string[];
}

interface ExchangeInformation {
  address: Address;
  adapter: Address;
  takesCustody: boolean;
  sigs: string[];
}

interface VersionInformation {
  address: Address;
  name: string;
}

interface RegistryInformation {
  engine?: Address;
  priceSource?: Address;
  mlnToken?: TokenInterface;
  ethfinexWrapperRegistry?: Address;
  registeredAssets: {
    // Its easier to look up through the address string because
    // a = Address('a')
    // b = Address('a')
    // a !== b // :( --> Reference comparison
    [address: string]: AssetInformation;
  };
  registeredExchanges: {
    [address: string]: ExchangeInformation;
  };
  registeredVersions: {
    [address: string]: VersionInformation;
  };
}

const postProcess = async (environment, result, prepared) => {
  try {
    const registryContract = await getContract(
      environment,
      Contracts.Registry,
      prepared.contractAddress,
    );

    const mlnAddress = await registryContract.methods.mlnToken().call();
    const mlnToken = isEmptyAddress(mlnAddress)
      ? undefined
      : await getToken(environment, mlnAddress);

    const engine = isEmptyAddress(result) ? undefined : new Address(result);

    const ethfinexWrapperRegistry = await registryContract.methods
      .ethfinexWrapperRegistry()
      .call();

    const priceSource = await registryContract.methods.priceSource().call();

    const registryInformation: RegistryInformation = {
      engine,
      ethfinexWrapperRegistry: isEmptyAddress(ethfinexWrapperRegistry)
        ? undefined
        : new Address(ethfinexWrapperRegistry),
      mlnToken,
      priceSource: isEmptyAddress(priceSource)
        ? undefined
        : new Address(priceSource),
      registeredAssets: {},
      registeredExchanges: {},
      registeredVersions: {},
    };

    const registeredAssets = await registryContract.methods
      .getRegisteredAssets()
      .call();
    const registeredExchanges = await registryContract.methods
      .getRegisteredExchanges()
      .call();
    const registeredVersions = await registryContract.methods
      .getRegisteredVersions()
      .call();

    for (const asset of registeredAssets) {
      const assetInfo = await registryContract.methods
        .assetInformation(asset)
        .call();

      registryInformation.registeredAssets[asset.toLowerCase()] = {
        address: asset,
        decimals: assetInfo.decimals,
        name: assetInfo.name,
        sigs: assetInfo.sigs,
        standards: assetInfo.standards,
        symbol: assetInfo.symbol,
        url: assetInfo.url,
      };
    }

    for (const exchange of registeredExchanges) {
      const exchangeInfo = await registryContract.methods
        .exchangeInformation(exchange)
        .call();

      registryInformation.registeredExchanges[exchange.toLowerCase()] = {
        adapter: new Address(exchangeInfo.adapter),
        address: new Address(exchange),
        sigs: exchangeInfo.sigs,
        takesCustody: exchangeInfo.takesCustody,
      };
    }

    for (const version of registeredVersions) {
      const versionInfo = await registryContract.methods
        .versionInformation(version)
        .call();

      registryInformation.registeredVersions[version.toLowerCase()] = {
        address: new Address(version),
        name: versionInfo.name,
      };
    }

    return registryInformation;
  } catch (error) {
    throw new Error(`getRegistryInformation failed: ${error.message}`);
  }
};

const getRegistryInformation = callFactoryWithoutParams(
  'engine',
  Contracts.Registry,
  {
    postProcess,
  },
);

export { getRegistryInformation };
