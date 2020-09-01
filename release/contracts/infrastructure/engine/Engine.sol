// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../interfaces/IERC20Extended.sol";
import "../value-interpreter/IValueInterpreter.sol";
import "./IEngine.sol";

/// @title Engine Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Token sink for MLN
contract Engine is IEngine {
    using SafeMath for uint256;
    using SafeERC20 for IERC20Extended;

    event AmguPriceSet(uint256 prevAmguPrice, uint256 nextAmguPrice);
    event AmguPaidInEther(uint256 amount);
    event EtherTakerAdded(address etherTaker);
    event EtherTakerRemoved(address etherTaker);
    event FrozenEtherThawed(uint256 amount);
    event MlnTokensBurned(uint256 amount);

    // Immutable vars
    address private immutable MGM;
    address private immutable MLN_TOKEN;
    address private immutable MTC;
    address private immutable PRIMITIVE_PRICE_FEED;
    address private immutable VALUE_INTERPRETER;
    address private immutable WETH_TOKEN;
    uint256 private immutable THAW_DELAY;

    // Mutable storage
    uint256 private amguPrice;
    uint256 private frozenEther;
    uint256 private lastThaw;
    uint256 private liquidEther;
    // "Ether takers" are accts that can burn mln in exchange for liquid ether.
    // They should continue to be EngineAdapter instances.
    mapping(address => bool) private acctToIsEtherTaker;

    modifier onlyMTC() {
        require(msg.sender == MTC, "onlyMTC: Only MTC can call this function");
        _;
    }

    constructor(
        address _MGM,
        address _MTC,
        address _mlnToken,
        address _wethToken,
        address _primitivePriceFeed,
        address _valueInterpreter,
        uint256 _thawDelay,
        address[] memory _etherTakers
    ) public {
        MGM = _MGM;
        MLN_TOKEN = _mlnToken;
        MTC = _MTC;
        PRIMITIVE_PRICE_FEED = _primitivePriceFeed;
        VALUE_INTERPRETER = _valueInterpreter;
        WETH_TOKEN = _wethToken;
        THAW_DELAY = _thawDelay;
        lastThaw = block.timestamp;
        __addEtherTakers(_etherTakers);
    }

    // EXTERNAL FUNCTIONS

    function addEtherTakers(address[] calldata _takers) external onlyMTC {
        __addEtherTakers(_takers);
    }

    // TODO: what if invalid price?
    function calcEthDueForGasUsed(uint256 _gasUsed) external override returns (uint256 ethDue_) {
        uint256 mlnDue = amguPrice.mul(_gasUsed);
        (ethDue_, ) = IValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetValue(
            PRIMITIVE_PRICE_FEED,
            address(0),
            MLN_TOKEN,
            mlnDue,
            WETH_TOKEN
        );
    }

    function payAmguInEther() external override payable {
        frozenEther = frozenEther.add(msg.value);
        emit AmguPaidInEther(msg.value);
    }

    function removeEtherTakers(address[] calldata _takers) external onlyMTC {
        for (uint256 i = 0; i < _takers.length; i++) {
            require(
                acctToIsEtherTaker[_takers[i]],
                "__addEtherTakers: etherTaker has not been added"
            );
            acctToIsEtherTaker[_takers[i]] = false;

            emit EtherTakerRemoved(_takers[i]);
        }
    }

    /// @dev Only an authorized "Ether Taker" can call this function
    function sellAndBurnMln(uint256 _mlnAmount) external override {
        require(
            acctToIsEtherTaker[msg.sender],
            "sellAndBurnMln: only an authorized ether taker can call this function"
        );

        // Calculate eth to send and decrease liquidEther
        uint256 ethToSend = calcEthOutputForMlnInput(_mlnAmount);
        require(ethToSend > 0, "sellAndBurnMln: No ether to pay out");
        require(liquidEther >= ethToSend, "sellAndBurnMln: Not enough liquid ether");
        liquidEther = liquidEther.sub(ethToSend);

        // Burn mln tokens and send eth
        IERC20Extended mlnTokenContract = IERC20Extended(MLN_TOKEN);
        mlnTokenContract.safeTransferFrom(msg.sender, address(this), _mlnAmount);
        mlnTokenContract.burn(_mlnAmount);
        msg.sender.transfer(ethToSend);

        emit MlnTokensBurned(_mlnAmount);
    }

    /// @dev Only the MGM can call this function
    function setAmguPrice(uint256 _nextPrice) external {
        require(msg.sender == MGM, "setAmguPrice: Only MGM can call this function");
        uint256 prevPrice = amguPrice;

        amguPrice = _nextPrice;
        emit AmguPriceSet(prevPrice, _nextPrice);
    }

    /// @notice Move frozen ether to liquid pool after the predefined thaw delay has passed
    /// @dev Delay only restarts when this function is called
    function thaw() external {
        require(frozenEther > 0, "thaw: No frozen ether to thaw");
        require(block.timestamp >= lastThaw.add(THAW_DELAY), "thaw: Thaw delay has not passed");

        uint256 ethToThaw = frozenEther;
        liquidEther = liquidEther.add(ethToThaw);
        frozenEther = 0;
        lastThaw = block.timestamp;

        emit FrozenEtherThawed(ethToThaw);
    }

    // PUBLIC FUNCTIONS

    // TODO: affirm calculation; any need to multiply premium prior to converting?
    function calcEthOutputForMlnInput(uint256 _mlnAmount) public returns (uint256 ethAmount_) {
        (uint256 rawEthAmount, bool isValidRate) = IValueInterpreter(VALUE_INTERPRETER)
            .calcCanonicalAssetValue(
            PRIMITIVE_PRICE_FEED,
            address(0),
            MLN_TOKEN,
            _mlnAmount,
            WETH_TOKEN
        );
        require(isValidRate, "calcEthOutputForMlnInput: mln to eth rate is invalid");

        ethAmount_ = rawEthAmount.mul(calcPremiumPercent().add(100)).div(100);
    }

    function calcPremiumPercent() public view returns (uint256) {
        if (liquidEther < 1 ether) {
            return 0;
        } else if (liquidEther >= 1 ether && liquidEther < 5 ether) {
            return 5;
        } else if (liquidEther >= 5 ether && liquidEther < 10 ether) {
            return 10;
        } else if (liquidEther >= 10 ether) {
            return 15;
        }
    }

    // PRIVATE FUNCTIONS

    function __addEtherTakers(address[] memory _takers) private {
        for (uint256 i = 0; i < _takers.length; i++) {
            require(
                !acctToIsEtherTaker[_takers[i]],
                "__addEtherTakers: etherTaker has already been added"
            );
            acctToIsEtherTaker[_takers[i]] = true;

            emit EtherTakerAdded(_takers[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function isEtherTaker(address _who) external view returns (bool) {
        return acctToIsEtherTaker[_who];
    }

    function getAmguPrice() external override view returns (uint256) {
        return amguPrice;
    }

    function getFrozenEther() external view returns (uint256) {
        return frozenEther;
    }

    function getLastThaw() external view returns (uint256) {
        return lastThaw;
    }

    function getLiquidEther() external view returns (uint256) {
        return liquidEther;
    }

    function getMGM() external view returns (address) {
        return MGM;
    }

    function getMTC() external view returns (address) {
        return MTC;
    }

    function getMLNToken() external view returns (address) {
        return MLN_TOKEN;
    }

    function getPrimitivePriceFeed() external view returns (address) {
        return PRIMITIVE_PRICE_FEED;
    }

    function getThawDelay() external view returns (uint256) {
        return THAW_DELAY;
    }

    function getValueInterpreter() external view returns (address) {
        return VALUE_INTERPRETER;
    }

    function getWETHToken() external view returns (address) {
        return WETH_TOKEN;
    }
}
