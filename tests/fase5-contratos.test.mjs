import test from 'node:test'
import assert from 'node:assert/strict'
import {
    validarSaidaIA,
    provaComQuestoesSchema,
    moduloSchema,
    palestraSchema,
    TIPOS_FASE5
} from '../js/tutor-contratos-fase5.js'

function questao(resposta = 'A') {
    return {
        enunciado: 'Qual alternativa está correta?',
        alternativas: [
            { chave: 'A', texto: 'Primeira' },
            { chave: 'B', texto: 'Segunda' },
            { chave: 'C', texto: 'Terceira' }
        ],
        resposta_correta: resposta,
        justificativa: 'A NR 35 exige proteção contra quedas.'
    }
}

function prova(quantidade = 10) {
    return {
        titulo: 'Prova NR-35',
        descricao: 'Avaliação de trabalho em altura.',
        nr_id: 35,
        questoes: Array.from({ length: quantidade }, (_, indice) => ({
            ...questao(indice % 2 === 0 ? 'A' : 'B'),
            enunciado: `Questão ${indice + 1}`
        }))
    }
}

test('tipos da Fase 5 são explícitos', () => {
    assert.deepEqual([...TIPOS_FASE5], ['PROVA', 'MODULO', 'PALESTRA'])
})

test('schema de prova aceita 10 questões e normaliza gabarito e peso', () => {
    const dados = prova(10)
    dados.questoes[0].resposta_correta = 'a'
    delete dados.questoes[0].peso

    const resultado = provaComQuestoesSchema(10).safeParse(dados)

    assert.equal(resultado.success, true, JSON.stringify(resultado.error?.issues))
    assert.equal(resultado.data.questoes.length, 10)
    assert.equal(resultado.data.questoes[0].resposta_correta, 'A')
    assert.equal(resultado.data.questoes[0].peso, 1)
})

test('schema de prova rejeita gabarito fora das alternativas em pt-BR', () => {
    const dados = prova(1)
    dados.questoes[0].resposta_correta = 'D'

    const resultado = provaComQuestoesSchema(1).safeParse(dados)

    assert.equal(resultado.success, false)
    const mensagens = resultado.error.issues.map(issue => issue.message).join(' ')
    assert.match(mensagens, /gabarito deve ser uma das alternativas/i)
})

test('schema de prova rejeita chaves repetidas e quantidade diferente da pedida', () => {
    const duplicadas = prova(1)
    duplicadas.questoes[0].alternativas[1].chave = 'A'

    const resultadoDuplicadas = validarSaidaIA('PROVA', duplicadas, { quantidadeQuestoes: 1 })
    assert.equal(resultadoDuplicadas.sucesso, false)
    assert.match(resultadoDuplicadas.erros.join(' '), /chaves de alternativas repetidas/i)

    const resultadoNove = validarSaidaIA('PROVA', prova(9), { quantidadeQuestoes: 10 })
    assert.equal(resultadoNove.sucesso, false)
    assert.match(resultadoNove.erros.join(' '), /exatamente 10/i)
})

test('schema de módulo exige aulas e objetivos e rejeita campos extras', () => {
    const dados = {
        titulo: 'Fundamentos da NR-35',
        descricao: 'Conceitos básicos.',
        publicoAlvo: 'Novos colaboradores',
        objetivos: ['Entender a aplicação da norma'],
        aulas: [
            { titulo: 'Aplicação', descricao: 'Onde a norma vale.' },
            { titulo: 'Responsabilidades', descricao: 'Deveres do empregador.' }
        ]
    }

    const resultado = validarSaidaIA('MODULO', dados)
    assert.equal(resultado.sucesso, true, JSON.stringify(resultado.erros))
    assert.equal(resultado.dados.aulas[0].ordem, 0)

    const semAulas = validarSaidaIA('MODULO', { ...dados, aulas: [] })
    assert.equal(semAulas.sucesso, false)

    const comExtra = validarSaidaIA('MODULO', { ...dados, campoIntruso: 'x' })
    assert.equal(comExtra.sucesso, false)
    assert.match(comExtra.erros.join(' '), /campo\(s\) não permitido\(s\): campoIntruso/i)
})

test('schema de palestra valida roteiro e duração', () => {
    const resultado = palestraSchema.safeParse({
        titulo: 'Palestra NR-35',
        duracao_min: 45,
        roteiro: [{ bloco: 'Abertura', minutos: 5, conteudo: 'Boas-vindas e contexto.' }]
    })

    assert.equal(resultado.success, true, JSON.stringify(resultado.error?.issues))
})

test('validarSaidaIA devolve dados limpos ou erros pt-BR com caminho', () => {
    const ok = validarSaidaIA('PROVA', prova(2), { quantidadeQuestoes: 2 })
    assert.equal(ok.sucesso, true)
    assert.equal(ok.dados.questoes.length, 2)

    const ruim = validarSaidaIA('PROVA', {
        titulo: 'Prova',
        questoes: [{
            enunciado: 'Q1',
            alternativas: [{ chave: 'X', texto: 'Errada' }],
            resposta_correta: 'Z'
        }]
    }, { quantidadeQuestoes: 1 })

    assert.equal(ruim.sucesso, false)
    assert.ok(ruim.erros.length >= 1)
    assert.ok(ruim.erros.every(erro => typeof erro === 'string' && erro.includes(':')))
    assert.match(ruim.erros.join(' '), /alternativas|gabarito|Use A, B, C, D ou E/i)

    const tipoInvalido = validarSaidaIA('QUIZ', prova(1))
    assert.equal(tipoInvalido.sucesso, false)
    assert.match(tipoInvalido.erros[0], /Tipo de I.A. não suportado/i)
})
