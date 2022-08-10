import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { FundDeployer, ITestStandardToken } from '@enzymefinance/protocol';
import {
  ComptrollerLib,
  ComptrollerProxy,
  encodeFunctionData,
  GasRelayPaymasterLib,
  VaultLib,
  VaultProxy,
} from '@enzymefinance/protocol';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, utils } from 'ethers';

import { setAccountBalance } from '../accounts';
import { assertEvent } from '../assertions';
import type { BuySharesParams } from './shares';
import { buyShares } from './shares';

export type InitialInvestmentParams = Omit<BuySharesParams, 'comptrollerProxy' | 'denominationAsset'>;

export interface CreateMigrationRequestParams {
  signer: SignerWithAddress;
  fundDeployer: FundDeployer;
  vaultProxy: AddressLike;
  denominationAsset: AddressLike;
  sharesActionTimelock?: BigNumberish;
  feeManagerConfigData?: BytesLike;
  policyManagerConfigData?: BytesLike;
  bypassPrevReleaseFailure?: boolean;
}

export interface CreateNewFundParams {
  signer: SignerWithAddress;
  fundDeployer: FundDeployer;
  denominationAsset: ITestStandardToken;
  sharesActionTimelock?: BigNumberish;
  fundOwner?: AddressLike;
  fundName?: string;
  fundSymbol?: string;
  feeManagerConfig?: BytesLike;
  policyManagerConfig?: BytesLike;
  investment?: InitialInvestmentParams;
}

export interface CreateReconfigurationRequestParams {
  signer: SignerWithAddress;
  fundDeployer: FundDeployer;
  vaultProxy: AddressLike;
  denominationAsset: AddressLike;
  sharesActionTimelock?: BigNumberish;
  feeManagerConfigData?: BytesLike;
  policyManagerConfigData?: BytesLike;
}

export async function createComptrollerProxy({
  signer,
  comptrollerLib,
  denominationAsset,
  sharesActionTimelock = 0,
}: {
  signer: SignerWithAddress;
  comptrollerLib: ComptrollerLib;
  denominationAsset: AddressLike;
  sharesActionTimelock?: BigNumberish;
}) {
  const constructData = encodeFunctionData(comptrollerLib.init.fragment, [denominationAsset, sharesActionTimelock]);

  const comptrollerProxyContract = await ComptrollerProxy.deploy(signer, constructData, comptrollerLib);

  return {
    comptrollerProxy: new ComptrollerLib(comptrollerProxyContract, signer),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    receipt: comptrollerProxyContract.deployment!,
  };
}

export async function createMigrationRequest({
  signer,
  fundDeployer,
  vaultProxy,
  denominationAsset,
  sharesActionTimelock = 0,
  feeManagerConfigData = '0x',
  policyManagerConfigData = '0x',
  bypassPrevReleaseFailure = false,
}: CreateMigrationRequestParams) {
  const receipt = await fundDeployer
    .connect(signer)
    .createMigrationRequest(
      vaultProxy,
      denominationAsset,
      sharesActionTimelock,
      feeManagerConfigData,
      policyManagerConfigData,
      bypassPrevReleaseFailure,
    );

  const comptrollerDeployedArgs = assertEvent(receipt, 'ComptrollerProxyDeployed', {
    comptrollerProxy: expect.any(String) as string,
    creator: signer,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
  });

  return {
    comptrollerProxy: new ComptrollerLib(comptrollerDeployedArgs.comptrollerProxy, signer),
    receipt,
  };
}

// TODO: should we pass in the fundOwner as a signer also so we can connect comptroller proxy and vault proxy to that acct instead?
export async function createNewFund({
  signer,
  fundDeployer,
  denominationAsset,
  sharesActionTimelock = 0,
  fundOwner = randomAddress(),
  fundName = 'My Fund',
  fundSymbol = '',
  feeManagerConfig = '0x',
  policyManagerConfig = '0x',
  investment,
}: CreateNewFundParams) {
  const receipt = await fundDeployer
    .connect(signer)
    .createNewFund(
      fundOwner,
      fundName,
      fundSymbol,
      denominationAsset,
      sharesActionTimelock,
      feeManagerConfig,
      policyManagerConfig,
    );

  const comptrollerDeployedArgs = assertEvent(receipt, 'ComptrollerProxyDeployed', {
    comptrollerProxy: expect.any(String) as string,
    creator: signer,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
  });

  const comptrollerProxy = new ComptrollerLib(comptrollerDeployedArgs.comptrollerProxy, signer);

  const newFundDeployedArgs = assertEvent(receipt, 'NewFundCreated', {
    comptrollerProxy,
    creator: signer,
    vaultProxy: expect.any(String) as string,
  });

  const vaultProxy = new VaultLib(newFundDeployedArgs.vaultProxy, signer);

  // eslint-disable-next-line eqeqeq
  if (investment != null) {
    await buyShares({
      comptrollerProxy,
      denominationAsset,
      ...investment,
    });
  }

  return {
    comptrollerProxy,
    receipt,
    vaultProxy,
  };
}

export async function createReconfigurationRequest({
  signer,
  fundDeployer,
  vaultProxy,
  denominationAsset,
  sharesActionTimelock = 0,
  feeManagerConfigData = '0x',
  policyManagerConfigData = '0x',
}: CreateReconfigurationRequestParams) {
  const receipt = await fundDeployer
    .connect(signer)
    .createReconfigurationRequest(
      vaultProxy,
      denominationAsset,
      sharesActionTimelock,
      feeManagerConfigData,
      policyManagerConfigData,
    );

  const comptrollerDeployedArgs = assertEvent(receipt, 'ComptrollerProxyDeployed', {
    comptrollerProxy: expect.any(String) as string,
    creator: signer,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
  });

  return {
    comptrollerProxy: new ComptrollerLib(comptrollerDeployedArgs.comptrollerProxy, signer),
    receipt,
  };
}

export async function createVaultProxy({
  signer,
  vaultLib,
  fundOwner,
  fundAccessor,
  fundName = 'My Fund',
}: {
  signer: SignerWithAddress;
  vaultLib: VaultLib;
  fundOwner: AddressLike;
  fundAccessor: SignerWithAddress;
  fundName?: string;
}) {
  const constructData = encodeFunctionData(vaultLib.init.fragment, [fundOwner, fundAccessor, fundName]);

  const vaultProxyContract = await VaultProxy.deploy(signer, constructData, vaultLib);

  return new VaultLib(vaultProxyContract, fundAccessor);
}

export async function setupGasRelayerPaymaster({
  signer,
  vaultProxy,
  fundAccessor,
  provider,
  weth,
  startingBalance = utils.parseUnits('10', 18),
}: {
  signer: SignerWithAddress;
  vaultProxy: AddressLike;
  fundAccessor: AddressLike;
  provider: EthereumTestnetProvider;
  weth: ITestStandardToken;
  startingBalance?: BigNumberish;
}) {
  if (startingBalance) {
    await setAccountBalance({ account: vaultProxy, amount: startingBalance, provider, token: weth });
  }

  const comptrollerProxy = new ComptrollerLib(fundAccessor, signer);
  const receipt = await comptrollerProxy.deployGasRelayPaymaster();

  const eventArgs = assertEvent(receipt, 'GasRelayPaymasterSet', {
    gasRelayPaymaster: expect.any(String) as string,
  });

  return new GasRelayPaymasterLib(eventArgs.gasRelayPaymaster, signer);
}
