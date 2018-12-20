pragma solidity ^0.4.21;

import "Spoke.sol";
import "Shares.sol";
import "Accounting.sol";
import "Vault.sol";
import "ERC20.i.sol";
import "Factory.sol";
import "math.sol";
import "PriceSource.i.sol";
import "AmguConsumer.sol";
import "Participation.i.sol";

/// @notice Entry and exit point for investors
contract Participation is ParticipationInterface, DSMath, AmguConsumer, Spoke {
    struct Request {
        address investmentAsset;
        uint investmentAmount;
        uint requestedShares;
        uint timestamp;
    }

    mapping (address => Request) public requests;
    mapping (address => bool) public investAllowed;
    uint constant public SHARES_DECIMALS = 18;
    uint constant public INVEST_DELAY = 10 minutes;

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

    function hasRequest(address _who) view returns (bool) {
        return requests[_who].timestamp > 0;
    }

    /// @notice Whether request is OK and invest delay is being respected
    /// @dev For the very first investment, we ignore delay
    function hasValidRequest(address _who) public view returns (bool) {
        bool delayRespected= Shares(routes.shares).totalSupply() == 0 ||
            block.timestamp >= add(requests[_who].timestamp, INVEST_DELAY) &&
            block.timestamp <= add(requests[_who].timestamp, mul(2, INVEST_DELAY));

        return hasRequest(_who) &&
            delayRespected &&
            requests[_who].investmentAmount > 0 &&
            requests[_who].requestedShares > 0;
    }

    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    )
        external
        notShutDown
        amguPayable
        payable
        onlyInitialized
    {
        PolicyManager(routes.policyManager).preValidate(
            bytes4(sha3("requestInvestment(address)")),
            [msg.sender, address(0), address(0), address(0), address(0)],
            [uint(0), uint(0), uint(0)],
            bytes32(0)
        );
        require(
            investAllowed[investmentAsset],
            "Investment not allowed in this asset"
        );
        requests[msg.sender] = Request({
            investmentAsset: investmentAsset,
            investmentAmount: investmentAmount,
            requestedShares: requestedShares,
            timestamp: block.timestamp
        });

        emit InvestmentRequest(
            msg.sender,
            investmentAsset,
            requestedShares,
            investmentAmount
        );
    }

    function cancelRequest() external {
        require(
            hasRequest(msg.sender),
            "No request to cancel"
        );
        delete requests[msg.sender];
        emit CancelRequest(msg.sender);
    }

    function executeRequestFor(address requestOwner)
        public
        notShutDown
        amguPayable
        payable
    {
        require(
            hasValidRequest(requestOwner),
            "No valid request for this address"
        );
        PolicyManager(routes.policyManager).preValidate(bytes4(sha3("executeRequestFor(address)")), [requestOwner, address(0), address(0), address(0), address(0)], [uint(0), uint(0), uint(0)], bytes32(0));
        Request memory request = requests[requestOwner];
        require(
            investAllowed[request.investmentAsset],
            "Investment not allowed in this asset"
        );
        require(
            PriceSourceInterface(routes.priceSource).hasValidPrice(request.investmentAsset),
            "Price not valid"
        );

        FeeManager(routes.feeManager).rewardManagementFee();

        uint totalShareCostInInvestmentAsset = Accounting(routes.accounting)
            .getShareCostInAsset(
                request.requestedShares,
                request.investmentAsset
            );

        require(
            totalShareCostInInvestmentAsset <= request.investmentAmount,
            "Invested amount too low"
        );

        delete requests[requestOwner];
        require(
            ERC20(request.investmentAsset).transferFrom(
                requestOwner, address(routes.vault),
                totalShareCostInInvestmentAsset
            ),
            "Failed to transfer investment asset to vault"
        );
        Shares(routes.shares).createFor(requestOwner, request.requestedShares);
        Accounting(routes.accounting).addAssetToOwnedAssets(request.investmentAsset);

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
        redeemWithConstraints(shareQuantity, assetList);
    }

    // TODO: reconsider the scenario where the user has enough funds to force shutdown on a large trade (any way around this?)
    /// @dev Redeem only selected assets (used only when an asset throws)
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public {
        Shares shares = Shares(routes.shares);
        require(
            shares.balanceOf(msg.sender) >= shareQuantity &&
            shares.balanceOf(msg.sender) > 0,
            "Sender does not have enough shares to fulfill request"
        );

        uint owedPerformanceFees = 0;
        if (
            PriceSourceInterface(routes.priceSource).hasValidPrices(requestedAssets)
        ) {
            FeeManager(routes.feeManager).rewardManagementFee();
            owedPerformanceFees = getOwedPerformanceFees(shareQuantity);
            shares.destroyFor(msg.sender, owedPerformanceFees);
            shares.createFor(hub.manager(), owedPerformanceFees);
        }
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

