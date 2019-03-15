import { Address } from '@melonproject/token-math';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const getManagementFee = async (
  environment: Environment,
  feeManagerAddress: Address,
) => {
  const feeManagerContract = getContract(
    environment,
    Contracts.FeeManager,
    feeManagerAddress,
  );

  const managementAddress = await feeManagerContract.methods.fees(0).call();
  const managementFeeContract =
    managementAddress &&
    getContract(environment, Contracts.ManagementFee, managementAddress);

  const method =
    managementFeeContract && managementFeeContract.methods.managementFeeRate;

  const rate = method && (await method(feeManagerAddress.toString()).call());

  return {
    rate: rate && rate / 10 ** 16,
  };
};
