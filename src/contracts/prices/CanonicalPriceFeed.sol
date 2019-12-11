pragma solidity ^0.5.13;

import "./CanonicalRegistrar.sol";
import "./SimplePriceFeed.sol";
import "./StakingPriceFeed.sol";
import "./OperatorStaking.sol";
import "../dependencies/token/ERC20.i.sol";

/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice PriceFeed operator could be staked and sharePrice input validated on chain
contract CanonicalPriceFeed is PriceSourceInterface, OperatorStaking, SimplePriceFeed, CanonicalRegistrar {

    // EVENTS
    event SetupPriceFeed(address ofPriceFeed);

    struct HistoricalPrices {
        address[] assets;
        uint[] prices;
        uint timestamp;
    }

    // FIELDS
    bool public updatesAreAllowed = true;
    uint public minimumPriceCount = 1;
    uint public VALIDITY;
    uint public INTERVAL;
    mapping (address => bool) public isStakingFeed; // If the Staking Feed has been created through this contract
    HistoricalPrices[] public priceHistory;
    uint public lastUpdate;

    // METHODS

    // CONSTRUCTOR

    /// @dev Define and register a quote asset against which all prices are measured/based against
    /// @param ofStakingAsset Address of staking asset (may or may not be quoteAsset)
    /// @param ofQuoteAsset Address of quote asset
    /// @param quoteAssetName Name of quote asset
    /// @param quoteAssetSymbol Symbol for quote asset
    /// @param quoteAssetUrl URL related to quote asset
    /// @param quoteAssetIpfsHash IPFS hash associated with quote asset
    /// @param quoteAssetBreakInBreakOut Break-in/break-out for quote asset on destination chain
    /// @param quoteAssetStandards EIP standards quote asset adheres to
    /// @param quoteAssetFunctionSignatures Whitelisted functions of quote asset contract
    // /// @param interval Number of seconds between pricefeed updates (this interval is not enforced on-chain, but should be followed by the datafeed maintainer)
    // /// @param validity Number of seconds that datafeed update information is valid for
    /// @param ofGovernance Address of contract governing the Canonical PriceFeed
    constructor(
        address ofStakingAsset,
        address ofQuoteAsset, // Inital entry in asset registrar contract is Melon (QUOTE_ASSET)
        bytes32 quoteAssetName,
        bytes8 quoteAssetSymbol,
        string quoteAssetUrl,
        string quoteAssetIpfsHash,
        address[2] quoteAssetBreakInBreakOut,
        uint[] quoteAssetStandards,
        bytes4[] quoteAssetFunctionSignatures,
        uint[2] updateInfo, // interval, validity
        uint[3] stakingInfo, // minStake, numOperators, unstakeDelay
        address ofGovernance
    )
        public
        OperatorStaking(
            ERC20(ofStakingAsset), stakingInfo[0], stakingInfo[1], stakingInfo[2]
        )
        SimplePriceFeed(address(this), ofQuoteAsset, address(0))
    {
        registerAsset(
            ofQuoteAsset,
            quoteAssetName,
            quoteAssetSymbol,
            quoteAssetUrl,
            quoteAssetIpfsHash,
            quoteAssetBreakInBreakOut,
            quoteAssetStandards,
            quoteAssetFunctionSignatures
        );
        INTERVAL = updateInfo[0];
        VALIDITY = updateInfo[1];
        setOwner(ofGovernance);
    }

    // EXTERNAL METHODS

    /// @notice Create a new StakingPriceFeed
    function setupStakingPriceFeed() external {
        address ofStakingPriceFeed = new StakingPriceFeed(
            address(this),
            stakingToken,
            address(this)
        );
        isStakingFeed[ofStakingPriceFeed] = true;
        StakingPriceFeed(ofStakingPriceFeed).setOwner(msg.sender);
        emit SetupPriceFeed(ofStakingPriceFeed);
    }

    /// @dev override inherited update function to prevent manual update from authority
    function update(address[] ofAssets, uint[] newPrices) external { revert("Unimplemented"); }

    /// @dev Burn state for a pricefeed operator
    /// @param user Address of pricefeed operator to burn the stake from
    function burnStake(address user)
        external
        auth
    {
        uint totalToBurn = add(stakedAmounts[user], stakeToWithdraw[user]);
        stakedAmounts[user] = 0;
        stakeToWithdraw[user] = 0;
        updateStakerRanking(user);
        emit StakeBurned(user, totalToBurn, "");
    }

    // PUBLIC METHODS

    // STAKING

    function stake(
        uint amount,
        bytes data
    )
        public
    {
        require(
            isStakingFeed[msg.sender],
            "Only staking feeds can call this"
        );
        OperatorStaking.stake(amount, data);
    }

    // AGGREGATION

    /// @dev Only Owner; Same sized input arrays
    /// @dev Updates price of asset relative to QUOTE_ASSET
    /** Ex:
     *  Let QUOTE_ASSET == MLN (base units), let asset == EUR-T,
     *  let Value of 1 EUR-T := 1 EUR == 0.080456789 MLN, hence price 0.080456789 MLN / EUR-T
     *  and let EUR-T decimals == 8.
     *  Input would be: information[EUR-T].price = 8045678 [MLN/ (EUR-T * 10**8)]
     */
    /// @param ofAssets list of asset addresses
    function collectAndUpdate(address[] ofAssets)
        public
        auth
    {
        require(
            updatesAreAllowed,
            "Updates are not allowed right now"
        );
        uint[] memory newPrices = pricesToCommit(ofAssets);
        priceHistory.push(
            HistoricalPrices({assets: ofAssets, prices: newPrices, timestamp: block.timestamp})
        );
        _updatePrices(ofAssets, newPrices);
        lastUpdate = block.timestamp;
        PriceUpdate(ofAssets, newPrices);
    }

    function pricesToCommit(address[] ofAssets)
        public
        view
        returns (uint[])
    {
        address[] memory operators = getOperators();
        uint[] memory newPrices = new uint[](ofAssets.length);
        for (uint i = 0; i < ofAssets.length; i++) {
            uint[] memory assetPrices = new uint[](operators.length);
            for (uint j = 0; j < operators.length; j++) {
                SimplePriceFeed feed = SimplePriceFeed(operators[j]);
                uint price;
                uint timestamp;
                (price, timestamp) = feed.assetsToPrices(ofAssets[i]);
                if (now > add(timestamp, VALIDITY)) {
                    continue; // leaves a zero in the array (dealt with later)
                }
                assetPrices[j] = price;
            }
            newPrices[i] = medianize(assetPrices);
        }
        return newPrices;
    }

    /// @dev from MakerDao medianizer contract
    function medianize(uint[] unsorted)
        public
        view
        returns (uint)
    {
        uint numValidEntries;
        for (uint i = 0; i < unsorted.length; i++) {
            if (unsorted[i] != 0) {
                numValidEntries++;
            }
        }
        require(numValidEntries > minimumPriceCount, "Not enough prices");
        uint counter;
        uint[] memory out = new uint[](numValidEntries);
        for (uint j = 0; j < unsorted.length; j++) {
            uint item = unsorted[j];
            if (item != 0) {    // skip zero (invalid) entries
                if (counter == 0 || item >= out[counter - 1]) {
                    out[counter] = item;  // item is larger than last in array (we are home)
                } else {
                    uint k = 0;
                    while (item >= out[k]) {
                        k++;  // get to where element belongs (between smaller and larger items)
                    }
                    for (uint m = counter; m > k; m--) {
                        out[m] = out[m - 1];    // bump larger elements rightward to leave slot
                    }
                    out[k] = item;
                }
                counter++;
            }
        }

        uint value;
        if (counter % 2 == 0) {
            uint value1 = uint(out[(counter / 2) - 1]);
            uint value2 = uint(out[(counter / 2)]);
            value = add(value1, value2) / 2;
        } else {
            value = out[(counter - 1) / 2];
        }
        return value;
    }

    function setMinimumPriceCount(uint newCount) public auth { minimumPriceCount = newCount; }
    function enableUpdates() public auth { updatesAreAllowed = true; }
    function disableUpdates() public auth { updatesAreAllowed = false; }

    // PUBLIC VIEW METHODS

    // FEED INFORMATION

    function getQuoteAsset() public view returns (address) { return QUOTE_ASSET; }
    function getInterval() public view returns (uint) { return INTERVAL; }
    function getValidity() public view returns (uint) { return VALIDITY; }
    function getLastUpdateId() public view returns (uint) { return updateId; }

    // PRICES

    /// @notice Whether price of asset has been updated less than VALIDITY seconds ago
    /// @param ofAsset Asset in registrar
    /// @return isValid Price information ofAsset is recent
    function hasValidPrice(address ofAsset)
        public
        view
        returns (bool isValid)
    {
        require(
            assetIsRegistered(ofAsset),
            "Asset is not registered"
        );
        uint timestamp;
        ( , timestamp) = getPrice(ofAsset);
        return (sub(now, timestamp) <= VALIDITY);
    }

    /// @notice Whether prices of assets have been updated less than VALIDITY seconds ago
    /// @param ofAssets All assets in registrar
    /// @return isValid Price information ofAssets array is recent
    function hasValidPrices(address[] ofAssets)
        public
        view
        returns (bool areRecent)
    {
        for (uint i; i < ofAssets.length; i++) {
            if (!hasValidPrice(ofAssets[i])) {
                return false;
            }
        }
        return true;
    }

    function getPriceInfo(address ofAsset)
        public
        view
        returns (uint price, uint assetDecimals)
    {
        (price, ) = getPrice(ofAsset);
        assetDecimals = getDecimals(ofAsset);
    }

    /**
    @notice Gets inverted price of an asset
    @dev Asset has been initialised and its price is non-zero
    @dev Existing price ofAssets quoted in QUOTE_ASSET (convention)
    @param ofAsset Asset for which inverted price should be return
    @return {
        "isValid": "Whether the price is fresh, given VALIDITY interval",
        "invertedPrice": "Price based (instead of quoted) against QUOTE_ASSET",
        "assetDecimals": "Decimal places for this asset"
    }
    */
    function getInvertedPriceInfo(address ofAsset)
        public
        view
        returns (uint invertedPrice, uint assetDecimals)
    {
        uint inputPrice;
        // inputPrice quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
        (inputPrice, assetDecimals) = getPriceInfo(ofAsset);

        // outputPrice based in QUOTE_ASSET and multiplied by 10 ** quoteDecimal
        uint quoteDecimals = getDecimals(QUOTE_ASSET);

        return (
            mul(
                10 ** uint(quoteDecimals),
                10 ** uint(assetDecimals)
            ) / inputPrice,
            quoteDecimals
        );
    }

    /**
    @notice Gets reference price of an asset pair
    @dev One of the address is equal to quote asset
    @dev either ofBase == QUOTE_ASSET or ofQuote == QUOTE_ASSET
    @param ofBase Address of base asset
    @param ofQuote Address of quote asset
    @return {
        "isValid": "Whether the price is fresh, given VALIDITY interval",
        "referencePrice": "Reference price",
        "decimal": "Decimal places for this asset"
    }
    */
    function getReferencePriceInfo(address ofBase, address ofQuote)
        public
        view
        returns (uint referencePrice, uint decimal)
    {
        require(hasValidPrice(ofBase));
        require(hasValidPrice(ofQuote));
        if (getQuoteAsset() == ofQuote) {
            (referencePrice, decimal) = getPriceInfo(ofBase);
        } else if (getQuoteAsset() == ofBase) {
            (referencePrice, decimal) = getInvertedPriceInfo(ofQuote);
        } else {
            revert("One of the parameters must be quoteAsset");
        }
    }

    /// @notice Gets price of Order
    /// @param sellAsset Address of the asset to be sold
    /// @param buyAsset Address of the asset to be bought
    /// @param sellQuantity Quantity in base units being sold of sellAsset
    /// @param buyQuantity Quantity in base units being bought of buyAsset
    /// @return orderPrice Price as determined by an order
    function getOrderPriceInfo(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        public
        view
        returns (uint orderPrice)
    {
        return mul(buyQuantity, 10 ** uint(getDecimals(sellAsset))) / sellQuantity;
    }

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param sellAsset Asset for which check to be done if data exists
    /// @param buyAsset Asset for which check to be done if data exists
    /// @return Whether assets exist for given asset pair
    function existsPriceOnAssetPair(address sellAsset, address buyAsset)
        public
        view
        returns (bool isExistent)
    {
        return
            hasValidPrice(sellAsset) &&
            hasValidPrice(buyAsset) &&
            (buyAsset == QUOTE_ASSET || sellAsset == QUOTE_ASSET) && // One asset must be QUOTE_ASSET
            (buyAsset != QUOTE_ASSET || sellAsset != QUOTE_ASSET); // Pair must consists of diffrent assets
    }

    /// @return Sparse array of addresses of owned pricefeeds
    function getPriceFeedsByOwner(address _owner)
        public
        view
        returns(address[])
    {
        address[] memory ofPriceFeeds = new address[](numStakers);
        if (numStakers == 0) return ofPriceFeeds;
        uint current = stakeNodes[0].next;
        for (uint i; i < numStakers; i++) {
            StakingPriceFeed stakingFeed = StakingPriceFeed(stakeNodes[current].data.staker);
            if (stakingFeed.owner() == _owner) {
                ofPriceFeeds[i] = address(stakingFeed);
            }
            current = stakeNodes[current].next;
        }
        return ofPriceFeeds;
    }

    function getHistoryLength() public returns (uint) { return priceHistory.length; }

    function getHistoryAt(uint id) public returns (address[], uint[], uint) {
        address[] memory assets = priceHistory[id].assets;
        uint[] memory prices = priceHistory[id].prices;
        uint timestamp = priceHistory[id].timestamp;
        return (assets, prices, timestamp);
    }

    /// @notice Get quantity of toAsset equal in value to given quantity of fromAsset
    function convertQuantity(
        uint fromAssetQuantity,
        address fromAsset,
        address toAsset
    )
        public
        view
        returns (uint)
    {
        uint fromAssetPrice;
        (fromAssetPrice,) = getReferencePriceInfo(fromAsset, toAsset);
        uint fromAssetDecimals = ERC20WithFields(fromAsset).decimals();
        return mul(
            fromAssetQuantity,
            fromAssetPrice
        ) / (10 ** uint(fromAssetDecimals));
    }

    function getLastUpdate() public view returns (uint) { return lastUpdate; }
}
