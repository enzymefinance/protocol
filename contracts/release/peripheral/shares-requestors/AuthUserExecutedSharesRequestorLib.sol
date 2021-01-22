// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../core/fund/comptroller/ComptrollerLib.sol";
import "../../core/fund/vault/VaultLib.sol";
import "./IAuthUserExecutedSharesRequestor.sol";

/// @title AuthUserExecutedSharesRequestorLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Provides the logic for AuthUserExecutedSharesRequestorProxy instances,
/// in which shares requests are manually executed by a permissioned user
/// @dev This will not work with a `denominationAsset` that does not transfer
/// the exact expected amount or has an elastic supply.
contract AuthUserExecutedSharesRequestorLib is IAuthUserExecutedSharesRequestor {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    event RequestCanceled(
        address indexed requestOwner,
        uint256 investmentAmount,
        uint256 minSharesQuantity
    );

    event RequestCreated(
        address indexed requestOwner,
        uint256 investmentAmount,
        uint256 minSharesQuantity
    );

    event RequestExecuted(
        address indexed caller,
        address indexed requestOwner,
        uint256 investmentAmount,
        uint256 minSharesQuantity
    );

    event RequestExecutorAdded(address indexed account);

    event RequestExecutorRemoved(address indexed account);

    struct RequestInfo {
        uint256 investmentAmount;
        uint256 minSharesQuantity;
    }

    uint256 private constant CANCELLATION_COOLDOWN_TIMELOCK = 10 minutes;

    address private comptrollerProxy;
    address private denominationAsset;
    address private fundOwner;

    mapping(address => RequestInfo) private ownerToRequestInfo;
    mapping(address => bool) private acctToIsRequestExecutor;
    mapping(address => uint256) private ownerToLastRequestCancellation;

    modifier onlyFundOwner() {
        require(msg.sender == fundOwner, "Only fund owner callable");
        _;
    }

    /// @notice Initializes a proxy instance that uses this library
    /// @dev Serves as a per-proxy pseudo-constructor
    function init(address _comptrollerProxy) external override {
        require(comptrollerProxy == address(0), "init: Already initialized");

        comptrollerProxy = _comptrollerProxy;

        // Cache frequently-used values that require external calls
        ComptrollerLib comptrollerProxyContract = ComptrollerLib(_comptrollerProxy);
        denominationAsset = comptrollerProxyContract.getDenominationAsset();
        fundOwner = VaultLib(comptrollerProxyContract.getVaultProxy()).getOwner();
    }

    /// @notice Cancels the shares request of the caller
    function cancelRequest() external {
        RequestInfo memory request = ownerToRequestInfo[msg.sender];
        require(request.investmentAmount > 0, "cancelRequest: Request does not exist");

        // Delete the request, start the cooldown period, and return the investment asset
        delete ownerToRequestInfo[msg.sender];
        ownerToLastRequestCancellation[msg.sender] = block.timestamp;
        ERC20(denominationAsset).safeTransfer(msg.sender, request.investmentAmount);

        emit RequestCanceled(msg.sender, request.investmentAmount, request.minSharesQuantity);
    }

    /// @notice Creates a shares request for the caller
    /// @param _investmentAmount The amount of the fund's denomination asset to use to buy shares
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the _investmentAmount
    function createRequest(uint256 _investmentAmount, uint256 _minSharesQuantity) external {
        require(_investmentAmount > 0, "createRequest: _investmentAmount must be > 0");
        require(
            ownerToRequestInfo[msg.sender].investmentAmount == 0,
            "createRequest: The request owner can only create one request before executed or canceled"
        );
        require(
            ownerToLastRequestCancellation[msg.sender] <
                block.timestamp.sub(CANCELLATION_COOLDOWN_TIMELOCK),
            "createRequest: Cannot create request during cancellation cooldown period"
        );

        // Create the Request and take custody of investment asset
        ownerToRequestInfo[msg.sender] = RequestInfo({
            investmentAmount: _investmentAmount,
            minSharesQuantity: _minSharesQuantity
        });
        ERC20(denominationAsset).safeTransferFrom(msg.sender, address(this), _investmentAmount);

        emit RequestCreated(msg.sender, _investmentAmount, _minSharesQuantity);
    }

    /// @notice Executes multiple shares requests
    /// @param _requestOwners The owners of the pending shares requests
    function executeRequests(address[] calldata _requestOwners) external {
        require(
            msg.sender == fundOwner || isRequestExecutor(msg.sender),
            "executeRequests: Invalid caller"
        );
        require(_requestOwners.length > 0, "executeRequests: _requestOwners can not be empty");

        (
            address[] memory buyers,
            uint256[] memory investmentAmounts,
            uint256[] memory minSharesQuantities,
            uint256 totalInvestmentAmount
        ) = __convertRequestsToBuySharesParams(_requestOwners);

        // Since ComptrollerProxy instances are fully trusted,
        // we can approve them with the max amount of the denomination asset,
        // and only top the approval back to max if ever necessary.
        address comptrollerProxyCopy = comptrollerProxy;
        ERC20 denominationAssetContract = ERC20(denominationAsset);
        if (
            denominationAssetContract.allowance(address(this), comptrollerProxyCopy) <
            totalInvestmentAmount
        ) {
            denominationAssetContract.safeApprove(comptrollerProxyCopy, type(uint256).max);
        }

        ComptrollerLib(comptrollerProxyCopy).buyShares(
            buyers,
            investmentAmounts,
            minSharesQuantities
        );
    }

    /// @dev Helper to convert raw shares requests into the format required by buyShares().
    /// It also removes any empty requests, which is necessary to prevent a DoS attack where a user
    /// cancels their request earlier in the same block (can be repeated from multiple accounts).
    /// This function also removes shares requests and fires success events as it loops through them.
    function __convertRequestsToBuySharesParams(address[] memory _requestOwners)
        private
        returns (
            address[] memory buyers_,
            uint256[] memory investmentAmounts_,
            uint256[] memory minSharesQuantities_,
            uint256 totalInvestmentAmount_
        )
    {
        uint256 existingRequestsCount = _requestOwners.length;
        uint256[] memory allInvestmentAmounts = new uint256[](_requestOwners.length);

        // Loop through once to get the count of existing requests
        for (uint256 i; i < _requestOwners.length; i++) {
            allInvestmentAmounts[i] = ownerToRequestInfo[_requestOwners[i]].investmentAmount;

            if (allInvestmentAmounts[i] == 0) {
                existingRequestsCount--;
            }
        }

        // Loop through a second time to format requests for buyShares(),
        // and to delete the requests and emit events early so no further looping is needed.
        buyers_ = new address[](existingRequestsCount);
        investmentAmounts_ = new uint256[](existingRequestsCount);
        minSharesQuantities_ = new uint256[](existingRequestsCount);
        uint256 existingRequestsIndex;
        for (uint256 i; i < _requestOwners.length; i++) {
            if (allInvestmentAmounts[i] == 0) {
                continue;
            }

            buyers_[existingRequestsIndex] = _requestOwners[i];
            investmentAmounts_[existingRequestsIndex] = allInvestmentAmounts[i];
            minSharesQuantities_[existingRequestsIndex] = ownerToRequestInfo[_requestOwners[i]]
                .minSharesQuantity;
            totalInvestmentAmount_ = totalInvestmentAmount_.add(allInvestmentAmounts[i]);

            delete ownerToRequestInfo[_requestOwners[i]];

            emit RequestExecuted(
                msg.sender,
                buyers_[existingRequestsIndex],
                investmentAmounts_[existingRequestsIndex],
                minSharesQuantities_[existingRequestsIndex]
            );

            existingRequestsIndex++;
        }

        return (buyers_, investmentAmounts_, minSharesQuantities_, totalInvestmentAmount_);
    }

    ///////////////////////////////
    // REQUEST EXECUTOR REGISTRY //
    ///////////////////////////////

    /// @notice Adds accounts to request executors
    /// @param _requestExecutors Accounts to add
    function addRequestExecutors(address[] calldata _requestExecutors) external onlyFundOwner {
        require(_requestExecutors.length > 0, "addRequestExecutors: Empty _requestExecutors");

        for (uint256 i; i < _requestExecutors.length; i++) {
            require(
                !isRequestExecutor(_requestExecutors[i]),
                "addRequestExecutors: Value already set"
            );
            require(
                _requestExecutors[i] != fundOwner,
                "addRequestExecutors: The fund owner cannot be added"
            );

            acctToIsRequestExecutor[_requestExecutors[i]] = true;

            emit RequestExecutorAdded(_requestExecutors[i]);
        }
    }

    /// @notice Removes accounts from request executors
    /// @param _requestExecutors Accounts to remove
    function removeRequestExecutors(address[] calldata _requestExecutors) external onlyFundOwner {
        require(_requestExecutors.length > 0, "removeRequestExecutors: Empty _requestExecutors");

        for (uint256 i; i < _requestExecutors.length; i++) {
            require(
                isRequestExecutor(_requestExecutors[i]),
                "removeRequestExecutors: Account is not a request executor"
            );

            acctToIsRequestExecutor[_requestExecutors[i]] = false;

            emit RequestExecutorRemoved(_requestExecutors[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the value of `comptrollerProxy` variable
    /// @return comptrollerProxy_ The `comptrollerProxy` variable value
    function getComptrollerProxy() external view returns (address comptrollerProxy_) {
        return comptrollerProxy;
    }

    /// @notice Gets the value of `denominationAsset` variable
    /// @return denominationAsset_ The `denominationAsset` variable value
    function getDenominationAsset() external view returns (address denominationAsset_) {
        return denominationAsset;
    }

    /// @notice Gets the value of `fundOwner` variable
    /// @return fundOwner_ The `fundOwner` variable value
    function getFundOwner() external view returns (address fundOwner_) {
        return fundOwner;
    }

    /// @notice Gets the request info of a user
    /// @param _requestOwner The address of the user that creates the request
    /// @return requestInfo_ The request info created by the user
    function getSharesRequestInfoForOwner(address _requestOwner)
        external
        view
        returns (RequestInfo memory requestInfo_)
    {
        return ownerToRequestInfo[_requestOwner];
    }

    /// @notice Checks whether an account is a request executor
    /// @param _who The account to check
    /// @return isRequestExecutor_ True if _who is a request executor
    function isRequestExecutor(address _who) public view returns (bool isRequestExecutor_) {
        return acctToIsRequestExecutor[_who];
    }
}
