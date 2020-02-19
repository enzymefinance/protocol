pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./IFee.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../../factory/Factory.sol";
import "../../version/Registry.sol";
import "../../dependencies/DSMath.sol";
import "./IFeeManager.sol";

/// @notice Manages and allocates fees for a particular fund
contract FeeManager is DSMath, Spoke {

    event FeeReward(uint shareQuantity);
    event FeeRegistration(address fee);

    struct FeeInfo {
        address feeAddress;
        uint feeRate;
        uint feePeriod;
    }

    IFee[] public fees;
    mapping (address => bool) public feeIsRegistered;

    constructor(address _hub, address _denominationAsset, address[] memory _fees, uint[] memory _rates, uint[] memory _periods, address _registry) Spoke(_hub) public {
        for (uint i = 0; i < _fees.length; i++) {
            require(
                Registry(_registry).isFeeRegistered(_fees[i]),
                "Fee must be known to Registry"
            );
            register(_fees[i], _rates[i], _periods[i], _denominationAsset);
        }
        if (fees.length > 0) {
            require(
                fees[0].identifier() == 0,
                "Management fee must be at 0 index"
            );
        }
        if (fees.length > 1) {
            require(
                fees[1].identifier() == 1,
                "Performance fee must be at 1 index"
            );
        }
    }

    function register(address feeAddress, uint feeRate, uint feePeriod, address denominationAsset) internal {
        require(!feeIsRegistered[feeAddress], "Fee already registered");
        feeIsRegistered[feeAddress] = true;
        fees.push(IFee(feeAddress));
        IFee(feeAddress).initializeForUser(feeRate, feePeriod, denominationAsset);  // initialize state
        emit FeeRegistration(feeAddress);
    }

    function totalFeeAmount() external returns (uint total) {
        for (uint i = 0; i < fees.length; i++) {
            total = add(total, fees[i].feeAmount());
        }
        return total;
    }

    /// @dev Shares to be inflated after update state
    function _rewardFee(IFee fee) internal {
        require(feeIsRegistered[address(fee)], "Fee is not registered");
        uint rewardShares = fee.feeAmount();
        fee.updateState();
        Shares(routes.shares).createFor(hub.manager(), rewardShares);
        emit FeeReward(rewardShares);
    }

    function _rewardAllFees() internal {
        for (uint i = 0; i < fees.length; i++) {
            _rewardFee(fees[i]);
        }
    }

    /// @dev Used when calling from other components
    function rewardAllFees() public auth { _rewardAllFees(); }

    /// @dev Convenience function; anyone can reward management fee any time
    /// @dev Convention that management fee is 0
    function rewardManagementFee() public {
        if (fees.length >= 1) _rewardFee(fees[0]);
    }

    /// @dev Convenience function
    /// @dev Convention that management fee is 0
    function managementFeeAmount() external returns (uint) {
        if (fees.length < 1) return 0;
        return fees[0].feeAmount();
    }

    /// @dev Convenience function
    /// @dev Convention that performace fee is 1
    function performanceFeeAmount() external returns (uint) {
        if (fees.length < 2) return 0;
        return fees[1].feeAmount();
    }
}

contract FeeManagerFactory is Factory {
    function createInstance(
        address _hub,
        address _denominationAsset,
        address[] memory _fees,
        uint[] memory _feeRates,
        uint[] memory _feePeriods,
        address _registry
    ) public returns (address) {
        address feeManager = address(
            new FeeManager(_hub, _denominationAsset, _fees, _feeRates, _feePeriods, _registry)
        );
        childExists[feeManager] = true;
        emit NewInstance(_hub, feeManager);
        return feeManager;
    }
}
