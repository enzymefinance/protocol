pragma solidity ^0.4.21;


import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../accounting/Accounting.sol";
import "../../dependencies/ERC20.sol";
import "../../../src/dependencies/math.sol";
import "../../../src/pricefeeds/CanonicalPriceFeed.sol";

/// @notice Entry and exit point for investors
contract Participation is Spoke, DSMath {

    struct Request {
        address investmentAsset;
        uint investmentAmount;
        uint requestedShares;
        uint timestamp;
        uint atUpdateId;
    }

    mapping (address => Request) public requests;
    bool public isShutDown; // TODO: find suitable place for this (hub?)

    constructor(address _hub) Spoke(_hub) {}

    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    ) external // TODO: implement and use below modifiers
        // pre_cond(!isShutDown)
        // pre_cond(compliance.isInvestmentPermitted(msg.sender, giveQuantity, shareQuantity))    // Compliance Module: Investment permitted
    {
        requests[msg.sender] = Request({
            investmentAsset: investmentAsset,
            investmentAmount: investmentAmount,
            requestedShares: requestedShares,
            timestamp: block.timestamp,
            atUpdateId: CanonicalPriceFeed(hub.priceSource()).getLastUpdateId() // TODO: can this be abstracted away?
        });
    }

    function cancelRequest() external {
        delete requests[msg.sender];
    }

    function executeRequest() public {
        executeRequestFor(msg.sender);
    }

    function executeRequestFor(address requestOwner) public 
        // TODO: implement and use below modifiers
        // pre_cond(!isShutDown)
        // pre_cond(requests[id].status == RequestStatus.active)
        // pre_cond(
        //     Shares(hub.shares()).totalSupply() == 0 ||
        //     (
        //         now >= add(requests[id].timestamp, priceSource.getInterval()) &&
        //         priceSource.getLastUpdateId() >= add(requests[id].atUpdateId, 2)
        //     )
        // ) 
    {
        Request memory request = requests[requestOwner];
        bool isRecent;
        (isRecent, , ) = CanonicalPriceFeed(hub.priceSource()).getPriceInfo(address(request.investmentAsset));
        require(isRecent);

        // sharePrice quoted in QUOTE_ASSET and multiplied by 10 ** fundDecimals
        uint costQuantity; // TODO: better naming after refactor (this variable is how much the shares wanted cost in total, in the desired payment token)
        if(request.investmentAsset == address(Accounting(hub.accounting()).QUOTE_ASSET())) {
            costQuantity = mul(request.requestedShares, Accounting(hub.accounting()).calcSharePriceAndAllocateFees()) / 10 ** 18; // By definition quoteDecimals == fundDecimals
            // TODO: watch this, in case we change decimals from default 18
        } else {
            bool isPriceRecent;
            uint invertedInvestmentAssetPrice;
            uint investmentAssetDecimal;
            (isPriceRecent, invertedInvestmentAssetPrice, investmentAssetDecimal) = CanonicalPriceFeed(hub.priceSource()).getInvertedPriceInfo(request.investmentAsset);
            // TODO: is below check needed, given the recency check a few lines above?
            require(isPriceRecent);
            costQuantity = mul(costQuantity, invertedInvestmentAssetPrice) / 10 ** investmentAssetDecimal;
        }

        if (
            // isInvestAllowed[request.investmentAsset] &&
            costQuantity <= request.investmentAmount
        ) {
            delete requests[requestOwner];
            require(ERC20(request.investmentAsset).transferFrom(requestOwner, address(this), costQuantity)); // Allocate Value
            Shares(hub.shares()).createFor(requestOwner, request.requestedShares);
            // TODO: this should be done somewhere else
            if (!Accounting(hub.accounting()).isInAssetList(request.investmentAsset)) {
                Accounting(hub.accounting()).addAssetToOwnedAssets(request.investmentAsset);
            }
        } else {
            revert(); // Invalid Request or invalid giveQuantity / receiveQuantity
        }
    }

    /// @dev "Happy path" (no asset throws & quantity available)
    /// @notice Redeem all shares
    function redeem() public {
        uint ownedShares = Shares(hub.shares()).balanceOf(msg.sender);
        address[] memory assetList;
        (, assetList) = Accounting(hub.accounting()).getFundHoldings();
        require(redeemWithConstraints(ownedShares, assetList)); //TODO: assetList from another module
    }

    // NB1: reconsider the scenario where the user has enough funds to force shutdown on a large trade (any way around this?)
    // TODO: readjust with calls and changed variable names where needed
    /// @dev Redeem only selected assets (used only when an asset throws)
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets)
        public
        returns (bool)
    {
        require(Shares(hub.shares()).balanceOf(msg.sender) >= shareQuantity);
        address ofAsset;
        uint[] memory ownershipQuantities = new uint[](requestedAssets.length);
        address[] memory redeemedAssets = new address[](requestedAssets.length);

        // Check whether enough assets held by fund
        for (uint i = 0; i < requestedAssets.length; ++i) {
            ofAsset = requestedAssets[i];
            require(Accounting(hub.accounting()).isInAssetList(ofAsset));
            for (uint j = 0; j < redeemedAssets.length; j++) {
                if (ofAsset == redeemedAssets[j]) {
                    revert();
                }
            }
            redeemedAssets[i] = ofAsset;
            uint quantityHeld = Accounting(hub.accounting()).assetHoldings(ofAsset);
            if (quantityHeld == 0) continue;

            // participant's ownership percentage of asset holdings
            ownershipQuantities[i] = mul(quantityHeld, shareQuantity) / Shares(hub.shares()).totalSupply();

            // TODO: do we want to represent this as an error and shutdown, or do something else? See NB1 scenario above
            // CRITICAL ERR: Not enough fund asset balance for owed ownershipQuantitiy, eg in case of unreturned asset quantity at address(exchanges[i].exchange) address
            if (uint(ERC20(ofAsset).balanceOf(address(this))) < ownershipQuantities[i]) {
                isShutDown = true; // TODO: external call most likely
                // emit ErrorMessage("CRITICAL ERR: Not enough quantityHeld for owed ownershipQuantitiy");
                return false;
            }
        }

        Shares(hub.shares()).destroyFor(msg.sender, shareQuantity);

        // Transfer owned assets
        for (uint k = 0; k < requestedAssets.length; ++k) {
            ofAsset = requestedAssets[k];
            if (ownershipQuantities[k] == 0) {
                continue;
            } else if (!ERC20(ofAsset).transfer(msg.sender, ownershipQuantities[k])) {
                revert();
            }
        }
        return true;
    }
}

