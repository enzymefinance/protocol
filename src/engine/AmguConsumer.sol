pragma solidity 0.6.1;

import "../dependencies/DSMath.sol";
import "../dependencies/token/IERC20.sol";
import "../prices/IPriceSource.sol";
import "../version/IRegistry.sol";
import "../version/IFundFactory.sol";
import "./IEngine.sol";

/// @notice Inherit this to pay AMGU on a function call
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

    /// @dev if amgu price is zero, skip price fetching
    /// @param _incentiveAmount Wei amount to be paid above AMGU
    modifier amguPayableWithIncentive(uint256 _incentiveAmount) {
        uint256 preGas = gasleft();
        _;
        uint256 postGas = gasleft();

        uint256 mlnPerAmgu = IEngine(registry.engine()).getAmguPrice();
        uint256 ethToPayForAmgu = 0;
        if (mlnPerAmgu > 0) {
            uint256 mlnQuantity = mul(
                mlnPerAmgu,
                sub(preGas, postGas)
            );
            address nativeAsset = registry.nativeAsset();
            ethToPayForAmgu = IPriceSource(registry.priceSource()).convertQuantity(
                mlnQuantity,
                registry.mlnToken(),
                nativeAsset
            );
        }

        require(
            msg.value >= add(ethToPayForAmgu, _incentiveAmount),
            "amguPayableWithIncentive: Insufficent value for AMGU + incentive"
        );

        IEngine(
            registry.engine()
        ).payAmguInEther.value(ethToPayForAmgu)();

        require(
            msg.sender.send(
                sub(
                    sub(msg.value, ethToPayForAmgu),
                    _incentiveAmount
                )
            ),
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
