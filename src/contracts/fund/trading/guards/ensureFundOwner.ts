import { ensure } from '~/utils/guards/ensure';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

const ensureFundOwner = async (
  spokeAddress,
  environment = getGlobalEnvironment(),
) => {
  const hubAddress = await getHub(spokeAddress, environment);
  const hubContract = getContract(Contracts.Hub, hubAddress);
  const manager = await hubContract.methods.manager().call();

  ensure(
    environment.wallet.address.toLowerCase() === manager.toLowerCase(),
    `The given account ${manager} is not the owner of the fund ${hubAddress}`,
  );
};

export { ensureFundOwner };
