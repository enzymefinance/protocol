// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title IBalancerV2Vault interface
/// @author Enzyme Council <security@enzyme.finance>
interface IBalancerV2Vault {
    struct BatchSwapStep {
        bytes32 poolId;
        uint256 assetInIndex;
        uint256 assetOutIndex;
        uint256 amount;
        bytes userData;
    }

    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address payable recipient;
        bool toInternalBalance;
    }

    // JoinPoolRequest and ExitPoolRequest are just differently labeled versions of PoolBalanceChange.
    // See: https://github.com/balancer-labs/balancer-v2-monorepo/blob/42906226223f29e4489975eb3c0d5014dea83b66/pkg/vault/contracts/PoolBalances.sol#L70
    struct PoolBalanceChange {
        address[] assets;
        uint256[] limits;
        bytes userData;
        bool useInternalBalance;
    }

    enum SwapKind {
        GIVEN_IN,
        GIVEN_OUT
    }

    function batchSwap(
        SwapKind _kind,
        BatchSwapStep[] memory _swaps,
        address[] memory _assets,
        FundManagement memory _funds,
        int256[] memory _limits,
        uint256 _deadline
    ) external returns (int256[] memory assetDeltas_);

    function exitPool(
        bytes32 _poolId,
        address _sender,
        address payable _recipient,
        PoolBalanceChange memory _request
    ) external;

    function getPoolTokens(bytes32 _poolId)
        external
        view
        returns (
            address[] memory tokens_,
            uint256[] memory balances_,
            uint256 lastChangeBlock_
        );

    function joinPool(
        bytes32 _poolId,
        address _sender,
        address _recipient,
        PoolBalanceChange memory _request
    ) external payable;

    function setRelayerApproval(
        address _sender,
        address _relayer,
        bool _approved
    ) external;
}
