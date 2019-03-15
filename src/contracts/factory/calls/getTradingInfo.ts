import { Address } from '@melonproject/token-math';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const getTradingInfo = async (
  environment: Environment,
  contractAddress: Address,
  managerAddress: Address,
) => {
  const contract = getContract(
    environment,
    Contracts.FundFactory,
    contractAddress,
  );

  const tradingInfo = await contract.methods
    .getTradeInfo(managerAddress.toString())
    .call();
  return tradingInfo;
};
