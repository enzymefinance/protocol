require("dotenv").config({
  path: require("find-up").sync([".env", ".env.defaults"])
});

// Once loaded it runs faster
// require("ganache-cli");

module.exports = async globalConfig => {};
