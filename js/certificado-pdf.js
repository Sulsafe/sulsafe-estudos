// ============================================================
// GERADOR DE CERTIFICADO EM PDF
// ============================================================
// Dependência: pdf-lib
// No navegador ela é carregada via esm.sh; no Node pode ser
// injetada em opcoes.pdfLib para testes.
//
// O arquivo certificado.png deve estar na raiz do site.
// A imagem tem 1228x864 px e a página do PDF usa a mesma
// proporção, então as coordenadas abaixo podem ser ajustadas
// diretamente em pixels da imagem.
//
// Dados esperados (colunas do Supabase):
// - public.certificados:
//     id, usuario_id, nr_id, codigo, nota, carga_horaria,
//     emitido_por, criado_em, revogado
// - public.profiles (aluno):
//     id, nome_completo, email, cpf, foto_url
// - public.profiles (instrutor, via certificados.emitido_por):
//     id, nome_completo
// - js/state.js (NRS):
//     n -> nome do curso/NR
//
// profiles.cpf foi adicionada pela migration
// 20261023000000_certificados_cpf_revogado.sql. A função
// aceita aluno.cpf e usa "-" quando ele não é informado.
// ============================================================

const PDF_LIB_URL = 'https://esm.sh/pdf-lib@1.17.1'
const IMAGEM_CERTIFICADO_URL = new URL('../certificado.png', import.meta.url)

const LARGURA_PAGINA = 1228
const ALTURA_PAGINA = 864

// ============================================================
// COORDENADAS
// ============================================================
// x/y em pontos PDF, com origem no canto inferior esquerdo.
// Para alinhar o texto ao layout visual, ajuste os valores
// abaixo. O campo debugCoordenadas desenha cruzes vermelhas
// em cada posição para facilitar o alinhamento.
// ============================================================

export const POSICOES_CERTIFICADO = {
    frente: {
        certificamos: { x: 614, y: 512, size: 14, maxWidth: 900 },
        nome: { x: 614, y: 470, size: 30, maxWidth: 940 },
        cpf: { x: 614, y: 432, size: 12, maxWidth: 900 },
        curso: { x: 614, y: 382, size: 18, maxWidth: 940 },
        cargaHoraria: { x: 614, y: 346, size: 12, maxWidth: 900 },
        dataConclusao: { x: 614, y: 320, size: 12, maxWidth: 900 },
        foto: { x: 125, y: 400, width: 110, height: 140 },
        instrutor: { x: 614, y: 150, size: 12, maxWidth: 500 },
        codigo: { x: 1120, y: 58, size: 9, maxWidth: 420, align: 'right' }
    },
    verso: {
        margem: 90,
        topo: 760
    }
}

const CONTEUDO_PADRAO = [
    'Introdução, objetivos e campo de aplicação da norma.',
    'Identificação de riscos e medidas de prevenção.',
    'Procedimentos operacionais e uso de equipamentos de proteção.',
    'Responsabilidades, documentação e legislação aplicável.',
    'Avaliação de aprendizagem e encerramento.'
]

// ============================================================
// HELPERS DE DADOS
// ============================================================

function formatarCpf(valor) {
    const digitos = String(valor || '').replace(/\D/g, '')
    if (digitos.length !== 11) return String(valor || '').trim()
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

function formatarData(valor) {
    if (!valor) return '-'
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        const [ano, mes, dia] = valor.split('-')
        return `${dia}/${mes}/${ano}`
    }
    const data = valor instanceof Date ? valor : new Date(valor)
    if (Number.isNaN(data.getTime())) return String(valor)
    return data.toLocaleDateString('pt-BR')
}

function normalizarLista(valor, padrao) {
    if (Array.isArray(valor)) {
        const itens = valor.map(item => String(item || '').trim()).filter(Boolean)
        if (itens.length) return itens
    }
    if (typeof valor === 'string' && valor.trim()) {
        const itens = valor
            .split(/\r?\n|;/)
            .map(item => item.trim())
            .filter(Boolean)
        if (itens.length) return itens
    }
    return padrao
}

function normasPadrao(nrId, nomeCurso) {
    const nr = nrId ? `NR-${String(nrId).padStart(2, '0')}` : null
    return [
        nr ? `${nr} - ${nomeCurso}` : 'Normas Regulamentadoras de Segurança e Saúde no Trabalho',
        'Portaria MTP nº 672/2021 e atualizações',
        'CLT, art. 157 a 163',
        'Legislação federal aplicável'
    ].filter(Boolean)
}

function normalizarDados(aluno = {}, curso = {}, opcoes = {}) {
    const nrId = curso?.nr_id ?? curso?.n ?? curso?.id ?? null
    const nomeCurso = curso?.nome || curso?.titulo ||
        (nrId ? `NR-${String(nrId).padStart(2, '0')}` : 'Curso SulSafe')

    const instrutor = opcoes?.instrutor || curso?.instrutor || null
    const nomeInstrutor = instrutor?.nome_completo || instrutor?.nome ||
        opcoes?.instrutorNome || curso?.instrutor_nome || 'Instrutor SulSafe'

    const cargaHoraria = Number(
        curso?.carga_horaria ?? opcoes?.cargaHoraria ?? 40
    )

    return {
        aluno: {
            nome: aluno?.nome_completo || aluno?.nome || 'Aluno SulSafe',
            cpf: formatarCpf(aluno?.cpf) || '-',
            email: aluno?.email || '',
            fotoUrl: aluno?.foto_url || aluno?.fotoUrl || opcoes?.fotoUrl || null,
            fotoBytes: aluno?.fotoBytes || opcoes?.fotoBytes || null
        },
        curso: {
            nrId,
            nome: nomeCurso,
            cargaHoraria: Number.isFinite(cargaHoraria) ? cargaHoraria : 40,
            conteudoProgramatico: normalizarLista(
                curso?.conteudoProgramatico || curso?.conteudo_programatico || opcoes?.conteudoProgramatico,
                CONTEUDO_PADRAO
            ),
            normas: normalizarLista(
                curso?.normas || opcoes?.normas,
                normasPadrao(nrId, nomeCurso)
            )
        },
        certificado: {
            codigo: opcoes?.codigo || curso?.codigo || '',
            nota: opcoes?.nota ?? curso?.nota ?? null,
            dataConclusao: formatarData(
                opcoes?.dataConclusao ||
                opcoes?.emitidoEm ||
                curso?.data_conclusao ||
                curso?.criado_em ||
                new Date()
            )
        },
        instrutor: {
            nome: nomeInstrutor,
            cargo: opcoes?.instrutorCargo || 'Instrutor de Segurança do Trabalho'
        }
    }
}

/**
 * Monta os objetos `aluno`, `curso` e `opcoes` a partir das
 * linhas do Supabase, prontos para gerarCertificadoPDF().
 *
 * @param {object} params
 * @param {object} params.certificado Linha de public.certificados.
 * @param {object} params.aluno Linha de public.profiles do aluno.
 * @param {object} [params.instrutor] Linha de public.profiles do instrutor.
 * @param {object} [params.nr] Item de NRS (js/state.js).
 * @param {string[]|string} [params.conteudoProgramatico]
 * @param {string[]|string} [params.normas]
 */
export function montarDadosCertificado({
    certificado,
    aluno,
    instrutor,
    nr,
    conteudoProgramatico,
    normas
} = {}) {
    const nrId = certificado?.nr_id ?? nr?.n ?? nr?.id ?? null
    const nomeNr = nr?.nome || nr?.nm ||
        (nrId ? `NR-${String(nrId).padStart(2, '0')}` : 'Curso SulSafe')

    return {
        aluno: {
            nome_completo: aluno?.nome_completo || aluno?.nome || 'Aluno SulSafe',
            cpf: aluno?.cpf || '',
            email: aluno?.email || '',
            foto_url: aluno?.foto_url || aluno?.fotoUrl || '',
            fotoBytes: aluno?.fotoBytes || null
        },
        curso: {
            nr_id: nrId,
            nome: nomeNr,
            carga_horaria: Number(certificado?.carga_horaria ?? 40),
            conteudoProgramatico,
            normas
        },
        opcoes: {
            codigo: certificado?.codigo || '',
            nota: certificado?.nota ?? null,
            dataConclusao: certificado?.criado_em || new Date(),
            instrutor: instrutor
                ? { nome_completo: instrutor.nome_completo || instrutor.nome || '' }
                : undefined
        }
    }
}

// ============================================================
// HELPERS DE DESENHO
// ============================================================

function quebrarTexto(texto, font, size, maxWidth) {
    const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean)
    if (!palavras.length) return ['']

    const linhas = []
    let atual = ''

    for (const palavra of palavras) {
        const teste = atual ? `${atual} ${palavra}` : palavra
        if (!atual || font.widthOfTextAtSize(teste, size) <= maxWidth) {
            atual = teste
        } else {
            linhas.push(atual)
            atual = palavra
        }
    }

    if (atual) linhas.push(atual)
    return linhas
}

function desenharCentralizado(page, texto, pos, font, color) {
    const linhas = quebrarTexto(texto, font, pos.size, pos.maxWidth || 900)
    const alturaLinha = pos.size * 1.25
    let y = pos.y

    for (const linha of linhas) {
        const largura = font.widthOfTextAtSize(linha, pos.size)
        page.drawText(linha, {
            x: pos.x - largura / 2,
            y,
            size: pos.size,
            font,
            color
        })
        y -= alturaLinha
    }

    return y
}

function desenharTextoDireita(page, texto, pos, font, color) {
    const linhas = quebrarTexto(texto, font, pos.size, pos.maxWidth || 420)
    let y = pos.y

    for (const linha of linhas) {
        const largura = font.widthOfTextAtSize(linha, pos.size)
        page.drawText(linha, {
            x: pos.x - largura,
            y,
            size: pos.size,
            font,
            color
        })
        y -= pos.size * 1.25
    }

    return y
}

function desenharGuia(page, posicoes, font, color) {
    for (const [campo, pos] of Object.entries(posicoes)) {
        if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) continue

        page.drawLine({
            start: { x: pos.x - 10, y: pos.y },
            end: { x: pos.x + 10, y: pos.y },
            thickness: 0.6,
            color
        })
        page.drawLine({
            start: { x: pos.x, y: pos.y - 10 },
            end: { x: pos.x, y: pos.y + 10 },
            thickness: 0.6,
            color
        })
        page.drawText(campo, {
            x: pos.x + 12,
            y: pos.y + 4,
            size: 7,
            font,
            color
        })
    }
}

// ============================================================
// FRENTE
// ============================================================

function desenharFoto(page, fotoImagem, pos, cores) {
    if (!fotoImagem || !pos) return

    const dimensoes = fotoImagem.scale(1)
    const escala = Math.min(pos.width / dimensoes.width, pos.height / dimensoes.height)
    const largura = dimensoes.width * escala
    const altura = dimensoes.height * escala

    page.drawRectangle({
        x: pos.x,
        y: pos.y,
        width: pos.width,
        height: pos.height,
        color: cores.branco,
        borderColor: cores.dourado,
        borderWidth: 1.5
    })

    page.drawImage(fotoImagem, {
        x: pos.x + (pos.width - largura) / 2,
        y: pos.y + (pos.height - altura) / 2,
        width: largura,
        height: altura
    })
}

function desenharFrente(page, fontes, cores, dados, opcoes, fotoImagem = null) {
    const pos = POSICOES_CERTIFICADO.frente

    desenharCentralizado(
        page,
        'Certificamos que',
        pos.certificamos,
        fontes.regular,
        cores.cinza
    )

    desenharCentralizado(
        page,
        dados.aluno.nome,
        pos.nome,
        fontes.serifBold,
        cores.verde
    )

    desenharCentralizado(
        page,
        `CPF: ${dados.aluno.cpf}`,
        pos.cpf,
        fontes.regular,
        cores.texto
    )

    desenharCentralizado(
        page,
        dados.curso.nome,
        pos.curso,
        fontes.bold,
        cores.verde
    )

    desenharCentralizado(
        page,
        `Carga horária: ${dados.curso.cargaHoraria} horas`,
        pos.cargaHoraria,
        fontes.regular,
        cores.texto
    )

    desenharCentralizado(
        page,
        `Data de conclusão: ${dados.certificado.dataConclusao}`,
        pos.dataConclusao,
        fontes.regular,
        cores.texto
    )

    const larguraLinha = 360
    page.drawLine({
        start: { x: pos.instrutor.x - larguraLinha / 2, y: pos.instrutor.y + 28 },
        end: { x: pos.instrutor.x + larguraLinha / 2, y: pos.instrutor.y + 28 },
        thickness: 0.8,
        color: cores.dourado
    })

    desenharCentralizado(
        page,
        dados.instrutor.nome,
        pos.instrutor,
        fontes.bold,
        cores.verde
    )

    const cargo = {
        ...pos.instrutor,
        y: pos.instrutor.y - 18,
        size: 10,
        maxWidth: 500
    }
    desenharCentralizado(page, dados.instrutor.cargo, cargo, fontes.regular, cores.cinza)

    if (dados.certificado.codigo) {
        desenharTextoDireita(
            page,
            `Código: ${dados.certificado.codigo}`,
            pos.codigo,
            fontes.regular,
            cores.cinza
        )
    }

    desenharFoto(page, fotoImagem, pos.foto, cores)

    if (opcoes.debugCoordenadas) {
        desenharGuia(page, pos, fontes.regular, cores.vermelho)
    }
}

// ============================================================
// VERSO
// ============================================================

function desenharSecao(page, titulo, y, fontes, cores) {
    page.drawText(titulo, {
        x: 90,
        y,
        size: 13,
        font: fontes.bold,
        color: cores.verde
    })
    page.drawLine({
        start: { x: 90, y: y - 8 },
        end: { x: LARGURA_PAGINA - 90, y: y - 8 },
        thickness: 0.7,
        color: cores.dourado
    })
    return y - 28
}

function desenharLista(page, itens, x, y, fontes, cores) {
    let atual = y

    for (const item of itens) {
        const linhas = quebrarTexto(
            `- ${item}`,
            fontes.regular,
            10,
            LARGURA_PAGINA - x - 90
        )

        for (const linha of linhas) {
            page.drawText(linha, {
                x,
                y: atual,
                size: 10,
                font: fontes.regular,
                color: cores.texto
            })
            atual -= 15
        }

        atual -= 3
    }

    return atual
}

function desenharDados(page, dados, x, y, fontes, cores) {
    const linhas = [
        ['Aluno', dados.aluno.nome],
        ['CPF', dados.aluno.cpf],
        ['Curso', dados.curso.nome],
        ['Carga horária', `${dados.curso.cargaHoraria} horas`],
        ['Data de conclusão', dados.certificado.dataConclusao],
        ['Código', dados.certificado.codigo || '-']
    ]

    if (dados.certificado.nota != null) {
        linhas.push(['Nota', String(dados.certificado.nota)])
    }

    let atual = y
    const larguraValor = LARGURA_PAGINA - x - 220

    for (const [rotulo, valor] of linhas) {
        page.drawText(`${rotulo}:`, {
            x,
            y: atual,
            size: 10,
            font: fontes.bold,
            color: cores.verde
        })

        const partes = quebrarTexto(String(valor), fontes.regular, 10, larguraValor)
        for (const parte of partes) {
            page.drawText(parte, {
                x: x + 125,
                y: atual,
                size: 10,
                font: fontes.regular,
                color: cores.texto
            })
            atual -= 14
        }

        atual -= 3
    }

    return atual
}

function desenharAssinatura(page, centroX, y, nome, cargo, fontes, cores) {
    const largura = 360
    page.drawLine({
        start: { x: centroX - largura / 2, y },
        end: { x: centroX + largura / 2, y },
        thickness: 0.8,
        color: cores.dourado
    })

    const posNome = { x: centroX, y: y - 18, size: 11, maxWidth: 420 }
    const posCargo = { x: centroX, y: y - 34, size: 9, maxWidth: 420 }

    desenharCentralizado(page, nome, posNome, fontes.bold, cores.verde)
    desenharCentralizado(page, cargo, posCargo, fontes.regular, cores.cinza)
}

function desenharVerso(page, fontes, cores, dados) {
    page.drawRectangle({
        x: 0,
        y: 0,
        width: LARGURA_PAGINA,
        height: ALTURA_PAGINA,
        color: cores.branco
    })

    page.drawRectangle({
        x: 0,
        y: ALTURA_PAGINA - 120,
        width: LARGURA_PAGINA,
        height: 120,
        color: cores.verde
    })

    page.drawText('CERTIFICADO DE CONCLUSÃO', {
        x: 90,
        y: ALTURA_PAGINA - 62,
        size: 26,
        font: fontes.serifBold,
        color: cores.branco
    })

    page.drawText('Verso - Informações institucionais e conteúdo programático', {
        x: 90,
        y: ALTURA_PAGINA - 92,
        size: 11,
        font: fontes.regular,
        color: cores.douradoClaro
    })

    page.drawLine({
        start: { x: 90, y: ALTURA_PAGINA - 130 },
        end: { x: LARGURA_PAGINA - 90, y: ALTURA_PAGINA - 130 },
        thickness: 1.2,
        color: cores.dourado
    })

    let y = ALTURA_PAGINA - 165

    y = desenharSecao(page, '1. CONTEÚDO PROGRAMÁTICO', y, fontes, cores)
    y = desenharLista(page, dados.curso.conteudoProgramatico, 110, y, fontes, cores)

    y -= 18
    y = desenharSecao(page, '2. NORMAS E REFERÊNCIAS', y, fontes, cores)
    y = desenharLista(page, dados.curso.normas, 110, y, fontes, cores)

    y -= 18
    y = desenharSecao(page, '3. DADOS DO CERTIFICADO', y, fontes, cores)
    y = desenharDados(page, dados, 110, y, fontes, cores)

    const assinaturaY = 210
    desenharAssinatura(
        page,
        350,
        assinaturaY,
        dados.instrutor.nome,
        dados.instrutor.cargo,
        fontes,
        cores
    )
    desenharAssinatura(
        page,
        878,
        assinaturaY,
        'SulSafe - Segurança do Trabalho',
        'Instituição de Ensino',
        fontes,
        cores
    )

    page.drawLine({
        start: { x: 90, y: 78 },
        end: { x: LARGURA_PAGINA - 90, y: 78 },
        thickness: 0.5,
        color: cores.dourado
    })

    page.drawText(
        `Certificado ${dados.certificado.codigo || '-'} | Emitido em ${dados.certificado.dataConclusao} | sulsafe.com.br`,
        {
            x: 90,
            y: 58,
            size: 9,
            font: fontes.regular,
            color: cores.cinza
        }
    )

    page.drawText(
        'Documento gerado eletronicamente. A autenticidade pode ser conferida pelo código informado.',
        {
            x: 90,
            y: 42,
            size: 8,
            font: fontes.regular,
            color: cores.cinza
        }
    )

    page.drawRectangle({
        x: 30,
        y: 30,
        width: LARGURA_PAGINA - 60,
        height: ALTURA_PAGINA - 60,
        borderColor: cores.dourado,
        borderWidth: 1.2
    })
}

// ============================================================
// CARREGAMENTO DA IMAGEM E DOWNLOAD
// ============================================================

async function carregarImagemBytes(origem, rotulo = 'imagem do certificado') {
    if (origem instanceof Uint8Array) return origem
    if (origem instanceof ArrayBuffer) return new Uint8Array(origem)

    const resposta = await fetch(origem)
    if (!resposta.ok) {
        throw new Error(
            `Não foi possível carregar a ${rotulo} (HTTP ${resposta.status}).`
        )
    }

    return new Uint8Array(await resposta.arrayBuffer())
}

async function embedImagem(pdfDoc, bytes) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
        return pdfDoc.embedPng(bytes)
    }

    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
        return pdfDoc.embedJpg(bytes)
    }

    throw new Error('Formato de foto não suportado. Use JPG ou PNG.')
}

function nomeArquivoCertificado(dados) {
    const aluno = String(dados.aluno.nome)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 60) || 'aluno'

    const nr = dados.curso.nrId ? `nr-${dados.curso.nrId}` : 'sulsafe'
    return `certificado_${aluno}_${nr}.pdf`
}

function baixarPdf(pdfBytes, nomeArquivo) {
    if (typeof document === 'undefined') {
        throw new Error(
            'Download disponível apenas no navegador. ' +
            'Use criarCertificadoPDF() para gerar os bytes.'
        )
    }

    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = nomeArquivo
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()

    setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// ============================================================
// API PRINCIPAL
// ============================================================
//
// Exemplo de uso com dados do Supabase:
//
// const dados = montarDadosCertificado({
//     certificado: certificadoRow, // public.certificados
//     aluno: perfilAluno,          // public.profiles
//     instrutor: perfilInstrutor,  // public.profiles (emitido_por)
//     nr: NRS.find(item => item.n === certificadoRow.nr_id)
// })
//
// await gerarCertificadoPDF(dados.aluno, dados.curso, dados.opcoes)
//
// Para alinhar o layout:
// await gerarCertificadoPDF(aluno, curso, { ...opcoes, debugCoordenadas: true })
// ============================================================

/**
 * Gera o PDF (frente + verso) e retorna os bytes, sem baixar.
 *
 * @param {object} aluno { nome_completo, cpf, email, foto_url, fotoBytes }
 * @param {object} curso { nr_id, nome, carga_horaria, conteudoProgramatico, normas }
 * @param {object} [opcoes]
 * @param {object} [opcoes.instrutor] { nome_completo }
 * @param {string|URL} [opcoes.fotoUrl] Foto do aluno (URL assinada ou data URL).
 * @param {Uint8Array|ArrayBuffer} [opcoes.fotoBytes] Foto do aluno em JPG/PNG.
 * @param {string} [opcoes.codigo]
 * @param {number} [opcoes.nota]
 * @param {string|Date} [opcoes.dataConclusao]
 * @param {boolean} [opcoes.debugCoordenadas]
 * @param {Uint8Array|ArrayBuffer} [opcoes.imagemBytes]
 * @param {string|URL} [opcoes.imagemUrl]
 * @param {object} [opcoes.pdfLib] Módulo pdf-lib injetado (testes/Node).
 * @returns {Promise<{pdfBytes: Uint8Array, nomeArquivo: string, dados: object, pdfDoc: object}>}
 */
export async function criarCertificadoPDF(aluno, curso, opcoes = {}) {
    const pdfLib = opcoes.pdfLib || await import(PDF_LIB_URL)
    const { PDFDocument, StandardFonts, rgb } = pdfLib

    const dados = normalizarDados(aluno, curso, opcoes)
    const pdfDoc = await PDFDocument.create()

    const fontes = {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
        serif: await pdfDoc.embedFont(StandardFonts.TimesRoman),
        serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
    }

    const cores = {
        verde: rgb(0.09, 0.30, 0.21),
        dourado: rgb(0.78, 0.65, 0.29),
        douradoClaro: rgb(0.93, 0.86, 0.66),
        texto: rgb(0.12, 0.12, 0.12),
        cinza: rgb(0.42, 0.42, 0.42),
        branco: rgb(1, 1, 1),
        vermelho: rgb(0.85, 0.15, 0.15)
    }

    const imagemBytes = await carregarImagemBytes(
        opcoes.imagemBytes || opcoes.imagemUrl || IMAGEM_CERTIFICADO_URL
    )
    const imagem = await pdfDoc.embedPng(imagemBytes)

    let fotoImagem = null
    const fotoOrigem = dados.aluno.fotoBytes || dados.aluno.fotoUrl

    if (fotoOrigem) {
        try {
            const fotoBytes = await carregarImagemBytes(fotoOrigem, 'foto do aluno')
            fotoImagem = await embedImagem(pdfDoc, fotoBytes)
        } catch (error) {
            console.warn('Foto do aluno não pôde ser incluída no certificado:', error)
        }
    }

    const frente = pdfDoc.addPage([LARGURA_PAGINA, ALTURA_PAGINA])
    frente.drawImage(imagem, {
        x: 0,
        y: 0,
        width: LARGURA_PAGINA,
        height: ALTURA_PAGINA
    })
    desenharFrente(frente, fontes, cores, dados, opcoes, fotoImagem)

    const verso = pdfDoc.addPage([LARGURA_PAGINA, ALTURA_PAGINA])
    desenharVerso(verso, fontes, cores, dados)

    const pdfBytes = await pdfDoc.save()
    const nomeArquivo = opcoes.nomeArquivo || nomeArquivoCertificado(dados)

    return { pdfBytes, nomeArquivo, dados, pdfDoc }
}

/**
 * Gera o certificado e faz o download automático no navegador.
 * Use opcoes.baixar = false para apenas retornar os bytes.
 *
 * @param {object} aluno
 * @param {object} curso
 * @param {object} [opcoes]
 * @returns {Promise<{pdfBytes: Uint8Array, nomeArquivo: string, dados: object, pdfDoc: object}>}
 */
export async function gerarCertificadoPDF(aluno, curso, opcoes = {}) {
    const resultado = await criarCertificadoPDF(aluno, curso, opcoes)

    if (opcoes.baixar !== false) {
        baixarPdf(resultado.pdfBytes, resultado.nomeArquivo)
    }

    return resultado
}
