// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../IIntegrationAdapter.sol";
import "./IntegrationSelectors.sol";

/// @title AdapterBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A base contract for integration adapters
abstract contract AdapterBase is IIntegrationAdapter, IntegrationSelectors {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    address internal immutable INTEGRATION_MANAGER;

    /// @dev Provides a standard implementation for transferring assets between
    /// the fund's VaultProxy and the adapter, by wrapping the adapter action.
    /// This modifier should be implemented in almost all adapter actions, unless they
    /// do not move assets or can spend and receive assets directly with the VaultProxy
    modifier fundAssetsTransferHandler(
        address _vaultProxy,
        bytes memory _encodedAssetTransferArgs
    ) {
        (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets
        ) = abi.decode(
            _encodedAssetTransferArgs,
            (IIntegrationManager.SpendAssetsHandleType, address[], uint256[], address[])
        );

        // Take custody of spend assets (if necessary)
        if (spendAssetsHandleType == IIntegrationManager.SpendAssetsHandleType.Approve) {
            for (uint256 i = 0; i < spendAssets.length; i++) {
                ERC20(spendAssets[i]).safeTransferFrom(
                    _vaultProxy,
                    address(this),
                    spendAssetAmounts[i]
                );
            }
        }

        // Execute call
        _;

        // Transfer remaining assets back to the fund's VaultProxy
        __transferContractAssetBalancesToFund(_vaultProxy, incomingAssets);
        __transferContractAssetBalancesToFund(_vaultProxy, spendAssets);
    }

    modifier onlyIntegrationManager {
        require(
            msg.sender == INTEGRATION_MANAGER,
            "Only the IntegrationManager can call this function"
        );
        _;
    }

    constructor(address _integrationManager) public {
        INTEGRATION_MANAGER = _integrationManager;
    }

    // INTERNAL FUNCTIONS

    /// @dev Aggregates a list of _assets and _amounts, removing duplicate assets and summing their amounts.
    /// At present, this is only used to aggregate fees in integration adapters.
    /// e.g., in 0x v3, if the takerFee asset is WETH, then takerFee and protocolFee are aggregated.
    /// It remove assets with an empty address or a balance of 0, so adapters can be dumb.
    function __aggregateAssets(address[] memory _assets, uint256[] memory _amounts)
        internal
        pure
        returns (address[] memory aggregatedAssets_, uint256[] memory aggregatedAssetAmounts_)
    {
        uint256 numOfUniqueAssets = _assets.length;
        for (uint256 i = 1; i < _assets.length; i++) {
            if (_assets[i] == address(0) || _amounts[i] == 0) {
                _assets[i] = address(0);
                numOfUniqueAssets--;
                continue;
            }
            for (uint256 j = i; j > 0; j--) {
                if (_assets[i] != address(0) && _assets[i] == _assets[j - 1]) {
                    _amounts[i] = _amounts[i].add(_amounts[j - 1]);
                    _assets[j - 1] = address(0);
                    numOfUniqueAssets--;
                    break;
                }
            }
        }
        aggregatedAssets_ = new address[](numOfUniqueAssets);
        aggregatedAssetAmounts_ = new uint256[](numOfUniqueAssets);

        for (uint256 i = _assets.length; i > 0; i--) {
            if (_assets[i - 1] != address(0)) {
                aggregatedAssets_[numOfUniqueAssets - 1] = _assets[i - 1];
                aggregatedAssetAmounts_[numOfUniqueAssets - 1] = _amounts[i - 1];
                numOfUniqueAssets--;
            }
        }
    }

    /// @dev Helper for adapters to approve their integratees with the max amount of an asset.
    /// Since everything is done atomically, and only the balances to-be-used are sent to adapters,
    /// there is no need to approve exact amounts on every call.
    function __approveMaxAsNeeded(
        address _asset,
        address _target,
        uint256 _neededAmount
    ) internal {
        if (ERC20(_asset).allowance(address(this), _target) < _neededAmount) {
            ERC20(_asset).approve(_target, type(uint256).max);
        }
    }

    /// @dev Helper to transfer full contract balances of assets to the specified VaultProxy
    function __transferContractAssetBalancesToFund(address _vaultProxy, address[] memory _assets)
        private
    {
        for (uint256 i = 0; i < _assets.length; i++) {
            uint256 postCallAmount = ERC20(_assets[i]).balanceOf(address(this));
            if (postCallAmount > 0) {
                ERC20(_assets[i]).safeTransfer(_vaultProxy, postCallAmount);
            }
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `INTEGRATION_MANAGER` variable
    /// @return integrationManager_ The `INTEGRATION_MANAGER` variable value
    function getIntegrationManager() external view returns (address integrationManager_) {
        return INTEGRATION_MANAGER;
    }
}
