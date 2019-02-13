'use strict';
// FIRST-PARTY

// THIRD-PARTY

module.exports = class QuFastOperator {
    constructor() {
        this.NONE = undefined
        this.CONSTANT = 1
        this.COPY = 2
        this.DEFAULT = 3
        this.INCREMENT = 4
        this.TAIL = 5
        this.DELTA = 6
    }

    static get properties() {
        return {
            constant: { name: 'constant', pmap: { mandatory: false, optional: true } },
            copy: { name: 'copy', pmap: { mandatory: true, optional: true } },
            default: { name: 'default', pmap: { mandatory: true, optional: true } },
            increment: { name: 'increment', pmap: { mandatory: true, optional: true } },
            tail: { name: 'tail', pmap: { mandatory: true, optional: true } },
            delta: { name: 'delta', pmap: { mandatory: false, optional: false } }
        }
    }

    static occupyBit(operator, optional) {
        return QuFastOperator.properties[operator].pmap[optional ? 'optional' : 'mandatory']
    }
}