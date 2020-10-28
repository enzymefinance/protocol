// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./IEngine.sol";

/// @title AmguConsumer Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Provides a modifier that charges a fee based on asset management gas (amgu)
/// to the function sender
abstract contract AmguConsumer {
    using SafeMath for uint256;

    event AmguPaid(address indexed payer, uint256 ethPaid, uint256 gasUsed);

    address internal immutable ENGINE;

    modifier amguPayable() {
        uint256 preGas = gasleft();

        _;

        uint256 gasUsed = preGas.sub(gasleft());

        IEngine engineContract = IEngine(ENGINE);

        // Calculate amount due in eth via the Engine
        (uint256 ethDue, bool rateIsValid) = engineContract.calcEthDueForGasUsed(gasUsed);
        require(rateIsValid, "amguPayable: Invalid conversion rate");

        // Pay ETH due to the Engine
        if (ethDue > 0) {
            require(msg.value >= ethDue, "amguPayable: Insufficient value for AMGU");
            engineContract.payAmguInEther{value: ethDue}();

            emit AmguPaid(msg.sender, ethDue, gasUsed);
        }

        // Refund excess ETH
        uint256 refundAmount = msg.value.sub(ethDue);
        if (refundAmount > 0) {
            require(msg.sender.send(refundAmount), "amguPayable: ETH refund failed");
        }
    }

    constructor(address _engine) public {
        ENGINE = _engine;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getEngine() external view returns (address) {
        return ENGINE;
    }
}
