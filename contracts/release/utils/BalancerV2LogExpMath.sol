// SPDX-License-Identifier: MIT
// Permission is hereby granted, free of charge, to any person obtaining _a copy of this software and associated
// documentation files (the “Software”), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
// Software.

// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

pragma solidity 0.6.12;

// Verbatim code, adapted to our style guide only.
// All comments are original and have not been reviewed for correctness.
// See original:
// https://github.com/balancer-labs/balancer-v2-monorepo/blob/9ff3512b6418dc3ccf5d8661c84df0ec20b51ee7/pkg/solidity-utils/contracts/math/LogExpMath.sol
library BalancerV2LogExpMath {
    // All fixed point multiplications and divisions are inlined. This means we need to divide by ONE when multiplying
    // two numbers, and multiply by ONE when dividing them.

    // All arguments and return values are 18 decimal fixed point numbers.
    int256 constant ONE_18 = 1e18;

    // Internally, intermediate values are computed with higher precision as 20 decimal fixed point numbers, and in the
    // case of ln36, 36 decimals.
    int256 constant ONE_20 = 1e20;
    int256 constant ONE_36 = 1e36;

    // The domain of natural exponentiation is bound by the word size and number of decimals used.
    //
    // Because internally the result will be stored using 20 decimals, the largest possible result is
    // (2^255 - 1) / 10^20, which makes the largest exponent ln((2^255 - 1) / 10^20) = 130.700829182905140221.
    // The smallest possible result is 10^(-18), which makes largest negative argument
    // ln(10^(-18)) = -41.446531673892822312.
    // We use 130.0 and -41.0 to have some safety margin.
    int256 constant MAX_NATURAL_EXPONENT = 130e18;
    int256 constant MIN_NATURAL_EXPONENT = -41e18;

    // Bounds for ln_36's argument. Both ln(0.9) and ln(1.1) can be represented with 36 decimal places in _a fixed point
    // 256 bit integer.
    int256 constant LN_36_LOWER_BOUND = ONE_18 - 1e17;
    int256 constant LN_36_UPPER_BOUND = ONE_18 + 1e17;

    uint256 constant MILD_EXPONENT_BOUND = 2 ** 254 / uint256(ONE_20);

    // 18 decimal constants
    int256 constant x0 = 128000000000000000000; // 2ˆ7
    int256 constant a0 = 38877084059945950922200000000000000000000000000000000000; // eˆ(x0) (no decimals)
    int256 constant x1 = 64000000000000000000; // 2ˆ6
    int256 constant a1 = 6235149080811616882910000000; // eˆ(x1) (no decimals)

    // 20 decimal constants
    int256 constant x2 = 3200000000000000000000; // 2ˆ5
    int256 constant a2 = 7896296018268069516100000000000000; // eˆ(x2)
    int256 constant x3 = 1600000000000000000000; // 2ˆ4
    int256 constant a3 = 888611052050787263676000000; // eˆ(x3)
    int256 constant x4 = 800000000000000000000; // 2ˆ3
    int256 constant a4 = 298095798704172827474000; // eˆ(x4)
    int256 constant x5 = 400000000000000000000; // 2ˆ2
    int256 constant a5 = 5459815003314423907810; // eˆ(x5)
    int256 constant x6 = 200000000000000000000; // 2ˆ1
    int256 constant a6 = 738905609893065022723; // eˆ(x6)
    int256 constant x7 = 100000000000000000000; // 2ˆ0
    int256 constant a7 = 271828182845904523536; // eˆ(x7)
    int256 constant x8 = 50000000000000000000; // 2ˆ-1
    int256 constant a8 = 164872127070012814685; // eˆ(x8)
    int256 constant x9 = 25000000000000000000; // 2ˆ-2
    int256 constant a9 = 128402541668774148407; // eˆ(x9)
    int256 constant x10 = 12500000000000000000; // 2ˆ-3
    int256 constant a10 = 113314845306682631683; // eˆ(x10)
    int256 constant x11 = 6250000000000000000; // 2ˆ-4
    int256 constant a11 = 106449445891785942956; // eˆ(x11)

    /**
     * @dev Exponentiation (_x^_y) with unsigned 18 decimal fixed point base and exponent.
     *
     * Reverts if ln(_x) * _y is smaller than `MIN_NATURAL_EXPONENT`, or larger than `MAX_NATURAL_EXPONENT`.
     */
    function pow(uint256 _x, uint256 _y) internal pure returns (uint256 res_) {
        if (_y == 0) {
            // We solve the 0^0 indetermination by making it equal one.
            return uint256(ONE_18);
        }

        if (_x == 0) {
            return 0;
        }

        // Instead of computing _x^_y directly, we instead rely on the properties of logarithms and exponentiation to
        // arrive at that result. In particular, exp(ln(_x)) = _x, and ln(_x^_y) = _y * ln(_x). This means
        // _x^_y = exp(_y * ln(_x)).

        // The ln function takes _a signed value, so we need to make sure _x fits in the signed 256 bit range.
        require(_x >> 255 == 0, "_x out of bounds");
        int256 x_int256 = int256(_x);

        // We will compute _y * ln(_x) in _a single step. Depending on the value of _x, we can either use ln or ln_36. In
        // both cases, we leave the division by ONE_18 (due to fixed point multiplication) to the end.

        // This prevents _y * ln(_x) from overflowing, and at the same time guarantees _y fits in the signed 256 bit range.
        require(_y < MILD_EXPONENT_BOUND, "_y out of bounds");
        int256 y_int256 = int256(_y);

        int256 logx_times_y;
        if (LN_36_LOWER_BOUND < x_int256 && x_int256 < LN_36_UPPER_BOUND) {
            int256 ln_36_x = _ln_36(x_int256);

            // ln_36_x has 36 decimal places, so multiplying by y_int256 isn't as straightforward, since we can't just
            // bring y_int256 to 36 decimal places, as it might overflow. Instead, we perform two 18 decimal
            // multiplications and add the results: one with the first 18 decimals of ln_36_x, and one with the
            // (downscaled) last 18 decimals.
            logx_times_y = ((ln_36_x / ONE_18) * y_int256 + ((ln_36_x % ONE_18) * y_int256) / ONE_18);
        } else {
            logx_times_y = _ln(x_int256) * y_int256;
        }
        logx_times_y /= ONE_18;

        // Finally, we compute exp(_y * ln(_x)) to arrive at _x^_y
        require(MIN_NATURAL_EXPONENT <= logx_times_y && logx_times_y <= MAX_NATURAL_EXPONENT, "product out of bounds");

        return uint256(exp(logx_times_y));
    }

    /**
     * @dev Natural exponentiation (e^_x) with signed 18 decimal fixed point exponent.
     *
     * Reverts if `_x` is smaller than MIN_NATURAL_EXPONENT, or larger than `MAX_NATURAL_EXPONENT`.
     */
    function exp(int256 _x) internal pure returns (int256 res_) {
        require(_x >= MIN_NATURAL_EXPONENT && _x <= MAX_NATURAL_EXPONENT, "invalid exponent");

        if (_x < 0) {
            // We only handle positive exponents: e^(-_x) is computed as 1 / e^_x. We can safely make _x positive since it
            // fits in the signed 256 bit range (as it is larger than MIN_NATURAL_EXPONENT).
            // Fixed point division requires multiplying by ONE_18.
            return ((ONE_18 * ONE_18) / exp(-_x));
        }

        // First, we use the fact that e^(_x+_y) = e^_x * e^_y to decompose _x into _a sum of powers of two, which we call x_n,
        // where x_n == 2^(7 - n), and e^x_n = a_n has been precomputed. We choose the first x_n, x0, to equal 2^7
        // because all larger powers are larger than MAX_NATURAL_EXPONENT, and therefore not present in the
        // decomposition.
        // At the end of this process we will have the product of all e^x_n = a_n that apply, and the remainder of this
        // decomposition, which will be lower than the smallest x_n.
        // exp(_x) = k_0 * a_0 * k_1 * a_1 * ... + k_n * a_n * exp(remainder), where each k_n equals either 0 or 1.
        // We mutate _x by subtracting x_n, making it the remainder of the decomposition.

        // The first two a_n (e^(2^7) and e^(2^6)) are too large if stored as 18 decimal numbers, and could cause
        // intermediate overflows. Instead we store them as plain integers, with 0 decimals.
        // Additionally, x0 + x1 is larger than MAX_NATURAL_EXPONENT, which means they will not both be present in the
        // decomposition.

        // For each x_n, we test if that term is present in the decomposition (if _x is larger than it), and if so deduct
        // it and compute the accumulated product.

        int256 firstAN;
        if (_x >= x0) {
            _x -= x0;
            firstAN = a0;
        } else if (_x >= x1) {
            _x -= x1;
            firstAN = a1;
        } else {
            firstAN = 1; // One with no decimal places
        }

        // We now transform _x into _a 20 decimal fixed point number, to have enhanced precision when computing the
        // smaller terms.
        _x *= 100;

        // `product` is the accumulated product of all a_n (except a0 and a1), which starts at 20 decimal fixed point
        // one. Recall that fixed point multiplication requires dividing by ONE_20.
        int256 product = ONE_20;

        if (_x >= x2) {
            _x -= x2;
            product = (product * a2) / ONE_20;
        }
        if (_x >= x3) {
            _x -= x3;
            product = (product * a3) / ONE_20;
        }
        if (_x >= x4) {
            _x -= x4;
            product = (product * a4) / ONE_20;
        }
        if (_x >= x5) {
            _x -= x5;
            product = (product * a5) / ONE_20;
        }
        if (_x >= x6) {
            _x -= x6;
            product = (product * a6) / ONE_20;
        }
        if (_x >= x7) {
            _x -= x7;
            product = (product * a7) / ONE_20;
        }
        if (_x >= x8) {
            _x -= x8;
            product = (product * a8) / ONE_20;
        }
        if (_x >= x9) {
            _x -= x9;
            product = (product * a9) / ONE_20;
        }

        // x10 and x11 are unnecessary here since we have high enough precision already.

        // Now we need to compute e^_x, where _x is small (in particular, it is smaller than x9). We use the Taylor series
        // expansion for e^_x: 1 + _x + (_x^2 / 2!) + (_x^3 / 3!) + ... + (_x^n / n!).

        int256 seriesSum = ONE_20; // The initial one in the sum, with 20 decimal places.
        int256 term; // Each term in the sum, where the nth term is (_x^n / n!).

        // The first term is simply _x.
        term = _x;
        seriesSum += term;

        // Each term (_x^n / n!) equals the previous one times _x, divided by n. Since _x is _a fixed point number,
        // multiplying by it requires dividing by ONE_20, but dividing by the non-fixed point n values does not.

        term = ((term * _x) / ONE_20) / 2;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 3;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 4;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 5;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 6;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 7;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 8;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 9;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 10;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 11;
        seriesSum += term;

        term = ((term * _x) / ONE_20) / 12;
        seriesSum += term;

        // 12 Taylor terms are sufficient for 18 decimal precision.

        // We now have the first a_n (with no decimals), and the product of all other a_n present, and the Taylor
        // approximation of the exponentiation of the remainder (both with 20 decimals). All that remains is to multiply
        // all three (one 20 decimal fixed point multiplication, dividing by ONE_20, and one integer multiplication),
        // and then drop two digits to return an 18 decimal value.

        return (((product * seriesSum) / ONE_20) * firstAN) / 100;
    }

    /**
     * @dev Logarithm (log(_arg, _base), with signed 18 decimal fixed point _base and argument.
     */
    function log(int256 _arg, int256 _base) internal pure returns (int256 res_) {
        // This performs _a simple _base change: log(_arg, _base) = ln(_arg) / ln(_base).

        // Both logBase and logArg are computed as 36 decimal fixed point numbers, either by using ln_36, or by
        // upscaling.

        int256 logBase;
        if (LN_36_LOWER_BOUND < _base && _base < LN_36_UPPER_BOUND) {
            logBase = _ln_36(_base);
        } else {
            logBase = _ln(_base) * ONE_18;
        }

        int256 logArg;
        if (LN_36_LOWER_BOUND < _arg && _arg < LN_36_UPPER_BOUND) {
            logArg = _ln_36(_arg);
        } else {
            logArg = _ln(_arg) * ONE_18;
        }

        // When dividing, we multiply by ONE_18 to arrive at _a result with 18 decimal places
        return (logArg * ONE_18) / logBase;
    }

    /**
     * @dev Internal natural logarithm (ln(_a)) with signed 18 decimal fixed point argument.
     */
    function _ln(int256 _a) private pure returns (int256 res_) {
        if (_a < ONE_18) {
            // Since ln(_a^k) = k * ln(_a), we can compute ln(_a) as ln(_a) = ln((1/_a)^(-1)) = - ln((1/_a)). If _a is less
            // than one, 1/_a will be greater than one, and this if statement will not be entered in the recursive call.
            // Fixed point division requires multiplying by ONE_18.
            return (-_ln((ONE_18 * ONE_18) / _a));
        }

        // First, we use the fact that ln^(_a * b) = ln(_a) + ln(b) to decompose ln(_a) into _a sum of powers of two, which
        // we call x_n, where x_n == 2^(7 - n), which are the natural logarithm of precomputed quantities a_n (that is,
        // ln(a_n) = x_n). We choose the first x_n, x0, to equal 2^7 because the exponential of all larger powers cannot
        // be represented as 18 fixed point decimal numbers in 256 bits, and are therefore larger than _a.
        // At the end of this process we will have the sum of all x_n = ln(a_n) that apply, and the remainder of this
        // decomposition, which will be lower than the smallest a_n.
        // ln(_a) = k_0 * x_0 + k_1 * x_1 + ... + k_n * x_n + ln(remainder), where each k_n equals either 0 or 1.
        // We mutate _a by subtracting a_n, making it the remainder of the decomposition.

        // For reasons related to how `exp` works, the first two a_n (e^(2^7) and e^(2^6)) are not stored as fixed point
        // numbers with 18 decimals, but instead as plain integers with 0 decimals, so we need to multiply them by
        // ONE_18 to convert them to fixed point.
        // For each a_n, we test if that term is present in the decomposition (if _a is larger than it), and if so divide
        // by it and compute the accumulated sum.

        int256 sum = 0;
        if (_a >= a0 * ONE_18) {
            _a /= a0; // Integer, not fixed point division
            sum += x0;
        }

        if (_a >= a1 * ONE_18) {
            _a /= a1; // Integer, not fixed point division
            sum += x1;
        }

        // All other a_n and x_n are stored as 20 digit fixed point numbers, so we convert the sum and _a to this format.
        sum *= 100;
        _a *= 100;

        // Because further a_n are  20 digit fixed point numbers, we multiply by ONE_20 when dividing by them.

        if (_a >= a2) {
            _a = (_a * ONE_20) / a2;
            sum += x2;
        }

        if (_a >= a3) {
            _a = (_a * ONE_20) / a3;
            sum += x3;
        }

        if (_a >= a4) {
            _a = (_a * ONE_20) / a4;
            sum += x4;
        }

        if (_a >= a5) {
            _a = (_a * ONE_20) / a5;
            sum += x5;
        }

        if (_a >= a6) {
            _a = (_a * ONE_20) / a6;
            sum += x6;
        }

        if (_a >= a7) {
            _a = (_a * ONE_20) / a7;
            sum += x7;
        }

        if (_a >= a8) {
            _a = (_a * ONE_20) / a8;
            sum += x8;
        }

        if (_a >= a9) {
            _a = (_a * ONE_20) / a9;
            sum += x9;
        }

        if (_a >= a10) {
            _a = (_a * ONE_20) / a10;
            sum += x10;
        }

        if (_a >= a11) {
            _a = (_a * ONE_20) / a11;
            sum += x11;
        }

        // _a is now _a small number (smaller than a_11, which roughly equals 1.06). This means we can use _a Taylor series
        // that converges rapidly for values of `_a` close to one - the same one used in ln_36.
        // Let z = (_a - 1) / (_a + 1).
        // ln(_a) = 2 * (z + z^3 / 3 + z^5 / 5 + z^7 / 7 + ... + z^(2 * n + 1) / (2 * n + 1))

        // Recall that 20 digit fixed point division requires multiplying by ONE_20, and multiplication requires
        // division by ONE_20.
        int256 z = ((_a - ONE_20) * ONE_20) / (_a + ONE_20);
        int256 z_squared = (z * z) / ONE_20;

        // num is the numerator of the series: the z^(2 * n + 1) term
        int256 num = z;

        // seriesSum holds the accumulated sum of each term in the series, starting with the initial z
        int256 seriesSum = num;

        // In each step, the numerator is multiplied by z^2
        num = (num * z_squared) / ONE_20;
        seriesSum += num / 3;

        num = (num * z_squared) / ONE_20;
        seriesSum += num / 5;

        num = (num * z_squared) / ONE_20;
        seriesSum += num / 7;

        num = (num * z_squared) / ONE_20;
        seriesSum += num / 9;

        num = (num * z_squared) / ONE_20;
        seriesSum += num / 11;

        // 6 Taylor terms are sufficient for 36 decimal precision.

        // Finally, we multiply by 2 (non fixed point) to compute ln(remainder)
        seriesSum *= 2;

        // We now have the sum of all x_n present, and the Taylor approximation of the logarithm of the remainder (both
        // with 20 decimals). All that remains is to sum these two, and then drop two digits to return _a 18 decimal
        // value.

        return (sum + seriesSum) / 100;
    }

    /**
     * @dev Intrnal high precision (36 decimal places) natural logarithm (ln(_x)) with signed 18 decimal fixed point argument,
     * for _x close to one.
     *
     * Should only be used if _x is between LN_36_LOWER_BOUND and LN_36_UPPER_BOUND.
     */
    function _ln_36(int256 _x) private pure returns (int256 res_) {
        // Since ln(1) = 0, _a value of _x close to one will yield _a very small result, which makes using 36 digits
        // worthwhile.

        // First, we transform _x to _a 36 digit fixed point value.
        _x *= ONE_18;

        // We will use the following Taylor expansion, which converges very rapidly. Let z = (_x - 1) / (_x + 1).
        // ln(_x) = 2 * (z + z^3 / 3 + z^5 / 5 + z^7 / 7 + ... + z^(2 * n + 1) / (2 * n + 1))

        // Recall that 36 digit fixed point division requires multiplying by ONE_36, and multiplication requires
        // division by ONE_36.
        int256 z = ((_x - ONE_36) * ONE_36) / (_x + ONE_36);
        int256 z_squared = (z * z) / ONE_36;

        // num is the numerator of the series: the z^(2 * n + 1) term
        int256 num = z;

        // seriesSum holds the accumulated sum of each term in the series, starting with the initial z
        int256 seriesSum = num;

        // In each step, the numerator is multiplied by z^2
        num = (num * z_squared) / ONE_36;
        seriesSum += num / 3;

        num = (num * z_squared) / ONE_36;
        seriesSum += num / 5;

        num = (num * z_squared) / ONE_36;
        seriesSum += num / 7;

        num = (num * z_squared) / ONE_36;
        seriesSum += num / 9;

        num = (num * z_squared) / ONE_36;
        seriesSum += num / 11;

        num = (num * z_squared) / ONE_36;
        seriesSum += num / 13;

        num = (num * z_squared) / ONE_36;
        seriesSum += num / 15;

        // 8 Taylor terms are sufficient for 36 decimal precision.

        // All that remains is multiplying by 2 (non fixed point).
        return seriesSum * 2;
    }
}
