// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../utils/Proxy.sol";

contract DebtPositionProxy is Proxy {
    uint256 private immutable DEBT_POSITION_TYPE;

    constructor(
        bytes memory _constructData,
        address _debtPositionLib,
        uint256 _debtPositionType
    ) public Proxy(_constructData, _debtPositionLib) {
        DEBT_POSITION_TYPE = _debtPositionType;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `DEBT_POSITION_TYPE` variable
    /// @return _debtPositionType The `DEBT_POSITION_TYPE` variable value
    function getDebtPositionType() external view returns (uint256 _debtPositionType) {
        return DEBT_POSITION_TYPE;
    }
}
