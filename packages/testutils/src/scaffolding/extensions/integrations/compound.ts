import type { AddressLike, Contract, Send } from '@enzymefinance/ethers';
import { contract, resolveAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  CompoundAdapter,
  CompoundPriceFeed,
  ComptrollerLib,
  ICERC20,
  IntegrationManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  claimRewardsSelector,
  compoundArgs,
  compoundClaimRewardsArgs,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  StandardToken,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';
import { BigNumber, utils } from 'ethers';

import { getAssetBalances } from '../../common';

export interface ICompoundComptroller extends Contract<ICompoundComptroller> {
  claimComp: Send<(_account: AddressLike) => void>;
}

export const ICompoundComptroller = contract<ICompoundComptroller>()`
  function claimComp(address)
`;

export async function assertCompoundLend({
  tokenWhale,
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  tokenAmount = utils.parseEther('1'),
  cToken,
  compoundPriceFeed,
}: {
  tokenWhale: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  tokenAmount?: BigNumber;
  cToken: ICERC20;
  compoundPriceFeed: CompoundPriceFeed;
}) {
  const token = new StandardToken(await compoundPriceFeed.getTokenFromCToken.args(cToken).call(), tokenWhale);
  await token.connect(tokenWhale).transfer(vaultProxy, tokenAmount);
  const rateBefore = await cToken.exchangeRateStored.call();

  // Exchange rate stored can have a small deviation from exchangeRateStored
  const minIncomingCTokenAmount = tokenAmount
    .mul(utils.parseEther('1'))
    .div(rateBefore)
    .mul(BigNumber.from('999'))
    .div(BigNumber.from('1000'));

  const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [cToken as any, token],
  });

  const lendReceipt = await compoundLend({
    cToken,
    cTokenAmount: minIncomingCTokenAmount,
    compoundAdapter,
    comptrollerProxy,
    fundOwner,
    integrationManager,
    tokenAmount,
  });

  // Get exchange rate after tx (the rate is updated right after)
  const rate = await cToken.exchangeRateStored();
  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [cToken as any, token],
  });

  const expectedCTokenAmount = tokenAmount.mul(utils.parseEther('1')).div(rate);
  expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedCTokenAmount));
  expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(tokenAmount));

  return lendReceipt;
}

export async function assertCompoundRedeem({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  compoundPriceFeed,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cToken: ICERC20;
  compoundPriceFeed: CompoundPriceFeed;
}) {
  const cTokenAmount = utils.parseUnits('1', await cToken.decimals());
  await cToken.transfer(vaultProxy, cTokenAmount);

  const token = new StandardToken(await compoundPriceFeed.getTokenFromCToken.args(cToken).call(), provider);
  const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [token, cToken as any],
  });

  const rateBefore = await cToken.exchangeRateStored();
  const minIncomingTokenAmount = cTokenAmount.mul(rateBefore).div(utils.parseEther('1'));

  const redeemReceipt = await compoundRedeem({
    cToken,
    cTokenAmount,
    compoundAdapter,
    comptrollerProxy,
    fundOwner,
    integrationManager,
    tokenAmount: minIncomingTokenAmount,
    vaultProxy,
  });

  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [token, cToken as any],
  });

  // Get exchange rate after tx (the rate is updated right after)
  const rate = await cToken.exchangeRateStored();
  const expectedTokenAmount = cTokenAmount.mul(rate).div(utils.parseEther('1'));

  expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedTokenAmount));
  expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(cTokenAmount));

  return redeemReceipt;
}

export async function compoundClaim({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  compoundComptroller,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  compoundComptroller: AddressLike;
  cTokens: AddressLike[];
}) {
  const claimArgs = compoundClaimRewardsArgs({
    cTokens,
    compoundComptroller,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    encodedCallArgs: claimArgs,
    selector: claimRewardsSelector,
  });

  const claimRewardsTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return claimRewardsTx;
}

export async function compoundLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cToken: AddressLike;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
}) {
  const lendArgs = compoundArgs({
    cToken,
    minIncomingAssetAmount: cTokenAmount,
    outgoingAssetAmount: tokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    encodedCallArgs: lendArgs,
    selector: lendSelector,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return lendTx;
}

export async function compoundRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cToken: AddressLike;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
}) {
  const redeemArgs = compoundArgs({
    cToken: resolveAddress(cToken),
    minIncomingAssetAmount: tokenAmount,
    outgoingAssetAmount: cTokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
