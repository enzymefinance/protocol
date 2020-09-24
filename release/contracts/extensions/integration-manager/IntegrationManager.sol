// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund/vault/IVault.sol";
import "../../core/fund-deployer/utils/FundDeployerOwnable.sol";
import "../../infrastructure/price-feeds/derivatives/IDerivativePriceFeed.sol";
import "../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../utils/AddressArrayLib.sol";
import "../policy-manager/IPolicyManager.sol";
import "../utils/ExtensionBase.sol";
import "./IIntegrationAdapter.sol";

/// @title IntegrationManager
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Extension to handle DeFi integration actions for funds
contract IntegrationManager is ExtensionBase, FundDeployerOwnable {
    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    event AdapterDeregistered(address indexed adapter, string indexed identifier);

    event AdapterRegistered(address indexed adapter, string indexed identifier);

    event CallOnIntegrationExecuted(
        address indexed comptrollerProxy,
        address indexed vaultProxy,
        address caller,
        address indexed adapter,
        address[] incomingAssets,
        uint256[] incomingAssetAmounts,
        address[] outgoingAssets,
        uint256[] outgoingAssetAmounts
    );

    address private immutable POLICY_MANAGER;

    EnumerableSet.AddressSet private registeredAdapters;

    constructor(address _fundDeployer, address _policyManager)
        public
        FundDeployerOwnable(_fundDeployer)
    {
        POLICY_MANAGER = _policyManager;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Universal method for calling third party contract functions through adapters
    /// @dev Refer to specific adapter to see how to encode its arguments
    /// @param _caller The account who called this function via `IntegrationManager.callOnExtension`
    /// @param _callArgs The encoded args for this function, passed from `IntegrationManager.callOnExtension`
    /// - _adapter Adapter of the integration on which to execute a call
    /// - _selector Method selector of the adapter method to execute
    /// - _integrationData Encoded arguments specific to the adapter
    // TODO: restrict to active fund
    function callOnIntegration(address _caller, bytes calldata _callArgs) external {
        // No need to validate that the sender is a real ComptrollerProxy,
        // but we do require caller to:
        // 1. implement an IComptroller interface function to get its VaultProxy
        // 2. be the designated `accessor` of the VaultProxy
        IComptroller comptrollerContract = IComptroller(msg.sender);
        address vaultProxy = comptrollerContract.getVaultProxy();

        // TODO: we might not need this validation because access will be blocked by the VaultProxy
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
            address adapter,
            bytes4 selector,
            bytes memory integrationData
        ) = __decodeCallOnIntegrationArgs(_callArgs);

        require(adapterIsRegistered(adapter), "callOnIntegration: adapter is not registered");

        (
            address[] memory incomingAssets,
            uint256[] memory preCallIncomingAssetBalances,
            uint256[] memory minIncomingAssetAmounts,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            uint256[] memory preCallSpendAssetBalances
        ) = __preProcessCoI(vaultProxy, adapter, selector, integrationData);

        __executeCoI(
            adapter,
            selector,
            vaultProxy,
            integrationData,
            abi.encode(spendAssets, spendAssetAmounts, incomingAssets)
        );

        __postProcessCoI(
            _caller,
            vaultProxy,
            adapter,
            selector,
            incomingAssets,
            preCallIncomingAssetBalances,
            minIncomingAssetAmounts,
            spendAssets,
            preCallSpendAssetBalances
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to get the vault's balance of a particular asset
    function __getVaultAssetBalance(address _vaultProxy, address _asset)
        private
        view
        returns (uint256)
    {
        return IERC20(_asset).balanceOf(_vaultProxy);
    }

    /// @dev Helper to execute a call to an integration
    /// @dev Avoids stack-too-deep error
    function __executeCoI(
        address _adapter,
        bytes4 _selector,
        address _vaultProxy,
        bytes memory _integrationData,
        bytes memory _encodedAssetTransferArgs
    ) private {
        (bool success, bytes memory returnData) = _adapter.call(
            abi.encodeWithSelector(
                _selector,
                _vaultProxy,
                _integrationData,
                _encodedAssetTransferArgs
            )
        );
        require(success, string(returnData));
    }

    /// @dev Helper for the actions to take prior to _executeCoI() in callOnIntegration()
    function __preProcessCoI(
        address _vaultProxy,
        address _adapter,
        bytes4 _selector,
        bytes memory _integrationData
    )
        private
        returns (
            address[] memory incomingAssets_,
            uint256[] memory preCallIncomingAssetBalances_,
            uint256[] memory minIncomingAssetAmounts_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            uint256[] memory preCallSpendAssetBalances_
        )
    {
        // Get and validate assets to transact
        // Notes:
        // - Incoming asset amounts allowed to be 0 (e.g., in case of adding an airdropped token)
        // - Incoming + spend assets are allowed to overlap (e.g., a fee for the incomingAsset charged in a spend asset)
        (
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        ) = IIntegrationAdapter(_adapter).parseAssetsForMethod(_selector, _integrationData);
        require(
            spendAssets_.length == spendAssetAmounts_.length,
            "__preProcessCoI: spend assets arrays unequal"
        );
        require(
            incomingAssets_.length == minIncomingAssetAmounts_.length,
            "__preProcessCoI: incoming assets arrays unequal"
        );
        require(spendAssets_.isUniqueSet(), "__preProcessCoI: duplicate spend asset detected");
        require(
            incomingAssets_.isUniqueSet(),
            "__preProcessCoI: duplicate incoming asset detected"
        );

        preCallIncomingAssetBalances_ = new uint256[](incomingAssets_.length);
        for (uint256 i = 0; i < incomingAssets_.length; i++) {
            require(
                incomingAssets_[i] != address(0),
                "__preProcessCoI: empty incoming asset address detected"
            );
            require(
                IComptroller(msg.sender).isReceivableAsset(incomingAssets_[i]),
                "__preProcessCoI: non-receivable asset detected"
            );

            // Get pre-call balance of each incoming asset.
            // If the asset is not tracked by the fund, allow the balance to default to 0.
            if (IVault(_vaultProxy).isTrackedAsset(incomingAssets_[i])) {
                preCallIncomingAssetBalances_[i] = __getVaultAssetBalance(
                    _vaultProxy,
                    incomingAssets_[i]
                );
            }
        }

        // Pre-validate against fund policies
        IPolicyManager(POLICY_MANAGER).validatePolicies(
            msg.sender,
            IPolicyManager.PolicyHook.CallOnIntegration,
            IPolicyManager.PolicyHookExecutionTime.Pre,
            abi.encode(
                _selector,
                _adapter,
                incomingAssets_,
                minIncomingAssetAmounts_,
                spendAssets_,
                spendAssetAmounts_
            )
        );

        // Get pre-call balances of spend assets and grant approvals to adapter
        preCallSpendAssetBalances_ = new uint256[](spendAssets_.length);
        for (uint256 i = 0; i < spendAssets_.length; i++) {
            require(spendAssets_[i] != address(0), "__preProcessCoI: empty spendAsset detected");
            preCallSpendAssetBalances_[i] = __getVaultAssetBalance(_vaultProxy, spendAssets_[i]);
            // Use exact approve amount rather than increasing allowances,
            // because all adapters finish their actions atomically.
            // Note that spendAssets_ is already asserted to a unique set.
            // TODO: Could send directly to the adapter rather than requiring a transfer in each adapter
            IComptroller(msg.sender).approveAssetSpender(
                spendAssets_[i],
                _adapter,
                spendAssetAmounts_[i]
            );
        }
    }

    /// @dev Helper for the actions to take after _executeCoI() in callOnIntegration()
    function __postProcessCoI(
        address _caller,
        address _vaultProxy,
        address _adapter,
        bytes4 _selector,
        address[] memory _incomingAssets,
        uint256[] memory _preCallIncomingAssetBalances,
        uint256[] memory _minIncomingAssetAmounts,
        address[] memory _spendAssets,
        uint256[] memory _preCallSpendAssetBalances
    ) private {
        // Calc incoming/outgoing amounts, validate incoming amounts, remove excess approvals
        (
            uint256[] memory incomingAssetAmounts,
            address[] memory outgoingAssets,
            uint256[] memory outgoingAssetAmounts
        ) = __reconcileCoIAssets(
            _vaultProxy,
            _incomingAssets,
            _preCallIncomingAssetBalances,
            _minIncomingAssetAmounts,
            _spendAssets,
            _preCallSpendAssetBalances
        );

        // Post-validate against fund policies
        IPolicyManager(POLICY_MANAGER).validatePolicies(
            msg.sender,
            IPolicyManager.PolicyHook.CallOnIntegration,
            IPolicyManager.PolicyHookExecutionTime.Post,
            abi.encode(
                _selector,
                _adapter,
                _incomingAssets,
                incomingAssetAmounts,
                outgoingAssets,
                outgoingAssetAmounts
            )
        );

        emit CallOnIntegrationExecuted(
            msg.sender,
            _vaultProxy,
            _caller,
            _adapter,
            _incomingAssets,
            incomingAssetAmounts,
            outgoingAssets,
            outgoingAssetAmounts
        );
    }

    function __reconcileCoIAssets(
        address _vaultProxy,
        address[] memory _incomingAssets,
        uint256[] memory _preCallIncomingAssetBalances,
        uint256[] memory _minIncomingAssetAmounts,
        address[] memory _spendAssets,
        uint256[] memory _preCallSpendAssetBalances
    )
        private
        returns (
            uint256[] memory incomingAssetAmounts_,
            address[] memory outgoingAssets_,
            uint256[] memory outgoingAssetAmounts_
        )
    {
        // Calculate and validate incoming asset amounts
        incomingAssetAmounts_ = new uint256[](_incomingAssets.length);
        for (uint256 i = 0; i < _incomingAssets.length; i++) {
            // Allow balanceDiff to be 0, in case of an airdrop or token migration, for example
            uint256 newBalance = __getVaultAssetBalance(_vaultProxy, _incomingAssets[i]);
            require(
                newBalance >= _preCallIncomingAssetBalances[i],
                "__reconcileCoIAssets: incoming asset balance cannot decrease"
            );

            uint256 balanceDiff = newBalance.sub(_preCallIncomingAssetBalances[i]);
            require(
                balanceDiff >= _minIncomingAssetAmounts[i],
                "__reconcileCoIAssets: received incoming asset less than expected"
            );

            // Even if the asset's previous balance was >0, it might not have been tracked
            IComptroller(msg.sender).addTrackedAsset(_incomingAssets[i]);
            incomingAssetAmounts_[i] = balanceDiff;
        }

        // Calculate and validate outgoing assets and amounts
        uint256[] memory spendAssetBalanceDiffs = new uint256[](_spendAssets.length);
        uint256 outgoingAssetsCount;
        for (uint256 i = 0; i < _spendAssets.length; i++) {
            // If spend asset is also an incoming asset, ignore
            if (_incomingAssets.contains(_spendAssets[i])) continue;

            // Confirm spend asset balance has not increased
            uint256 newBalance = __getVaultAssetBalance(_vaultProxy, _spendAssets[i]);

            // TODO: How should we handle spend assets that increase unexpectedly?
            // It only matters for events. We can't revert, because otherwise a user
            // could brick an adapter by sending it a tiny amount of ERC20 tokens.

            if (newBalance < _preCallSpendAssetBalances[i]) {
                spendAssetBalanceDiffs[i] = _preCallSpendAssetBalances[i].sub(newBalance);
                outgoingAssetsCount++;
            }
        }

        outgoingAssets_ = new address[](outgoingAssetsCount);
        outgoingAssetAmounts_ = new uint256[](outgoingAssetsCount);
        uint256 outgoingAssetsIndex;
        for (uint256 i = 0; i < _spendAssets.length; i++) {
            if (spendAssetBalanceDiffs[i] == 0) continue;

            // Remove asset from owned assets if 0 balance
            if (__getVaultAssetBalance(_vaultProxy, _spendAssets[i]) == 0) {
                IComptroller(msg.sender).removeTrackedAsset(_spendAssets[i]);
            }

            // Add asset to outgoing assets
            outgoingAssets_[outgoingAssetsIndex] = _spendAssets[i];
            outgoingAssetAmounts_[outgoingAssetsIndex] = spendAssetBalanceDiffs[i];
            outgoingAssetsIndex++;
        }
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

    /// @notice Check if an integration adapter is registered
    /// @param _adapter The adapter to check
    /// @return True if the adapter is registered
    function adapterIsRegistered(address _adapter) public view returns (bool) {
        return registeredAdapters.contains(_adapter);
    }

    function getPolicyManager() external view returns (address) {
        POLICY_MANAGER;
    }

    /// @notice Get all registered integration adapters
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
}
