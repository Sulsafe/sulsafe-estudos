// ============================================================
// GERADOR DE CERTIFICADO EM PDF
// ============================================================
// Dependência: pdf-lib
// No navegador ela é carregada via esm.sh; no Node pode ser
// injetada em opcoes.pdfLib para testes.
//
// O arquivo certificado-base.png deve estar na raiz do site.
// Ele é o modelo oficial certificadoatt.png com apenas as linhas
// de exemplo do conteúdo programático removidas. A moldura, o
// emblema, o título e as legendas permanecem na imagem; os dados
// variáveis são desenhados como texto real e selecionável no PDF.
// A página usa 1228x864 pontos, a mesma proporção da imagem, para
// que as coordenadas possam ser ajustadas em pixels da imagem.
//
// Dados esperados (colunas do Supabase):
// - public.certificados:
//     id, usuario_id, nr_id, codigo, nota, carga_horaria,
//     emitido_por, criado_em, revogado
// - public.profiles (aluno):
//     id, nome_completo, email, cpf
// - public.profiles (instrutor, via certificados.emitido_por):
//     id, nome_completo
// - js/state.js (NRS):
//     n -> nome do curso/NR
//
// A frente preenche apenas os campos variáveis do modelo: nome,
// curso, período, carga horária, 8 linhas de conteúdo programático,
// assinaturas, data e código de validação. O conteúdo programático
// é opcional; quando não informado, as linhas pontilhadas do modelo
// continuam visíveis, sem inventar tópicos.
//
// O período de realização não existe no schema atual. Quando o
// chamador tiver datas reais (ex.: data_inicio/data_fim de uma
// turma), basta passar opcoes.periodoInicio/periodoFim. Sem isso,
// o campo fica em branco e a data de conclusão é usada apenas como
// fim do período, nunca como data inicial inventada.
//
// profiles.cpf foi adicionada pela migration
// 20261023000000_certificados_cpf_revogado.sql. A função
// aceita aluno.cpf e usa "" quando ele não é informado.
// ============================================================

const PDF_LIB_URL = 'https://esm.sh/pdf-lib@1.17.1'
const IMAGEM_CERTIFICADO_URL = new URL('../certificado-base.png', import.meta.url)

const LARGURA_PAGINA = 1228
const ALTURA_PAGINA = 864

// ============================================================
// COORDENADAS
// ============================================================
// x/y em pontos PDF, com origem no canto inferior esquerdo.
// Os valores foram medidos sobre certificado-base.png (1228x864):
// y_pdf = 864 - y_imagem. Ajuste os valores abaixo para alinhar
// o texto ao layout visual. O campo debugCoordenadas desenha
// cruzes vermelhas em cada posição para facilitar o alinhamento.
// ============================================================

export const POSICOES_CERTIFICADO = {
    frente: {
        // Linha do nome: imagem y=371 (x 240..986)
        nome: { x: 613, y: 499, size: 26, minSize: 11, maxWidth: 720 },
        // Linha do curso: imagem y=454 (x 186..1040)
        curso: { x: 613, y: 414, size: 17, minSize: 9, maxWidth: 830 },
        // Espaços "___/___/___" da frase do período, na imagem y=500
        periodo: {
            y: 364,
            size: 15,
            minSize: 9,
            inicio: {
                dia: { x: 430.5 },
                mes: { x: 470.5 },
                ano: { x: 514 }
            },
            fim: {
                dia: { x: 573.5 },
                mes: { x: 614 },
                ano: { x: 657 }
            }
        },
        // Espaço "___" antes de "horas."
        cargaHoraria: { x: 974, y: 364, size: 15, minSize: 9, maxWidth: 36 },
        // 8 linhas pontilhadas: coluna esquerda x 135..590 e direita x 633..1088
        conteudo: {
            size: 18,
            minSize: 9,
            itens: [
                { numero: 1, numeroX: 135, textoX: 156, endX: 590, y: 294 },
                { numero: 2, numeroX: 135, textoX: 156, endX: 590, y: 268 },
                { numero: 3, numeroX: 135, textoX: 156, endX: 590, y: 242 },
                { numero: 4, numeroX: 135, textoX: 156, endX: 590, y: 217 },
                { numero: 5, numeroX: 633, textoX: 654, endX: 1088, y: 294 },
                { numero: 6, numeroX: 633, textoX: 654, endX: 1088, y: 268 },
                { numero: 7, numeroX: 633, textoX: 654, endX: 1088, y: 242 },
                { numero: 8, numeroX: 633, textoX: 654, endX: 1088, y: 217 }
            ]
        },
        // Linhas de assinatura na imagem y=724 (x 151..402, 487..738 e 823..1074)
        assinaturas: {
            aluno: { x: 276.5, y: 152, size: 14, minSize: 8, maxWidth: 300 },
            instrutor: { x: 612.5, y: 152, size: 14, minSize: 8, maxWidth: 300 },
            institucional: { x: 948.5, y: 152, size: 14, minSize: 8, maxWidth: 300 }
        },
        // "Reg. TST ___ / Data: __/__/__" sob o instrutor (imagem y=766)
        registroTst: { x: 583.5, y: 98, size: 9, minSize: 7, maxWidth: 30 },
        dataAssinatura: {
            y: 98,
            size: 9,
            dia: { x: 668.5 },
            mes: { x: 692.5 },
            ano: { x: 719 }
        },
        // Faixa livre entre o conteúdo programático e as assinaturas
        meta: { x: 613, y: 195, size: 9.5, minSize: 7, maxWidth: 960 }
    },
    verso: {
        margem: 90,
        topo: 760
    }
}

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
    if (typeof valor === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(valor.trim())) {
        return valor.trim()
    }
    const data = valor instanceof Date ? valor : new Date(valor)
    if (Number.isNaN(data.getTime())) return String(valor)
    return data.toLocaleDateString('pt-BR')
}

function formatarDataOuVazio(valor) {
    const texto = formatarData(valor)
    return texto === '-' ? '' : texto
}

function dividirData(valor) {
    const bruto = String(valor || '').trim()
    const texto = /^\d{2}\/\d{2}\/\d{4}$/.test(bruto)
        ? bruto
        : formatarDataOuVazio(valor)
    const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)
    return partes
        ? { dia: partes[1], mes: partes[2], ano: partes[3] }
        : null
}

function normalizarLista(valor, padrao = []) {
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
    const nome = String(nomeCurso || '').trim()
    return [
        nr && nome ? `${nr} - ${nome}` : (nr || nome || 'Normas Regulamentadoras de Segurança e Saúde no Trabalho'),
        'Portaria MTP nº 672/2021 e atualizações',
        'CLT, art. 157 a 163',
        'Legislação federal aplicável'
    ].filter(Boolean)
}

function normalizarDados(aluno = {}, curso = {}, opcoes = {}) {
    const nrId = curso?.nr_id ?? curso?.n ?? curso?.id ?? null
    const rotuloNr = nrId ? `NR-${String(nrId).padStart(2, '0')}` : ''
    const nomeCursoBruto = curso?.nome || curso?.titulo || ''
    const nomeCurso = rotuloNr && nomeCursoBruto &&
        !new RegExp(`^${rotuloNr}\\b`, 'i').test(nomeCursoBruto)
        ? `${rotuloNr} - ${nomeCursoBruto}`
        : (nomeCursoBruto || rotuloNr)

    const instrutor = opcoes?.instrutor || curso?.instrutor || null
    const nomeInstrutor = instrutor?.nome_completo || instrutor?.nome ||
        opcoes?.instrutorNome || curso?.instrutor_nome || ''

    const cargaHorariaBruta = curso?.carga_horaria ?? opcoes?.cargaHoraria
    const cargaHoraria = Number(cargaHorariaBruta)
    const cargaHorariaValida = Number.isFinite(cargaHoraria) && cargaHoraria > 0
        ? cargaHoraria
        : null

    const dataConclusao = formatarDataOuVazio(
        opcoes?.dataConclusao ||
        opcoes?.emitidoEm ||
        curso?.data_conclusao ||
        curso?.criado_em
    )

    const periodoInicio = formatarDataOuVazio(
        opcoes?.periodoInicio ||
        curso?.periodoInicio ||
        curso?.periodo_inicio ||
        curso?.data_inicio
    )

    const periodoFim = formatarDataOuVazio(
        opcoes?.periodoFim ||
        curso?.periodoFim ||
        curso?.periodo_fim ||
        curso?.data_fim ||
        dataConclusao
    )

    return {
        aluno: {
            nome: aluno?.nome_completo || aluno?.nome || '',
            cpf: formatarCpf(aluno?.cpf) || '',
            email: aluno?.email || ''
        },
        curso: {
            nrId,
            nome: nomeCurso,
            cargaHoraria: cargaHorariaValida,
            periodoInicio,
            periodoFim,
            conteudoProgramatico: normalizarLista(
                curso?.conteudoProgramatico ||
                curso?.conteudo_programatico ||
                opcoes?.conteudoProgramatico,
                []
            ),
            normas: normalizarLista(
                curso?.normas || opcoes?.normas,
                normasPadrao(nrId, nomeCursoBruto)
            )
        },
        certificado: {
            codigo: opcoes?.codigo || curso?.codigo || '',
            nota: opcoes?.nota ?? curso?.nota ?? null,
            dataConclusao
        },
        instrutor: {
            nome: nomeInstrutor,
            cargo: opcoes?.instrutorCargo || 'Instrutor de Segurança do Trabalho',
            registroTst: opcoes?.instrutorRegistroTst ||
                instrutor?.registro_tst ||
                instrutor?.registroTst ||
                ''
        },
        responsavelInstitucional:
            opcoes?.responsavelInstitucional ||
            curso?.responsavel_institucional ||
            ''
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

// pdf-lib codifica as fontes padrão em WinAnsi. Normaliza
// pontuação tipográfica e remove o que não puder ser codificado.
function textoPdf(valor) {
    return String(valor ?? '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E]/g, '"')
        .replace(/\u2026/g, '...')
        .replace(/\u2022/g, '-')
        .replace(/[^\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g, '')
}

// Reduz a fonte até o texto caber na largura disponível.
function ajustarFonte(texto, font, pos) {
    const maxWidth = pos.maxWidth || 900
    const minSize = pos.minSize ?? pos.size
    let size = pos.size

    while (size > minSize && font.widthOfTextAtSize(texto, size) > maxWidth) {
        size = Math.max(minSize, size - 0.5)
    }

    return size
}

function encurtarTexto(texto, font, size, maxWidth) {
    if (font.widthOfTextAtSize(texto, size) <= maxWidth) return texto

    const reticencias = '...'
    let corte = texto

    while (corte.length > 1 && font.widthOfTextAtSize(`${corte}${reticencias}`, size) > maxWidth) {
        corte = corte.slice(0, -1)
    }

    return `${corte.trimEnd()}${reticencias}`
}

// Menor fonte que faz todos os textos caberem, para manter
// consistência visual entre campos do mesmo grupo.
function tamanhoComum(textos, font, pos) {
    const maxWidth = pos.maxWidth || 900
    const minSize = pos.minSize ?? pos.size
    let size = pos.size

    for (const texto of textos) {
        const conteudo = textoPdf(texto).trim()
        if (!conteudo) continue
        while (size > minSize && font.widthOfTextAtSize(conteudo, size) > maxWidth) {
            size = Math.max(minSize, size - 0.5)
        }
    }

    return size
}

function desenharCentralizado(page, texto, pos, font, color) {
    const conteudo = textoPdf(texto).trim()
    if (!conteudo || !pos) return pos?.y ?? 0

    const linhas = quebrarTexto(conteudo, font, pos.size, pos.maxWidth || 900)
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

// Texto em uma única linha, centralizado ou à esquerda, com
// redução automática de fonte e corte com reticências no limite.
function desenharLinhaUnica(page, texto, pos, font, color, alinhamento = 'center') {
    const conteudo = textoPdf(texto).trim()
    if (!conteudo || !pos) return 0

    const size = ajustarFonte(conteudo, font, pos)
    const maxWidth = pos.maxWidth || 900
    const linha = encurtarTexto(conteudo, font, size, maxWidth)
    const largura = font.widthOfTextAtSize(linha, size)

    page.drawText(linha, {
        x: alinhamento === 'center' ? pos.x - largura / 2 : pos.x,
        y: pos.y,
        size,
        font,
        color
    })

    return largura
}

// Valor curto centralizado em um espaço do formulário (ex.: dia).
function desenharCentradoEm(page, texto, x, y, size, font, color) {
    const conteudo = textoPdf(texto).trim()
    if (!conteudo) return

    const largura = font.widthOfTextAtSize(conteudo, size)
    page.drawText(conteudo, {
        x: x - largura / 2,
        y,
        size,
        font,
        color
    })
}

function desenharPontilhado(page, inicioX, fimX, y, color) {
    if (!Number.isFinite(inicioX) || !Number.isFinite(fimX) || fimX - inicioX < 4) return

    page.drawLine({
        start: { x: inicioX, y },
        end: { x: fimX, y },
        thickness: 1.2,
        color,
        dashArray: [1.5, 2.2]
    })
}

function desenharGuia(page, posicoes, font, color, prefixo = '', yHerdado = null) {
    for (const [campo, pos] of Object.entries(posicoes || {})) {
        if (!pos || typeof pos !== 'object') continue

        const y = Number.isFinite(pos.y) ? pos.y : yHerdado

        if (Number.isFinite(pos.x) && Number.isFinite(y)) {
            page.drawLine({
                start: { x: pos.x - 10, y },
                end: { x: pos.x + 10, y },
                thickness: 0.6,
                color
            })
            page.drawLine({
                start: { x: pos.x, y: y - 10 },
                end: { x: pos.x, y: y + 10 },
                thickness: 0.6,
                color
            })
            page.drawText(`${prefixo}${campo}`, {
                x: pos.x + 12,
                y: y + 4,
                size: 7,
                font,
                color
            })
        } else if (!Number.isFinite(pos.x)) {
            desenharGuia(page, pos, font, color, `${prefixo}${campo}.`, y)
        }
    }
}

// ============================================================
// FRENTE
// ============================================================

function formatarNota(valor) {
    if (valor == null || valor === '') return ''
    const numero = Number(valor)
    if (!Number.isFinite(numero)) return String(valor)
    return numero.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function desenharPeriodo(page, campos, partes, y, size, font, color) {
    if (!partes) return

    for (const chave of ['dia', 'mes', 'ano']) {
        const alvo = campos?.[chave]
        if (!alvo || !partes[chave]) continue
        desenharCentradoEm(page, partes[chave], alvo.x, y, size, font, color)
    }
}

function desenharConteudo(page, pos, itens, font, color) {
    const lista = Array.isArray(itens) ? itens : []
    const textos = pos.itens.map((_, indice) => textoPdf(lista[indice] || '').trim())
    const disponivel = Math.min(
        ...pos.itens.map(slot => slot.endX - slot.textoX - 8)
    )
    const size = tamanhoComum(textos, font, {
        size: pos.size,
        minSize: pos.minSize,
        maxWidth: disponivel
    })

    pos.itens.forEach((slot, indice) => {
        page.drawText(`${slot.numero}.`, {
            x: slot.numeroX,
            y: slot.y,
            size,
            font,
            color
        })

        const texto = textos[indice]
        let fimTexto = slot.textoX - 4

        if (texto) {
            const linha = encurtarTexto(texto, font, size, disponivel)

            page.drawText(linha, {
                x: slot.textoX,
                y: slot.y,
                size,
                font,
                color
            })

            fimTexto = slot.textoX + font.widthOfTextAtSize(linha, size)
        }

        desenharPontilhado(page, fimTexto + 6, slot.endX, slot.y, color)
    })
}

function desenharFrente(page, fontes, cores, dados, opcoes) {
    const pos = POSICOES_CERTIFICADO.frente

    desenharLinhaUnica(
        page,
        dados.aluno.nome,
        pos.nome,
        fontes.serifBold,
        cores.verde
    )

    desenharLinhaUnica(
        page,
        dados.curso.nome,
        pos.curso,
        fontes.bold,
        cores.verde
    )

    desenharPeriodo(
        page,
        pos.periodo.inicio,
        dividirData(dados.curso.periodoInicio),
        pos.periodo.y,
        pos.periodo.size,
        fontes.regular,
        cores.texto
    )

    desenharPeriodo(
        page,
        pos.periodo.fim,
        dividirData(dados.curso.periodoFim),
        pos.periodo.y,
        pos.periodo.size,
        fontes.regular,
        cores.texto
    )

    if (dados.curso.cargaHoraria != null) {
        desenharCentradoEm(
            page,
            String(dados.curso.cargaHoraria),
            pos.cargaHoraria.x,
            pos.cargaHoraria.y,
            pos.cargaHoraria.size,
            fontes.regular,
            cores.texto
        )
    }

    desenharConteudo(
        page,
        pos.conteudo,
        dados.curso.conteudoProgramatico,
        fontes.regular,
        cores.texto
    )

    const nomesAssinatura = [
        dados.aluno.nome,
        dados.instrutor.nome,
        dados.responsavelInstitucional
    ]
    const assinaturaSize = tamanhoComum(
        nomesAssinatura,
        fontes.bold,
        pos.assinaturas.aluno
    )

    desenharLinhaUnica(
        page,
        dados.aluno.nome,
        { ...pos.assinaturas.aluno, size: assinaturaSize },
        fontes.bold,
        cores.verde
    )

    desenharLinhaUnica(
        page,
        dados.instrutor.nome,
        { ...pos.assinaturas.instrutor, size: assinaturaSize },
        fontes.bold,
        cores.verde
    )

    desenharLinhaUnica(
        page,
        dados.responsavelInstitucional,
        { ...pos.assinaturas.institucional, size: assinaturaSize },
        fontes.bold,
        cores.verde
    )

    if (dados.instrutor.registroTst) {
        desenharLinhaUnica(
            page,
            dados.instrutor.registroTst,
            pos.registroTst,
            fontes.regular,
            cores.texto
        )
    }

    desenharPeriodo(
        page,
        pos.dataAssinatura,
        dividirData(dados.certificado.dataConclusao),
        pos.dataAssinatura.y,
        pos.dataAssinatura.size,
        fontes.regular,
        cores.texto
    )

    const meta = []
    if (dados.aluno.cpf) meta.push(`CPF: ${dados.aluno.cpf}`)
    if (dados.certificado.codigo) {
        meta.push(`Código de validação: ${dados.certificado.codigo}`)
    }
    if (dados.certificado.nota != null) {
        meta.push(`Nota: ${formatarNota(dados.certificado.nota)}`)
    }

    if (meta.length) {
        desenharLinhaUnica(
            page,
            meta.join('   ·   '),
            pos.meta,
            fontes.regular,
            cores.cinza
        )
    }

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
            textoPdf(`- ${item}`),
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
        ['Carga horária', dados.curso.cargaHoraria != null ? `${dados.curso.cargaHoraria} horas` : ''],
        ['Data de conclusão', dados.certificado.dataConclusao],
        ['Código', dados.certificado.codigo || '-']
    ]

    if (dados.curso.periodoInicio || dados.curso.periodoFim) {
        linhas.splice(4, 0, [
            'Período',
            [dados.curso.periodoInicio || '____', dados.curso.periodoFim || '____'].join(' a ')
        ])
    }

    if (dados.certificado.nota != null) {
        linhas.push(['Nota', formatarNota(dados.certificado.nota)])
    }

    let atual = y
    const larguraValor = LARGURA_PAGINA - x - 220

    for (const [rotulo, valor] of linhas) {
        page.drawText(textoPdf(`${rotulo}:`), {
            x,
            y: atual,
            size: 10,
            font: fontes.bold,
            color: cores.verde
        })

        const partes = quebrarTexto(textoPdf(valor), fontes.regular, 10, larguraValor)
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
    let numeroSecao = 1

    if (dados.curso.conteudoProgramatico.length) {
        y = desenharSecao(page, `${numeroSecao++}. CONTEÚDO PROGRAMÁTICO`, y, fontes, cores)
        y = desenharLista(page, dados.curso.conteudoProgramatico, 110, y, fontes, cores)
        y -= 18
    }

    y = desenharSecao(page, `${numeroSecao++}. NORMAS E REFERÊNCIAS`, y, fontes, cores)
    y = desenharLista(page, dados.curso.normas, 110, y, fontes, cores)

    y -= 18
    y = desenharSecao(page, `${numeroSecao++}. DADOS DO CERTIFICADO`, y, fontes, cores)
    desenharDados(page, dados, 110, y, fontes, cores)

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
        textoPdf(
            `Certificado ${dados.certificado.codigo || '-'} | Emitido em ${dados.certificado.dataConclusao || '-'} | sulsafe.com.br`
        ),
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
 * @param {object} aluno { nome_completo, cpf, email }
 * @param {object} curso { nr_id, nome, carga_horaria, periodoInicio, periodoFim, conteudoProgramatico, normas }
 * @param {object} [opcoes]
 * @param {object} [opcoes.instrutor] { nome_completo, registro_tst }
 * @param {string} [opcoes.instrutorRegistroTst] Registro TST do instrutor.
 * @param {string} [opcoes.responsavelInstitucional] Nome do responsável institucional.
 * @param {string} [opcoes.periodoInicio]
 * @param {string} [opcoes.periodoFim]
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

    const frente = pdfDoc.addPage([LARGURA_PAGINA, ALTURA_PAGINA])
    frente.drawImage(imagem, {
        x: 0,
        y: 0,
        width: LARGURA_PAGINA,
        height: ALTURA_PAGINA
    })
    desenharFrente(frente, fontes, cores, dados, opcoes)

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
