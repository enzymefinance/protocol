import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  ComptrollerProxy,
  encodeFunctionData,
  FundDeployer,
  StandardToken,
  VaultLib,
  VaultProxy,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish, BytesLike, utils } from 'ethers';
import { assertEvent } from '../assertions';
import { buyShares, BuySharesParams } from './shares';

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
  denominationAsset: StandardToken;
  sharesActionTimelock?: BigNumberish;
  fundOwner?: AddressLike;
  fundName?: string;
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
    creator: signer,
    comptrollerProxy: expect.any(String) as string,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
    feeManagerConfigData: utils.hexlify(feeManagerConfigData),
    policyManagerConfigData: utils.hexlify(policyManagerConfigData),
  });

  return {
    receipt,
    comptrollerProxy: new ComptrollerLib(comptrollerDeployedArgs.comptrollerProxy, signer),
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
  feeManagerConfig = '0x',
  policyManagerConfig = '0x',
  investment,
}: CreateNewFundParams) {
  const receipt = await fundDeployer
    .connect(signer)
    .createNewFund(fundOwner, fundName, denominationAsset, sharesActionTimelock, feeManagerConfig, policyManagerConfig);

  const comptrollerDeployedArgs = assertEvent(receipt, 'ComptrollerProxyDeployed', {
    creator: signer,
    comptrollerProxy: expect.any(String) as string,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
    feeManagerConfigData: utils.hexlify(feeManagerConfig),
    policyManagerConfigData: utils.hexlify(policyManagerConfig),
  });

  const comptrollerProxy = new ComptrollerLib(comptrollerDeployedArgs.comptrollerProxy, signer);

  const newFundDeployedArgs = assertEvent(receipt, 'NewFundCreated', {
    creator: signer,
    vaultProxy: expect.any(String) as string,
    comptrollerProxy,
  });

  const vaultProxy = new VaultLib(newFundDeployedArgs.vaultProxy, signer);

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
    creator: signer,
    comptrollerProxy: expect.any(String) as string,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
    feeManagerConfigData: utils.hexlify(feeManagerConfigData),
    policyManagerConfigData: utils.hexlify(policyManagerConfigData),
  });

  return {
    receipt,
    comptrollerProxy: new ComptrollerLib(comptrollerDeployedArgs.comptrollerProxy, signer),
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
