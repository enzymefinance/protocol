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
import "../../../../persistent/external-positions/IExternalPosition.sol";
import "../../../extensions/IExtension.sol";
import "../../../extensions/fee-manager/IFeeManager.sol";
import "../../../extensions/policy-manager/IPolicyManager.sol";
import "../../../infrastructure/gas-relayer/GasRelayRecipientMixin.sol";
import "../../../infrastructure/gas-relayer/IGasRelayPaymaster.sol";
import "../../../infrastructure/gas-relayer/IGasRelayPaymasterDepositor.sol";
import "../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import "../../../utils/beacon-proxy/IBeaconProxyFactory.sol";
import "../../../utils/AddressArrayLib.sol";
import "../../fund-deployer/IFundDeployer.sol";
import "../vault/IVault.sol";
import "./IComptroller.sol";

/// @title ComptrollerLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The core logic library shared by all funds
contract ComptrollerLib is IComptroller, IGasRelayPaymasterDepositor, GasRelayRecipientMixin {
    using AddressArrayLib for address[];
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    event AutoProtocolFeeSharesBuybackSet(bool autoProtocolFeeSharesBuyback);

    event BuyBackMaxProtocolFeeSharesFailed(
        bytes indexed failureReturnData,
        uint256 sharesAmount,
        uint256 buybackValueInMln,
        uint256 gav
    );
    event DeactivateFeeManagerFailed();

    event GasRelayPaymasterSet(address gasRelayPaymaster);

    event MigratedSharesDuePaid(uint256 sharesDue);

    event PayProtocolFeeDuringDestructFailed();

    event PreRedeemSharesHookFailed(
        bytes indexed failureReturnData,
        address indexed redeemer,
        uint256 sharesAmount
    );

    event RedeemSharesInKindCalcGavFailed();

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
    address private constant SPECIFIC_ASSET_REDEMPTION_DUMMY_FORFEIT_ADDRESS =
        0x000000000000000000000000000000000000aaaa;
    address private immutable DISPATCHER;
    address private immutable EXTERNAL_POSITION_MANAGER;
    address private immutable FUND_DEPLOYER;
    address private immutable FEE_MANAGER;
    address private immutable INTEGRATION_MANAGER;
    address private immutable MLN_TOKEN;
    address private immutable POLICY_MANAGER;
    address private immutable PROTOCOL_FEE_RESERVE;
    address private immutable VALUE_INTERPRETER;
    address private immutable WETH_TOKEN;

    // Pseudo-constants (can only be set once)

    address internal denominationAsset;
    address internal vaultProxy;
    // True only for the one non-proxy
    bool internal isLib;

    // Storage

    // Attempts to buy back protocol fee shares immediately after collection
    bool internal autoProtocolFeeSharesBuyback;
    // A reverse-mutex, granting atomic permission for particular contracts to make vault calls
    bool internal permissionedVaultActionAllowed;
    // A mutex to protect against reentrancy
    bool internal reentranceLocked;
    // A timelock after the last time shares were bought for an account
    // that must expire before that account transfers or redeems their shares
    uint256 internal sharesActionTimelock;
    mapping(address => uint256) internal acctToLastSharesBoughtTimestamp;
    // The contract which manages paying gas relayers
    address private gasRelayPaymaster;

    ///////////////
    // MODIFIERS //
    ///////////////

    modifier allowsPermissionedVaultAction() {
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

    modifier onlyFundDeployer() {
        __assertIsFundDeployer();
        _;
    }
    modifier onlyGasRelayPaymaster() {
        __assertIsGasRelayPaymaster();
        _;
    }

    modifier onlyOwner() {
        __assertIsOwner(__msgSender());
        _;
    }

    modifier onlyOwnerNotRelayable() {
        __assertIsOwner(msg.sender);
        _;
    }

    // ASSERTION HELPERS

    // Modifiers are inefficient in terms of contract size,
    // so we use helper functions to prevent repetitive inlining of expensive string values.

    function __assertIsFundDeployer() private view {
        require(msg.sender == getFundDeployer(), "Only FundDeployer callable");
    }

    function __assertIsGasRelayPaymaster() private view {
        require(msg.sender == getGasRelayPaymaster(), "Only Gas Relay Paymaster callable");
    }

    function __assertIsOwner(address _who) private view {
        require(_who == IVault(getVaultProxy()).getOwner(), "Only fund owner callable");
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
                block.timestamp.sub(lastSharesBoughtTimestamp) >= getSharesActionTimelock() ||
                __hasPendingMigrationOrReconfiguration(_vaultProxy),
            "Shares action timelocked"
        );
    }

    constructor(
        address _dispatcher,
        address _protocolFeeReserve,
        address _fundDeployer,
        address _valueInterpreter,
        address _externalPositionManager,
        address _feeManager,
        address _integrationManager,
        address _policyManager,
        address _gasRelayPaymasterFactory,
        address _mlnToken,
        address _wethToken
    ) public GasRelayRecipientMixin(_gasRelayPaymasterFactory) {
        DISPATCHER = _dispatcher;
        EXTERNAL_POSITION_MANAGER = _externalPositionManager;
        FEE_MANAGER = _feeManager;
        FUND_DEPLOYER = _fundDeployer;
        INTEGRATION_MANAGER = _integrationManager;
        MLN_TOKEN = _mlnToken;
        POLICY_MANAGER = _policyManager;
        PROTOCOL_FEE_RESERVE = _protocolFeeReserve;
        VALUE_INTERPRETER = _valueInterpreter;
        WETH_TOKEN = _wethToken;
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
    ) external override locksReentrance allowsPermissionedVaultAction {
        require(
            _extension == getFeeManager() ||
                _extension == getIntegrationManager() ||
                _extension == getExternalPositionManager(),
            "callOnExtension: _extension invalid"
        );

        IExtension(_extension).receiveCallFromComptroller(__msgSender(), _actionId, _callArgs);
    }

    /// @notice Makes an arbitrary call with the VaultProxy contract as the sender
    /// @param _contract The contract to call
    /// @param _selector The selector to call
    /// @param _encodedArgs The encoded arguments for the call
    /// @return returnData_ The data returned by the call
    function vaultCallOnContract(
        address _contract,
        bytes4 _selector,
        bytes calldata _encodedArgs
    ) external onlyOwner returns (bytes memory returnData_) {
        require(
            IFundDeployer(getFundDeployer()).isAllowedVaultCall(
                _contract,
                _selector,
                keccak256(_encodedArgs)
            ),
            "vaultCallOnContract: Not allowed"
        );

        return
            IVault(getVaultProxy()).callOnContract(
                _contract,
                abi.encodePacked(_selector, _encodedArgs)
            );
    }

    /// @dev Helper to check if a VaultProxy has a pending migration or reconfiguration request
    function __hasPendingMigrationOrReconfiguration(address _vaultProxy)
        private
        view
        returns (bool hasPendingMigrationOrReconfiguration)
    {
        return
            IDispatcher(getDispatcher()).hasMigrationRequest(_vaultProxy) ||
            IFundDeployer(getFundDeployer()).hasReconfigurationRequest(_vaultProxy);
    }

    //////////////////
    // PROTOCOL FEE //
    //////////////////

    /// @notice Buys back shares collected as protocol fee at a discounted shares price, using MLN
    /// @param _sharesAmount The amount of shares to buy back
    function buyBackProtocolFeeShares(uint256 _sharesAmount) external {
        address vaultProxyCopy = vaultProxy;
        require(
            IVault(vaultProxyCopy).canManageAssets(__msgSender()),
            "buyBackProtocolFeeShares: Unauthorized"
        );

        uint256 gav = calcGav();

        IVault(vaultProxyCopy).buyBackProtocolFeeShares(
            _sharesAmount,
            __getBuybackValueInMln(vaultProxyCopy, _sharesAmount, gav),
            gav
        );
    }

    /// @notice Sets whether to attempt to buyback protocol fee shares immediately when collected
    /// @param _nextAutoProtocolFeeSharesBuyback True if protocol fee shares should be attempted
    /// to be bought back immediately when collected
    function setAutoProtocolFeeSharesBuyback(bool _nextAutoProtocolFeeSharesBuyback)
        external
        onlyOwner
    {
        autoProtocolFeeSharesBuyback = _nextAutoProtocolFeeSharesBuyback;

        emit AutoProtocolFeeSharesBuybackSet(_nextAutoProtocolFeeSharesBuyback);
    }

    /// @dev Helper to buyback the max available protocol fee shares, during an auto-buyback
    function __buyBackMaxProtocolFeeShares(address _vaultProxy, uint256 _gav) private {
        uint256 sharesAmount = ERC20(_vaultProxy).balanceOf(getProtocolFeeReserve());
        uint256 buybackValueInMln = __getBuybackValueInMln(_vaultProxy, sharesAmount, _gav);

        try
            IVault(_vaultProxy).buyBackProtocolFeeShares(sharesAmount, buybackValueInMln, _gav)
        {} catch (bytes memory reason) {
            emit BuyBackMaxProtocolFeeSharesFailed(reason, sharesAmount, buybackValueInMln, _gav);
        }
    }

    /// @dev Helper to buyback the max available protocol fee shares
    function __getBuybackValueInMln(
        address _vaultProxy,
        uint256 _sharesAmount,
        uint256 _gav
    ) private returns (uint256 buybackValueInMln_) {
        address denominationAssetCopy = getDenominationAsset();

        uint256 grossShareValue = __calcGrossShareValue(
            _gav,
            ERC20(_vaultProxy).totalSupply(),
            10**uint256(ERC20(denominationAssetCopy).decimals())
        );

        uint256 buybackValueInDenominationAsset = grossShareValue.mul(_sharesAmount).div(
            SHARES_UNIT
        );

        return
            IValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(
                denominationAssetCopy,
                buybackValueInDenominationAsset,
                getMlnToken()
            );
    }

    ////////////////////////////////
    // PERMISSIONED VAULT ACTIONS //
    ////////////////////////////////

    /// @notice Makes a permissioned, state-changing call on the VaultProxy contract
    /// @param _action The enum representing the VaultAction to perform on the VaultProxy
    /// @param _actionData The call data for the action to perform
    function permissionedVaultAction(IVault.VaultAction _action, bytes calldata _actionData)
        external
        override
    {
        __assertPermissionedVaultAction(msg.sender, _action);

        // Validate action as needed
        if (_action == IVault.VaultAction.RemoveTrackedAsset) {
            require(
                abi.decode(_actionData, (address)) != getDenominationAsset(),
                "permissionedVaultAction: Cannot untrack denomination asset"
            );
        }

        IVault(getVaultProxy()).receiveValidatedVaultAction(_action, _actionData);
    }

    /// @dev Helper to assert that a caller is allowed to perform a particular VaultAction.
    /// Uses this pattern rather than multiple `require` statements to save on contract size.
    function __assertPermissionedVaultAction(address _caller, IVault.VaultAction _action)
        private
        view
    {
        bool validAction;
        if (permissionedVaultActionAllowed) {
            // Calls are roughly ordered by likely frequency
            if (_caller == getIntegrationManager()) {
                if (
                    _action == IVault.VaultAction.AddTrackedAsset ||
                    _action == IVault.VaultAction.RemoveTrackedAsset ||
                    _action == IVault.VaultAction.WithdrawAssetTo ||
                    _action == IVault.VaultAction.ApproveAssetSpender
                ) {
                    validAction = true;
                }
            } else if (_caller == getFeeManager()) {
                if (
                    _action == IVault.VaultAction.MintShares ||
                    _action == IVault.VaultAction.BurnShares ||
                    _action == IVault.VaultAction.TransferShares
                ) {
                    validAction = true;
                }
            } else if (_caller == getExternalPositionManager()) {
                if (
                    _action == IVault.VaultAction.CallOnExternalPosition ||
                    _action == IVault.VaultAction.AddExternalPosition ||
                    _action == IVault.VaultAction.RemoveExternalPosition
                ) {
                    validAction = true;
                }
            }
        }

        require(validAction, "__assertPermissionedVaultAction: Action not allowed");
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
        require(getDenominationAsset() == address(0), "init: Already initialized");
        require(
            IValueInterpreter(getValueInterpreter()).isSupportedPrimitiveAsset(_denominationAsset),
            "init: Bad denomination asset"
        );

        denominationAsset = _denominationAsset;
        sharesActionTimelock = _sharesActionTimelock;
    }

    /// @notice Sets the VaultProxy
    /// @param _vaultProxy The VaultProxy contract
    /// @dev No need to assert anything beyond FundDeployer access.
    /// Called atomically with init(), but after ComptrollerProxy has been deployed.
    function setVaultProxy(address _vaultProxy) external override onlyFundDeployer {
        vaultProxy = _vaultProxy;

        emit VaultProxySet(_vaultProxy);
    }

    /// @notice Runs atomic logic after a ComptrollerProxy has become its vaultProxy's `accessor`
    /// @param _isMigration True if a migrated fund is being activated
    /// @dev No need to assert anything beyond FundDeployer access.
    function activate(bool _isMigration) external override onlyFundDeployer {
        address vaultProxyCopy = getVaultProxy();

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

        IVault(vaultProxyCopy).addTrackedAsset(getDenominationAsset());

        // Activate extensions
        IExtension(getFeeManager()).activateForFund(_isMigration);
        IExtension(getPolicyManager()).activateForFund(_isMigration);
    }

    /// @notice Wind down and destroy a ComptrollerProxy that is active
    /// @param _deactivateFeeManagerGasLimit The amount of gas to forward to deactivate the FeeManager
    /// @param _payProtocolFeeGasLimit The amount of gas to forward to pay the protocol fee
    /// @dev No need to assert anything beyond FundDeployer access.
    /// Uses the try/catch pattern throughout out of an abundance of caution for the function's success.
    /// All external calls must use limited forwarded gas to ensure that a migration to another release
    /// does not get bricked by logic that consumes too much gas for the block limit.
    function destructActivated(
        uint256 _deactivateFeeManagerGasLimit,
        uint256 _payProtocolFeeGasLimit
    ) external override onlyFundDeployer allowsPermissionedVaultAction {
        // Forwarding limited gas here also protects fee recipients by guaranteeing that fee payout logic
        // will run in the next function call
        try IVault(getVaultProxy()).payProtocolFee{gas: _payProtocolFeeGasLimit}() {} catch {
            emit PayProtocolFeeDuringDestructFailed();
        }

        // Do not attempt to auto-buyback protocol fee shares in this case,
        // as the call is gav-dependent and can consume too much gas

        // Deactivate extensions only as-necessary

        // Pays out shares outstanding for fees
        try
            IExtension(getFeeManager()).deactivateForFund{gas: _deactivateFeeManagerGasLimit}()
        {} catch {
            emit DeactivateFeeManagerFailed();
        }

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
    /// @return gav_ The fund GAV
    function calcGav() public override returns (uint256 gav_) {
        address vaultProxyAddress = getVaultProxy();
        address[] memory assets = IVault(vaultProxyAddress).getTrackedAssets();
        address[] memory externalPositions = IVault(vaultProxyAddress)
            .getActiveExternalPositions();

        if (assets.length == 0 && externalPositions.length == 0) {
            return 0;
        }

        uint256[] memory balances = new uint256[](assets.length);
        for (uint256 i; i < assets.length; i++) {
            balances[i] = ERC20(assets[i]).balanceOf(vaultProxyAddress);
        }

        gav_ = IValueInterpreter(getValueInterpreter()).calcCanonicalAssetsTotalValue(
            assets,
            balances,
            getDenominationAsset()
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
    /// @return grossShareValue_ The amount of the denomination asset per share
    /// @dev Does not account for any fees outstanding.
    function calcGrossShareValue() external override returns (uint256 grossShareValue_) {
        uint256 gav = calcGav();

        grossShareValue_ = __calcGrossShareValue(
            gav,
            ERC20(getVaultProxy()).totalSupply(),
            10**uint256(ERC20(getDenominationAsset()).decimals())
        );

        return grossShareValue_;
    }

    // @dev Helper for calculating a external position value. Prevents from stack too deep
    function __calcExternalPositionValue(address _externalPosition)
        private
        returns (uint256 value_)
    {
        (address[] memory managedAssets, uint256[] memory managedAmounts) = IExternalPosition(
            _externalPosition
        ).getManagedAssets();

        uint256 managedValue = IValueInterpreter(getValueInterpreter())
            .calcCanonicalAssetsTotalValue(managedAssets, managedAmounts, getDenominationAsset());

        (address[] memory debtAssets, uint256[] memory debtAmounts) = IExternalPosition(
            _externalPosition
        ).getDebtAssets();

        uint256 debtValue = IValueInterpreter(getValueInterpreter()).calcCanonicalAssetsTotalValue(
            debtAssets,
            debtAmounts,
            getDenominationAsset()
        );

        if (managedValue > debtValue) {
            value_ = managedValue.sub(debtValue);
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
        bool hasSharesActionTimelock = getSharesActionTimelock() > 0;
        address canonicalSender = __msgSender();

        require(
            !hasSharesActionTimelock ||
                IFundDeployer(getFundDeployer()).isAllowedBuySharesOnBehalfCaller(canonicalSender),
            "buySharesOnBehalf: Unauthorized"
        );

        return
            __buyShares(
                _buyer,
                _investmentAmount,
                _minSharesQuantity,
                hasSharesActionTimelock,
                canonicalSender
            );
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
        bool hasSharesActionTimelock = getSharesActionTimelock() > 0;
        address canonicalSender = __msgSender();

        return
            __buyShares(
                canonicalSender,
                _investmentAmount,
                _minSharesQuantity,
                hasSharesActionTimelock,
                canonicalSender
            );
    }

    /// @dev Helper for buy shares logic
    function __buyShares(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity,
        bool _hasSharesActionTimelock,
        address _canonicalSender
    ) private locksReentrance allowsPermissionedVaultAction returns (uint256 sharesReceived_) {
        // Enforcing a _minSharesQuantity also validates `_investmentAmount > 0`
        // and guarantees the function cannot succeed while minting 0 shares
        require(_minSharesQuantity > 0, "__buyShares: _minSharesQuantity must be >0");

        address vaultProxyCopy = getVaultProxy();
        require(
            !_hasSharesActionTimelock || !__hasPendingMigrationOrReconfiguration(vaultProxyCopy),
            "__buyShares: Pending migration or reconfiguration"
        );

        uint256 gav = calcGav();

        // Gives Extensions a chance to run logic prior to the minting of bought shares.
        // Fees implementing this hook should be aware that
        // it might be the case that _investmentAmount != actualInvestmentAmount,
        // if the denomination asset charges a transfer fee, for example.
        __preBuySharesHook(_buyer, _investmentAmount, gav);

        // Pay the protocol fee after running other fees, but before minting new shares
        IVault(vaultProxyCopy).payProtocolFee();
        if (doesAutoProtocolFeeSharesBuyback()) {
            __buyBackMaxProtocolFeeShares(vaultProxyCopy, gav);
        }

        // Transfer the investment asset to the fund.
        // Does not follow the checks-effects-interactions pattern, but it is necessary to
        // do this delta balance calculation before calculating shares to mint.
        uint256 receivedInvestmentAmount = __transferFromWithReceivedAmount(
            getDenominationAsset(),
            _canonicalSender,
            vaultProxyCopy,
            _investmentAmount
        );

        // Calculate the amount of shares to issue with the investment amount
        uint256 sharePrice = __calcGrossShareValue(
            gav,
            ERC20(vaultProxyCopy).totalSupply(),
            10**uint256(ERC20(getDenominationAsset()).decimals())
        );
        uint256 sharesIssued = receivedInvestmentAmount.mul(SHARES_UNIT).div(sharePrice);

        // Mint shares to the buyer
        uint256 prevBuyerShares = ERC20(vaultProxyCopy).balanceOf(_buyer);
        IVault(vaultProxyCopy).mintShares(_buyer, sharesIssued);

        // Gives Extensions a chance to run logic after shares are issued
        __postBuySharesHook(_buyer, receivedInvestmentAmount, sharesIssued, gav);

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

        emit SharesBought(_buyer, receivedInvestmentAmount, sharesIssued, sharesReceived_);

        return sharesReceived_;
    }

    /// @dev Helper for Extension actions immediately prior to issuing shares
    function __preBuySharesHook(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _gav
    ) private {
        IFeeManager(getFeeManager()).invokeHook(
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
        IFeeManager(getFeeManager()).invokeHook(
            IFeeManager.FeeHook.PostBuyShares,
            abi.encode(_buyer, _investmentAmount, _sharesIssued),
            gav
        );

        IPolicyManager(getPolicyManager()).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.PostBuyShares,
            abi.encode(_buyer, _investmentAmount, _sharesIssued, gav)
        );
    }

    /// @dev Helper to execute ERC20.transferFrom() while calculating the actual amount received
    function __transferFromWithReceivedAmount(
        address _asset,
        address _sender,
        address _recipient,
        uint256 _transferAmount
    ) private returns (uint256 receivedAmount_) {
        uint256 preTransferRecipientBalance = ERC20(_asset).balanceOf(_recipient);

        ERC20(_asset).safeTransferFrom(_sender, _recipient, _transferAmount);

        return ERC20(_asset).balanceOf(_recipient).sub(preTransferRecipientBalance);
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
        address canonicalSender = __msgSender();
        require(
            _payoutAssets.length == _payoutAssetPercentages.length,
            "redeemSharesForSpecificAssets: Unequal arrays"
        );
        require(
            _payoutAssets.isUniqueSet(),
            "redeemSharesForSpecificAssets: Duplicate payout asset"
        );

        uint256 gav = calcGav();

        IVault vaultProxyContract = IVault(getVaultProxy());
        (uint256 sharesToRedeem, uint256 sharesSupply) = __redeemSharesSetup(
            vaultProxyContract,
            canonicalSender,
            _sharesQuantity,
            true,
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
            canonicalSender,
            _recipient,
            sharesToRedeem,
            _payoutAssets,
            payoutAmounts_,
            gav
        );

        emit SharesRedeemed(
            canonicalSender,
            _recipient,
            sharesToRedeem,
            _payoutAssets,
            payoutAmounts_
        );

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
        address canonicalSender = __msgSender();
        require(
            _additionalAssets.isUniqueSet(),
            "redeemSharesInKind: _additionalAssets contains duplicates"
        );
        require(
            _assetsToSkip.isUniqueSet(),
            "redeemSharesInKind: _assetsToSkip contains duplicates"
        );

        // Parse the payout assets given optional params to add or skip assets.
        // Note that there is no validation that the _additionalAssets are known assets to
        // the protocol. This means that the redeemer could specify a malicious asset,
        // but since all state-changing, user-callable functions on this contract share the
        // non-reentrant modifier, there is nowhere to perform a reentrancy attack.
        payoutAssets_ = __parseRedemptionPayoutAssets(
            IVault(vaultProxy).getTrackedAssets(),
            _additionalAssets,
            _assetsToSkip
        );

        // If protocol fee shares will be auto-bought back, attempt to calculate GAV to pass into fees,
        // as we will require GAV later during the buyback.
        uint256 gavOrZero;
        if (doesAutoProtocolFeeSharesBuyback()) {
            // Since GAV calculation can fail with a revering price or a no-longer-supported asset,
            // we must try/catch GAV calculation to ensure that in-kind redemption can still succeed
            try this.calcGav() returns (uint256 gav) {
                gavOrZero = gav;
            } catch {
                emit RedeemSharesInKindCalcGavFailed();
            }
        }

        (uint256 sharesToRedeem, uint256 sharesSupply) = __redeemSharesSetup(
            IVault(vaultProxy),
            canonicalSender,
            _sharesQuantity,
            false,
            gavOrZero
        );

        // Calculate and transfer payout asset amounts due to _recipient
        payoutAmounts_ = new uint256[](payoutAssets_.length);
        for (uint256 i; i < payoutAssets_.length; i++) {
            payoutAmounts_[i] = ERC20(payoutAssets_[i])
                .balanceOf(vaultProxy)
                .mul(sharesToRedeem)
                .div(sharesSupply);

            // Transfer payout asset to _recipient
            if (payoutAmounts_[i] > 0) {
                IVault(vaultProxy).withdrawAssetTo(
                    payoutAssets_[i],
                    _recipient,
                    payoutAmounts_[i]
                );
            }
        }

        emit SharesRedeemed(
            canonicalSender,
            _recipient,
            sharesToRedeem,
            payoutAssets_,
            payoutAmounts_
        );

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
        address denominationAssetCopy = getDenominationAsset();
        uint256 percentagesTotal;
        payoutAmounts_ = new uint256[](_payoutAssets.length);
        for (uint256 i; i < _payoutAssets.length; i++) {
            percentagesTotal = percentagesTotal.add(_payoutAssetPercentages[i]);

            // Used to explicitly specify less than 100% in total _payoutAssetPercentages
            if (_payoutAssets[i] == SPECIFIC_ASSET_REDEMPTION_DUMMY_FORFEIT_ADDRESS) {
                continue;
            }

            payoutAmounts_[i] = IValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(
                denominationAssetCopy,
                _owedGav.mul(_payoutAssetPercentages[i]).div(ONE_HUNDRED_PERCENT),
                _payoutAssets[i]
            );
            // Guards against corner case of primitive-to-derivative asset conversion that floors to 0,
            // or redeeming a very low shares amount and/or percentage where asset value owed is 0
            require(
                payoutAmounts_[i] > 0,
                "__payoutSpecifiedAssetPercentages: Zero amount for asset"
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
        bool _forSpecifiedAssets,
        uint256 _gavIfCalculated
    ) private allowsPermissionedVaultAction {
        try
            IFeeManager(getFeeManager()).invokeHook(
                IFeeManager.FeeHook.PreRedeemShares,
                abi.encode(_redeemer, _sharesToRedeem, _forSpecifiedAssets),
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
        IPolicyManager(getPolicyManager()).validatePolicies(
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
        bool _forSpecifiedAssets,
        uint256 _gavIfCalculated
    ) private returns (uint256 sharesToRedeem_, uint256 sharesSupply_) {
        __assertSharesActionNotTimelocked(address(vaultProxyContract), _redeemer);

        ERC20 sharesContract = ERC20(address(vaultProxyContract));

        uint256 preFeesRedeemerSharesBalance = sharesContract.balanceOf(_redeemer);

        if (_sharesQuantityInput == type(uint256).max) {
            sharesToRedeem_ = preFeesRedeemerSharesBalance;
        } else {
            sharesToRedeem_ = _sharesQuantityInput;
        }
        require(sharesToRedeem_ > 0, "__redeemSharesSetup: No shares to redeem");

        __preRedeemSharesHook(_redeemer, sharesToRedeem_, _forSpecifiedAssets, _gavIfCalculated);

        // Update the redemption amount if fees were charged (or accrued) to the redeemer
        uint256 postFeesRedeemerSharesBalance = sharesContract.balanceOf(_redeemer);
        if (_sharesQuantityInput == type(uint256).max) {
            sharesToRedeem_ = postFeesRedeemerSharesBalance;
        } else if (postFeesRedeemerSharesBalance < preFeesRedeemerSharesBalance) {
            sharesToRedeem_ = sharesToRedeem_.sub(
                preFeesRedeemerSharesBalance.sub(postFeesRedeemerSharesBalance)
            );
        }

        // Pay the protocol fee after running other fees, but before burning shares
        vaultProxyContract.payProtocolFee();

        if (_gavIfCalculated > 0 && doesAutoProtocolFeeSharesBuyback()) {
            __buyBackMaxProtocolFeeShares(address(vaultProxyContract), _gavIfCalculated);
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
        address vaultProxyCopy = getVaultProxy();
        require(msg.sender == vaultProxyCopy, "preTransferSharesHook: Only VaultProxy callable");
        __assertSharesActionNotTimelocked(vaultProxyCopy, _sender);

        IPolicyManager(getPolicyManager()).validatePolicies(
            address(this),
            IPolicyManager.PolicyHook.PreTransferShares,
            abi.encode(_sender, _recipient, _amount)
        );
    }

    /// @notice Runs logic prior to transferring shares that are freely transferable
    /// @param _sender The sender of the shares
    /// @dev No need to validate caller, as policies are not run
    function preTransferSharesHookFreelyTransferable(address _sender) external view override {
        __assertSharesActionNotTimelocked(getVaultProxy(), _sender);
    }

    /////////////////
    // GAS RELAYER //
    /////////////////

    /// @notice Deploys a paymaster contract and deposits WETH, enabling gas relaying
    function deployGasRelayPaymaster() external onlyOwnerNotRelayable {
        require(
            getGasRelayPaymaster() == address(0),
            "deployGasRelayPaymaster: Paymaster already deployed"
        );

        bytes memory constructData = abi.encodeWithSignature("init(address)", getVaultProxy());
        address paymaster = IBeaconProxyFactory(getGasRelayPaymasterFactory()).deployProxy(
            constructData
        );

        __setGasRelayPaymaster(paymaster);

        __depositToGasRelayPaymaster(paymaster);
    }

    /// @notice Tops up the gas relay paymaster deposit
    function depositToGasRelayPaymaster() external onlyOwner {
        __depositToGasRelayPaymaster(getGasRelayPaymaster());
    }

    /// @notice Pull WETH from vault to gas relay paymaster
    /// @param _amount Amount of the WETH to pull from the vault
    function pullWethForGasRelayer(uint256 _amount) external override onlyGasRelayPaymaster {
        IVault(getVaultProxy()).withdrawAssetTo(getWethToken(), getGasRelayPaymaster(), _amount);
    }

    /// @notice Sets the gasRelayPaymaster variable value
    /// @param _nextGasRelayPaymaster The next gasRelayPaymaster value
    function setGasRelayPaymaster(address _nextGasRelayPaymaster)
        external
        override
        onlyFundDeployer
    {
        __setGasRelayPaymaster(_nextGasRelayPaymaster);
    }

    /// @notice Removes the gas relay paymaster, withdrawing the remaining WETH balance
    /// and disabling gas relaying
    function shutdownGasRelayPaymaster() external onlyOwnerNotRelayable {
        IGasRelayPaymaster(gasRelayPaymaster).withdrawBalance();

        IVault(vaultProxy).addTrackedAsset(getWethToken());

        delete gasRelayPaymaster;

        emit GasRelayPaymasterSet(address(0));
    }

    /// @dev Helper to deposit to the gas relay paymaster
    function __depositToGasRelayPaymaster(address _paymaster) private {
        IGasRelayPaymaster(_paymaster).deposit();
    }

    /// @dev Helper to set the next `gasRelayPaymaster` variable
    function __setGasRelayPaymaster(address _nextGasRelayPaymaster) private {
        gasRelayPaymaster = _nextGasRelayPaymaster;

        emit GasRelayPaymasterSet(_nextGasRelayPaymaster);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // LIB IMMUTABLES

    /// @notice Gets the `DISPATCHER` variable
    /// @return dispatcher_ The `DISPATCHER` variable value
    function getDispatcher() public view returns (address dispatcher_) {
        return DISPATCHER;
    }

    /// @notice Gets the `EXTERNAL_POSITION_MANAGER` variable
    /// @return externalPositionManager_ The `EXTERNAL_POSITION_MANAGER` variable value
    function getExternalPositionManager()
        public
        view
        override
        returns (address externalPositionManager_)
    {
        return EXTERNAL_POSITION_MANAGER;
    }

    /// @notice Gets the `FEE_MANAGER` variable
    /// @return feeManager_ The `FEE_MANAGER` variable value
    function getFeeManager() public view override returns (address feeManager_) {
        return FEE_MANAGER;
    }

    /// @notice Gets the `FUND_DEPLOYER` variable
    /// @return fundDeployer_ The `FUND_DEPLOYER` variable value
    function getFundDeployer() public view override returns (address fundDeployer_) {
        return FUND_DEPLOYER;
    }

    /// @notice Gets the `INTEGRATION_MANAGER` variable
    /// @return integrationManager_ The `INTEGRATION_MANAGER` variable value
    function getIntegrationManager() public view override returns (address integrationManager_) {
        return INTEGRATION_MANAGER;
    }

    /// @notice Gets the `MLN_TOKEN` variable
    /// @return mlnToken_ The `MLN_TOKEN` variable value
    function getMlnToken() public view returns (address mlnToken_) {
        return MLN_TOKEN;
    }

    /// @notice Gets the `POLICY_MANAGER` variable
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    function getPolicyManager() public view override returns (address policyManager_) {
        return POLICY_MANAGER;
    }

    /// @notice Gets the `PROTOCOL_FEE_RESERVE` variable
    /// @return protocolFeeReserve_ The `PROTOCOL_FEE_RESERVE` variable value
    function getProtocolFeeReserve() public view returns (address protocolFeeReserve_) {
        return PROTOCOL_FEE_RESERVE;
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
    }

    // PROXY STORAGE

    /// @notice Checks if collected protocol fee shares are automatically bought back
    /// while buying or redeeming shares
    /// @return doesAutoBuyback_ True if shares are automatically bought back
    function doesAutoProtocolFeeSharesBuyback() public view returns (bool doesAutoBuyback_) {
        return autoProtocolFeeSharesBuyback;
    }

    /// @notice Gets the `denominationAsset` variable
    /// @return denominationAsset_ The `denominationAsset` variable value
    function getDenominationAsset() public view override returns (address denominationAsset_) {
        return denominationAsset;
    }

    /// @notice Gets the `gasRelayPaymaster` variable
    /// @return gasRelayPaymaster_ The `gasRelayPaymaster` variable value
    function getGasRelayPaymaster() public view override returns (address gasRelayPaymaster_) {
        return gasRelayPaymaster;
    }

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

    /// @notice Gets the `sharesActionTimelock` variable
    /// @return sharesActionTimelock_ The `sharesActionTimelock` variable value
    function getSharesActionTimelock() public view returns (uint256 sharesActionTimelock_) {
        return sharesActionTimelock;
    }

    /// @notice Gets the `vaultProxy` variable
    /// @return vaultProxy_ The `vaultProxy` variable value
    function getVaultProxy() public view override returns (address vaultProxy_) {
        return vaultProxy;
    }
}
