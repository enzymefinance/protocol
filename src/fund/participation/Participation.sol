pragma solidity 0.6.1;

import "../vault/Vault.sol";
import "../shares/Shares.sol";
import "../policies/PolicyManager.sol";
import "../hub/Spoke.sol";
import "../accounting/Accounting.sol";
import "../../prices/IPriceSource.sol";
import "../../factory/Factory.sol";
import "../../engine/AmguConsumer.sol";
import "../../dependencies/token/IERC20.sol";
import "../../dependencies/DSMath.sol";
import "../../dependencies/TokenUser.sol";

/// @notice Entry and exit point for investors
contract Participation is TokenUser, AmguConsumer, Spoke {
    event EnableInvestment (address[] asset);
    event DisableInvestment (address[] assets);

    event InvestmentRequest (
        address indexed requestOwner,
        address indexed investmentAsset,
        uint requestedShares,
        uint investmentAmount
    );

    event RequestExecution (
        address indexed requestOwner,
        address indexed executor,
        address indexed investmentAsset,
        uint investmentAmount,
        uint requestedShares
    );

    event CancelRequest (
        address indexed requestOwner
    );

    event Redemption (
        address indexed redeemer,
        address[] assets,
        uint[] assetQuantities,
        uint redeemedShares
    );

    struct Request {
        address investmentAsset;
        uint investmentAmount;
        uint requestedShares;
        uint timestamp;
    }

    uint constant public SHARES_DECIMALS = 18;
    uint constant public REQUEST_LIFESPAN = 1 days;

    mapping (address => Request) public requests;
    mapping (address => bool) public investAllowed;
    mapping (address => bool) public hasInvested; // for information purposes only (read)

    address[] public historicalInvestors; // for information purposes only (read)

    constructor(address _hub, address[] memory _defaultAssets, address _registry)
        public
        Spoke(_hub)
    {
        routes.registry = _registry;
        _enableInvestment(_defaultAssets);
    }

    receive() external payable {}

    function _enableInvestment(address[] memory _assets) internal {
        for (uint i = 0; i < _assets.length; i++) {
            require(
                Registry(routes.registry).assetIsRegistered(_assets[i]),
                "Asset not registered"
            );
            investAllowed[_assets[i]] = true;
        }
        emit EnableInvestment(_assets);
    }

    function enableInvestment(address[] calldata _assets) external auth {
        _enableInvestment(_assets);
    }

    function disableInvestment(address[] calldata _assets) external auth {
        for (uint i = 0; i < _assets.length; i++) {
            investAllowed[_assets[i]] = false;
        }
        emit DisableInvestment(_assets);
    }

    function hasRequest(address _who) public view returns (bool) {
        return requests[_who].timestamp > 0;
    }

    function hasExpiredRequest(address _who) public view returns (bool) {
        return block.timestamp > add(requests[_who].timestamp, REQUEST_LIFESPAN);
    }

    /// @notice Whether request is OK and invest delay is being respected
    /// @dev Request valid if price update happened since request and not expired
    /// @dev If no shares exist and not expired, request can be executed immediately
    function hasValidRequest(address _who) public view returns (bool) {
        IPriceSource priceSource = IPriceSource(priceSource());
        bool delayRespectedOrNoShares = requests[_who].timestamp < priceSource.getLastUpdate() ||
            Shares(routes.shares).totalSupply() == 0;

        return hasRequest(_who) &&
            delayRespectedOrNoShares &&
            !hasExpiredRequest(_who) &&
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
        payable
        amguPayable(true)
        onlyInitialized
    {
        PolicyManager(routes.policyManager).preValidate(
            msg.sig,
            [msg.sender, address(0), address(0), investmentAsset, address(0)],
            [uint(0), uint(0), uint(0)],
            bytes32(0)
        );
        require(
            investAllowed[investmentAsset],
            "Investment not allowed in this asset"
        );
        safeTransferFrom(
            investmentAsset, msg.sender, address(this), investmentAmount
        );
        require(
            requests[msg.sender].timestamp == 0,
            "Only one request can exist at a time"
        );
        requests[msg.sender] = Request({
            investmentAsset: investmentAsset,
            investmentAmount: investmentAmount,
            requestedShares: requestedShares,
            timestamp: block.timestamp
        });
        PolicyManager(routes.policyManager).postValidate(
            msg.sig,
            [msg.sender, address(0), address(0), investmentAsset, address(0)],
            [uint(0), uint(0), uint(0)],
            bytes32(0)
        );

        emit InvestmentRequest(
            msg.sender,
            investmentAsset,
            requestedShares,
            investmentAmount
        );
    }

    function _cancelRequestFor(address requestOwner) internal {
        require(hasRequest(requestOwner), "No request to cancel");
        IPriceSource priceSource = IPriceSource(priceSource());
        Request memory request = requests[requestOwner];
        require(
            !priceSource.hasValidPrice(request.investmentAsset) ||
            hasExpiredRequest(requestOwner) ||
            hub.isShutDown(),
            "No cancellation condition was met"
        );
        IERC20 investmentAsset = IERC20(request.investmentAsset);
        uint investmentAmount = request.investmentAmount;
        delete requests[requestOwner];
        msg.sender.transfer(Registry(routes.registry).incentive());
        safeTransfer(address(investmentAsset), requestOwner, investmentAmount);

        emit CancelRequest(requestOwner);
    }

    /// @notice Can only cancel when no price, request expired or fund shut down
    /// @dev Only request owner can cancel their request
    function cancelRequest() external payable amguPayable(false) {
        _cancelRequestFor(msg.sender);
    }

    function cancelRequestFor(address requestOwner)
        external
        payable
        amguPayable(false)
    {
        _cancelRequestFor(requestOwner);
    }

    function executeRequestFor(address requestOwner)
        external
        notShutDown
        amguPayable(false)
        payable
    {
        Request memory request = requests[requestOwner];
        require(
            hasValidRequest(requestOwner),
            "No valid request for this address"
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
        // send necessary amount of investmentAsset to vault
        safeTransfer(
            request.investmentAsset,
            routes.vault,
            totalShareCostInInvestmentAsset
        );

        uint investmentAssetChange = sub(
            request.investmentAmount,
            totalShareCostInInvestmentAsset
        );

        // return investmentAsset change to request owner
        if (investmentAssetChange > 0) {
            safeTransfer(
                request.investmentAsset,
                requestOwner,
                investmentAssetChange
            );
        }

        msg.sender.transfer(Registry(routes.registry).incentive());

        Shares(routes.shares).createFor(requestOwner, request.requestedShares);
        Accounting(routes.accounting).addAssetToOwnedAssets(request.investmentAsset);

        if (!hasInvested[requestOwner]) {
            hasInvested[requestOwner] = true;
            historicalInvestors.push(requestOwner);
        }

        emit RequestExecution(
            requestOwner,
            msg.sender,
            request.investmentAsset,
            request.investmentAmount,
            request.requestedShares
        );
        delete requests[requestOwner];
    }

    function getOwedPerformanceFees(uint shareQuantity)
        public
        returns (uint remainingShareQuantity)
    {
        Shares shares = Shares(routes.shares);

        uint totalPerformanceFee = FeeManager(routes.feeManager).performanceFeeAmount();
        // The denominator is augmented because performanceFeeAmount() accounts for inflation
        // Since shares are directly transferred, we don't need to account for inflation in this case
        uint performanceFeePortion = mul(
            totalPerformanceFee,
            shareQuantity
        ) / add(shares.totalSupply(), totalPerformanceFee);
        return performanceFeePortion;
    }

    /// @dev "Happy path" (no asset throws & quantity available)
    /// @notice Redeem all shares and across all assets
    function redeem() external {
        uint ownedShares = Shares(routes.shares).balanceOf(msg.sender);
        redeemQuantity(ownedShares);
    }

    /// @notice Redeem shareQuantity across all assets
    function redeemQuantity(uint shareQuantity) public {
        address[] memory assetList;
        assetList = Accounting(routes.accounting).getOwnedAssets();
        redeemWithConstraints(shareQuantity, assetList);
    }

    // TODO: reconsider the scenario where the user has enough funds to force shutdown on a large trade (any way around this?)
    /// @dev Redeem only selected assets (used only when an asset throws)
    function redeemWithConstraints(uint shareQuantity, address[] memory requestedAssets) public {
        Shares shares = Shares(routes.shares);
        require(
            shares.balanceOf(msg.sender) >= shareQuantity &&
            shares.balanceOf(msg.sender) > 0,
            "Sender does not have enough shares to fulfill request"
        );

        uint owedPerformanceFees = 0;
        if (
            IPriceSource(priceSource()).hasValidPrices(requestedAssets) &&
            msg.sender != hub.manager()
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
                safeTransfer(ofAsset, msg.sender, ownershipQuantities[k]);
            }
        }
        emit Redemption(
            msg.sender,
            requestedAssets,
            ownershipQuantities,
            remainingShareQuantity
        );
    }

    function getHistoricalInvestors() external view returns (address[] memory) {
        return historicalInvestors;
    }

    function engine() public view override(AmguConsumer, Spoke) returns (address) { return Spoke.engine(); }
    function mlnToken() public view override(AmguConsumer, Spoke) returns (address) { return Spoke.mlnToken(); }
    function priceSource() public view override(AmguConsumer, Spoke) returns (address) { return Spoke.priceSource(); }
    function registry() public view override(AmguConsumer, Spoke) returns (address) { return Spoke.registry(); }
}

contract ParticipationFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address[] defaultAssets,
        address registry
    );

    function createInstance(address _hub, address[] calldata _defaultAssets, address _registry)
        external
        returns (address)
    {
        address participation = address(
            new Participation(_hub, _defaultAssets, _registry)
        );
        childExists[participation] = true;
        emit NewInstance(_hub, participation, _defaultAssets, _registry);
        return participation;
    }
}
