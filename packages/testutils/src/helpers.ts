import type { AddressLike, ContractReceipt } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ValueInterpreter } from '@enzymefinance/protocol';
import { SelfDestructEthPayer } from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';
import { BigNumber, utils } from 'ethers';
import { MerkleTree } from 'merkletreejs';

export async function calcMlnValueAndBurnAmountForSharesBuyback({
  valueInterpreter,
  mln,
  denominationAsset,
  sharesSupply,
  gav,
  buybackSharesAmount,
}: {
  valueInterpreter: ValueInterpreter;
  mln: AddressLike;
  denominationAsset: AddressLike;
  sharesSupply: BigNumberish;
  gav: BigNumberish;
  buybackSharesAmount: BigNumberish;
}) {
  // Calculate expected mlnValue of shares to buyback
  // TODO: calcGrossShareValue can also be a helper util
  const grossShareValue = BigNumber.from(gav).mul(utils.parseEther('1')).div(sharesSupply);
  const denominationAssetValueOfBuyback = grossShareValue.mul(buybackSharesAmount).div(utils.parseEther('1'));
  const mlnValueOfBuyback = await valueInterpreter.calcCanonicalAssetValue
    .args(denominationAsset, denominationAssetValueOfBuyback, mln)
    .call();

  // 50% discount
  const mlnAmountToBurn = mlnValueOfBuyback.div(2);

  return { mlnAmountToBurn, mlnValue: mlnValueOfBuyback };
}

export function generateMerkleTreeForContractProof({
  itemArrays,
  itemTypes,
}: {
  itemArrays: any[];
  itemTypes: string[];
}) {
  // Leaves in contracts are constructed with `keccak256(abi.encodePacked(paramA, paramB, ..))`
  const leaves = itemArrays.map((itemArray) => utils.solidityKeccak256(itemTypes, itemArray));
  // Sorting keeps the order of itemArrays
  const tree = new MerkleTree(leaves, utils.keccak256, { sort: true });
  const root = tree.getHexRoot();

  return { leaves, root, tree };
}

export async function sendEthBySelfDestruct({
  signer,
  recipient,
  amount = utils.parseEther('1'),
}: {
  signer: SignerWithAddress;
  recipient: AddressLike;
  amount?: BigNumberish;
}) {
  const selfDestructEthPayer = await SelfDestructEthPayer.deploy(signer);

  await selfDestructEthPayer.destructTo.args(recipient).value(amount).send();
}

export async function transactionTimestamp(receipt: ContractReceipt<any>) {
  const block = await provider.getBlock(receipt.blockNumber);

  return block.timestamp;
}
