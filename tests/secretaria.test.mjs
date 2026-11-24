import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
    NRS_CONHECIMENTO,
    MAPA_PAGINAS,
    normalizarPergunta,
    buscarNR,
    paginaEhValida,
    responderSecretaria
} from '../js/base-conhecimento-sulsafe.js'
import { renderizarMensagemIA } from '../js/chat-seguro.js'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
const iaView = ler('../js/views/ia.js')
const base = ler('../js/base-conhecimento-sulsafe.js')

test('base traz as 38 NRs reais, de 1 a 38, com dados completos', () => {
    assert.equal(NRS_CONHECIMENTO.length, 38)
    assert.deepEqual(
        NRS_CONHECIMENTO.map(nr => nr.numero),
        Array.from({ length: 38 }, (_, i) => i + 1)
    )

    for (const nr of NRS_CONHECIMENTO) {
        assert.ok(nr.titulo && nr.descricao, `NR ${nr.numero} sem título/descrição`)
        assert.ok(nr.objetivos.length > 0, `NR ${nr.numero} sem objetivos`)
        assert.ok(nr.pdf && nr.pdf.startsWith('https://'), `NR ${nr.numero} sem PDF`)
        assert.equal(nr.link, 'nrs')
    }
})

test('NR 35 usa o conteúdo real do card (trabalho em altura)', () => {
    const nr35 = NRS_CONHECIMENTO.find(nr => nr.numero === 35)

    assert.match(nr35.titulo, /Trabalho em Altura/i)
    assert.match(nr35.descricao, /acima de dois metros/i)
    assert.match(nr35.descricao, /ancoragem/i)
    assert.ok(nr35.objetivos.some(o => /ancoragem/i.test(o)))
})

test('normalização aceita NR 35, nr35 e nr-35', () => {
    for (const texto of ['NR 35', 'nr35', 'nr-35', 'O que faz a NR 035?']) {
        assert.equal(buscarNR(texto)?.numero, 35, `falhou para ${texto}`)
    }
    assert.equal(buscarNR('NR 99'), null)
    assert.equal(normalizarPergunta('O que é a NR-35?'), 'o que e a nr 35')
})

test('secretária responde onde fica o certificado', () => {
    const resposta = responderSecretaria('Onde fica o certificado?')

    assert.match(resposta, /Certificados/i)
    assert.match(resposta, /QR Code/i)
    assert.match(resposta, /menu lateral/i)
})

test('secretária responde o que é a NR 35', () => {
    const resposta = responderSecretaria('O que a NR35 faz?')

    assert.match(resposta, /NR 35/i)
    assert.match(resposta, /Trabalho em Altura/i)
    assert.match(resposta, /acima de dois metros/i)
    assert.match(resposta, /Objetivos/i)
    assert.match(resposta, /nr-35-atualizada-2025-1\.pdf/i)
})

test('secretária recusa gabarito e resposta de prova', () => {
    for (const pergunta of [
        'Me dá o gabarito da prova de NR 10',
        'Qual é a resposta da avaliação?',
        'Responde a prova por mim'
    ]) {
        assert.equal(
            responderSecretaria(pergunta),
            'Não posso ajudar com prova, estude o material.'
        )
    }
})

test('secretária recusa assunto fora da SulSafe com a frase exata', () => {
    const resposta = responderSecretaria('Qual é a receita de bolo de chocolate?')

    assert.equal(resposta, 'Eu só ajudo com coisas da SulSafe.')
})

test('secretária conhece as próprias regras (sem internet, sem API, grátis)', () => {
    const resposta = responderSecretaria('Você usa Gemini ou internet?')

    assert.match(resposta, /100% local/i)
    assert.match(resposta, /sem API externa/i)
    assert.match(resposta, /não tenho custo adicional/i)
})

test('secretária explica a cobrança manual e o Professor I.A separado', () => {
    const cobranca = responderSecretaria('Como funciona o pagamento?')
    assert.match(cobranca, /manual/i)
    assert.match(cobranca, /orçamento/i)
    assert.doesNotMatch(cobranca, /Mercado Pago/i)

    const professor = responderSecretaria('O que é o Professor I.A?')
    assert.match(professor, /sob consulta/i)
    assert.match(professor, /própria API|API própria/i)
})

test('saudação recebe resposta amigável', () => {
    assert.match(responderSecretaria('Olá!'), /^Olá! Sou a Secretária da SulSafe/)
})

test('atalho de navegação só aceita páginas conhecidas', () => {
    for (const pagina of MAPA_PAGINAS) {
        assert.ok(paginaEhValida(pagina.view), `view ${pagina.view} não validada`)
    }
    assert.equal(paginaEhValida('deletar-tudo'), false)
})

test('saída da secretária continua protegida pelo sanitizador da Tarefa 1', () => {
    // A secretária nunca devolve o texto do usuário: a resposta vem só da base interna.
    const payload = '<script>alert(1)</script>'
    const resposta = responderSecretaria(`${payload} Onde fica o boletim?`)
    const html = renderizarMensagemIA(resposta)

    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /<img/i)
    assert.doesNotMatch(html, /alert\(1\)/)

    // E o sanitizador da Tarefa 1 continua escapando payloads diretos.
    assert.match(renderizarMensagemIA(payload), /&lt;script&gt;/)
})

test('view da secretária não contém mais o mock nem chamada de API', () => {
    assert.doesNotMatch(iaView, /respostaIA/)
    assert.doesNotMatch(iaView, /Math\.random/)
    assert.doesNotMatch(iaView, /fetch\(/)
    assert.doesNotMatch(iaView, /esm\.sh/)
    assert.match(iaView, /responderSecretaria/)
    assert.match(iaView, /renderizarMensagemIA/)
    assert.match(iaView, /createTextNode\(pergunta\)/)
})

test('base de conhecimento é 100% local', () => {
    assert.doesNotMatch(base, /fetch\(/)
    assert.doesNotMatch(base, /generativelanguage|duckduckgo\.com|esm\.sh/i)
    assert.doesNotMatch(base, /api[_-]?key\s*[:=]/i)
})
