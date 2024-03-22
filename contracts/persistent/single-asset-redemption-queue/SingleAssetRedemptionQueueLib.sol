// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IERC20} from "../../external-interfaces/IERC20.sol";
import {GSNRecipientMixin} from "../../utils/0.8.19/gas-station-network/GSNRecipientMixin.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {Uint256ArrayLib} from "../../utils/0.8.19/Uint256ArrayLib.sol";
import {IGlobalConfig2} from "../global-config/interfaces/IGlobalConfig2.sol";
import {IVaultCore} from "../vault/interfaces/IVaultCore.sol";
import {ISingleAssetRedemptionQueue} from "./ISingleAssetRedemptionQueue.sol";

/// @title SingleAssetRedemptionQueueLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A release-agnostic peripheral contract for redeeming Enzyme vault shares for a single asset,
/// via a first-come first-served queue
contract SingleAssetRedemptionQueueLib is ISingleAssetRedemptionQueue, GSNRecipientMixin {
    using Address for address;
    using SafeERC20 for IERC20;
    using Uint256ArrayLib for uint256[];

    event BypassableSharesThresholdSet(uint256 nextSharesAmount);

    event Initialized(address indexed vaultProxy);

    event ManagerAdded(address indexed user);

    event ManagerRemoved(address indexed user);

    event Redeemed(uint256 indexed id, address indexed redemptionAsset, uint256 redemptionAssetAmount);

    event RedemptionAssetSet(IERC20 indexed asset);

    event RedemptionRequestAdded(uint256 indexed id, address indexed user, uint256 sharesAmount);

    event RequestBypassed(uint256 indexed id);

    event RequestWithdrawn(uint256 indexed id);

    event Shutdown();

    error AlreadyInitialized();

    error NotWithdrawable();

    error OutOfRange();

    error IsShutdown();

    error NotBypassable();

    error Unauthorized();

    error UndefinedVaultProxy();

    error ZeroShares();

    IGlobalConfig2 private immutable GLOBAL_CONFIG_CONTRACT;

    bool private isShutdown;
    address private vaultProxy;
    IERC20 private redemptionAsset;
    mapping(address => bool) private userToIsManager;

    // Queue
    uint256 private nextNewId;
    uint256 private nextQueuedId;
    uint256 private bypassableSharesThreshold;
    mapping(uint256 => uint256) private idToSharesAmount;
    mapping(uint256 => address) private idToUser;

    constructor(address _addressListRegistry, uint256 _gsnTrustedForwardersAddressListId, address _globalConfigProxy)
        GSNRecipientMixin(_addressListRegistry, _gsnTrustedForwardersAddressListId)
    {
        GLOBAL_CONFIG_CONTRACT = IGlobalConfig2(_globalConfigProxy);
    }

    /// @dev Pseudo-constructor to be called upon proxy deployment
    function init(
        address _vaultProxy,
        IERC20 _redemptionAsset,
        uint256 _bypassableSharesThreshold,
        address[] calldata _managers
    ) external override {
        if (getVaultProxy() != address(0)) {
            revert AlreadyInitialized();
        }

        if (_vaultProxy == address(0)) {
            revert UndefinedVaultProxy();
        }

        vaultProxy = _vaultProxy;

        __setBypassableSharesThreshold(_bypassableSharesThreshold);
        __addManagers(_managers);
        __setRedemptionAsset(_redemptionAsset);

        emit Initialized(_vaultProxy);
    }

    ///////////////
    // MODIFIERS //
    ///////////////

    modifier notShutdown() {
        if (queueIsShutdown()) {
            revert IsShutdown();
        }

        _;
    }

    modifier onlyManagerOrOwner() {
        address sender = __msgSender();
        bool authorized = isManager(sender) || __isFundOwner(sender);
        if (!authorized) {
            revert Unauthorized();
        }

        _;
    }

    modifier onlyOwner() {
        if (!__isFundOwner(__msgSender())) {
            revert Unauthorized();
        }

        _;
    }

    function __isFundOwner(address _who) private view returns (bool isOwner_) {
        return _who == IVaultCore(getVaultProxy()).getOwner();
    }

    ///////////////////////////
    // SHARES HOLDER ACTIONS //
    ///////////////////////////

    // @dev These functions are not gas-relayable, as they use msg.sender directly

    /// @notice Requests to join the queue for redeeming shares
    /// @param _sharesAmount The amount of shares to redeem
    /// @return id_ The id of the redemption request
    /// @dev Not gas-relayable
    function requestRedeem(uint256 _sharesAmount) external override notShutdown returns (uint256 id_) {
        if (_sharesAmount == 0) {
            revert ZeroShares();
        }

        address user = msg.sender;
        id_ = nextNewId++;

        // Add request to queue
        idToSharesAmount[id_] = _sharesAmount;
        idToUser[id_] = user;

        // Take shares from user
        IERC20(getVaultProxy()).safeTransferFrom(user, address(this), _sharesAmount);

        emit RedemptionRequestAdded(id_, user, _sharesAmount);
    }

    /// @notice Withdraws shares for a request that (a) has been bypassed or (b) remains post-shutdown
    /// @param _id The id of the request
    /// @dev Not gas-relayable
    function withdrawRequest(uint256 _id) external override {
        address user = getUserForRequest(_id);
        if (msg.sender != user) {
            revert Unauthorized();
        }

        bool withdrawable = queueIsShutdown() || _id < getNextQueuedId();
        if (!withdrawable) {
            revert NotWithdrawable();
        }

        uint256 sharesAmount = getSharesForRequest(_id);

        // Remove request
        __removeRedemptionRequest(_id);

        // Refund shares to user
        IERC20(getVaultProxy()).safeTransfer(user, sharesAmount);

        emit RequestWithdrawn(_id);
    }

    /// @dev Helper to remove (zero-out) a redemption request
    function __removeRedemptionRequest(uint256 _id) private {
        // Remove request
        delete idToSharesAmount[_id];
        delete idToUser[_id];
    }

    /////////////////////
    // MANAGER ACTIONS //
    /////////////////////

    /// @notice Redeems a range of requests from the queue
    /// @param _endId The final request id to fill in the range
    /// @param _idsToBypass The ids of requests to bypass
    /// @dev Inputting _endId instead of e.g., count, ensures intention for an exact range of requests
    function redeemFromQueue(uint256 _endId, uint256[] calldata _idsToBypass)
        external
        override
        notShutdown
        onlyManagerOrOwner
    {
        // Don't allow queue pointers to cross
        if (_endId >= getNextNewId()) {
            revert OutOfRange();
        }

        // Get current queue pointer and update its next storage
        uint256 startId = getNextQueuedId();
        nextQueuedId = _endId + 1;

        // Move requests into memory for processing
        uint256 usersToRedeemCount = _endId - startId + 1;
        address[] memory usersRedeemed = new address[](usersToRedeemCount);
        uint256[] memory sharesRedeemed = new uint256[](usersToRedeemCount);
        uint256 totalSharesRedeemed;
        for (uint256 id = startId; id <= _endId; id++) {
            uint256 index = id - startId; // Index for memory arrays

            uint256 sharesAmount = getSharesForRequest(id);

            if (_idsToBypass.contains(id)) {
                if (sharesAmount > getBypassableSharesThreshold()) {
                    revert NotBypassable();
                }

                emit RequestBypassed(id);

                continue;
            }

            address user = getUserForRequest(id);

            // Add request to redemption
            usersRedeemed[index] = user;
            sharesRedeemed[index] = sharesAmount;
            totalSharesRedeemed += sharesAmount;

            // Remove request from queue
            __removeRedemptionRequest(id);
        }

        // Redeem total shares for the redemption asset, received to this contract
        IERC20 redemptionAssetCopy = getRedemptionAsset();
        (address target, bytes memory payload) = GLOBAL_CONFIG_CONTRACT.formatSingleAssetRedemptionCall({
            _vaultProxy: getVaultProxy(),
            _recipient: address(this),
            _asset: address(redemptionAssetCopy),
            _amount: totalSharesRedeemed,
            _amountIsShares: true
        });
        target.functionCall(payload);

        // Disperse the redemption asset to the users pro-rata
        uint256 balanceToDisperse = redemptionAssetCopy.balanceOf(address(this));
        for (uint256 id = startId; id <= _endId; id++) {
            uint256 index = id - startId; // Index for memory arrays

            uint256 sharesAmount = sharesRedeemed[index];
            if (sharesAmount == 0) {
                // Skip bypassed request
                continue;
            }

            address user = usersRedeemed[index];
            uint256 userAmountToDisperse = balanceToDisperse * sharesAmount / totalSharesRedeemed;

            redemptionAssetCopy.safeTransfer(user, userAmountToDisperse);

            emit Redeemed(id, address(redemptionAssetCopy), userAmountToDisperse);
        }
    }

    /////////////////
    // OWNER CALLS //
    /////////////////

    /// @notice Adds managers
    /// @param _managers Managers to add
    function addManagers(address[] calldata _managers) external override onlyOwner {
        __addManagers(_managers);
    }

    /// @notice Removes managers
    /// @param _managers Managers to remove
    function removeManagers(address[] calldata _managers) external override onlyOwner {
        for (uint256 i; i < _managers.length; i++) {
            address manager = _managers[i];

            require(isManager(manager), "removeManagers: Not a manager");

            userToIsManager[manager] = false;

            emit ManagerRemoved(manager);
        }
    }

    /// @notice Sets the shares threshold for a single request to be bypassed in the queue
    /// @param _nextSharesThreshold The next shares amount threshold
    function setBypassableSharesThreshold(uint256 _nextSharesThreshold) external override onlyOwner {
        __setBypassableSharesThreshold(_nextSharesThreshold);
    }

    /// @notice Sets the asset received during redemptions
    /// @param _nextRedemptionAsset The asset
    function setRedemptionAsset(IERC20 _nextRedemptionAsset) external override onlyOwner {
        __setRedemptionAsset(_nextRedemptionAsset);
    }

    /// @notice Shuts down the redemption queue.
    /// Makes all requests withdrawable.
    function shutdown() external override onlyOwner {
        isShutdown = true;

        emit Shutdown();
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to add managers
    function __addManagers(address[] calldata _managers) private {
        for (uint256 i; i < _managers.length; i++) {
            address manager = _managers[i];

            require(!isManager(manager), "__addManagers: Already manager");

            userToIsManager[manager] = true;

            emit ManagerAdded(manager);
        }
    }

    /// @dev Helper to set the bypassableSharesThreshold
    function __setBypassableSharesThreshold(uint256 _nextSharesThreshold) private {
        bypassableSharesThreshold = _nextSharesThreshold;

        emit BypassableSharesThresholdSet(_nextSharesThreshold);
    }

    /// @dev Helper to set redemptionAsset
    function __setRedemptionAsset(IERC20 _nextRedemptionAsset) private {
        redemptionAsset = _nextRedemptionAsset;

        emit RedemptionAssetSet(_nextRedemptionAsset);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the max request size that a manager can bypass in the queue
    /// @return sharesAmount_ The max shares amount for a request to be bypass-able
    function getBypassableSharesThreshold() public view override returns (uint256 sharesAmount_) {
        return bypassableSharesThreshold;
    }

    /// @notice Gets the id of the next new request
    /// @return id_ The id
    function getNextNewId() public view override returns (uint256 id_) {
        return nextNewId;
    }

    /// @notice Gets the id of the next request from the queue to be redeemed
    /// @return id_ The id
    function getNextQueuedId() public view override returns (uint256 id_) {
        return nextQueuedId;
    }

    /// @notice Gets the asset received during redemptions
    /// @return asset_ The asset
    function getRedemptionAsset() public view override returns (IERC20 asset_) {
        return redemptionAsset;
    }

    /// @notice Gets the shares amount for a given request
    /// @param _id The id of the request
    /// @return sharesAmount_ The shares amount
    function getSharesForRequest(uint256 _id) public view override returns (uint256 sharesAmount_) {
        return idToSharesAmount[_id];
    }

    /// @notice Gets the user for a given request
    /// @param _id The id of the request
    /// @return user_ The user
    function getUserForRequest(uint256 _id) public view override returns (address user_) {
        return idToUser[_id];
    }

    /// @notice Gets the VaultProxy
    /// @return vaultProxy_ The vaultProxy value
    function getVaultProxy() public view override returns (address vaultProxy_) {
        return vaultProxy;
    }

    /// @notice Checks whether a user is a redemption manager
    /// @param _user The user to check
    /// @return isManager_ True if _user is a redemption manager
    function isManager(address _user) public view override returns (bool isManager_) {
        return userToIsManager[_user];
    }

    /// @notice Checks whether the queue has been shutdown
    /// @return isShutdown_ True if shutdown
    function queueIsShutdown() public view override returns (bool isShutdown_) {
        return isShutdown;
    }
}
