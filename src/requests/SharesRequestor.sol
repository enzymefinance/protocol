pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../dependencies/DSMath.sol";
import "../dependencies/TokenUser.sol";
import "../dependencies/token/IERC20.sol";
import "../dependencies/libs/EnumerableSet.sol";
import "../engine/AmguConsumer.sol";
import "../fund/accounting/IAccounting.sol";
import "../fund/fees/IFeeManager.sol";
import "../fund/hub/IHub.sol";
import "../fund/policies/IPolicyManager.sol";
import "../fund/shares/IShares.sol";
import "../prices/IPriceSource.sol";

/// @title SharesRequestor Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Entry point for users to buy shares in funds
contract SharesRequestor is DSMath, TokenUser, AmguConsumer {
    using EnumerableSet for EnumerableSet.AddressSet;

    event RequestCancelled (
        address caller,
        address requestOwner,
        address indexed hub,
        address investmentAsset,
        uint256 maxInvestmentAmount,
        uint256 sharesQuantity,
        uint256 createdTimestamp,
        uint256 incentiveFee
    );

    event RequestExecuted (
        address caller,
        address requestOwner,
        address indexed hub,
        address investmentAsset,
        uint256 investmentAmountFilled,
        uint256 sharesQuantity,
        uint256 createdTimestamp,
        uint256 incentiveFee
    );

    event RequestCreated (
        address requestOwner,
        address indexed hub,
        address investmentAsset,
        uint256 maxInvestmentAmount,
        uint256 sharesQuantity,
        uint256 incentiveFee
    );

    struct Request {
        address investmentAsset;
        uint256 maxInvestmentAmount;
        uint256 sharesQuantity;
        uint256 timestamp;
        uint256 incentiveFee;
    }

    uint32 constant private REQUEST_LIFESPAN = 1 days;

    mapping (address => mapping(address => Request)) public ownerToRequestByFund;
    mapping (address => EnumerableSet.AddressSet) private ownerToFundsRequestedSet;

    /// @notice Assure that a request exists for a particular fund and owner 
    modifier onlyExistingRequest(address _requestOwner, address _hub) {
        require(
            requestExists(_requestOwner, _hub),
            "onlyExistingRequest: No request exists for fund"
        );
        _;
    }

    /// @notice Assure that a hub address is valid
    modifier validHub(address _hub) {
        require(_hub != address(0), "validHub: _hub cannot be empty");
        require(REGISTRY.isHub(_hub), "validHub: Fund does not exist");
        _;
    }

    constructor(address _registry) public AmguConsumer(_registry) {}

    // EXTERNAL

    // @dev Needed for Amgu / incentive
    receive() external payable {}

    /// @notice Cancel shares request for a particular fund (for the sender)
    /// @dev Can only cancel when no price, request expired or fund shut down
    /// @param _hub The fund for which to cancel the request
    function cancelRequest(address _hub) external {
        __cancelRequestFor(msg.sender, _hub);
    }

    /// @notice Cancel shares request for a particular fund (for a specified user)
    /// @dev Can only cancel when no price, request expired or fund shut down
    /// @param _requestOwner The owner of the pending shares request
    /// @param _hub The fund for which to cancel the request
    function cancelRequestFor(address _requestOwner, address _hub) external {
        __cancelRequestFor(_requestOwner, _hub);
    }

    /// @notice Execute shares request for a particular fund (for a specified user)
    /// @param _requestOwner The owner of the pending shares request
    /// @param _hub The fund for which to execute the request
    function executeRequestFor(address _requestOwner, address _hub)
        external
        onlyExistingRequest(_requestOwner, _hub)
        amguPayable
        payable
    {
        (
            bool isExecutable,
            string memory notExecutableReason
        ) = requestIsExecutable(_requestOwner, _hub);
        require(isExecutable, string(abi.encodePacked("executeRequestFor:", notExecutableReason)));

        Request memory request = ownerToRequestByFund[_requestOwner][_hub];

        uint256 investmentAmountFilled = __validateAndBuyShares(
            _hub,
            _requestOwner,
            request.investmentAsset,
            request.maxInvestmentAmount,
            request.sharesQuantity
        );

        // Remove the Request
        delete ownerToRequestByFund[_requestOwner][_hub];
        EnumerableSet.remove(ownerToFundsRequestedSet[msg.sender], _hub);

        // Do the asset transfers in a separate step after altering state
        __transferRequestSurplusAssets(
            _requestOwner,
            request.investmentAsset,
            request.maxInvestmentAmount,
            investmentAmountFilled,
            request.incentiveFee
        );

        emit RequestExecuted(
            msg.sender,
            _requestOwner,
            _hub,
            request.investmentAsset,
            investmentAmountFilled,
            request.sharesQuantity,
            request.timestamp,
            request.incentiveFee
        );
    }

    /// @notice Fetch fund addresses of all pending shares requests for a specified user
    /// @param _requestOwner The owner of the pending shares request
    /// @return An array of fund addresses
    function getFundsRequestedSet(address _requestOwner) external view returns (address[] memory) {
        return EnumerableSet.enumerate(ownerToFundsRequestedSet[_requestOwner]);
    }

    /// @notice Add a shares requests for the sender
    /// @param _hub The fund for which to buy shares
    /// @param _investmentAsset The asset with which to buy shares
    /// @param _maxInvestmentAmount The max amount of the investment asset
    /// with which to buy the desired amount of shares
    /// @param _sharesQuantity The desired amount of shares
    /// @return True if successful
    function requestShares(
        address _hub,
        address _investmentAsset,
        uint256 _maxInvestmentAmount,
        uint256 _sharesQuantity
    )
        external
        payable
        validHub(_hub)
        amguPayableWithIncentive
        returns (bool)
    {
        // Sanity checks
        require(_investmentAsset != address(0), "requestShares: _investmentAsset cannot be empty");
        require(_maxInvestmentAmount > 0, "requestShares: _maxInvestmentAmount must be > 0");
        require(_sharesQuantity > 0, "requestShares: _sharesQuantity must be > 0");

        // State checks
        require(
            !requestExists(msg.sender, _hub),
            "requestShares: Only one request can exist (per fund)"
        );
        require(
            IERC20(_investmentAsset).allowance(msg.sender, address(this)) >= _maxInvestmentAmount,
            "requestShares: Actual allowance is less than _maxInvestmentAmount"
        );

        // The initial investment in a fund can skip the request process and settle directly
        if (IShares(IHub(_hub).shares()).totalSupply() == 0) {
            __safeTransferFrom(_investmentAsset, msg.sender, address(this), _maxInvestmentAmount);
            uint256 investmentAmountFilled = __validateAndBuyShares(
                _hub,
                msg.sender,
                _investmentAsset,
                _maxInvestmentAmount,
                _sharesQuantity
            );
            __transferRequestSurplusAssets(
                msg.sender,
                _investmentAsset,
                _maxInvestmentAmount,
                investmentAmountFilled,
                REGISTRY.incentive()
            );

            return true;
        }

        // Validate the actual buyShares call
        __validateBuySharesRequest(_hub, _investmentAsset, _maxInvestmentAmount, _sharesQuantity);

        // TODO: can check the fund policies here as well?

        // Create the Request and take custody of investmentAsset
        Request memory request = Request({
            investmentAsset: _investmentAsset,
            maxInvestmentAmount: _maxInvestmentAmount,
            sharesQuantity: _sharesQuantity,
            timestamp: block.timestamp,
            incentiveFee: REGISTRY.incentive()
        });
        ownerToRequestByFund[msg.sender][_hub] = request;
        EnumerableSet.add(ownerToFundsRequestedSet[msg.sender], _hub);
        __safeTransferFrom(_investmentAsset, msg.sender, address(this), _maxInvestmentAmount);

        emit RequestCreated(
            msg.sender,
            _hub,
            request.investmentAsset,
            request.maxInvestmentAmount,
            request.sharesQuantity,
            request.incentiveFee
        );

        return true;
    }

    // PUBLIC FUNCTIONS

    /// @notice Helper to check whether a request exists for a fund and user
    /// @dev Doesn't use EnumerableSet.contains() because the canonical Request is ownerToRequestByFund
    /// @param _requestOwner The owner of the pending shares request
    /// @param _hub The fund for the pending shares request
    /// @return True if the shares request exists
    function requestExists(address _requestOwner, address _hub)
        public
        view
        returns (bool)
    {
        return ownerToRequestByFund[_requestOwner][_hub].investmentAsset != address(0);
    }

    /// @notice Check if a specific shares request has expired
    /// @param _requestOwner The owner of the pending shares request
    /// @param _hub The fund for the pending shares request
    /// @return True if the shares request has expired
    function requestHasExpired(address _requestOwner, address _hub)
        public
        view 
        returns (bool)
    {
        return block.timestamp > add(
            ownerToRequestByFund[_requestOwner][_hub].timestamp,
            REQUEST_LIFESPAN
        );
    }

    /// @notice Check if a pending shares request is able to be executed
    /// @param _requestOwner The owner of the pending shares request
    /// @param _hub The fund for the pending shares request
    /// @return pass_ True if the shares request is executable
    /// @return reason_ If false, the reason string
    function requestIsExecutable(address _requestOwner, address _hub)
        public
        view
        returns (bool pass_, string memory reason_)
    {
        Request memory request = ownerToRequestByFund[_requestOwner][_hub];
        if (requestHasExpired(_requestOwner, _hub)) {
            reason_ = "Request has expired";
        }
        else if (IShares(IHub(_hub).shares()).totalSupply() == 0) {
            pass_ = true;
        }
        else if (request.timestamp >= IPriceSource(REGISTRY.priceSource()).lastUpdate()) {
            reason_ = "Price has not updated since request";
        }
        else {
            pass_ = true;
        }
    }

    // PRIVATE FUNCTIONS

    /// @notice Cancel a given shares request
    function __cancelRequestFor(address _requestOwner, address _hub)
        private
        onlyExistingRequest(_requestOwner, _hub)
    {
        Request memory request = ownerToRequestByFund[_requestOwner][_hub];
        require(
            !IPriceSource(REGISTRY.priceSource()).hasValidPrice(request.investmentAsset) ||
            requestHasExpired(_requestOwner, _hub) ||
            !__fundIsActive(_hub),
            "__cancelRequestFor: No cancellation condition was met"
        );
        // Delete the request, then send the incentive and return the investmentAsset
        delete ownerToRequestByFund[_requestOwner][_hub];
        EnumerableSet.remove(ownerToFundsRequestedSet[msg.sender], _hub);

        msg.sender.transfer(request.incentiveFee);
        __safeTransfer(request.investmentAsset, _requestOwner, request.maxInvestmentAmount);

        emit RequestCancelled(
            msg.sender,
            _requestOwner,
            _hub,
            request.investmentAsset,
            request.maxInvestmentAmount,
            request.sharesQuantity,
            request.timestamp,
            request.incentiveFee
        );
    }

    /// @notice Helper to check whether a fund is not shutdown and has been initialized
    function __fundIsActive(address _hub) private view returns (bool) {
        return !IHub(_hub).isShutDown() && IHub(_hub).fundInitialized();
    }

    /// @notice Helper to transfer surplus investment asset back to the buyer and incentive to the caller
    function __transferRequestSurplusAssets(
        address _buyer,
        address _investmentAsset,
        uint256 _maxInvestmentAmount,
        uint256 _investmentAmountFilled,
        uint256 _incentiveFee
    )
        private
    {
        // Send unused investmentAsset back to buyer and revoke asset approval
        uint256 investmentAmountOverspend = sub(
            _maxInvestmentAmount,
            _investmentAmountFilled
        );
        if (investmentAmountOverspend > 0) {
            __safeTransfer(_investmentAsset, _buyer, investmentAmountOverspend);
        }

        // Reward sender with incentive
        msg.sender.transfer(_incentiveFee);
    }

    /// @notice Helper to buy shares from fund
    /// @dev Does not depend on the Request at all, so it can be used to bypass creating a request
    /// when the totalSupply of shares is 0
    /// @return investmentAmountFilled_ The amount of the investmentAsset that was used to fill the order
    function __validateAndBuyShares(
        address _hub,
        address _buyer,
        address _investmentAsset,
        uint256 _maxInvestmentAmount,
        uint256 _sharesQuantity
    )
        private
        returns (uint256 investmentAmountFilled_)
    {
        // Validate the actual buyShares call
        __validateBuySharesRequest(_hub, _investmentAsset, _maxInvestmentAmount, _sharesQuantity);
        
        IShares shares = IShares(IHub(_hub).shares());
        IPolicyManager policyManager = IPolicyManager(IHub(_hub).policyManager());

        // Validate against fund policies
        // TODO: pass in all relevant values to buying shares
        policyManager.preValidate(
            bytes4(keccak256("buyShares(address,address,uint256)")),
            [_buyer, address(0), address(0), _investmentAsset, address(0)],
            [uint256(0), uint256(0), uint256(0)],
            bytes32(0)
        );

        // Buy the shares via Shares
        // We can grant exact approval to Shares rather than using _maxInvestmentAmount
        // since we use the same function to get the cost
        uint256 costInInvestmentAsset = IAccounting(IHub(_hub).accounting()).getShareCostInAsset(
            _sharesQuantity,
            _investmentAsset
        );
        __increaseApproval(
            _investmentAsset,
            address(shares),
            costInInvestmentAsset
        );
        investmentAmountFilled_ = shares.buyShares(
          _buyer,
          _investmentAsset,
          _sharesQuantity
        );
        require(
            costInInvestmentAsset == investmentAmountFilled_,
            "__validateAndBuyShares: Used more investmentAsset than expected"
        );

        // TODO: pass in all relevant values to buying shares
        policyManager.postValidate(
            bytes4(keccak256("buyShares(address,address,uint256)")),
            [_buyer, address(0), address(0), _investmentAsset, address(0)],
            [uint256(0), uint256(0), uint256(0)],
            bytes32(0)
        );
    }

    /// @notice Helper to validate a buy shares request is valid
    /// @dev Does not check the fund's policies
    function __validateBuySharesRequest(
        address _hub,
        address _investmentAsset,
        uint256 _maxInvestmentAmount,
        uint256 _sharesQuantity
    )
        private
    {
        IHub hub = IHub(_hub);
        require(
            IShares(hub.shares()).isSharesInvestmentAsset(_investmentAsset),
            "__validateBuySharesRequest: _investmentAsset not allowed"
        );
        require(
            __fundIsActive(_hub),
            "__validateBuySharesRequest: Fund is not active"
        );

        // Reward management fees owed for accurate shares dilution
        IFeeManager(hub.feeManager()).rewardManagementFee();

        // Ensure enough investment asset
        uint256 costInInvestmentAsset = IAccounting(hub.accounting()).getShareCostInAsset(
            _sharesQuantity,
            _investmentAsset
        );
        require(
            costInInvestmentAsset <= _maxInvestmentAmount,
            "__validateBuySharesRequest: _maxInvestmentAmount is too low"
        );
    }
}
