// FIRST-PARTY
const QuFastDictionary = require('./QuFastDictionary')
const QuFastElement = require('./QuFastElement')
const QuFastContext = require('./QuFastContext')
const QuFastUtils = require('./QuFastUtils')

// THIRD-PARTY
const convert = require('xml-js')
const fs = require('fs');
const Long = require('long')


module.exports = class QuFastEncoder {
    constructor(template_path) {
        this.Dictionary = new QuFastDictionary()
        this.templateID = new QuFastElement('TemplateID', 'uInt32', 0, 'mandatory', { name: 'copy', key: 'templateID', value: undefined }, undefined)
        this.SHIFT = [0, 0, 7, 14, 21, 28, 35, 42, 49, 56, 63]
        this.listTemplate = []
        // decode buffer
        this.buffer = []
        this.pos = 0

        // load XML file
        const xml = fs.readFileSync(template_path)
        const js = convert.xml2js(xml, { compact: false, ignoreComment: true })
        const listTemplates = this.getElementByName(js.elements, 'templates')
        const listTemplate = this.getElementsByName(listTemplates.elements, 'template')


        for (let i = 0; i < listTemplate.length; ++i) {
            const tpl = new QuFastElement(listTemplate[i].attributes.name, 'message', listTemplate[i].attributes.id)
            tpl.parse(tpl, listTemplate[i].elements)
            // add mapping for template id and name
            this.listTemplate[tpl.id] = tpl
            this.listTemplate[tpl.name] = tpl
        }

        if (!this.listTemplate[120]) {
            // Add FAST Reset if not present in the template definition
            const FASTReset = new QuFastElement('FASTReset', 'message', 120)
            this.listTemplate[120] = FASTReset
            this.listTemplate['FASTReset'] = FASTReset
        }
    }

    getElementByName(elements, name) {
        for (var i = 0; i < elements.length; ++i) {
            if (elements[i].name == name) {
                return elements[i]
            }
        }
    }

    getElementsByName(elements, name) {
        var elems = []
        for (var i = 0; i < elements.length; ++i) {
            if (elements[i].name == name) {
                elems.push(elements[i])
            }
        }
        return elems
    }

    encode(name, value) {
        console.log('Encode message', name, 'value:', value)

        // lookup template definition
        var template = this.listTemplate[name]
        if (template == null) {
            throw new Error('Message tempate for ' + name + ' not found!')
        }

        // encode/reserve pmap bits
        var ctx = new QuFastContext([])

        // encode template id
        this.encodeUInt32Value(ctx, this.templateID, template.id)

        // encode message body
        this.encodeGroup(ctx, template, value)

        if (template.id == 120) {
            // FAST Reset
            console.log('Reset Dictionary')
            this.Dictionary.reset()
        }

        // return the binary encoded message
        return ctx.buffer
    }

    encodeGroup(ctx, field, value, start) {
        var elements = field.elements
        if (elements) {
            for (var i = start ? start : 0; i < elements.length; ++i) {
                var element = elements[i]
                var fieldName = element.name
                var optional = element.isOptional()
                var operator = element.operator

                switch (element.type) {
                    case 'int32':
                        this.encodeInt32Value(ctx, element, value[fieldName])
                        break
                    case 'uInt32':
                        this.encodeUInt32Value(ctx, element, value[fieldName])
                        break
                    case 'int64':
                        this.encodeInt64Value(ctx, element, value[fieldName] != null ? Long.fromValue(value[fieldName]) : undefined)
                        break
                    case 'uInt64':
                        this.encodeUInt64Value(ctx, element, value[fieldName] != null ? Long.fromValue(value[fieldName], true) : undefined)
                        break
                    case 'decimal':
                        this.encodeDecimalValue(ctx, element, value[fieldName])
                        break
                    case 'string':
                        this.encodeStringValue(ctx, element, value[fieldName])
                        break
                    case 'byteVector':
                        this.encodeByteVectorValue(ctx, element, value[fieldName])
                        break
                    case 'group':
                        if (optional) {
                            ctx.setBit(value[fieldName] != null)
                        }
                        if (value[fieldName] != null) {
                            var groupCtx = new QuFastContext([])
                            this.encodeGroup(groupCtx, element, value[fieldName])
                            ctx.buffer.push.apply(ctx.buffer, groupCtx.buffer)
                        }
                        break
                    case 'sequence':
                        this.encodeSequence(ctx, element, value[fieldName])
                        break
                    default:
                        console.log('Error: Not supported type', element.type, fieldName)
                        break
                }
            }
        }

        if (field.pmapElements > 0) this.encodePMAP(ctx)
    }

    encodeSequence(ctx, field, value, start) {
        console.log('EncodeSequence:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.lengthField.hasOperator())
        var begin = ctx.buffer.length

        var optional = field.isOptional()

        if (optional && !value) {
            this.encodeUInt32Value(ctx, field.lengthField, undefined)
            return
        }

        // encode length field
        this.encodeUInt32Value(ctx, field.lengthField, value.length)

        for (var i = 0; i < value.length; ++i) {
            var seqCtx = new QuFastContext([])
            this.encodeGroup(seqCtx, field, value[i])
            ctx.buffer.push.apply(ctx.buffer, seqCtx.buffer)
        }
    }

    encodeUInt32Value(ctx, field, value) {
        console.log('EncodeUInt32Value:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.hasOperator())
        var pos = ctx.buffer.length
        var optional = field.isOptional()
        if (!field.hasOperator()) {
            if (optional && value == null) {
                this.encodeNull(ctx)
            } else {
                this.encodeU32(ctx, value, optional)
            }
        } else {
            switch (field.operator.name) {
                case 'constant':
                    if (optional) {
                        ctx.setBit(value != null)
                    }
                    break
                case 'copy':
                    var entry = this.Dictionary.getField(field.name)
                    if (entry.isAssigned() && value == entry.Value) {
                        ctx.setBit(false)
                    } else {
                        if (optional && value == null && !entry.isAssigned()) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeU32(ctx, value, optional)
                            entry.assign(value)
                        }
                    }
                    break
                case 'default':
                    if (optional && value == null) {
                        if (field.operator.value == null) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        }
                    } else if (value != field.operator.value) {
                        ctx.setBit(true)
                        this.encodeU32(ctx, value, optional)
                    } else {
                        ctx.setBit(false)
                    }
                    break
                case 'increment':
                    var entry = this.Dictionary.getField(field.name)
                    if (optional && value == null) {
                        if (entry.isAssigned()) {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        } else {
                            ctx.setBit(false)
                        }
                    } else if (entry.isAssigned() && value == entry.Value + 1) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeU32(ctx, value, optional)
                    }
                    entry.assign(value)
                    break
                case 'tail':
                    break
                case 'delta':
                    if (optional && value == null) {
                        this.encodeNull(ctx)
                        break
                    }
                    var entry = this.Dictionary.getField(field.name)
                    var deltaValue = value - (entry.isAssigned() ? entry.Value : 0)
                    this.encodeI32(ctx, deltaValue, optional)
                    entry.assign(value)
                    break
            }
        }
        console.log('ENCODED(U32):', QuFastUtils.toHexString(ctx.buffer.slice(pos)), '\n')
    }

    encodeInt32Value(ctx, field, value) {
        console.log('EncodeInt32Value:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.hasOperator())
        var pos = ctx.buffer.length
        var optional = field.isOptional()
        if (!field.hasOperator()) {
            if (optional && value == null) {
                this.encodeNull(ctx)
            } else {
                this.encodeI32(ctx, value, optional)
            }
        } else {
            switch (field.operator.name) {
                case 'constant':
                    if (optional) {
                        ctx.setBit(value != null)
                    }
                    break
                case 'copy':
                    var entry = this.Dictionary.getField(field.name)
                    if (entry.isAssigned() && value == entry.Value) {
                        ctx.setBit(false)
                    } else {
                        if (optional && value == null && !entry.isAssigned()) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeI32(ctx, value, optional)
                            entry.assign(value)
                        }
                    }
                    break
                case 'default':
                    if (optional && value == null) {
                        if (field.operator.value == null) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        }
                    } else if (value != field.operator.value) {
                        ctx.setBit(true)
                        this.encodeI32(ctx, value, optional)
                    } else {
                        ctx.setBit(false)
                    }
                    break
                case 'increment':
                    var entry = this.Dictionary.getField(field.name)
                    if (optional && value == null) {
                        if (entry.isAssigned()) {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        } else {
                            ctx.setBit(false)
                        }
                    } else if (entry.isAssigned() && value == entry.Value + 1) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeI32(ctx, value, optional)
                    }
                    entry.assign(value)
                    break
                case 'tail':
                    break
                case 'delta':
                    if (optional && value == null) {
                        this.encodeNull(ctx)
                        break
                    }
                    var entry = this.Dictionary.getField(field.name)
                    var deltaValue = value - (entry.isAssigned() ? entry.Value : 0)
                    this.encodeI64(ctx, Long.fromNumber(deltaValue), optional)
                    entry.assign(value)
                    break
            }
        }
        console.log('ENCODED(I32):', QuFastUtils.toHexString(ctx.buffer.slice(pos)), '\n')
    }

    encodeInt64Value(ctx, field, value) {
        console.log('EncodeInt64Value:', field.name, value != null ? value.toString(10) : undefined, 'OPT:', field.isOptional(), 'Operator:', field.operator)
        var pos = ctx.buffer.length
        var optional = field.isOptional()
        if (!field.hasOperator()) {
            if (optional && value == null) {
                this.encodeNull(ctx)
            } else {
                this.encodeI64(ctx, value, optional)
            }
        } else {
            switch (field.operator.name) {
                case 'constant':
                    if (optional) {
                        ctx.setBit(value != null)
                    }
                    break
                case 'copy':
                    var entry = this.Dictionary.getField(field.name)
                    if (entry.isAssigned() && value != null && value.equals(entry.Value)) {
                        ctx.setBit(false)
                    } else {
                        if (optional && value == null && !entry.isAssigned()) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeI64(ctx, value, optional)
                            entry.assign(value)
                        }
                    }
                    break
                case 'default':
                    if (optional && value == null) {
                        if (field.operator.value == null) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        }
                    } else if ((field.operator.value == null) || (field.operator.value != null && Long.fromValue(value).notEquals(field.operator.value))) {
                        ctx.setBit(true)
                        this.encodeI64(ctx, value, optional)
                    } else {
                        ctx.setBit(false)
                    }
                    break
                case 'increment':
                    var entry = this.Dictionary.getField(field.name)
                    if (optional && value == null) {
                        if (entry.isAssigned()) {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        } else {
                            ctx.setBit(false)
                        }
                    } else if (entry.isAssigned() && value.equals(entry.Value.add(Long.ONE))) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeI64(ctx, value, optional)
                    }
                    entry.assign(value)
                    break
                case 'tail':
                    break
                case 'delta':
                    if (optional && value == null) {
                        this.encodeNull(ctx)
                        break
                    }
                    var entry = this.Dictionary.getField(field.name)
                    var deltaValue = value.subtract((entry.isAssigned() ? entry.Value : Long.ZERO))
                    this.encodeI64(ctx, deltaValue, optional)
                    entry.assign(value)
                    break
            }
        }
        console.log('ENCODED(I64):', QuFastUtils.toHexString(ctx.buffer.slice(pos)), '\n')
    }

    encodeUInt64Value(ctx, field, value) {
        console.log('EncodeUInt64Value:', field.name, value == null ? undefined : value.toString(10), 'OPT:', field.isOptional(), 'Operator:', field.operator)
        var pos = ctx.buffer.length
        var optional = field.isOptional()
        if (!field.hasOperator()) {
            if (optional && !value) {
                this.encodeNull(ctx)
            } else {
                this.encodeU64(ctx, Long.fromValue(value, true), optional)
            }
        } else {
            switch (field.operator.name) {
                case 'constant':
                    if (optional) {
                        ctx.setBit(value != null)
                    }
                    break
                case 'copy':
                    var entry = this.Dictionary.getField(field.name)
                    if (entry.isAssigned() && value != null && value.equals(entry.Value)) {
                        ctx.setBit(false)
                    } else {
                        if (optional && value == null && !entry.isAssigned()) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeU64(ctx, value, optional)
                            entry.assign(value)
                        }
                    }
                    break
                case 'default':
                    if (optional && value == null) {
                        if (field.operator.value == null) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        }
                    } else if ((field.operator.value == null) || (field.operator.value != null && Long.fromValue(value, true).notEquals(Long.fromValue(field.operator.value, true)))) {
                        ctx.setBit(true)
                        this.encodeU64(ctx, value, optional)
                    } else {
                        ctx.setBit(false)
                    }
                    break
                case 'increment':
                    var entry = this.Dictionary.getField(field.name)
                    if (optional && value == null) {
                        if (entry.isAssigned()) {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        } else {
                            ctx.setBit(false)
                        }
                    } else if (entry.isAssigned() && value == entry.Value + 1) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeU64(ctx, value, optional)
                    }
                    entry.assign(value)
                    break
                case 'tail':
                    break
                case 'delta':
                    if (optional && value == null) {
                        this.encodeNull(ctx)
                        break
                    }
                    var entry = this.Dictionary.getField(field.name)
                    var deltaValue = value.subtract((entry.isAssigned() ? entry.Value : Long.UZERO))
                    this.encodeI64(ctx, deltaValue.toSigned(), optional)
                    entry.assign(value)
                    break
            }
        }
        console.log('ENCODED(U64):', QuFastUtils.toHexString(ctx.buffer.slice(pos)), '\n')
    }

    encodeDecimalValue(ctx, field, valueIn) {
        console.log('EncodeDecimalValue:', field.name, valueIn, field.isOptional(), field.operator)
        var value = QuFastUtils.parseDecimal(valueIn)
        var pos = ctx.buffer.length
        var optional = field.isOptional()
        if (!field.hasOperator()) {
            if (optional && !value) {
                this.encodeNull(ctx)
            } else {
                this.encodeI32(ctx, value.e, optional)
                this.encodeI64(ctx, Long.fromValue(value.m), false)
            }
        } else {
            switch (field.operator.name) {
                case 'constant':
                    if (optional) {
                        ctx.setBit(value != null)
                    }
                    break
                case 'copy':
                    var entry = this.Dictionary.getField(field.name)
                    if (optional && value == null) {
                        if (!entry.isAssigned()) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                            entry.assign(undefined)
                        }
                    } else if (entry.isAssigned() && value.m == entry.Value.m && value.e == entry.Value.e) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeI32(ctx, value == null ? undefined : value.e, optional)
                        if (value != null) this.encodeI64(ctx, Long.fromValue(value.m), false)
                        entry.assign(value)
                    }
                    break
                case 'default':
                    if (optional && value == null) {
                        if (field.operator.value == null) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeNull(ctx)
                        }
                    } else if ((value != null && value.m == field.operator.decimalValue.m && value.e == field.operator.decimalValue.e) || (optional && value == null && field.operator.value == null)) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeI32(ctx, value == null ? undefined : value.e, optional)
                        if (value != null) this.encodeI64(ctx, Long.fromValue(value.m), false)
                    }
                    break
                case 'increment':
                    var entry = this.Dictionary.getField(field.name)
                    if (entry.isAssigned() && value == entry.Value + 1) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeI32(ctx, value.e, optional)
                        this.encodeI64(ctx, Long.fromValue(value.m), false)
                    }
                    entry.assign(value)
                    break
                case 'tail':
                    break
                case 'delta':
                    if (optional && value == null) {
                        this.encodeNull(ctx)
                        break
                    }
                    var entry = this.Dictionary.getField(field.name)
                    var deltaExpValue = value.e - (entry.isAssigned() ? entry.Value.e : 0)
                    var deltaManValue = Long.fromValue(value.m).subtract(entry.isAssigned() ? Long.fromValue(entry.Value.m) : Long.ZERO)
                    this.encodeI32(ctx, deltaExpValue, optional)
                    this.encodeI64(ctx, deltaManValue, false)
                    entry.assign(value)
                    break
            }
        }
        console.log('ENCODED(DEC):', QuFastUtils.toHexString(ctx.buffer.slice(pos)), '\n')
    }

    encodeStringValue(ctx, field, value) {
        console.log('EncodeStringValue:', field.name, value, field.isOptional())
        var pos = ctx.buffer.length
        var optional = field.isOptional()
        if (!field.hasOperator()) {
            if (optional && !value) {
                this.encodeNull(ctx)
            } else {
                this.encodeString(ctx, value, optional)
            }
        } else {
            switch (field.operator.name) {
                case 'constant':
                    if (optional) {
                        ctx.setBit(value != null)
                    }
                    break
                case 'copy':
                    var entry = this.Dictionary.getField(field.name)
                    if (entry.isAssigned() && value == entry.Value) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeString(ctx, value, optional)
                        entry.assign(value)
                    }
                    break
                case 'default':
                    if (value != field.operator.value) {
                        ctx.setBit(true)
                        this.encodeString(ctx, value, optional)
                    } else {
                        ctx.setBit(false)
                    }
                    break
                case 'increment':
                    break
                case 'tail':
                    break
                case 'delta':
                    var entry = this.Dictionary.getField(field.name)
                    var prevValue = entry.isAssigned() ? entry.Value : ""
                    this.encodeStringDelta(ctx, value, optional, prevValue)
                    entry.assign(value)
                    break
            }
        }
        console.log('ENCODED(STR):', QuFastUtils.toHexString(ctx.buffer.slice(pos)), '\n')
    }

    encodeByteVectorValue(ctx, field, value) {
        console.log('encodeByteVectorValue:', value)
        var pos = ctx.buffer.length
        var optional = field.isOptional()
        if (!field.hasOperator()) {
            if (optional && !value) {
                this.encodeNull(ctx)
            } else {
                this.encodeByteVector(ctx, value, optional)
            }
        } else {
            switch (field.operator.name) {
                case 'constant':
                    if (optional) {
                        ctx.setBit(value != null)
                    }
                    break
                case 'copy':
                    var entry = this.Dictionary.getField(field.name)
                    if (entry.isAssigned() && value != null && equals(value, entry.Value)) {
                        ctx.setBit(false)
                    } else {
                        if (optional && value == null && !entry.isAssigned()) {
                            ctx.setBit(false)
                        } else {
                            ctx.setBit(true)
                            this.encodeByteVector(ctx, value, optional)
                            entry.assign(value)
                        }
                    }
                    break
                case 'default':
                    if (value != null && equals(value, field.operator.arrayValue)) {
                        ctx.setBit(false)
                    } else {
                        ctx.setBit(true)
                        this.encodeByteVector(ctx, value, optional)
                    }
                    break
                case 'increment':
                    break
                case 'tail':
                    break
                case 'delta':
                    var entry = this.Dictionary.getField(field.name)
                    var prevValue = entry.isAssigned() ? entry.Value : []
                    this.encodeByteVectorDelta(ctx, value, optional, prevValue)
                    entry.assign(value)
                    break
            }
        }
        console.log('ENCODED(BYT):', QuFastUtils.toHexString(ctx.buffer.slice(pos)), '\n')
    }

    getSizeU32(value) {
        if (value < 128) return 1; // 2 ^ 7
        if (value < 16384) return 2; // 2 ^ 14
        if (value < 2097152) return 3; // 2 ^ 21
        if (value < 268435456) return 4; // 2 ^ 28
        return 5;
    }

    getSizeU64(value) {
        const L128 = Long.fromInt(128, true)
        const L16384 = Long.fromInt(16384, true)
        const L2097152 = Long.fromInt(2097152, true)
        const L268435456 = Long.fromInt(268435456, true)
        const L34359738368 = Long.fromString("34359738368", true)
        const L4398046511104 = Long.fromString("4398046511104", true)
        const L562949953421312 = Long.fromString("562949953421312", true)
        const L72057594037927936 = Long.fromString("72057594037927936", true)
        const L9223372036854775808 = Long.fromString("9223372036854775808", true)

        if (value.lessThan(L128)) return 1; // 2 ^ 7
        if (value.lessThan(L16384)) return 2; // 2 ^ 14
        if (value.lessThan(L2097152)) return 3; // 2 ^ 21
        if (value.lessThan(L268435456)) return 4; // 2 ^ 28
        if (value.lessThan(L34359738368)) return 5; // 2 ^ 35
        if (value.lessThan(L4398046511104)) return 6; // 2 ^ 42
        if (value.lessThan(L562949953421312)) return 7; // 2 ^ 49
        if (value.lessThan(L72057594037927936)) return 8; // 2 ^ 56
        if (value.lessThan(L9223372036854775808)) return 9; // 2 ^ 63
        return 10;
    }

    getSizeI32(value) {
        if ((value >= -64) && (value <= 63)) return 1; // - 2 ^ 6 ... 2 ^ 6 -1
        if ((value >= -8192) && (value <= 8191)) return 2; // - 2 ^ 13 ... 2 ^ 13 -1
        if ((value >= -1048576) && (value <= 1048575)) return 3; // - 2 ^ 20 ... 2 ^ 20 -1
        if ((value >= -134217728) && (value <= 134217727)) return 4; // - 2 ^ 27 ... 2 ^ 27 -1
        return 5;
    }

    getSizeI64(value) {
        const L64N = Long.fromInt(-64)
        const L63 = Long.fromInt(63)
        const L8192N = Long.fromInt(-8192)
        const L8191 = Long.fromInt(8191)
        const L1048576N = Long.fromInt(-1048576)
        const L1048575 = Long.fromInt(1048575)
        const L134217728N = Long.fromInt(-134217728)
        const L134217727 = Long.fromInt(134217727)
        const L17179869184N = Long.fromString("-17179869184")
        const L17179869183 = Long.fromString("17179869183")
        const L2199023255552N = Long.fromString("-2199023255552")
        const L2199023255551 = Long.fromString("2199023255551")
        const L281474976710656N = Long.fromString("-281474976710656")
        const L281474976710655 = Long.fromString("281474976710655")
        const L36028797018963968N = Long.fromString("-36028797018963968")
        const L36028797018963967 = Long.fromString("36028797018963967")
        const L4611686018427387904N = Long.fromString("-4611686018427387904")
        const L4611686018427387903 = Long.fromString("4611686018427387903")

        if (value.greaterThanOrEqual(L64N) && value.lessThanOrEqual(L63)) return 1; // - 2 ^ 6 ... 2 ^ 6 -1
        if (value.greaterThanOrEqual(L8192N) && value.lessThanOrEqual(L8191)) return 2; // - 2 ^ 13 ... 2 ^ 13 -1
        if (value.greaterThanOrEqual(L1048576N) && value.lessThanOrEqual(L1048575)) return 3; // - 2 ^ 20 ... 2 ^ 20 -1
        if (value.greaterThanOrEqual(L134217728N) && value.lessThanOrEqual(L134217727)) return 4; // - 2 ^ 27 ... 2 ^ 27 -1
        if (value.greaterThanOrEqual(L17179869184N) && value.lessThanOrEqual(L17179869183)) return 5; // - 2 ^ 34 ... 2 ^ 34 -1
        if (value.greaterThanOrEqual(L2199023255552N) && value.lessThanOrEqual(L2199023255551)) return 6; // - 2 ^ 41 ... 2 ^ 41 -1
        if (value.greaterThanOrEqual(L281474976710656N) && value.lessThanOrEqual(L281474976710655)) return 7; // - 2 ^ 48 ... 2 ^ 48 -1
        if (value.greaterThanOrEqual(L36028797018963968N) && value.lessThanOrEqual(L36028797018963967)) return 8; // - 2 ^ 55 ... 2 ^ 55 -1
        if (value.greaterThanOrEqual(L4611686018427387904N) && value.lessThanOrEqual(L4611686018427387903)) return 9; // - 2 ^ 62 ... 2 ^ 62 -1
        return 10;
    }

    encodePMAP(ctx) {
        var pos = ctx.buffer.length

        // reduce pmap bits
        while (ctx.pmap.length > 7 && ctx.pmap[ctx.pmap.length - 1] == false) ctx.pmap.pop()

        var byteVal = 0
        var last = true
        for (var i = ctx.pmap.length - 1; i >= 0; --i) {
            byteVal |= (ctx.pmap[i] ? 1 : 0) << (6 - (i % 7))

            if (!((i) % 7)) {
                ctx.buffer.unshift(last ? byteVal | 0x80 : byteVal)
                byteVal = 0
                last = false
            }
        }
        console.log('ENCODED(PMAP):', QuFastUtils.toHexString(ctx.buffer.slice(0, ctx.buffer.length - pos)), '\n')
    }

    encodeNull(ctx) {
        ctx.buffer.push(0x80)
    }

    encodeU32(ctx, valueIn, optional) {
        if (optional && valueIn == null) {
            this.encodeNull(ctx)
        } else {
            var value = optional ? valueIn + 1 : valueIn

            var size = this.getSizeU32(value)
            for (var i = 0; i < size; ++i)
                ctx.buffer.push((value >> this.SHIFT[size - i]) & 0x7f)

            // set stop bit
            ctx.buffer[ctx.buffer.length - 1] |= 0x80
        }

        return this
    }

    encodeU64(ctx, valueIn, optional) {
        if (optional && valueIn == null) {
            this.encodeNull(ctx)
        } else {
            var value = optional ? valueIn.add(Long.UONE) : valueIn

            var size = this.getSizeU64(value)
            for (var i = 0; i < size; ++i) {
                ctx.buffer.push((value.shiftRightUnsigned(this.SHIFT[size - i]).getLowBitsUnsigned() & 0x7f))
            }

            // set stop bit
            ctx.buffer[ctx.buffer.length - 1] |= 0x80
        }

        return this
    }

    encodeI32(ctx, valueIn, optional) {
        console.log('ENCODE I32, VALUE:', valueIn, 'OPT?', optional)
        /*
        if (optional && valueIn == null) {
            this.encodeNull(ctx)
            return this
        }*/

        //var SIGN_SHIFT = (sizeof(T) * 8 - 7);
        var value = (optional && valueIn >= 0) ? valueIn + 1 : valueIn

        var size = this.getSizeI32(value);
        var sign = ctx.buffer.length - 1

        //uint8_t * sign = m_stream;
        for (var i = 0; i < size; ++i) {
            ctx.buffer.push((value >> this.SHIFT[size - i]) & (i > 0 ? 0x7f : 0x7f))
        }

        // set stop bit
        ctx.buffer[ctx.buffer.length - 1] |= 0x80

        // set sign
        if (value < 0) {
            //console.log('SET_SIGN', ctx.buffer[sign], sign)
            //ctx.buffer[sign] |= 0x40
        }
        //*sign |= (0x40 & (value >> SIGN_SHIFT));

        return this
    }

    encodeI64(ctx, valueIn, optional) {
        console.log('ENCODE I64', valueIn, optional)
        /*
        if (optional && valueIn == null) {
            this.encodeNull(ctx)
            return this
        }*/

        var value = (optional && valueIn.greaterThanOrEqual(Long.ZERO)) ? valueIn.add(Long.ONE) : valueIn
        console.log('ENCODE I64 VAL', value.toString(16), optional, value.toBytesBE())

        var size = this.getSizeI64(value);
        var sign = value.isNegative() ? 0x40 : 0

        for (var i = 0; i < size; ++i) {
            var byte = (value.shiftRight(this.SHIFT[size - i]).getLowBits() & (i > 0 ? 0x7f : 0x3f)) | (i > 0 ? 0 : sign)
            ctx.buffer.push(byte)
        }

        // set stop bit
        ctx.buffer[ctx.buffer.length - 1] |= 0x80

        return this
    }

    encodeString(ctx, value, optional) {
        if (optional && value == null) {
            this.encodeNull(ctx)
            return this
        }

        if (value != null && value.length) {
            for (var i = 0; i < value.length; ++i) {
                ctx.buffer.push(value.charCodeAt(i))
            }

            // set stop bit
            ctx.buffer[ctx.buffer.length - 1] |= 0x80
        }
        else
            ctx.buffer.push(0x80)

        return this
    }

    encodeStringDelta(ctx, value, optional, dict) {
        if (optional && (value == null)) {
            this.encodeNull(ctx)
            return this
        }

        for (var pre = 0; pre < value.length && pre < dict.length && value.charCodeAt(pre) == dict.charCodeAt(pre); ++pre) { }
        for (var i = value.length, j = dict.length; i > 0 && j > 0 && value.charCodeAt(i - 1) == dict.charCodeAt(j - 1); --i, --j) { }
        var post = value.length - i

        if (pre > 0 || post > 0) {
            if (pre == post && pre == value.length) {
                this.encodeI32(ctx, 0, optional)
                this.encodeString(ctx, "", false)
            } else if (pre <= post) {
                this.encodeI32(ctx, post - dict.length - 1, optional)
                this.encodeString(ctx, value.substring(0, value.length - post), false)
            } else {
                this.encodeI32(ctx, dict.length - pre, optional)
                this.encodeString(ctx, value.substring(pre), false)
            }
        } else {
            this.encodeI32(ctx, dict.length, optional)
            this.encodeString(ctx, value, false)
        }

        return this
    }

    encodeByteVector(ctx, value, optional) {
        // encode length
        this.encodeU32(ctx, value.length, optional)

        // append content
        ctx.buffer.push.apply(ctx.buffer, value)

        return this
    }

    encodeByteVectorDelta(ctx, value, optional, dict) {
    }


}