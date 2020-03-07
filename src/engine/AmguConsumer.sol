pragma solidity 0.6.1;

import "../dependencies/DSMath.sol";
import "../dependencies/token/IERC20.sol";
import "../factory/IFundFactory.sol";
import "../prices/IPriceSource.sol";
import "../registry/IRegistry.sol";
import "./IEngine.sol";

/// @notice Inherit this to pay AMGU on a function call
abstract contract AmguConsumer is DSMath {

    event AmguPaid(
        address indexed payer,
        uint256 totalAmguPaidInEth,
        uint256 amguChargableGas,
        uint256 incentivePaid
    );

    IRegistry public REGISTRY;

    constructor (address _registry) public {
        REGISTRY = IRegistry(_registry);
    }

    /// @dev if amgu price is zero, skip price fetching
    /// @param _incentiveAmount Wei amount to be paid above AMGU
    modifier amguPayableWithIncentive(uint256 _incentiveAmount) {
        require(
            msg.value >= _incentiveAmount,
            "amguPayableWithIncentive: Insufficent value for incentive"
        );
        uint256 preGas = gasleft();
        _;
        uint256 postGas = gasleft();

        uint256 mlnPerAmgu = IEngine(REGISTRY.engine()).getAmguPrice();
        uint256 ethToPayForAmgu = 0;
        if (mlnPerAmgu > 0) {
            uint256 mlnQuantity = mul(
                mlnPerAmgu,
                sub(preGas, postGas)
            );
            ethToPayForAmgu = IPriceSource(REGISTRY.priceSource()).convertQuantity(
                mlnQuantity,
                REGISTRY.mlnToken(),
                REGISTRY.nativeAsset()
            );
        }

        uint256 totalEthToPay = add(ethToPayForAmgu, _incentiveAmount);

        require(
            msg.value >= totalEthToPay,
            "amguPayableWithIncentive: Insufficent value for AMGU + incentive"
        );

        IEngine(
            REGISTRY.engine()
        ).payAmguInEther.value(ethToPayForAmgu)();

        require(
            msg.sender.send(sub(msg.value, totalEthToPay)),
            "amguPayableWithIncentive: Refund failed"
        );
        emit AmguPaid(
            msg.sender,
            ethToPayForAmgu,
            sub(preGas, postGas),
            _incentiveAmount
        );
    }
}
