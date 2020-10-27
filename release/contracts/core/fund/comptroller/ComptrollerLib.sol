// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../../extensions/IExtension.sol";
import "../../../extensions/fee-manager/IFeeManager.sol";
import "../../../extensions/policy-manager/IPolicyManager.sol";
import "../../../infrastructure/engine/AmguConsumer.sol";
import "../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import "../../../interfaces/IERC20Extended.sol";
import "../../../utils/AddressArrayLib.sol";
import "../../fund-deployer/IFundDeployer.sol";
import "../vault/IVault.sol";
import "./libs/IFundLifecycleLib.sol";
import "./libs/IPermissionedVaultActionLib.sol";
import "./utils/ComptrollerEvents.sol";
import "./utils/ComptrollerStorage.sol";
import "./IComptroller.sol";

/// @title ComptrollerLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The core logic library shared by all funds
/// @dev All state-changing functions should be marked as onlyDelegateCall,
/// unless called directly by the FundDeployer
contract ComptrollerLib is IComptroller, ComptrollerEvents, ComptrollerStorage, AmguConsumer {
    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;
    using SafeERC20 for IERC20Extended;

    // Constants - shared by all proxies
    uint256 private constant SHARES_UNIT = 10**18;
    address private immutable FUND_DEPLOYER;
    address private immutable FEE_MANAGER;
    address private immutable FUND_LIFECYCLE_LIB;
    address private immutable INTEGRATION_MANAGER;
    address private immutable PERMISSIONED_VAULT_ACTION_LIB;
    address private immutable POLICY_MANAGER;
    address private immutable VALUE_INTERPRETER;

    ///////////////
    // MODIFIERS //
    ///////////////

    modifier allowsPermissionedVaultAction {
        __assertPermissionedVaultActionNotAllowed();
        permissionedVaultActionAllowed = true;
        _;
        permissionedVaultActionAllowed = false;
    }

    /// @dev Especially because the current asset universe is limited to non-reentrant ERC20 tokens,
    /// this reentrancy guard is not strictly necessary, but implemented out of an abundance of
    /// caution in the case we decide that we do want to allow such assets.
    modifier locksReentrance() {
        __assertNotReentranceLocked();
        reentranceLocked = true;
        _;
        reentranceLocked = false;
    }

    modifier timelockedSharesAction(address _account) {
        __assertSharesActionNotTimelocked(_account);
        _;
        acctToLastSharesAction[_account] = block.timestamp;
    }

    modifier onlyActive() {
        __assertIsActive();
        _;
    }

    modifier onlyDelegateCall() {
        __assertIsDelegateCall();
        _;
    }

    modifier onlyNotPaused() {
        __assertNotPaused();
        _;
    }

    modifier onlyOwner() {
        __assertIsOwner(msg.sender);
        _;
    }

    // ASSERTION HELPERS
    // Modifiers are inefficient in terms of reducing contract size,
    // so we use helper functions to prevent repetitive inlining of expensive string values.

    /// @dev Since vaultProxy is set during activate(),
    /// we can check that var rather than storing additional state
    function __assertIsActive() private view {
        require(vaultProxy != address(0), "Fund not active");
    }

    function __assertIsDelegateCall() private view {
        require(!isLib, "Only delegate callable");
    }

    function __assertIsOwner(address _who) private view {
        require(_who == IVault(vaultProxy).getOwner(), "Only fund owner callable");
    }

    function __assertLowLevelCall(bool _success, bytes memory _returnData) private pure {
        require(_success, string(_returnData));
    }

    function __assertNotPaused() private view {
        require(!__fundIsPaused(), "Fund is paused");
    }

    function __assertNotReentranceLocked() private view {
        require(!reentranceLocked, "Re-entrance");
    }

    function __assertPermissionedVaultActionNotAllowed() private view {
        require(!permissionedVaultActionAllowed, "Vault action re-entrance");
    }

    function __assertSharesActionNotTimelocked(address _account) private view {
        require(
            block.timestamp.sub(acctToLastSharesAction[_account]) >= sharesActionTimelock,
            "Shares action timelocked"
        );
    }

    constructor(
        address _fundDeployer,
        address _valueInterpreter,
        address _feeManager,
        address _integrationManager,
        address _policyManager,
        address _fundLifecycleLib,
        address _permissionedVaultActionLib,
        address _engine
    ) public AmguConsumer(_engine) {
        FEE_MANAGER = _feeManager;
        FUND_DEPLOYER = _fundDeployer;
        FUND_LIFECYCLE_LIB = _fundLifecycleLib;
        INTEGRATION_MANAGER = _integrationManager;
        PERMISSIONED_VAULT_ACTION_LIB = _permissionedVaultActionLib;
        POLICY_MANAGER = _policyManager;
        VALUE_INTERPRETER = _valueInterpreter;
        isLib = true;
    }

    /////////////
    // GENERAL //
    /////////////

    /// @notice Calls an arbitrary function on an extension
    /// @param _extension The extension contract to call (e.g., FeeManager)
    /// @param _actionId An ID representing the action to take on the extension (see extension)
    /// @param _callArgs The encoded data for the call
    /// @dev Used to route arbitrary calls, so that msg.sender is the ComptrollerProxy
    /// (for access control). Uses a mutex of sorts that only allows permissioned calls
    /// to the vault during this stack.
    /// Does not use onlyDelegateCall, as onlyActive will only be valid in delegate calls.
    function callOnExtension(
        address _extension,
        uint256 _actionId,
        bytes calldata _callArgs
    ) external override onlyNotPaused onlyActive locksReentrance allowsPermissionedVaultAction {
        require(
            _extension == FEE_MANAGER ||
                _extension == POLICY_MANAGER ||
                _extension == INTEGRATION_MANAGER,
            "callOnExtension: _extension invalid"
        );

        IExtension(_extension).receiveCallFromComptroller(msg.sender, _actionId, _callArgs);
    }

    /// @notice Makes an permissioned, state-changing call on the VaultProxy contract
    /// @param _action The enum representing the VaultAction to perform on the VaultProxy
    /// @param _actionData The call data for the action to perform
    function permissionedVaultAction(IVault.VaultAction _action, bytes calldata _actionData)
        external
        override
        onlyActive
        onlyNotPaused
    {
        (bool success, bytes memory returnData) = PERMISSIONED_VAULT_ACTION_LIB.delegatecall(
            abi.encodeWithSelector(
                IPermissionedVaultActionLib.dispatchAction.selector,
                _action,
                _actionData
            )
        );
        __assertLowLevelCall(success, returnData);
    }

    /// @notice Set or unset the release pause override for a fund
    /// @param _overridePause True if the pause should be overrode
    /// @dev Does not use onlyDelegateCall, as onlyOwner will only be valid in delegate calls.
    function setOverridePause(bool _overridePause) external onlyOwner {
        if (!overridePause == _overridePause) {
            overridePause = _overridePause;

            emit OverridePauseSet(_overridePause);
        }
    }

    /// @notice Makes an arbitrary call from the VaultProxy contract
    /// @param _contract The contract to call
    /// @param _selector The selector to call
    /// @param _callData The call data for the call
    /// @dev Does not use onlyDelegateCall, as onlyActive will only be valid in delegate calls.
    function vaultCallOnContract(
        address _contract,
        bytes4 _selector,
        bytes calldata _callData
    ) external onlyNotPaused onlyActive onlyOwner {
        require(
            IFundDeployer(FUND_DEPLOYER).isRegisteredVaultCall(_contract, _selector),
            "vaultCallOnContract: Unregistered"
        );

        IVault(vaultProxy).callOnContract(_contract, abi.encodeWithSelector(_selector, _callData));
    }

    /// @dev Helper to check whether the release is paused and there is no local override
    function __fundIsPaused() private view returns (bool) {
        return
            IFundDeployer(FUND_DEPLOYER).getReleaseStatus() ==
            IFundDeployer.ReleaseStatus.Paused &&
            !overridePause;
    }

    ///////////////
    // LIFECYCLE //
    ///////////////

    /// @dev Delegated to FundLifecycleLib. See library for Natspec.
    function init(
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        address[] calldata _allowedBuySharesCallers,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external override {
        (bool success, bytes memory returnData) = FUND_LIFECYCLE_LIB.delegatecall(
            abi.encodeWithSelector(
                IFundLifecycleLib.init.selector,
                _denominationAsset,
                _sharesActionTimelock,
                _allowedBuySharesCallers,
                _feeManagerConfigData,
                _policyManagerConfigData
            )
        );
        __assertLowLevelCall(success, returnData);
    }

    /// @dev Delegated to FundLifecycleLib. See library for Natspec.
    function activate(address _vaultProxy, bool _isMigration) external override {
        (bool success, bytes memory returnData) = FUND_LIFECYCLE_LIB.delegatecall(
            abi.encodeWithSelector(IFundLifecycleLib.activate.selector, _vaultProxy, _isMigration)
        );
        __assertLowLevelCall(success, returnData);
    }

    /// @dev Delegated to FundLifecycleLib. See library for Natspec.
    function destruct() external override {
        (bool success, bytes memory returnData) = FUND_LIFECYCLE_LIB.delegatecall(
            abi.encodeWithSelector(IFundLifecycleLib.destruct.selector)
        );
        __assertLowLevelCall(success, returnData);
    }

    ////////////////
    // ACCOUNTING //
    ////////////////

    /// @notice Calculates the gross asset value (GAV) of the fund
    /// @param _useLiveRates True if should use live rates instead of canonical rates
    /// @return gav_ The fund GAV
    /// @dev _useLiveRates is `false` within the core protocol, but plugins will often want to use
    /// live rates, for example a MaxConcentration policy
    /// @dev Does not alter local state,
    /// but not a view because calls to price feeds can potentially update 3rd party state
    function calcGav(bool _useLiveRates) public onlyDelegateCall returns (uint256 gav_) {
        IVault vaultProxyContract = IVault(vaultProxy);
        address[] memory assets = vaultProxyContract.getTrackedAssets();
        uint256[] memory balances = new uint256[](assets.length);
        for (uint256 i; i < assets.length; i++) {
            balances[i] = __getVaultAssetBalance(address(vaultProxyContract), assets[i]);
        }

        bool isValid;
        if (_useLiveRates) {
            (gav_, isValid) = IValueInterpreter(VALUE_INTERPRETER).calcLiveAssetsTotalValue(
                assets,
                balances,
                denominationAsset
            );
        } else {
            (gav_, isValid) = IValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetsTotalValue(
                assets,
                balances,
                denominationAsset
            );
        }

        // TODO: return validity instead of reverting?
        require(isValid, "calcGav: gav is invalid");

        return gav_;
    }

    /// @notice Calculates the gross value of 1 unit of shares in the fund's denomination asset
    /// @return grossShareValue_ The amount of the denomination asset per share
    /// @dev Does not account for any fees outstanding
    function calcGrossShareValue()
        external
        override
        onlyDelegateCall
        returns (uint256 grossShareValue_)
    {
        return
            __calcGrossShareValue(
                calcGav(false),
                IERC20Extended(vaultProxy).totalSupply(),
                10**uint256(IERC20Extended(denominationAsset).decimals())
            );
    }

    /// @dev Helper for calculating the gross share value
    function __calcGrossShareValue(
        uint256 _gav,
        uint256 _sharesSupply,
        uint256 _denominationAssetUnit
    ) private pure returns (uint256 grossShareValue_) {
        if (_sharesSupply == 0) {
            return _denominationAssetUnit;
        }

        return _gav.mul(SHARES_UNIT).div(_sharesSupply);
    }

    /// @dev Helper to get the balance of an asset in a fund's VaultProxy
    function __getVaultAssetBalance(address _vaultProxy, address _asset)
        private
        view
        returns (uint256 balance_)
    {
        return IERC20Extended(_asset).balanceOf(_vaultProxy);
    }

    ///////////////////
    // PARTICIPATION //
    ///////////////////

    // BUY SHARES

    /// @notice Add accounts that are allowed to call the `buyShares` function
    /// @param _callersToAdd The accounts to add
    function addAllowedBuySharesCallers(address[] calldata _callersToAdd) external onlyOwner {
        __addAllowedBuySharesCallers(_callersToAdd);
    }

    /// @notice Buy shares on behalf of a specified user
    /// @param _buyer The account for which to buy shares
    /// @param _investmentAmount The amount of the fund's denomination asset with which to buy shares
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the specified _investmentAmount
    /// @return sharesReceived_ The actual amount of shares received by the _buyer
    /// @dev Does not use onlyDelegateCall, as onlyActive will only be valid in delegate calls.
    function buyShares(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    )
        external
        payable
        onlyActive
        onlyNotPaused
        timelockedSharesAction(_buyer)
        locksReentrance
        allowsPermissionedVaultAction
        amguPayable
        returns (uint256 sharesReceived_)
    {
        require(
            allowedBuySharesCallers.length() == 0 || allowedBuySharesCallers.contains(msg.sender),
            "buyShares: Unauthorized caller"
        );

        uint256 preBuySharesGav = calcGav(false);

        __preBuySharesHook(_buyer, _investmentAmount, _minSharesQuantity, preBuySharesGav);

        IVault vaultProxyContract = IVault(vaultProxy);
        IERC20Extended sharesContract = IERC20Extended(address(vaultProxyContract));
        IERC20Extended denominationAssetContract = IERC20Extended(denominationAsset);

        // Calculate the amount of shares to buy with the investment amount
        uint256 sharesBought = __calcBuyableSharesQuantity(
            sharesContract,
            denominationAssetContract,
            _investmentAmount,
            preBuySharesGav
        );

        // Mint shares to the buyer
        uint256 prevBuyerShares = sharesContract.balanceOf(_buyer);
        vaultProxyContract.mintShares(_buyer, sharesBought);

        // Post-buy actions
        // TODO: could add additional params like gav and totalSupply here too
        __postBuySharesHook(_buyer, _investmentAmount, sharesBought);

        sharesReceived_ = sharesContract.balanceOf(_buyer).sub(prevBuyerShares);
        require(sharesReceived_ >= _minSharesQuantity, "buyShares: < _minSharesQuantity");

        // Transfer investment asset
        denominationAssetContract.safeTransferFrom(
            msg.sender,
            address(vaultProxyContract),
            _investmentAmount
        );
        vaultProxyContract.addTrackedAsset(address(denominationAssetContract));

        emit SharesBought(msg.sender, _buyer, _investmentAmount, sharesBought, sharesReceived_);

        return sharesReceived_;
    }

    /// @notice Remove approval of accounts that can call the `buyShares` function
    /// @param _callersToRemove The accounts for which to remove approval
    function removeAllowedBuySharesCallers(address[] calldata _callersToRemove)
        external
        onlyOwner
    {
        require(
            _callersToRemove.length > 0,
            "__removeAllowedBuySharesCallers: Empty _callersToRemove"
        );

        for (uint256 i; i < _callersToRemove.length; i++) {
            require(
                isAllowedBuySharesCaller(_callersToRemove[i]),
                "__removeAllowedBuySharesCallers: Caller already disallowed"
            );

            allowedBuySharesCallers.remove(_callersToRemove[i]);

            emit AllowedBuySharesCallerRemoved(_callersToRemove[i]);
        }
    }

    /// @dev Helper to add allowed callers of the `buyShares` function
    function __addAllowedBuySharesCallers(address[] memory _callersToAdd) private {
        require(_callersToAdd.length > 0, "__addAllowedBuySharesCallers: Empty _callersToAdd");

        for (uint256 i; i < _callersToAdd.length; i++) {
            require(
                !isAllowedBuySharesCaller(_callersToAdd[i]),
                "__addAllowedBuySharesCallers: Caller already allowed"
            );

            allowedBuySharesCallers.add(_callersToAdd[i]);

            emit AllowedBuySharesCallerAdded(_callersToAdd[i]);
        }
    }

    /// @dev Helper to calculate the quantity of shares buyable for a given investment amount.
    /// Avoids the stack-too-deep error.
    function __calcBuyableSharesQuantity(
        IERC20Extended _sharesContract,
        IERC20Extended _denominationAssetContract,
        uint256 _investmentAmount,
        uint256 _gav
    ) private view returns (uint256 sharesQuantity_) {
        uint256 denominationAssetUnit = 10**uint256(_denominationAssetContract.decimals());
        return
            _investmentAmount.mul(denominationAssetUnit).div(
                __calcGrossShareValue(_gav, _sharesContract.totalSupply(), denominationAssetUnit)
            );
    }

    /// @dev Helper for system actions immediately prior to issuing shares
    function __preBuySharesHook(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity,
        uint256 _gav
    ) private {
        bytes memory callData = abi.encode(_buyer, _investmentAmount, _minSharesQuantity, _gav);

        IFeeManager(FEE_MANAGER).settleFees(IFeeManager.FeeHook.PreBuyShares, callData);

        IPolicyManager(POLICY_MANAGER).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.PreBuyShares,
            callData
        );
    }

    /// @dev Helper for system actions immediately after issuing shares
    function __postBuySharesHook(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _sharesBought
    ) private {
        bytes memory callData = abi.encode(_buyer, _investmentAmount, _sharesBought);

        IFeeManager(FEE_MANAGER).settleFees(IFeeManager.FeeHook.PostBuyShares, callData);

        IPolicyManager(POLICY_MANAGER).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.PostBuyShares,
            callData
        );
    }

    // REDEEM SHARES

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    function redeemShares() external onlyDelegateCall {
        __redeemShares(
            msg.sender,
            IERC20Extended(vaultProxy).balanceOf(msg.sender),
            new address[](0),
            new address[](0)
        );
    }

    /// @notice Redeem a specified quantity of the sender's shares for a proportionate slice of
    /// the fund's assets, optionally specifying additional assets and assets to skip.
    /// @param _sharesQuantity The quantity of shares to redeem
    /// @param _additionalAssets Additional (non-tracked) assets to claim
    /// @param _assetsToSkip Tracked assets to forfeit
    /// @dev Any claim to passed _assetsToSkip will be forfeited entirely. This should generally
    /// only be exercised if a bad asset is causing redemption to fail.
    function redeemSharesDetailed(
        uint256 _sharesQuantity,
        address[] calldata _additionalAssets,
        address[] calldata _assetsToSkip
    ) external onlyDelegateCall {
        __redeemShares(msg.sender, _sharesQuantity, _additionalAssets, _assetsToSkip);
    }

    /// @dev Helper to parse an array of payout assets during redemption, taking into account
    /// additional assets and assets to skip. _assetsToSkip ignores _additionalAssets.
    /// All input arrays are assumed to be unique.
    function __parseRedemptionPayoutAssets(
        address[] memory _trackedAssets,
        address[] memory _additionalAssets,
        address[] memory _assetsToSkip
    ) private pure returns (address[] memory payoutAssets_) {
        address[] memory trackedAssetsToPayout = _trackedAssets.removeItems(_assetsToSkip);
        if (_additionalAssets.length == 0) {
            return trackedAssetsToPayout;
        }

        // Add additional assets. Duplicates of trackedAssets are ignored.
        bool[] memory indexesToAdd = new bool[](_additionalAssets.length);
        uint256 additionalItemsCount;
        for (uint256 i; i < _additionalAssets.length; i++) {
            if (!trackedAssetsToPayout.contains(_additionalAssets[i])) {
                indexesToAdd[i] = true;
                additionalItemsCount++;
            }
        }
        if (additionalItemsCount == 0) {
            return trackedAssetsToPayout;
        }

        payoutAssets_ = new address[](trackedAssetsToPayout.length.add(additionalItemsCount));
        for (uint256 i; i < trackedAssetsToPayout.length; i++) {
            payoutAssets_[i] = trackedAssetsToPayout[i];
        }
        uint256 payoutAssetsIndex = trackedAssetsToPayout.length;
        for (uint256 i; i < _additionalAssets.length; i++) {
            if (indexesToAdd[i]) {
                payoutAssets_[payoutAssetsIndex] = _additionalAssets[i];
                payoutAssetsIndex++;
            }
        }

        return payoutAssets_;
    }

    /// @dev Helper for system actions immediately prior to redeeming shares.
    /// Policy validation is not currently allowed on redemption, to ensure continuous redeemability.
    function __preRedeemSharesHook(address _redeemer, uint256 _sharesQuantity)
        private
        allowsPermissionedVaultAction
    {
        try
            IFeeManager(FEE_MANAGER).settleFees(
                IFeeManager.FeeHook.PreRedeemShares,
                abi.encode(_redeemer, _sharesQuantity)
            )
         {} catch (bytes memory reason) {
            emit PreRedeemSharesHookFailed(reason, _redeemer, _sharesQuantity);
        }
    }

    /// @notice Redeem a specified quantity of the sender's shares
    /// for a proportionate slice of the fund's assets
    /// @param _sharesQuantity The amount of shares to redeem
    function __redeemShares(
        address _redeemer,
        uint256 _sharesQuantity,
        address[] memory _additionalAssets,
        address[] memory _assetsToSkip
    )
        private
        timelockedSharesAction(_redeemer)
        locksReentrance
        returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)
    {
        require(_sharesQuantity > 0, "__redeemShares: _sharesQuantity must be >0");
        require(
            _additionalAssets.isUniqueSet(),
            "__redeemShares: _additionalAssets contains duplicates"
        );
        require(_assetsToSkip.isUniqueSet(), "__redeemShares: _assetsToSkip contains duplicates");

        // When a fund is paused, settling fees will be skipped
        if (!__fundIsPaused()) {
            // Note that if "direct" fees are charged here (i.e., not inflationary),
            // then those fee shares will be burned from the user's balance rather
            // than reallocated from the sharesQuantity being redeemed.
            __preRedeemSharesHook(_redeemer, _sharesQuantity);
        }

        // Interfaces currently only contain their own functions that are used elsewhere
        // within the core protocol. If we change this paradigm, we can combine these vars.
        IVault vaultProxyContract = IVault(vaultProxy);
        IERC20Extended sharesContract = IERC20Extended(address(vaultProxyContract));

        // Check the shares quantity against the user's balance after settling fees.
        require(
            _sharesQuantity <= sharesContract.balanceOf(_redeemer),
            "__redeemShares: Low balance"
        );

        // Parse the payout assets given optional params to add or skip assets
        payoutAssets_ = __parseRedemptionPayoutAssets(
            vaultProxyContract.getTrackedAssets(),
            _additionalAssets,
            _assetsToSkip
        );
        require(payoutAssets_.length > 0, "__redeemShares: No payout assets");

        // Destroy the shares.
        // Must get the shares supply before doing so.
        uint256 sharesSupply = sharesContract.totalSupply();
        vaultProxyContract.burnShares(_redeemer, _sharesQuantity);

        // Calculate and transfer payout asset amounts due to redeemer
        payoutAmounts_ = new uint256[](payoutAssets_.length);
        for (uint256 i; i < payoutAssets_.length; i++) {
            // Calculate the redeemer's slice of asset holdings
            payoutAmounts_[i] = __getVaultAssetBalance(
                address(vaultProxyContract),
                payoutAssets_[i]
            )
                .mul(_sharesQuantity)
                .div(sharesSupply);

            // Transfer payout asset to redeemer
            vaultProxyContract.withdrawAssetTo(payoutAssets_[i], _redeemer, payoutAmounts_[i]);
        }

        emit SharesRedeemed(_redeemer, _sharesQuantity, payoutAssets_, payoutAmounts_);

        return (payoutAssets_, payoutAmounts_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets a list of addresses from the `allowedBuySharesCallers` variable
    /// @return allowedCallers_ The list of addresses from the `allowedBuySharesCallers` variable
    function getAllowedBuySharesCallers()
        external
        view
        returns (address[] memory allowedCallers_)
    {
        allowedCallers_ = new address[](allowedBuySharesCallers.length());
        for (uint256 i; i < allowedCallers_.length; i++) {
            allowedCallers_[i] = allowedBuySharesCallers.at(i);
        }

        return allowedCallers_;
    }

    /// @notice Gets the `denominationAsset` variable
    /// @return denominationAsset_ The `denominationAsset` variable value
    function getDenominationAsset() external view returns (address denominationAsset_) {
        return denominationAsset;
    }

    /// @notice Gets the routes for the various contracts used by all funds
    /// @return feeManager_ The `FEE_MANAGER` variable value
    /// @return fundDeployer_ The `FUND_DEPLOYER` variable value
    /// @return fundLifecycleLib_ The `FUND_LIFECYCLE_LIB` variable value
    /// @return integrationManager_ The `INTEGRATION_MANAGER` variable value
    /// @return permissionedVaultActionLib_ The `PERMISSIONED_VAULT_ACTION_LIB` variable value
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getLibRoutes()
        external
        view
        returns (
            address feeManager_,
            address fundDeployer_,
            address fundLifecycleLib_,
            address integrationManager_,
            address permissionedVaultActionLib_,
            address policyManager_,
            address valueInterpreter_
        )
    {
        return (
            FEE_MANAGER,
            FUND_DEPLOYER,
            FUND_LIFECYCLE_LIB,
            INTEGRATION_MANAGER,
            PERMISSIONED_VAULT_ACTION_LIB,
            POLICY_MANAGER,
            VALUE_INTERPRETER
        );
    }

    /// @notice Gets the `overridePause` variable
    /// @return overridePause_ The `overridePause` variable value
    function getOverridePause() external view returns (bool overridePause_) {
        return overridePause;
    }

    /// @notice Gets the `sharesActionTimelock` variable
    /// @return sharesActionTimelock_ The `sharesActionTimelock` variable value
    function getSharesActionTimelock() external view returns (uint256 sharesActionTimelock_) {
        return sharesActionTimelock;
    }

    /// @notice Gets the `vaultProxy` variable
    /// @return vaultProxy_ The `vaultProxy` variable value
    function getVaultProxy() external view override returns (address vaultProxy_) {
        return vaultProxy;
    }

    /// @notice Checks if an account is a member of the `allowedBuySharesCallers` variable
    /// @param _who The account to check
    /// @return isAllowedCaller_ True if the account is in the `allowedBuySharesCallers` variable
    function isAllowedBuySharesCaller(address _who) public view returns (bool isAllowedCaller_) {
        return allowedBuySharesCallers.contains(_who);
    }
}
