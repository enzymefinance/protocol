module.exports = (deployer) => {
  deployer.deploy(Migrations, { gas: 4000000, data: Migrations.unlinked_binary });
};
