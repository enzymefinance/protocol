// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import "../../../../../external-interfaces/ITheGraphStaking.sol";
import "../../../../../persistent/external-positions/the-graph-delegation/TheGraphDelegationPositionLibBase1.sol";
import "../../../../../utils/0.6.12/AddressArrayLib.sol";
import "./ITheGraphDelegationPosition.sol";
import "./TheGraphDelegationPositionDataDecoder.sol";

/// @title TheGraphDelegationPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for Convex vlCVX positions
contract TheGraphDelegationPositionLib is
    ITheGraphDelegationPosition,
    TheGraphDelegationPositionLibBase1,
    TheGraphDelegationPositionDataDecoder
{
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    ITheGraphStaking private immutable GRAPH_STAKING_CONTRACT;
    ERC20 private immutable GRT_TOKEN_CONTRACT;

    constructor(address _stakingProxy, address _grtToken) public {
        GRAPH_STAKING_CONTRACT = ITheGraphStaking(_stakingProxy);
        GRT_TOKEN_CONTRACT = ERC20(_grtToken);
    }

    /// @notice Initializes the external position
    function init(bytes memory) external override {
        // Max approve the delegation contract, which will never need to be set again
        GRT_TOKEN_CONTRACT.safeApprove(address(GRAPH_STAKING_CONTRACT), type(uint256).max);
    }

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.Delegate)) {
            __delegate(actionArgs);
        } else if (actionId == uint256(Actions.Undelegate)) {
            __undelegate(actionArgs);
        } else if (actionId == uint256(Actions.Withdraw)) {
            __withdraw(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    // GRT DELEGATION

    /// @dev Helper to delegate GRT
    function __delegate(bytes memory _actionArgs) private {
        (address indexer, uint256 tokens) = __decodeDelegateActionArgs(_actionArgs);
        __addIndexer(indexer);
        GRAPH_STAKING_CONTRACT.delegate(indexer, tokens);
    }

    /// @dev Helper to undelegate GRT
    function __undelegate(bytes memory _actionArgs) private {
        (address indexer, uint256 shares) = __decodeUndelegateActionArgs(_actionArgs);
        GRAPH_STAKING_CONTRACT.undelegate(indexer, shares);
        uint256 grtBalance = GRT_TOKEN_CONTRACT.balanceOf(address(this));
        if (grtBalance > 0) {
            GRT_TOKEN_CONTRACT.safeTransfer(msg.sender, grtBalance);
        }
    }

    /// @dev Helper to withdraw all unlocked GRT to the vault
    function __withdraw(bytes memory _actionArgs) private {
        (address indexer, address nextIndexer) = __decodeWithdrawActionArgs(_actionArgs);
        GRAPH_STAKING_CONTRACT.withdrawDelegated(indexer, nextIndexer);
        (uint256 delegationShares, uint256 tokensLocked,) = GRAPH_STAKING_CONTRACT.getDelegation(indexer, address(this));

        // If delegation is fully withdrawn, remove indexer from indexers
        if (delegationShares == 0 && tokensLocked == 0) {
            indexers.removeStorageItem(indexer);
            emit IndexerRemoved(indexer);
        }

        // If user redelegates, add new indexer to indexers
        if (nextIndexer != address(0)) {
            __addIndexer(nextIndexer);
        } else {
            GRT_TOKEN_CONTRACT.safeTransfer(msg.sender, GRT_TOKEN_CONTRACT.balanceOf(address(this)));
        }
    }

    /// @dev Helper to add indexer
    function __addIndexer(address _indexer) private {
        if (!isDelegatorTo(_indexer)) {
            indexers.push(_indexer);
            emit IndexerAdded(_indexer);
        }
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        address[] memory indexers = getIndexers();
        uint256 indexersLength = indexers.length;
        if (indexersLength == 0) {
            return (assets_, amounts_);
        }

        assets_ = new address[](1);
        assets_[0] = address(GRT_TOKEN_CONTRACT);

        amounts_ = new uint256[](1);
        for (uint256 i; i < indexersLength; i++) {
            uint256 delegationGrtValue = getDelegationGrtValue(indexers[i]);
            amounts_[0] = amounts_[0].add(delegationGrtValue);
        }

        return (assets_, amounts_);
    }

    /// @dev Returns the delegated + undelegated grtValue of a delegation
    /// @param _indexer Address of the indexer
    /// @return grtValue_ GRT value of the delegation
    function getDelegationGrtValue(address _indexer) public view returns (uint256 grtValue_) {
        (uint256 delegationShares, uint256 tokensLocked,) =
            GRAPH_STAKING_CONTRACT.getDelegation(_indexer, address(this));

        (,,,, uint256 poolTokens, uint256 poolShares) = GRAPH_STAKING_CONTRACT.delegationPools(_indexer);

        if (delegationShares > 0) {
            return delegationShares.mul(poolTokens).div(poolShares).add(tokensLocked);
        }
        return tokensLocked;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @dev Returns the array of indexers the delegator has delegated to
    /// @return indexers_ The array of indexers delegated to
    function getIndexers() public view returns (address[] memory) {
        return indexers;
    }

    /// @dev Return whether the delegator has delegated to the indexer.
    /// @param _indexer Address of the indexer
    /// @return isDelegator_ True if delegator of indexer
    function isDelegatorTo(address _indexer) public view returns (bool isDelegator_) {
        return indexers.storageArrayContains(_indexer);
    }
}
