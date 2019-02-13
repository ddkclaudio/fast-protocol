'use strict';
// FIRST-PARTY
const QuFastOperator = require('./QuFastOperator')

// THIRD-PARTY
const Long = require('long')

module.exports = class QuFastElement {
    constructor(name, type, id, presence, operator, elements) {
        this.name = name
        this.type = type
        this.id = id
        this.pmap = 0
        this.pmapElements = 0
        this.presence = !presence ? 'mandatory' : presence
        this.operator = operator
        this.elements = undefined

        if (this.type == 'decimal' && this.operator && this.operator.value) this.operator.decimalValue = this.parseDecimal(this.operator.value)
        if (this.type == 'byteVector' && this.operator && this.operator.value) this.operator.arrayValue = this.parseByteVector(this.operator.value)

        switch (type) {
            case 'message':
                this.pmapElements = 1
                break
            case 'group':
                if (this.isOptional()) this.pmap = 1
                this.parse(this, elements)
                break
            case 'sequence':
                this.lengthField = this.parseElement(undefined, elements[0], presence)
                this.parse(this, elements, 1)
                break
            case 'templateref':
                // to be implemented
                break
        }
    }

    parseDecimal(str) {
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

    parseByteVector(str) {
        for (var bytes = [], c = 0; c < str.length; c += 2)
            bytes.push(parseInt(str.substr(c, 2), 16));
        return bytes;
    }

    isOptional() {
        return this.presence == null ? false : this.presence == 'optional'
    }

    parse(parent, elements, start) {
        if (elements) {
            for (var i = !start ? 0 : start; i < elements.length; ++i) {
                this.parseElement(parent, elements[i])
            }
        }
    }

    parseElement(parent, element, presence) {
        var operator = this.getOperator(element.elements)
        var field = new QuFastElement(element.attributes.name, element.name, element.attributes.id, presence ? presence : element.attributes.presence, !operator ? undefined : { name: operator.name, key: !operator.attributes || !operator.attributes.key ? element.attributes.name : operator.attributes.key, value: !operator.attributes ? undefined : operator.attributes.value }, element.elements, parent)
        field.pmap = field.presenceBits()
        if (parent) {
            parent.addElement(field)
            parent.pmapElements += field.pmap
        }
        return field
    }

    getOperator(elements) {
        if (elements) {
            for (var i = 0; i < elements.length; ++i) {
                switch (elements[i].name) {
                    case 'constant':
                    case 'copy':
                    case 'default':
                    case 'delta':
                    case 'increment':
                    case 'tail':
                        return elements[i]
                }
            }
        }
    }

    presenceBits() {
        switch (this.type) {
            case 'group':
                return this.isOptional() ? 1 : 0
            case 'sequence':
                return 0
            case 'decimal':
            //break
            default:
                if (this.operator && QuFastOperator.occupyBit(this.operator.name, this.isOptional()))
                    return 1;
        }

        return 0
    }

    addElement(element) {
        if (!this.elements) this.elements = []
        this.elements.push(element)
    }

    hasOperator() {
        return this.operator != null
    }
}