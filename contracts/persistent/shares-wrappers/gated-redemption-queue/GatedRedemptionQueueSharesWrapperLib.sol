// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solc-0.6/utils/Address.sol";
import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import "openzeppelin-solc-0.6/utils/SafeCast.sol";
import "../../../external-interfaces/IWETH.sol";
import "../../global-config/interfaces/IGlobalConfig2.sol";
import "../../vault/interfaces/IVaultCore.sol";
import "./bases/GatedRedemptionQueueSharesWrapperLibBase1.sol";

/// @title GatedRedemptionQueueSharesWrapperLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A release-agnostic ERC20 wrapper for Enzyme vault shares that facilitates queued,
/// single-asset redemptions, as well as misc participation controls
/// @dev Holders of these wrapped shares must fully trust the vault `owner`,
/// who can appropriate their full value
contract GatedRedemptionQueueSharesWrapperLib is GatedRedemptionQueueSharesWrapperLibBase1 {
    using Address for address;
    using SafeCast for uint256;
    using SafeERC20 for ERC20;

    address private constant NATIVE_ASSET = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 private constant ONE_HUNDRED_PERCENT = 1e18;

    IGlobalConfig2 private immutable GLOBAL_CONFIG_CONTRACT;
    address private immutable THIS_LIB;
    IWETH private immutable WRAPPED_NATIVE_ASSET_CONTRACT;

    constructor(address _globalConfigProxy, address _wrappedNativeAsset)
        public
        ERC20("Wrapped Enzyme Shares Lib", "wENZF-lib")
    {
        GLOBAL_CONFIG_CONTRACT = IGlobalConfig2(_globalConfigProxy);
        THIS_LIB = address(this);
        WRAPPED_NATIVE_ASSET_CONTRACT = IWETH(_wrappedNativeAsset);
    }

    /// @dev Needed to unwrap from WRAPPED_NATIVE_ASSET_CONTRACT
    receive() external payable {}

    /// @notice Initializes a proxy instance
    /// @param _vaultProxy The VaultProxy that will have its shares wrapped
    /// @param _managers Users to give the role of manager for the wrapper
    /// @param _redemptionAsset The asset to receive during shares redemptions
    /// @param _useDepositApprovals True if deposit pre-approvals are required
    /// @param _useRedemptionApprovals True if the redemption request pre-approvals are required
    /// @param _useTransferApprovals True if shares transfer pre-approvals are required
    /// @param _depositMode The mode to follow for deposits
    /// @param _windowConfig Initial redemption window configuration
    /// @dev The following vars initialize to their default value as they were added after the 1st version:
    /// - `depositMode`
    function init(
        address _vaultProxy,
        address[] calldata _managers,
        address _redemptionAsset,
        bool _useDepositApprovals,
        bool _useRedemptionApprovals,
        bool _useTransferApprovals,
        DepositMode _depositMode,
        RedemptionWindowConfig calldata _windowConfig
    ) external override {
        require(vaultProxy == address(0), "init: Initialized");

        vaultProxy = _vaultProxy;

        __addManagers(_managers);
        __setRedemptionAsset(_redemptionAsset);
        __setUseDepositApprovals(_useDepositApprovals);
        __setUseRedemptionApprovals(_useRedemptionApprovals);
        __setUseTransferApprovals(_useTransferApprovals);
        __setDepositMode(_depositMode);
        __setRedemptionWindowConfig(_windowConfig);

        emit Initialized(_vaultProxy);
    }

    ///////////////
    // MODIFIERS //
    ///////////////

    // Functions instead of modifiers, as this is bumping up against contract size limit

    function __onlyManagerOrOwner() private view {
        if (!isManager(msg.sender)) {
            __onlyOwner();
        }
    }

    function __onlyOwner() private view {
        require(msg.sender == IVaultCore(getVaultProxy()).getOwner(), "Unauthorized");
    }

    /////////////////////
    // ERC20 OVERRIDES //
    /////////////////////

    /// @notice Gets the name of the wrapped shares token
    /// @return name_ The name
    function name() public view override returns (string memory name_) {
        if (address(this) == THIS_LIB) {
            return super.name();
        }

        return string(abi.encodePacked("Wrapped ", ERC20(getVaultProxy()).name()));
    }

    /// @notice Gets the symbol of the wrapped shares token
    /// @return symbol_ The symbol
    function symbol() public view override returns (string memory symbol_) {
        if (address(this) == THIS_LIB) {
            return super.symbol();
        }

        return string(abi.encodePacked("w", ERC20(getVaultProxy()).symbol()));
    }

    /// @notice Gets the number of decimals of the wrapped shares token
    /// @return decimals_ The number of decimals
    function decimals() public view override returns (uint8 decimals_) {
        return 18;
    }

    /// @notice Standard implementation of ERC20's transfer() with additional validations
    function transfer(address _recipient, uint256 _amount) public override returns (bool success_) {
        __preProcessTransfer({_sender: msg.sender, _recipient: _recipient, _amount: _amount});

        return super.transfer(_recipient, _amount);
    }

    /// @notice Standard implementation of ERC20's transferFrom() with additional validations
    function transferFrom(address _sender, address _recipient, uint256 _amount)
        public
        override
        returns (bool success_)
    {
        __preProcessTransfer({_sender: _sender, _recipient: _recipient, _amount: _amount});

        return super.transferFrom(_sender, _recipient, _amount);
    }

    /// @dev Helper to validate transfer
    function __preProcessTransfer(address _sender, address _recipient, uint256 _amount) private {
        require(
            _amount <= balanceOf(_sender).sub(redemptionQueue.userToRequest[_sender].sharesPending),
            "__preProcessTransfer: In redemption queue"
        );

        if (transferApprovalsAreUsed()) {
            uint256 transferApproval = getTransferApproval({_sender: _sender, _recipient: _recipient});

            if (transferApproval != type(uint256).max) {
                require(transferApproval == _amount, "__preProcessTransfer: Approval mismatch");

                delete userToRecipientToTransferApproval[_sender][_recipient];
            }
        }
    }

    /////////////////////////////////////////////////
    // SUBSCRIPTION ACTIONS - DEPOSITOR - DEPOSITS //
    /////////////////////////////////////////////////

    // DepositMode.Direct

    /// @notice Deposits an asset to mint wrapped Enzyme vault shares
    /// @param _depositAsset The asset to deposit
    /// @param _depositAssetAmount The amount of the asset to deposit
    /// @param _minSharesAmount The min shares to mint
    /// @return sharesReceived_ The amount of wrapped shares received
    /// @dev Does not support deposits in fee-on-transfer tokens.
    /// Can specify _depositAsset == NATIVE_ASSET to wrap and deposit native asset.
    function deposit(address _depositAsset, uint256 _depositAssetAmount, uint256 _minSharesAmount)
        external
        payable
        nonReentrant
        returns (uint256 sharesReceived_)
    {
        require(getDepositMode() == DepositMode.Direct, "deposit: Wrong mode");

        _depositAsset =
            __preDeposit({_depositAssetOrNativeAsset: _depositAsset, _depositAssetAmount: _depositAssetAmount});

        sharesReceived_ = __depositToVault({_depositAsset: _depositAsset, _depositAssetAmount: _depositAssetAmount});
        require(sharesReceived_ >= _minSharesAmount, "deposit: Insufficient shares");

        // Mint wrapped shares for the actual shares received
        _mint(msg.sender, sharesReceived_);

        emit Deposited(msg.sender, _depositAsset, _depositAssetAmount, sharesReceived_);

        return sharesReceived_;
    }

    // DepositMode.Request

    /// @notice Cancels the caller's deposit request for a given deposit asset
    /// @param _depositAsset The deposit asset
    /// @dev Can specify _depositAsset == NATIVE_ASSET to unwrap and receive native asset
    function cancelRequestDeposit(address _depositAsset) external {
        bool refundNativeAsset;
        if (_depositAsset == NATIVE_ASSET) {
            refundNativeAsset = true;

            _depositAsset = address(WRAPPED_NATIVE_ASSET_CONTRACT);
        }

        uint256 depositAssetAmount =
            getDepositQueueUserRequest({_depositAsset: _depositAsset, _user: msg.sender}).assetAmount;

        __removeDepositRequest({_user: msg.sender, _depositAsset: _depositAsset});

        if (refundNativeAsset) {
            WRAPPED_NATIVE_ASSET_CONTRACT.withdraw(depositAssetAmount);

            Address.sendValue({recipient: msg.sender, amount: depositAssetAmount});
        } else {
            ERC20(_depositAsset).safeTransfer(msg.sender, depositAssetAmount);
        }
    }

    /// @notice Requests to deposit an asset to mint wrapped Enzyme vault shares
    /// @param _depositAsset The asset to deposit
    /// @param _depositAssetAmount The amount of the asset to deposit
    /// @dev Can specify _depositAsset == NATIVE_ASSET to wrap and deposit native asset
    function requestDeposit(address _depositAsset, uint256 _depositAssetAmount) external payable {
        require(getDepositMode() == DepositMode.Request, "requestDeposit: Wrong mode");
        // Require amount >0 so we can assume a DepositRequest with amount =0 means empty
        require(_depositAssetAmount > 0, "requestDeposit: Missing amount");

        _depositAsset =
            __preDeposit({_depositAssetOrNativeAsset: _depositAsset, _depositAssetAmount: _depositAssetAmount});

        DepositQueue storage queue = depositAssetToQueue[_depositAsset];
        DepositRequest storage request = queue.userToRequest[msg.sender];

        uint256 nextDepositAmount;
        if (request.assetAmount > 0) {
            nextDepositAmount = uint256(request.assetAmount).add(_depositAssetAmount);
        } else {
            // New request

            nextDepositAmount = _depositAssetAmount;

            // Set index before pushing to queue to rely on length
            request.index = uint64(queue.users.length);
            queue.users.push(msg.sender);
        }

        // Set the new user request amount
        request.assetAmount = nextDepositAmount.toUint128();

        emit DepositRequestAdded(msg.sender, _depositAsset, _depositAssetAmount);
    }

    // PRIVATE HELPERS

    /// @dev Helper to deposit an asset from this contract to the vault
    function __depositToVault(address _depositAsset, uint256 _depositAssetAmount)
        private
        returns (uint256 sharesReceived_)
    {
        // Checkpoint redemption queue relativeSharesAllowed before changing the shares supply
        if (__isInLatestRedemptionWindow(block.timestamp)) {
            __checkpointRelativeSharesAllowed();
        }

        ERC20 sharesTokenContract = ERC20(getVaultProxy());
        uint256 preSharesBal = sharesTokenContract.balanceOf(address(this));

        // Format the call to deposit for shares
        (address depositTarget, bytes memory depositPayload) = GLOBAL_CONFIG_CONTRACT.formatDepositCall({
            _vaultProxy: address(sharesTokenContract),
            _depositAsset: _depositAsset,
            _depositAssetAmount: _depositAssetAmount
        });

        // Approve the deposit target as necessary
        if (ERC20(_depositAsset).allowance(address(this), depositTarget) == 0) {
            ERC20(_depositAsset).safeApprove(depositTarget, type(uint256).max);
        }

        // Deposit and receive shares
        depositTarget.functionCall(depositPayload);

        // Calculate the actual shares received
        return sharesTokenContract.balanceOf(address(this)).sub(preSharesBal);
    }

    /// @dev Helper to perform pre-deposit actions
    function __preDeposit(address _depositAssetOrNativeAsset, uint256 _depositAssetAmount)
        private
        returns (address depositAsset_)
    {
        // Handle deposit asset
        if (_depositAssetOrNativeAsset == NATIVE_ASSET) {
            depositAsset_ = address(WRAPPED_NATIVE_ASSET_CONTRACT);

            require(_depositAssetAmount == msg.value, "__preDeposit: msg.value mismatch");

            WRAPPED_NATIVE_ASSET_CONTRACT.deposit{value: _depositAssetAmount}();
        } else {
            require(msg.value == 0, "__preDeposit: Non-zero msg.value");

            depositAsset_ = _depositAssetOrNativeAsset;

            ERC20(depositAsset_).safeTransferFrom(msg.sender, address(this), _depositAssetAmount);
        }
        // After this point, whether the native asset was deposited is irrelevant

        // Handle deposit approval
        if (depositApprovalsAreUsed()) {
            uint256 depositApproval = getDepositApproval({_user: msg.sender, _asset: depositAsset_});

            // If deposit approval is not max, validate and remove exact approval
            if (depositApproval != type(uint256).max) {
                require(depositApproval == _depositAssetAmount, "__preDeposit: Approval mismatch");
                delete userToAssetToDepositApproval[msg.sender][depositAsset_];
            }
        }

        return depositAsset_;
    }

    /// @dev Helper to remove a deposit request from the queue
    function __removeDepositRequest(address _user, address _depositAsset) private {
        DepositQueue storage queue = depositAssetToQueue[_depositAsset];

        // Validate that a request exists for the _user
        require(queue.userToRequest[_user].assetAmount > 0, "__removeDepositRequest: No request");

        uint256 userIndex = queue.userToRequest[_user].index;
        uint256 queueLength = queue.users.length;

        if (userIndex < queueLength - 1) {
            address userToMove = queue.users[queueLength - 1];

            queue.users[userIndex] = userToMove;
            queue.userToRequest[userToMove].index = uint64(userIndex);
        }

        delete queue.userToRequest[_user];
        queue.users.pop();

        emit DepositRequestRemoved(_user, _depositAsset);
    }

    ///////////////////////////////////////////////
    // SUBSCRIPTION ACTIONS - MANAGER - DEPOSITS //
    ///////////////////////////////////////////////

    /// @notice Deposits for all requests in the queue
    /// @param _depositAsset The deposit asset of the requests
    /// @return users_ The ordered users deposited
    /// @return userSharesReceived_ The shares received per users_
    function depositAllFromQueue(address _depositAsset)
        external
        returns (address[] memory users_, uint256[] memory userSharesReceived_)
    {
        // Enumerate the users array from the queue end, for more performant request removals
        DepositQueue memory queue = depositAssetToQueue[_depositAsset];
        uint256 queueLength = queue.users.length;
        users_ = new address[](queueLength);
        for (uint256 i; i < queueLength; i++) {
            users_[i] = queue.users[queueLength - 1 - i];
        }

        userSharesReceived_ = __depositFromQueue({_depositAsset: _depositAsset, _users: users_});

        return (users_, userSharesReceived_);
    }

    /// @notice Deposits for specified requests in the queue
    /// @param _depositAsset The deposit asset of the requests
    /// @param _users The users of the requests
    /// @return userSharesReceived_ The shares received per _users
    /// @dev Unlike the redemption queue, there is no deposit window during which deposit requests are frozen.
    /// Since these requests are fluid, the manager can't rely on the queue's `users` array ordering,
    /// so user addresses are used as an input instead of request indexes.
    function depositFromQueue(address _depositAsset, address[] memory _users)
        external
        returns (uint256[] memory userSharesReceived_)
    {
        return __depositFromQueue({_depositAsset: _depositAsset, _users: _users});
    }

    /// @dev Helper to deposit users from the queue
    function __depositFromQueue(address _depositAsset, address[] memory _users)
        private
        nonReentrant
        returns (uint256[] memory userSharesReceived_)
    {
        __onlyManagerOrOwner();

        // Tally the request deposit amounts and remove the requests
        uint256 usersCount = _users.length;
        uint256[] memory userDepositAmounts = new uint256[](usersCount);
        userSharesReceived_ = new uint256[](usersCount);
        uint256 totalDepositAmount;
        for (uint256 i; i < usersCount; i++) {
            address user = _users[i];
            uint256 userDepositAmount = depositAssetToQueue[_depositAsset].userToRequest[user].assetAmount;

            userDepositAmounts[i] = userDepositAmount;
            totalDepositAmount = totalDepositAmount.add(userDepositAmount);

            __removeDepositRequest({_user: user, _depositAsset: _depositAsset});
        }

        // Deposit the total amount to the vault
        uint256 totalSharesReceived =
            __depositToVault({_depositAsset: _depositAsset, _depositAssetAmount: totalDepositAmount});

        // Distribute wrapped shares pro-rata to depositors
        for (uint256 i; i < _users.length; i++) {
            address user = _users[i];
            uint256 userDepositAmount = userDepositAmounts[i];

            // Flooring each user's pro-rata shares potentially leaves unwrapped vault shares dust,
            // but since it is an insignificant amount, that dust is not dealt with
            uint256 userSharesReceived = totalSharesReceived.mul(userDepositAmount).div(totalDepositAmount);
            userSharesReceived_[i] = userSharesReceived;

            // Mint wrapped shares for the actual shares received
            _mint(user, userSharesReceived);

            emit Deposited(user, _depositAsset, userDepositAmount, userSharesReceived);
        }

        return userSharesReceived_;
    }

    ////////////////////////////////////////////////////
    // SUBSCRIPTION ACTIONS - DEPOSITOR - REDEMPTIONS //
    ////////////////////////////////////////////////////

    /// @notice Cancels the caller's redemption request
    function cancelRequestRedeem() external nonReentrant {
        require(!__isInLatestRedemptionWindow(block.timestamp), "cancelRequestRedeem: Inside redemption window");

        RedemptionQueue storage queue = redemptionQueue;
        uint256 userSharesPending = queue.userToRequest[msg.sender].sharesPending;
        require(userSharesPending > 0, "cancelRequestRedeem: No request");

        // Remove user from queue
        queue.totalSharesPending = uint256(queue.totalSharesPending).sub(userSharesPending).toUint128();

        __removeRedemptionRequest({_user: msg.sender, _queueLength: queue.users.length});
    }

    /// @notice Requests to join the queue for redeeming wrapped shares
    /// @param _sharesAmount The amount of shares to add to the queue
    /// @dev Each request is additive
    function requestRedeem(uint256 _sharesAmount) external nonReentrant {
        require(!__isInLatestRedemptionWindow(block.timestamp), "requestRedeem: Inside redemption window");

        // Validate user redemption approval and revoke remaining approval
        if (redemptionApprovalsAreUsed()) {
            uint256 redemptionApproval = getRedemptionApproval(msg.sender);

            if (redemptionApproval != type(uint256).max) {
                require(_sharesAmount <= redemptionApproval, "requestRedeem: Exceeds approval");
                delete userToRedemptionApproval[msg.sender];
            }
        }

        RedemptionQueue storage queue = redemptionQueue;
        RedemptionRequest storage request = queue.userToRequest[msg.sender];

        uint256 nextTotalSharesPending = uint256(queue.totalSharesPending).add(_sharesAmount);
        uint256 nextUserSharesPending = uint256(request.sharesPending).add(_sharesAmount);

        // Validate user has enough balance
        require(nextUserSharesPending <= balanceOf(msg.sender), "requestRedeem: Exceeds balance");

        // Update queue and user request
        queue.totalSharesPending = nextTotalSharesPending.toUint128();
        request.sharesPending = nextUserSharesPending.toUint128();
        // Add to users array if no previous request exists
        if (_sharesAmount == nextUserSharesPending) {
            request.index = uint64(queue.users.length);
            queue.users.push(msg.sender);
        }

        emit RedemptionRequestAdded(msg.sender, _sharesAmount);
    }

    //////////////////////////////////////////////////
    // SUBSCRIPTION ACTIONS - MANAGER - REDEMPTIONS //
    //////////////////////////////////////////////////

    /// @notice Kicks a user from the wrapper, redeeming their wrapped shares
    /// @param _user The user
    /// @param sharesRedeemed_ The amount of shares redeemed
    /// @dev Must cleanup any approvals separately.
    /// If `redemptionAsset` is the native asset,
    /// the kicked user will receive the wrapped native asset instead (prevents reverting).
    function kick(address _user) external nonReentrant returns (uint256 sharesRedeemed_) {
        __onlyManagerOrOwner();

        // Checkpoint redemption queue relativeSharesAllowed before updating the queue or shares supply
        if (__isInLatestRedemptionWindow(block.timestamp)) {
            __checkpointRelativeSharesAllowed();
        }

        __removeUserFromRedemptionQueue(_user);

        // Burn and redeem the shares
        sharesRedeemed_ = balanceOf(_user);
        _burn({account: _user, amount: sharesRedeemed_});

        __redeemCall({_recipient: _user, _sharesAmount: sharesRedeemed_});

        emit Kicked(_user, sharesRedeemed_);

        return sharesRedeemed_;
    }

    /// @notice Redeems a slice of requests from the queue
    /// @param _startIndex The first index of the slice
    /// @param _endIndex The final index of the slice
    /// @return usersRedeemed_ The users redeemed
    /// @return sharesRedeemed_ The amount of shares redeemed for each user
    /// @dev If redemptions are not throttled by relativeSharesAllowed, always slice from the end
    /// of the queue (more efficient to remove all users from the queue)
    function redeemFromQueue(uint256 _startIndex, uint256 _endIndex)
        external
        nonReentrant
        returns (address[] memory usersRedeemed_, uint256[] memory sharesRedeemed_)
    {
        __onlyManagerOrOwner();

        (uint256 windowStart, uint256 windowEnd) = calcLatestRedemptionWindow();
        require(
            __isWithinRange({_value: block.timestamp, _rangeStart: windowStart, _rangeEnd: windowEnd}),
            "redeemFromQueue: Outside redemption window"
        );

        RedemptionQueue storage queue = redemptionQueue;

        // Sanitize queue slice
        uint256 queueLength = queue.users.length;
        if (_endIndex == type(uint256).max) {
            _endIndex = queueLength - 1;
        }
        require(_endIndex < queueLength, "redeemFromQueue: Out-of-range _endIndex");
        require(_startIndex <= _endIndex, "redeemFromQueue: Misordered indexes");

        __checkpointRelativeSharesAllowed();

        // Calculate throttling
        bool throttled = queue.relativeSharesAllowed < ONE_HUNDRED_PERCENT;

        // Calculate redemption amounts and update each redemption request
        uint256 totalSharesRedeemed;
        uint256 usersToRedeemCount = _endIndex - _startIndex + 1;
        usersRedeemed_ = new address[](usersToRedeemCount);
        sharesRedeemed_ = new uint256[](usersToRedeemCount);
        // Step backwards from end of queue, so that removal of queue.users items is efficient
        // and does not disrupt next user indexes while in the loop
        for (uint256 i = _endIndex; usersToRedeemCount > 0; i--) {
            address user = queue.users[i];
            RedemptionRequest storage request = queue.userToRequest[user];

            require(
                !__isWithinRange({_value: request.lastRedeemed, _rangeStart: windowStart, _rangeEnd: windowEnd}),
                "redeemFromQueue: Already redeemed in window"
            );

            // Based on whether redemptions are throttled:
            // (1) calculate the redeemable amount of shares
            // (2) update or remove request from queue
            uint256 userRedemptionAmount;
            if (throttled) {
                uint256 userSharesPending = request.sharesPending;

                userRedemptionAmount = userSharesPending.mul(queue.relativeSharesAllowed) / ONE_HUNDRED_PERCENT;

                request.sharesPending = userSharesPending.sub(userRedemptionAmount).toUint128();
                request.lastRedeemed = uint64(block.timestamp);
            } else {
                userRedemptionAmount = request.sharesPending;

                __removeRedemptionRequest({_user: user, _queueLength: queueLength});
                queueLength--;
            }

            // Burn shares
            _burn({account: user, amount: userRedemptionAmount});

            // Decrement users-to-redeem count and use it as the index for the redemption return arrays
            usersToRedeemCount--;
            usersRedeemed_[usersToRedeemCount] = user;
            sharesRedeemed_[usersToRedeemCount] = userRedemptionAmount;
            totalSharesRedeemed = totalSharesRedeemed.add(userRedemptionAmount);
        }

        // Update queue
        queue.totalSharesPending = uint256(queue.totalSharesPending).sub(totalSharesRedeemed).toUint128();

        // Check whether native asset is to be dispersed
        bool disperseNativeAsset;
        ERC20 redemptionAssetContract = ERC20(getRedemptionAsset());
        if (address(redemptionAssetContract) == NATIVE_ASSET) {
            redemptionAssetContract = ERC20(address(WRAPPED_NATIVE_ASSET_CONTRACT));
            disperseNativeAsset = true;
        }

        // Redeem shares to this contract
        uint256 balanceToDisperse = redemptionAssetContract.balanceOf(address(this));

        __redeemCall({_recipient: address(this), _sharesAmount: totalSharesRedeemed});

        balanceToDisperse = redemptionAssetContract.balanceOf(address(this)).sub(balanceToDisperse);

        // Disperse received asset
        if (disperseNativeAsset) {
            WRAPPED_NATIVE_ASSET_CONTRACT.withdraw(balanceToDisperse);
        }

        for (uint256 i; i < usersRedeemed_.length; i++) {
            uint256 userAmountToDisperse = balanceToDisperse.mul(sharesRedeemed_[i]).div(totalSharesRedeemed);

            if (disperseNativeAsset) {
                Address.sendValue({recipient: payable(usersRedeemed_[i]), amount: userAmountToDisperse});
            } else {
                redemptionAssetContract.safeTransfer(usersRedeemed_[i], userAmountToDisperse);
            }

            emit Redeemed(usersRedeemed_[i], sharesRedeemed_[i], getRedemptionAsset(), userAmountToDisperse);
        }

        return (usersRedeemed_, sharesRedeemed_);
    }

    /// @dev Helper to checkpoint the relative shares allowed per user.
    /// Calling function should check whether the block.timestamp is currently
    /// within a redemption window (for gas efficiency).
    function __checkpointRelativeSharesAllowed() private {
        RedemptionQueue storage queue = redemptionQueue;

        // Skip if nothing in queue, or if already checkpointed in last window
        if (queue.totalSharesPending == 0 || __isInLatestRedemptionWindow(queue.relativeSharesCheckpointed)) {
            return;
        }

        // Calculate fresh if first redemption in window.
        // Use wrapped shares supply only instead of vault supply to prevent fee-related supply movements
        // between final request and first redemption.
        uint256 absoluteCap = totalSupply().mul(getRedemptionWindowConfig().relativeSharesCap) / ONE_HUNDRED_PERCENT;

        uint256 nextRelativeSharesAllowed;
        if (queue.totalSharesPending > absoluteCap) {
            nextRelativeSharesAllowed = ONE_HUNDRED_PERCENT.mul(absoluteCap).div(queue.totalSharesPending);
        } else {
            nextRelativeSharesAllowed = ONE_HUNDRED_PERCENT;
        }

        queue.relativeSharesAllowed = uint64(nextRelativeSharesAllowed);
        queue.relativeSharesCheckpointed = uint64(block.timestamp);
    }

    /// @dev Helper to redeem vault shares for the redemption asset
    function __redeemCall(address _recipient, uint256 _sharesAmount) private {
        address assetToReceive = getRedemptionAsset();
        if (assetToReceive == NATIVE_ASSET) {
            assetToReceive = address(WRAPPED_NATIVE_ASSET_CONTRACT);
        }

        (address target, bytes memory payload) = GLOBAL_CONFIG_CONTRACT.formatSingleAssetRedemptionCall({
            _vaultProxy: getVaultProxy(),
            _recipient: _recipient,
            _asset: assetToReceive,
            _amount: _sharesAmount,
            _amountIsShares: true
        });

        target.functionCall(payload);
    }

    /// @dev Helper to remove a redemption request from the queue
    function __removeRedemptionRequest(address _user, uint256 _queueLength) private {
        RedemptionQueue storage queue = redemptionQueue;

        uint256 userIndex = queue.userToRequest[_user].index;

        if (userIndex < _queueLength - 1) {
            address userToMove = queue.users[_queueLength - 1];

            queue.users[userIndex] = userToMove;
            queue.userToRequest[userToMove].index = uint64(userIndex);
        }

        delete queue.userToRequest[_user];
        queue.users.pop();

        emit RedemptionRequestRemoved(_user);
    }

    /// @dev Helper to remove a given user from the redemption queue
    function __removeUserFromRedemptionQueue(address _user) private {
        RedemptionQueue storage queue = redemptionQueue;
        uint256 userSharesPending = queue.userToRequest[_user].sharesPending;
        if (userSharesPending > 0) {
            queue.totalSharesPending = uint256(queue.totalSharesPending).sub(userSharesPending).toUint128();
            __removeRedemptionRequest({_user: _user, _queueLength: queue.users.length});
        }
    }

    /////////////////////////////
    // REDEMPTION WINDOW CALCS //
    /////////////////////////////

    /// @notice Helper to calculate the most recent redemption window
    /// @return windowStart_ The start of the latest window
    /// @return windowEnd_ The end of the latest window
    /// @dev Prior to first redemption window, returns no window (i.e., start and end are 0).
    /// After that, returns the last (or current) window, until a new window is reached.
    function calcLatestRedemptionWindow() public view returns (uint256 windowStart_, uint256 windowEnd_) {
        RedemptionWindowConfig memory windowConfig = getRedemptionWindowConfig();

        // Return early if no window has been reached
        if (block.timestamp < windowConfig.firstWindowStart || windowConfig.firstWindowStart == 0) {
            return (0, 0);
        }

        uint256 cyclesCompleted = (block.timestamp.sub(windowConfig.firstWindowStart)).div(windowConfig.frequency);

        windowStart_ = uint256(windowConfig.firstWindowStart).add(cyclesCompleted.mul(windowConfig.frequency));
        windowEnd_ = windowStart_.add(windowConfig.duration);

        return (windowStart_, windowEnd_);
    }

    /// @dev Helper to check whether a timestamp is in the current redemption window
    function __isInLatestRedemptionWindow(uint256 _timestamp) private view returns (bool inWindow_) {
        (uint256 windowStart, uint256 windowEnd) = calcLatestRedemptionWindow();

        if (windowStart == 0) {
            return false;
        }

        return __isWithinRange({_value: _timestamp, _rangeStart: windowStart, _rangeEnd: windowEnd});
    }

    /// @dev Helper to check whether a value is between two ends of a range.
    /// Used for efficiency when the redemption window start and end are already in memory.
    function __isWithinRange(uint256 _value, uint256 _rangeStart, uint256 _rangeEnd)
        private
        pure
        returns (bool withinRange_)
    {
        return _value >= _rangeStart && _value <= _rangeEnd;
    }

    ///////////////////////////////
    // MANAGER CALLS - APPROVALS //
    ///////////////////////////////

    // Managers should consider resetting approvals to 0 before updating to the new amount.
    // Approvals can only be used once and are all-or-nothing (i.e., the full amount must be used),
    // with the following exceptions:
    // - any approval with type(uint256).max allows any amount any number of times
    // - redemption approvals can be used partially, but any remaining amount is revoked

    /// @notice Sets deposit approvals for a list of users
    /// @param _users The users
    /// @param _assets The deposit token for each approval
    /// @param _amounts The amount of each approval
    function setDepositApprovals(address[] calldata _users, address[] calldata _assets, uint256[] calldata _amounts)
        external
    {
        __onlyManagerOrOwner();

        require(
            _users.length == _assets.length && _users.length == _amounts.length, "setDepositApprovals: Unequal arrays"
        );

        for (uint256 i; i < _users.length; i++) {
            userToAssetToDepositApproval[_users[i]][_assets[i]] = _amounts[i];

            emit DepositApproval(_users[i], _assets[i], _amounts[i]);
        }
    }

    /// @notice Sets redemption approvals for a list of users
    /// @param _users The users
    /// @param _amounts The amount of each approval
    function setRedemptionApprovals(address[] calldata _users, uint256[] calldata _amounts) external {
        __onlyManagerOrOwner();

        require(_users.length == _amounts.length, "setRedemptionApprovals: Unequal arrays");

        for (uint256 i; i < _users.length; i++) {
            userToRedemptionApproval[_users[i]] = _amounts[i];

            emit RedemptionApproval(_users[i], _amounts[i]);
        }
    }

    /// @notice Sets transfer approvals for a list of users
    /// @param _users The users (senders)
    /// @param _recipients The recipient for each approval
    /// @param _amounts The amount of each approval
    function setTransferApprovals(
        address[] calldata _users,
        address[] calldata _recipients,
        uint256[] calldata _amounts
    ) external {
        __onlyManagerOrOwner();

        require(
            _users.length == _recipients.length && _users.length == _amounts.length,
            "setTransferApprovals: Unequal arrays"
        );

        for (uint256 i; i < _users.length; i++) {
            userToRecipientToTransferApproval[_users[i]][_recipients[i]] = _amounts[i];

            emit TransferApproval(_users[i], _recipients[i], _amounts[i]);
        }
    }

    /// @notice Sets whether deposit approvals are required
    /// @param _nextUseDepositApprovals True if required
    function setUseDepositApprovals(bool _nextUseDepositApprovals) external {
        __onlyManagerOrOwner();

        __setUseDepositApprovals(_nextUseDepositApprovals);
    }

    /// @notice Sets whether redemption approvals are required
    /// @param _nextUseRedemptionApprovals True if required
    function setUseRedemptionApprovals(bool _nextUseRedemptionApprovals) external {
        __onlyManagerOrOwner();

        __setUseRedemptionApprovals(_nextUseRedemptionApprovals);
    }

    /// @notice Sets whether transfer approvals are required
    /// @param _nextUseTransferApprovals True if required
    function setUseTransferApprovals(bool _nextUseTransferApprovals) external {
        __onlyManagerOrOwner();

        __setUseTransferApprovals(_nextUseTransferApprovals);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to set useDepositApprovals
    function __setUseDepositApprovals(bool _nextUseDepositApprovals) private {
        useDepositApprovals = _nextUseDepositApprovals;

        emit UseDepositApprovalsSet(_nextUseDepositApprovals);
    }

    /// @dev Helper to set useRedemptionApprovals
    function __setUseRedemptionApprovals(bool _nextUseRedemptionApprovals) private {
        useRedemptionApprovals = _nextUseRedemptionApprovals;

        emit UseRedemptionApprovalsSet(_nextUseRedemptionApprovals);
    }

    /// @dev Helper to set useTransferApprovals
    function __setUseTransferApprovals(bool _nextUseTransferApprovals) private {
        useTransferApprovals = _nextUseTransferApprovals;

        emit UseTransferApprovalsSet(_nextUseTransferApprovals);
    }

    //////////////////////////
    // MANAGER CALLS - MISC //
    //////////////////////////

    /// @notice Sets the DepositMode for the wrapper
    /// @param _mode The DepositMode
    function setDepositMode(DepositMode _mode) external {
        __onlyManagerOrOwner();

        __setDepositMode(_mode);
    }

    /// @notice Sets the configuration for the redemption window
    /// @param _nextWindowConfig The RedemptionWindowConfig
    function setRedemptionWindowConfig(RedemptionWindowConfig calldata _nextWindowConfig) external {
        __onlyManagerOrOwner();

        __setRedemptionWindowConfig(_nextWindowConfig);
    }

    /// @notice Sets the asset received during redemptions
    /// @param _nextRedemptionAsset The asset
    function setRedemptionAsset(address _nextRedemptionAsset) external {
        __onlyManagerOrOwner();

        __setRedemptionAsset(_nextRedemptionAsset);
    }

    // PRIVATE FUNCTIONS

    function __setDepositMode(DepositMode _mode) private {
        depositMode = _mode;

        emit DepositModeSet(_mode);
    }

    /// @dev Helper to set redemptionAsset
    function __setRedemptionAsset(address _nextRedemptionAsset) private {
        require(_nextRedemptionAsset != address(0), "__setRedemptionAsset: No redemption asset");

        redemptionAsset = _nextRedemptionAsset;

        emit RedemptionAssetSet(_nextRedemptionAsset);
    }

    /// @dev Helper to set redemptionWindowConfig
    function __setRedemptionWindowConfig(RedemptionWindowConfig memory _nextWindowConfig) private {
        // Config can either be all empty, or all valid
        if (
            !(
                _nextWindowConfig.firstWindowStart == 0 && _nextWindowConfig.duration == 0
                    && _nextWindowConfig.frequency == 0 && _nextWindowConfig.relativeSharesCap == 0
            )
        ) {
            require(
                _nextWindowConfig.firstWindowStart > block.timestamp,
                "__setRedemptionWindowConfig: Invalid firstWindowStart"
            );
            require(_nextWindowConfig.duration > 0, "__setRedemptionWindowConfig: No duration");
            require(
                _nextWindowConfig.frequency > _nextWindowConfig.duration,
                "__setRedemptionWindowConfig: duration exceeds frequency"
            );
            require(
                _nextWindowConfig.relativeSharesCap <= ONE_HUNDRED_PERCENT,
                "__setRedemptionWindowConfig: relativeSharesCap exceeds 100%"
            );
        }

        redemptionWindowConfig = _nextWindowConfig;

        // Changing the window config completely resets the relativeSharesCap
        RedemptionQueue storage queue = redemptionQueue;
        delete queue.relativeSharesAllowed;
        delete queue.relativeSharesCheckpointed;

        emit RedemptionWindowConfigSet(
            _nextWindowConfig.firstWindowStart,
            _nextWindowConfig.frequency,
            _nextWindowConfig.duration,
            _nextWindowConfig.relativeSharesCap
        );
    }

    /////////////////
    // OWNER CALLS //
    /////////////////

    /// @notice Adds managers
    /// @param _managers Managers to add
    function addManagers(address[] calldata _managers) external {
        __onlyOwner();

        __addManagers(_managers);
    }

    /// @notice Forces a wrapped shares transfer between two users without an approval
    /// @param _sender From whom
    /// @param _recipient To whom
    /// @dev Fully removes _sender from the redemption queue prior to transfer
    function forceTransfer(address _sender, address _recipient) external returns (uint256 amount_) {
        __onlyOwner();

        __removeUserFromRedemptionQueue(_sender);

        amount_ = balanceOf(_sender);

        _transfer({sender: _sender, recipient: _recipient, amount: amount_});

        emit TransferForced(_sender, _recipient, amount_);

        return amount_;
    }

    /// @notice Removes managers
    /// @param _managers Managers to remove
    function removeManagers(address[] calldata _managers) external {
        __onlyOwner();

        for (uint256 i; i < _managers.length; i++) {
            address manager = _managers[i];

            require(isManager(manager), "removeManagers: Not a manager");

            userToIsManager[manager] = false;

            emit ManagerRemoved(manager);
        }
    }

    /// @dev Helper to add wrapper managers
    function __addManagers(address[] calldata _managers) internal {
        for (uint256 i; i < _managers.length; i++) {
            address manager = _managers[i];

            require(!isManager(manager), "__addManagers: Already manager");

            userToIsManager[manager] = true;

            emit ManagerAdded(manager);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Gets the list of all users in the given asset's deposit queue
    /// @param _depositAsset The deposit asset
    /// @return users_ The list of users
    function getDepositQueueUsers(address _depositAsset) external view returns (address[] memory users_) {
        return depositAssetToQueue[_depositAsset].users;
    }

    /// @notice Gets the redemption queue state
    /// @return totalSharesPending_ The total shares pending in the queue
    /// @return relativeSharesAllowed_ The relative shares allowed per-user during the window, as of the last checkpoint
    /// @return relativeSharesCheckpointed_ The last checkpoint of relativeSharesAllowed_
    /// @dev Can't return a struct with a mapping in solc 0.6.12
    function getRedemptionQueue()
        external
        view
        returns (uint256 totalSharesPending_, uint256 relativeSharesAllowed_, uint256 relativeSharesCheckpointed_)
    {
        return (
            redemptionQueue.totalSharesPending,
            redemptionQueue.relativeSharesAllowed,
            redemptionQueue.relativeSharesCheckpointed
        );
    }

    /// @notice Gets the user at the specified index in the redemption queue list of users
    /// @param _index The index
    /// @return user_ The user
    function getRedemptionQueueUserByIndex(uint256 _index) external view returns (address user_) {
        return redemptionQueue.users[_index];
    }

    /// @notice Gets the redemption request for a specified user
    /// @param _user The user
    /// @return request_ The RedemptionRequest
    function getRedemptionQueueUserRequest(address _user) external view returns (RedemptionRequest memory request_) {
        return redemptionQueue.userToRequest[_user];
    }

    /// @notice Gets the list of all users in the redemption queue
    /// @return users_ The list of users
    function getRedemptionQueueUsers() external view returns (address[] memory users_) {
        return redemptionQueue.users;
    }

    /// @notice Gets the count of users in the redemption queue
    /// @return length_ The count of users
    function getRedemptionQueueUsersLength() external view returns (uint256 length_) {
        return redemptionQueue.users.length;
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether deposit approvals are required
    /// @return approvalsUsed_ True if required
    function depositApprovalsAreUsed() public view returns (bool approvalsUsed_) {
        return useDepositApprovals;
    }

    /// @notice Gets the deposit approval for a given user and asset
    /// @param _user The user
    /// @param _asset The asset
    /// @return amount_ The approval amount
    function getDepositApproval(address _user, address _asset) public view returns (uint256 amount_) {
        return userToAssetToDepositApproval[_user][_asset];
    }

    /// @notice Gets the DepositMode for the wrapper
    /// @return mode_ The DepositMode
    function getDepositMode() public view returns (DepositMode mode_) {
        return depositMode;
    }

    /// @notice Gets the deposit request for a specified asset and user
    /// @param _depositAsset The deposit asset
    /// @param _user The user
    /// @return request_ The DepositRequest
    function getDepositQueueUserRequest(address _depositAsset, address _user)
        public
        view
        returns (DepositRequest memory request_)
    {
        return depositAssetToQueue[_depositAsset].userToRequest[_user];
    }

    /// @notice Gets the redemption approval for a given user
    /// @param _user The user
    /// @return amount_ The approval amount
    function getRedemptionApproval(address _user) public view returns (uint256 amount_) {
        return userToRedemptionApproval[_user];
    }

    /// @notice Gets the asset received during redemptions
    /// @return asset_ The asset
    function getRedemptionAsset() public view returns (address asset_) {
        return redemptionAsset;
    }

    /// @notice Gets the redemption window configuration
    /// @return redemptionWindowConfig_ The RedemptionWindowConfig
    function getRedemptionWindowConfig() public view returns (RedemptionWindowConfig memory redemptionWindowConfig_) {
        return redemptionWindowConfig;
    }

    /// @notice Gets the deposit approval for a given sender and recipient
    /// @param _sender The sender
    /// @param _recipient The recipient
    /// @return amount_ The approval amount
    function getTransferApproval(address _sender, address _recipient) public view returns (uint256 amount_) {
        return userToRecipientToTransferApproval[_sender][_recipient];
    }

    /// @notice Gets the vaultProxy var
    /// @return vaultProxy_ The vaultProxy value
    function getVaultProxy() public view returns (address vaultProxy_) {
        return vaultProxy;
    }

    /// @notice Checks whether a user is a wrapper manager
    /// @param _user The user to check
    /// @return isManager_ True if _user is a wrapper manager
    function isManager(address _user) public view returns (bool isManager_) {
        return userToIsManager[_user];
    }

    /// @notice Checks whether redemption approvals are required
    /// @return approvalsUsed_ True if required
    function redemptionApprovalsAreUsed() public view returns (bool approvalsUsed_) {
        return useRedemptionApprovals;
    }

    /// @notice Checks whether approvals are required for transferring wrapped shares
    /// @return approvalsUsed_ True if required
    function transferApprovalsAreUsed() public view returns (bool approvalsUsed_) {
        return useTransferApprovals;
    }
}
