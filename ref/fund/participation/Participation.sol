pragma solidity ^0.4.21;


contract Participation {

    struct Request {
        address investmentAsset;
        uint investmentAmount;
        uint requestedShares;
        uint timestamp;
        uint atUpdateId;
    }

    mapping (address => Request) requests;

    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    )
        external
        // TODO: implement and use below modifiers
        // pre_cond(!isShutDown)
        // pre_cond(modules.compliance.isInvestmentPermitted(msg.sender, giveQuantity, shareQuantity))    // Compliance Module: Investment permitted
    {
        requests[msg.sender] = Request({
            investmentAsset: investmentAsset,
            investmentAmount: investmentAmount,
            requestedShares: requestedShares,
            timestamp: block.timestamp,
            atUpdateId: modules.pricefeed.getLastUpdateId()
        });
    }

    function cancelRequest() external {
        delete requests[msg.sender];
    };

    function executeRequest() external {
        executeRequestFor(msg.sender);
    }

    function executeRequestFor(address requestOwner) external 
        // TODO: implement and use below modifiers
        // pre_cond(!isShutDown)
        // pre_cond(requests[id].status == RequestStatus.active)
        // pre_cond(
        //     _totalSupply == 0 ||
        //     (
        //         now >= add(requests[id].timestamp, modules.pricefeed.getInterval()) &&
        //         modules.pricefeed.getLastUpdateId() >= add(requests[id].atUpdateId, 2)
        //     )
        // ) 
    {
        Request request = requests[requestOwner];
        var (isRecent, , ) =
            modules.pricefeed.getPriceInfo(address(request.requestAsset));
        require(isRecent);

        // sharePrice quoted in QUOTE_ASSET and multiplied by 10 ** fundDecimals
        uint costQuantity; // TODO: better naming after refactor (this variable is how much the shares wanted cost in total, in the desired payment token)
        if(request.investmentAsset == address(QUOTE_ASSET)) {
            costQuantity = toWholeShareUnit(mul(request.shareQuantity, calcSharePriceAndAllocateFees())); // By definition quoteDecimals == fundDecimals
        } else {
            var (isPriceRecent, invertedRequestAssetPrice, requestAssetDecimal) = modules.pricefeed.getInvertedPriceInfo(request.requestAsset);
            // TODO: is below check needed, given the recency check a few lines above?
            require(isPriceRecent);
            costQuantity = mul(costQuantity, invertedRequestAssetPrice) / 10 ** requestAssetDecimal;
        }

        if (
            // isInvestAllowed[request.requestAsset] &&
            costQuantity <= request.investmentAmount
        ) {
            delete requests[requestOwner];  // remove from mapping
            require(ERC20(request.investmentAsset).transferFrom(requestOwner, address(this), costQuantity)); // Allocate Value
            createShares(requestOwner, request.requestedShares);
            // TODO: this should be done somewhere else
            if (!isInAssetList[request.investmentAsset]) {
                ownedAssets.push(request.investmentAsset);
                isInAssetList[request.investmentAsset] = true;
            }
        } else {
            revert(); // Invalid Request or invalid giveQuantity / receiveQuantity
        }
    }

    /// @dev "Happy path" (no asset throws & quantity available)
    function redeem() public {
        uint ownedShares = balances[msg.sender];
        require(redeemWithContraints(ownedShares, assetList)); //TODO: assetList from another module
    }

    // NB: reconsider the scenario where the user has enough funds to force shutdown on a large trade (any way around this?)
    // TODO: readjust with calls and changed variable names where needed
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets)
        public
        pre_cond(balances[msg.sender] >= shareQuantity)  // sender owns enough shares
        returns (bool)
    {
        address ofAsset;
        uint[] memory ownershipQuantities = new uint[](requestedAssets.length);
        address[] memory redeemedAssets = new address[](requestedAssets.length);

        // Check whether enough assets held by fund
        for (uint i = 0; i < requestedAssets.length; ++i) {
            ofAsset = requestedAssets[i];
            require(isInAssetList[ofAsset]);
            for (uint j = 0; j < redeemedAssets.length; j++) {
                if (ofAsset == redeemedAssets[j]) {
                    revert();
                }
            }
            redeemedAssets[i] = ofAsset;
            uint assetHoldings = add(
                uint(AssetInterface(ofAsset).balanceOf(address(this))),
                quantityHeldInCustodyOfExchange(ofAsset)
            );

            if (assetHoldings == 0) continue;

            // participant's ownership percentage of asset holdings
            ownershipQuantities[i] = mul(assetHoldings, shareQuantity) / _totalSupply;

            // CRITICAL ERR: Not enough fund asset balance for owed ownershipQuantitiy, eg in case of unreturned asset quantity at address(exchanges[i].exchange) address
            if (uint(ERC20(ofAsset).balanceOf(address(this))) < ownershipQuantities[i]) {
                isShutDown = true; // TODO: external call most likely
                emit ErrorMessage("CRITICAL ERR: Not enough assetHoldings for owed ownershipQuantitiy");
                return false;
            }
        }

        // Annihilate shares before external calls to prevent reentrancy
        annihilateShares(msg.sender, shareQuantity);

        // Transfer ownershipQuantity of Assets
        for (uint k = 0; k < requestedAssets.length; ++k) {
            // Failed to send owed ownershipQuantity from fund to participant
            ofAsset = requestedAssets[k];
            if (ownershipQuantities[k] == 0) {
                continue;
            } else if (!AssetInterface(ofAsset).transfer(msg.sender, ownershipQuantities[k])) {
                revert();
            }
        }
        emit Redeemed(msg.sender, now, shareQuantity);
        return true;
    }
}

