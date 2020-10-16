// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund/vault/IVault.sol";
import "../../infrastructure/value-interpreter/IValueInterpreter.sol";
import "../../utils/AddressArrayLib.sol";
import "../policy-manager/IPolicyManager.sol";
import "../utils/ExtensionBase.sol";
import "../utils/FundDeployerOwnerMixin.sol";
import "./IIntegrationAdapter.sol";

/// @title IntegrationManager
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Extension to handle DeFi integration actions for funds
contract IntegrationManager is ExtensionBase, FundDeployerOwnerMixin {
    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    event AdapterDeregistered(address indexed adapter, string indexed identifier);

    event AdapterRegistered(address indexed adapter, string indexed identifier);

    event CallOnIntegrationExecuted(
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

    address private immutable POLICY_MANAGER;
    address private immutable VALUE_INTERPRETER;

    EnumerableSet.AddressSet private registeredAdapters;

    constructor(
        address _fundDeployer,
        address _policyManager,
        address _valueInterpreter
    ) public FundDeployerOwnerMixin(_fundDeployer) {
        POLICY_MANAGER = _policyManager;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Universal method for calling third party contract functions through adapters
    /// @param _caller The account who called this function via `IntegrationManager.callOnExtension`
    /// @param _callArgs The encoded args for this function, passed from `IntegrationManager.callOnExtension`
    /// - _adapter Adapter of the integration on which to execute a call
    /// - _selector Method selector of the adapter method to execute
    /// - _integrationData Encoded arguments specific to the adapter
    /// @dev Refer to specific adapter to see how to encode its arguments.
    /// This function assumes the msg.sender to be a valid ComptrollerProxy, but there is no need
    /// to validate that because its specified vaultProxy must have the msg.sender as its accessor.
    function callOnIntegration(address _caller, bytes calldata _callArgs) external {
        address vaultProxy = IComptroller(msg.sender).getVaultProxy();
        require(
            IVault(vaultProxy).getAccessor() == msg.sender,
            "callOnIntegration: sender is not the designated accessor of its vaultProxy"
        );

        // TODO: allow others to call through state var, or possibly implement roles
        require(
            _caller == IVault(vaultProxy).getOwner(),
            "callOnIntegration: Only an authorized account can call this function"
        );

        (
            address[] memory expectedIncomingAssets,
            uint256[] memory preCallIncomingAssetBalances,
            uint256[] memory minIncomingAssetAmounts,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            uint256[] memory preCallSpendAssetBalances
        ) = __preProcessCoI(vaultProxy, _callArgs);

        __preCoIHook(
            _callArgs,
            expectedIncomingAssets,
            minIncomingAssetAmounts,
            spendAssets,
            spendAssetAmounts
        );

        __executeCoI(
            vaultProxy,
            _callArgs,
            abi.encode(spendAssets, spendAssetAmounts, expectedIncomingAssets)
        );

        (
            address[] memory incomingAssets,
            uint256[] memory incomingAssetAmounts,
            address[] memory outgoingAssets,
            uint256[] memory outgoingAssetAmounts
        ) = __postProcessCoI(
            vaultProxy,
            expectedIncomingAssets,
            preCallIncomingAssetBalances,
            minIncomingAssetAmounts,
            spendAssets,
            preCallSpendAssetBalances
        );

        __postCoIHook(
            _callArgs,
            incomingAssets,
            incomingAssetAmounts,
            outgoingAssets,
            outgoingAssetAmounts
        );

        __emitCoIEvent(
            vaultProxy,
            _caller,
            _callArgs,
            incomingAssets,
            incomingAssetAmounts,
            outgoingAssets,
            outgoingAssetAmounts
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to emit the CallOnIntegrationExecuted event.
    /// Avoids stack-too-deep error.
    function __emitCoIEvent(
        address _vaultProxy,
        address _caller,
        bytes memory _callArgs,
        address[] memory _incomingAssets,
        uint256[] memory _incomingAssetAmounts,
        address[] memory _outgoingAssets,
        uint256[] memory _outgoingAssetAmounts
    ) private {
        (
            address adapter,
            bytes4 selector,
            bytes memory integrationData
        ) = __decodeCallOnIntegrationArgs(_callArgs);

        emit CallOnIntegrationExecuted(
            msg.sender,
            _vaultProxy,
            _caller,
            adapter,
            selector,
            integrationData,
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
        return IERC20(_asset).balanceOf(_vaultProxy);
    }

    function __preCoIHook(
        bytes memory _callArgs,
        address[] memory _expectedIncomingAssets,
        uint256[] memory _minIncomingAssetAmounts,
        address[] memory _spendAssets,
        uint256[] memory _spendAssetAmounts
    ) private {
        (address adapter, bytes4 selector, ) = __decodeCallOnIntegrationArgs(_callArgs);

        // Pre-validate against fund policies
        IPolicyManager(POLICY_MANAGER).validatePolicies(
            msg.sender,
            IPolicyManager.PolicyHook.CallOnIntegration,
            IPolicyManager.PolicyHookExecutionTime.Pre,
            abi.encode(
                selector,
                adapter,
                _expectedIncomingAssets,
                _minIncomingAssetAmounts,
                _spendAssets,
                _spendAssetAmounts
            )
        );
    }

    /// @dev Helper for the actions to take prior to _executeCoI() in callOnIntegration()
    function __preProcessCoI(address _vaultProxy, bytes memory _callArgs)
        private
        returns (
            address[] memory expectedIncomingAssets_,
            uint256[] memory preCallIncomingAssetBalances_,
            uint256[] memory minIncomingAssetAmounts_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            uint256[] memory preCallSpendAssetBalances_
        )
    {
        (
            address adapter,
            bytes4 selector,
            bytes memory integrationData
        ) = __decodeCallOnIntegrationArgs(_callArgs);

        require(adapterIsRegistered(adapter), "__preProcessCoI: adapter is not registered");

        // Note that expected incoming and spend assets are allowed to overlap
        // (e.g., a fee for the incomingAsset charged in a spend asset)
        (
            spendAssets_,
            spendAssetAmounts_,
            expectedIncomingAssets_,
            minIncomingAssetAmounts_
        ) = IIntegrationAdapter(adapter).parseAssetsForMethod(selector, integrationData);
        require(
            spendAssets_.length == spendAssetAmounts_.length,
            "__preProcessCoI: spend assets arrays unequal"
        );
        require(
            expectedIncomingAssets_.length == minIncomingAssetAmounts_.length,
            "__preProcessCoI: incoming assets arrays unequal"
        );
        require(spendAssets_.isUniqueSet(), "__preProcessCoI: duplicate spend asset detected");
        require(
            expectedIncomingAssets_.isUniqueSet(),
            "__preProcessCoI: duplicate incoming asset detected"
        );

        preCallIncomingAssetBalances_ = new uint256[](expectedIncomingAssets_.length);
        for (uint256 i = 0; i < expectedIncomingAssets_.length; i++) {
            require(
                expectedIncomingAssets_[i] != address(0),
                "__preProcessCoI: empty incoming asset address detected"
            );
            require(
                minIncomingAssetAmounts_[i] > 0,
                "__preProcessCoI: minIncomingAssetAmount must be >0"
            );
            require(
                IValueInterpreter(VALUE_INTERPRETER).isSupportedAsset(expectedIncomingAssets_[i]),
                "__preProcessCoI: non-receivable asset detected"
            );

            // Get pre-call balance of each incoming asset.
            // If the asset is not tracked by the fund, allow the balance to default to 0.
            if (IVault(_vaultProxy).isTrackedAsset(expectedIncomingAssets_[i])) {
                preCallIncomingAssetBalances_[i] = __getVaultAssetBalance(
                    _vaultProxy,
                    expectedIncomingAssets_[i]
                );
            }
        }

        // Get pre-call balances of spend assets and grant approvals to adapter
        preCallSpendAssetBalances_ = new uint256[](spendAssets_.length);
        for (uint256 i = 0; i < spendAssets_.length; i++) {
            require(spendAssets_[i] != address(0), "__preProcessCoI: empty spendAsset detected");

            // If spend asset is also an incoming asset, no need to record its balance
            if (!expectedIncomingAssets_.contains(spendAssets_[i])) {
                preCallSpendAssetBalances_[i] = __getVaultAssetBalance(
                    _vaultProxy,
                    spendAssets_[i]
                );
            }

            // Use exact approve amount rather than increasing allowances,
            // because all adapters finish their actions atomically.
            // Note that spendAssets_ is already asserted to a unique set.
            // TODO: Could send directly to the adapter rather than requiring a transfer in each adapter
            IComptroller(msg.sender).approveAssetSpender(
                spendAssets_[i],
                adapter,
                spendAssetAmounts_[i]
            );
        }
    }

    function __postCoIHook(
        bytes memory _callArgs,
        address[] memory _incomingAssets,
        uint256[] memory _incomingAssetAmounts,
        address[] memory _outgoingAssets,
        uint256[] memory _outgoingAssetAmounts
    ) private {
        (address adapter, bytes4 selector, ) = __decodeCallOnIntegrationArgs(_callArgs);

        // Post-validate CoI against fund policies
        IPolicyManager(POLICY_MANAGER).validatePolicies(
            msg.sender,
            IPolicyManager.PolicyHook.CallOnIntegration,
            IPolicyManager.PolicyHookExecutionTime.Post,
            abi.encode(
                selector,
                adapter,
                _incomingAssets,
                _incomingAssetAmounts,
                _outgoingAssets,
                _outgoingAssetAmounts
            )
        );
    }

    /// @dev Helper to reconcile and format incoming and outgoing assets post-CoI
    function __postProcessCoI(
        address _vaultProxy,
        address[] memory _expectedIncomingAssets,
        uint256[] memory _preCallIncomingAssetBalances,
        uint256[] memory _minIncomingAssetAmounts,
        address[] memory _spendAssets,
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
        ) = __reconcileCoISpendAssets(_vaultProxy, _spendAssets, _preCallSpendAssetBalances);

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
                "__reconcileCoIAssets: received incoming asset less than expected"
            );

            // Even if the asset's previous balance was >0, it might not have been tracked
            IComptroller(msg.sender).addTrackedAsset(_expectedIncomingAssets[i]);

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
        address[] memory _spendAssets,
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
            // If spend asset's initial balance is 0, then it is an incoming asset.
            // If the pre- and post- balances are equal, then the asset is neither incoming nor outgoing.
            if (
                _preCallSpendAssetBalances[i] == 0 ||
                postCallSpendAssetBalances[i] == _preCallSpendAssetBalances[i]
            ) {
                continue;
            }

            // Determine if the asset is outgoing or incoming, and store the post-balance for later use
            postCallSpendAssetBalances[i] = __getVaultAssetBalance(_vaultProxy, _spendAssets[i]);
            if (postCallSpendAssetBalances[i] < _preCallSpendAssetBalances[i]) {
                outgoingAssetsCount++;
            } else {
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
            // Ignore these cases, for the reasons above
            if (
                _preCallSpendAssetBalances[i] == 0 ||
                postCallSpendAssetBalances[i] == _preCallSpendAssetBalances[i]
            ) {
                continue;
            }

            if (postCallSpendAssetBalances[i] < _preCallSpendAssetBalances[i]) {
                if (postCallSpendAssetBalances[i] == 0) {
                    IComptroller(msg.sender).removeTrackedAsset(_spendAssets[i]);
                    outgoingAssetAmounts_[outgoingAssetsIndex] = _preCallSpendAssetBalances[i];
                } else {
                    outgoingAssetAmounts_[outgoingAssetsIndex] = _preCallSpendAssetBalances[i].sub(
                        postCallSpendAssetBalances[i]
                    );
                }

                outgoingAssets_[outgoingAssetsIndex] = _spendAssets[i];
                outgoingAssetsIndex++;
            } else {
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
                "deregisterAdapters: adapter is not registered"
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
            require(_adapters[i] != address(0), "registerAdapters: adapter cannot be empty");

            require(
                !adapterIsRegistered(_adapters[i]),
                "registerAdapters: adapter already registered"
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

    /// @notice Gets the `POLICY_MANAGER` variable
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    function getPolicyManager() external view returns (address policyManager_) {
        return POLICY_MANAGER;
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
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() external view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}
