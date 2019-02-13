'use strict';
// FIRST-PARTY
const QuFastBase = require('./QuFastBase')
const QuFastElement = require('./QuFastElement')
const QuFastContext = require('./QuFastContext')
const QuFastUtils = require('./QuFastUtils')

// THIRD-PARTY
const Long = require('long')

module.exports = class QuFastDecoder extends QuFastBase {
    constructor(template_path) {
        super(template_path)

        this.TemplateID = 0

        if (!this.listTemplate[120]) {
            this.listTemplate[120] = new QuFastElement('FASTReset', 'message', 120)
        }
    }

    decode(buffer, callbacks) {
        this.pos = 0
        this.buffer = buffer
        while (this.pos < this.buffer.length) {
            // decode presence map
            var ctx = new QuFastContext(this.decodePMAP())

            // decode template id
            this.TemplateID = this.decodeUInt32Value(ctx, this.templateID)

            // lookup template definition
            var tpl = this.listTemplate[this.TemplateID]
            if (tpl) {
                var msg = this.decodeGroup(ctx, tpl.elements)

                // call handler if available
                if (typeof callbacks === 'function') {
                    callbacks(msg, tpl.name)
                } else if (callbacks[tpl.name]) {
                    callbacks[tpl.name](msg, tpl)
                } else if (callbacks['default']) {
                    callbacks['default'](msg, tpl.name, tpl)
                }

                if (tpl.id == 120) {
                    // FAST reset
                    this.Dictionary.reset()
                }
            } else {
                // template definition not found
                if(QuFastUtils.inDebuf) console.log('Error: Template definition for template id =', this.TemplateID, 'not found!')
                throw new Error('Error: Template definition for template id = ' + this.TemplateID + ' not found!')
            }
        }
    }

    decodeUInt32Value(ctx, field) {
        if(QuFastUtils.inDebuf) console.log('DecodeUInt32Value', field.name, field.presence, field.operator != null ? field.operator.name : '')
        var optional = field.isOptional()
        if (!field.hasOperator()) return this.decodeU32(optional)

        switch (field.operator.name) {
            case 'constant':
                if (optional) return ctx.isBitSet() ? Number(field.operator.value) : undefined
                // ELSE
                return Number(field.operator.value)
            case 'copy':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeU32(optional))
                }
                return entry.Value
            case 'default':
                if (ctx.isBitSet()) return this.decodeU32(optional)
                // ELSE
                return optional & field.operator.value == null ? undefined : Number(field.operator.value)
            case 'increment':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeU32(optional))
                } else {
                    if (entry.isAssigned()) {
                        entry.assign(entry.Value + 1)
                    } else {
                        entry.assign(undefined)
                    }
                }
                return entry.Value
            case 'delta':
                var streamValue = this.decodeI32(optional)
                if (optional && streamValue == null) return undefined
                var entry = this.Dictionary.getField(field.name)
                entry.assign((streamValue == null) ? undefined : ((entry.isAssigned() ? entry.Value : 0) + streamValue) >>> 0)
                return entry.Value
        }
    }

    decodeInt32Value(ctx, field) {
        if(QuFastUtils.inDebuf) console.log('DecodeInt32Value', field.name, field.presence, field.operator)
        var optional = field.isOptional()
        if (!field.hasOperator()) return this.decodeI32(optional)

        switch (field.operator.name) {
            case 'constant':
                if (optional) return ctx.isBitSet() ? Number(field.operator.value) : undefined
                // ELSE
                return Number(field.operator.value)
            case 'copy':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeI32(optional))
                }
                return entry.Value
            case 'default':
                if (ctx.isBitSet()) return this.decodeI32(optional)
                // ELSE
                return optional && field.operator.value == null ? undefined : Number(field.operator.value)
            case 'increment':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeI32(optional))
                } else {
                    if (entry.isAssigned()) {
                        entry.assign(entry.Value + 1)
                    } else {
                        entry.assign(undefined)
                    }
                }
                return entry.Value
            case 'delta':
                var streamValue = this.decodeI64(optional)
                if (optional && streamValue == null) return undefined
                var entry = this.Dictionary.getField(field.name)
                entry.assign(streamValue == null ? undefined : entry.isAssigned() ? Long.fromValue(entry.Value).add(streamValue).toInt() : Long.fromValue(streamValue).toInt())
                return entry.Value
        }
    }

    decodeUInt64Value(ctx, field) {
        if(QuFastUtils.inDebuf) console.log('DecodeUInt64Value', field.name, field.presence, field.operator)
        if(QuFastUtils.inDebuf) console.log('DECODE(U64):', QuFastUtils.toHexString(this.buffer.slice(this.pos)), '\n')
        var optional = field.isOptional()
        if (!field.hasOperator()) return this.decodeU64(optional)

        switch (field.operator.name) {
            case 'constant':
                if (optional) return ctx.isBitSet() ? field.operator.value : undefined
                // ELSE
                return field.operator.value
            case 'copy':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeU64(optional))
                }
                return entry.Value
            case 'default':
                return ctx.isBitSet() ? this.decodeU64(optional) : field.operator.value
            case 'increment':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeU64(optional))
                } else if (entry.isAssigned()) {
                    entry.assign(Long.fromValue(entry.Value).add(Long.UONE))
                }
                return entry.isAssigned() ? entry.Value.toString(10) : undefined
            case 'delta':
                var streamValue = this.decodeI64(optional)
                if (optional && streamValue == null) return undefined
                var entry = this.Dictionary.getField(field.name)
                entry.assign(streamValue == null ? undefined : entry.isAssigned() ? Long.fromValue(entry.Value, true).add(streamValue) : streamValue)
                return entry.isAssigned() ? entry.Value.toString(10) : undefined
        }
    }

    decodeInt64Value(ctx, field) {
        if(QuFastUtils.inDebuf) console.log('DecodeInt64Value', field.name, field.presence, field.operator)
        if(QuFastUtils.inDebuf) console.log('DECODE(I64):', QuFastUtils.toHexString(this.buffer.slice(this.pos)), '\n')
        var optional = field.isOptional()
        if (!field.hasOperator()) return this.decodeI64(optional)

        switch (field.operator.name) {
            case 'constant':
                if (optional) return ctx.isBitSet() ? field.operator.value : undefined
                // ELSE
                return field.operator.value
            case 'copy':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeI64(optional))
                }
                return entry.Value
            case 'default':
                return ctx.isBitSet() ? this.decodeI64(optional) : field.operator.value
            case 'increment':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeI64(optional))
                } else if (entry.isAssigned()) {
                    entry.assign(Long.fromValue(entry.Value).add(Long.ONE))
                }
                return entry.isAssigned() ? entry.Value.toString(10) : undefined
            case 'delta':
                var streamValue = this.decodeI64(optional)
                if (optional && streamValue == null) return undefined
                var entry = this.Dictionary.getField(field.name)
                entry.assign(streamValue == null ? undefined : entry.isAssigned() ? Long.fromValue(entry.Value).add(streamValue) : streamValue)
                return entry.isAssigned() ? entry.Value.toString(10) : undefined
        }
    }

    decodeDecimalValue(ctx, field) {
        if(QuFastUtils.inDebuf) console.log('DecodeDecimalValue', field.name, field.presence, field.operator)
        var optional = field.isOptional()
        if (!field.hasOperator()) return QuFastUtils.decimalToString(this.decodeDecimal(optional))

        switch (field.operator.name) {
            case 'constant':
                if (optional) return ctx.isBitSet() ? field.operator.value : undefined
                // ELSE
                return field.operator.value
            case 'copy':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeDecimal(optional))
                }
                return QuFastUtils.decimalToString(entry.Value)
            case 'default':
                if (ctx.isBitSet()) {
                    return QuFastUtils.decimalToString(this.decodeDecimal(optional))
                } else {
                    return field.operator.value
                }
                break
            case 'delta':
                var streamExpValue = this.decodeI32(optional)
                if (streamExpValue == null) {
                    return undefined
                }
                var entry = this.Dictionary.getField(field.name)
                var streamManValue = this.decodeI64(false)
                if (!entry.isAssigned()) {
                    entry.assign({ m: "0", e: 0 })
                }
                entry.assign({ m: Long.fromString(entry.Value.m).add(streamManValue).toString(10), e: entry.Value.e + streamExpValue })
                return QuFastUtils.decimalToString(entry.Value)
        }
    }

    decodeStringValue(ctx, field) {
        if(QuFastUtils.inDebuf) console.log('DecodeStringValue', field.name, field.presence, field.operator)
        var optional = field.isOptional()
        if (!field.hasOperator()) return this.decodeString(optional)

        switch (field.operator.name) {
            case 'constant':
                if (optional) return ctx.isBitSet() ? field.operator.value : undefined
                // ELSE
                return field.operator.value
            case 'copy':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeString(optional))
                }
                return entry.Value
            case 'default':
                return ctx.isBitSet() ? this.decodeString(optional) : field.operator.value
            case 'tail':
                break
            case 'delta':
                var entry = this.Dictionary.getField(field.name)
                var length = this.decodeI32(optional)
                if (optional && length == null) {
                    //entry.assign(undefined)
                    return undefined
                } else {
                    var str = length == null ? '' : this.decodeString(false)
                    if (length < 0) {
                        entry.assign(str + entry.Value.substring((length + 1) * -1))
                    } else if (length > 0) {
                        entry.assign(entry.Value.substring(0, entry.Value.length - length) + str)
                    } else { // length == 0
                        entry.assign(entry.isAssigned() ? entry.Value + str : str)
                    }
                }

                return entry.Value
        }
    }

    decodeByteVectorValue(ctx, field) {
        if(QuFastUtils.inDebuf) console.log('DecodeByteVectorValue', field.name, field.presence, field.operator)
        var optional = field.isOptional()
        if (!field.hasOperator()) return this.decodeByteVector(optional)

        switch (field.operator.name) {
            case 'constant':
                if (optional) return ctx.isBitSet() ? field.operator.arrayValue : undefined
                // ELSE
                return field.operator.arrayValue
            case 'copy':
                var entry = this.Dictionary.getField(field.name)
                if (ctx.isBitSet()) {
                    entry.assign(this.decodeByteVector(optional))
                }
                return entry.Value
            case 'default':
                return ctx.isBitSet() ? this.decodeByteVector(optional) : field.operator.value
            case 'tail':
                break
            case 'delta':
                var entry = this.Dictionary.getField(field.name)
                var length = this.decodeI32(optional)
                if (optional && length == null) {
                    //entry.assign(undefined)
                    return undefined
                } else {
                    var str = length == null ? '' : this.decodeByteVector(false)
                    if (length < 0) {
                        entry.assign(str + entry.Value.substring((length + 1) * -1))
                    } else if (length > 0) {
                        entry.assign(entry.Value.substring(0, entry.Value.length - length) + str)
                    } else { // length == 0
                        entry.assign(entry.isAssigned() ? entry.Value + str : str)
                    }
                }

                return entry.Value
        }
    }

    decodePMAP() {
        if(QuFastUtils.inDebuf) console.log('DECODE PMAP', this.pos, this.buffer.length - this.pos)
        var pmap = []
        while (this.pos < this.buffer.length) {
            var byteVal = this.buffer[this.pos++]
            if(QuFastUtils.inDebuf) console.log('PMAP BYTE', byteVal)
            var stop = byteVal & 0x80
            for (var i = 0; i < 7; ++i, byteVal <<= 1) {
                pmap.push(byteVal & 0x40 ? true : false)
            }

            if (stop) break
        }

        return pmap;
    }

    decodeI32(optional) {
        if (optional) {
            var byteVal = this.buffer[this.pos]
            if (byteVal == 0x80) {
                ++this.pos;
                return undefined;
            }
        }

        var val = (this.buffer[this.pos] & 0x40) > 0 ? -1 : 0
        for (; this.pos < this.buffer.length;) {
            var byteVal = this.buffer[this.pos++]
            val = (val << 7) + (byteVal & 0x7f)
            if (byteVal & 0x80) break
        }

        return (optional && val > 0) ? val - 1 : val
    }

    decodeU32(optional) {
        if (optional) {
            var byteVal = this.buffer[this.pos]
            if (byteVal == 0x80) {
                ++this.pos;
                return undefined;
            }
        }

        var val = 0
        for (; this.pos < this.buffer.length;) {
            var byteVal = this.buffer[this.pos++]

            val = ((val << 7) >>> 0) + (byteVal & 0x7f)	// use >>> fake operator for unsigned numbers since << is defined only for signed integer
            if (byteVal & 0x80) break
        }

        return optional ? val - 1 : val
    }

    decodeI64(optional) {
        if(QuFastUtils.inDebuf) console.log('decodeI64', optional)
        if (optional) {
            var byteVal = this.buffer[this.pos]
            if (byteVal == 0x80) {
                ++this.pos;
                return undefined;
            }
        }

        var value = (this.buffer[this.pos] & 0x40) > 0 ? Long.NEG_ONE : Long.ZERO

        for (var first = true; this.pos < this.buffer.length; first = false) {
            var byte = this.buffer[this.pos++]
            value = value.shiftLeft(first ? 6 : 7).or(byte & (first ? 0x3f : 0x7f))
            if (byte & 0x80) break
        }

        if (optional && value.greaterThan(Long.ZERO)) value = value.subtract(Long.ONE)

        return value.toString(10)
    }

    decodeU64(optional) {
        if(QuFastUtils.inDebuf) console.log('decodeU64', optional)
        if (optional) {
            var byteVal = this.buffer[this.pos]
            if (byteVal == 0x80) {
                ++this.pos;
                return undefined;
            }
        }

        var value = Long.UZERO
        for (; this.pos < this.buffer.length;) {
            var byteVal = this.buffer[this.pos++]
            value = value.shiftLeft(7).or(byteVal & 0x7f)
            if (byteVal & 0x80) break
        }

        if (optional) value = value.subtract(Long.UONE)

        return value.toString(10)
    }

    decodeDecimal(optional) {
        if (optional) {
            var byteVal = this.buffer[this.pos]
            if (byteVal == 0x80) {
                ++this.pos;
                return undefined;
            }
        }

        var exp = this.decodeI32(optional)
        var man = this.decodeI64(false)
        return { 'm': man, 'e': exp }
    }

    decodeString(optional) {
        if (optional) {
            var byteVal = this.buffer[this.pos]
            if (byteVal == 0x80) {
                ++this.pos;
                return undefined;
            }
        }

        var val = ""
        while (this.pos < this.buffer.length) {
            var byteVal = this.buffer[this.pos++]
            if (byteVal & 0x7f) {
                val += String.fromCharCode(byteVal & 0x7f)
            }

            if (byteVal & 0x80) break
        }

        return val
    }

    decodeByteVector(optional) {
        var len = this.decodeU32(optional)
        if (len != null) {
            var val = QuFastUtils.arrayFromBuffer(this.buffer.slice(this.pos, this.pos + len))
            this.pos += len
            return val
        }
        return undefined
    }

    decodeGroup(ctx, elements, start) {
        var val = {}
        if (!elements) return val

        for (var i = start ? start : 0; i < elements.length; ++i) {
            var element = elements[i]
            var fieldName = element.name
            var optional = (element.presence == null) ? false : (element.presence == 'optional')
            var operator = element.operator

            switch (element.type) {
                case 'int32':
                    val[fieldName] = this.decodeInt32Value(ctx, element)
                    if(QuFastUtils.inDebuf) console.log(fieldName, '=', val[fieldName])
                    break
                case 'uInt32':
                    val[fieldName] = this.decodeUInt32Value(ctx, element)
                    if(QuFastUtils.inDebuf) console.log(fieldName, '=', val[fieldName])
                    break
                case 'int64':
                    val[fieldName] = this.decodeInt64Value(ctx, element)
                    if(QuFastUtils.inDebuf) console.log(fieldName, '=', val[fieldName])
                    break
                case 'uInt64':
                    val[fieldName] = this.decodeUInt64Value(ctx, element)
                    if(QuFastUtils.inDebuf) console.log(fieldName, '=', val[fieldName])
                    break
                case 'decimal':
                    val[fieldName] = this.decodeDecimalValue(ctx, element)
                    if(QuFastUtils.inDebuf) console.log(fieldName, '=', val[fieldName])
                    break
                case 'string':
                    val[fieldName] = this.decodeStringValue(ctx, element)
                    if(QuFastUtils.inDebuf) console.log(fieldName, '=', val[fieldName])
                    break
                case 'byteVector':
                    val[fieldName] = this.decodeByteVectorValue(ctx, element)
                    if(QuFastUtils.inDebuf) console.log(fieldName, '=', val[fieldName])
                    break
                case 'group':
                    var isBitSet = optional ? ctx.isBitSet() : false
                    if ((!optional) || (optional && isBitSet)) {
                        var groupCtx = new QuFastContext(element.pmapElements > 0 ? this.decodePMAP() : [])
                        val[fieldName] = this.decodeGroup(groupCtx, element.elements)
                    } else {
                        val[fieldName] = undefined
                    }
                    break
                case 'sequence':
                    val[fieldName] = this.decodeSequenceValue(ctx, element)
                    break
                default:
                    if(QuFastUtils.inDebuf) console.log('Not supported type', element.type, fieldName)
                    break
            }
        }

        return val
    }

    decodeSequenceValue(ctx, sequence) {
        if(QuFastUtils.inDebuf) console.log('DecodeSequence', sequence.name, sequence.presence)
        var length = this.decodeUInt32Value(ctx, sequence.lengthField)
        if(QuFastUtils.inDebuf) console.log(sequence.lengthField.name, '=', length)
        if (length == null) {
            return undefined
        }

        var val = []
        for (var i = 0; i < length; ++i) {
            var groupCtx = new QuFastContext(sequence.pmapElements ? this.decodePMAP() : [])
            val.push(this.decodeGroup(groupCtx, sequence.elements))
        }
        return val
    }

}