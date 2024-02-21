// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IThreeOneThird} from "../../../../../../../external-interfaces/IThreeOneThird.sol";
import {AssetHelpers} from "../../../../../../../utils/0.6.12/AssetHelpers.sol";

/// @title ThreeOneThirdActionsMixin Contract
/// @author 31Third <dev@31third.com>, Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the ThreeOneThird BatchTrade functions
abstract contract ThreeOneThirdActionsMixin is AssetHelpers {
    address internal immutable THREE_ONE_THIRD_BATCH_TRADE;

    constructor(address _batchTrade) public {
        THREE_ONE_THIRD_BATCH_TRADE = _batchTrade;
    }

    /// @dev Helper to execute batchTrade
    function __threeOneThirdBatchTrade(
        IThreeOneThird.Trade[] memory _trades,
        IThreeOneThird.BatchTradeConfig memory _batchTradeConfig
    ) internal {
        __approveSpendAssets(_trades);

        // Execute order
        IThreeOneThird(THREE_ONE_THIRD_BATCH_TRADE).batchTrade({_trades: _trades, _batchTradeConfig: _batchTradeConfig});
    }

    function __approveSpendAssets(IThreeOneThird.Trade[] memory _trades) private {
        uint256 tradesLength = _trades.length;
        address[] memory assets = new address[](tradesLength);
        uint256[] memory amounts = new uint256[](tradesLength);

        for (uint256 i; i < tradesLength; i++) {
            assets[i] = _trades[i].from;
            amounts[i] = _trades[i].fromAmount;
        }

        if (assets.length > 1) {
            (assets, amounts) = __aggregateAssetAmounts(assets, amounts);
        }

        // Approve spend assets as needed
        uint256 approvalsCount = assets.length;
        for (uint256 i; i < approvalsCount; i++) {
            __approveAssetMaxAsNeeded({
                _asset: assets[i],
                _target: THREE_ONE_THIRD_BATCH_TRADE,
                _neededAmount: amounts[i]
            });
        }
    }

    /// @dev Helper to get batchTrade feeBasisPoints
    function __getThreeOneThirdFeeBasisPoints() internal view returns (uint16 feeBasisPoints_) {
        return IThreeOneThird(THREE_ONE_THIRD_BATCH_TRADE).feeBasisPoints();
    }
}
