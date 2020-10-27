// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@melonproject/persistent/contracts/vault/VaultLibBase1.sol";
import "./IVault.sol";

/// @title VaultLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The per-release proxiable library contract for VaultProxy
/// @dev The difference in terminology between "asset" and "trackedAsset" is intentional.
/// A fund might actually have asset balances of un-tracked assets,
/// but only tracked assets are used in gav calculations.
/// Changing the VaultLib happens in two steps:
/// 1. Update to the next logic contract
/// 2. Set the next accessor
/// These need to be separated so as to not assume that the next logic contract sets accessor
/// in the same way as the current logic contract.
contract VaultLib is VaultLibBase1, IVault {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    modifier onlyAccessor() {
        require(msg.sender == accessor, "Only the designated accessor can make this call");
        _;
    }

    // CORE LOGIC

    function getAccessor() external view override returns (address) {
        return accessor;
    }

    function getCreator() external view returns (address) {
        return creator;
    }

    function getMigrator() external view returns (address) {
        return migrator;
    }

    function getOwner() external view override returns (address) {
        return owner;
    }

    function setMigrator(address _nextMigrator) external {
        require(msg.sender == owner, "setMigrator: Only the owner can call this function");
        address prevMigrator = migrator;
        if (_nextMigrator != prevMigrator) {
            migrator = _nextMigrator;
            emit MigratorSet(prevMigrator, _nextMigrator);
        }
    }

    // VAULT LOGIC

    // TODO: Should this function should not have an opinion about the actual asset balance?
    /// @dev Allows addition of already tracked assets to fail silently.
    function addTrackedAsset(address _asset) external override onlyAccessor {
        if (!isTrackedAsset(_asset) && __getAssetBalance(_asset) > 0) {
            assetToIsTracked[_asset] = true;
            trackedAssets.push(_asset);

            emit TrackedAssetAdded(_asset);
        }
    }

    function approveAssetSpender(
        address _asset,
        address _target,
        uint256 _amount
    ) external override onlyAccessor {
        IERC20(_asset).approve(_target, _amount);
    }

    function callOnContract(address _contract, bytes calldata _callData)
        external
        override
        onlyAccessor
    {
        (bool success, bytes memory returnData) = _contract.call(_callData);
        require(success, string(returnData));

        // TODO: need event?
    }

    function getTrackedAssets() external view override returns (address[] memory) {
        return trackedAssets;
    }

    function removeTrackedAsset(address _asset) external override onlyAccessor {
        __removeTrackedAsset(_asset);
    }

    function withdrawAssetTo(
        address _asset,
        address _target,
        uint256 _amount
    ) external override onlyAccessor {
        uint256 balance = __getAssetBalance(_asset);
        require(balance >= _amount, "withdrawAssetTo: Insufficient balance");

        if (balance.sub(_amount) == 0) {
            __removeTrackedAsset(_asset);
        }
        // TODO: any need to assert that the _target receives the tokens?
        IERC20(_asset).safeTransfer(_target, _amount);

        emit AssetWithdrawn(_asset, _target, _amount);
    }

    function isTrackedAsset(address _asset) public view override returns (bool) {
        return assetToIsTracked[_asset];
    }

    function __getAssetBalance(address _asset) private view returns (uint256) {
        return IERC20(_asset).balanceOf(address(this));
    }

    /// @dev Allows removal of non-tracked asset to fail silently.
    function __removeTrackedAsset(address _asset) private {
        if (isTrackedAsset(_asset)) {
            assetToIsTracked[_asset] = false;

            uint256 trackedAssetsCount = trackedAssets.length;
            for (uint256 i = 0; i < trackedAssetsCount; i++) {
                if (trackedAssets[i] == _asset) {
                    if (i < trackedAssetsCount - 1) {
                        trackedAssets[i] = trackedAssets[trackedAssetsCount - 1];
                    }
                    trackedAssets.pop();
                    break;
                }
            }

            emit TrackedAssetRemoved(_asset);
        }
    }

    // SHARES LOGIC

    function burnShares(address _target, uint256 _amount) external override onlyAccessor {
        __burn(_target, _amount);
    }

    function mintShares(address _target, uint256 _amount) external override onlyAccessor {
        __mint(_target, _amount);
    }

    function transferShares(
        address _from,
        address _to,
        uint256 _amount
    ) external override onlyAccessor {
        __transfer(_from, _to, _amount);
    }

    // ERC20 overrides

    function approve(address, uint256) public override returns (bool) {
        revert("Unimplemented");
    }

    function transfer(address, uint256) public override returns (bool) {
        revert("Unimplemented");
    }

    function transferFrom(
        address,
        address,
        uint256
    ) public override returns (bool) {
        revert("Unimplemented");
    }
}
