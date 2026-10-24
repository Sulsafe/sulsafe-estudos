import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import {
    criarCertificadoPDF,
    montarDadosCertificado
} from '../js/certificado-pdf.js'

const require = createRequire(import.meta.url)
const pdfLib = require('pdf-lib')
const imagemBytes = fs.readFileSync(
    new URL('../certificado-base.png', import.meta.url)
)

test('certificado gera frente e verso com os dados reais do aluno', async () => {
    const { pdfDoc, dados } = await criarCertificadoPDF(
        {
            nome_completo: 'Maria Eduarda de Oliveira',
            cpf: '52998224725'
        },
        {
            nr_id: 35,
            nome: 'Trabalho em Altura',
            carga_horaria: 8,
            periodoInicio: '2026-10-01',
            periodoFim: '2026-10-23',
            conteudoProgramatico: ['Tópico 1', 'Tópico 2']
        },
        {
            pdfLib,
            imagemBytes,
            codigo: 'SS-2026-000123',
            nota: 9.5,
            dataConclusao: '2026-10-23'
        }
    )

    assert.equal(pdfDoc.getPageCount(), 2)
    assert.deepEqual(pdfDoc.getPage(0).getSize(), { width: 1228, height: 864 })
    assert.deepEqual(pdfDoc.getPage(1).getSize(), { width: 1228, height: 864 })

    assert.equal(dados.curso.nome, 'NR-35 - Trabalho em Altura')
    assert.equal(dados.curso.periodoInicio, '01/10/2026')
    assert.equal(dados.curso.periodoFim, '23/10/2026')
    assert.equal(dados.aluno.cpf, '529.982.247-25')
    assert.equal(dados.certificado.codigo, 'SS-2026-000123')
})

test('certificado não quebra com textos longos e caracteres especiais', async () => {
    const { pdfBytes, dados } = await criarCertificadoPDF(
        { nome_completo: 'Ana 😀 “Teste” — Ção' },
        {
            nr_id: 99,
            nome: 'Curso — “Especial” com um título bastante longo para reduzir a fonte',
            carga_horaria: 0,
            conteudoProgramatico: 'Tópico um; Tópico dois; Tópico três'
        },
        { pdfLib, imagemBytes, dataConclusao: null }
    )

    assert.ok(pdfBytes.length > 0)
    assert.equal(dados.curso.cargaHoraria, null)
    assert.equal(dados.certificado.dataConclusao, '')
    assert.deepEqual(dados.curso.conteudoProgramatico, [
        'Tópico um',
        'Tópico dois',
        'Tópico três'
    ])
})

test('montarDadosCertificado preserva código, nota e data de emissão', () => {
    const dados = montarDadosCertificado({
        certificado: {
            nr_id: 11,
            codigo: 'ABC123',
            nota: 8.5,
            carga_horaria: 4,
            criado_em: '2026-10-20T10:00:00Z'
        },
        aluno: { nome_completo: 'José', cpf: '11144477735' },
        instrutor: { nome_completo: 'Instrutor Teste' },
        nr: { n: 11, nome: 'Movimentação e Armazenagem de Cargas' }
    })

    assert.equal(dados.curso.nr_id, 11)
    assert.equal(dados.curso.nome, 'Movimentação e Armazenagem de Cargas')
    assert.equal(dados.curso.carga_horaria, 4)
    assert.equal(dados.opcoes.codigo, 'ABC123')
    assert.equal(dados.opcoes.nota, 8.5)
    assert.equal(dados.aluno.cpf, '11144477735')
    assert.equal(dados.opcoes.instrutor.nome_completo, 'Instrutor Teste')
})
