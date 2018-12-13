pragma solidity ^0.4.21;

import "Spoke.sol";
import "Shares.sol";
import "Accounting.sol";
import "Vault.sol";
import "ERC20.i.sol";
import "Factory.sol";
import "math.sol";
import "CanonicalPriceFeed.sol";
import "AmguConsumer.sol";
import "Participation.i.sol";

/// @notice Entry and exit point for investors
contract Participation is ParticipationInterface, DSMath, AmguConsumer, Spoke {
    struct Request {
        address investmentAsset;
        uint investmentAmount;
        uint requestedShares;
        uint timestamp;
        uint atUpdateId;
    }

    mapping (address => Request) public requests;
    mapping (address => bool) public investAllowed;
    uint public SHARES_DECIMALS = 18;

    constructor(address _hub, address[] _defaultAssets, address _registry) Spoke(_hub) {
        routes.registry = _registry;
        _enableInvestment(_defaultAssets);
    }

    function _enableInvestment(address[] _assets) internal {
        for (uint i = 0; i < _assets.length; i++) {
            require(
                Registry(routes.registry).assetIsRegistered(_assets[i]),
                "Asset not registered"
            );
            investAllowed[_assets[i]] = true;
        }
        emit EnableInvestment(_assets);
    }

    function enableInvestment(address[] _assets) public auth {
        _enableInvestment(_assets);
    }

    function disableInvestment(address[] _assets) public auth {
        for (uint i = 0; i < _assets.length; i++) {
            investAllowed[_assets[i]] = false;
            emit DisableInvestment(_assets);
        }
    }

    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    )
        external
        amguPayable
        payable
        // TODO: implement and use below modifiers
        // pre_cond(compliance.isInvestmentPermitted(msg.sender, giveQuantity, shareQuantity))    // Compliance Module: Investment permitted
    {
        require(!hub.isShutDown(), "Cannot invest in shut down fund");
        require(
            investAllowed[investmentAsset],
            "Investment not allowed in this asset"
        );
        requests[msg.sender] = Request({
            investmentAsset: investmentAsset,
            investmentAmount: investmentAmount,
            requestedShares: requestedShares,
            timestamp: block.timestamp,
            atUpdateId: CanonicalPriceFeed(routes.priceSource).updateId() // TODO: can this be abstracted away?
        });

        emit InvestmentRequest(
            msg.sender,
            investmentAsset,
            requestedShares,
            investmentAmount
        );
    }

    function cancelRequest() external {
        delete requests[msg.sender];
        emit CancelRequest(msg.sender);
    }

    function executeRequestFor(address requestOwner)
        public
        amguPayable
        payable
        // TODO: implement and use below modifiers
        // pre_cond(
        //     Shares(routes.shares).totalSupply() == 0 ||
        //     (
        //         now >= add(requests[id].timestamp, priceSource.getInterval()) &&
        //         priceSource.updateId() >= add(requests[id].atUpdateId, 2)
        //     )
        // )
    {
        require(!hub.isShutDown(), "Cannot invest in shut down fund");
        PolicyManager(routes.policyManager).preValidate(bytes4(sha3("executeRequestFor(address)")), [requestOwner, address(0), address(0), address(0), address(0)], [uint(0), uint(0), uint(0)], bytes32(0));
        Request memory request = requests[requestOwner];
        require(
            hasRequest(requestOwner),
            "No request for this address"
        );
        require(
            investAllowed[request.investmentAsset],
            "Investment not allowed in this asset"
        );
        bool isRecent;
        (isRecent, , ) = CanonicalPriceFeed(routes.priceSource).getPriceInfo(request.investmentAsset);
        require(isRecent, "Price not recent");

        FeeManager(routes.feeManager).rewardManagementFee();

        // sharePrice quoted in QUOTE_ASSET and multiplied by 10 ** fundDecimals
        uint costQuantity; // TODO: better naming after refactor (this variable is how much the shares wanted cost in total, in the desired payment token)
        costQuantity = mul(request.requestedShares, Accounting(routes.accounting).calcSharePrice()) / 10 ** SHARES_DECIMALS;
        // TODO: maybe allocate fees in a separate step (to come later)
        if(request.investmentAsset != address(Accounting(routes.accounting).QUOTE_ASSET())) {
            bool isPriceRecent;
            uint invertedInvestmentAssetPrice;
            uint investmentAssetDecimal;
            (isPriceRecent, invertedInvestmentAssetPrice, investmentAssetDecimal) = CanonicalPriceFeed(routes.priceSource).getInvertedPriceInfo(request.investmentAsset);
            // TODO: is below check needed, given the recency check a few lines above?
            require(isPriceRecent, "Investment asset price not recent");
            costQuantity = mul(costQuantity, invertedInvestmentAssetPrice) / 10 ** investmentAssetDecimal;
        }

        require(
            costQuantity <= request.investmentAmount,
            "Invested amount too low"
        );

        delete requests[requestOwner];
        require(
            ERC20(request.investmentAsset).transferFrom(
                requestOwner, address(routes.vault), costQuantity
            ),
            "Failed to transfer investment asset to vault"
        );
        Shares(routes.shares).createFor(requestOwner, request.requestedShares);
        // // TODO: this should be done somewhere else
        if (!Accounting(routes.accounting).isInAssetList(request.investmentAsset)) {
            Accounting(routes.accounting).addAssetToOwnedAssets(request.investmentAsset);
        }

        emit RequestExecution(
            requestOwner,
            msg.sender,
            request.investmentAsset,
            request.investmentAmount,
            request.requestedShares
        );
    }

    function getOwedPerformanceFees(uint shareQuantity)
        view
        returns (uint remainingShareQuantity)
    {
        Shares shares = Shares(routes.shares);
        uint performanceFeePortion = mul(
            FeeManager(routes.feeManager).performanceFeeAmount(),
            shareQuantity
        ) / shares.totalSupply();
        return performanceFeePortion;
    }

    /// @dev "Happy path" (no asset throws & quantity available)
    /// @notice Redeem all shares and across all assets
    function redeem() public {
        uint ownedShares = Shares(routes.shares).balanceOf(msg.sender);
        redeemQuantity(ownedShares);
    }

    /// @notice Redeem shareQuantity across all assets
    function redeemQuantity(uint shareQuantity) public {
        address[] memory assetList;
        (, assetList) = Accounting(routes.accounting).getFundHoldings();
        redeemWithConstraints(shareQuantity, assetList); //TODO: assetList from another module
    }

    // NB1: reconsider the scenario where the user has enough funds to force shutdown on a large trade (any way around this?)
    // TODO: readjust with calls and changed variable names where needed
    /// @dev Redeem only selected assets (used only when an asset throws)
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public {
        Shares shares = Shares(routes.shares);
        require(
            shares.balanceOf(msg.sender) >= shareQuantity &&
            shares.balanceOf(msg.sender) > 0,
            "Sender does not have enough shares to fulfill request"
        );

        FeeManager(routes.feeManager).rewardManagementFee();
        uint owedPerformanceFees = getOwedPerformanceFees(shareQuantity);
        shares.destroyFor(msg.sender, owedPerformanceFees);
        shares.createFor(hub.manager(), owedPerformanceFees);
        uint remainingShareQuantity = sub(shareQuantity, owedPerformanceFees);

        address ofAsset;
        uint[] memory ownershipQuantities = new uint[](requestedAssets.length);
        address[] memory redeemedAssets = new address[](requestedAssets.length);
        // Check whether enough assets held by fund
        Accounting accounting = Accounting(routes.accounting);
        for (uint i = 0; i < requestedAssets.length; ++i) {
            ofAsset = requestedAssets[i];
            if (ofAsset == address(0)) continue;
            require(
                accounting.isInAssetList(ofAsset),
                "Requested asset not in asset list"
            );
            for (uint j = 0; j < redeemedAssets.length; j++) {
                require(
                    ofAsset != redeemedAssets[j],
                    "Asset can only be redeemed once"
                );
            }
            redeemedAssets[i] = ofAsset;
            uint quantityHeld = accounting.assetHoldings(ofAsset);
            if (quantityHeld == 0) continue;

            // participant's ownership percentage of asset holdings
            ownershipQuantities[i] = mul(quantityHeld, remainingShareQuantity) / shares.totalSupply();
        }

        shares.destroyFor(msg.sender, remainingShareQuantity);

        // Transfer owned assets
        for (uint k = 0; k < requestedAssets.length; ++k) {
            ofAsset = requestedAssets[k];
            if (ownershipQuantities[k] == 0) {
                continue;
            } else {
                Vault(routes.vault).withdraw(ofAsset, ownershipQuantities[k]);
                require(
                    ERC20(ofAsset).transfer(msg.sender, ownershipQuantities[k]),
                    "Asset transfer failed"
                );
            }
        }
        emit Redemption(
            msg.sender,
            requestedAssets,
            ownershipQuantities,
            remainingShareQuantity
        );
    }

    function hasRequest(address _who) view returns (bool) {
        return requests[_who].requestedShares > 0;
    }
}

contract ParticipationFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address[] defaultAssets,
        address registry
    );

    function createInstance(address _hub, address[] _defaultAssets, address _registry)
        public
        returns (address)
    {
        address participation = new Participation(_hub, _defaultAssets, _registry);
        childExists[participation] = true;
        emit NewInstance(_hub, participation, _defaultAssets, _registry);
        return participation;
    }
}

