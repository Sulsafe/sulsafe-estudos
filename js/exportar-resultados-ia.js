// ============================================================
// EXPORTADOR DE RESULTADOS — FASE 5, ETAPA 8
// ============================================================
// Gera CSV no padrão do Excel brasileiro: BOM UTF-8, separador ;
// e vírgula decimal. Nenhum dado é enviado para fora do navegador.
// ============================================================

const BOM = '\uFEFF'
const CABECALHOS = ['Nome', 'Status', 'Nota', 'Data de Conclusão']
const INICIO_FORMULA = /^[=+\-@\t\r]/
const ESPECIAL_CSV = /[";\r\n]/

function campoCSV(valor) {
    let texto = String(valor ?? '')
    // Excel interpretaria =, +, -, @ e tab como fórmula: neutraliza com apóstrofo.
    if (INICIO_FORMULA.test(texto)) texto = `'${texto}`
    return ESPECIAL_CSV.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function notaCSV(nota) {
    if (nota === null || nota === undefined || nota === '') return ''
    const numero = Number(nota)
    return Number.isFinite(numero) ? numero.toFixed(2).replace('.', ',') : ''
}

function dataCSV(valor) {
    if (!valor) return ''
    const data = new Date(valor)
    if (Number.isNaN(data.getTime())) return ''
    const dia = String(data.getUTCDate()).padStart(2, '0')
    const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
    const ano = String(data.getUTCFullYear())
    return `${dia}/${mes}/${ano}`
}

/** Texto CSV completo, começando pelo BOM UTF-8. */
export function csvResultadosIA(itens) {
    const linhas = [CABECALHOS.map(campoCSV).join(';')]

    for (const item of Array.isArray(itens) ? itens : []) {
        linhas.push([
            item?.nome_completo ?? '',
            item?.status ?? '',
            notaCSV(item?.nota),
            dataCSV(item?.concluido_em)
        ].map(campoCSV).join(';'))
    }

    return BOM + linhas.join('\r\n')
}

/** Nome de arquivo previsível e sem caractere controlado pelo servidor. */
export function nomeArquivoResultadosIA(provaId, data = new Date()) {
    const id = String(provaId ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 48) || 'geral'
    return `resultados-prova-${id}-${data.toISOString().slice(0, 10)}.csv`
}

/** Dispara o download local; retorna o nome do arquivo gerado. */
export function exportarResultadosCSVIA(itens, provaId) {
    const csv = csvResultadosIA(itens)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = nomeArquivoResultadosIA(provaId)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    return link.download
}
