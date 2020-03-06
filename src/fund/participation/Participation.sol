pragma solidity 0.6.1;

import "../accounting/IAccounting.sol";
import "../fees/IFeeManager.sol";
import "../hub/Spoke.sol";
import "../policies/IPolicyManager.sol";
import "../shares/IShares.sol";
import "../vault/IVault.sol";
import "../../dependencies/DSMath.sol";
import "../../dependencies/TokenUser.sol";
import "../../dependencies/token/IERC20.sol";
import "../../engine/AmguConsumer.sol";
import "../../factory/Factory.sol";
import "../../prices/IPriceSource.sol";

/// @notice Entry and exit point for investors
contract Participation is TokenUser, AmguConsumer, Spoke {
    event CancelRequest (address indexed requestOwner);

    event EnableInvestment (address[] asset);

    event DisableInvestment (address[] assets);

    event InvestmentRequest (
        address indexed requestOwner,
        address indexed investmentAsset,
        uint256 requestedShares,
        uint256 investmentAmount
    );

    event Redemption (
        address indexed redeemer,
        address[] assets,
        uint256[] assetQuantities,
        uint256 redeemedShares
    );

    struct Request {
        address investmentAsset;
        uint256 investmentAmount;
        uint256 requestedShares;
        uint256 timestamp;
    }

    event RequestExecution (
        address indexed requestOwner,
        address indexed executor,
        address indexed investmentAsset,
        uint256 investmentAmount,
        uint256 requestedShares
    );

    uint8 constant public SHARES_DECIMALS = 18;
    uint32 constant public REQUEST_LIFESPAN = 1 days; // 86,400 seconds

    mapping (address => Request) public requests;
    mapping (address => bool) public hasInvested; // for information purposes only (read)
    mapping (address => bool) public investAllowed;

    address[] public historicalInvestors; // for information purposes only (read)

    constructor(address _hub, address[] memory _defaultAssets, address _registry)
        public
        Spoke(_hub)
        AmguConsumer(_registry)
    {
        routes.registry = _registry;
        __enableInvestment(_defaultAssets);
    }

    // EXTERNAL

    receive() external payable {}

    /// @notice Can only cancel when no price, request expired or fund shut down
    /// @dev Only request owner can cancel their request
    function cancelRequest() external {
        __cancelRequestFor(msg.sender);
    }

    function cancelRequestFor(address _requestOwner) external {
        __cancelRequestFor(_requestOwner);
    }

    function disableInvestment(address[] calldata _assets) external auth {
        for (uint256 i = 0; i < _assets.length; i++) {
            investAllowed[_assets[i]] = false;
        }
        emit DisableInvestment(_assets);
    }

    function enableInvestment(address[] calldata _assets) external auth {
        __enableInvestment(_assets);
    }

    function executeRequestFor(address _requestOwner)
        external
        notShutDown
        amguPayable(false)
        payable
    {
        Request memory request = requests[_requestOwner];
        require(
            hasValidRequest(_requestOwner),
            "No valid request for this address"
        );

        IFeeManager(routes.feeManager).rewardManagementFee();

        uint256 totalShareCostInInvestmentAsset = IAccounting(routes.accounting)
            .getShareCostInAsset(
                request.requestedShares,
                request.investmentAsset
            );

        require(
            totalShareCostInInvestmentAsset <= request.investmentAmount,
            "Invested amount too low"
        );
        // send necessary amount of investmentAsset to Vault
        safeTransfer(
            request.investmentAsset,
            routes.vault,
            totalShareCostInInvestmentAsset
        );

        uint256 investmentAssetChange = sub(
            request.investmentAmount,
            totalShareCostInInvestmentAsset
        );

        // return investmentAsset change to request owner
        if (investmentAssetChange > 0) {
            safeTransfer(
                request.investmentAsset,
                _requestOwner,
                investmentAssetChange
            );
        }

        msg.sender.transfer(IRegistry(routes.registry).incentive());

        IShares(routes.shares).createFor(_requestOwner, request.requestedShares);
        IAccounting(routes.accounting).increaseAssetBalance(
            request.investmentAsset,
            totalShareCostInInvestmentAsset
        );

        if (!hasInvested[_requestOwner]) {
            hasInvested[_requestOwner] = true;
            historicalInvestors.push(_requestOwner);
        }

        emit RequestExecution(
            _requestOwner,
            msg.sender,
            request.investmentAsset,
            request.investmentAmount,
            request.requestedShares
        );
        delete requests[_requestOwner];
    }

    function getHistoricalInvestors() external view returns (address[] memory) {
        return historicalInvestors;
    }

    /// @notice Redeem all shares and across all assets
    function redeem() external {
        uint256 ownedShares = IShares(routes.shares).balanceOf(msg.sender);
        redeemQuantity(ownedShares);
    }

    function requestInvestment(
        uint256 _requestedShares,
        uint256 _investmentAmount,
        address _investmentAsset
    )
        external
        notShutDown
        payable
        amguPayable(true)
        onlyInitialized
    {
        IPolicyManager(routes.policyManager).preValidate(
            bytes4(keccak256("requestInvestment(uint256,uint256,address)")),
            [msg.sender, address(0), address(0), _investmentAsset, address(0)],
            [uint256(0), uint256(0), uint256(0)],
            bytes32(0)
        );
        require(
            investAllowed[_investmentAsset],
            "Investment not allowed in this asset"
        );
        safeTransferFrom(_investmentAsset, msg.sender, address(this), _investmentAmount);
        require(
            requests[msg.sender].timestamp == 0,
            "Only one request can exist at a time"
        );
        requests[msg.sender] = Request({
            investmentAsset: _investmentAsset,
            investmentAmount: _investmentAmount,
            requestedShares: _requestedShares,
            timestamp: block.timestamp
        });
        IPolicyManager(routes.policyManager).postValidate(
            bytes4(keccak256("requestInvestment(uint256,uint256,address)")),
            [msg.sender, address(0), address(0), _investmentAsset, address(0)],
            [uint256(0), uint256(0), uint256(0)],
            bytes32(0)
        );

        emit InvestmentRequest(
            msg.sender,
            _investmentAsset,
            _requestedShares,
            _investmentAmount
        );
    }

    // PUBLIC FUNCTIONS
    function getOwedPerformanceFees(uint256 _shareQuantity)
        public
        returns (uint256 remainingShareQuantity)
    {
        IShares shares = IShares(routes.shares);

        uint256 totalPerformanceFee = IFeeManager(routes.feeManager).performanceFeeAmount();
        // The denominator is augmented because performanceFeeAmount() accounts for inflation
        // Since shares are directly transferred, we don't need to account for inflation in this case
        uint256 performanceFeePortion = mul(
            totalPerformanceFee,
            _shareQuantity
        ) / add(shares.totalSupply(), totalPerformanceFee);
        return performanceFeePortion;
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
        bool delayRespectedOrNoShares = requests[_who].timestamp < priceSource.lastUpdate() ||
            IShares(routes.shares).totalSupply() == 0;

        return hasRequest(_who) &&
            delayRespectedOrNoShares &&
            !hasExpiredRequest(_who) &&
            requests[_who].investmentAmount > 0 &&
            requests[_who].requestedShares > 0;
    }

    /// @notice Redeem shareQuantity across all assets
    function redeemQuantity(uint256 _shareQuantity) public {
        (address[] memory assetList,) = IAccounting(routes.accounting).getFundHoldings();
        redeemWithConstraints(_shareQuantity, assetList);
    }

    /// @dev Redeem only selected assets (used only when an asset throws)
    function redeemWithConstraints(uint256 _shareQuantity, address[] memory _requestedAssets) public {
        IShares shares = IShares(routes.shares);
        require(
            shares.balanceOf(msg.sender) >= _shareQuantity &&
            shares.balanceOf(msg.sender) > 0,
            "Sender does not have enough shares to fulfill request"
        );

        uint256 owedPerformanceFees = 0;
        if (
            IPriceSource(priceSource()).hasValidPrices(_requestedAssets) &&
            msg.sender != hub.manager()
        ) {
            IFeeManager(routes.feeManager).rewardManagementFee();
            owedPerformanceFees = getOwedPerformanceFees(_shareQuantity);
            shares.destroyFor(msg.sender, owedPerformanceFees);
            shares.createFor(hub.manager(), owedPerformanceFees);
        }
        uint256 remainingShareQuantity = sub(_shareQuantity, owedPerformanceFees);

        address ofAsset;
        uint256[] memory ownershipQuantities = new uint256[](_requestedAssets.length);
        address[] memory redeemedAssets = new address[](_requestedAssets.length);
        // Check whether enough assets held by fund
        IAccounting accounting = IAccounting(routes.accounting);
        for (uint256 i = 0; i < _requestedAssets.length; ++i) {
            ofAsset = _requestedAssets[i];
            uint256 quantityHeld = accounting.getFundHoldingsForAsset(ofAsset);
            require(quantityHeld > 0, "Requested asset holdings is 0");
            for (uint256 j = 0; j < redeemedAssets.length; j++) {
                require(
                    ofAsset != redeemedAssets[j],
                    "Asset can only be redeemed once"
                );
            }
            redeemedAssets[i] = ofAsset;
            if (quantityHeld == 0) continue;

            // participant's ownership percentage of asset holdings
            ownershipQuantities[i] = mul(
                quantityHeld,
                remainingShareQuantity
            ) / shares.totalSupply();
        }

        shares.destroyFor(msg.sender, remainingShareQuantity);

        // Transfer owned assets
        for (uint256 k = 0; k < _requestedAssets.length; ++k) {
            ofAsset = _requestedAssets[k];
            if (ownershipQuantities[k] == 0) {
                continue;
            } else {
                IVault(routes.vault).withdraw(ofAsset, ownershipQuantities[k]);
                safeTransfer(ofAsset, msg.sender, ownershipQuantities[k]);
                IAccounting(routes.accounting).decreaseAssetBalance(
                    ofAsset,
                    ownershipQuantities[k]
                );
            }
        }
        emit Redemption(
            msg.sender,
            _requestedAssets,
            ownershipQuantities,
            remainingShareQuantity
        );
    }

    // INTERNAL FUNCTIONS
    function __cancelRequestFor(address _requestOwner) internal {
        require(hasRequest(_requestOwner), "No request to cancel");
        IPriceSource priceSource = IPriceSource(priceSource());
        Request memory request = requests[_requestOwner];
        require(
            !priceSource.hasValidPrice(request.investmentAsset) ||
            hasExpiredRequest(_requestOwner) ||
            hub.isShutDown(),
            "No cancellation condition was met"
        );
        IERC20 investmentAsset = IERC20(request.investmentAsset);
        uint256 investmentAmount = request.investmentAmount;
        delete requests[_requestOwner];
        msg.sender.transfer(IRegistry(routes.registry).incentive());
        safeTransfer(address(investmentAsset), _requestOwner, investmentAmount);

        emit CancelRequest(_requestOwner);
    }

    function __enableInvestment (address[] memory _assets) internal {
        for (uint256 i = 0; i < _assets.length; i++) {
            require(
                IRegistry(routes.registry).assetIsRegistered(_assets[i]),
                "Asset not registered"
            );
            investAllowed[_assets[i]] = true;
        }
        emit EnableInvestment(_assets);
    }
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
