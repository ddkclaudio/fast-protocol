const QuFastField = require('./QuFastField')

module.exports = class QuFastDictionary {
    constructor() {
    }

    getField(name) {
        if (!this.hasOwnProperty(name)) {
            this[name] = new QuFastField(name)
        }
        return this[name]
    }

    reset() {
        for (var property in this) {
            if (this.hasOwnProperty(property)) {
                if (this[property].hasOwnProperty('reset')) {
                    this[property].reset()
                }
            }
        }
    }
}


