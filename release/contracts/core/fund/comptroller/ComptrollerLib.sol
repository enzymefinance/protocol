// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../extensions/IExtension.sol";
import "../../../extensions/fee-manager/IFeeManager.sol";
import "../../../extensions/policy-manager/IPolicyManager.sol";
import "../../../infrastructure/engine/AmguConsumer.sol";
import "../../../infrastructure/price-feeds/derivatives/IDerivativePriceFeed.sol";
import "../../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import "../../../interfaces/IERC20Extended.sol";
import "../../fund-deployer/IFundDeployer.sol";
import "../vault/IVault.sol";
import "./IComptroller.sol";

/// @title ComptrollerLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The core logic library shared by all funds
/// @dev All state-changing functions should be marked as onlyDelegateCall,
/// unless called directly by the FundDeployer
contract ComptrollerLib is IComptroller, AmguConsumer {
    using SafeMath for uint256;
    using SafeERC20 for IERC20Extended;

    event FundConfigSet(
        address indexed vaultProxy,
        address indexed denominationAsset,
        bytes feeManagerConfigData,
        bytes policyManagerConfigData
    );

    event FundStatusUpdated(FundStatus indexed prevStatus, FundStatus indexed nextStatus);

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
    address private immutable DERIVATIVE_PRICE_FEED;
    address private immutable FEE_MANAGER;
    address private immutable INTEGRATION_MANAGER;
    address private immutable POLICY_MANAGER;
    address private immutable PRIMITIVE_PRICE_FEED;
    address private immutable VALUE_INTERPRETER;

    // Pseudo-constants (can only be set once)
    address private denominationAsset;
    bool private initialized;
    address private vaultProxy;

    // Storage
    FundStatus private status;

    // This kind of serves as a reverse-mutex,
    // only allowing certain actions when they are the result of a call from this contract
    bool private callOnExtensionIsActive;

    ///////////////
    // MODIFIERS //
    ///////////////

    modifier onlyActiveFund() {
        __assertIsActiveFund();
        _;
    }

    modifier callsExtension {
        callOnExtensionIsActive = true;
        _;
        callOnExtensionIsActive = false;
    }

    modifier onlyDelegateCall() {
        __assertIsDelegateCall();
        _;
    }

    modifier onlyFundDeployer() {
        __assertIsFundDeployer(msg.sender);
        _;
    }

    /// @dev These permissions will eventually be defined on extensions themselves
    modifier onlyPermissionedRequest(IVault.VaultAction _action) {
        __assertValidCallFromExtension(msg.sender, _action);
        _;
    }

    // MODIFIER HELPERS
    // Modifiers are inefficient in terms of reducing contract size,
    // so we use helper functions to prevent repetitive inlining of expensive string values.

    function __assertIsActiveFund() private view {
        require(status == FundStatus.Active, "This function can only be called on an active fund");
    }

    function __assertIsFundDeployer(address _who) private view {
        require(_who == FUND_DEPLOYER, "Only the FundDeployer can call this function");
    }

    function __assertIsDelegateCall() private view {
        require(initialized == true, "Only a delegate call can access this function");
    }

    function __assertValidCallFromExtension(address _extension, IVault.VaultAction _action)
        private
        view
    {
        require(callOnExtensionIsActive, "Call does not originate from contract");

        if (_extension == INTEGRATION_MANAGER) {
            require(
                _action == IVault.VaultAction.ApproveAssetSpender ||
                    _action == IVault.VaultAction.WithdrawAssetTo ||
                    _action == IVault.VaultAction.AddTrackedAsset ||
                    _action == IVault.VaultAction.RemoveTrackedAsset,
                "Not a valid action for IntegrationManager"
            );
        } else if (_extension == FEE_MANAGER) {
            require(
                _action == IVault.VaultAction.BurnShares ||
                    _action == IVault.VaultAction.MintShares,
                "Not a valid action for FeeManager"
            );
        } else {
            revert("Not a valid call from extension");
        }
    }

    //////////
    // CORE //
    //////////

    /// @dev Constructor for library
    constructor(
        address _fundDeployer,
        address _valueInterpreter,
        address _primitivePriceFeed,
        address _derivativePriceFeed,
        address _feeManager,
        address _integrationManager,
        address _policyManager,
        address _engine
    ) public AmguConsumer(_engine) {
        DERIVATIVE_PRICE_FEED = _derivativePriceFeed;
        FEE_MANAGER = _feeManager;
        FUND_DEPLOYER = _fundDeployer;
        INTEGRATION_MANAGER = _integrationManager;
        PRIMITIVE_PRICE_FEED = _primitivePriceFeed;
        POLICY_MANAGER = _policyManager;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @dev Used to route arbitrary calls, so that msg.sender is the ComptrollerProxy (for access control).
    /// Uses a reverse-mutex of sorts that only allows permissioned calls to the vault during this stack.
    function callOnExtension(
        address _extension,
        bytes4 _selector,
        bytes calldata _callArgs
    ) external onlyDelegateCall callsExtension {
        require(__isExtension(_extension), "callOnExtension: _extension is not valid");

        (bool success, bytes memory returnData) = _extension.call(
            abi.encodeWithSelector(_selector, msg.sender, _callArgs)
        );
        require(success, string(returnData));
    }

    function isReceivableAsset(address _asset) external override view returns (bool) {
        return
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_asset) ||
            IDerivativePriceFeed(DERIVATIVE_PRICE_FEED).isSupportedAsset(_asset);
    }

    function vaultCallOnContract(
        address _contract,
        bytes4 _selector,
        bytes calldata _callData
    ) external onlyDelegateCall {
        IVault vaultContract = IVault(vaultProxy);
        require(
            msg.sender == vaultContract.getOwner(),
            "Only the fund owner can call this function"
        );
        require(
            IFundDeployer(FUND_DEPLOYER).isRegisteredVaultCall(_contract, _selector),
            "vaultCallOnContract: not a registered call"
        );

        vaultContract.callOnContract(_contract, abi.encodeWithSelector(_selector, _callData));

        // TODO: need event?
    }

    // // TODO: implement with roles
    // /// @param _who The acct for which to query management permission
    // // /// @param _extension The extension for which to query management permission
    // /// @return True if _who can manage protected functions of _extension
    // function canManageExtension(address _who, address) public view returns (bool) {
    //     return _who == IVault(vaultProxy).getOwner();
    // }

    // TODO: make this specific to whether the fund uses an extension
    function __isExtension(address _who) private view returns (bool) {
        return _who == FEE_MANAGER || _who == POLICY_MANAGER || _who == INTEGRATION_MANAGER;
    }

    /////////////////////////////
    // FUND SETUP AND TEARDOWN //
    /////////////////////////////

    function activate() external override onlyFundDeployer {
        require(vaultProxy != address(0), "activate: Cannot activate without a vaultProxy");

        __activate();
    }

    /// @dev Pseudo-constructor per proxy
    function init() external override onlyFundDeployer {
        require(!initialized, "init: Proxy already initialized");

        initialized = true;
    }

    function quickSetup(
        address _vaultProxy,
        address _denominationAsset,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external override onlyFundDeployer {
        // Set config without updating status
        __setConfig(
            _vaultProxy,
            _denominationAsset,
            _feeManagerConfigData,
            _policyManagerConfigData,
            false
        );

        __setVaultProxy(_vaultProxy);

        __activate();
    }

    function setConfig(
        address _vaultProxy,
        address _denominationAsset,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external override onlyFundDeployer {
        __setConfig(
            _vaultProxy,
            _denominationAsset,
            _feeManagerConfigData,
            _policyManagerConfigData,
            true
        );
    }

    function setVaultProxy(address _vaultProxy) external onlyFundDeployer {
        __setVaultProxy(_vaultProxy);
    }

    /// @notice Shut down the fund
    // TODO: need an emergency shutdown to bypass teardown functions on failure?
    function shutdown() external override onlyDelegateCall onlyActiveFund callsExtension {
        require(
            msg.sender == FUND_DEPLOYER || msg.sender == IVault(vaultProxy).getOwner(),
            "shutdown: Only the fund owner or FundDeployer can call this function"
        );

        // Distribute final fee settlement and destroy storage
        IExtension(FEE_MANAGER).deactivateForFund();

        // TODO: destroy unneeded PolicyManager storage?

        __updateStatus(FundStatus.Shutdown);
    }

    function __activate() private {
        IExtension(FEE_MANAGER).activateForFund();

        __updateStatus(FundStatus.Active);
    }

    // TODO: is any validation necessary since we're only calling from a trusted contract?
    function __setConfig(
        address _vaultProxy,
        address _denominationAsset,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData,
        bool _updateStatus
    ) private {
        // Use vaultProxy as ref to see whether fund config has already been set
        require(
            vaultProxy == address(0),
            "setConfigAndActivate: fund has already been configured"
        );

        // Configure core
        require(
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_denominationAsset),
            "setConfigAndActivate: Denomination asset must be a supported primitive"
        );
        denominationAsset = _denominationAsset;
        vaultProxy = _vaultProxy;

        // Configure extensions
        if (_feeManagerConfigData.length > 0) {
            IExtension(FEE_MANAGER).setConfigForFund(_feeManagerConfigData);
        }
        if (_policyManagerConfigData.length > 0) {
            IExtension(POLICY_MANAGER).setConfigForFund(_policyManagerConfigData);
        }

        emit FundConfigSet(
            _vaultProxy,
            _denominationAsset,
            _feeManagerConfigData,
            _policyManagerConfigData
        );

        // Only update fund status if not activating the fund atomically
        if (_updateStatus) {
            __updateStatus(FundStatus.Pending);
        }
    }

    function __setVaultProxy(address _vaultProxy) private {
        vaultProxy = _vaultProxy;

        emit VaultProxySet(_vaultProxy);
    }

    function __updateStatus(FundStatus _nextStatus) private {
        FundStatus prevStatus = status;
        status = _nextStatus;

        emit FundStatusUpdated(prevStatus, _nextStatus);
    }

    //////////////////////////////
    // PERMISSIONED VAULT CALLS //
    //////////////////////////////

    function addTrackedAsset(address _asset)
        external
        override
        onlyPermissionedRequest(IVault.VaultAction.AddTrackedAsset)
    {
        IVault(vaultProxy).addTrackedAsset(_asset);
    }

    function approveAssetSpender(
        address _asset,
        address _target,
        uint256 _amount
    ) external override onlyPermissionedRequest(IVault.VaultAction.ApproveAssetSpender) {
        IVault(vaultProxy).approveAssetSpender(_asset, _target, _amount);
    }

    function burnShares(address _target, uint256 _amount)
        external
        override
        onlyPermissionedRequest(IVault.VaultAction.BurnShares)
    {
        IVault(vaultProxy).burnShares(_target, _amount);
    }

    function mintShares(address _target, uint256 _amount)
        external
        override
        onlyPermissionedRequest(IVault.VaultAction.MintShares)
    {
        IVault(vaultProxy).mintShares(_target, _amount);
    }

    function removeTrackedAsset(address _asset)
        external
        override
        onlyPermissionedRequest(IVault.VaultAction.RemoveTrackedAsset)
    {
        IVault(vaultProxy).removeTrackedAsset(_asset);
    }

    ////////////////
    // ACCOUNTING //
    ////////////////

    /// @notice Calculate the overall GAV of the fund
    /// @return gav_ The fund GAV
    /// @dev Does not alter local state,
    /// but not a view because calls to price feeds can potentially update 3rd party state
    function calcGav() public onlyDelegateCall returns (uint256) {
        IVault vaultContract = IVault(vaultProxy);
        address[] memory assets = vaultContract.getTrackedAssets();
        uint256[] memory balances = vaultContract.getAssetBalances(assets);

        uint256 gav;
        for (uint256 i; i < assets.length; i++) {
            (uint256 assetGav, bool isValid) = IValueInterpreter(VALUE_INTERPRETER)
                .calcCanonicalAssetValue(
                PRIMITIVE_PRICE_FEED,
                DERIVATIVE_PRICE_FEED,
                assets[i],
                balances[i],
                denominationAsset
            );
            // TODO: more helpful revert string by converting/concatenating address?
            require(assetGav > 0 && isValid, "calcGav: No valid price available for asset");

            gav = gav.add(assetGav);
        }

        return gav;
    }

    /// @notice Calculates the gross value of 1 unit of shares in the fund's denomination asset
    /// @return The amount of the denomination asset per share
    /// @dev Does not account for any fees outstanding
    function calcGrossShareValue() public onlyDelegateCall returns (uint256) {
        uint256 sharesSupply = IERC20Extended(vaultProxy).totalSupply();
        if (sharesSupply == 0) {
            return 10**uint256(IERC20Extended(denominationAsset).decimals());
        }

        return calcGav().mul(SHARES_UNIT).div(sharesSupply);
    }

    /// @notice Calculates the net value of 1 unit of shares in the fund's denomination asset
    /// @return The amount of the denomination asset per share
    /// @dev Accounts for fees outstanding. This is a convenience function for external consumption
    /// that can be used to determine the cost of purchasing shares at any given point in time.
    function calcNetShareValue() external onlyDelegateCall callsExtension returns (uint256) {
        IFeeManager(FEE_MANAGER).settleFees(IFeeManager.FeeHook.Continuous, "");
        return calcGrossShareValue();
    }

    ///////////////////
    // PARTICIPATION //
    ///////////////////

    /// @notice Buy shares on behalf of a specified user
    /// @dev Only callable by the SharesRequestor associated with the Registry
    /// @param _buyer The acct for which to buy shares
    /// @param _investmentAmount The amount of the fund's denomination asset with which to buy shares
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the specified _investmentAmount
    /// @return The amount of shares received by the _buyer
    function buyShares(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    ) external override payable onlyDelegateCall amguPayable callsExtension returns (uint256) {
        __preBuySharesHook(_buyer, _investmentAmount, _minSharesQuantity);

        uint256 sharesBought = _investmentAmount
            .mul(10**uint256(IERC20Extended(denominationAsset).decimals()))
            .div(calcGrossShareValue());

        // This is inefficient to mint, and then allow the feeManager to burn/mint to settle the fee,
        // but we need the FeeManager to handle minting/burning of shares if we want to move
        // to a modular system.
        uint256 prevBuyerShares = IERC20Extended(vaultProxy).balanceOf(_buyer);
        IVault vaultContract = IVault(vaultProxy);
        vaultContract.mintShares(_buyer, sharesBought);

        // Post-buy actions
        __postBuySharesHook(_buyer, _investmentAmount, sharesBought);

        uint256 sharesReceived = IERC20Extended(vaultProxy).balanceOf(_buyer).sub(prevBuyerShares);
        require(
            sharesReceived >= _minSharesQuantity,
            "buyShares: minimum shares quantity not met"
        );

        // Transfer investment asset
        IERC20Extended(denominationAsset).safeTransferFrom(
            msg.sender,
            vaultProxy,
            _investmentAmount
        );
        // TODO: should denomination asset always remain a tracked asset by default?
        vaultContract.addTrackedAsset(denominationAsset);

        emit SharesBought(msg.sender, _buyer, _investmentAmount, sharesBought, sharesReceived);

        return sharesReceived;
    }

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    function redeemShares() external onlyDelegateCall {
        __redeemShares(IERC20Extended(vaultProxy).balanceOf(msg.sender), false);
    }

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    /// @dev _bypassFailure is set to true, the user will lose their claim to any assets for
    /// which the transfer function fails.
    function redeemSharesEmergency() external onlyDelegateCall {
        __redeemShares(IERC20Extended(vaultProxy).balanceOf(msg.sender), true);
    }

    /// @notice Redeem a specified quantity of the sender's shares
    /// for a proportionate slice of the fund's assets
    /// @param _sharesQuantity Number of shares
    function redeemSharesQuantity(uint256 _sharesQuantity) external onlyDelegateCall {
        __redeemShares(_sharesQuantity, false);
    }

    function __preBuySharesHook(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    ) private {
        // Calculate full shares quantity for investment amount after updating continuous fees
        IFeeManager(FEE_MANAGER).settleFees(IFeeManager.FeeHook.Continuous, "");

        IPolicyManager(POLICY_MANAGER).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.BuyShares,
            IPolicyManager.PolicyHookExecutionTime.Pre,
            abi.encode(_buyer, _investmentAmount, _minSharesQuantity)
        );
    }

    function __postBuySharesHook(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _sharesBought
    ) private {
        IFeeManager(FEE_MANAGER).settleFees(
            IFeeManager.FeeHook.BuyShares,
            abi.encode(_buyer, _investmentAmount, _sharesBought)
        );

        IPolicyManager(POLICY_MANAGER).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.BuyShares,
            IPolicyManager.PolicyHookExecutionTime.Post,
            abi.encode(_buyer, _investmentAmount, _sharesBought)
        );
    }

    /// @notice Redeem a specified quantity of the sender's shares
    /// for a proportionate slice of the fund's assets
    /// @dev If _bypassFailure is set to true, the user will lose their claim to any assets for
    /// which the transfer function fails. This should always be false unless explicitly intended
    /// @param _sharesQuantity The amount of shares to redeem
    /// @param _bypassFailure True if token transfer failures should be ignored and forfeited
    function __redeemShares(uint256 _sharesQuantity, bool _bypassFailure) private callsExtension {
        address redeemer = msg.sender;

        require(_sharesQuantity > 0, "__redeemShares: _sharesQuantity must be > 0");

        // Attempt to settle fees, but don't allow an error to block redemption.
        // When a fund is shutdown, there will be no more enabled fees.
        try IFeeManager(FEE_MANAGER).settleFees(IFeeManager.FeeHook.Continuous, "")  {} catch {}

        // Check the shares quantity against the user's balance after settling fees
        require(
            _sharesQuantity <= IERC20Extended(vaultProxy).balanceOf(redeemer),
            "__redeemShares: _sharesQuantity exceeds sender balance"
        );

        IVault vaultContract = IVault(vaultProxy);
        address[] memory payoutAssets = vaultContract.getTrackedAssets();
        require(payoutAssets.length > 0, "__redeemShares: fund has no tracked assets");

        // Destroy the shares
        uint256 sharesSupply = IERC20Extended(vaultProxy).totalSupply();
        IVault(vaultProxy).burnShares(redeemer, _sharesQuantity);

        // Calculate and transfer payout assets to redeemer
        uint256[] memory assetBalances = vaultContract.getAssetBalances(payoutAssets);
        uint256[] memory payoutQuantities = new uint256[](payoutAssets.length);
        for (uint256 i; i < payoutAssets.length; i++) {
            // Redeemer's ownership percentage of asset holdings
            payoutQuantities[i] = assetBalances[i].mul(_sharesQuantity).div(sharesSupply);

            // Transfer payout asset to redeemer
            try
                vaultContract.withdrawAssetTo(payoutAssets[i], redeemer, payoutQuantities[i])
             {} catch {
                if (!_bypassFailure) {
                    revert("__redeemShares: Token transfer failed");
                }
            }
        }

        emit SharesRedeemed(redeemer, _sharesQuantity, payoutAssets, payoutQuantities);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getDenominationAsset() external view returns (address) {
        return denominationAsset;
    }

    function getFundStatus() external view returns (FundStatus) {
        return status;
    }

    function getInitialized() external view returns (bool) {
        return initialized;
    }

    // TODO: do we want individual getters also?
    function getRoutes()
        external
        override
        view
        returns (
            address derivativePriceFeed_,
            address feeManager_,
            address fundDeployer_,
            address integrationManager_,
            address policyManager_,
            address primitivePriceFeed_,
            address valueInterpreter_
        )
    {
        return (
            DERIVATIVE_PRICE_FEED,
            FEE_MANAGER,
            FUND_DEPLOYER,
            INTEGRATION_MANAGER,
            POLICY_MANAGER,
            PRIMITIVE_PRICE_FEED,
            VALUE_INTERPRETER
        );
    }

    function getVaultProxy() external override view returns (address) {
        return vaultProxy;
    }
}
