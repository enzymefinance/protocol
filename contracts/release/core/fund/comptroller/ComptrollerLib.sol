// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../../persistent/dispatcher/IDispatcher.sol";
import "../../../extensions/IExtension.sol";
import "../../../extensions/fee-manager/IFeeManager.sol";
import "../../../extensions/policy-manager/IPolicyManager.sol";
import "../../../infrastructure/asset-finality/IAssetFinalityResolver.sol";
import "../../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import "../../../utils/AddressArrayLib.sol";
import "../../fund-deployer/IFundDeployer.sol";
import "../external-positions/IExternalPosition.sol";
import "../vault/IVault.sol";
import "./IComptroller.sol";

/// @title ComptrollerLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The core logic library shared by all funds
contract ComptrollerLib is IComptroller {
    using AddressArrayLib for address[];
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    event MigratedSharesDuePaid(uint256 sharesDue);

    event OverridePauseSet(bool indexed overridePause);

    event PreRedeemSharesHookFailed(
        bytes failureReturnData,
        address redeemer,
        uint256 sharesAmount
    );

    event SharesBought(
        address indexed buyer,
        uint256 investmentAmount,
        uint256 sharesIssued,
        uint256 sharesReceived
    );

    event SharesRedeemed(
        address indexed redeemer,
        address indexed recipient,
        uint256 sharesAmount,
        address[] receivedAssets,
        uint256[] receivedAssetAmounts
    );

    event VaultProxySet(address vaultProxy);

    // Constants and immutables - shared by all proxies
    uint256 private constant ONE_HUNDRED_PERCENT = 10000;
    uint256 private constant SHARES_UNIT = 10**18;
    address private immutable ASSET_FINALITY_RESOLVER;
    address private immutable DISPATCHER;
    address private immutable EXTERNAL_POSITION_MANAGER;
    address private immutable FUND_DEPLOYER;
    address private immutable FEE_MANAGER;
    address private immutable INTEGRATION_MANAGER;
    address private immutable MLN_TOKEN;
    address private immutable PRIMITIVE_PRICE_FEED;
    address private immutable POLICY_MANAGER;
    address private immutable VALUE_INTERPRETER;

    // Pseudo-constants (can only be set once)

    address internal denominationAsset;
    address internal vaultProxy;
    // True only for the one non-proxy
    bool internal isLib;

    // Storage

    // Allows a fund owner to override a release-level pause
    bool internal overridePause;
    // A reverse-mutex, granting atomic permission for particular contracts to make vault calls
    bool internal permissionedVaultActionAllowed;
    // A mutex to protect against reentrancy
    bool internal reentranceLocked;
    // A timelock after the last time shares were bought for an account
    // that must expire before that account transfers or redeems their shares
    uint256 internal sharesActionTimelock;
    mapping(address => uint256) internal acctToLastSharesBoughtTimestamp;

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

    modifier onlyNotPaused() {
        __assertNotPaused();
        _;
    }

    modifier onlyFundDeployer() {
        __assertIsFundDeployer(msg.sender);
        _;
    }

    modifier onlyOwner() {
        __assertIsOwner(msg.sender);
        _;
    }

    // ASSERTION HELPERS

    // Modifiers are inefficient in terms of contract size,
    // so we use helper functions to prevent repetitive inlining of expensive string values.

    function __assertIsFundDeployer(address _who) private view {
        require(_who == FUND_DEPLOYER, "Only FundDeployer callable");
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

    function __assertPermissionedVaultActionNotAllowed() private view {
        require(!permissionedVaultActionAllowed, "Vault action re-entrance");
    }

    function __assertSharesActionNotTimelocked(address _vaultProxy, address _account)
        private
        view
    {
        uint256 lastSharesBoughtTimestamp = getLastSharesBoughtTimestampForAccount(_account);

        require(
            lastSharesBoughtTimestamp == 0 ||
                block.timestamp.sub(lastSharesBoughtTimestamp) >= sharesActionTimelock ||
                __hasPendingMigrationOrReconfiguration(_vaultProxy),
            "Shares action timelocked"
        );
    }

    constructor(
        address _dispatcher,
        address _fundDeployer,
        address _valueInterpreter,
        address _externalPositionManager,
        address _feeManager,
        address _integrationManager,
        address _policyManager,
        address _primitivePriceFeed,
        address _assetFinalityResolver,
        address _mlnToken
    ) public {
        ASSET_FINALITY_RESOLVER = _assetFinalityResolver;
        DISPATCHER = _dispatcher;
        EXTERNAL_POSITION_MANAGER = _externalPositionManager;
        FEE_MANAGER = _feeManager;
        FUND_DEPLOYER = _fundDeployer;
        INTEGRATION_MANAGER = _integrationManager;
        MLN_TOKEN = _mlnToken;
        PRIMITIVE_PRICE_FEED = _primitivePriceFeed;
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
    function callOnExtension(
        address _extension,
        uint256 _actionId,
        bytes calldata _callArgs
    ) external override onlyNotPaused locksReentrance allowsPermissionedVaultAction {
        require(
            _extension == FEE_MANAGER ||
                _extension == INTEGRATION_MANAGER ||
                _extension == EXTERNAL_POSITION_MANAGER,
            "callOnExtension: _extension invalid"
        );

        IExtension(_extension).receiveCallFromComptroller(msg.sender, _actionId, _callArgs);
    }

    /// @notice Sets or unsets an override on a release-wide pause
    /// @param _nextOverridePause True if the pause should be overrode
    function setOverridePause(bool _nextOverridePause) external onlyOwner {
        overridePause = _nextOverridePause;

        emit OverridePauseSet(_nextOverridePause);
    }

    /// @notice Makes an arbitrary call with the VaultProxy contract as the sender
    /// @param _contract The contract to call
    /// @param _selector The selector to call
    /// @param _encodedArgs The encoded arguments for the call
    function vaultCallOnContract(
        address _contract,
        bytes4 _selector,
        bytes calldata _encodedArgs
    ) external onlyNotPaused onlyOwner {
        require(
            IFundDeployer(FUND_DEPLOYER).isAllowedVaultCall(
                _contract,
                _selector,
                keccak256(_encodedArgs)
            ),
            "vaultCallOnContract: Not allowed"
        );

        IVault(vaultProxy).callOnContract(_contract, abi.encodePacked(_selector, _encodedArgs));
    }

    /// @dev Helper to check whether the release is paused, and that there is no local override
    function __fundIsPaused() private view returns (bool) {
        return
            IFundDeployer(FUND_DEPLOYER).getReleaseStatus() ==
            IFundDeployer.ReleaseStatus.Paused &&
            !overridePause;
    }

    /// @dev Helper to check if a VaultProxy has a pending migration or reconfiguration request
    function __hasPendingMigrationOrReconfiguration(address _vaultProxy)
        private
        view
        returns (bool hasPendingMigrationOrReconfiguration)
    {
        return
            IDispatcher(DISPATCHER).hasMigrationRequest(_vaultProxy) ||
            IFundDeployer(FUND_DEPLOYER).hasReconfigurationRequest(_vaultProxy);
    }

    //////////////////
    // PROTOCOL FEE //
    //////////////////

    /// @notice Buys back shares collected as protocol fee at a discounted shares price, using MLN
    /// @param _sharesAmount The amount of shares to buy back
    /// TODO: allow a manager also?
    function buyBackProtocolFeeShares(uint256 _sharesAmount) external onlyOwner {
        address denominationAssetCopy = denominationAsset;
        address vaultProxyCopy = vaultProxy;

        uint256 gav = calcGav(true);
        uint256 grossShareValue = __calcGrossShareValue(
            gav,
            ERC20(vaultProxyCopy).totalSupply(),
            10**uint256(ERC20(denominationAssetCopy).decimals())
        );

        uint256 buybackValueInDenominationAsset = grossShareValue.mul(_sharesAmount).div(
            SHARES_UNIT
        );

        uint256 buybackValueInMln = IValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetValue(
            denominationAssetCopy,
            buybackValueInDenominationAsset,
            getMlnToken()
        );

        IVault(vaultProxyCopy).buyBackProtocolFeeShares(_sharesAmount, buybackValueInMln, gav);
    }

    ////////////////////////////////
    // PERMISSIONED VAULT ACTIONS //
    ////////////////////////////////

    /// @notice Allows specified assets to be untracked, unsetting them as persistently tracked
    /// @param _assets The asset to allow to untrack
    /// @dev No need to check onlyNotPaused as there is no risk of value loss
    function allowUntrackingAssets(address[] memory _assets) external onlyOwner {
        for (uint256 i; i < _assets.length; i++) {
            require(
                _assets[i] != denominationAsset,
                "allowUntrackingAssets: denominationAsset not allowed"
            );
        }

        IVault(vaultProxy).allowUntrackingAssets(_assets);
    }

    /// @notice Makes a permissioned, state-changing call on the VaultProxy contract
    /// @param _action The enum representing the VaultAction to perform on the VaultProxy
    /// @param _actionData The call data for the action to perform
    function permissionedVaultAction(IVault.VaultAction _action, bytes calldata _actionData)
        external
        override
        onlyNotPaused
    {
        __assertPermissionedVaultAction(msg.sender, _action);

        // Validate action as needed
        if (_action == IVault.VaultAction.RemovePersistentlyTrackedAsset) {
            require(
                abi.decode(_actionData, (address)) != denominationAsset,
                "permissionedVaultAction: Cannot untrack denomination asset"
            );
        }

        IVault(vaultProxy).receiveValidatedVaultAction(_action, _actionData);
    }

    /// @dev Helper to assert that a caller is allowed to perform a particular VaultAction
    function __assertPermissionedVaultAction(address _caller, IVault.VaultAction _action)
        private
        view
    {
        require(
            permissionedVaultActionAllowed,
            "__assertPermissionedVaultAction: No action allowed"
        );

        // Calls are roughly ordered by likely frequency
        if (_caller == INTEGRATION_MANAGER) {
            require(
                _action == IVault.VaultAction.AddTrackedAsset ||
                    _action == IVault.VaultAction.RemoveTrackedAsset ||
                    _action == IVault.VaultAction.WithdrawAssetTo ||
                    _action == IVault.VaultAction.ApproveAssetSpender ||
                    _action == IVault.VaultAction.AddPersistentlyTrackedAsset ||
                    _action == IVault.VaultAction.RemovePersistentlyTrackedAsset,
                "__assertPermissionedVaultAction: Not allowed"
            );
        } else if (_caller == FEE_MANAGER) {
            require(
                _action == IVault.VaultAction.MintShares ||
                    _action == IVault.VaultAction.BurnShares ||
                    _action == IVault.VaultAction.TransferShares,
                "__assertPermissionedVaultAction: Not allowed"
            );
        } else if (_caller == EXTERNAL_POSITION_MANAGER) {
            require(
                _action == IVault.VaultAction.CallOnExternalPosition ||
                    _action == IVault.VaultAction.AddExternalPosition ||
                    _action == IVault.VaultAction.RemoveExternalPosition,
                "__assertPermissionedVaultAction: Not allowed"
            );
        } else {
            revert("__assertPermissionedVaultAction: Not a valid actor");
        }
    }

    ///////////////
    // LIFECYCLE //
    ///////////////

    // Ordered by execution in the lifecycle

    /// @notice Initializes a fund with its core config
    /// @param _denominationAsset The asset in which the fund's value should be denominated
    /// @param _sharesActionTimelock The minimum number of seconds between any two "shares actions"
    /// (buying or selling shares) by the same user
    /// @dev Pseudo-constructor per proxy.
    /// No need to assert access because this is called atomically on deployment,
    /// and once it's called, it cannot be called again.
    function init(address _denominationAsset, uint256 _sharesActionTimelock) external override {
        require(denominationAsset == address(0), "init: Already initialized");
        require(
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_denominationAsset),
            "init: Bad denomination asset"
        );

        denominationAsset = _denominationAsset;
        sharesActionTimelock = _sharesActionTimelock;
    }

    /// @notice Configure the extensions of a fund
    /// @param _feeManagerConfigData Encoded config for fees to enable
    /// @param _policyManagerConfigData Encoded config for policies to enable
    /// @dev No need to assert anything beyond FundDeployer access.
    /// Called atomically with init(), but after ComptrollerLib has been deployed,
    /// giving access to its state and interface
    function configureExtensions(
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external override onlyFundDeployer {
        if (_feeManagerConfigData.length > 0) {
            IExtension(FEE_MANAGER).setConfigForFund(_feeManagerConfigData);
        }
        if (_policyManagerConfigData.length > 0) {
            IExtension(POLICY_MANAGER).setConfigForFund(_policyManagerConfigData);
        }
    }

    /// @notice Sets the VaultProxy
    /// @param _vaultProxy The VaultProxy contract
    /// @dev No need to assert anything beyond FundDeployer access.
    /// Called atomically with init(), but after ComptrollerLib and VaultLib have both been deployed.
    function setVaultProxy(address _vaultProxy) external override onlyFundDeployer {
        vaultProxy = _vaultProxy;

        emit VaultProxySet(_vaultProxy);
    }

    /// @notice Runs atomic logic after a ComptrollerProxy has become its vaultProxy's `accessor`
    /// @param _isMigration True if a migrated fund is being activated
    /// @dev No need to assert anything beyond FundDeployer access.
    function activate(bool _isMigration) external override onlyFundDeployer {
        address vaultProxyCopy = vaultProxy;

        if (_isMigration) {
            // Distribute any shares in the VaultProxy to the fund owner.
            // This is a mechanism to ensure that even in the edge case of a fund being unable
            // to payout fee shares owed during migration, these shares are not lost.
            uint256 sharesDue = ERC20(vaultProxyCopy).balanceOf(vaultProxyCopy);
            if (sharesDue > 0) {
                IVault(vaultProxyCopy).transferShares(
                    vaultProxyCopy,
                    IVault(vaultProxyCopy).getOwner(),
                    sharesDue
                );

                emit MigratedSharesDuePaid(sharesDue);
            }
        }

        // TODO: do we want to handle a corner case of a fund that is at the max assets limit
        // but does already track the denominationAsset?
        IVault(vaultProxyCopy).addPersistentlyTrackedAsset(denominationAsset);

        // Activate extensions
        IExtension(EXTERNAL_POSITION_MANAGER).activateForFund(_isMigration);
        IExtension(FEE_MANAGER).activateForFund(_isMigration);
        IExtension(INTEGRATION_MANAGER).activateForFund(_isMigration);
        IExtension(POLICY_MANAGER).activateForFund(_isMigration);
    }

    /// @notice Wind down and destroy a ComptrollerProxy that is active
    /// @dev No need to assert anything beyond FundDeployer access.
    /// Calling onlyNotPaused here rather than in the FundDeployer allows
    /// the owner to potentially override the pause and rescue unpaid fees.
    function destructActivated()
        external
        override
        onlyFundDeployer
        onlyNotPaused
        allowsPermissionedVaultAction
    {
        // Deactivate extensions as-necessary
        IExtension(FEE_MANAGER).deactivateForFund();

        // TODO: use try/catch pattern?
        IVault(vaultProxy).payProtocolFee();

        __selfDestruct();
    }

    /// @notice Destroy a ComptrollerProxy that has not been activated
    function destructUnactivated() external override onlyFundDeployer {
        __selfDestruct();
    }

    /// @dev Helper to self-destruct the contract.
    /// There should never be ETH in the ComptrollerLib,
    /// so no need to waste gas to get the fund owner
    function __selfDestruct() private {
        // Not necessary, but failsafe to protect the lib against selfdestruct
        require(!isLib, "__selfDestruct: Only delegate callable");

        selfdestruct(payable(address(this)));
    }

    ////////////////
    // ACCOUNTING //
    ////////////////

    /// @notice Calculates the gross asset value (GAV) of the fund
    /// @param _finalizeAssets True if all assets must have exact final balances settled
    /// @return gav_ The fund GAV
    function calcGav(bool _finalizeAssets) public override returns (uint256 gav_) {
        address vaultProxyAddress = vaultProxy;
        address[] memory assets = IVault(vaultProxyAddress).getTrackedAssets();
        address[] memory externalPositions = IVault(vaultProxyAddress)
            .getActiveExternalPositions();

        if (assets.length == 0 && externalPositions.length == 0) {
            return 0;
        }

        // It is not necessary to finalize assets in external positions, as synths will have
        // already been settled prior to transferring to the external position contract
        if (_finalizeAssets) {
            IAssetFinalityResolver(ASSET_FINALITY_RESOLVER).finalizeAssets(
                vaultProxyAddress,
                assets
            );
        }

        uint256[] memory balances = new uint256[](assets.length);
        for (uint256 i; i < assets.length; i++) {
            balances[i] = ERC20(assets[i]).balanceOf(vaultProxyAddress);
        }

        gav_ = IValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetsTotalValue(
            assets,
            balances,
            denominationAsset
        );

        if (externalPositions.length > 0) {
            for (uint256 i; i < externalPositions.length; i++) {
                uint256 externalPositionValue = __calcExternalPositionValue(externalPositions[i]);

                gav_ = gav_.add(externalPositionValue);
            }
        }

        return gav_;
    }

    /// @notice Calculates the gross value of 1 unit of shares in the fund's denomination asset
    /// @param _requireFinality True if all assets must have exact final balances settled
    /// @return grossShareValue_ The amount of the denomination asset per share
    /// @dev Does not account for any fees outstanding.
    function calcGrossShareValue(bool _requireFinality)
        external
        override
        returns (uint256 grossShareValue_)
    {
        uint256 gav = calcGav(_requireFinality);

        grossShareValue_ = __calcGrossShareValue(
            gav,
            ERC20(vaultProxy).totalSupply(),
            10**uint256(ERC20(denominationAsset).decimals())
        );

        return grossShareValue_;
    }

    // @dev Helper for calculating a external position value. Prevents from stack too deep
    function __calcExternalPositionValue(address _externalPosition)
        private
        returns (uint256 value_)
    {
        (
            address[] memory collateralAssets,
            uint256[] memory collateralBalances
        ) = IExternalPosition(_externalPosition).getManagedAssets();

        uint256 collateralValue = IValueInterpreter(VALUE_INTERPRETER)
            .calcCanonicalAssetsTotalValue(
            collateralAssets,
            collateralBalances,
            denominationAsset
        );

        (address[] memory borrowedAssets, uint256[] memory borrowedBalances) = IExternalPosition(
            _externalPosition
        )
            .getDebtAssets();

        uint256 borrowedValue = IValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetsTotalValue(
            borrowedAssets,
            borrowedBalances,
            denominationAsset
        );

        if (collateralValue > borrowedValue) {
            value_ = collateralValue.sub(borrowedValue);
        }

        return value_;
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

    ///////////////////
    // PARTICIPATION //
    ///////////////////

    // BUY SHARES

    /// @notice Buys shares on behalf of another user
    /// @param _buyer The account on behalf of whom to buy shares
    /// @param _investmentAmount The amount of the fund's denomination asset with which to buy shares
    /// @param _minSharesQuantity The minimum quantity of shares to buy
    /// @return sharesReceived_ The actual amount of shares received
    /// @dev This function is freely callable if there is no sharesActionTimelock set, but it is
    /// limited to a list of trusted callers otherwise, in order to prevent a griefing attack
    /// where the caller buys shares for a _buyer, thereby resetting their lastSharesBought value.
    function buySharesOnBehalf(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    ) external returns (uint256 sharesReceived_) {
        bool hasSharesActionTimelock = sharesActionTimelock > 0;

        require(
            !hasSharesActionTimelock ||
                IFundDeployer(FUND_DEPLOYER).isAllowedBuySharesOnBehalfCaller(msg.sender),
            "buySharesOnBehalf: Unauthorized"
        );

        return __buyShares(_buyer, _investmentAmount, _minSharesQuantity, hasSharesActionTimelock);
    }

    /// @notice Buys shares
    /// @param _investmentAmount The amount of the fund's denomination asset
    /// with which to buy shares
    /// @param _minSharesQuantity The minimum quantity of shares to buy
    /// @return sharesReceived_ The actual amount of shares received
    function buyShares(uint256 _investmentAmount, uint256 _minSharesQuantity)
        external
        returns (uint256 sharesReceived_)
    {
        bool hasSharesActionTimelock = sharesActionTimelock > 0;

        return
            __buyShares(
                msg.sender,
                _investmentAmount,
                _minSharesQuantity,
                hasSharesActionTimelock
            );
    }

    /// @dev Helper for buy shares logic
    function __buyShares(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity,
        bool _hasSharesActionTimelock
    )
        private
        onlyNotPaused
        locksReentrance
        allowsPermissionedVaultAction
        returns (uint256 sharesReceived_)
    {
        // Enforcing a _minSharesQuantity also validates `_investmentAmount > 0`
        // and guarantees the function cannot succeed while minting 0 shares
        require(_minSharesQuantity > 0, "__buyShares: _minSharesQuantity must be >0");

        address vaultProxyCopy = vaultProxy;
        require(
            !_hasSharesActionTimelock || !__hasPendingMigrationOrReconfiguration(vaultProxyCopy),
            "__buyShares: Pending migration or reconfiguration"
        );

        uint256 gav = calcGav(true);

        // Gives Extensions a chance to run logic prior to the minting of bought shares
        __preBuySharesHook(msg.sender, _investmentAmount, gav);

        // Pay the protocol fee after running other fees, but before minting new shares
        IVault(vaultProxyCopy).payProtocolFee();

        // Calculate the amount of shares to issue with the investment amount
        address denominationAssetCopy = denominationAsset;
        uint256 sharePrice = __calcGrossShareValue(
            gav,
            ERC20(vaultProxyCopy).totalSupply(),
            10**uint256(ERC20(denominationAssetCopy).decimals())
        );
        uint256 sharesIssued = _investmentAmount.mul(SHARES_UNIT).div(sharePrice);

        // Mint shares to the buyer
        uint256 prevBuyerShares = ERC20(vaultProxyCopy).balanceOf(_buyer);
        IVault(vaultProxyCopy).mintShares(_buyer, sharesIssued);

        // Transfer the investment asset to the fund.
        // Does not follow the checks-effects-interactions pattern, but it is preferred
        // to have the final state of the VaultProxy prior to running __postBuySharesHook().
        ERC20(denominationAssetCopy).safeTransferFrom(
            msg.sender,
            vaultProxyCopy,
            _investmentAmount
        );

        // Gives Extensions a chance to run logic after shares are issued
        __postBuySharesHook(_buyer, _investmentAmount, sharesIssued, gav);

        // The number of actual shares received may differ from shares issued due to
        // how the PostBuyShares hooks are invoked by Extensions (i.e., fees)
        sharesReceived_ = ERC20(vaultProxyCopy).balanceOf(_buyer).sub(prevBuyerShares);
        require(
            sharesReceived_ >= _minSharesQuantity,
            "__buyShares: Shares received < _minSharesQuantity"
        );

        if (_hasSharesActionTimelock) {
            acctToLastSharesBoughtTimestamp[_buyer] = block.timestamp;
        }

        emit SharesBought(_buyer, _investmentAmount, sharesIssued, sharesReceived_);

        return sharesReceived_;
    }

    /// @dev Helper for Extension actions immediately prior to issuing shares
    function __preBuySharesHook(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _gav
    ) private {
        IFeeManager(FEE_MANAGER).invokeHook(
            IFeeManager.FeeHook.PreBuyShares,
            abi.encode(_buyer, _investmentAmount),
            _gav
        );
    }

    /// @dev Helper for Extension actions immediately after issuing shares.
    /// This could be cleaned up so both Extensions take the same encoded args and handle GAV
    /// in the same way, but there is not the obvious need for gas savings of recycling
    /// the GAV value for the current policies as there is for the fees.
    function __postBuySharesHook(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _sharesIssued,
        uint256 _preBuySharesGav
    ) private {
        uint256 gav = _preBuySharesGav.add(_investmentAmount);
        IFeeManager(FEE_MANAGER).invokeHook(
            IFeeManager.FeeHook.PostBuyShares,
            abi.encode(_buyer, _investmentAmount, _sharesIssued),
            gav
        );

        IPolicyManager(POLICY_MANAGER).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.PostBuyShares,
            abi.encode(_buyer, _investmentAmount, _sharesIssued, gav)
        );
    }

    // REDEEM SHARES

    /// @notice Redeems a specified amount of the sender's shares for specified asset proportions
    /// @param _recipient The account that will receive the specified assets
    /// @param _sharesQuantity The quantity of shares to redeem
    /// @param _payoutAssets The assets to payout
    /// @param _payoutAssetPercentages The percentage of the owed amount to pay out in each asset
    /// @return payoutAmounts_ The amount of each asset paid out to the _recipient
    /// @dev Redeem all shares of the sender by setting _sharesQuantity to the max uint value.
    /// _payoutAssetPercentages must total exactly 100%. In order to specify less and forgo the
    /// remaining gav owed on the redeemed shares, pass in address(0) with the percentage to forego.
    /// Unlike redeemSharesInKind(), this function allows policies to run and prevent redemption.
    function redeemSharesForSpecificAssets(
        address _recipient,
        uint256 _sharesQuantity,
        address[] calldata _payoutAssets,
        uint256[] calldata _payoutAssetPercentages
    ) external locksReentrance returns (uint256[] memory payoutAmounts_) {
        require(
            _payoutAssets.length == _payoutAssetPercentages.length,
            "redeemSharesForSpecificAssets: Unequal arrays"
        );
        require(
            _payoutAssets.isUniqueSet(),
            "redeemSharesForSpecificAssets: Duplicate payout asset"
        );

        uint256 gav = calcGav(true);

        IVault vaultProxyContract = IVault(vaultProxy);
        (uint256 sharesToRedeem, uint256 sharesSupply) = __redeemSharesSetup(
            vaultProxyContract,
            msg.sender,
            _sharesQuantity,
            gav
        );

        payoutAmounts_ = __payoutSpecifiedAssetPercentages(
            vaultProxyContract,
            _recipient,
            _payoutAssets,
            _payoutAssetPercentages,
            gav.mul(sharesToRedeem).div(sharesSupply)
        );

        // Run post-redemption in order to have access to the payoutAmounts
        __postRedeemSharesForSpecificAssetsHook(
            msg.sender,
            _recipient,
            sharesToRedeem,
            _payoutAssets,
            payoutAmounts_,
            gav
        );

        emit SharesRedeemed(msg.sender, _recipient, sharesToRedeem, _payoutAssets, payoutAmounts_);

        return payoutAmounts_;
    }

    /// @notice Redeems a specified amount of the sender's shares
    /// for a proportionate slice of the vault's assets
    /// @param _recipient The account that will receive the proportionate slice of assets
    /// @param _sharesQuantity The quantity of shares to redeem
    /// @param _additionalAssets Additional (non-tracked) assets to claim
    /// @param _assetsToSkip Tracked assets to forfeit
    /// @return payoutAssets_ The assets paid out to the _recipient
    /// @return payoutAmounts_ The amount of each asset paid out to the _recipient
    /// @dev Redeem all shares of the sender by setting _sharesQuantity to the max uint value.
    /// Any claim to passed _assetsToSkip will be forfeited entirely. This should generally
    /// only be exercised if a bad asset is causing redemption to fail.
    /// This function should never fail without a way to bypass the failure, which is assured
    /// through two mechanisms:
    /// 1. The FeeManager is called with the try/catch pattern to assure that calls to it
    /// can never block redemption.
    /// 2. If a token fails upon transfer(), that token can be skipped (and its balance forfeited)
    /// by explicitly specifying _assetsToSkip.
    /// Because of these assurances, shares should always be redeemable, with the exception
    /// of the timelock period on shares actions that must be respected.
    function redeemSharesInKind(
        address _recipient,
        uint256 _sharesQuantity,
        address[] calldata _additionalAssets,
        address[] calldata _assetsToSkip
    )
        external
        locksReentrance
        returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)
    {
        require(
            _additionalAssets.isUniqueSet(),
            "redeemSharesInKind: _additionalAssets contains duplicates"
        );
        require(
            _assetsToSkip.isUniqueSet(),
            "redeemSharesInKind: _assetsToSkip contains duplicates"
        );

        IVault vaultProxyContract = IVault(vaultProxy);

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

        // Resolve finality of all assets as needed.
        // Run this prior to __redeemSharesSetup in order to settle synths before calculating GAV.
        IAssetFinalityResolver(ASSET_FINALITY_RESOLVER).finalizeAssets(
            address(vaultProxyContract),
            payoutAssets_
        );

        (uint256 sharesToRedeem, uint256 sharesSupply) = __redeemSharesSetup(
            vaultProxyContract,
            msg.sender,
            _sharesQuantity,
            0
        );

        // Calculate and transfer payout asset amounts due to _recipient
        payoutAmounts_ = new uint256[](payoutAssets_.length);
        for (uint256 i; i < payoutAssets_.length; i++) {
            // If all remaining shares are being redeemed, the logic changes slightly
            if (sharesToRedeem == sharesSupply) {
                payoutAmounts_[i] = ERC20(payoutAssets_[i]).balanceOf(address(vaultProxyContract));
                // Will not remove assets that are marked to not be untracked
                vaultProxyContract.removeTrackedAsset(payoutAssets_[i]);
            } else {
                payoutAmounts_[i] = ERC20(payoutAssets_[i])
                    .balanceOf(address(vaultProxyContract))
                    .mul(sharesToRedeem)
                    .div(sharesSupply);
            }

            // Transfer payout asset to _recipient
            if (payoutAmounts_[i] > 0) {
                vaultProxyContract.withdrawAssetTo(
                    payoutAssets_[i],
                    _recipient,
                    payoutAmounts_[i]
                );
            }
        }

        emit SharesRedeemed(msg.sender, _recipient, sharesToRedeem, payoutAssets_, payoutAmounts_);

        return (payoutAssets_, payoutAmounts_);
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

    /// @dev Helper to payout specified asset percentages during redeemSharesForSpecificAssets()
    function __payoutSpecifiedAssetPercentages(
        IVault vaultProxyContract,
        address _recipient,
        address[] calldata _payoutAssets,
        uint256[] calldata _payoutAssetPercentages,
        uint256 _owedGav
    ) private returns (uint256[] memory payoutAmounts_) {
        address denominationAssetCopy = denominationAsset;
        uint256 percentagesTotal;
        payoutAmounts_ = new uint256[](_payoutAssets.length);
        for (uint256 i; i < _payoutAssets.length; i++) {
            percentagesTotal = percentagesTotal.add(_payoutAssetPercentages[i]);

            // Used to explicitly specify less than 100% in total _payoutAssetPercentages
            if (_payoutAssets[i] == address(0)) {
                continue;
            }

            payoutAmounts_[i] = IValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetValue(
                denominationAssetCopy,
                _owedGav.mul(_payoutAssetPercentages[i]).div(ONE_HUNDRED_PERCENT),
                _payoutAssets[i]
            );

            vaultProxyContract.withdrawAssetTo(_payoutAssets[i], _recipient, payoutAmounts_[i]);
        }

        require(
            percentagesTotal == ONE_HUNDRED_PERCENT,
            "__payoutSpecifiedAssetPercentages: Percents must total 100%"
        );

        return payoutAmounts_;
    }

    /// @dev Helper for system actions immediately prior to redeeming shares.
    /// Policy validation is not currently allowed on redemption, to ensure continuous redeemability.
    function __preRedeemSharesHook(
        address _redeemer,
        uint256 _sharesToRedeem,
        uint256 _gavIfCalculated
    ) private allowsPermissionedVaultAction {
        try
            IFeeManager(FEE_MANAGER).invokeHook(
                IFeeManager.FeeHook.PreRedeemShares,
                abi.encode(_redeemer, _sharesToRedeem),
                _gavIfCalculated
            )
         {} catch (bytes memory reason) {
            emit PreRedeemSharesHookFailed(reason, _redeemer, _sharesToRedeem);
        }
    }

    /// @dev Helper to run policy validation after other logic for redeeming shares for specific assets.
    /// Avoids stack-too-deep error.
    function __postRedeemSharesForSpecificAssetsHook(
        address _redeemer,
        address _recipient,
        uint256 _sharesToRedeemPostFees,
        address[] memory _assets,
        uint256[] memory _assetAmounts,
        uint256 _gavPreRedeem
    ) private {
        IPolicyManager(POLICY_MANAGER).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.RedeemSharesForSpecificAssets,
            abi.encode(
                _redeemer,
                _recipient,
                _sharesToRedeemPostFees,
                _assets,
                _assetAmounts,
                _gavPreRedeem
            )
        );
    }

    /// @dev Helper to execute common pre-shares redemption logic
    function __redeemSharesSetup(
        IVault vaultProxyContract,
        address _redeemer,
        uint256 _sharesQuantityInput,
        uint256 _gavIfCalculated
    ) private returns (uint256 sharesToRedeem_, uint256 sharesSupply_) {
        __assertSharesActionNotTimelocked(address(vaultProxyContract), _redeemer);

        ERC20 sharesContract = ERC20(address(vaultProxyContract));

        if (_sharesQuantityInput == type(uint256).max) {
            sharesToRedeem_ = sharesContract.balanceOf(_redeemer);
        } else {
            sharesToRedeem_ = _sharesQuantityInput;
        }
        require(sharesToRedeem_ > 0, "__redeemSharesSetup: No shares to redeem");

        // When a fund is paused, settling fund-level fees will be skipped
        if (!__fundIsPaused()) {
            // Note that if a fee with `SettlementType.Direct` is charged here (i.e., not `Mint`),
            // then those fee shares will be transferred from the user's balance rather
            // than reallocated from the sharesToRedeem_.
            __preRedeemSharesHook(_redeemer, sharesToRedeem_, _gavIfCalculated);
        }

        // Pay the protocol fee after running other fees, but before burning shares
        vaultProxyContract.payProtocolFee();

        uint256 postHookSharesBalance = sharesContract.balanceOf(_redeemer);
        if (_sharesQuantityInput == type(uint256).max) {
            // If the user is redeeming all of their shares (i.e., max uint), then their sharesToRedeem
            // is reassigned to their current full balance
            sharesToRedeem_ = postHookSharesBalance;
        } else {
            // Check sharesToRedeem_ against the user's balance after settling fees
            require(
                sharesToRedeem_ <= postHookSharesBalance,
                "__redeemSharesSetup: Insufficient shares"
            );
        }

        // Destroy the shares after getting the shares supply
        sharesSupply_ = sharesContract.totalSupply();
        vaultProxyContract.burnShares(_redeemer, sharesToRedeem_);

        return (sharesToRedeem_, sharesSupply_);
    }

    // TRANSFER SHARES

    /// @notice Runs logic prior to transferring shares that are not freely transferable
    /// @param _sender The sender of the shares
    /// @param _recipient The recipient of the shares
    /// @param _amount The amount of shares
    function preTransferSharesHook(
        address _sender,
        address _recipient,
        uint256 _amount
    ) external override {
        address vaultProxyCopy = vaultProxy;
        require(msg.sender == vaultProxyCopy, "preTransferSharesHook: Only VaultProxy callable");
        __assertSharesActionNotTimelocked(vaultProxyCopy, _sender);

        IPolicyManager(POLICY_MANAGER).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.PreTransferShares,
            abi.encode(_sender, _recipient, _amount)
        );
    }

    /// @notice Runs logic prior to transferring shares that are freely transferable
    /// @param _sender The sender of the shares
    /// @dev No need to validate caller, as policies are not run
    function preTransferSharesHookFreelyTransferable(address _sender) external view override {
        __assertSharesActionNotTimelocked(vaultProxy, _sender);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `denominationAsset` variable
    /// @return denominationAsset_ The `denominationAsset` variable value
    function getDenominationAsset() external view override returns (address denominationAsset_) {
        return denominationAsset;
    }

    /// @notice Gets the routes for the various contracts used by all funds
    /// @return assetFinalityResolver_ The `ASSET_FINALITY_RESOLVER` variable value
    /// @return dispatcher_ The `DISPATCHER` variable value
    /// @return feeManager_ The `FEE_MANAGER` variable value
    /// @return fundDeployer_ The `FUND_DEPLOYER` variable value
    /// @return integrationManager_ The `INTEGRATION_MANAGER` variable value
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    /// @return primitivePriceFeed_ The `PRIMITIVE_PRICE_FEED` variable value
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getLibRoutes()
        external
        view
        override
        returns (
            address assetFinalityResolver_,
            address dispatcher_,
            address feeManager_,
            address fundDeployer_,
            address integrationManager_,
            address policyManager_,
            address primitivePriceFeed_,
            address valueInterpreter_
        )
    {
        return (
            ASSET_FINALITY_RESOLVER,
            DISPATCHER,
            FEE_MANAGER,
            FUND_DEPLOYER,
            INTEGRATION_MANAGER,
            POLICY_MANAGER,
            PRIMITIVE_PRICE_FEED,
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

    // PUBLIC FUNCTIONS

    /// @notice Gets the timestamp of the last time shares were bought for a given account
    /// @param _who The account for which to get the timestamp
    /// @return lastSharesBoughtTimestamp_ The timestamp of the last shares bought
    function getLastSharesBoughtTimestampForAccount(address _who)
        public
        view
        returns (uint256 lastSharesBoughtTimestamp_)
    {
        return acctToLastSharesBoughtTimestamp[_who];
    }

    /// @notice Gets the `MLN_TOKEN` variable
    /// @return mlnToken_ The `MLN_TOKEN` variable value
    function getMlnToken() public view returns (address mlnToken_) {
        return MLN_TOKEN;
    }
}
