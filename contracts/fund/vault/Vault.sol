// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../../dependencies/libs/EnumerableSet.sol";
import "../../dependencies/TokenUser.sol";
import "../../integrations/IIntegrationAdapter.sol";
import "../../utils/AddressArrayLib.sol";
import "../hub/Spoke.sol";
import "./IVault.sol";

/// @title Vault Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Stores fund assets and plugs into external services via integrations
contract Vault is IVault, TokenUser, Spoke {
    using AddressArrayLib for address[];

    using EnumerableSet for EnumerableSet.AddressSet;

    event AdapterDisabled (address indexed adapter);

    event AdapterEnabled (address indexed adapter);

    event AssetAdded(address asset);

    event AssetRemoved(address asset);

    event CallOnIntegrationExecuted(
        address adapter,
        address[] incomingAssets,
        uint256[] incomingAssetAmounts,
        address[] outgoingAssets,
        uint256[] outgoingAssetAmounts
    );

    uint8 constant public MAX_OWNED_ASSETS = 20; // TODO: Keep this?

    EnumerableSet.AddressSet private ownedAssets;
    EnumerableSet.AddressSet private enabledAdapters;

    constructor(address _hub, address[] memory _adapters) public Spoke(_hub) {
        if (_adapters.length > 0) {
            __enableAdapters(_adapters);
        }
    }

    // EXTERNAL FUNCTIONS

    /// @notice Universal method for calling third party contract functions through adapters
    /// @dev Refer to specific adapter to see how to encode its arguments
    /// @param _adapter Adapter of the integration on which to execute a call
    /// @param _methodSignature Method signature of the adapter method to execute
    /// @param _encodedCallArgs Encoded arguments specific to the adapter
    function callOnIntegration(
        address _adapter,
        string calldata _methodSignature,
        bytes calldata _encodedCallArgs
    )
        external
        onlyManager
    {
        bytes4 selector = bytes4(keccak256(bytes(_methodSignature)));

        (
            address[] memory incomingAssets,
            uint256[] memory preCallIncomingAssetBalances,
            uint256[] memory minIncomingAssetAmounts,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            uint256[] memory preCallSpendAssetBalances
        ) = __preProcessCoI(
            _adapter,
            selector,
            _encodedCallArgs
        );

        __executeCoI(
            _adapter,
            _methodSignature,
            _encodedCallArgs,
            abi.encode(spendAssets, spendAssetAmounts, incomingAssets)
        );

        __postProcessCoI(
            _adapter,
            selector,
            incomingAssets,
            preCallIncomingAssetBalances,
            minIncomingAssetAmounts,
            spendAssets,
            preCallSpendAssetBalances
        );
    }

    /// @notice Deposits an asset into the Vault
    /// @dev Only the Shares contract can call this function
    /// @param _asset The asset to deposit
    /// @param _amount The amount of the asset to deposit
    function deposit(address _asset, uint256 _amount) external override onlyShares {
        require(_amount > 0, "deposit: _amount must be >0");
        __addOwnedAsset(_asset);
        __safeTransferFrom(_asset, msg.sender, address(this), _amount);
    }

    /// @notice Disable integration adapters from use in the fund
    /// @param _adapters The adapters to disable
    function disableAdapters(address[] calldata _adapters) external onlyManager {
        for (uint256 i = 0; i < _adapters.length; i++) {
            address adapter = _adapters[i];
            require(__adapterIsEnabled(adapter), "disableAdapters: adapter already disabled");
            EnumerableSet.remove(enabledAdapters, adapter);
            emit AdapterDisabled(adapter);
        }
    }

    /// @notice Enable integration adapters from use in the fund
    /// @param _adapters The adapters to enable
    function enableAdapters(address[] calldata _adapters) external onlyManager {
        require(_adapters.length > 0, "enableAdapters: _adapters cannot be empty");
        __enableAdapters(_adapters);
    }

    /// @notice Get a list of enabled adapters
    /// @return An array of enabled adapter addresses
    function getEnabledAdapters() external view returns (address[] memory) {
        return EnumerableSet.enumerate(enabledAdapters);
    }

    /// @notice Withdraw an asset from the Vault
    /// @dev Only the Shares contract can call this function
    /// @param _asset The asset to withdraw
    /// @param _amount The amount of the asset to withdraw
    function withdraw(address _asset, uint256 _amount) external override onlyShares {
        if (sub(__getAssetBalance(_asset), _amount) == 0) {
            __removeOwnedAsset(_asset);
        }
        __safeTransfer(_asset, msg.sender, _amount);
    }

    // PUBLIC FUNCTIONS

    /// @notice Retrieves amounts of assets owned by the fund
    /// @return balances_ The amount of each asset owned by the fund
    function getAssetBalances(address[] memory _assets)
        public
        view
        override
        returns (uint256[] memory balances_)
    {
        balances_ = new uint256[](_assets.length);
        for (uint256 i = 0; i < _assets.length; i++) {
            balances_[i] = __getAssetBalance(_assets[i]);
        }
    }

    /// @notice Retrieves the assets owned by the fund
    /// @return The addresses of assets owned by the fund
    function getOwnedAssets() public view override returns(address[] memory) {
        return EnumerableSet.enumerate(ownedAssets);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to check if an adapter is enabled for the fund
    function __adapterIsEnabled(address _adapter) private view returns (bool) {
        return EnumerableSet.contains(enabledAdapters, _adapter);
    }

    /// @dev Helper to add an asset to a fund's ownedAssets.
    function __addOwnedAsset(address _asset) private {
        if (EnumerableSet.add(ownedAssets, _asset)) {
            require(
                EnumerableSet.length(ownedAssets) <= MAX_OWNED_ASSETS,
                "__addOwnedAsset: Max owned asset limit reached"
            );
            emit AssetAdded(_asset);
        }
    }

    /// @dev Helper to enable adapters for use in the fund.
    /// Fails if an already-enabled adapter is passed.
    function __enableAdapters(address[] memory _adapters) private {
        IRegistry registry = __getRegistry();
        for (uint256 i = 0; i < _adapters.length; i++) {
            address adapter = _adapters[i];
            require(
                registry.integrationAdapterIsRegistered(adapter),
                "__enableAdapters: Adapter is not on Registry"
            );
            require(
                !__adapterIsEnabled(adapter),
                "__enableAdapters: Adapter is already enabled"
            );

            EnumerableSet.add(enabledAdapters, adapter);

            emit AdapterEnabled(adapter);
        }
    }

    /// @dev Helper to execute a call to an integration.
    /// @dev Avoids stack-too-deep error
    function __executeCoI(
        address _adapter,
        string memory _methodSignature,
        bytes memory _encodedCallArgs,
        bytes memory _encodedAssetTransferArgs
    )
        private
    {
        (bool success, bytes memory returnData) = _adapter.call(
            abi.encodeWithSignature(_methodSignature, _encodedCallArgs, _encodedAssetTransferArgs)
        );
        require(success, string(returnData));
    }

    /// @dev Helper to get an owned asset's balance
    function __getAssetBalance(address _asset)
        private
        view
        returns (uint256)
    {
        return IERC20(_asset).balanceOf(address(this));
    }

    /// @dev Helper to confirm whether an asset is receivable via an integration
    function __isReceivableAsset(address _asset) private view returns (bool) {
        IRegistry registry = __getRegistry();
        if (
            registry.primitiveIsRegistered(_asset) ||
            registry.derivativeToPriceSource(_asset) != address(0)
        ) return true;
        return false;
    }

    /// @dev Helper for the actions to take prior to _executeCoI() in callOnIntegration()
    function __preProcessCoI(
        address _adapter,
        bytes4 _selector,
        bytes memory _encodedCallArgs
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
        // Validate fund and adapter
        require(
            __getHub().status() == IHub.FundStatus.Active,
            "__preProcessCoI: Hub must be active"
        );
        require(
            __adapterIsEnabled(_adapter),
            "__preProcessCoI: Adapter is not enabled for fund"
        );

        // Get and validate assets to transact
        // Notes:
        // - Incoming + spend assets both allowed to be empty
        // - Incoming asset amounts allowed to be 0 (e.g., in case of adding an airdropped token)
        // - Incoming + spend assets are allowed to overlap (e.g., a fee for the incomingAsset charged in a spend asset)
        (
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        ) = IIntegrationAdapter(_adapter).parseAssetsForMethod(_selector, _encodedCallArgs);
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
        for (uint256 i = 0; i < incomingAssets_.length; i++) {
            require(
                __isReceivableAsset(incomingAssets_[i]),
                "__preProcessCoI: non-receivable asset detected"
            );
            // Could also lookup balances here, but preference is to fail fast
        }

        // Pre-validate against fund policies
        __getPolicyManager().preValidatePolicy(
            IPolicyManager.PolicyHook.CallOnIntegration,
            abi.encode(
                _selector,
                _adapter,
                incomingAssets_,
                minIncomingAssetAmounts_,
                spendAssets_,
                spendAssetAmounts_
            )
        );

        // Get pre-call balances of relevant assets and grant approvals to adapter
        preCallIncomingAssetBalances_ = getAssetBalances(incomingAssets_);
        preCallSpendAssetBalances_ = new uint256[](spendAssets_.length);
        for (uint256 i = 0; i < spendAssets_.length; i++) {
            // TODO: decide whether or not to revoke approval at the end of an action,
            // and/or how to deal with the extreme edge case of overflow.
            // This will probably involve considering how limit orders could work.
            __increaseApproval(spendAssets_[i], _adapter, spendAssetAmounts_[i]);
            preCallSpendAssetBalances_[i] = IERC20(spendAssets_[i]).balanceOf(address(this));
        }
    }

    /// @dev Helper for the actions to take after _executeCoI() in callOnIntegration()
    function __postProcessCoI(
        address _adapter,
        bytes4 _selector,
        address[] memory _incomingAssets,
        uint256[] memory _preCallIncomingAssetBalances,
        uint256[] memory _minIncomingAssetAmounts,
        address[] memory _spendAssets,
        uint256[] memory _preCallSpendAssetBalances
    )
        private
    {
        // Calc incoming/outgoing amounts, validate incoming amounts, remove excess approvals
        (
            uint256[] memory incomingAssetAmounts,
            address[] memory outgoingAssets,
            uint256[] memory outgoingAssetAmounts
        ) = __reconcileCoIAssets(
            _incomingAssets,
            _preCallIncomingAssetBalances,
            _minIncomingAssetAmounts,
            _spendAssets,
            _preCallSpendAssetBalances
        );

        // Post-validate against fund policies
        __getPolicyManager().postValidatePolicy(
            IPolicyManager.PolicyHook.CallOnIntegration,
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
            _adapter,
            _incomingAssets,
            incomingAssetAmounts,
            outgoingAssets,
            outgoingAssetAmounts
        );
    }

    function __reconcileCoIAssets(
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
            uint256 newBalance = IERC20(_incomingAssets[i]).balanceOf(address(this));
            require(
                newBalance >= _preCallIncomingAssetBalances[i],
                "__reconcileCoIAssets: incoming asset balance cannot decrease"
            );

            uint256 balanceDiff = sub(newBalance, _preCallIncomingAssetBalances[i]);
            require(
                balanceDiff >= _minIncomingAssetAmounts[i],
                "__reconcileCoIAssets: received incoming asset less than expected"
            );

            __addOwnedAsset(_incomingAssets[i]);
            incomingAssetAmounts_[i] = balanceDiff;
        }

        // Calculate and validate outgoing assets and amounts
        uint256[] memory spendAssetBalanceDiffs = new uint256[](_spendAssets.length);
        uint256 outgoingAssetsCount;
        for (uint256 i = 0; i < _spendAssets.length; i++) {
            // If spend asset is also an incoming asset, ignore
            if (_incomingAssets.contains(_spendAssets[i])) continue;

            // Confirm spend asset balance has not increased
            uint256 newBalance = IERC20(_spendAssets[i]).balanceOf(address(this));
            require(
                newBalance <= _preCallSpendAssetBalances[i],
                "__reconcileCoIAssets: spend asset balance increased unexpectedly"
            );

            if (newBalance < _preCallSpendAssetBalances[i]) {
                spendAssetBalanceDiffs[i] = sub(_preCallSpendAssetBalances[i], newBalance);
                outgoingAssetsCount++;
            }
        }

        outgoingAssets_ = new address[](outgoingAssetsCount);
        outgoingAssetAmounts_ = new uint256[](outgoingAssetsCount);
        uint256 outgoingAssetsIndex;
        for (uint256 i = 0; i < _spendAssets.length; i++) {
            if (spendAssetBalanceDiffs[i] == 0) continue;

            // Remove asset from owned assets if 0 balance
            if (__getAssetBalance(_spendAssets[i]) == 0) {
                __removeOwnedAsset(_spendAssets[i]);
            }

            // Add asset to outgoing assets
            outgoingAssets_[outgoingAssetsIndex] = _spendAssets[i];
            outgoingAssetAmounts_[outgoingAssetsIndex] = spendAssetBalanceDiffs[i];
            outgoingAssetsIndex++;
        }
    }

    /// @dev Helper to remove an asset from a fund's ownedAssets
    function __removeOwnedAsset(address _asset) private {
        if (EnumerableSet.remove(ownedAssets, _asset)) {
            emit AssetRemoved(_asset);
        }
    }
}

contract VaultFactory {
    function createInstance(address _hub, address[] calldata _adapters)
        external
        returns (address)
    {
        return address(new Vault(_hub, _adapters));
    }
}
