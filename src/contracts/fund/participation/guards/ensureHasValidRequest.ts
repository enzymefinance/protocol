import { ensure } from '~/utils/guards/ensure';
import { hasValidRequest } from '../calls/hasValidRequest';

const ensureHasValidRequest = async (
  environment,
  participationContractAddress,
  investor,
) => {
  const validRequest = await hasValidRequest(
    environment,
    participationContractAddress,
    { investor },
  );

  ensure(
    validRequest,
    `Investor ${investor} does not have a valid/executable request.`,
  );
};

export { ensureHasValidRequest };
