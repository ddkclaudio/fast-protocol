'use strict';
const Long = require('long')
module.exports = class QuFastUtils {
    constructor() {
    }

    static toHexString(byteArray) {
        var s = '';
        byteArray.forEach(function (byte) {
            s += ('0' + (byte & 0xFF).toString(16)).slice(-2) + ' ';
        });
        return s;
    }

    static parseDecimal(str) {
        if (!str) return undefined
        // [1] SIGN
        // [2] + [4] MANTISSA
        // [6] EXPONENT
        var matches = str.match(/^([+-])?(\d+)?(\.)?(\d*)?(e([+-]?\d+))?$/)

        var sign = matches[1] != null ? matches[1] : '+'
        var pre = matches[2] != null ? matches[2] : ''
        var post = matches[4] != null ? matches[4].replace(/0*$/, '') : ''

        var mantissa = Long.fromString(pre.concat(post)).multiply(sign == '-' ? Long.NEG_ONE : Long.ONE)
        var exponent = matches[6] != null ? Number(matches[6]) - post.length : 0 - post.length
        return { m: mantissa.toString(10), e: exponent }
    }

}