// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../external-interfaces/IERC20.sol";
import {IERC4626} from "../../../../external-interfaces/IERC4626.sol";
import {RateAggregatorBase} from "./utils/RateAggregatorBase.sol";

/// @title ERC4626RateAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Aggregator for ERC4626 vault
contract ERC4626RateAggregator is RateAggregatorBase {
    IERC4626 public immutable ERC_4626_VAULT;

    uint256 private immutable ERC_4626_ASSET_PRECISION;
    uint256 private immutable ERC_4626_SHARES_PRECISION;

    constructor(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _erc4626Address
    )
        RateAggregatorBase(_thisAggregatorDecimals, _quoteConversionAggregatorAddress, _quoteConversionAggregatorInverted)
    {
        ERC_4626_VAULT = IERC4626(_erc4626Address);

        address underlying = IERC4626(_erc4626Address).asset();
        ERC_4626_ASSET_PRECISION = 10 ** IERC20(underlying).decimals();
        ERC_4626_SHARES_PRECISION = 10 ** IERC20(_erc4626Address).decimals();
    }

    //==================================================================================================================
    // Required overrides: RateAggregatorBase
    //==================================================================================================================

    /// @inheritdoc RateAggregatorBase
    /// @dev Returns the internal value of 1 unit of the ERC4626 token, quoted in its ERC4626.asset()
    function baseRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        rate_ = ERC_4626_VAULT.convertToAssets({_shares: ERC_4626_SHARES_PRECISION});
        ratePrecision_ = ERC_4626_ASSET_PRECISION;
        timestamp_ = block.timestamp;
    }
}
