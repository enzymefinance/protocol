pragma solidity ^0.4.4;

import "./dependencies/ERC20.sol";
import "./dependencies/ERC20Protocol.sol";
import "./dependencies/Owned.sol";
import "./router/RegistrarProtocol.sol";
import "./router/PriceFeedProtocol.sol";
import "./router/PerformanceFeeProtocol.sol";

contract Shares is ERC20 {}


contract CoreProtocol {
  uint public sumInvested;
  uint public sumWithdrawn;
  uint public sumAssetsBought;
  uint public sumAssetsSold;
  uint public maxInvestment;
  uint public sharePrice = 10**18;

  event SharesCreated(address buyer, uint numShares, uint sharePrice);
  event SharesAnnihilated(address seller, uint numShares, uint sharePrice);
  event Refund(address to, uint value);

  event LogString(string text);
  event LogInt(string text, uint value);
  event LogBool(string text, bool value);
}


/// @title Core Contract
/// @author Melonport AG <team@melonport.com>
contract Core is Owned, CoreProtocol, Shares {
  /*
   *  TYPES
   */
  struct Manager {
    uint capital;
    uint delta;
    bool receivedFirstInvestment;
    uint evaluationInterval;  // Calcuate delta for fees every x days
  }
  // Analytics of last time creation/annihilation of shares happened.
  struct Analytics {
    uint nav;
    uint delta;
    uint timestamp;
  }
  struct Modules {
    RegistrarProtocol registrar;
    PerformanceFeeProtocol performanceFee;
    address addrKYC;
    address addrAML;
  }

  /*
   *  FIELDS
   */
  Manager manager;
  Analytics analytics;
  Modules module;

  /*
   *  METHODS
   */
  function Core(
    address addrRegistrar,
    address addrPerformanceFee,
    uint maxInvestment_
  ) {
    // Open or closed ended portfolio
    if (maxInvestment_ != 0)
      maxInvestment = maxInvestment_;

    analytics.nav = 0;
    analytics.delta = 10**18;
    analytics.timestamp = now;

    module.registrar = RegistrarProtocol(addrRegistrar);
    module.performanceFee = PerformanceFeeProtocol(addrPerformanceFee);
  }

  function () { throw; }

  /*
   *  METHODS - INVESTING
   */
  /// Invest in a fund by creating shares
  /* Note:
   *  This is can be seen as a none persistent all or nothing limit order, where:
   *  quantity == quantitiyShares and
   *  amount == msg.value (amount investor is willing to pay for the req. quantity)
   */
  function createShares(uint wantedShares) returns (bool) {
    if (msg.value <= 0 || wantedShares == 0)
      throw;

    sharePrice = calcSharePrice();
    sharePrice = 10**18;

    if (sharePrice == 0) throw;
    uint sentFunds = msg.value;

    if (maxInvestment != 0 &&
        maxInvestment > sharePrice * wantedShares / 10**18)
      throw;

    LogInt('create shares; sentFunds', sentFunds);
    LogInt('create shares; sharePrice', sharePrice);
    LogInt('create shares; if calc', sharePrice * wantedShares / 10**18);

    // Check if enough funds sent for requested quantity of shares.
    uint curSumInvested = 0;
    if (sharePrice * wantedShares / 10**18 <= sentFunds) {
      // Create Shares
      balances[msg.sender] += wantedShares;
      totalSupply += wantedShares;
      curSumInvested = sharePrice * wantedShares / 10**18;
      sumInvested += curSumInvested;
      // Bookkeeping
      analytics.nav += curSumInvested;
      // Flag first investment as happened
      if (manager.receivedFirstInvestment == false) {
        manager.receivedFirstInvestment = true;
      }
      SharesCreated(msg.sender, wantedShares, sharePrice);
    }
    // Refund remainder
    uint remainder = 0;
    if (sharePrice * wantedShares / 10**18 < sentFunds) {
      remainder = sentFunds - sharePrice * wantedShares / 10**18;
      LogInt('create shares', remainder);
      if(!msg.sender.send(remainder)) throw;
      Refund(msg.sender, remainder);
    }

    return true;
  }

  /*
   *  METHODS - WITHDRAWING
   */
  /// Withdraw from a fund by annihilating shares
  function annihilateShares(uint offeredShares, uint wantedAmount) returns (bool) {
    if (manager.receivedFirstInvestment == false ||
        offeredShares == 0 ||
        wantedAmount == 0)
      throw;

    // Assert if sender has enough shares
    if (balances[msg.sender] < offeredShares)
      throw;

    // First investment happened
    sharePrice = calcSharePrice();
    LogInt('annihilateShares::sharePrice', sharePrice);
    if (sharePrice == 0)
      throw;

    /* TODO implement forced withdrawal
     *  Via registrar contract and exchange
     */
    uint ethBalance = this.balance;
    if (wantedAmount > ethBalance)
      throw;

    // Check if enough shares offered for requested amount of funds.
    uint curSumWithdrawn = 0;
    if (wantedAmount <= sharePrice * offeredShares / 10**18) {
      // Annihilate Shares
      balances[msg.sender] -= offeredShares;
      totalSupply -= offeredShares;
      curSumWithdrawn = sharePrice * offeredShares / 10**18;
      sumWithdrawn += curSumWithdrawn;
      // Bookkeeping
      analytics.nav -= curSumWithdrawn;
      // Send Funds
      if(!msg.sender.send(curSumWithdrawn)) throw;
      SharesAnnihilated(msg.sender, offeredShares, sharePrice);
    }
    // Refund remainder
    if (wantedAmount < sharePrice * offeredShares / 10**18) {
      uint remainder = sharePrice * offeredShares / 10**18 - wantedAmount;
      if(!msg.sender.send(remainder)) throw;
      Refund(msg.sender, remainder);
    }

    return true;
  }

  /*
   *  METHODS - SHARE PRICE
   */
  /// Calculate Share Price in Wei
  function calcSharePrice() constant private returns (uint) {
    uint delta = calcDelta();
    /* Rem:
     *  sharePrice := delta - perf.fee - manage.fee
     */
    return delta;
  }

  /// Calculate Delta in percent
  function calcDelta() constant private returns (uint) {
    uint delta;
    uint nav = calcNAV();

    if (analytics.nav == 0) {
      // First investment not made
      delta = 10**18;
    } else if (nav == 0) {
      // First investment made; all funds withdrawn
      delta = 10**18;
    } else {
      // First investment made; not all funds withdrawn
      delta = (analytics.delta * nav) / analytics.nav;
    }

    LogInt('calcDelta; nav', nav);
    LogInt('calcDelta; analytics.nav', analytics.nav);
    LogInt('calcDelta; delta', delta);
    LogInt('calcDelta; delta.analytics', analytics.delta);

    // Update Analytics
    analytics.delta = delta;
    analytics.nav = nav;
    analytics.timestamp = now;

    // Reference Type here!
    return delta;
  }

  function calcNAV() constant private returns (uint) {
    uint gav = calcGAV();
    /* Rem:
     *  nav := gav - perf.fee - manage.fee
     */
     return gav;
  }

  /// Calcualte Fund Gross Asset Value in Wei
  function calcGAV() constant private returns (uint) {
    // Add ether amount of fund
    /* Rem:
     *  The current Investment (Withdrawal) is not yet stored in the
     *  sumInvested (sumWithdrawn) field.
     * Rem 2:
     *  Since by convention the first asset represents Ether, and the prices
     *  are given in Ether the first price is always equal to one.
     */
    uint gav = sumInvested - sumAssetsBought - sumWithdrawn + sumAssetsSold;

    /* Rem:
     *  Assets need to be linked to the right price feed
     */
    // Add assets other then ether
    uint numAssets = module.registrar.numAssets();
    /*LogInt('calcGAV::numAssets', numAssets);*/
    for (uint i = 0; i < numAssets; ++i) {
      // Get asset holdings
      ERC20Protocol ERC20 = ERC20Protocol(address(module.registrar.assets(i)));
      uint holdings = ERC20.balanceOf(address(this));
      // Get asset prices
      PriceFeedProtocol Price = PriceFeedProtocol(address(module.registrar.prices(i)));
      uint price = Price.getPrice(address(module.registrar.assets(i)));
      uint precision = Price.precision();
      // Sum up product of asset holdings and asset prices
      /* Rem:
       *  Price Input Unit: [Wei/(Asset * 10**(uint(precision)))]
       *  Holdings Input Unit: [Asset * 10**(uint(precision)))]
       *  with 0 <= precision <= 18 and precision is a natural number.
       */
      gav += holdings * price;
      LogInt('calcGAV::precision', precision);
      LogInt('calcGAV::holdings', holdings);
      LogInt('calcGAV::price', price);
      LogInt('calcGAV::gav', gav);
    }

    return gav;
  }
}
