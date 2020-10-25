// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../extensions/IExtension.sol";
import "../../../extensions/fee-manager/IFeeManager.sol";
import "../../../extensions/policy-manager/IPolicyManager.sol";
import "../../../infrastructure/engine/AmguConsumer.sol";
import "../../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import "../../../interfaces/IERC20Extended.sol";
import "../../../utils/AddressArrayLib.sol";
import "../../fund-deployer/IFundDeployer.sol";
import "../vault/IVault.sol";
import "./ComptrollerStorage.sol";
import "./IComptroller.sol";
import "./IPermissionedVaultActionLib.sol";

/// @title ComptrollerLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The core logic library shared by all funds
/// @dev All state-changing functions should be marked as onlyDelegateCall,
/// unless called directly by the FundDeployer
contract ComptrollerLib is ComptrollerStorage, IComptroller, AmguConsumer {
    using AddressArrayLib for address[];
    using SafeMath for uint256;
    using SafeERC20 for IERC20Extended;

    event MigratedSharesDuePaid(uint256 sharesDue);

    event OverridePauseSet(bool indexed overridePause);

    event PreRedeemSharesHookFailed(
        bytes failureReturnData,
        address redeemer,
        uint256 sharesQuantity
    );

    event SharesBought(
        address indexed caller,
        address indexed buyer,
        uint256 investmentAmount,
        uint256 sharesBought,
        uint256 sharesReceived
    );

    event SharesRedeemed(
        address indexed redeemer,
        uint256 sharesQuantity,
        address[] receivedAssets,
        uint256[] receivedAssetQuantities
    );

    event VaultProxySet(address vaultProxy);

    // Constants - shared by all proxies
    uint256 private constant SHARES_UNIT = 10**18;
    address private immutable FUND_DEPLOYER;
    address private immutable FEE_MANAGER;
    address private immutable INTEGRATION_MANAGER;
    address private immutable PERMISSIONED_VAULT_ACTION_LIB;
    address private immutable POLICY_MANAGER;
    address private immutable PRIMITIVE_PRICE_FEED;
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

    modifier locksAtomicSharesAction(address _account) {
        __assertNotAtomicSharesAction(_account);
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

    modifier onlyFundDeployer() {
        __assertIsFundDeployer(msg.sender);
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

    function __assertIsActive() private view {
        require(isActive(), "Fund not active");
    }

    function __assertIsFundDeployer(address _who) private view {
        require(_who == FUND_DEPLOYER, "Only FundDeployer callable");
    }

    function __assertIsDelegateCall() private view {
        require(!isLib, "Only delegate callable");
    }

    function __assertIsOwner(address _who) private view {
        require(_who == IVault(vaultProxy).getOwner(), "Only fund owner callable");
    }

    function __assertNotPaused() private view {
        require(!__fundIsPaused(), "Fund is paused");
    }

    function __assertNotReentranceLocked() private view {
        require(!reentranceLocked, "Re-entrance");
    }

    function __assertNotAtomicSharesAction(address _account) private view {
        require(acctToLastSharesAction[_account] < block.timestamp, "Atomic shares action");
    }

    function __assertPermissionedVaultActionNotAllowed() private view {
        require(!permissionedVaultActionAllowed, "Vault action re-entrance");
    }

    constructor(
        address _fundDeployer,
        address _valueInterpreter,
        address _primitivePriceFeed,
        address _feeManager,
        address _integrationManager,
        address _policyManager,
        address _permissionedVaultActionLib,
        address _engine
    ) public AmguConsumer(_engine) {
        FEE_MANAGER = _feeManager;
        FUND_DEPLOYER = _fundDeployer;
        INTEGRATION_MANAGER = _integrationManager;
        PERMISSIONED_VAULT_ACTION_LIB = _permissionedVaultActionLib;
        POLICY_MANAGER = _policyManager;
        PRIMITIVE_PRICE_FEED = _primitivePriceFeed;
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
    ) external onlyNotPaused onlyActive locksReentrance allowsPermissionedVaultAction {
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
        require(success, string(returnData));
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

    /// @notice Checks whether the fund is active
    /// @return isActive_ True if the fund is active
    /// @dev Since vaultProxy is set during activate(),
    /// we can check that var rather than storing additional state
    function isActive() public view returns (bool isActive_) {
        return vaultProxy != address(0);
    }

    /// @dev Helper to check whether the release is paused and there is no local override
    function __fundIsPaused() private view returns (bool) {
        return
            !overridePause &&
            IFundDeployer(FUND_DEPLOYER).getReleaseStatus() == IFundDeployer.ReleaseStatus.Paused;
    }

    ///////////////
    // LIFECYCLE //
    ///////////////

    // Ordered function calls for stages in a fund lifecycle:
    // 1. init() - called on deployment of ComptrollerProxy
    // 2. activate() - called upon linking a VaultProxy to activate the fund
    // 3. destruct() - called upon migrating to another release

    /// @dev Pseudo-constructor per proxy.
    /// No need to assert access because this is called atomically on deployment,
    /// and once it's called, it cannot be called again.
    function init(
        address _denominationAsset,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external override onlyDelegateCall {
        require(denominationAsset == address(0), "init: Already initialized");

        // Configure core
        require(
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_denominationAsset),
            "init: Bad denomination asset"
        );
        denominationAsset = _denominationAsset;

        // Configure extensions
        if (_feeManagerConfigData.length > 0) {
            IExtension(FEE_MANAGER).setConfigForFund(_feeManagerConfigData);
        }
        if (_policyManagerConfigData.length > 0) {
            IExtension(POLICY_MANAGER).setConfigForFund(_policyManagerConfigData);
        }
    }

    /// @notice Activates the fund after running pre-activation logic
    /// @param _vaultProxy The VaultProxy to attach to the fund
    /// @param _isMigration True if a migrated fund is being activated
    /// @dev No need to assert anything beyond FundDeployer access.
    function activate(address _vaultProxy, bool _isMigration) external override onlyFundDeployer {
        vaultProxy = _vaultProxy;

        emit VaultProxySet(_vaultProxy);

        if (_isMigration) {
            // Distribute any shares in the VaultProxy to the fund owner.
            // This is a mechanism to ensure that even in the edge case of a fund being unable
            // to payout fee shares owed during migration, these shares are not lost.
            uint256 sharesDue = IERC20(_vaultProxy).balanceOf(_vaultProxy);
            if (sharesDue > 0) {
                IVault(_vaultProxy).transferShares(
                    _vaultProxy,
                    IVault(_vaultProxy).getOwner(),
                    sharesDue
                );

                emit MigratedSharesDuePaid(sharesDue);
            }
        }

        // Activate extensions
        IExtension(FEE_MANAGER).activateForFund(_isMigration);
        IExtension(INTEGRATION_MANAGER).activateForFund(_isMigration);
        IExtension(POLICY_MANAGER).activateForFund(_isMigration);
    }

    /// @notice Remove the config for a fund
    /// @dev No need to assert anything beyond FundDeployer access.
    /// Calling onlyNotPaused here rather than in the FundDeployer allows
    /// the owner to potentially override the pause and rescue unpaid fees.
    function destruct()
        external
        override
        onlyFundDeployer
        onlyNotPaused
        allowsPermissionedVaultAction
    {
        // Deactivate the extensions
        IExtension(FEE_MANAGER).deactivateForFund();
        IExtension(INTEGRATION_MANAGER).deactivateForFund();
        IExtension(POLICY_MANAGER).deactivateForFund();

        // Delete storage of ComptrollerProxy
        // There should never be ETH in this contract, but if there is,
        // we can send to the VaultProxy.
        selfdestruct(payable(vaultProxy));
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
    function calcGrossShareValue() public onlyDelegateCall returns (uint256 grossShareValue_) {
        return
            __calcGrossShareValue(
                calcGav(false),
                IERC20Extended(vaultProxy).totalSupply(),
                10**uint256(IERC20Extended(denominationAsset).decimals())
            );
    }

    /// @notice Calculates the net value of 1 unit of shares in the fund's denomination asset
    /// @return netShareValue_ The amount of the denomination asset per share
    /// @dev Accounts for fees outstanding. This is a convenience function for external consumption
    /// that can be used to determine the cost of purchasing shares at any given point in time.
    function calcNetShareValue()
        external
        onlyDelegateCall
        allowsPermissionedVaultAction
        returns (uint256 netShareValue_)
    {
        IFeeManager(FEE_MANAGER).settleFees(IFeeManager.FeeHook.Continuous, "");

        return calcGrossShareValue();
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
        locksAtomicSharesAction(_buyer)
        locksReentrance
        allowsPermissionedVaultAction
        amguPayable
        returns (uint256 sharesReceived_)
    {
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
        locksAtomicSharesAction(_redeemer)
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

    /// @notice Gets the `denominationAsset` variable
    /// @return denominationAsset_ The `denominationAsset` variable value
    function getDenominationAsset() external view returns (address denominationAsset_) {
        return denominationAsset;
    }

    /// @notice Gets the `overridePause` variable
    /// @return overridePause_ The `overridePause` variable value
    function getOverridePause() external view returns (bool overridePause_) {
        return overridePause;
    }

    /// @notice Gets the routes for the various contracts used by all funds
    /// @return feeManager_ The `FEE_MANAGER` variable value
    /// @return fundDeployer_ The `FUND_DEPLOYER` variable value
    /// @return integrationManager_ The `INTEGRATION_MANAGER` variable value
    /// @return permissionedVaultActionLib_ The `PERMISSIONED_VAULT_ACTION_LIB` variable value
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    /// @return primitivePriceFeed_ The `PRIMITIVE_PRICE_FEED` variable value
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getLibRoutes()
        external
        view
        returns (
            address feeManager_,
            address fundDeployer_,
            address integrationManager_,
            address permissionedVaultActionLib_,
            address policyManager_,
            address primitivePriceFeed_,
            address valueInterpreter_
        )
    {
        return (
            FEE_MANAGER,
            FUND_DEPLOYER,
            INTEGRATION_MANAGER,
            PERMISSIONED_VAULT_ACTION_LIB,
            POLICY_MANAGER,
            PRIMITIVE_PRICE_FEED,
            VALUE_INTERPRETER
        );
    }

    /// @notice Gets the `vaultProxy` variable
    /// @return vaultProxy_ The `vaultProxy` variable value
    function getVaultProxy() external view override returns (address vaultProxy_) {
        return vaultProxy;
    }
}
