// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../utils/Proxy.sol";

contract ExternalPositionProxy is Proxy {
    uint256 private immutable EXTERNAL_POSITION_TYPE;

    constructor(
        bytes memory _constructData,
        address _externalPositionLib,
        uint256 _externalPositionType
    ) public Proxy(_constructData, _externalPositionLib) {
        EXTERNAL_POSITION_TYPE = _externalPositionType;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `EXTERNAL_POSITION_TYPE` variable
    /// @return _externalPositionType The `EXTERNAL_POSITION_TYPE` variable value
    function getExternalPositionType() external view returns (uint256 _externalPositionType) {
        return EXTERNAL_POSITION_TYPE;
    }
}
