import test from 'node:test'
import assert from 'node:assert/strict'
import { extrairJson } from '../supabase/functions/tutor-sulsafe/extrair-json.js'

const OUTLINE = {
    courseTitle: 'NR 35 — Trabalho em altura',
    languageDirective: 'Português do Brasil',
    outlines: [{ order: 1, title: 'Introdução', description: 'Conteúdo inicial' }]
}

test('extrai JSON puro sem alterar o contrato 3C', () => {
    assert.deepEqual(extrairJson(JSON.stringify(OUTLINE)), OUTLINE)
})

test('texto explicativo antes e depois de um bloco ```json não quebra o parser', () => {
    const resposta = [
        'Claro! Segue abaixo a ementa solicitada, já no formato combinado.',
        '',
        '```json',
        JSON.stringify(OUTLINE, null, 2),
        '```',
        '',
        'Espero que ajude. Posso ajustar o público-alvo se quiser.'
    ].join('\n')

    assert.deepEqual(extrairJson(resposta), OUTLINE)
})

test('aceita bloco markdown sem rótulo json e com texto em volta', () => {
    const resposta = [
        'Segue:',
        '```',
        JSON.stringify(OUTLINE),
        '```',
        'Fim da resposta.'
    ].join('\n')

    assert.deepEqual(extrairJson(resposta), OUTLINE)
})

test('aceita JSON nu com texto explicativo em volta', () => {
    const resposta = `Aqui está o resultado:\n${JSON.stringify(OUTLINE)}\nQualquer dúvida, me avise.`

    assert.deepEqual(extrairJson(resposta), OUTLINE)
})

test('usa o primeiro bloco válido quando há mais de um no texto', () => {
    const resposta = [
        'Rascunho descartado:',
        '```json',
        '{"incompleto":',
        '```',
        'Versão final:',
        '```json',
        JSON.stringify(OUTLINE),
        '```'
    ].join('\n')

    assert.deepEqual(extrairJson(resposta), OUTLINE)
})

test('JSON malformado lança erro — nunca devolve objeto vazio para gravar', () => {
    const respostas = [
        '```json\n{"courseTitle":"NR 35",\n```',
        'Resposta sem JSON: apenas texto explicativo.',
        '',
        '   ',
        '{"courseTitle": "NR 35" e depois {quebra}'
    ]

    for (const resposta of respostas) {
        assert.throws(() => extrairJson(resposta), /JSON válido/)
    }
})
