// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../../extensions/IExtension.sol";
import "../../../extensions/fee-manager/IFeeManager.sol";
import "../../../extensions/policy-manager/IPolicyManager.sol";
import "../../../infrastructure/engine/AmguConsumer.sol";
import "../../../infrastructure/value-interpreter/IValueInterpreter.sol";
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
    using SafeERC20 for ERC20;

    // Constants and immutables - shared by all proxies
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

    modifier locksReentrance() {
        __assertNotReentranceLocked();
        reentranceLocked = true;
        _;
        reentranceLocked = false;
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

    modifier timelockedSharesAction(address _account) {
        __assertSharesActionNotTimelocked(_account);
        _;
        acctToLastSharesAction[_account] = block.timestamp;
    }

    // ASSERTION HELPERS

    // Modifiers are inefficient in terms of contract size,
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

    /// @notice Calls a specified action on an Extension
    /// @param _extension The Extension contract to call (e.g., FeeManager)
    /// @param _actionId An ID representing the action to take on the extension (see extension)
    /// @param _callArgs The encoded data for the call
    /// @dev Used to route arbitrary calls, so that msg.sender is the ComptrollerProxy
    /// (for access control). Uses a mutex of sorts that allows "permissioned vault actions"
    /// during calls originating from this function.
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

    /// @notice Makes a permissioned, state-changing call on the VaultProxy contract
    /// @param _action The enum representing the VaultAction to perform on the VaultProxy
    /// @param _actionData The call data for the action to perform
    function permissionedVaultAction(
        IPermissionedVaultActionLib.VaultAction _action,
        bytes calldata _actionData
    ) external override {
        (bool success, bytes memory returnData) = PERMISSIONED_VAULT_ACTION_LIB.delegatecall(
            abi.encodeWithSelector(
                IPermissionedVaultActionLib.dispatchAction.selector,
                _action,
                _actionData
            )
        );
        __assertLowLevelCall(success, returnData);
    }

    /// @notice Sets or unsets an override on a release-wide pause
    /// @param _nextOverridePause True if the pause should be overrode
    /// @dev Does not use onlyDelegateCall, as onlyOwner will only be valid in delegate calls
    function setOverridePause(bool _nextOverridePause) external onlyOwner {
        require(_nextOverridePause != overridePause, "setOverridePause: Value already set");

        overridePause = _nextOverridePause;

        emit OverridePauseSet(_nextOverridePause);
    }

    /// @notice Makes an arbitrary call with the VaultProxy contract as the sender
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

        IVault(vaultProxy).callOnContract(_contract, abi.encodePacked(_selector, _callData));
    }

    /// @dev Helper to check whether the release is paused, and that there is no local override
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
        address[] calldata _allowedBuySharesCallers
    ) external override {
        (bool success, bytes memory returnData) = FUND_LIFECYCLE_LIB.delegatecall(
            abi.encodeWithSelector(
                IFundLifecycleLib.init.selector,
                _denominationAsset,
                _sharesActionTimelock,
                _allowedBuySharesCallers
            )
        );
        __assertLowLevelCall(success, returnData);
    }

    /// @dev Delegated to FundLifecycleLib. See library for Natspec.
    function configureExtensions(
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external override {
        (bool success, bytes memory returnData) = FUND_LIFECYCLE_LIB.delegatecall(
            abi.encodeWithSelector(
                IFundLifecycleLib.configureExtensions.selector,
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
    /// @return gav_ The fund GAV
    /// @return isValid_ True if the conversion rates used to derive the GAV are all valid
    /// @dev onlyDelegateCall not necessary here, as the only potential state-changing actions
    /// are external to the protocol
    function calcGav() public returns (uint256 gav_, bool isValid_) {
        address vaultProxyAddress = vaultProxy;
        address[] memory assets = IVault(vaultProxyAddress).getTrackedAssets();
        uint256[] memory balances = new uint256[](assets.length);
        for (uint256 i; i < assets.length; i++) {
            balances[i] = __getVaultAssetBalance(vaultProxyAddress, assets[i]);
        }

        return
            IValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetsTotalValue(
                assets,
                balances,
                denominationAsset
            );
    }

    /// @notice Calculates the gross value of 1 unit of shares in the fund's denomination asset
    /// @return grossShareValue_ The amount of the denomination asset per share
    /// @return isValid_ True if the conversion rates to derive the value are all valid
    /// @dev onlyDelegateCall not necessary here, as the only potential state-changing actions
    /// are external to the protocol. Does not account for any fees outstanding.
    function calcGrossShareValue()
        external
        override
        returns (uint256 grossShareValue_, bool isValid_)
    {
        uint256 gav;
        (gav, isValid_) = calcGav();

        grossShareValue_ = __calcGrossShareValue(
            gav,
            ERC20(vaultProxy).totalSupply(),
            10**uint256(ERC20(denominationAsset).decimals())
        );

        return (grossShareValue_, isValid_);
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
        return ERC20(_asset).balanceOf(_vaultProxy);
    }

    ///////////////////
    // PARTICIPATION //
    ///////////////////

    // BUY SHARES

    /// @notice Add accounts that are allowed to call the `buyShares` function
    /// @param _callersToAdd The accounts to add
    /// @dev This could be used instead of an InvestorWhitelist policy, but in practice
    /// it will allow adding "shares requestor" contracts, which will allow much more granular
    /// regulation over incoming investments into a fund.
    function addAllowedBuySharesCallers(address[] calldata _callersToAdd) external onlyOwner {
        __addAllowedBuySharesCallers(_callersToAdd);
    }

    /// @notice Buy shares in the fund for a specified user
    /// @param _buyer The account for which to buy shares
    /// @param _investmentAmount The amount of the fund's denomination asset with which to buy shares
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the specified _investmentAmount
    /// @return sharesReceived_ The actual amount of shares received by the _buyer
    /// @dev Does not use onlyDelegateCall, as onlyActive will only be valid in delegate calls
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
        return __buyShares(_buyer, _investmentAmount, _minSharesQuantity);
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

    /// @dev Avoids the stack-too-deep error in buyShares()
    function __buyShares(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    ) private returns (uint256 sharesReceived_) {
        require(
            allowedBuySharesCallers.length() == 0 || allowedBuySharesCallers.contains(msg.sender),
            "buyShares: Unauthorized caller"
        );

        (uint256 preBuySharesGav, bool gavIsValid) = calcGav();
        require(gavIsValid, "buyShares: Invalid GAV");

        // Gives Extensions a chance to run logic prior to the minting of bought shares
        __preBuySharesHook(_buyer, _investmentAmount, _minSharesQuantity, preBuySharesGav);

        IVault vaultProxyContract = IVault(vaultProxy);
        ERC20 sharesContract = ERC20(address(vaultProxyContract));
        ERC20 denominationAssetContract = ERC20(denominationAsset);

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

        // Gives Extensions a chance to run logic after the minting of bought shares
        __postBuySharesHook(_buyer, _investmentAmount, sharesBought);

        // The number of actual shares received may differ from shares bought due to
        // how the PostBuyShares hooks are invoked by Extensions (i.e., fees)
        sharesReceived_ = sharesContract.balanceOf(_buyer).sub(prevBuyerShares);
        require(
            sharesReceived_ >= _minSharesQuantity,
            "buyShares: Shares received < _minSharesQuantity"
        );

        // Transfer the investment asset to the fund
        denominationAssetContract.safeTransferFrom(
            msg.sender,
            address(vaultProxyContract),
            _investmentAmount
        );
        vaultProxyContract.addTrackedAsset(address(denominationAssetContract));

        emit SharesBought(msg.sender, _buyer, _investmentAmount, sharesBought, sharesReceived_);

        return sharesReceived_;
    }

    /// @dev Helper to calculate the quantity of shares buyable for a given investment amount.
    /// Avoids the stack-too-deep error.
    function __calcBuyableSharesQuantity(
        ERC20 _sharesContract,
        ERC20 _denominationAssetContract,
        uint256 _investmentAmount,
        uint256 _gav
    ) private view returns (uint256 sharesQuantity_) {
        uint256 denominationAssetUnit = 10**uint256(_denominationAssetContract.decimals());
        return
            _investmentAmount.mul(denominationAssetUnit).div(
                __calcGrossShareValue(_gav, _sharesContract.totalSupply(), denominationAssetUnit)
            );
    }

    /// @dev Helper for Extension actions immediately prior to issuing shares
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

    /// @dev Helper for Extension actions immediately after issuing shares
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
    /// @return payoutAssets_ The assets paid out to the redeemer
    /// @return payoutAmounts_ The amount of each asset paid out to the redeemer
    /// @dev See __redeemShares() for further detail
    function redeemShares()
        external
        returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)
    {
        return
            __redeemShares(
                msg.sender,
                ERC20(vaultProxy).balanceOf(msg.sender),
                new address[](0),
                new address[](0)
            );
    }

    /// @notice Redeem a specified quantity of the sender's shares for a proportionate slice of
    /// the fund's assets, optionally specifying additional assets and assets to skip.
    /// @param _sharesQuantity The quantity of shares to redeem
    /// @param _additionalAssets Additional (non-tracked) assets to claim
    /// @param _assetsToSkip Tracked assets to forfeit
    /// @return payoutAssets_ The assets paid out to the redeemer
    /// @return payoutAmounts_ The amount of each asset paid out to the redeemer
    /// @dev Any claim to passed _assetsToSkip will be forfeited entirely. This should generally
    /// only be exercised if a bad asset is causing redemption to fail.
    function redeemSharesDetailed(
        uint256 _sharesQuantity,
        address[] calldata _additionalAssets,
        address[] calldata _assetsToSkip
    ) external returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_) {
        return __redeemShares(msg.sender, _sharesQuantity, _additionalAssets, _assetsToSkip);
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

    /// @dev Helper to redeem shares.
    /// This function should never fail without a way to bypass the failure, which is assured
    /// through two mechanisms:
    /// 1. The FeeManager is called with the try/catch pattern to assure that calls to it
    /// can never block redemption.
    /// 2. If a token fails upon transfer(), that token can be skipped (and its balance forfeited)
    /// by explicitly specifying _assetsToSkip.
    /// Because of these assurances, shares should always be redeemable, with the exception
    /// of the timelock period on shares actions that must be respected.
    function __redeemShares(
        address _redeemer,
        uint256 _sharesQuantity,
        address[] memory _additionalAssets,
        address[] memory _assetsToSkip
    )
        private
        onlyDelegateCall
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
            // Note that if a fee with `SettlementType.Direct` is charged here (i.e., not `Mint`),
            // then those fee shares will be transferred from the user's balance rather
            // than reallocated from the sharesQuantity being redeemed.
            __preRedeemSharesHook(_redeemer, _sharesQuantity);
        }

        IVault vaultProxyContract = IVault(vaultProxy);
        ERC20 sharesContract = ERC20(address(vaultProxyContract));

        // Check the shares quantity against the user's balance after settling fees
        require(
            _sharesQuantity <= sharesContract.balanceOf(_redeemer),
            "__redeemShares: Insufficient shares"
        );

        // Parse the payout assets given optional params to add or skip assets.
        // Note that there is no validation that the _additionalAssets are known assets to
        // the protocol. This means that the redeemer could specify a malicious asset,
        // but since all state-changing, user-callable functions on this contract share the
        // non-reentrant modifier, there is nowhere to perform a reentrancy attack.
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
