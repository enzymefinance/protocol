// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../../release/infrastructure/value-interpreter/IValueInterpreter.sol";

contract CentralizedRateProvider is Ownable {
    using SafeMath for uint256;

    uint256 private maxDeviationPerSender;
    address private valueInterpreter;

    constructor(uint256 _maxDeviationPerSender) public {
        maxDeviationPerSender = _maxDeviationPerSender;
    }

    /// @dev calculates the live value of an asset with a grade of pseudo randomization, based on block, and sender
    function calcLiveAssetValueRandomized(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset,
        uint256 _blockNumberDeviation
    ) external returns (uint256 value_) {
        uint256 liveAssetValue = calcLiveAssetValue(_baseAsset, _amount, _quoteAsset);

        // Calculate factor by masking 8 bits of msg sender then dividing by 2^8.
        // Value between [0, 100]
        uint256 senderRandomFactor = uint256(uint8(msg.sender))
            .mul(100)
            .div(256)
            .mul(maxDeviationPerSender)
            .div(100);

        // Depending on `block.number`, it will be one of {20, 40, 60, 80, 100}
        uint256 blockNumbeRandomFactor = (block.number.mod(2).mul(20))
            .add((block.number.mod(3).mul(40)))
            .mul(_blockNumberDeviation)
            .div(100);

        // Applies senderRandomFactor to calcLiveAssetValue
        // Value in range [liveAssetValue - senderRandomFactor, liveAssetValue + senderRandomFactor]
        uint256 senderRandomizedValue_ = calcDeviatedValue(
            liveAssetValue,
            senderRandomFactor,
            maxDeviationPerSender
        );

        // Same strategy with tmpRandomFactor
        // Range [liveAssetValue - senderRandomFactor - tmpRandomFactor , liveAssetValue + senderRandomFactor + tmpRandomFactor]
        value_ = calcDeviatedValue(
            senderRandomizedValue_,
            blockNumbeRandomFactor,
            _blockNumberDeviation
        );
    }

    function setValueInterpreter(address _valueInterpreter) external onlyOwner {
        valueInterpreter = _valueInterpreter;
    }

    function setMaxDeviationPerSender(uint256 _maxDeviationPerSender) external onlyOwner {
        maxDeviationPerSender = _maxDeviationPerSender;
    }

    /// @dev calculates the value of an asset relative to a quoteAsset.
    /// Similar to ValueInterprete's calcLiveAssetValue, but also allowing to force a rate
    function calcLiveAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) public returns (uint256 value_) {
        (value_, ) = IValueInterpreter(valueInterpreter).calcLiveAssetValue(
            _baseAsset,
            _amount,
            _quoteAsset
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Given a mean value and a max deviation, returns a value in the spectrum between 0 (_meanValue - maxDeviation) and 100 (_mean + maxDeviation)
    /// TODO: Refactor to use 18 decimal precision
    function calcDeviatedValue(
        uint256 _meanValue,
        uint256 _offset,
        uint256 _maxDeviation
    ) private pure returns (uint256 value_) {
        return
            _meanValue.add((_meanValue.mul((uint256(2)).mul(_offset)).div(uint256(100)))).sub(
                _meanValue.mul(_maxDeviation).div(uint256(100))
            );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getMaxDeviationPerSender() public view returns (uint256 maxDeviationPerSender_) {
        return maxDeviationPerSender;
    }

    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return valueInterpreter;
    }
}
