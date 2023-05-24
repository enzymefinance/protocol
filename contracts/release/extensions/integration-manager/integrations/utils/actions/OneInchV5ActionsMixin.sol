// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../../external-interfaces/IOneInchV5AggregationRouter.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title OneInchV5ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with OneInch Exchange (v5)
abstract contract OneInchV5ActionsMixin is AssetHelpers {
    IOneInchV5AggregationRouter public immutable ONE_INCH_V5_AGGREGATION_ROUTER_CONTRACT;

    constructor(address _oneInchV5AggregationRouter) public {
        ONE_INCH_V5_AGGREGATION_ROUTER_CONTRACT = IOneInchV5AggregationRouter(_oneInchV5AggregationRouter);
    }

    /// @dev Helper to execute a swap() order.
    function __oneInchV5Swap(
        address _executor,
        IOneInchV5AggregationRouter.SwapDescription memory _description,
        bytes memory _data
    ) internal {
        __approveAssetMaxAsNeeded({
            _asset: _description.srcToken,
            _target: address(ONE_INCH_V5_AGGREGATION_ROUTER_CONTRACT),
            _neededAmount: _description.amount
        });

        ONE_INCH_V5_AGGREGATION_ROUTER_CONTRACT.swap({
            _executor: _executor,
            _desc: _description,
            _permit: "",
            _data: _data
        });
    }
}
