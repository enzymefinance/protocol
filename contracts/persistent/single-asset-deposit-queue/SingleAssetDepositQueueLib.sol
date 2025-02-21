// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";

import {IERC20} from "../../external-interfaces/IERC20.sol";
import {GSNRecipientMixin} from "../../utils/0.8.19/gas-station-network/GSNRecipientMixin.sol";
import {Uint256ArrayLib} from "../../utils/0.8.19/Uint256ArrayLib.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";

import {IAddressListRegistry} from "../address-list-registry/IAddressListRegistry.sol";
import {IGlobalConfig2} from "../global-config/interfaces/IGlobalConfig2.sol";
import {IVaultCore} from "../vault/interfaces/IVaultCore.sol";

import {ISingleAssetDepositQueue} from "./ISingleAssetDepositQueue.sol";

/// @title SingleAssetDepositQueueLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A release-agnostic peripheral contract for depositing asset to the Enzyme vault,
/// via a first-come first-served queue
contract SingleAssetDepositQueueLib is ISingleAssetDepositQueue, GSNRecipientMixin {
    using Address for address;
    using SafeERC20 for IERC20;
    using Uint256ArrayLib for uint256[];

    //==================================================================================================================
    // Events
    //==================================================================================================================

    /// @notice Emitted when a deposit to the Vault is made
    /// @param id The id of the deposit request
    /// @param sharesAmountReceived The amount of shares received by the user
    event Deposited(uint256 id, uint256 sharesAmountReceived);
    /// @notice Emitted when a depositor allowlist id is set
    /// @param depositorAllowlistId The new depositor allowlist id
    event DepositorAllowlistIdSet(uint64 depositorAllowlistId);
    /// @notice Emitted when a deposit request is added to the queue
    /// @param id The id of the deposit request
    /// @param user The user who made the request
    /// @param depositAssetAmount The amount of deposit asset requested
    event DepositRequestAdded(uint88 id, address user, uint128 depositAssetAmount, uint96 canCancelTime);
    /// @notice Emitted when the contract is initialized
    /// @param vaultProxy The address of the vault proxy
    /// @param depositAsset The address of the deposit asset
    event Initialized(address vaultProxy, IERC20 depositAsset);
    /// @notice Emitted when a manager is added
    /// @param user The address of the user added as a manager
    event ManagerAdded(address user);
    /// @notice Emitted when a manager is removed
    /// @param user The address of the user removed as a manager
    event ManagerRemoved(address user);
    /// @notice Emitted when the minDepositAssetAmount is set
    /// @param minDepositAssetAmount The new minDepositAssetAmount value
    event MinDepositAssetAmountSet(uint128 minDepositAssetAmount);
    /// @notice Emitted when the minRequestTime is set
    /// @param minRequestTime The new minRequestTime value
    event MinRequestTimeSet(uint64 minRequestTime);
    /// @notice Request bypassed
    /// @param id The id of the request
    event RequestBypassed(uint88 id);
    /// @notice Emitted when a deposit request is canceled
    /// @param id The id of the deposit request
    event RequestCanceled(uint88 id);
    /// @notice Emitted when the contract is shutdown
    event Shutdown();

    //==================================================================================================================
    // Errors
    //==================================================================================================================

    /// @notice Thrown when attempting to add a manager who is already a manager
    error SingleAssetDepositQueue__AddManager__AlreadyManager();
    /// @notice Thrown when the min request time has not elapsed, and the request cannot be canceled. This error can only occur when min request time is set to a value greater than 0
    error SingleAssetDepositQueue__CancelRequest__MinRequestTimeNotElapsed();
    /// @notice Thrown when the user tries to cancel a request that is not theirs
    error SingleAssetDepositQueue__CancelRequest__Unauthorized();
    /// @notice Thrown when attempting to deposit from a queue with an out-of-range end id
    error SingleAssetDepositQueue__DepositFromQueue__OutOfRange();
    /// @notice Thrown when attempting to initialize an already-initialized contract
    error SingleAssetDepositQueue__Init__AlreadyInitialized();
    /// @notice Thrown when attempting to initialize with an zero address vault proxy
    error SingleAssetDepositQueue__Init__UndefinedVaultProxy();
    /// @notice Thrown when the queue is already shutdown
    error SingleAssetDepositQueue__NotShutdown__Shutdown();
    /// @notice Thrown when trying to access a function that only managers or the owner can access
    error SingleAssetDepositQueue__OnlyManagerOrOwner__Unauthorized();
    /// @notice Thrown when trying to access a function that only the owner can access
    error SingleAssetDepositQueue__OnlyOwner__Unauthorized();
    /// @notice Thrown when attempting to remove a manager who is not a manager
    error SingleAssetDepositQueue__RemoveManager__NotManager();
    /// @notice Thrown when the deposit amount is zero
    error SingleAssetDepositQueue__RequestDeposit__DepositAmountEqualsToZero();
    /// @notice Thrown when the depositor is not allowlisted
    error SingleAssetDepositQueue__RequestDeposit__DepositorIsNotAllowlisted();
    /// @notice Thrown when the deposit request amount is less than the minimum amount allowed
    error SingleAssetDepositQueue__RequestDeposit__TooLowDepositAmount();

    /// @dev GlobalConfigProxy configuration contract address
    IGlobalConfig2 public immutable GLOBAL_CONFIG;
    /// @dev AddressListRegistry contract address
    IAddressListRegistry public immutable ADDRESS_LIST_REGISTRY;

    // slot 0
    /// @dev The id of the next request from the queue to be deposited.
    /// Goes only up, never down. If requests are bypassed they cannot by deposited to the vault, and have to be canceled.
    /// It could be uint96, but uint88 is used to keep consistency with the nextNewId.
    uint88 private nextQueuedId;
    /// @dev The address of the vault proxy
    address private vaultProxy;

    // slot 1
    /// @dev The asset to be deposited to the vault
    IERC20 private depositAsset;
    /// @dev Flag to mark the contract as shutdown
    bool private isShutdown;
    /// @dev The id of the next new request made to deposit assets.
    /// Every new request increments this id.
    uint88 private nextNewId;

    // slot 2
    /// @dev The listId of an AddressListRegistry list that restricts allowed depositors. Empty value allows any depositor.
    uint64 private depositorAllowlistId;
    /// @dev Minimum amount of deposit asset for each deposit request
    uint128 private minDepositAssetAmount;
    /// @dev The minimum time between a request and the ability to cancel it
    uint64 private minRequestTime;

    /// @dev Mapping of user to check if they are a manager
    mapping(address => bool) private userToIsManager;

    /// @dev Mapping of request id to request info
    mapping(uint256 => Request) private idToRequest;

    constructor(address _addressListRegistry, address _globalConfigProxy, uint256 _gsnTrustedForwardersAddressListId)
        GSNRecipientMixin(_addressListRegistry, _gsnTrustedForwardersAddressListId)
    {
        ADDRESS_LIST_REGISTRY = IAddressListRegistry(_addressListRegistry);
        GLOBAL_CONFIG = IGlobalConfig2(_globalConfigProxy);
    }

    /// @dev Pseudo-constructor to be called upon proxy deployment
    function init(
        address _vaultProxy,
        IERC20 _depositAsset,
        address[] calldata _managers,
        uint128 _minDepositAssetAmount,
        uint64 _minRequestTime,
        uint64 _depositorAllowlistId
    ) external {
        if (getVaultProxy() != address(0)) {
            revert SingleAssetDepositQueue__Init__AlreadyInitialized();
        }

        if (_vaultProxy == address(0)) {
            revert SingleAssetDepositQueue__Init__UndefinedVaultProxy();
        }

        vaultProxy = _vaultProxy;
        depositAsset = _depositAsset;

        __addManagers(_managers);
        __setMinDepositAssetAmount(_minDepositAssetAmount);
        __setMinRequestTime(_minRequestTime);
        __setDepositorAllowlistId(_depositorAllowlistId);

        emit Initialized(_vaultProxy, _depositAsset);
    }

    //==================================================================================================================
    // Modifiers
    //==================================================================================================================

    modifier notShutdown() {
        if (queueIsShutdown()) {
            revert SingleAssetDepositQueue__NotShutdown__Shutdown();
        }

        _;
    }

    modifier onlyManagerOrOwner() {
        address sender = __msgSender();
        bool authorized = isManager(sender) || __isFundOwner(sender);
        if (!authorized) {
            revert SingleAssetDepositQueue__OnlyManagerOrOwner__Unauthorized();
        }

        _;
    }

    modifier onlyOwner() {
        if (!__isFundOwner(__msgSender())) {
            revert SingleAssetDepositQueue__OnlyOwner__Unauthorized();
        }

        _;
    }

    function __isFundOwner(address _who) private view returns (bool isOwner_) {
        return _who == IVaultCore(getVaultProxy()).getOwner();
    }

    //==================================================================================================================
    // Shares holder actions
    //==================================================================================================================

    // @dev These functions are not gas-relayable, as they use msg.sender directly

    /// @notice Requests to join the queue for depositing assets
    /// @param _depositAssetAmount The amount of asset to deposit
    /// @return id_ The id of the deposit request
    /// @dev Not gas-relayable
    function requestDeposit(uint128 _depositAssetAmount) external notShutdown returns (uint88 id_) {
        if (_depositAssetAmount == 0) {
            revert SingleAssetDepositQueue__RequestDeposit__DepositAmountEqualsToZero();
        }

        if (_depositAssetAmount < getMinDepositAssetAmount()) {
            revert SingleAssetDepositQueue__RequestDeposit__TooLowDepositAmount();
        }

        address user = msg.sender;
        uint256 depositorAllowlistIdCopy = getDepositorAllowlistId();

        if (
            depositorAllowlistIdCopy != 0
                && !ADDRESS_LIST_REGISTRY.isInList({_id: depositorAllowlistIdCopy, _item: user})
        ) {
            revert SingleAssetDepositQueue__RequestDeposit__DepositorIsNotAllowlisted();
        }

        id_ = nextNewId++;

        uint96 canCancelTime = uint96(block.timestamp + getMinRequestTime());
        // Add request to queue
        idToRequest[id_] = Request({user: user, depositAssetAmount: _depositAssetAmount, canCancelTime: canCancelTime});

        // Take deposit asset from user
        getDepositAsset().safeTransferFrom(user, address(this), _depositAssetAmount);

        emit DepositRequestAdded(id_, user, _depositAssetAmount, canCancelTime);
    }

    /// @notice Cancels assets from a request
    /// @param _id The id of the request
    /// @dev Not gas-relayable
    function cancelRequest(uint88 _id) external {
        Request memory request = getRequest(_id);

        if (msg.sender != request.user) {
            revert SingleAssetDepositQueue__CancelRequest__Unauthorized();
        }

        // Only allowed in one of the following conditions:
        // - min request time has elapsed
        // - queue is shutdown
        // - request was bypassed
        if (!(block.timestamp >= request.canCancelTime || queueIsShutdown() || _id < getNextQueuedId())) {
            revert SingleAssetDepositQueue__CancelRequest__MinRequestTimeNotElapsed();
        }

        // Remove request
        __removeDepositRequest(_id);

        // Refund deposit asset to the user
        getDepositAsset().safeTransfer(request.user, request.depositAssetAmount);

        emit RequestCanceled(_id);
    }

    /// @dev Helper to remove (zero-out) a deposit request
    function __removeDepositRequest(uint88 _id) private {
        // Remove request
        delete idToRequest[_id];
    }

    //==================================================================================================================
    // Manager actions
    //==================================================================================================================

    /// @notice Deposits a range of requests from the queue
    /// @param _endId The final request id to fill in the range
    /// @param _idsToBypass The ids of requests to bypass
    /// @dev Inputting _endId instead of e.g., count, ensures intention for an exact range of requests
    function depositFromQueue(uint88 _endId, uint256[] calldata _idsToBypass) external notShutdown onlyManagerOrOwner {
        // Don't allow queue pointers to cross
        if (_endId >= getNextNewId()) {
            revert SingleAssetDepositQueue__DepositFromQueue__OutOfRange();
        }

        // Get current queue pointer and update its next storage
        uint88 startId = getNextQueuedId();
        nextQueuedId = _endId + 1;

        // Move requests into memory for processing
        uint256 totalAssetsDeposited;
        uint256 usersToDepositCount = _endId - startId + 1;
        address[] memory usersDeposited = new address[](usersToDepositCount);
        uint256[] memory assetsDeposited = new uint256[](usersToDepositCount);

        for (uint88 id = startId; id <= _endId; id++) {
            uint88 index = id - startId; // Index for memory arrays

            Request memory request = getRequest(id);
            // request.depositAssetAmount is 0 for canceled requests
            if (request.depositAssetAmount == 0) {
                continue;
            }

            if (_idsToBypass.contains(id)) {
                emit RequestBypassed(id);

                continue;
            }

            // Add request to deposit
            usersDeposited[index] = request.user;
            assetsDeposited[index] = request.depositAssetAmount;
            totalAssetsDeposited += request.depositAssetAmount;

            // Remove request from queue
            __removeDepositRequest(id);
        }

        IERC20 sharesTokenContract = IERC20(getVaultProxy());

        // Deposit total asset amount for the deposit asset, received to this contract
        IERC20 depositAssetCopy = getDepositAsset();
        // Scope used to avoid stack too deep error
        {
            (address target, bytes memory payload) = GLOBAL_CONFIG.formatDepositCall({
                _vaultProxy: address(sharesTokenContract),
                _depositAsset: address(depositAssetCopy),
                _depositAssetAmount: totalAssetsDeposited
            });
            // Approve the deposit target as necessary
            if (depositAssetCopy.allowance(address(this), target) == 0) {
                depositAssetCopy.safeApprove(target, type(uint256).max);
            }
            target.functionCall(payload);
        }

        // Disperse shares to the users pro-rata
        uint256 sharesBalanceToDisperse = sharesTokenContract.balanceOf(address(this));
        for (uint256 id = startId; id <= _endId; id++) {
            uint256 index = id - startId; // Index for memory arrays

            uint256 depositAssetAmount = assetsDeposited[index];
            if (depositAssetAmount == 0) {
                // Skip bypassed request
                continue;
            }

            uint256 userSharesAmountToDisperse = sharesBalanceToDisperse * depositAssetAmount / totalAssetsDeposited;

            // send shares to the user
            sharesTokenContract.safeTransfer(usersDeposited[index], userSharesAmountToDisperse);

            emit Deposited(id, userSharesAmountToDisperse);
        }
    }

    //==================================================================================================================
    // Owner calls
    //==================================================================================================================

    /// @notice Adds managers
    /// @param _managers Managers to add
    function addManagers(address[] calldata _managers) external onlyOwner {
        __addManagers(_managers);
    }

    /// @notice Removes managers
    /// @param _managers Managers to remove
    function removeManagers(address[] calldata _managers) external onlyOwner {
        for (uint256 i; i < _managers.length; i++) {
            address manager = _managers[i];

            if (!isManager(manager)) {
                revert SingleAssetDepositQueue__RemoveManager__NotManager();
            }

            userToIsManager[manager] = false;

            emit ManagerRemoved(manager);
        }
    }

    /// @notice Set min deposit amount
    /// @param _minDepositAssetAmount Min deposit amount to set
    function setMinDepositAssetAmount(uint128 _minDepositAssetAmount) external onlyOwner {
        __setMinDepositAssetAmount(_minDepositAssetAmount);
    }

    /// @notice Set min request time
    /// @param _minRequestTime Min request time to set
    function setMinRequestTime(uint64 _minRequestTime) external onlyOwner {
        __setMinRequestTime(_minRequestTime);
    }

    /// @notice Set Allowlisted depositors list id
    /// @param _depositorAllowlistId Allowlisted depositors list id to set
    function setDepositorAllowlistId(uint64 _depositorAllowlistId) external onlyOwner {
        __setDepositorAllowlistId(_depositorAllowlistId);
    }

    /// @notice Shuts down the deposit queue.
    function shutdown() external notShutdown onlyOwner {
        isShutdown = true;

        emit Shutdown();
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to add managers
    function __addManagers(address[] calldata _managers) private {
        for (uint256 i; i < _managers.length; i++) {
            address manager = _managers[i];

            if (isManager(manager)) {
                revert SingleAssetDepositQueue__AddManager__AlreadyManager();
            }

            userToIsManager[manager] = true;

            emit ManagerAdded(manager);
        }
    }

    /// @dev Helper to set min deposit amount
    function __setMinDepositAssetAmount(uint128 _minDepositAssetAmount) internal {
        minDepositAssetAmount = _minDepositAssetAmount;

        emit MinDepositAssetAmountSet(_minDepositAssetAmount);
    }

    /// @dev Helper to set min request time
    function __setMinRequestTime(uint64 _minRequestTime) internal {
        minRequestTime = _minRequestTime;

        emit MinRequestTimeSet(_minRequestTime);
    }

    /// @dev Helper to set Allowlisted depositors list id
    function __setDepositorAllowlistId(uint64 _depositorAllowlistId) internal {
        depositorAllowlistId = _depositorAllowlistId;

        emit DepositorAllowlistIdSet(_depositorAllowlistId);
    }

    //==================================================================================================================
    // State getters
    //==================================================================================================================

    /// @notice Gets the asset deposited during deposits
    /// @return asset_ The asset
    function getDepositAsset() public view returns (IERC20 asset_) {
        return depositAsset;
    }

    /// @notice Gets the id of the next new request
    /// @return id_ The id
    function getNextNewId() public view returns (uint88 id_) {
        return nextNewId;
    }

    /// @notice Gets the id of the next request from the queue to be deposited
    /// @return id_ The id
    function getNextQueuedId() public view returns (uint88 id_) {
        return nextQueuedId;
    }

    /// @notice Gets the request for a given id
    /// @param _id The id of the request
    /// @return request_ The request
    function getRequest(uint256 _id) public view returns (Request memory request_) {
        return idToRequest[_id];
    }

    /// @notice Gets the minDepositAssetAmount var
    /// @return minDepositAssetAmount_ The minDepositAssetAmount value
    function getMinDepositAssetAmount() public view returns (uint256 minDepositAssetAmount_) {
        return minDepositAssetAmount;
    }

    /// @notice Gets the minRequestTime var
    /// @return minRequestTime_ The minRequestTime value
    function getMinRequestTime() public view returns (uint64 minRequestTime_) {
        return minRequestTime;
    }

    /// @notice Gets the vaultProxy var
    /// @return vaultProxy_ The vaultProxy value
    function getVaultProxy() public view returns (address vaultProxy_) {
        return vaultProxy;
    }

    /// @notice Gets the depositorAllowlistId var
    /// @return depositorAllowlistId_ The depositorAllowlistId value
    function getDepositorAllowlistId() public view returns (uint256 depositorAllowlistId_) {
        return depositorAllowlistId;
    }

    /// @notice Checks whether a user is a deposit manager
    /// @param _user The user to check
    /// @return isManager_ True if _user is a deposit manager
    function isManager(address _user) public view returns (bool isManager_) {
        return userToIsManager[_user];
    }

    /// @notice Checks whether the queue has been shutdown
    /// @return isShutdown_ True if shutdown
    function queueIsShutdown() public view returns (bool isShutdown_) {
        return isShutdown;
    }
}
