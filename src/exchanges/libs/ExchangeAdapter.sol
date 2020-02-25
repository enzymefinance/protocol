pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../../dependencies/DSMath.sol";
import "../../dependencies/token/IERC20.sol";
import "../../fund/accounting/IAccounting.sol";
import "../../fund/trading/ITrading.sol";
import "../../version/IRegistry.sol";

/// @title Exchange Adapter base contract
/// @author Melonport AG <team@melonport.com>
/// @notice Provides convenience functions for use in exchange adapters
abstract contract ExchangeAdapter is DSMath {
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
        require(
            __getAccounting().assetBalances(_asset) >= _amount,
            string(abi.encodePacked("__approveAsset: Insufficient available assetBalance: ", _assetType))
        );

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

    /// @notice Gets an IAccounting instance
    function __getAccounting() internal view returns (IAccounting) {
        return IAccounting(__getTrading().routes().accounting);
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
        return IRegistry(__getTrading().routes().registry);
    }

    /// @notice Gets an ITrading instance
    function __getTrading() internal view returns (ITrading) {
        return ITrading(payable(address(this)));
    }
}
