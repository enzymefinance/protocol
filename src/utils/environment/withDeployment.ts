import { Environment, Deployment, WithDeployment } from './Environment';

const withDeployment = (
  environment: Environment,
  deployment: Deployment,
): WithDeployment => ({
  ...environment,
  deployment,
});

export { withDeployment };
