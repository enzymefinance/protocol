import { ContractReceipt } from '@enzymefinance/ethers';

export async function transactionTimestamp(receipt: ContractReceipt<any>) {
  const block = await provider.getBlock(receipt.blockNumber);
  return block.timestamp;
}
