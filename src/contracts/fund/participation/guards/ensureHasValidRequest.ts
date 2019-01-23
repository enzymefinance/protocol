import { ensure } from '~/utils/guards/ensure';
import { hasValidRequest } from '../calls/hasValidRequest';

const ensureHasValidRequest = async (
  environment,
  participationContractAddress,
) => {
  const validRequest = await hasValidRequest(
    environment,
    participationContractAddress,
    { investor: environment.wallet.address },
  );
  ensure(
    validRequest,
    `Investor ${
      environment.wallet.address
    } does not have a valid/executable request.`,
  );
};

export { ensureHasValidRequest };
