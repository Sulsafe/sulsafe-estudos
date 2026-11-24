import test from 'node:test'
import assert from 'node:assert/strict'
import {
    escapeHTML,
    sanitizarHTML,
    markdownParaHTML,
    renderizarMensagemIA
} from '../js/chat-seguro.js'

const PAYLOAD_IMG = '<img src=x onerror=alert(1)>'
const PAYLOAD_SCRIPT = '<script>alert(1)</script>'

test('XSS: payload img onerror aparece como texto, nunca como tag', () => {
    const html = renderizarMensagemIA(PAYLOAD_IMG)

    assert.ok(!html.includes('<img'), 'nao pode existir tag <img> no HTML renderizado')
    assert.ok(html.includes('&lt;img'), 'o payload deve aparecer escapado, como texto visível')
    assert.ok(html.includes('&gt;'), 'o fechamento do payload tambem deve estar escapado')
    assert.ok(html.startsWith('<p>'), 'a estrutura segura do chat deve ser preservada')
})

test('XSS: payload script aparece como texto, nunca executa', () => {
    const html = renderizarMensagemIA(PAYLOAD_SCRIPT)

    assert.ok(!html.includes('<script'), 'nao pode existir tag <script> no HTML renderizado')
    assert.ok(html.includes('&lt;script&gt;'))
    assert.ok(html.includes('&lt;/script&gt;'))
})

test('XSS: payload dentro de Markdown tambem e sanitizado', () => {
    const html = renderizarMensagemIA(`**${PAYLOAD_IMG}**`)

    assert.ok(html.includes('<b>'), 'o Markdown negrito permitido continua funcionando')
    assert.ok(!html.includes('<img'))
    assert.ok(html.includes('&lt;img'))
})

test('XSS: atributos de evento sao removidos de tags permitidas', () => {
    const html = sanitizarHTML('<a href="https://sulsafe.com.br" onclick="alert(1)">Site</a>')

    assert.ok(html.includes('href="https://sulsafe.com.br"'))
    assert.ok(html.includes('rel="noopener noreferrer"'))
    assert.ok(!html.includes('onclick'))
})

test('XSS: esquema javascript: em link e bloqueado', () => {
    const html = renderizarMensagemIA('[clique](javascript:alert(1))')

    assert.ok(html.includes('href="#"'))
    assert.ok(html.includes('rel="noopener noreferrer"'))
    assert.ok(!html.includes('javascript:'))
})

test('XSS: escaped text do usuario tambem e seguro', () => {
    assert.equal(escapeHTML(PAYLOAD_IMG), '&lt;img src=x onerror=alert(1)&gt;')
    assert.equal(escapeHTML(PAYLOAD_SCRIPT), '&lt;script&gt;alert(1)&lt;/script&gt;')
})

test('chat: tags permitidas e Markdown continuam com o mesmo visual', () => {
    const html = renderizarMensagemIA('<b>NR-10</b>\n\n- item um\n- item dois')

    assert.ok(html.includes('<b>NR-10</b>'))
    assert.ok(html.includes('<ul><li>item um</li><li>item dois</li></ul>'))
    assert.equal(markdownParaHTML('**ok**'), '<p><b>ok</b></p>')
})
