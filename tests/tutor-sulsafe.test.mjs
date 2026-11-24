import test from 'node:test'
import assert from 'node:assert/strict'
import {
    TIPOS_TUTOR,
    TIPOS_TUTOR_VALIDOS,
    LIMITES_TUTOR,
    INSTRUCAO_JSON_TUTOR,
    extrairNRsDoAssunto,
    montarPromptTutor,
    adaptarSaidaTutor,
    validarContratoTutor,
    conteudoParaRascunho
} from '../js/tutor-sulsafe.js'

const OUTLINE_NATIVO = {
    courseTitle: 'Trabalho em altura',
    languageDirective: 'Português do Brasil, linguagem simples.',
    outlines: [
        {
            id: 'c1',
            type: 'slide',
            order: 2,
            title: 'Equipamentos de proteção',
            description: 'Uso correto de cintos e talabartes.',
            keyPoints: ['Inspeção antes do uso', 'Ancoragem certificada'],
            teachingObjective: 'Selecionar o EPI adequado para trabalho em altura.'
        },
        {
            id: 'c2',
            type: 'slide',
            order: 1,
            title: 'Conceitos básicos',
            description: 'O que caracteriza trabalho em altura.',
            keyPoints: ['Altura superior a 2 m'],
            teachingObjective: 'Definir trabalho em altura conforme a NR-35.'
        }
    ]
}

test('tipos do Tutor são matéria, curso e palestra', () => {
    assert.deepEqual([...TIPOS_TUTOR_VALIDOS], ['MATERIA', 'CURSO', 'PALESTRA'])
    assert.equal(TIPOS_TUTOR.MATERIA, 'MATERIA')
})

test('extrai NRs citadas no assunto usando a base local da Secretária', () => {
    const nr35 = extrairNRsDoAssunto('Quero uma palestra sobre NR 35')
    assert.equal(nr35.length, 1)
    assert.equal(nr35[0].numero, 35)
    assert.match(nr35[0].titulo, /Trabalho em altura/i)

    const multiplas = extrairNRsDoAssunto('Material sobre nr-06 e NR 035')
    assert.deepEqual(multiplas.map(nr => nr.numero).sort((a, b) => a - b), [6, 35])
    assert.deepEqual(extrairNRsDoAssunto('Segurança no trabalho'), [])
    assert.deepEqual(extrairNRsDoAssunto(''), [])
})

test('prompt contém contexto das NRs, instrução JSON e o pedido do instrutor', () => {
    const prompt = montarPromptTutor({
        assunto: 'Crie um curso sobre NR 35 para novos colaboradores',
        tipo: TIPOS_TUTOR.CURSO,
        publicoAlvo: 'Colaboradores da obra'
    })

    assert.match(prompt, /TUTOR-Sulsafe/)
    assert.match(prompt, /NR-35:.*Trabalho em Altura/is)
    assert.match(prompt, /Colaboradores da obra/)
    assert.ok(prompt.includes(INSTRUCAO_JSON_TUTOR))
    assert.match(prompt, /Pedido do instrutor: Crie um curso sobre NR 35/)

    const semNr = montarPromptTutor({ assunto: 'Como montar uma CIPA?' })
    assert.match(semNr, /Nenhuma NR específica foi citada/)
})

test('prompt rejeita assunto vazio, longo e tipo inválido', () => {
    assert.throws(() => montarPromptTutor({ assunto: '   ' }), /Informe o assunto/)
    assert.throws(() => montarPromptTutor({ assunto: 'x'.repeat(LIMITES_TUTOR.assuntoMax + 1) }), /Informe o assunto/)
    assert.throws(() => montarPromptTutor({ assunto: 'Curso', tipo: 'VIDEO' }), /Tipo de geração inválido/)
})

test('prompt nunca ultrapassa o limite e não carrega segredos', () => {
    const prompt = montarPromptTutor({ assunto: 'a'.repeat(LIMITES_TUTOR.assuntoMax) })
    assert.ok(prompt.length <= LIMITES_TUTOR.promptMax)
    assert.doesNotMatch(prompt, /api[_-]?key|Bearer |sk-[a-z0-9]/i)
})

test('adaptador converte o formato nativo do OpenMAIC para o contrato pt-BR', () => {
    const contrato = adaptarSaidaTutor(OUTLINE_NATIVO, 'Curso sobre trabalho em altura')

    assert.equal(contrato.titulo, 'Trabalho em altura')
    assert.equal(contrato.publicoAlvo, 'Definir trabalho em altura conforme a NR-35.')
    assert.deepEqual(contrato.objetivos, [
        'Definir trabalho em altura conforme a NR-35.',
        'Selecionar o EPI adequado para trabalho em altura.',
        'Altura superior a 2 m',
        'Inspeção antes do uso',
        'Ancoragem certificada'
    ])
    assert.equal(contrato.modulos.length, 2)

    // Ordena por `order` do OpenMAIC, não pela ordem do array.
    assert.equal(contrato.modulos[0].titulo, 'Conceitos básicos')
    assert.equal(contrato.modulos[1].titulo, 'Equipamentos de proteção')
    assert.equal(contrato.modulos[0].aulas.length, 1)
    assert.match(contrato.modulos[1].aulas[0].descricao, /Inspeção antes do uso/)
})

test('adaptador fallback cobre resposta vazia sem quebrar o contrato', () => {
    const contrato = adaptarSaidaTutor({}, 'Palestra sobre EPI')
    assert.equal(contrato.titulo, 'Curso de Palestra sobre EPI')
    assert.equal(contrato.modulos.length, 1)
    assert.equal(validarContratoTutor(contrato).valido, true)
})

test('validação barra saída inválida antes de gravar no banco', () => {
    assert.equal(validarContratoTutor(adaptarSaidaTutor(OUTLINE_NATIVO)).valido, true)

    const invalido = validarContratoTutor({ titulo: '', modulos: [] })
    assert.equal(invalido.valido, false)
    assert.ok(invalido.erros.includes('título inválido'))
    assert.ok(invalido.erros.includes('módulos inválidos'))

    const semAulas = validarContratoTutor({
        titulo: 'Curso', descricao: 'Descrição', publicoAlvo: 'Alunos',
        objetivos: ['Objetivo'], modulos: [{ titulo: 'Módulo', descricao: 'D', aulas: [] }]
    })
    assert.equal(semAulas.valido, false)
})

test('rascunho gravado tem proveniência e nenhum segredo', () => {
    const contrato = adaptarSaidaTutor(OUTLINE_NATIVO, 'Curso NR 35')
    const rascunho = conteudoParaRascunho(contrato, {
        jobId: 'job-123',
        tipo: TIPOS_TUTOR.CURSO,
        nrs: extrairNRsDoAssunto('Curso NR 35')
    })

    assert.equal(rascunho.origem, 'TUTOR_SULSAFE')
    assert.equal(rascunho.job_id, 'job-123')
    assert.deepEqual(rascunho.nrs_referenciadas, [35])
    assert.equal(rascunho.modulos.length, 2)
    assert.doesNotMatch(JSON.stringify(rascunho), /api[_-]?key|prompt_base|Bearer/i)
    assert.throws(() => conteudoParaRascunho({ titulo: '' }), /Saída inválida/)
})
