// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../interfaces/IBalancerV2WeightedPool.sol";
import "../../../../interfaces/IBalancerV2Vault.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../utils/actions/BalancerV2ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title BalancerV2LiquidityAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Balancer V2 pool liquidity provision
contract BalancerV2LiquidityAdapter is AdapterBase, BalancerV2ActionsMixin {
    using AddressArrayLib for address[];

    constructor(address _integrationManager, address _balancerVault)
        public
        AdapterBase(_integrationManager)
        BalancerV2ActionsMixin(_balancerVault)
    {}

    /// @notice Lends assets for pool tokens on BalancerV2
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function lend(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        (
            bytes32 poolId,
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            IBalancerV2Vault.PoolBalanceChange memory request
        ) = __decodeCallArgs(_actionData);

        for (uint256 i; i < spendAssets.length; i++) {
            __approveAssetMaxAsNeeded(
                spendAssets[i],
                address(BALANCER_VAULT_CONTRACT),
                spendAssetAmounts[i]
            );
        }

        __balancerV2Lend(poolId, address(this), _vaultProxy, request);

        // There can be different join/exit options per Balancer pool type,
        // some of which involve spending only up-to-max amounts
        __pushFullAssetBalances(_vaultProxy, spendAssets);
    }

    /// @notice Redeems pool tokens on BalancerV2
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function redeem(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        (
            bytes32 poolId,
            uint256 spendBptAmount,
            address[] memory expectedIncomingTokens,
            ,
            IBalancerV2Vault.PoolBalanceChange memory request
        ) = __decodeCallArgs(_actionData);

        address bpt = __parseBalancerPoolAddress(poolId);

        __approveAssetMaxAsNeeded(bpt, address(BALANCER_VAULT_CONTRACT), spendBptAmount);

        // Since we are not parsing request.userData, we do not know with certainty which tokens
        // will be received. We are relying on the user-input expectedIncomingTokens up to this point.
        // But, to guarantee that no unexpected tokens are received, we need to monitor those balances.
        uint256 unusedTokensCount = request.assets.length - expectedIncomingTokens.length;
        uint256[] memory preTxTokenBalancesIfUnused;
        if (unusedTokensCount > 0) {
            preTxTokenBalancesIfUnused = new uint256[](request.assets.length);
            uint256 remainingCount = unusedTokensCount;
            for (uint256 i; remainingCount > 0; i++) {
                if (!expectedIncomingTokens.contains(request.assets[i])) {
                    preTxTokenBalancesIfUnused[i] = ERC20(request.assets[i]).balanceOf(
                        _vaultProxy
                    );
                    remainingCount--;
                }
            }
        }

        __balancerV2Redeem(poolId, address(this), payable(_vaultProxy), request);

        if (unusedTokensCount > 0) {
            for (uint256 i; unusedTokensCount > 0; i++) {
                if (!expectedIncomingTokens.contains(request.assets[i])) {
                    require(
                        ERC20(request.assets[i]).balanceOf(_vaultProxy) ==
                            preTxTokenBalancesIfUnused[i],
                        "redeem: Unexpected asset received"
                    );
                    unusedTokensCount--;
                }
            }
        }

        // There can be different join/exit options per Balancer pool type,
        // some of which involve spending only up-to-max amounts
        __pushFullAssetBalance(_vaultProxy, bpt);
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(
        address,
        bytes4 _selector,
        bytes calldata _actionData
    )
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_actionData);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_actionData);
        }

        revert("parseAssetsForAction: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during lend() calls
    function __parseAssetsForLend(bytes calldata _encodedCallArgs)
        private
        pure
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        bytes32 poolId;
        IBalancerV2Vault.PoolBalanceChange memory request;
        (
            poolId,
            minIncomingAssetAmounts_[0],
            spendAssets_,
            spendAssetAmounts_,
            request
        ) = __decodeCallArgs(_encodedCallArgs);

        require(
            !request.useInternalBalance,
            "__parseAssetsForLend: Internal balances not supported"
        );

        incomingAssets_[0] = __parseBalancerPoolAddress(poolId);

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during redeem() calls
    function __parseAssetsForRedeem(bytes calldata _encodedCallArgs)
        private
        pure
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);

        bytes32 poolId;
        IBalancerV2Vault.PoolBalanceChange memory request;
        (
            poolId,
            spendAssetAmounts_[0],
            incomingAssets_,
            minIncomingAssetAmounts_,
            request
        ) = __decodeCallArgs(_encodedCallArgs);

        require(
            !request.useInternalBalance,
            "__parseAssetsForRedeem: Internal balances not supported"
        );

        spendAssets_[0] = __parseBalancerPoolAddress(poolId);

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper to get a Balancer pool address (i.e., Balancer Pool Token) for a given id.
    /// See: https://github.com/balancer-labs/balancer-v2-monorepo/blob/42906226223f29e4489975eb3c0d5014dea83b66/pkg/vault/contracts/PoolRegistry.sol#L130-L139
    function __parseBalancerPoolAddress(bytes32 _poolId)
        private
        pure
        returns (address poolAddress_)
    {
        return address(uint256(_poolId) >> (12 * 8));
    }

    //////////////
    // DECODERS //
    //////////////

    /// @dev Helper to decode callArgs for lend and redeem
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            bytes32 poolId_,
            uint256 bptAmount_,
            address[] memory usedTokens_, // only the assets that will actually be spent/received
            uint256[] memory usedTokenAmounts_, // only the assets that will actually be spent/received
            IBalancerV2Vault.PoolBalanceChange memory request_
        )
    {
        return
            abi.decode(
                _encodedCallArgs,
                (bytes32, uint256, address[], uint256[], IBalancerV2Vault.PoolBalanceChange)
            );
    }
}
