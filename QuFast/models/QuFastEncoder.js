// FIRST-PARTY
const Dictionary = require('./Dictionary')
const QuFastElement = require('./QuFastElement')

// THIRD-PARTY
const convert = require('xml-js')
const fs = require('fs');

module.exports = class QuFastEncoder {
    constructor(template_path) {
        this.Dictionary = new Dictionary()
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
}