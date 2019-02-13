'use strict';
// FIRST-PARTY
const QuFastDictionary = require('./QuFastDictionary')
const QuFastElement = require('./QuFastElement')
const QuFastContext = require('./QuFastContext')
const QuFastUtils = require('./QuFastUtils')

// THIRD-PARTY
const convert = require('xml-js')
const fs = require('fs');
const Long = require('long')

module.exports = class QuFastDecoder {
    constructor(template_path) {
        // dictionary used for this decoder, will be filled during template load
        this.Dictionary = new QuFastDictionary()

        this.templateID = new QuFastElement('TemplateID', 'uInt32', 0, 'mandatory', { name: 'copy', key: 'templateID', value: undefined }, undefined)
        this.TemplateID = 0
        this.listTemplate = []

        // decode buffer
        this.buffer = undefined
        this.pos = 0

        // load XML file
        var xml = fs.readFileSync(template_path)
        var js = convert.xml2js(xml, { compact: false, ignoreComment: true })
        var listTemplates = this.getElementByName(js.elements, 'templates')
        var listTemplate = this.getElementsByName(listTemplates.elements, 'template')

        for (var i = 0; i < listTemplate.length; ++i) {
            var tpl = new QuFastElement(listTemplate[i].attributes.name, 'message', listTemplate[i].attributes.id)
            tpl.parse(tpl, listTemplate[i].elements)

            this.listTemplate[tpl.id] = tpl
        }
        if (!this.listTemplate[120]) {
            // Add FAST Reset
            this.listTemplate[120] = new QuFastElement('FASTReset', 'message', 120)
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

}