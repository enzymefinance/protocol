pragma solidity ^0.4.11;

import "./dependencies/ERC20.sol";
import {ERC20 as Shares} from "./dependencies/ERC20.sol";
import "./assets/AssetProtocol.sol";
import "./dependencies/DBC.sol";
import "./dependencies/Owned.sol";
import "./dependencies/SafeMath.sol";
import "./universe/UniverseProtocol.sol";
import "./datafeeds/PriceFeedProtocol.sol";
import "./rewards/RewardsProtocol.sol";
import "./riskmgmt/RiskMgmtProtocol.sol";
import "./exchange/ExchangeProtocol.sol";
import "./VaultProtocol.sol";

/// @title Vault Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple vault
contract Vault is DBC, Owned, Shares, SafeMath, VaultProtocol {

    // TYPES

    struct Calculations {
        uint gav;
        uint managementReward;
        uint performanceReward;
        uint unclaimedRewards;
        uint nav;
        uint sharePrice;
        uint totalSupply;
        uint timestamp;
    }

    struct Modules {
        UniverseProtocol universe;
        RiskMgmtProtocol riskmgmt;
        RewardsProtocol rewards;
    }

    // FIELDS

    // Constant asset specific fields
    string public name;
    string public symbol;
    uint public decimals;
    // Fields that are only changed in constructor
    uint public baseUnitsPerShare; // One unit of share equals 10 ** decimals of base unit of shares
    address public referenceAsset;
    address public melonAsset;
    // Fields that can be changed by functions
    Modules public module;
    Calculations public atLastPayout;

    // EVENTS

    event SharesCreated(address indexed byParticipant, uint atTimestamp, uint numShares); // Participation
    event SharesAnnihilated(address indexed byParticipant, uint atTimestamp, uint numShares);
    event PortfolioContent(uint assetHoldings, uint assetPrice, uint assetDecimals); // Calcualtions
    event SpendingApproved(address ofToken, address onExchange, uint amount); // Managing
    event RewardsConverted(uint atTimestamp, uint numSharesConverted, uint numunclaimedRewards);
    event RewardsPayedOut(uint atTimestamp, uint numSharesPayedOut, uint atSharePrice);
    event CalculationUpdate(uint atTimestamp, uint managementReward, uint performanceReward, uint nav, uint sharePrice, uint totalSupply);

    // PRE, POST, INVARIANT CONDITIONS

    function notZero(uint x) internal returns (bool) { return x != 0; }
    function balancesOfHolderAtLeast(address ofHolder, uint x) internal returns (bool) { return balances[ofHolder] >= x; }

    // CONSTANT METHODS

    function getReferenceAsset() constant returns (address) { return referenceAsset; }
    function getUniverseAddress() constant returns (address) { return module.universe; }
    function getDecimals() constant returns (uint) { return decimals; }
    function getBaseUnitsPerShare() constant returns (uint) { return baseUnitsPerShare; }

    // CONSTANT METHODS - ACCOUNTING

    /// Pre: Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Gross asset value denominated in [base unit of referenceAsset]
    function calcGav() constant returns (uint gav) {
        /* Rem 1:
         *  All prices are relative to the referenceAsset price. The referenceAsset must be
         *  equal to quoteAsset of corresponding PriceFeed.
         * Rem 2:
         *  For this version, the referenceAsset is set as EtherToken.
         *  The price of the EtherToken relative to Ether is defined to always be equal to one.
         * Rem 3:
         *  price input unit: [Wei / ( Asset * 10**decimals )] == Base unit amount of referenceAsset per base unit of asset
         *  vaultHoldings input unit: [Asset * 10**decimals] == Base unit amount of asset this vault holds
         *    ==> vaultHoldings * price == value of asset holdings of this vault relative to referenceAsset price.
         *  where 0 <= decimals <= 18 and decimals is a natural number.
         */
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            // Holdings
            address ofAsset = address(module.universe.assetAt(i));
            AssetProtocol Asset = AssetProtocol(ofAsset);
            uint assetHoldings = Asset.balanceOf(this); // Amount of asset base units this vault holds
            uint assetDecimals = Asset.getDecimals();
            // Price
            PriceFeedProtocol Price = PriceFeedProtocol(address(module.universe.priceFeedAt(i)));
            address quoteAsset = Price.getQuoteAsset();
            assert(referenceAsset == quoteAsset); // See Remark 1
            uint assetPrice;
            if (ofAsset == quoteAsset) {
              assetPrice = 1 * 10 ** assetDecimals; // See Remark 2
            } else {
              assetPrice = Price.getPrice(ofAsset); // Asset price given quoted to referenceAsset (and 'quoteAsset') price
            }
            gav = safeAdd(gav, assetHoldings * assetPrice / (10 ** assetDecimals)); // Sum up product of asset holdings of this vault and asset prices
            PortfolioContent(assetHoldings, assetPrice, assetDecimals);
        }
    }

    /// Pre: Non-zero share supply; value denominated in [base unit of referenceAsset]
    /// Post: Share price denominated in [base unit of referenceAsset * base unit of share / base unit of share] == [base unit of referenceAsset]
    function calcValuePerShare(uint value)
        constant
        pre_cond(notZero(totalSupply))
        returns (uint valuePerShare)
    {
        valuePerShare = (value * baseUnitsPerShare) / totalSupply;
    }

    /// Pre: Gross asset value has been calculated
    /// Post: The sum and its individual parts of all applicable fees denominated in [base unit of referenceAsset]
    function calcUnclaimedRewards(uint gav) constant returns (uint managementReward, uint performanceReward, uint unclaimedRewards) {
        uint timeDifference = safeSub(now, atLastPayout.timestamp);
        managementReward = module.rewards.calculateManagementReward(timeDifference, gav);
        performanceReward = 0;
        if (totalSupply != 0) {
            uint currSharePrice = calcValuePerShare(gav);
            if (currSharePrice - atLastPayout.sharePrice > 0)
              performanceReward = module.rewards.calculatePerformanceReward(currSharePrice - atLastPayout.sharePrice, totalSupply);
        }
        unclaimedRewards = safeAdd(managementReward, performanceReward);
    }

    /// Pre: Gross asset value and sum of all applicable and unclaimed fees has been calculated
    /// Post: Net asset value denominated in [base unit of referenceAsset]
    function calcNav(uint gav, uint unclaimedRewards) constant returns (uint nav) { nav = safeSub(gav, unclaimedRewards); }

    /// Pre: None
    /// Post: Gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice denominated in [base unit of referenceAsset]
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {
        uint gav = calcGav(); // Reflects value indepentent of fees
        var (managementReward, performanceReward, unclaimedRewards) = calcUnclaimedRewards(gav);
        uint nav = calcNav(gav, unclaimedRewards);
        uint sharePrice = notZero(totalSupply) ? calcValuePerShare(nav) : baseUnitsPerShare; // Handle potential division through zero by defining a default value
        return (gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice);
    }

    /// Pre: numShares denominated in [base unit of referenceAsset]
    /// Post: priceInRef denominated in [base unit of referenceAsset]
    function getRefPriceForNumShares(uint numShares) constant returns (uint priceInRef)
    {
        var (, , , , , sharePrice) = performCalculations();
        priceInRef = numShares * sharePrice / baseUnitsPerShare;
    }


    // NON-CONSTANT METHODS

    function Vault(
        address ofManager,
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofUniverse,
        address ofRiskMgmt,
        address ofRewards
    ) {
        owner = ofManager;
        name = withName;
        symbol = withSymbol;
        decimals = withDecimals;
        baseUnitsPerShare = 10 ** decimals;
        atLastPayout = Calculations({
            gav: 0,
            managementReward: 0,
            performanceReward: 0,
            unclaimedRewards: 0,
            nav: 0,
            sharePrice: baseUnitsPerShare,
            totalSupply: totalSupply,
            timestamp: now,
        });
        module.universe = UniverseProtocol(ofUniverse);
        referenceAsset = module.universe.getReferenceAsset();
        melonAsset = module.universe.getMelonAsset();
        // Assert referenceAsset is equal to quoteAsset in all assigned PriceFeeds
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            PriceFeedProtocol Price = PriceFeedProtocol(address(module.universe.priceFeedAt(i)));
            address quoteAsset = Price.getQuoteAsset();
            require(referenceAsset == quoteAsset);
        }
        module.riskmgmt = RiskMgmtProtocol(ofRiskMgmt);
        module.rewards = RewardsProtocol(ofRewards);
    }

    // NON-CONSTANT METHODS - PARTICIPATION

    /// Pre: Approved spending of all assets with non-empty asset holdings; Independent of running price feed!
    /// Post: Transfer ownership percentage of all assets from Investor to Vault and create shareAmount.
    function createShares(uint shareAmount) { createSharesOnBehalf(msg.sender, shareAmount); }

    /// Pre: Every holder of shares at any time; Independent of running price feed!
    /// Post: Transfer percentage of all assets from Vault to Investor and annihilate shareAmount of shares.
    function annihilateShares(uint shareAmount) { annihilateSharesOnBehalf(msg.sender, shareAmount); }

    /// Pre: Approved spending of all assets with non-empty asset holdings;
    /// Post: Transfer percentage of all assets from Vault to Investor and annihilate shareAmount of shares.
    function createSharesOnBehalf(address recipient, uint shareAmount)
        pre_cond(notZero(shareAmount))
    {
        allocateSlice(recipient, shareAmount);
        SharesCreated(recipient, now, shareAmount);
    }

    /// Pre: Recipient owns shares
    /// Post: Transfer percentage of all assets from Vault to Investor and annihilate shareAmount of shares.
    function annihilateSharesOnBehalf(address recipient, uint shareAmount)
        pre_cond(balancesOfHolderAtLeast(recipient, shareAmount))
    {
        separateSlice(recipient, shareAmount);
        SharesAnnihilated(recipient, now, shareAmount);
    }

    /// Pre: Allocation: Pre-approve spending for all non empty vaultHoldings of Assets, shareAmount denominated in [base units ]
    /// Post: Transfer ownership percentage of all assets to/from Vault
    function allocateSlice(address recipient, uint shareAmount)
        internal
    {
        if (totalSupply == 0) { // Iff all vaultHoldings are zero
            /* By definition for zero totalSupply of shares the initial share price is defined as:
             *  sharePrice == baseUnitsPerShare (1)
             *  hence for totalCost == shareAmount * sharePrice / baseUnitsPerShare == shareAmount using (1) above
             */
            uint totalCost = shareAmount;
            assert(AssetProtocol(referenceAsset).transferFrom(msg.sender, this, totalCost)); // Send from msg.sender to vault
        } else {
            uint numAssignedAssets = module.universe.numAssignedAssets();
            for (uint i = 0; i < numAssignedAssets; ++i) {
                AssetProtocol Asset = AssetProtocol(address(module.universe.assetAt(i)));
                uint vaultHoldings = Asset.balanceOf(this); // Amount of asset base units this vault holds
                if (vaultHoldings == 0) continue;
                uint allocationAmount = (vaultHoldings * shareAmount) / totalSupply; // ownership percentage of msg.sender
                uint senderHoldings = Asset.balanceOf(msg.sender); // Amount of asset sender holds
                require(senderHoldings >= allocationAmount);
                // Transfer allocationAmount of Assets
                assert(Asset.transferFrom(msg.sender, this, allocationAmount)); // Send funds from investor to vault
            }
        }
        // Accounting
        balances[recipient] = safeAdd(balances[recipient], shareAmount);
        totalSupply = safeAdd(totalSupply, shareAmount);
    }

    /// Pre: Allocation: Approve spending for all non empty vaultHoldings of Assets
    /// Post: Transfer ownership percentage of all assets to/from Vault
    function separateSlice(address recipient, uint shareAmount)
        internal
    {
        // Current Value
        uint oldTotalSupply = totalSupply;
        // Update accounting before external calls to prevent reentrancy
        balances[recipient] = safeSub(balances[recipient], shareAmount);
        totalSupply = safeSub(totalSupply, shareAmount);
        // Transfer separationAmount of Assets
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            AssetProtocol Asset = AssetProtocol(address(module.universe.assetAt(i)));
            uint vaultHoldings = Asset.balanceOf(this); // EXTERNAL CALL: Amount of asset base units this vault holds
            uint separationAmount = vaultHoldings * shareAmount / oldTotalSupply; // ownership percentage of msg.sender
            if (vaultHoldings == 0) continue;
            // EXTERNAL CALL
            assert(Asset.transfer(recipient, separationAmount)); // EXTERNAL CALL: Send funds from vault to investor
        }
    }

    // NON-CONSTANT METHODS - EXCHANGE

    /// Pre: Sufficient balance and spending has been approved
    /// Post: Make offer on selected Exchange
    function makeOrder(ExchangeProtocol onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        pre_cond(isOwner())
        pre_cond(module.riskmgmt.isExchangeMakePermitted(onExchange,
            sell_how_much, sell_which_token,
            buy_how_much, buy_which_token)
        )
        returns (uint id)
    {
        requireIsWithinKnownUniverse(onExchange, sell_which_token, buy_which_token);
        approveSpending(sell_which_token, onExchange, sell_how_much);
        id = onExchange.make(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    /// Pre: Active offer (id) and valid buy amount on selected Exchange
    /// Post: Take offer on selected Exchange
    function takeOrder(ExchangeProtocol onExchange, uint id, uint wantedBuyAmount)
        pre_cond(isOwner())
        returns (bool)
    {
        // Inverse variable terminology! Buying what another person is selling
        var (
            offeredBuyAmount, offeredBuyToken,
            offeredSellAmount, offeredSellToken
        ) = onExchange.getOrder(id);
        require(wantedBuyAmount <= offeredBuyAmount);
        requireIsWithinKnownUniverse(onExchange, offeredSellToken, offeredBuyToken);
        var orderOwner = onExchange.getOwner(id);
        require(module.riskmgmt.isExchangeTakePermitted(onExchange,
            offeredSellAmount, offeredSellToken,
            offeredBuyAmount, offeredBuyToken,
            orderOwner)
        );
        uint wantedSellAmount = safeMul(wantedBuyAmount, offeredSellAmount) / offeredBuyAmount;
        approveSpending(offeredSellToken, onExchange, wantedSellAmount);
        return onExchange.take(id, wantedBuyAmount);
    }

    /// Pre: Active offer (id) with owner of this contract on selected Exchange
    /// Post: Cancel offer on selected Exchange
    function cancelOrder(ExchangeProtocol onExchange, uint id)
        pre_cond(isOwner())
        returns (bool)
    {
        return onExchange.cancel(id);
    }

    /// Pre: Universe has been defined
    /// Post: Whether buying and selling of tokens are allowed at given exchange
    function requireIsWithinKnownUniverse(address onExchange, address sell_which_token, address buy_which_token)
        internal
    {
        // Asset pair defined in Universe and contains referenceAsset
        require(module.universe.assetAvailability(buy_which_token));
        require(module.universe.assetAvailability(sell_which_token));
        require(buy_which_token == referenceAsset || sell_which_token == referenceAsset); // One asset must be referenceAsset
        require(buy_which_token != referenceAsset || sell_which_token != referenceAsset); // Pair must consists of diffrent assets
        // Exchange assigned to tokens in Universe
        require(onExchange == module.universe.assignedExchange(buy_which_token));
        require(onExchange == module.universe.assignedExchange(sell_which_token));
    }

    /// Pre: To Exchange needs to be approved to spend Tokens on the Managers behalf
    /// Post: Token specific exchange as registered in universe, approved to spend ofToken
    function approveSpending(ERC20 ofToken, address onExchange, uint amount)
        internal
    {
        assert(ofToken.approve(onExchange, amount));
        SpendingApproved(ofToken, onExchange, amount);
    }

    // NON-CONSTANT METHODS - REWARDS

    /// Pre: Only this
    /// Post: Unclaimed fees of manager are converted into shares of the Owner of this fund.
    function convertUnclaimedRewards()
        pre_cond(isOwner())
    {
        var (gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice) = performCalculations();

        // Accounting: Allocate unclaimedRewards to this fund
        uint shareAmount = totalSupply * unclaimedRewards / gav;
        balances[this] = safeAdd(balances[this], shareAmount);
        totalSupply = safeAdd(totalSupply, shareAmount);

        // Update Calculations
        atLastPayout = Calculations({
          gav: gav,
          managementReward: managementReward,
          performanceReward: performanceReward,
          unclaimedRewards: unclaimedRewards,
          nav: nav,
          sharePrice: sharePrice,
          totalSupply: totalSupply,
          timestamp: now,
        });

        RewardsConverted(now, shareAmount, unclaimedRewards);
        CalculationUpdate(now, managementReward, performanceReward, nav, sharePrice, totalSupply);
    }
}
