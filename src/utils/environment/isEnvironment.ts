import { Environment } from '.';

export const isEnvironment = (
  candidate: Environment | any,
): candidate is Environment => {
  return (
    candidate && !!candidate.eth && !!candidate.track && !!candidate.options
  );
};

//  export { isEnvironment };
