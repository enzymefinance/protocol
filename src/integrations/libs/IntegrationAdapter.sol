// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../../dependencies/DSMath.sol";
import "../../dependencies/token/IERC20.sol";
import "../../fund/hub/IHub.sol";
import "../../fund/hub/ISpoke.sol";
import "../../registry/IRegistry.sol";
import "./IIntegrationAdapter.sol";
import "./IntegrationSignatures.sol";

/// @title Integration Adapter base contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Provides convenience functions for use in integration adapters
abstract contract IntegrationAdapter is IIntegrationAdapter, IntegrationSignatures, DSMath {
    /// @notice Increment allowance of an asset for some target
    /// @dev Checks the actual in-contract assetBalances (as opposed to "holdings")
    function __approveAsset(
        address _asset,
        address _target,
        uint256 _amount,
        string memory _assetType
    )
        internal
    {
        uint256 allowance = IERC20(_asset).allowance(address(this), _target);
        require(
            IERC20(_asset).approve(_target, add(allowance, _amount)),
            string(abi.encodePacked("__approveAsset: Approval failed: ", _assetType))
        );
    }

    /// @notice Calculates a proportional value relative to a known ratio
    /// @dev For use in calculating expected a missing expected fill amount
    /// based on an asset pair's price
    function __calculateRelativeQuantity(
        uint256 quantity1,
        uint256 quantity2,
        uint256 relativeQuantity1
    )
        internal
        pure
        returns (uint256)
    {
        return mul(relativeQuantity1, quantity2) / quantity1;
    }

    /// @notice Gets the canonical WETH address
    /// @dev Uses Registry as the canonical source
    function __getNativeAssetAddress() internal view returns (address) {
        return __getRegistry().nativeAsset();
    }

    /// @notice Gets the canonical MLN address from Registry
    /// @dev Uses Registry as the canonical source
    function __getMlnTokenAddress() internal view returns (address) {
        return __getRegistry().mlnToken();
    }

    /// @notice Gets an IRegistry instance
    function __getRegistry() internal view returns (IRegistry) {
        return IRegistry(IHub(ISpoke(address(this)).HUB()).REGISTRY());
    }
}
