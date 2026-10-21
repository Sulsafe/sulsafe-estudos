import fs from 'node:fs'
import path from 'node:path'

const arquivos = []

function percorrer(diretorio) {
    for (const item of fs.readdirSync(diretorio, { withFileTypes: true })) {
        const caminho = path.join(diretorio, item.name)

        if (item.isDirectory()) {
            percorrer(caminho)
        } else if (caminho.endsWith('.js')) {
            arquivos.push(caminho)
        }
    }
}

function nomesExportados(codigo) {
    const nomes = new Set()

    const declaracoes =
        /\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g

    for (const m of codigo.matchAll(declaracoes)) {
        nomes.add(m[1])
    }

    const blocosExport =
        /\bexport\s*\{([^}]+)\}/g

    for (const m of codigo.matchAll(blocosExport)) {
        for (const item of m[1].split(',')) {
            const partes = item.trim().split(/\s+as\s+/)
            if (partes[0]) nomes.add(partes[0].trim())
        }
    }

    return nomes
}

percorrer('js')

let problemas = 0

for (const arquivo of arquivos) {
    const codigo = fs.readFileSync(arquivo, 'utf8')

    const imports =
        /\bimport\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g

    for (const m of codigo.matchAll(imports)) {
        const caminhoImportado = m[2]

        if (!caminhoImportado.startsWith('.')) continue

        const destino = path.resolve(
            path.dirname(arquivo),
            caminhoImportado
        )

        if (!fs.existsSync(destino)) {
            console.log(`ARQUIVO AUSENTE: ${arquivo} -> ${caminhoImportado}`)
            problemas++
            continue
        }

        const codigoDestino = fs.readFileSync(destino, 'utf8')
        const exports = nomesExportados(codigoDestino)

        for (const item of m[1].split(',')) {
            const partes = item.trim().split(/\s+as\s+/)
            const nomeImportado = partes[0]?.trim()

            if (nomeImportado && !exports.has(nomeImportado)) {
                console.log(
                    `EXPORT INEXISTENTE: ${arquivo} importa ${nomeImportado} de ${caminhoImportado}`
                )
                problemas++
            }
        }
    }
}

console.log(`\nArquivos JavaScript analisados: ${arquivos.length}`)
console.log(`Possíveis problemas reais: ${problemas}`)