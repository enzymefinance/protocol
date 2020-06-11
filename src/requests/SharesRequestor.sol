// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../dependencies/DSMath.sol";
import "../dependencies/TokenUser.sol";
import "../dependencies/token/IERC20.sol";
import "../dependencies/libs/EnumerableSet.sol";
import "../engine/AmguConsumer.sol";
import "../fund/hub/IHub.sol";
import "../fund/policies/IPolicyManager.sol";
import "../fund/shares/IShares.sol";
import "../prices/primitives/IPriceSource.sol";

/// @title SharesRequestor Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Entry point for users to buy shares in funds
contract SharesRequestor is DSMath, TokenUser, AmguConsumer {
    using EnumerableSet for EnumerableSet.AddressSet;

    event RequestCanceled (
        address indexed requestOwner,
        address indexed hub,
        uint256 investmentAmount,
        uint256 minSharesQuantity,
        uint256 createdTimestamp,
        uint256 incentiveFee
    );

    event RequestExecuted (
        address caller,
        address indexed requestOwner,
        address indexed hub,
        uint256 investmentAmount,
        uint256 minSharesQuantity,
        uint256 createdTimestamp,
        uint256 incentiveFee,
        uint256 sharesBought
    );

    event RequestCreated (
        address indexed requestOwner,
        address indexed hub,
        uint256 investmentAmount,
        uint256 minSharesQuantity,
        uint256 incentiveFee
    );

    struct Request {
        uint256 investmentAmount;
        uint256 minSharesQuantity;
        uint256 timestamp;
        uint256 incentiveFee;
    }

    uint256 constant private CANCELLATION_BUFFER = 1 hours;

    mapping (address => mapping(address => Request)) public ownerToRequestByFund;
    mapping (address => EnumerableSet.AddressSet) private ownerToFundsRequestedSet;

    /// @notice Assure that a hub address is valid
    modifier validHub(address _hub) {
        require(_hub != address(0), "validHub: _hub cannot be empty");
        require(REGISTRY.fundIsRegistered(_hub), "validHub: Fund does not exist");
        _;
    }

    constructor(address _registry) public AmguConsumer(_registry) {}

    // EXTERNAL

    // @dev Needed for Amgu / incentive
    receive() external payable {}

    /// @notice Cancels a shares request for a particular fund (for the sender)
    /// @param _hub The fund for which to cancel the request
    /// @dev See cancellation conditions in requestIsCancelable
    function cancelRequest(address _hub) external {
        require(
            requestIsCancelable(msg.sender, _hub),
            "__cancelRequestFor: No cancellation condition was met"
        );

        // Cancel the request
        Request memory request = ownerToRequestByFund[msg.sender][_hub];
        delete ownerToRequestByFund[msg.sender][_hub];
        EnumerableSet.remove(ownerToFundsRequestedSet[msg.sender], _hub);

        // Send incentive to caller and investment asset back to request owner
        msg.sender.transfer(request.incentiveFee);
        address denominationAsset = IShares(IHub(_hub).shares()).DENOMINATION_ASSET();

        __safeTransfer(denominationAsset, msg.sender, request.investmentAmount);

        emit RequestCanceled(
            msg.sender,
            _hub,
            request.investmentAmount,
            request.minSharesQuantity,
            request.timestamp,
            request.incentiveFee
        );
    }

    /// @notice Execute shares request for a particular fund (for a specified user)
    /// @param _requestOwner The owner of the pending shares request
    /// @param _hub The fund for which to execute the request
    function executeRequestFor(address _requestOwner, address _hub) external {
        (
            bool isExecutable,
            string memory notExecutableReason
        ) = requestIsExecutable(_requestOwner, _hub);
        require(isExecutable, string(abi.encodePacked("executeRequestFor:", notExecutableReason)));

        Request memory request = ownerToRequestByFund[_requestOwner][_hub];

        uint256 sharesBought = __validateAndBuyShares(
            _hub,
            _requestOwner,
            request.investmentAmount,
            request.minSharesQuantity
        );

        // Remove the Request
        delete ownerToRequestByFund[_requestOwner][_hub];
        EnumerableSet.remove(ownerToFundsRequestedSet[msg.sender], _hub);

        // Reward sender with incentive
        msg.sender.transfer(request.incentiveFee);

        emit RequestExecuted(
            msg.sender,
            _requestOwner,
            _hub,
            request.investmentAmount,
            request.minSharesQuantity,
            request.timestamp,
            request.incentiveFee,
            sharesBought
        );
    }

    /// @notice Execute pending shares requests for specified funds and users
    /// @param _requestOwners The owners of the pending shares requests
    /// @param _hubs The funds for which to execute the requests
    /// @param successes_ True for executed requests
    /// @dev Each index in the param and return arrays represents a single pending request
    function executeRequestsFor(address[] calldata _requestOwners, address[] calldata _hubs)
        external
        returns (bool[] memory successes_)
    {
        // Sanity checks
        require(_requestOwners.length > 0, "executeRequests: no requests input");
        require(
            _requestOwners.length == _hubs.length,
            "executeRequests: _requestOwners and _hubs must be same length"
        );

        // Execute requests
        for (uint256 i = 0; i < _requestOwners.length; i++) {
            try this.executeRequestFor(_requestOwners[i], _hubs[i]) {
                successes_[i] = true;
            }
            catch {}
        }
    }

    /// @notice Fetch fund addresses of all pending shares requests for a specified user
    /// @param _requestOwner The owner of the pending shares request
    /// @return An array of fund addresses
    function getFundsRequestedSet(address _requestOwner) external view returns (address[] memory) {
        return EnumerableSet.enumerate(ownerToFundsRequestedSet[_requestOwner]);
    }

    /// @notice Add a shares requests for the sender
    /// @param _hub The fund for which to buy shares
    /// @param _investmentAmount The amount of the fund's denomination asset with which to buy shares
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the specified _investmentAmount
    function requestShares(
        address _hub,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    )
        external
        payable
        validHub(_hub)
        amguPayableWithIncentive
    {
        // Sanity checks
        require(_hub != address(0), "requestShares: _hub cannot be empty");
        require(_investmentAmount > 0, "requestShares: _investmentAmount must be > 0");

        // State checks
        require(
            ownerToRequestByFund[msg.sender][_hub].timestamp == 0,
            "requestShares: Only one request can exist (per fund)"
        );
        require(
            __fundIsActive(_hub),
            "requestShares: Fund is not active"
        );
        address denominationAsset = IShares(IHub(_hub).shares()).DENOMINATION_ASSET();
        require(
            IERC20(denominationAsset).allowance(msg.sender, address(this)) >= _investmentAmount,
            "requestShares: Actual allowance is less than _investmentAmount"
        );

        // The initial investment in a fund can skip the request process and settle directly
        if (IERC20(IHub(_hub).shares()).totalSupply() == 0) {
            __safeTransferFrom(denominationAsset, msg.sender, address(this), _investmentAmount);
            __validateAndBuyShares(
                _hub,
                msg.sender,
                _investmentAmount,
                _minSharesQuantity
            );

            // Return incentive to sender
            msg.sender.transfer(REGISTRY.incentive());
        }
        // Create the Request and take custody of investment asset
        else {
            Request memory request = Request({
                investmentAmount: _investmentAmount,
                minSharesQuantity: _minSharesQuantity,
                timestamp: block.timestamp,
                incentiveFee: REGISTRY.incentive()
            });
            ownerToRequestByFund[msg.sender][_hub] = request;
            EnumerableSet.add(ownerToFundsRequestedSet[msg.sender], _hub);
            __safeTransferFrom(denominationAsset, msg.sender, address(this), _investmentAmount);

            emit RequestCreated(
                msg.sender,
                _hub,
                request.investmentAmount,
                request.minSharesQuantity,
                request.incentiveFee
            );
        }
    }

    // PUBLIC FUNCTIONS

    /// @notice Check if a specific shares request is cancelable
    /// @param _requestOwner The owner of the pending shares request
    /// @param _hub The fund for the pending shares request
    /// @return True if the shares request is cancelable
    /// @dev One of three conditions must be met:
    /// A) The fund is inactive
    /// B) An entire "validity interval" (the max time between price updates)
    /// has passed for the price feed since the request was made.
    /// C) The price feed has been updated since the request was made,
    /// and a "cancellation buffer" has passed since the update.
    /// This assures that requests older than the reasonable expected interval of price updates
    /// are always cancelable, while newer requests always have a buffer between
    /// price update and cancellation, which eliminates frontrunning attempts to essentially
    /// get free "call options" on share price.
    function requestIsCancelable(address _requestOwner, address _hub) public view returns (bool) {
        uint256 requestTimestamp = ownerToRequestByFund[_requestOwner][_hub].timestamp;
        require(requestTimestamp > 0, "requestIsCancelable: Request does not exist");

        // Fund is inactive
        if (!__fundIsActive(_hub)) return true;

        // Price feed's validity interval has expired
        IPriceSource priceSource = IPriceSource(REGISTRY.priceSource());
        if (now >= add(requestTimestamp, priceSource.VALIDITY_INTERVAL())) return true;

        // Cancellation buffer has passed after a price feed update
        uint256 lastPriceSourceUpdate = priceSource.lastUpdate();
        return requestTimestamp < lastPriceSourceUpdate &&
            now >= add(lastPriceSourceUpdate, CANCELLATION_BUFFER);
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
        if (request.timestamp == 0) reason_ = "Request does not exist";
        else if (!__fundIsActive(_hub)) reason_ = "Fund is not active";
        else if (request.timestamp >= IPriceSource(REGISTRY.priceSource()).lastUpdate()) {
            reason_ = "Price has not updated since request";
        }
        else {
            pass_ = true;
        }
    }

    // PRIVATE FUNCTIONS

    /// @notice Helper to check whether a fund is not shutdown and has been initialized
    function __fundIsActive(address _hub) private view returns (bool) {
        return IHub(_hub).status() == IHub.FundStatus.Active;
    }

    /// @notice Helper to buy shares from fund
    /// @dev Does not depend on the Request at all, so it can be used to bypass creating a request
    /// when the totalSupply of shares is 0
    function __validateAndBuyShares(
        address _hub,
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    )
        private
        returns (uint256 sharesBought_)
    {
        // Pre-validate against fund policies
        IPolicyManager policyManager = IPolicyManager(IHub(_hub).policyManager());
        // TODO: pass in all relevant values to buying shares
        policyManager.preValidate(
            bytes4(keccak256("buyShares(address,uint256,uint256)")),
            [_buyer, address(0), address(0), address(0), address(0)],
            [uint256(0), uint256(0), uint256(0)],
            bytes32(0)
        );

        // Buy the shares via Shares
        IShares shares = IShares(IHub(_hub).shares());
        __increaseApproval(
            shares.DENOMINATION_ASSET(),
            address(shares),
            _investmentAmount
        );
        sharesBought_ = shares.buyShares(_buyer, _investmentAmount, _minSharesQuantity);

        // Post-validate against fund policies
        // TODO: pass in all relevant values to buying shares
        policyManager.postValidate(
            bytes4(keccak256("buyShares(address,uint256,uint256)")),
            [_buyer, address(0), address(0), address(0), address(0)],
            [uint256(0), uint256(0), uint256(0)],
            bytes32(0)
        );
    }
}
