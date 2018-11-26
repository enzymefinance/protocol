test('timeout', async () =>
  new Promise(resolve => {
    setTimeout(resolve, 9500);
  }));
