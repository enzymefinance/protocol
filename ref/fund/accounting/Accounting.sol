pragma solidity ^0.4.21;


import "../hub/Spoke.sol";
import "../trading/Trading.sol";
import "../fees/FeeManager.sol";
import "../shares/Shares.sol";
import "../vault/Vault.sol";
import "../../dependencies/ERC20.sol";
import "../../dependencies/Controlled.sol";
import "../../../src/dependencies/math.sol";
import "../../../src/pricefeeds/CanonicalPriceFeed.sol";

// NB: many functions simplified for now
// TODO: remove any of these functions we don't use; a lot of this can be trimmed down
contract Accounting is DSMath, Controlled, Spoke {

    struct Calculations {
        uint gav;
        uint nav;
        uint allocatedFees;
        uint totalSupply;
        uint timestamp;
    }

    address[] public ownedAssets;   // TODO: should this be here or in vault, or somewhere else?
    mapping (address => bool) public isInAssetList; // TODO: same as above
    address public QUOTE_ASSET;
    Calculations public atLastAllocation;

    Trading public trading;
    CanonicalPriceFeed public canonicalPriceFeed;
    FeeManager public feeManager;
    Shares public shares;
    Vault public vault;

    constructor(address _hub, address[] _controllers) Spoke(_hub) Controlled(_controllers) {
        // TODO: for *all* components; find better way to instantiate related components for each spoke, instead of in constructor (if possible)
        trading = Trading(hub.trading());
        canonicalPriceFeed = CanonicalPriceFeed(hub.priceSource());
        feeManager = FeeManager(hub.feeManager());
        shares = Shares(hub.shares());
        vault = Vault(hub.vault());
    }

    function getFundHoldings() returns (uint[], address[]) {
        uint[] memory _quantities = new uint[](ownedAssets.length);
        address[] memory _assets = new address[](ownedAssets.length);
        for (uint i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint quantityHeld = assetHoldings(ofAsset);

            if (quantityHeld != 0) {
                _assets[i] = ofAsset;
                _quantities[i] = quantityHeld;
            }
        }
        return (_quantities, _assets);
    }

    /// TODO: is this needed? can we just return the array?
    function getFundHoldingsLength() view returns (uint) {
        address[] memory addresses;
        (, addresses) = getFundHoldings();
        return addresses.length;
    }

    /// TODO: is this needed? can we implement in the policy itself?
    function calcAssetGAV(address ofAsset) returns (uint) {
        uint quantityHeld = assetHoldings(ofAsset);
        // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
        bool isRecent;
        uint assetPrice;
        uint assetDecimals;
        (isRecent, assetPrice, assetDecimals) = canonicalPriceFeed.getPriceInfo(ofAsset);
        if (!isRecent) {
            revert();
        }
        return mul(quantityHeld, assetPrice) / (10 ** uint(assetDecimals));
    }

    function assetHoldings(address _asset) returns (uint) {
        return add(
            uint(ERC20(_asset).balanceOf(vault)),
            trading.quantityBeingTraded(_asset)
        );
    }

    // prices quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
    // NB: removed the in-line adding to and removing from ownedAssets so taht it can be a view function
    function calcGav() view returns (uint gav) {
        for (uint i = 0; i < ownedAssets.length; ++i) {
            address ofAsset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint quantityHeld = assetHoldings(ofAsset);
            // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
            bool isRecent;
            uint assetPrice;
            uint assetDecimals;
            (isRecent, assetPrice, assetDecimals) = canonicalPriceFeed.getPriceInfo(ofAsset);
            // NB: should we revert inside this view function, or just calculate it optimistically?
            //     maybe it should be left to consumers to decide whether to use older prices?
            //     or perhaps even source's job not to give untrustworthy prices?
            if (!isRecent) {
                revert();
            }
            // gav as sum of mul(assetHoldings, assetPrice) with formatting: mul(mul(exchangeHoldings, exchangePrice), 10 ** shareDecimals)
            gav = add(gav, mul(quantityHeld, assetPrice) / (10 ** uint(assetDecimals)));
        }
        return gav;
    }

    // TODO: this view function calls a non-view function; adjust accordingly
    // TODO: this may be redundant, and does not use its input parameter now
    function calcUnclaimedFees(uint gav) view returns (uint) {
        return feeManager.totalFeeAmount();
    }

    // TODO: this view function calls a non-view function; adjust accordingly
    function calcNav(uint gav, uint unclaimedFees) view returns (uint) {
        return sub(gav, unclaimedFees);
    }

    function calcValuePerShare(uint totalValue, uint numShares) view returns (uint) {
        require(numShares > 0);
        return (totalValue * 10 ** 18) / numShares;    // TODO: handle other decimals (decide if we will introduce that)
    }

    function performCalculations()
        view
        returns (
            uint gav,
            uint unclaimedFees,
            uint feesShareQuantity,
            uint nav,
            uint sharePrice
        )
    {
        gav = calcGav();
        unclaimedFees = feeManager.totalFeeAmount();
        nav = calcNav(gav, unclaimedFees);

        uint totalSupply = shares.totalSupply();
        // The value of unclaimedFees measured in shares of this fund at current value
        feesShareQuantity = (gav == 0) ? 0 : mul(totalSupply, unclaimedFees) / gav;
        // The total share supply including the value of unclaimedFees, measured in shares of this fund
        uint totalSupplyAccountingForFees = add(totalSupply, feesShareQuantity);
        sharePrice = totalSupply > 0 ?
            calcValuePerShare(gav, totalSupplyAccountingForFees) :
            10 ** 18; // TODO: handle other decimals (decide if we will introduce that)
    }

    // TODO: delete if possible, or revise implementation
    function calcSharePrice() view returns (uint sharePrice) {
        (,,,,sharePrice) = performCalculations();
        return sharePrice;
    }

    // calculates several metrics, updates stored calculation object and rewards fees
    // TODO: find a better way to do these things without this exact method
    // TODO: math is off here (need to check fees, when they are calculated, quantity in exchanges and trading module, etc.)
    function calcSharePriceAndAllocateFees() public returns (uint) {
        updateOwnedAssets();
        uint gav;
        uint unclaimedFees;
        uint feesShareQuantity;
        uint nav;
        uint sharePrice;
        (gav, unclaimedFees, feesShareQuantity, nav, sharePrice) = performCalculations();
        uint totalSupply = shares.totalSupply();
        feeManager.rewardAllFees();

        atLastAllocation = Calculations({
            gav: gav,
            nav: nav,
            allocatedFees: unclaimedFees,
            totalSupply: totalSupply,
            timestamp: block.timestamp
        });
        return sharePrice;
    }

    // TODO: maybe run as a "bump" function, every state-changing method call
    function updateOwnedAssets() public {
        for (uint i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            // TODO: verify commented condition is redundant and remove if so
            // (it is always the case when `assetHoldings > 0` is true)
            // || trading.isInOpenMakeOrder(ofAsset)
            if (assetHoldings(ofAsset) > 0 || ofAsset == address(QUOTE_ASSET)) {
                addAssetToOwnedAssets(ofAsset);
            } else {
                removeFromOwnedAssets(ofAsset);
            }
        }
    }

    function addAssetToOwnedAssets(address _asset) public {
        require(isController(msg.sender) || msg.sender == address(this));
        if (!isInAssetList[_asset]) {
            ownedAssets.push(_asset);
            isInAssetList[_asset] = true;
        }
    }

    function removeFromOwnedAssets(address _asset) public {
        require(isController(msg.sender) || msg.sender == address(this));
        if (isInAssetList[_asset]) {
            // ownedAssets.remove(ofAsset); // TODO: implement array-amending OR allow ownedAssets to contain assets *previously* but not currently owned (how it exists presently)
            isInAssetList[_asset] = false;
        }
    }
}

