import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';
import { TokenInterface } from '@melonproject/token-math/token';
import { getContract } from '~/utils/solidity/getContract';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

interface AssetInformation extends TokenInterface {
  name?: string;
  url?: string;
  standards: number[];
  sigs: string[];
}

interface ExchangeInformation {
  adapter: Address;
  takesCustody: boolean;
  sigs: string[];
}

interface VersionInformation {
  name: string;
}

interface RegistryInformation {
  engine: Address;
  priceSource: Address;
  mlnToken: TokenInterface;
  ethfinexWrapperRegistry: Address;
  registeredAssets: Map<Address, AssetInformation>;
  registeredExchanges: Map<Address, ExchangeInformation>;
  registeredVersions: Map<Address, VersionInformation>;
}

const postProcess = async (environment, result, prepared) => {
  try {
    const registryContract = await getContract(
      environment,
      Contracts.Registry,
      prepared.contractAddress,
    );

    const mlnAddress = await registryContract.methods.mlnToken().call();
    const mlnToken = await getToken(environment, mlnAddress);

    const registryInformation: RegistryInformation = {
      engine: new Address(result),
      ethfinexWrapperRegistry: new Address(
        await registryContract.methods.ethfinexWrapperRegistry().call(),
      ),
      mlnToken,
      priceSource: new Address(
        await registryContract.methods.priceSource().call(),
      ),
      registeredAssets: new Map(),
      registeredExchanges: new Map(),
      registeredVersions: new Map(),
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

      registryInformation.registeredAssets.set(new Address(asset), {
        decimals: assetInfo.decimals,
        name: assetInfo.name,
        sigs: assetInfo.sigs,
        standards: assetInfo.standards,
        symbol: assetInfo.symbol,
        url: assetInfo.url,
      });
    }

    for (const exchange of registeredExchanges) {
      const exchangeInfo = await registryContract.methods
        .exchangeInformation(exchange)
        .call();

      registryInformation.registeredExchanges.set(new Address(exchange), {
        adapter: new Address(exchangeInfo.adapter),
        sigs: exchangeInfo.sigs,
        takesCustody: exchangeInfo.takesCustody,
      });
    }

    for (const version of registeredVersions) {
      const versionInfo = await registryContract.methods
        .versionInformation(version)
        .call();

      registryInformation.registeredVersions.set(new Address(version), {
        name: versionInfo.name,
      });
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
