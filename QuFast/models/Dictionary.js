module.exports = class Dictionary {
    constructor() {
    }

    getField(name) {
        if (!this.hasOwnProperty(name)) {
            this[name] = new Field(name)
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


