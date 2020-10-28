// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../interfaces/IERC20Extended.sol";
import "../utils/DispatcherOwnerMixin.sol";
import "../value-interpreter/IValueInterpreter.sol";
import "./IEngine.sol";

/// @title Engine Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Governs the payment of ETH for asset management gas (amgu), and offers this paid ETH
/// at a discount in exchange for MLN (which it burns).
contract Engine is IEngine, DispatcherOwnerMixin {
    using SafeMath for uint256;
    using SafeERC20 for IERC20Extended;

    event AmguPriceSet(uint256 prevAmguPrice, uint256 nextAmguPrice);

    event AmguPaidInEther(uint256 amount);

    event EtherTakerAdded(address etherTaker);

    event EtherTakerRemoved(address etherTaker);

    event FrozenEtherThawed(uint256 amount);

    event MlnSoldAndBurned(uint256 mlnAmount, uint256 ethAmount);

    event ValueInterpreterSet(address prevValueInterpreter, address nextValueInterpreter);

    // Immutable vars
    address private immutable MGM;
    address private immutable MLN_TOKEN;
    address private immutable WETH_TOKEN;
    uint256 private immutable THAW_DELAY;

    // Mutable storage
    address private valueInterpreter;
    uint256 private amguPrice;
    uint256 private frozenEther;
    uint256 private lastThaw;
    uint256 private liquidEther;
    // "Ether takers" are accounts that can burn MLN in exchange for ETH (once liquid).
    // In practice, they are (and should continue to be) EngineAdapter instances.
    mapping(address => bool) private acctToIsEtherTaker;

    constructor(
        address _dispatcher,
        address _MGM,
        address _mlnToken,
        address _wethToken,
        address _valueInterpreter,
        uint256 _thawDelay
    ) public DispatcherOwnerMixin(_dispatcher) {
        MGM = _MGM;
        MLN_TOKEN = _mlnToken;
        valueInterpreter = _valueInterpreter;
        WETH_TOKEN = _wethToken;
        THAW_DELAY = _thawDelay;
        lastThaw = block.timestamp;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Adds accounts that are allowed to trade MLN for discounted ETH
    /// @param _takersToAdd The list of accounts to add
    function addEtherTakers(address[] calldata _takersToAdd) external onlyDispatcherOwner {
        for (uint256 i; i < _takersToAdd.length; i++) {
            require(
                !isEtherTaker(_takersToAdd[i]),
                "addEtherTakers: Account has already been added"
            );
            acctToIsEtherTaker[_takersToAdd[i]] = true;

            emit EtherTakerAdded(_takersToAdd[i]);
        }
    }

    /// @notice Calculates the amount of ETH due for a given amount of asset management gas (amgu)
    /// @param _gasUsed The amount of asset management gas
    /// @return ethDue_ The amount of ETH due
    /// @return rateIsValid_ True if the MLN/ETH rate is valid
    function calcEthDueForGasUsed(uint256 _gasUsed)
        external
        override
        returns (uint256 ethDue_, bool rateIsValid_)
    {
        // _gasUsed will never be 0
        uint256 currentAmguPrice = amguPrice;
        if (currentAmguPrice == 0) {
            return (0, true);
        }

        return __calcMlnAmountInEth(currentAmguPrice.mul(_gasUsed));
    }

    /// @notice Handles the payment and freezing of ETH
    /// @dev Should only ever be called by an AmguConsumer, though no need to validate the sender
    function payAmguInEther() external payable override {
        frozenEther = frozenEther.add(msg.value);
        emit AmguPaidInEther(msg.value);
    }

    /// @notice Removes accounts that are allowed to trade MLN for discounted ETH
    /// @param _takersToRemove The list of accounts to remove
    function removeEtherTakers(address[] calldata _takersToRemove) external onlyDispatcherOwner {
        for (uint256 i; i < _takersToRemove.length; i++) {
            require(
                isEtherTaker(_takersToRemove[i]),
                "removeEtherTakers: Account is not an etherTaker"
            );
            acctToIsEtherTaker[_takersToRemove[i]] = false;

            emit EtherTakerRemoved(_takersToRemove[i]);
        }
    }

    /// @notice Handles the trading of MLN for discounted ETH
    /// @param _mlnAmount The amount of MLN to trade
    function sellAndBurnMln(uint256 _mlnAmount) external override {
        require(isEtherTaker(msg.sender), "sellAndBurnMln: Unauthorized");

        // Calculate ETH to send, and decrease liquidEther
        (uint256 ethToSend, bool rateIsValid) = calcEthOutputForMlnInput(_mlnAmount);
        require(rateIsValid, "sellAndBurnMln: Invalid rate");
        require(ethToSend > 0, "sellAndBurnMln: MLN quantity too low");
        uint256 prevLiquidEther = liquidEther;
        require(prevLiquidEther >= ethToSend, "sellAndBurnMln: Not enough liquid ether");
        liquidEther = prevLiquidEther.sub(ethToSend);

        // Burn MLN and send ETH
        IERC20Extended mlnTokenContract = IERC20Extended(MLN_TOKEN);
        mlnTokenContract.safeTransferFrom(msg.sender, address(this), _mlnAmount);
        mlnTokenContract.burn(_mlnAmount);
        msg.sender.transfer(ethToSend);

        emit MlnSoldAndBurned(_mlnAmount, ethToSend);
    }

    /// @notice Sets the `amguPrice` variable
    /// @param _nextPrice The asset management gas (amgu) price to set
    function setAmguPrice(uint256 _nextPrice) external {
        require(msg.sender == MGM, "setAmguPrice: Only MGM can call this function");

        uint256 prevPrice = amguPrice;
        amguPrice = _nextPrice;

        emit AmguPriceSet(prevPrice, _nextPrice);
    }

    /// @notice Sets the `valueInterpreter` variable
    /// @param _nextValueInterpreter The ValueInterpreter contract to set
    function setValueInterpreter(address _nextValueInterpreter) external onlyDispatcherOwner {
        address prevValueInterpreter = valueInterpreter;
        require(
            _nextValueInterpreter != prevValueInterpreter,
            "setValueInterpreter: Value already set"
        );

        valueInterpreter = _nextValueInterpreter;

        emit ValueInterpreterSet(prevValueInterpreter, _nextValueInterpreter);
    }

    /// @notice Moves all frozen ETH to the liquid ETH pool (only after the "thaw delay" has passed)
    /// @dev The thaw delay restarts when this function is called
    function thaw() external {
        require(frozenEther > 0, "thaw: No frozen ETH to thaw");
        require(block.timestamp >= lastThaw.add(THAW_DELAY), "thaw: Thaw delay has not passed");

        uint256 ethToThaw = frozenEther;
        liquidEther = liquidEther.add(ethToThaw);
        frozenEther = 0;
        lastThaw = block.timestamp;

        emit FrozenEtherThawed(ethToThaw);
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculates the amount of ETH to receive for a given amount of MLN
    /// @param _mlnAmount The amount of MLN to trade
    /// @return ethAmount_ The amount of ETH to receive
    /// @return isValidRate_ True if the rate is valid
    function calcEthOutputForMlnInput(uint256 _mlnAmount)
        public
        returns (uint256 ethAmount_, bool isValidRate_)
    {
        uint256 rawEthAmount;
        (rawEthAmount, isValidRate_) = __calcMlnAmountInEth(_mlnAmount);

        ethAmount_ = rawEthAmount.mul(calcPremiumPercent().add(100)).div(100);

        return (ethAmount_, isValidRate_);
    }

    /// @notice Calculates the percent by which to discount the current amount of liquid ETH
    /// @return premiumPercent_ The discount percentage
    function calcPremiumPercent() public view returns (uint256 premiumPercent_) {
        if (liquidEther >= 10 ether) {
            return 15;
        } else if (liquidEther >= 5 ether) {
            return 10;
        } else if (liquidEther >= 1 ether) {
            return 5;
        }

        return 0;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the equivalent amount of ETH given an amount of MLN
    function __calcMlnAmountInEth(uint256 _mlnAmount)
        private
        returns (uint256 ethAmount_, bool isValidRate_)
    {
        return
            IValueInterpreter(valueInterpreter).calcCanonicalAssetValue(
                MLN_TOKEN,
                _mlnAmount,
                WETH_TOKEN
            );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function isEtherTaker(address _who) public view returns (bool) {
        return acctToIsEtherTaker[_who];
    }

    /// @notice Gets the `amguPrice` variable
    /// @return amguPrice_ The `amguPrice` variable value
    function getAmguPrice() external view override returns (uint256 amguPrice_) {
        return amguPrice;
    }

    /// @notice Gets the `frozenEther` variable
    /// @return frozenEther_ The `frozenEther` variable value
    function getFrozenEther() external view returns (uint256 frozenEther_) {
        return frozenEther;
    }

    /// @notice Gets the `lastThaw` variable
    /// @return lastThaw_ The `lastThaw` variable value
    function getLastThaw() external view returns (uint256 lastThaw_) {
        return lastThaw;
    }

    /// @notice Gets the `liquidEther` variable
    /// @return liquidEther_ The `liquidEther` variable value
    function getLiquidEther() external view returns (uint256 liquidEther_) {
        return liquidEther;
    }

    /// @notice Gets the `MGM` variable
    /// @return MGM_ The `MGM` variable value
    function getMGM() external view returns (address MGM_) {
        return MGM;
    }

    /// @notice Gets the `MLN_TOKEN` variable
    /// @return mlnToken_ The `MLN_TOKEN` variable value
    function getMlnToken() external view returns (address mlnToken_) {
        return MLN_TOKEN;
    }

    /// @notice Gets the `THAW_DELAY` variable
    /// @return thawDelay_ The `THAW_DELAY` variable value
    function getThawDelay() external view returns (uint256 thawDelay_) {
        return THAW_DELAY;
    }

    /// @notice Gets the `valueInterpreter` variable
    /// @return valueInterpreter_ The `valueInterpreter` variable value
    function getValueInterpreter() external view returns (address valueInterpreter_) {
        return valueInterpreter;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
