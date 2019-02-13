module.exports = class QuFastContext {
    constructor(pmap) {
        this.pmap = pmap
        this.idx = 0
        this.buffer = []
    }

    isBitSet() {
        console.log('PMAP[', this.idx, '] =', this.pmap[this.idx])
        if (!this.pmap.length) {
            console.log('PMAP overflow at', this.idx)
            console.trace()
            throw new Error('PMAP overflow')
        }
        return this.pmap[this.idx++]
    }

    setBit(bit) {
        console.log('SET PMAP[', this.pmap.length, '] =', bit)
        this.pmap.push(bit)
    }

}