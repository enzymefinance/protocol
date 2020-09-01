// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../extensions/fee-manager/IFeeManager.sol";
import "../../../extensions/policy-manager/IPolicyManager.sol";
import "../../../infrastructure/engine/AmguConsumer.sol";
import "../../../infrastructure/price-feeds/derivatives/IDerivativePriceFeed.sol";
import "../../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import "../../../interfaces/IERC20Extended.sol";
import "../vault/IVault.sol";
import "./IComptroller.sol";

/// @title ComptrollerLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice TODO
/// @dev All state-changing functions should be marked as onlyDelegateCall
contract ComptrollerLib is IComptroller, AmguConsumer {
    using SafeMath for uint256;
    using SafeERC20 for IERC20Extended;

    // TODO: add/improve events

    event CallOnIntegrationExecuted(
        address adapter,
        address[] incomingAssets,
        uint256[] incomingAssetAmounts,
        address[] outgoingAssets,
        uint256[] outgoingAssetAmounts
    );

    event FundConfigSet(
        address indexed vaultProxy,
        address indexed denominationAsset,
        bytes feeManagerConfig,
        bytes policyManagerConfig
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

    // Constants - shared by all proxies
    uint8 private constant SHARES_DECIMALS = 18;
    address private immutable FUND_DEPLOYER;
    address private immutable DERIVATIVE_PRICE_FEED;
    address private immutable FEE_MANAGER;
    address private immutable INTEGRATION_MANAGER;
    address private immutable POLICY_MANAGER;
    address private immutable PRIMITIVE_PRICE_FEED;
    address private immutable VALUE_INTERPRETER;

    // TODO: getters

    // Pseudo-constants (can only be set once)
    address private denominationAsset;
    bool private initialized;
    address private owner;
    address private vaultProxy;

    // Storage
    FundStatus private status;

    // This kind of serves as a reverse-mutex,
    // only allowing certain actions when they are the result of a call from this contract
    bool private callOnExtensionIsActive;

    // TODO: add this or similar to actions that require a vault proxy is attached
    // modifier onlyActiveFund() {
    //     require(
    //         msg.sender == FEE_MANAGER,
    //         "Only FeeManager can call this function"
    //     );
    //     _;
    // }

    modifier onlyDelegateCall() {
        require(
            initialized == true,
            "onlyDelegateCall: Only a delegate call can access this function"
        );
        _;
    }

    modifier onlyFundDeployer() {
        require(
            msg.sender == FUND_DEPLOYER,
            "onlyFundDeployer: Only the FundDeployer can call this function"
        );
        _;
    }

    /// @dev These permissions will eventually be defined on extensions themselves
    modifier onlyPermissionedRequest(IVault.VaultAction _action) {
        require(
            callOnExtensionIsActive,
            "onlyPermissionedRequest: Call must originate from this contract"
        );

        if (msg.sender == INTEGRATION_MANAGER) {
            require(
                _action == IVault.VaultAction.ApproveAssetSpender ||
                    _action == IVault.VaultAction.WithdrawAssetTo ||
                    _action == IVault.VaultAction.AddTrackedAsset ||
                    _action == IVault.VaultAction.RemoveTrackedAsset,
                "onlyPermissionedRequest: Not a valid action for IntegrationManager"
            );
        } else if (msg.sender == FEE_MANAGER) {
            require(
                _action == IVault.VaultAction.BurnShares ||
                    _action == IVault.VaultAction.MintShares,
                "onlyPermissionedRequest: Not a valid action for FeeManager"
            );
        } else {
            revert("onlyPermissionedRequest: Not a valid action for requestor");
        }

        _;
    }

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

    /// @dev Pseudo-constructor per proxy
    function init(address _fundOwner) external override onlyFundDeployer {
        require(!initialized, "init: Proxy already initialized");

        owner = _fundOwner;
        initialized = true;
    }

    //////////
    // CORE //
    //////////

    /// @dev Used to route arbitrary calls, so that msg.sender is the ComptrollerProxy (for access control).
    /// Uses a reverse-mutex of sorts that only allows permissioned calls to the vault during this stack.
    function callOnExtension(
        address _extension,
        bytes4 _selector,
        bytes calldata _callArgs
    ) external onlyDelegateCall {
        require(__isExtension(_extension), "callOnExtension: _extension is not valid");

        callOnExtensionIsActive = true;

        (bool success, bytes memory returnData) = _extension.call(
            abi.encodeWithSelector(_selector, msg.sender, _callArgs)
        );
        require(success, string(returnData));

        callOnExtensionIsActive = false;
    }

    function isReceivableAsset(address _asset) external override view returns (bool) {
        return
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_asset) ||
            IDerivativePriceFeed(DERIVATIVE_PRICE_FEED).isSupportedAsset(_asset);
    }

    // // TODO: implement with roles
    // /// @param _who The acct for which to query management permission
    // // /// @param _extension The extension for which to query management permission
    // /// @return True if _who can manage protected functions of _extension
    // function canManageExtension(address _who, address) public override view returns (bool) {
    //     return _who == owner;
    // }

    /// @dev Essentially another constructor per-ComptrollerProxy
    function setFundConfigAndActivate(
        address _vaultProxy,
        address _denominationAsset,
        bytes calldata _feeManagerConfig,
        bytes calldata _policyManagerConfig
    ) external override onlyFundDeployer {
        // TODO: is any validation necessary since we're only calling from a trusted contract?
        // require(_vaultProxy != address(0), "setFundConfig: _vaultProxy cannot be empty");
        // require(
        //     _denominationAsset != address(0),
        //     "setFundConfig: _denominationAsset cannot be empty"
        // );
        // Use vaultProxy as ref to see whether fund config has already been set
        require(vaultProxy == address(0), "setFundConfig: fund has already been configured");

        // 1. Configure core
        require(
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_denominationAsset),
            "setFundConfig: Denomination asset must be a supported primitive"
        );
        denominationAsset = _denominationAsset;
        vaultProxy = _vaultProxy;

        // 2. Configure extensions
        if (_feeManagerConfig.length > 0) {
            IFeeManager(FEE_MANAGER).setFundConfig(_feeManagerConfig);
        }
        if (_policyManagerConfig.length > 0) {
            IPolicyManager(POLICY_MANAGER).setFundConfig(_policyManagerConfig);
        }

        emit FundConfigSet(
            _vaultProxy,
            _denominationAsset,
            _feeManagerConfig,
            _policyManagerConfig
        );

        // 3. Activate fund
        status = FundStatus.Active;
        emit FundStatusUpdated(FundStatus.None, FundStatus.Active);
    }

    // /// @notice Shut down the fund
    // function shutDownFund() external {
    //     require(msg.sender == MANAGER, "shutDownFund: Only fund manager can call this function");
    //     require(status == FundStatus.Active, "shutDownFund: Fund is not active");

    //     status = FundStatus.Inactive;
    //     emit StatusUpdated(status);
    // }

    // TODO: make this specific to whether the fund uses an extension
    function __isExtension(address _who) private view returns (bool) {
        return _who == FEE_MANAGER || _who == POLICY_MANAGER || _who == INTEGRATION_MANAGER;
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
        for (uint256 i = 0; i < assets.length; i++) {
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

    /// @notice Calculates the cost of 1 unit of shares in the fund's denomination asset
    /// @return The amount of the denomination asset required to buy 1 unit of shares
    /// @dev Does not account for latest fees.
    // TODO: include function to account for latest fees. Confirm that any function that uses this does not rely on exact price.
    function calcSharePrice() public onlyDelegateCall returns (uint256) {
        uint256 sharesSupply = IERC20Extended(vaultProxy).totalSupply();
        if (sharesSupply == 0) {
            return 10**uint256(IERC20Extended(denominationAsset).decimals());
        } else {
            return calcGav().mul(10**uint256(SHARES_DECIMALS)).div(sharesSupply);
        }
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
    ) external override payable onlyDelegateCall amguPayable returns (uint256) {
        __preBuySharesHook(_buyer, _investmentAmount, _minSharesQuantity);

        uint256 sharesBought = _investmentAmount
            .mul(10**uint256(IERC20Extended(denominationAsset).decimals()))
            .div(calcSharePrice());

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

        IPolicyManager(POLICY_MANAGER).preValidatePolicies(
            address(this),
            IPolicyManager.PolicyHook.BuyShares,
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

        IPolicyManager(POLICY_MANAGER).postValidatePolicies(
            address(this),
            IPolicyManager.PolicyHook.BuyShares,
            abi.encode(_buyer, _investmentAmount, _sharesBought)
        );
    }

    /// @notice Redeem a specified quantity of the sender's shares
    /// for a proportionate slice of the fund's assets
    /// @dev If _bypassFailure is set to true, the user will lose their claim to any assets for
    /// which the transfer function fails. This should always be false unless explicitly intended
    /// @param _sharesQuantity The amount of shares to redeem
    /// @param _bypassFailure True if token transfer failures should be ignored and forfeited
    function __redeemShares(uint256 _sharesQuantity, bool _bypassFailure) private {
        address redeemer = msg.sender;

        require(_sharesQuantity > 0, "__redeemShares: _sharesQuantity must be > 0");

        // Attempt to settle fees, but don't allow an error to block redemption
        // This also handles a rejection from onlyActiveFund when the fund is shutdown
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
        for (uint256 i = 0; i < payoutAssets.length; i++) {
            // Redeemer's ownership percentage of asset holdings
            payoutQuantities[i] = assetBalances[i].mul(_sharesQuantity).div(sharesSupply);

            // Transfer payout asset to redeemer
            // TODO: do we really need to check the transfer balance here? What's the edge case we're trying to prevent?
            uint256 receiverPreBalance = IERC20Extended(payoutAssets[i]).balanceOf(redeemer);
            try vaultContract.withdrawAssetTo(payoutAssets[i], redeemer, payoutQuantities[i])  {
                require(
                    receiverPreBalance.add(payoutQuantities[i]) ==
                        IERC20Extended(payoutAssets[i]).balanceOf(redeemer),
                    "__redeemShares: Receiver did not receive tokens in transfer"
                );
            } catch {
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

    function getOwner() external view returns (address) {
        return owner;
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
