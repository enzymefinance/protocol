// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "../fund/hub/IHub.sol";
import "../fund/hub/ISpoke.sol";
import "../prices/primitives/IPriceSource.sol";
import "../registry/IRegistry.sol";
import "./IEngine.sol";

/// @title Engine Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Liquidity contract and token sink
contract Engine is IEngine {
    using SafeMath for uint256;

    event RegistryChange(address registry);
    event SetAmguPrice(uint256 amguPrice);
    event AmguPaid(uint256 amount);
    event Thaw(uint256 amount);
    event Burn(uint256 amount);

    IRegistry public registry;
    uint256 public amguPrice;
    uint256 public frozenEther;
    uint256 public liquidEther;
    uint256 public lastThaw;
    uint256 public thawingDelay;
    uint256 public totalEtherConsumed;
    uint256 public totalAmguConsumed;
    uint256 public totalMlnBurned;

    modifier onlyMGM() {
        require(
            msg.sender == registry.MGM(),
            "Only MGM can call this"
        );
        _;
    }

    /// @dev Registry owner is MTC
    modifier onlyMTC() {
        require(
            msg.sender == registry.owner(),
            "Only MTC can call this"
        );
        _;
    }

    constructor(uint256 _delay, address _registry) public {
        lastThaw = block.timestamp;
        thawingDelay = _delay;
        __setRegistry(_registry);
    }

    function __setRegistry(address _registry) internal {
        registry = IRegistry(_registry);
        emit RegistryChange(address(registry));
    }

    /// @dev only callable by MTC
    function setRegistry(address _registry)
        external
        onlyMTC
    {
        __setRegistry(_registry);
    }

    /// @dev set price of AMGU in MLN (base units)
    /// @dev only callable by MGM
    function setAmguPrice(uint256 _price)
        external
        onlyMGM
    {
        amguPrice = _price;
        emit SetAmguPrice(_price);
    }

    function getAmguPrice() public view override returns (uint256) { return amguPrice; }

    function premiumPercent() public view returns (uint256) {
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

    function payAmguInEther() external payable override {
        require(
            msg.sender == registry.fundFactory() ||
            msg.sender == registry.sharesRequestor(),
            "Sender must be FundFactory or SharesRequestor"
        );
        uint256 mlnPerAmgu = getAmguPrice();
        uint256 ethPerMln;
        (ethPerMln,,) = priceSource().getCanonicalRate(address(mlnToken()), registry.WETH_TOKEN());
        uint256 amguConsumed;
        if (mlnPerAmgu > 0 && ethPerMln > 0) {
            amguConsumed = msg.value.mul(10 ** uint256(mlnToken().decimals())).div(ethPerMln.mul(mlnPerAmgu));
        } else {
            amguConsumed = 0;
        }
        totalEtherConsumed = totalEtherConsumed.add(msg.value);
        totalAmguConsumed = totalAmguConsumed.add(amguConsumed);
        frozenEther = frozenEther.add(msg.value);
        emit AmguPaid(amguConsumed);
    }

    /// @notice Move frozen ether to liquid pool after delay
    /// @dev Delay only restarts when this function is called
    function thaw() external {
        require(
            block.timestamp >= lastThaw.add(thawingDelay),
            "Thawing delay has not passed"
        );
        require(frozenEther > 0, "No frozen ether to thaw");
        lastThaw = block.timestamp;
        liquidEther = liquidEther.add(frozenEther);
        emit Thaw(frozenEther);
        frozenEther = 0;
    }

    /// @return ETH per MLN including premium
    function enginePrice() public view returns (uint256) {
        uint256 ethPerMln;
        (ethPerMln,,) = priceSource().getCanonicalRate(address(mlnToken()), registry.WETH_TOKEN());
        uint256 premium = ethPerMln.mul(premiumPercent()).div(100);
        return ethPerMln.add(premium);
    }

    function ethPayoutForMlnAmount(uint256 _mlnAmount) public view returns (uint256) {
        return _mlnAmount.mul(enginePrice()).div(10 ** uint256(mlnToken().decimals()));
    }

    /// @notice MLN must be approved first
    /// @dev Only Vault can call this function (via EngineAdapter)
    function sellAndBurnMln(uint256 _mlnAmount) external override {
        require(
            registry.integrationAdapterIsRegistered(msg.sender),
            "Only a registered integration adapter can call this function"
        );
        require(
            mlnToken().transferFrom(msg.sender, address(this), _mlnAmount),
            "MLN transferFrom failed"
        );
        uint256 ethToSend = ethPayoutForMlnAmount(_mlnAmount);
        require(ethToSend > 0, "No ether to pay out");
        require(liquidEther >= ethToSend, "Not enough liquid ether to send");
        liquidEther = liquidEther.sub(ethToSend);
        totalMlnBurned = totalMlnBurned.add(_mlnAmount);
        msg.sender.transfer(ethToSend);
        mlnToken().burn(_mlnAmount);
        emit Burn(_mlnAmount);
    }

    /// @dev Get MLN from the registry
    function mlnToken()
        public
        view
        returns (ERC20Burnable)
    {
        return ERC20Burnable(registry.MLN_TOKEN());
    }

    /// @dev Get PriceSource from the registry
    function priceSource()
        public
        view
        returns (IPriceSource)
    {
        return IPriceSource(registry.priceSource());
    }
}
