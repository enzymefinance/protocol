import { configureTestDeployment } from '../deployment';

describe('general walkthrough', () => {
  const snapshot = configureTestDeployment();

  it('create a fund', async () => {
    const deployment = await provider.snapshot(snapshot);
    console.log(await deployment.system.Registry.mlnToken());
  });
});
