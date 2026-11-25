// ============================================================
// FASE 5 — ETAPA 8/8: EXPORTAÇÃO CSV E VARREDURA FINAL
// ============================================================
// TDD: botão no painel, CSV compatível com Excel brasileiro
// (BOM UTF-8, separador ;, cabeçalhos pt-BR, escape e anti-fórmula)
// e nenhum segredo hardcoded no código que será publicado.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ler = caminho => {
    try {
        return fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
    } catch {
        return ''
    }
}

const ui = ler('../js/views/provas-resultados-ia.js')
const modulo = ler('../js/exportar-resultados-ia.js')
const cliente = ler('../js/supabase-client.js')

function arquivosPublicaveis() {
    const raiz = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
    const pastas = ['js', 'api', path.join('supabase', 'functions')]
    const encontrados = []

    const caminhar = (diretorio) => {
        if (!fs.existsSync(diretorio)) return
        for (const entrada of fs.readdirSync(diretorio, { withFileTypes: true })) {
            if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
            const completo = path.join(diretorio, entrada.name)
            if (entrada.isDirectory()) caminhar(completo)
            else if (/\.(js|mjs|ts)$/.test(entrada.name)) encontrados.push(completo)
        }
    }

    for (const pasta of pastas) caminhar(path.join(raiz, pasta))
    return encontrados
}

// ------------------------------------------------------------
// 1. Garantias estáticas da exportação
// ------------------------------------------------------------

test('painel da Etapa 7 ganha botão Exportar Resultados ligado ao gerador de CSV', () => {
    assert.match(ui, /Exportar Resultados/)
    assert.match(ui, /exportarResultadosIA/)
    assert.match(ui, /exportarResultadosCSVIA/)
    assert.match(ui, /sbListarResultadosProvaIA/)
    assert.match(ui, /disabled/, 'botão deve evitar exportações concorrentes')
    assert.ok(modulo.length > 300, 'módulo exportador deve existir')

    assert.match(modulo, /\\uFEFF/, 'CSV precisa de BOM UTF-8 explícito')
    assert.match(modulo, /['"]text\/csv;charset=utf-8['"]/i)
    assert.match(modulo, /createObjectURL/)
    assert.match(modulo, /revokeObjectURL/)
    assert.match(modulo, /\.download\s*=/)
    for (const cabecalho of ['Nome', 'Status', 'Nota', 'Data de Conclusão']) {
        assert.ok(modulo.includes(cabecalho), `cabeçalho pt-BR ausente: ${cabecalho}`)
    }
})

// ------------------------------------------------------------
// 2. Comportamento do CSV
// ------------------------------------------------------------

test('CSV sai com BOM, separador ; e cabeçalhos em português', async () => {
    const { csvResultadosIA } = await import('../js/exportar-resultados-ia.js')
    const csv = csvResultadosIA([{
        nome_completo: 'Aluno A1',
        status: 'CONCLUIDA',
        nota: 7.8,
        concluido_em: '2026-11-25T12:00:00Z'
    }])

    const linhas = csv.slice(1).split('\r\n')
    assert.ok(csv.startsWith('\uFEFF'))
    assert.equal(linhas[0], 'Nome;Status;Nota;Data de Conclusão')
    assert.equal(linhas[1], 'Aluno A1;CONCLUIDA;7,80;25/11/2026')
})

test('CSV escapa acentos, aspas, ponto e vírgula e neutraliza fórmulas do Excel', async () => {
    const { csvResultadosIA } = await import('../js/exportar-resultados-ia.js')
    const csv = csvResultadosIA([
        {
            nome_completo: 'Álvares; "João"\nSilva',
            status: '=CMD()',
            nota: null,
            concluido_em: null
        },
        { nome_completo: '@aluno', status: 'PENDENTE', nota: 0, concluido_em: '' }
    ])

    const linhas = csv.slice(1).split('\r\n')
    assert.equal(linhas[1], '"Álvares; ""João""\nSilva";\'=CMD();;')
    assert.equal(linhas[2], "'@aluno;PENDENTE;0,00;")

    const perigosos = ['=1+1', '+1+1', '-1+1', '@SUM(1)', '\t=1']
    const csvPerigoso = csvResultadosIA(perigosos.map(nome => ({ nome_completo: nome })))
    for (const linha of csvPerigoso.slice(1).split('\r\n').slice(1)) {
        assert.ok(linha.startsWith("'"), `valor iniciado por fórmula precisa ser neutralizado: ${linha}`)
    }
})

test('download usa Blob CSV, nome seguro e libera a URL temporária', async () => {
    const { exportarResultadosCSVIA } = await import('../js/exportar-resultados-ia.js')
    const originalDocument = globalThis.document
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    const originalTimeout = globalThis.setTimeout

    const clique = []
    const anexado = []
    const removido = []
    const revogado = []
    const blobs = []
    const link = {
        click: () => clique.push(true),
        remove: () => removido.push(true)
    }

    try {
        globalThis.document = {
            createElement: () => link,
            body: { appendChild: () => anexado.push(true) }
        }
        URL.createObjectURL = blob => {
            blobs.push(blob)
            return 'blob:teste'
        }
        URL.revokeObjectURL = url => revogado.push(url)
        globalThis.setTimeout = (fn) => {
            fn()
            return 0
        }

        const nome = exportarResultadosCSVIA(
            [{ nome_completo: 'Aluno', status: 'CONCLUIDA', nota: 5, concluido_em: '' }],
            'id/../../perigoso?'
        )

        assert.match(nome, /^resultados-prova-idperigoso-\d{4}-\d{2}-\d{2}\.csv$/)
        assert.equal(clique.length, 1)
        assert.equal(anexado.length, 1)
        assert.equal(removido.length, 1)
        assert.deepEqual(revogado, ['blob:teste'])
        assert.equal(blobs[0].type, 'text/csv;charset=utf-8')
        assert.equal(link.download, nome)
    } finally {
        globalThis.document = originalDocument
        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
        globalThis.setTimeout = originalTimeout
    }
})

// ------------------------------------------------------------
// 3. Varredura final de segredos
// ------------------------------------------------------------

test('código publicável não contém chaves de API, tokens ou senhas hardcoded', () => {
    const arquivos = arquivosPublicaveis()
    assert.ok(arquivos.length >= 20, 'varredura precisa cobrir js/, api/ e supabase/functions/')

    const atribuicaoSecreta = /(?:const|let|var)\s+([A-Z0-9_]*?(?:KEY|TOKEN|SECRET|SENHA|PASSWORD)[A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/gi
    const provedor = /(?:sk-(?:proj-|live-|ant-)?|AIza)[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/
    const senhaLiteral = /^[ \t]*(?:const|let|var)?\s*(?:senha|password)\s*[:=]\s*['"][^'"]+['"]/im

    const achados = []
    for (const arquivo of arquivos) {
        const codigo = fs.readFileSync(arquivo, 'utf8')
        for (const combinacao of codigo.matchAll(atribuicaoSecreta)) {
            const nome = combinacao[1]
            const valor = combinacao[2]
            // A chave anônima do Supabase é pública por desenho; a de serviço nunca aparece no front.
            if (/ANON/i.test(nome) || /^vault:/i.test(valor)) continue
            achados.push(`${path.relative(new URL('../', import.meta.url).pathname, arquivo)}: literal em ${nome}`)
        }
        if (provedor.test(codigo)) achados.push(`${path.basename(arquivo)}: chave de provedor`)
        if (senhaLiteral.test(codigo)) achados.push(`${path.basename(arquivo)}: senha literal`)
    }

    assert.deepEqual(achados, [])
    assert.match(cliente, /SUPABASE_ANON_KEY/)
    assert.doesNotMatch(cliente, /service_role|SERVICE_ROLE/i)
})
