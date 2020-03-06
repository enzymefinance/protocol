pragma solidity 0.6.1;

import "../dependencies/DSMath.sol";
import "../dependencies/token/IERC20.sol";
import "../prices/IPriceSource.sol";
import "../version/IRegistry.sol";
import "../version/IVersion.sol";
import "./IEngine.sol";

/// @notice Abstract contracts
/// @notice inherit this to pay AMGU on a function call
abstract contract AmguConsumer is DSMath {

    event AmguPaid(
        address indexed payer,
        uint256 totalAmguPaidInEth,
        uint256 amguChargableGas,
        uint256 incentivePaid
    );

    IRegistry public registry;

    constructor (address _registry) public {
        registry = IRegistry(_registry);
    }

    /// @param _deductIncentive is used when sending extra eth beyond amgu
    modifier amguPayable(bool _deductIncentive) {
        uint preGas = gasleft();
        _;
        uint postGas = gasleft();

        uint mlnPerAmgu = IEngine(registry.engine()).getAmguPrice();
        uint mlnQuantity = mul(
            mlnPerAmgu,
            sub(preGas, postGas)
        );
        address nativeAsset = registry.nativeAsset();
        uint ethToPay = IPriceSource(registry.priceSource()).convertQuantity(
            mlnQuantity,
            registry.mlnToken(),
            nativeAsset
        );
        uint incentiveAmount;
        if (_deductIncentive) {
            incentiveAmount = registry.incentive();
        } else {
            incentiveAmount = 0;
        }
        require(
            msg.value >= add(ethToPay, incentiveAmount),
            "Insufficent AMGU and/or incentive"
        );
        IEngine(registry.engine()).payAmguInEther.value(ethToPay)();

        require(
            msg.sender.send(
                sub(
                    sub(msg.value, ethToPay),
                    incentiveAmount
                )
            ),
            "Refund failed"
        );
        emit AmguPaid(msg.sender, ethToPay, sub(preGas, postGas), incentiveAmount);
    }
}
