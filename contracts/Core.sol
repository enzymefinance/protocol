pragma solidity ^0.4.4;

import "./dependencies/ERC20.sol";
import "./dependencies/ERC20Protocol.sol";
import "./dependencies/Owned.sol";
import "./dependencies/SafeMath.sol";
import "./tokens/EtherToken.sol";
import "./router/RegistrarProtocol.sol";
import "./router/PriceFeedProtocol.sol";
import "./router/ManagementFeeProtocol.sol";
import "./router/PerformanceFeeProtocol.sol";

contract Shares is ERC20 {}

/// @title Core Contract
/// @author Melonport AG <team@melonport.com>
contract Core is Shares, SafeMath, Owned {

    // TYPES

    struct Manager {
        uint capital;
        uint delta;
        bool received_first_investment;
        uint evaluation_interval;  // Calcuate delta for fees every x days
    }
    // Analytics of last time creation/annihilation of shares happened.
    struct Analytics {
        uint nav;
        uint delta;
        uint timestamp;
    }
    struct Modules {
        EtherToken ether_token;
        RegistrarProtocol registrar;
        ManagementFeeProtocol management_fee;
        PerformanceFeeProtocol performance_fee;
    }

    // FIELDS

    Manager manager;
    Analytics analytics;
    Modules module;

    uint public sumInvested;
    uint public sumWithdrawn;
    uint public sumAssetsBought;
    uint public sumAssetsSold;
    uint public sharePrice = 1 ether;

    // EVENTS

    event SharesCreated(address buyer, uint numShares, uint sharePrice);
    event SharesAnnihilated(address seller, uint numShares, uint sharePrice);
    event Refund(address to, uint value);
    event LogString(string text);
    event LogInt(string text, uint value);
    event LogBool(string text, bool value);

    // CONSTANT METHDOS

    // NON-CONSTANT METHODS

    function Core(
        address addrEtherToken,
        address addrRegistrar
    ) {
        analytics.nav = 0;
        analytics.delta = 1 ether;
        analytics.timestamp = now;

        module.ether_token = EtherToken(addrEtherToken);
        module.registrar = RegistrarProtocol(addrRegistrar);
    }

    // Invest in a fund by creating shares
    /* Note:
     *  This is can be seen as a none persistent all or nothing limit order, where:
     *  quantity == quantitiyShares and
     *  amount == msg.value (amount investor is willing to pay for the req. quantity)
     */
    function createShares(uint wantedShares) returns (bool) {
        if (msg.value <= 0 || wantedShares == 0)
          throw;

        sharePrice = calcSharePrice();
        sharePrice = 1 ether;

        if (sharePrice == 0) throw;
        uint sentFunds = msg.value;

        LogInt('create shares; sentFunds', sentFunds);
        LogInt('create shares; sharePrice', sharePrice);
        LogInt('create shares; if calc', sharePrice * wantedShares / (1 ether));

        // Check if enough funds sent for requested quantity of shares.
        uint curSumInvested = 0;
        if (sharePrice * wantedShares / (1 ether) <= sentFunds) {
            // Create Shares
            balances[msg.sender] += wantedShares;
            totalSupply += wantedShares;
            curSumInvested = sharePrice * wantedShares / (1 ether);
            sumInvested += curSumInvested;
            // Bookkeeping
            analytics.nav += curSumInvested;
            // Flag first investment as happened
            if (manager.received_first_investment == false) {
                manager.received_first_investment = true;
            }
            // Store Ether in EtherToken contract
            assert(module.ether_token.send(msg.value));
            SharesCreated(msg.sender, wantedShares, sharePrice);
        }
        // Refund remainder
        uint remainder = 0;
        if (sharePrice * wantedShares / (1 ether) < sentFunds) {
            remainder = sentFunds - sharePrice * wantedShares / (1 ether);
            LogInt('create shares', remainder);
            if(!msg.sender.send(remainder)) throw;
            Refund(msg.sender, remainder);
        }

        return true;
    }

    /// Withdraw from a fund by annihilating shares
    function annihilateShares(uint offeredShares, uint wantedAmount) returns (bool) {
      if (manager.received_first_investment == false ||
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
      if (wantedAmount <= sharePrice * offeredShares / (1 ether)) {
          // Annihilate Shares
          balances[msg.sender] -= offeredShares;
          totalSupply -= offeredShares;
          curSumWithdrawn = sharePrice * offeredShares / (1 ether);
          sumWithdrawn += curSumWithdrawn;
          // Bookkeeping
          analytics.nav -= curSumWithdrawn;
          // Send Funds
          if(!msg.sender.send(curSumWithdrawn)) throw;
          SharesAnnihilated(msg.sender, offeredShares, sharePrice);
      }
      // Refund remainder
      if (wantedAmount < sharePrice * offeredShares / (1 ether)) {
          uint remainder = sharePrice * offeredShares / (1 ether) - wantedAmount;
          if(!msg.sender.send(remainder)) throw;
          Refund(msg.sender, remainder);
      }

      return true;
    }

    /*
     *  METHODS - SHARE PRICE
     */
    /// Post: Calculate Share Price in Wei
    function calcSharePrice() constant returns (uint) { return calcDelta(); }

    /// Pre:
    /// Post: Delta as a result of current and previous NAV
    function calcDelta() constant returns (uint delta) {
        uint nav = calcNAV();
        // Set delta
        if (analytics.nav == 0) {
            delta = 1 ether; // First investment not made
        } else if (nav == 0) {
            delta = 1 ether; // First investment made; All funds withdrawn
        } else {
            delta = (analytics.delta * nav) / analytics.nav; // First investment made; Not all funds withdrawn
        }
        // Update Analytics
        analytics.delta = delta;
        analytics.nav = nav;
        analytics.timestamp = now;
    }

    /// Pre:
    /// Post: Portfolio Net Asset Value in Wei, managment and performance fee allocated
    function calcNAV() constant returns (uint nav) {
        uint managementFee = 0;
        uint performanceFee = 0;
        nav = calcGAV() - managementFee - performanceFee;
    }

    /// Pre: Precision in Token must be equal to precision in PriceFeed for all entries in Registrar
    /// Post: Portfolio Gross Asset Value in Wei
    function calcGAV() constant returns (uint gav) {
        /* Rem:
         *  The current Investment (Withdrawal) is not yet stored in the
         *  sumInvested (sumWithdrawn) field.
         * Rem 2:
         *  Since by convention the first asset represents Ether, and the prices
         *  are given in Ether the first price is always equal to one.
         * Rem 3:
         *  Assets need to be linked to the right price feed
         * Rem 4:
         *  Price Input Unit: [Wei/(Asset * 10**(uint(precision)))]
         *  Holdings Input Unit: [Asset * 10**(uint(precision)))]
         *  with 0 <= precision <= 18 and precision is a natural number.
         */
        gav += module.ether_token.balanceOf(this) * 1; // EtherToken as Asset
        uint numAssignedAssets = module.registrar.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            ERC20Protocol ERC20 = ERC20Protocol(address(module.registrar.assetAt(i)));
            uint holdings = ERC20.balanceOf(address(this)); // Asset holdings
            PriceFeedProtocol Price = PriceFeedProtocol(address(module.registrar.priceFeedsAt(i)));
            uint price = Price.getPrice(address(module.registrar.assetAt(i))); // Asset price
            gav += holdings * price; // Sum up product of asset holdings and asset prices
        }
    }
}
