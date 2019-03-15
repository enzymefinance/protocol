import { Address } from '@melonproject/token-math';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const getPerformanceFee = async (
  environment: Environment,
  feeManagerAddress: Address,
) => {
  const feeManagerContract = getContract(
    environment,
    Contracts.FeeManager,
    feeManagerAddress,
  );

  const performanceAddress = await feeManagerContract.methods.fees(1).call();
  const performanceFeeContract =
    performanceAddress &&
    getContract(environment, Contracts.PerformanceFee, performanceAddress);

  const address = feeManagerAddress.toString();
  const [rate = undefined, period = undefined] =
    (performanceAddress &&
      (await Promise.all([
        performanceFeeContract.methods.performanceFeeRate(address).call(),
        performanceFeeContract.methods.performanceFeePeriod(address).call(),
      ]))) ||
    [];

  return {
    period,
    rate: rate && rate / 10 ** 16,
  };
};
