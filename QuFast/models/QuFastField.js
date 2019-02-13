
const QuFastState = require('./QuFastState')

module.exports = class QuFastField {
    constructor(name) {
        this.State = QuFastState.UNDEFINED
        this.Value = undefined
        this.Name = name
    }

    isUndefined() {
        return this.State == QuFastState.UNDEFINED
    }

    isAssigned() {
        return this.State == QuFastState.ASSIGNED
    }

    isEmpty() {
        return this.State == QuFastState.EMPTY
    }

    assign(value) {
        this.State = value == null ? QuFastState.EMPTY : QuFastState.ASSIGNED
        this.Value = value
    }

    reset() {
        this.State = QuFastState.EMPTY
        this.Value = undefined
    }
}