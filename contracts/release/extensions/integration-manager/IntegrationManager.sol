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
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/vault/IVault.sol";
import "../../infrastructure/price-feeds/derivatives/IDerivativePriceFeed.sol";
import "../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../utils/AddressArrayLib.sol";
import "../policy-manager/IPolicyManager.sol";
import "../utils/ExtensionBase.sol";
import "../utils/FundDeployerOwnerMixin.sol";
import "../utils/PermissionedVaultActionMixin.sol";
import "./integrations/IIntegrationAdapter.sol";
import "./IIntegrationManager.sol";

/// @title IntegrationManager
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Extension to handle DeFi integration actions for funds
contract IntegrationManager is
    IIntegrationManager,
    ExtensionBase,
    FundDeployerOwnerMixin,
    PermissionedVaultActionMixin
{
    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    event AdapterDeregistered(address indexed adapter, string indexed identifier);

    event AdapterRegistered(address indexed adapter, string indexed identifier);

    event AuthUserAddedForFund(address indexed comptrollerProxy, address indexed account);

    event AuthUserRemovedForFund(address indexed comptrollerProxy, address indexed account);

    event CallOnIntegrationExecutedForFund(
        address indexed comptrollerProxy,
        address vaultProxy,
        address caller,
        address indexed adapter,
        bytes4 indexed selector,
        bytes integrationData,
        address[] incomingAssets,
        uint256[] incomingAssetAmounts,
        address[] outgoingAssets,
        uint256[] outgoingAssetAmounts
    );

    address private immutable DERIVATIVE_PRICE_FEED;
    address private immutable POLICY_MANAGER;
    address private immutable PRIMITIVE_PRICE_FEED;

    EnumerableSet.AddressSet private registeredAdapters;

    mapping(address => mapping(address => bool)) private comptrollerProxyToAcctToIsAuthUser;

    constructor(
        address _fundDeployer,
        address _policyManager,
        address _derivativePriceFeed,
        address _primitivePriceFeed
    ) public FundDeployerOwnerMixin(_fundDeployer) {
        DERIVATIVE_PRICE_FEED = _derivativePriceFeed;
        POLICY_MANAGER = _policyManager;
        PRIMITIVE_PRICE_FEED = _primitivePriceFeed;
    }

    /////////////
    // GENERAL //
    /////////////

    /// @notice Activates the extension by storing the VaultProxy
    function activateForFund(bool) external override {
        __setValidatedVaultProxy(msg.sender);
    }

    /// @notice Authorizes a user to act on behalf of a fund via the IntegrationManager
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _who The user to authorize
    function addAuthUserForFund(address _comptrollerProxy, address _who) external {
        __validateSetAuthUser(_comptrollerProxy, _who, true);

        comptrollerProxyToAcctToIsAuthUser[_comptrollerProxy][_who] = true;

        emit AuthUserAddedForFund(_comptrollerProxy, _who);
    }

    /// @notice Deactivate the extension by destroying storage
    function deactivateForFund() external override {
        delete comptrollerProxyToVaultProxy[msg.sender];
    }

    /// @notice Removes an authorized user from the IntegrationManager for the given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _who The authorized user to remove
    function removeAuthUserForFund(address _comptrollerProxy, address _who) external {
        __validateSetAuthUser(_comptrollerProxy, _who, false);

        comptrollerProxyToAcctToIsAuthUser[_comptrollerProxy][_who] = false;

        emit AuthUserRemovedForFund(_comptrollerProxy, _who);
    }

    /// @notice Checks whether an account is an authorized IntegrationManager user for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _who The account to check
    /// @return isAuthUser_ True if the account is an authorized user or the fund owner
    function isAuthUserForFund(address _comptrollerProxy, address _who)
        public
        view
        returns (bool isAuthUser_)
    {
        return
            comptrollerProxyToAcctToIsAuthUser[_comptrollerProxy][_who] ||
            _who == IVault(comptrollerProxyToVaultProxy[_comptrollerProxy]).getOwner();
    }

    /// @dev Helper to validate calls to update comptrollerProxyToAcctToIsAuthUser
    function __validateSetAuthUser(
        address _comptrollerProxy,
        address _who,
        bool _nextIsAuthUser
    ) private view {
        require(
            comptrollerProxyToVaultProxy[_comptrollerProxy] != address(0),
            "__validateSetAuthUser: Fund has not been activated"
        );

        address fundOwner = IVault(comptrollerProxyToVaultProxy[_comptrollerProxy]).getOwner();
        require(
            msg.sender == fundOwner,
            "__validateSetAuthUser: Only the fund owner can call this function"
        );
        require(_who != fundOwner, "__validateSetAuthUser: Cannot set for the fund owner");

        if (_nextIsAuthUser) {
            require(
                !comptrollerProxyToAcctToIsAuthUser[_comptrollerProxy][_who],
                "__validateSetAuthUser: Account is already an authorized user"
            );
        } else {
            require(
                comptrollerProxyToAcctToIsAuthUser[_comptrollerProxy][_who],
                "__validateSetAuthUser: Account is not an authorized user"
            );
        }
    }

    ///////////////////////////////
    // CALL-ON-EXTENSION ACTIONS //
    ///////////////////////////////

    /// @notice Receives a dispatched `callOnExtension` from a fund's ComptrollerProxy
    /// @param _caller The user who called for this action
    /// @param _actionId An ID representing the desired action
    /// @param _callArgs The encoded args for the action
    function receiveCallFromComptroller(
        address _caller,
        uint256 _actionId,
        bytes calldata _callArgs
    ) external override {
        // Since we validate and store the ComptrollerProxy-VaultProxy pairing during
        // activateForFund(), this function does not require further validation of the
        // sending ComptrollerProxy
        address vaultProxy = comptrollerProxyToVaultProxy[msg.sender];
        require(vaultProxy != address(0), "receiveCallFromComptroller: Fund is not active");
        require(
            isAuthUserForFund(msg.sender, _caller),
            "receiveCallFromComptroller: Not an authorized user"
        );

        // Dispatch the action
        if (_actionId == 0) {
            __callOnIntegration(_caller, vaultProxy, _callArgs);
        } else if (_actionId == 1) {
            __addZeroBalanceTrackedAssets(vaultProxy, _callArgs);
        } else if (_actionId == 2) {
            __removeZeroBalanceTrackedAssets(vaultProxy, _callArgs);
        } else {
            revert("receiveCallFromComptroller: Invalid _actionId");
        }
    }

    /// @dev Adds assets with a zero balance as tracked assets of the fund
    function __addZeroBalanceTrackedAssets(address _vaultProxy, bytes memory _callArgs) private {
        address[] memory assets = abi.decode(_callArgs, (address[]));
        for (uint256 i; i < assets.length; i++) {
            require(
                __isSupportedAsset(assets[i]),
                "__addZeroBalanceTrackedAssets: Unsupported asset"
            );
            require(
                ERC20(assets[i]).balanceOf(_vaultProxy) == 0,
                "__addZeroBalanceTrackedAssets: Balance is not zero"
            );

            __addTrackedAsset(msg.sender, assets[i]);
        }
    }

    /// @dev Removes assets with a zero balance from tracked assets of the fund
    function __removeZeroBalanceTrackedAssets(address _vaultProxy, bytes memory _callArgs)
        private
    {
        address[] memory assets = abi.decode(_callArgs, (address[]));
        address denominationAsset = IComptroller(msg.sender).getDenominationAsset();
        for (uint256 i; i < assets.length; i++) {
            require(
                assets[i] != denominationAsset,
                "__removeZeroBalanceTrackedAssets: Cannot remove denomination asset"
            );
            require(
                ERC20(assets[i]).balanceOf(_vaultProxy) == 0,
                "__removeZeroBalanceTrackedAssets: Balance is not zero"
            );

            __removeTrackedAsset(msg.sender, assets[i]);
        }
    }

    /////////////////////////
    // CALL ON INTEGRATION //
    /////////////////////////

    /// @notice Universal method for calling third party contract functions through adapters
    /// @param _caller The caller of this function via the ComptrollerProxy
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _callArgs The encoded args for this function
    /// - _adapter Adapter of the integration on which to execute a call
    /// - _selector Method selector of the adapter method to execute
    /// - _integrationData Encoded arguments specific to the adapter
    /// @dev msg.sender is the ComptrollerProxy.
    /// Refer to specific adapter to see how to encode its arguments.
    function __callOnIntegration(
        address _caller,
        address _vaultProxy,
        bytes memory _callArgs
    ) private {
        (
            address adapter,
            bytes4 selector,
            bytes memory integrationData
        ) = __decodeCallOnIntegrationArgs(_callArgs);

        __preCoIHook(adapter, selector);

        /// Passing decoded _callArgs leads to stack-too-deep error
        (
            address[] memory incomingAssets,
            uint256[] memory incomingAssetAmounts,
            address[] memory outgoingAssets,
            uint256[] memory outgoingAssetAmounts
        ) = __callOnIntegrationInner(_vaultProxy, _callArgs);

        __postCoIHook(
            adapter,
            selector,
            incomingAssets,
            incomingAssetAmounts,
            outgoingAssets,
            outgoingAssetAmounts
        );

        __emitCoIEvent(
            _vaultProxy,
            _caller,
            adapter,
            selector,
            integrationData,
            incomingAssets,
            incomingAssetAmounts,
            outgoingAssets,
            outgoingAssetAmounts
        );
    }

    /// @dev Helper to execute the bulk of logic of callOnIntegration.
    /// Avoids the stack-too-deep-error.
    function __callOnIntegrationInner(address vaultProxy, bytes memory _callArgs)
        private
        returns (
            address[] memory incomingAssets_,
            uint256[] memory incomingAssetAmounts_,
            address[] memory outgoingAssets_,
            uint256[] memory outgoingAssetAmounts_
        )
    {
        (
            address[] memory expectedIncomingAssets,
            uint256[] memory preCallIncomingAssetBalances,
            uint256[] memory minIncomingAssetAmounts,
            SpendAssetsHandleType spendAssetsHandleType,
            address[] memory spendAssets,
            uint256[] memory maxSpendAssetAmounts,
            uint256[] memory preCallSpendAssetBalances
        ) = __preProcessCoI(vaultProxy, _callArgs);

        __executeCoI(
            vaultProxy,
            _callArgs,
            abi.encode(
                spendAssetsHandleType,
                spendAssets,
                maxSpendAssetAmounts,
                expectedIncomingAssets
            )
        );

        (
            incomingAssets_,
            incomingAssetAmounts_,
            outgoingAssets_,
            outgoingAssetAmounts_
        ) = __postProcessCoI(
            vaultProxy,
            expectedIncomingAssets,
            preCallIncomingAssetBalances,
            minIncomingAssetAmounts,
            spendAssetsHandleType,
            spendAssets,
            maxSpendAssetAmounts,
            preCallSpendAssetBalances
        );

        return (incomingAssets_, incomingAssetAmounts_, outgoingAssets_, outgoingAssetAmounts_);
    }

    /// @dev Helper to decode CoI args
    function __decodeCallOnIntegrationArgs(bytes memory _callArgs)
        private
        pure
        returns (
            address adapter_,
            bytes4 selector_,
            bytes memory integrationData_
        )
    {
        return abi.decode(_callArgs, (address, bytes4, bytes));
    }

    /// @dev Helper to emit the CallOnIntegrationExecuted event.
    /// Avoids stack-too-deep error.
    function __emitCoIEvent(
        address _vaultProxy,
        address _caller,
        address _adapter,
        bytes4 _selector,
        bytes memory _integrationData,
        address[] memory _incomingAssets,
        uint256[] memory _incomingAssetAmounts,
        address[] memory _outgoingAssets,
        uint256[] memory _outgoingAssetAmounts
    ) private {
        emit CallOnIntegrationExecutedForFund(
            msg.sender,
            _vaultProxy,
            _caller,
            _adapter,
            _selector,
            _integrationData,
            _incomingAssets,
            _incomingAssetAmounts,
            _outgoingAssets,
            _outgoingAssetAmounts
        );
    }

    /// @dev Helper to execute a call to an integration
    /// @dev Avoids stack-too-deep error
    function __executeCoI(
        address _vaultProxy,
        bytes memory _callArgs,
        bytes memory _encodedAssetTransferArgs
    ) private {
        (
            address adapter,
            bytes4 selector,
            bytes memory integrationData
        ) = __decodeCallOnIntegrationArgs(_callArgs);

        (bool success, bytes memory returnData) = adapter.call(
            abi.encodeWithSelector(
                selector,
                _vaultProxy,
                integrationData,
                _encodedAssetTransferArgs
            )
        );
        require(success, string(returnData));
    }

    /// @dev Helper to get the vault's balance of a particular asset
    function __getVaultAssetBalance(address _vaultProxy, address _asset)
        private
        view
        returns (uint256)
    {
        return ERC20(_asset).balanceOf(_vaultProxy);
    }

    /// @dev Helper to check if an asset is supported
    function __isSupportedAsset(address _asset) private view returns (bool isSupported_) {
        return
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_asset) ||
            IDerivativePriceFeed(DERIVATIVE_PRICE_FEED).isSupportedAsset(_asset);
    }

    /// @dev Helper for the actions to take on external contracts prior to executing CoI
    function __preCoIHook(address _adapter, bytes4 _selector) private {
        IPolicyManager(POLICY_MANAGER).validatePolicies(
            msg.sender,
            IPolicyManager.PolicyHook.PreCallOnIntegration,
            abi.encode(_adapter, _selector)
        );
    }

    /// @dev Helper for the internal actions to take prior to executing CoI
    function __preProcessCoI(address _vaultProxy, bytes memory _callArgs)
        private
        returns (
            address[] memory expectedIncomingAssets_,
            uint256[] memory preCallIncomingAssetBalances_,
            uint256[] memory minIncomingAssetAmounts_,
            SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory maxSpendAssetAmounts_,
            uint256[] memory preCallSpendAssetBalances_
        )
    {
        (
            address adapter,
            bytes4 selector,
            bytes memory integrationData
        ) = __decodeCallOnIntegrationArgs(_callArgs);

        require(adapterIsRegistered(adapter), "callOnIntegration: Adapter is not registered");

        // Note that expected incoming and spend assets are allowed to overlap
        // (e.g., a fee for the incomingAsset charged in a spend asset)
        (
            spendAssetsHandleType_,
            spendAssets_,
            maxSpendAssetAmounts_,
            expectedIncomingAssets_,
            minIncomingAssetAmounts_
        ) = IIntegrationAdapter(adapter).parseAssetsForMethod(selector, integrationData);
        require(
            spendAssets_.length == maxSpendAssetAmounts_.length,
            "__preProcessCoI: Spend assets arrays unequal"
        );
        require(
            expectedIncomingAssets_.length == minIncomingAssetAmounts_.length,
            "__preProcessCoI: Incoming assets arrays unequal"
        );
        require(spendAssets_.isUniqueSet(), "__preProcessCoI: Duplicate spend asset");
        require(
            expectedIncomingAssets_.isUniqueSet(),
            "__preProcessCoI: Duplicate incoming asset"
        );

        IVault vaultProxyContract = IVault(_vaultProxy);

        preCallIncomingAssetBalances_ = new uint256[](expectedIncomingAssets_.length);
        for (uint256 i = 0; i < expectedIncomingAssets_.length; i++) {
            require(
                expectedIncomingAssets_[i] != address(0),
                "__preProcessCoI: Empty incoming asset address"
            );
            require(
                minIncomingAssetAmounts_[i] > 0,
                "__preProcessCoI: minIncomingAssetAmount must be >0"
            );
            require(
                __isSupportedAsset(expectedIncomingAssets_[i]),
                "__preProcessCoI: Non-receivable incoming asset"
            );

            // Get pre-call balance of each incoming asset.
            // If the asset is not tracked by the fund, allow the balance to default to 0.
            if (vaultProxyContract.isTrackedAsset(expectedIncomingAssets_[i])) {
                preCallIncomingAssetBalances_[i] = ERC20(expectedIncomingAssets_[i]).balanceOf(
                    _vaultProxy
                );
            }
        }

        // Get pre-call balances of spend assets and grant approvals to adapter
        preCallSpendAssetBalances_ = new uint256[](spendAssets_.length);
        for (uint256 i = 0; i < spendAssets_.length; i++) {
            require(spendAssets_[i] != address(0), "__preProcessCoI: Empty spend asset");
            require(maxSpendAssetAmounts_[i] > 0, "__preProcessCoI: Empty max spend asset amount");

            // If spend asset is also an incoming asset, no need to record its balance
            if (!expectedIncomingAssets_.contains(spendAssets_[i])) {
                preCallSpendAssetBalances_[i] = ERC20(spendAssets_[i]).balanceOf(_vaultProxy);
            }

            // Grant spend assets access to the adapter.
            // Note that spendAssets_ is already asserted to a unique set.
            if (spendAssetsHandleType_ == SpendAssetsHandleType.Approve) {
                // Use exact approve amount rather than increasing allowances,
                // because all adapters finish their actions atomically.
                __approveAssetSpender(
                    msg.sender,
                    spendAssets_[i],
                    adapter,
                    maxSpendAssetAmounts_[i]
                );
            } else if (spendAssetsHandleType_ == SpendAssetsHandleType.Transfer) {
                __withdrawAssetTo(msg.sender, spendAssets_[i], adapter, maxSpendAssetAmounts_[i]);
            } else if (spendAssetsHandleType_ == SpendAssetsHandleType.Remove) {
                __removeTrackedAsset(msg.sender, spendAssets_[i]);
            }
        }
    }

    /// @dev Helper for the actions to take on external contracts after executing CoI
    function __postCoIHook(
        address _adapter,
        bytes4 _selector,
        address[] memory _incomingAssets,
        uint256[] memory _incomingAssetAmounts,
        address[] memory _outgoingAssets,
        uint256[] memory _outgoingAssetAmounts
    ) private {
        IPolicyManager(POLICY_MANAGER).validatePolicies(
            msg.sender,
            IPolicyManager.PolicyHook.PostCallOnIntegration,
            abi.encode(
                _adapter,
                _selector,
                _incomingAssets,
                _incomingAssetAmounts,
                _outgoingAssets,
                _outgoingAssetAmounts
            )
        );
    }

    /// @dev Helper to reconcile and format incoming and outgoing assets after executing CoI
    function __postProcessCoI(
        address _vaultProxy,
        address[] memory _expectedIncomingAssets,
        uint256[] memory _preCallIncomingAssetBalances,
        uint256[] memory _minIncomingAssetAmounts,
        SpendAssetsHandleType _spendAssetsHandleType,
        address[] memory _spendAssets,
        uint256[] memory _maxSpendAssetAmounts,
        uint256[] memory _preCallSpendAssetBalances
    )
        private
        returns (
            address[] memory incomingAssets_,
            uint256[] memory incomingAssetAmounts_,
            address[] memory outgoingAssets_,
            uint256[] memory outgoingAssetAmounts_
        )
    {
        address[] memory increasedSpendAssets;
        uint256[] memory increasedSpendAssetAmounts;
        (
            outgoingAssets_,
            outgoingAssetAmounts_,
            increasedSpendAssets,
            increasedSpendAssetAmounts
        ) = __reconcileCoISpendAssets(
            _vaultProxy,
            _spendAssetsHandleType,
            _spendAssets,
            _maxSpendAssetAmounts,
            _preCallSpendAssetBalances
        );

        (incomingAssets_, incomingAssetAmounts_) = __reconcileCoIIncomingAssets(
            _vaultProxy,
            _expectedIncomingAssets,
            _preCallIncomingAssetBalances,
            _minIncomingAssetAmounts,
            increasedSpendAssets,
            increasedSpendAssetAmounts
        );

        return (incomingAssets_, incomingAssetAmounts_, outgoingAssets_, outgoingAssetAmounts_);
    }

    /// @dev Helper to process incoming asset balance changes.
    /// See __reconcileCoISpendAssets() for explanation on "increasedSpendAssets".
    function __reconcileCoIIncomingAssets(
        address _vaultProxy,
        address[] memory _expectedIncomingAssets,
        uint256[] memory _preCallIncomingAssetBalances,
        uint256[] memory _minIncomingAssetAmounts,
        address[] memory _increasedSpendAssets,
        uint256[] memory _increasedSpendAssetAmounts
    ) private returns (address[] memory incomingAssets_, uint256[] memory incomingAssetAmounts_) {
        // Incoming assets = expected incoming assets + spend assets with increased balances
        uint256 incomingAssetsCount = _expectedIncomingAssets.length.add(
            _increasedSpendAssets.length
        );

        // Calculate and validate incoming asset amounts
        incomingAssets_ = new address[](incomingAssetsCount);
        incomingAssetAmounts_ = new uint256[](incomingAssetsCount);
        for (uint256 i = 0; i < _expectedIncomingAssets.length; i++) {
            uint256 balanceDiff = __getVaultAssetBalance(_vaultProxy, _expectedIncomingAssets[i])
                .sub(_preCallIncomingAssetBalances[i]);
            require(
                balanceDiff >= _minIncomingAssetAmounts[i],
                "__reconcileCoIAssets: Received incoming asset less than expected"
            );

            // Even if the asset's previous balance was >0, it might not have been tracked
            __addTrackedAsset(msg.sender, _expectedIncomingAssets[i]);

            incomingAssets_[i] = _expectedIncomingAssets[i];
            incomingAssetAmounts_[i] = balanceDiff;
        }

        // Append increaseSpendAssets to incomingAsset vars
        if (_increasedSpendAssets.length > 0) {
            uint256 incomingAssetIndex = _expectedIncomingAssets.length;
            for (uint256 i = 0; i < _increasedSpendAssets.length; i++) {
                incomingAssets_[incomingAssetIndex] = _increasedSpendAssets[i];
                incomingAssetAmounts_[incomingAssetIndex] = _increasedSpendAssetAmounts[i];
                incomingAssetIndex++;
            }
        }

        return (incomingAssets_, incomingAssetAmounts_);
    }

    /// @dev Helper to process spend asset balance changes.
    /// "outgoingAssets" are the spend assets with a decrease in balance.
    /// "increasedSpendAssets" are the spend assets with an unexpected increase in balance.
    /// For example, "increasedSpendAssets" can occur if an adapter has a pre-balance of
    /// the spendAsset, which would be transferred to the fund at the end of the tx.
    function __reconcileCoISpendAssets(
        address _vaultProxy,
        SpendAssetsHandleType _spendAssetsHandleType,
        address[] memory _spendAssets,
        uint256[] memory _maxSpendAssetAmounts,
        uint256[] memory _preCallSpendAssetBalances
    )
        private
        returns (
            address[] memory outgoingAssets_,
            uint256[] memory outgoingAssetAmounts_,
            address[] memory increasedSpendAssets_,
            uint256[] memory increasedSpendAssetAmounts_
        )
    {
        // Determine spend asset balance changes
        uint256[] memory postCallSpendAssetBalances = new uint256[](_spendAssets.length);
        uint256 outgoingAssetsCount;
        uint256 increasedSpendAssetsCount;
        for (uint256 i = 0; i < _spendAssets.length; i++) {
            // If spend asset's initial balance is 0, then it is an incoming asset
            if (_preCallSpendAssetBalances[i] == 0) {
                continue;
            }

            // Handle SpendAssetsHandleType.Remove separately
            if (_spendAssetsHandleType == SpendAssetsHandleType.Remove) {
                outgoingAssetsCount++;
                continue;
            }

            // Determine if the asset is outgoing or incoming, and store the post-balance for later use
            postCallSpendAssetBalances[i] = __getVaultAssetBalance(_vaultProxy, _spendAssets[i]);
            // If the pre- and post- balances are equal, then the asset is neither incoming nor outgoing
            if (postCallSpendAssetBalances[i] < _preCallSpendAssetBalances[i]) {
                outgoingAssetsCount++;
            } else if (postCallSpendAssetBalances[i] > _preCallSpendAssetBalances[i]) {
                increasedSpendAssetsCount++;
            }
        }

        // Format outgoingAssets and increasedSpendAssets (spend assets with unexpected increase in balance)
        outgoingAssets_ = new address[](outgoingAssetsCount);
        outgoingAssetAmounts_ = new uint256[](outgoingAssetsCount);
        increasedSpendAssets_ = new address[](increasedSpendAssetsCount);
        increasedSpendAssetAmounts_ = new uint256[](increasedSpendAssetsCount);
        uint256 outgoingAssetsIndex;
        uint256 increasedSpendAssetsIndex;
        for (uint256 i = 0; i < _spendAssets.length; i++) {
            // If spend asset's initial balance is 0, then it is an incoming asset.
            if (_preCallSpendAssetBalances[i] == 0) {
                continue;
            }

            // Handle SpendAssetsHandleType.Remove separately.
            // No need to validate the max spend asset amount.
            if (_spendAssetsHandleType == SpendAssetsHandleType.Remove) {
                outgoingAssets_[outgoingAssetsIndex] = _spendAssets[i];
                outgoingAssetAmounts_[outgoingAssetsIndex] = _preCallSpendAssetBalances[i];
                outgoingAssetsIndex++;
                continue;
            }

            // If the pre- and post- balances are equal, then the asset is neither incoming nor outgoing
            if (postCallSpendAssetBalances[i] < _preCallSpendAssetBalances[i]) {
                if (postCallSpendAssetBalances[i] == 0) {
                    __removeTrackedAsset(msg.sender, _spendAssets[i]);
                    outgoingAssetAmounts_[outgoingAssetsIndex] = _preCallSpendAssetBalances[i];
                } else {
                    outgoingAssetAmounts_[outgoingAssetsIndex] = _preCallSpendAssetBalances[i].sub(
                        postCallSpendAssetBalances[i]
                    );
                }
                require(
                    outgoingAssetAmounts_[outgoingAssetsIndex] <= _maxSpendAssetAmounts[i],
                    "__reconcileCoISpendAssets: Spent amount greater than expected"
                );

                outgoingAssets_[outgoingAssetsIndex] = _spendAssets[i];
                outgoingAssetsIndex++;
            } else if (postCallSpendAssetBalances[i] > _preCallSpendAssetBalances[i]) {
                increasedSpendAssetAmounts_[increasedSpendAssetsIndex] = postCallSpendAssetBalances[i]
                    .sub(_preCallSpendAssetBalances[i]);
                increasedSpendAssets_[increasedSpendAssetsIndex] = _spendAssets[i];
                increasedSpendAssetsIndex++;
            }
        }

        return (
            outgoingAssets_,
            outgoingAssetAmounts_,
            increasedSpendAssets_,
            increasedSpendAssetAmounts_
        );
    }

    ///////////////////////////
    // INTEGRATIONS REGISTRY //
    ///////////////////////////

    /// @notice Remove integration adapters from the list of registered adapters
    /// @param _adapters Addresses of adapters to be deregistered
    function deregisterAdapters(address[] calldata _adapters) external onlyFundDeployerOwner {
        require(_adapters.length > 0, "deregisterAdapters: _adapters cannot be empty");

        for (uint256 i; i < _adapters.length; i++) {
            require(
                adapterIsRegistered(_adapters[i]),
                "deregisterAdapters: Adapter is not registered"
            );

            registeredAdapters.remove(_adapters[i]);

            emit AdapterDeregistered(_adapters[i], IIntegrationAdapter(_adapters[i]).identifier());
        }
    }

    /// @notice Add integration adapters to the list of registered adapters
    /// @param _adapters Addresses of adapters to be registered
    function registerAdapters(address[] calldata _adapters) external onlyFundDeployerOwner {
        require(_adapters.length > 0, "registerAdapters: _adapters cannot be empty");

        for (uint256 i; i < _adapters.length; i++) {
            require(_adapters[i] != address(0), "registerAdapters: Adapter cannot be empty");

            require(
                !adapterIsRegistered(_adapters[i]),
                "registerAdapters: Adapter already registered"
            );

            registeredAdapters.add(_adapters[i]);

            emit AdapterRegistered(_adapters[i], IIntegrationAdapter(_adapters[i]).identifier());
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Checks if an integration adapter is registered
    /// @param _adapter The adapter to check
    /// @return isRegistered_ True if the adapter is registered
    function adapterIsRegistered(address _adapter) public view returns (bool isRegistered_) {
        return registeredAdapters.contains(_adapter);
    }

    /// @notice Gets the `DERIVATIVE_PRICE_FEED` variable
    /// @return derivativePriceFeed_ The `DERIVATIVE_PRICE_FEED` variable value
    function getDerivativePriceFeed() external view returns (address derivativePriceFeed_) {
        return DERIVATIVE_PRICE_FEED;
    }

    /// @notice Gets the `POLICY_MANAGER` variable
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    function getPolicyManager() external view returns (address policyManager_) {
        return POLICY_MANAGER;
    }

    /// @notice Gets the `PRIMITIVE_PRICE_FEED` variable
    /// @return primitivePriceFeed_ The `PRIMITIVE_PRICE_FEED` variable value
    function getPrimitivePriceFeed() external view returns (address primitivePriceFeed_) {
        return PRIMITIVE_PRICE_FEED;
    }

    /// @notice Gets all registered integration adapters
    /// @return registeredAdaptersArray_ A list of all registered integration adapters
    function getRegisteredAdapters()
        external
        view
        returns (address[] memory registeredAdaptersArray_)
    {
        registeredAdaptersArray_ = new address[](registeredAdapters.length());
        for (uint256 i = 0; i < registeredAdaptersArray_.length; i++) {
            registeredAdaptersArray_[i] = registeredAdapters.at(i);
        }

        return registeredAdaptersArray_;
    }
}
