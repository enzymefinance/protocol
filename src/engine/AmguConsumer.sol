pragma solidity 0.5.15;

import "../dependencies/DSMath.sol";
import "../dependencies/token/IERC20.sol";
import "../prices/IPriceSource.sol";
import "../version/IVersion.sol";
import "./IEngine.sol";
import "../version/Registry.sol";

/// @notice Abstract contracts
/// @notice inherit this to pay AMGU on a function call
contract AmguConsumer is DSMath {

    /// @dev each of these must be implemented by the inheriting contract
    function engine() public view returns (address);
    function mlnToken() public view returns (address);
    function priceSource() public view returns (address);
    function registry() public view returns (address);

    /// bool deductIncentive is used when sending extra eth beyond amgu
    modifier amguPayable(bool deductIncentive) {
        uint initialGas = gasleft();
        _;
        uint mlnPerAmgu = IEngine(engine()).getAmguPrice();
        uint mlnQuantity = mul(
            mlnPerAmgu,
            sub(initialGas, gasleft())
        );
        address nativeAsset = Registry(registry()).nativeAsset();
        uint ethToPay = IPriceSource(priceSource()).convertQuantity(
            mlnQuantity,
            mlnToken(),
            nativeAsset
        );
        uint incentiveAmount;
        if (deductIncentive) {
            incentiveAmount = Registry(registry()).incentive();
        } else {
            incentiveAmount = 0;
        }
        require(
            msg.value >= add(ethToPay, incentiveAmount),
            "Insufficent AMGU and/or incentive"
        );
        IEngine(engine()).payAmguInEther.value(ethToPay)();

        require(
            msg.sender.send(
                sub(
                    sub(msg.value, ethToPay),
                    incentiveAmount
                )
            ),
            "Refund failed"
        );
    }
}
