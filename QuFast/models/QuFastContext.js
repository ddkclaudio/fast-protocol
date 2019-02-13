'use strict';
// FIRST-PARTY
const QuFastUtils = require('./QuFastUtils')

// THIRD-PARTY

module.exports = class QuFastContext {
    constructor(pmap) {
        this.pmap = pmap
        this.idx = 0
        this.buffer = []
    }

    isBitSet() {
        if (QuFastUtils.inDebuf) console.log('PMAP[', this.idx, '] =', this.pmap[this.idx])
        if (!this.pmap.length) {
            if (QuFastUtils.inDebuf) console.log('PMAP overflow at', this.idx)
            console.trace()
            throw new Error('PMAP overflow')
        }
        return this.pmap[this.idx++]
    }

    setBit(bit) {
        if (QuFastUtils.inDebuf) console.log('SET PMAP[', this.pmap.length, '] =', bit)
        this.pmap.push(bit)
    }

}