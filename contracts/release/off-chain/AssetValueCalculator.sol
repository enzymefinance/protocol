// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "../../external-interfaces/IERC20.sol";
import {IValueInterpreter} from "../infrastructure/value-interpreter/IValueInterpreter.sol";

/// @title AssetValueCalculator Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A peripheral contract for calculating asset values
/// @dev These are convenience functions intended for off-chain consumption,
/// some of which involve potentially expensive state transitions
contract AssetValueCalculator {
    using SafeMath for uint256;

    address private immutable VALUE_INTERPRETER;

    constructor(address _valueInterpreter) public {
        VALUE_INTERPRETER = _valueInterpreter;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Calculates the value of a given amount of one asset in terms of another asset
    /// @param _baseAsset The asset from which to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return timestamp_ The current block timestamp
    /// @return value_ The equivalent quantity in the _quoteAsset
    function calcNormalizedAssetValue(address _baseAsset, address _quoteAsset)
        external
        returns (uint256 timestamp_, uint256 value_, bool valueIsValid_)
    {
        timestamp_ = block.timestamp;
        uint256 amount = 10 ** uint256(IERC20(_baseAsset).decimals());

        try IValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(_baseAsset, amount, _quoteAsset) returns (
            uint256 value
        ) {
            value_ = value;
            valueIsValid_ = true;
        } catch {}

        uint256 decimals = IERC20(_quoteAsset).decimals();
        value_ = value_.mul(10 ** 18).div(10 ** decimals);

        return (timestamp_, value_, valueIsValid_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}
