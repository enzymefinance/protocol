import { ensure } from '~/utils/guards/ensure';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

const ensureFundOwner = async (environment, spokeAddress) => {
  const hubAddress = await getHub(environment, spokeAddress);
  const hubContract = getContract(environment, Contracts.Hub, hubAddress);
  const manager = await hubContract.methods.manager().call();

  ensure(
    environment.wallet.address.toLowerCase() === manager.toLowerCase(),
    `The given account ${manager} is not the owner of the fund ${hubAddress}`,
  );
};

export { ensureFundOwner };
