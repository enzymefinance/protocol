// @flow

const getAllBalances = async () => {
  return {
    investor: {
      mlnToken: Number(
        await mlnToken.instance.balanceOf.call({}, [investor]),
      ),
      ethToken: Number(
        await ethToken.instance.balanceOf.call({}, [investor]),
      ),
      ether: new BigNumber(await api.eth.getBalance(investor)),
    },
    manager: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [manager])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [manager])),
      ether: new BigNumber(await api.eth.getBalance(manager)),
    },
    fund: {
      mlnToken: Number(
        await mlnToken.instance.balanceOf.call({}, [fund.address]),
      ),
      ethToken: Number(
        await ethToken.instance.balanceOf.call({}, [fund.address]),
      ),
      ether: new BigNumber(await api.eth.getBalance(fund.address)),
    },
    worker: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [worker])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [worker])),
      ether: new BigNumber(await api.eth.getBalance(worker)),
    },
    deployer: {
      mlnToken: Number(
        await mlnToken.instance.balanceOf.call({}, [deployer]),
      ),
      ethToken: Number(
        await ethToken.instance.balanceOf.call({}, [deployer]),
      ),
      ether: new BigNumber(await api.eth.getBalance(deployer)),
    },
  };
}

export default getAllBalances;
