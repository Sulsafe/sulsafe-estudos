import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.dirname(fileURLToPath(import.meta.url))
const BUCKET = 'documentos-nrs'
const INTERVALO_MS = 2000
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function carregarEnv(arquivo) {
    if (!fs.existsSync(arquivo)) return
    const conteudo = fs.readFileSync(arquivo, 'utf8')
    for (const linha of conteudo.split(/\r?\n/)) {
        const match = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
        if (!match) continue
        let valor = match[2]
        if (
            (valor.startsWith('"') && valor.endsWith('"')) ||
            (valor.startsWith("'") && valor.endsWith("'"))
        ) {
            valor = valor.slice(1, -1)
        }
        if (!process.env[match[1]]) process.env[match[1]] = valor
    }
}

carregarEnv(path.join(RAIZ, '.env'))
carregarEnv(path.join(RAIZ, '.env.local'))

const SUPABASE_URL = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://acqbidvknbqppkjidvsq.supabase.co'
).replace(/\/+$/, '')

const SERVICE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
    console.error('[ERRO] SUPABASE_SERVICE_ROLE_KEY não encontrada.')
    console.error('Crie um arquivo .env na raiz do projeto com:')
    console.error('SUPABASE_URL=https://acqbidvknbqppkjidvsq.supabase.co')
    console.error('SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role')
    console.error('Depois rode novamente: node popular-nrs.mjs')
    process.exit(1)
}

const BASE_VIGENTES =
    'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes'
const BASE_ARQUIVOS =
    'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras'
const BASE_CTPP =
    'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/ctpp-nrs'

const CATALOGO = [
    {
        nr: 1,
        titulo: 'NR-01 - Disposições Gerais e Gerenciamento de Riscos Ocupacionais',
        resumo: 'Estabelece as disposições gerais e o Gerenciamento de Riscos Ocupacionais (GRO), incluindo o Programa de Gerenciamento de Riscos (PGR). Define responsabilidades, identificação de perigos, avaliação de riscos e medidas de prevenção. É a norma estruturante do sistema de segurança e saúde no trabalho.',
        pdf: `${BASE_VIGENTES}/nr-01-atualizada-2025-i-3.pdf`
    },
    {
        nr: 2,
        titulo: 'NR-02 - Inspeção Prévia (Revogada)',
        resumo: 'Tratava da inspeção prévia em estabelecimentos e da comunicação de instalação e operação ao órgão fiscalizador. Foi revogada e seu conteúdo é mantido apenas como referência histórica.',
        pdf: `${BASE_ARQUIVOS}/nr-02_atualizada_2019.pdf`
    },
    {
        nr: 3,
        titulo: 'NR-03 - Embargo e Interdição',
        resumo: 'Define os procedimentos para embargo e interdição de estabelecimentos, setores, máquinas ou equipamentos com risco grave e iminente. É aplicada pela fiscalização do trabalho para paralisar atividades até a correção das irregularidades.',
        pdf: `${BASE_ARQUIVOS}/nr-03_atualizada_2019.pdf`
    },
    {
        nr: 4,
        titulo: 'NR-04 - Serviços Especializados em Segurança e em Medicina do Trabalho',
        resumo: 'Regulamenta os Serviços Especializados em Segurança e Medicina do Trabalho (SESMT), incluindo dimensionamento, atribuições e registro. Define os profissionais que compõem o serviço e as obrigações das empresas conforme o grau de risco e o número de empregados.',
        pdf: `${BASE_VIGENTES}/nr-04-atualizada-2023.pdf`
    },
    {
        nr: 5,
        titulo: 'NR-05 - Comissão Interna de Prevenção de Acidentes e de Assédio (CIPA)',
        resumo: 'Institui a Comissão Interna de Prevenção de Acidentes e de Assédio (CIPA) e define suas atribuições. Abrange composição, processo eleitoral, treinamento, reuniões e funcionamento da comissão.',
        pdf: `${BASE_VIGENTES}/NR05atualizada2023.pdf`
    },
    {
        nr: 6,
        titulo: 'NR-06 - Equipamento de Proteção Individual (EPI)',
        resumo: 'Regulamenta a seleção, aquisição, fornecimento, uso, guarda e conservação de Equipamentos de Proteção Individual. Define responsabilidades de empregadores, trabalhadores e fabricantes, além do Certificado de Aprovação (CA).',
        pdf: `${BASE_VIGENTES}/nr-06-atualizada-2025-ii.pdf`
    },
    {
        nr: 7,
        titulo: 'NR-07 - Programa de Controle Médico de Saúde Ocupacional',
        resumo: 'Estabelece o Programa de Controle Médico de Saúde Ocupacional (PCMSO), com exames ocupacionais e vigilância da saúde dos trabalhadores. Define responsabilidades do empregador e do médico coordenador, incluindo o ASO e o relatório analítico.',
        pdf: `${BASE_VIGENTES}/nr-07-atualizada-2022-1.pdf`
    },
    {
        nr: 8,
        titulo: 'NR-08 - Edificações',
        resumo: 'Define requisitos técnicos de segurança e saúde para edificações, incluindo circulação, proteção contra quedas, instalações e manutenção. Aplica-se às construções onde são desenvolvidas atividades laborais.',
        pdf: `${BASE_ARQUIVOS}/nr-08-atualizada-2022.pdf`
    },
    {
        nr: 9,
        titulo: 'NR-09 - Avaliação e Controle das Exposições Ocupacionais a Agentes Físicos, Químicos e Biológicos',
        resumo: 'Trata da avaliação e do controle das exposições ocupacionais a agentes físicos, químicos e biológicos. Integra o Gerenciamento de Riscos Ocupacionais e define etapas de identificação, avaliação, controle e monitoramento.',
        pdf: `${BASE_VIGENTES}/nr-09-atualizada-2026.pdf`
    },
    {
        nr: 10,
        titulo: 'NR-10 - Segurança em Instalações e Serviços em Eletricidade',
        resumo: 'Estabelece os requisitos de segurança em instalações e serviços com eletricidade. Abrange desenergização, equipamentos de proteção, autorização, treinamento e procedimentos de trabalho.',
        pdf: `${BASE_VIGENTES}/nr-10-atualizada-2026-1.pdf`
    },
    {
        nr: 11,
        titulo: 'NR-11 - Transporte, Movimentação, Armazenagem e Manuseio de Materiais',
        resumo: 'Regulamenta o transporte, a movimentação, a armazenagem e o manuseio de materiais. Define requisitos para equipamentos, operadores, sinalização, empilhamento e segurança das áreas de circulação.',
        pdf: `${BASE_VIGENTES}/nr-11-atualizada-2016.pdf`
    },
    {
        nr: 12,
        titulo: 'NR-12 - Segurança no Trabalho em Máquinas e Equipamentos',
        resumo: 'Define requisitos de segurança para máquinas e equipamentos em todas as fases de sua vida útil. Trata de proteções, dispositivos de segurança, manutenção, capacitação e adequação dos equipamentos.',
        pdf: `${BASE_VIGENTES}/nr-12-atualizada-2025.pdf`
    },
    {
        nr: 13,
        titulo: 'NR-13 - Caldeiras, Vasos de Pressão e Tubulações e Tanques Metálicos de Armazenamento',
        resumo: 'Estabelece requisitos para caldeiras, vasos de pressão, tubulações e tanques metálicos de armazenamento. Abrange projeto, instalação, inspeção, operação, manutenção e certificação desses equipamentos.',
        pdf: `${BASE_VIGENTES}/nr-13-atualizada-2023-b.pdf`
    },
    {
        nr: 14,
        titulo: 'NR-14 - Fornos',
        resumo: 'Define requisitos de segurança para fornos em geral, incluindo construção, instalação, operação e manutenção. Objetiva prevenir incêndios, explosões e exposições a calor e gases.',
        pdf: `${BASE_ARQUIVOS}/nr-14-atualizada-2022.pdf`
    },
    {
        nr: 15,
        titulo: 'NR-15 - Atividades e Operações Insalubres',
        resumo: 'Regulamenta as atividades e operações insalubres, com limites de tolerância e critérios de caracterização. Trata de agentes físicos, químicos e biológicos e das medidas de controle correspondentes.',
        pdf: `${BASE_VIGENTES}/nr-15-atualizada-2025.pdf`
    },
    {
        nr: 16,
        titulo: 'NR-16 - Atividades e Operações Perigosas',
        resumo: 'Regulamenta as atividades e operações perigosas, como explosivos, inflamáveis e energia elétrica. Define critérios de caracterização e requisitos de segurança para essas atividades.',
        pdf: `${BASE_VIGENTES}/nr-16-atualizada-2025-ii.pdf`
    },
    {
        nr: 17,
        titulo: 'NR-17 - Ergonomia',
        resumo: 'Estabelece parâmetros de ergonomia para adaptar as condições de trabalho às características dos trabalhadores. Abrange avaliação ergonômica, mobiliário, iluminação, levantamento de cargas e pausas.',
        pdf: `${BASE_VIGENTES}/nr-17-atualizada-2023.pdf`
    },
    {
        nr: 18,
        titulo: 'NR-18 - Segurança e Saúde no Trabalho na Indústria da Construção',
        resumo: 'Define requisitos de segurança e saúde na indústria da construção. Trata de canteiros, escavações, demolições, andaimes, instalações elétricas, máquinas e proteções coletivas.',
        pdf: `${BASE_VIGENTES}/NR18atualizada2026I.pdf`
    },
    {
        nr: 19,
        titulo: 'NR-19 - Explosivos',
        resumo: 'Regulamenta o manuseio, o armazenamento e o transporte de explosivos e acessórios. Define requisitos para depósitos, operações, sinalização, capacitação e controle de riscos.',
        pdf: `${BASE_VIGENTES}/nr-19-atualizada-2023.pdf`
    },
    {
        nr: 20,
        titulo: 'NR-20 - Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis',
        resumo: 'Estabelece requisitos para atividades com inflamáveis e combustíveis. Abrange projeto e operação de instalações, classificação de áreas, prevenção de incêndios e planos de emergência.',
        pdf: `${BASE_VIGENTES}/nr-20-atualizada-2025.pdf`
    },
    {
        nr: 21,
        titulo: 'NR-21 - Trabalhos a Céu Aberto',
        resumo: 'Define medidas de proteção para trabalhos realizados a céu aberto. Trata de abrigos, exposição a intempéries, insolação, calor, frio, umidade e condições sanitárias.',
        pdf: `${BASE_ARQUIVOS}/nr-21.pdf`
    },
    {
        nr: 22,
        titulo: 'NR-22 - Segurança e Saúde Ocupacional na Mineração',
        resumo: 'Regulamenta a segurança e a saúde ocupacional na mineração. Abrange lavra, beneficiamento, ventilação, explosivos, estabilidade de taludes, poeiras e emergências.',
        pdf: `${BASE_VIGENTES}/nr-22-atualizada-2026.pdf`
    },
    {
        nr: 23,
        titulo: 'NR-23 - Proteção Contra Incêndios',
        resumo: 'Estabelece requisitos de proteção contra incêndios, incluindo prevenção, detecção, combate e saídas de emergência. Define medidas aplicáveis a edificações e locais de trabalho.',
        pdf: `${BASE_ARQUIVOS}/nr-23-atualizada-2022.pdf`
    },
    {
        nr: 24,
        titulo: 'NR-24 - Condições Sanitárias e de Conforto nos Locais de Trabalho',
        resumo: 'Define condições sanitárias e de conforto nos locais de trabalho. Abrange instalações sanitárias, vestiários, refeitórios, água potável e condições de higiene.',
        pdf: `${BASE_ARQUIVOS}/nr-24-atualizada-2022.pdf`
    },
    {
        nr: 25,
        titulo: 'NR-25 - Resíduos Industriais',
        resumo: 'Trata dos resíduos industriais e das medidas de segurança para seu manejo. Define requisitos de identificação, armazenamento, transporte e destinação, com proteção dos trabalhadores.',
        pdf: `${BASE_ARQUIVOS}/nr-25-atualizada-2022-1.pdf`
    },
    {
        nr: 26,
        titulo: 'NR-26 - Sinalização de Segurança',
        resumo: 'Estabelece cores e sinalização de segurança para prevenção de acidentes e identificação de riscos. Define uso de cores, sinais, rotulagem e comunicação de perigos químicos.',
        pdf: `${BASE_ARQUIVOS}/nr-26-atualizada-2022.pdf`
    },
    {
        nr: 27,
        titulo: 'NR-27 - Registro Profissional do Técnico de Segurança do Trabalho (Revogada)',
        resumo: 'Tratava do registro profissional do Técnico de Segurança do Trabalho no Ministério do Trabalho. Foi revogada e seu conteúdo permanece apenas como referência histórica.',
        pdf: `${BASE_ARQUIVOS}/nr_27_revogada_2008.pdf`
    },
    {
        nr: 28,
        titulo: 'NR-28 - Fiscalização e Penalidades',
        resumo: 'Regulamenta a fiscalização do trabalho e as penalidades por descumprimento das normas de segurança e saúde no trabalho. Define infrações, critérios de multa e procedimentos de autuação.',
        pdf: `${BASE_VIGENTES}/nr-28-atualizada-2026.pdf`
    },
    {
        nr: 29,
        titulo: 'NR-29 - Segurança e Saúde no Trabalho Portuário',
        resumo: 'Estabelece segurança e saúde no trabalho portuário, em operações realizadas em portos organizados e instalações portuárias. Abrange movimentação de cargas, equipamentos, áreas de risco e treinamento.',
        pdf: `${BASE_VIGENTES}/nr-29-atualizada-2023.pdf`
    },
    {
        nr: 30,
        titulo: 'NR-30 - Segurança e Saúde no Trabalho Aquaviário',
        resumo: 'Regulamenta a segurança e a saúde no trabalho aquaviário, a bordo de embarcações e em atividades correlatas. Define requisitos de condições de trabalho, proteção, emergências e capacitação.',
        pdf: `${BASE_VIGENTES}/nr-30-atualizada-2023.pdf`
    },
    {
        nr: 31,
        titulo: 'NR-31 - Segurança e Saúde no Trabalho na Agricultura, Pecuária, Silvicultura, Exploração Florestal e Aquicultura',
        resumo: 'Estabelece requisitos de segurança e saúde na agricultura, pecuária, silvicultura, exploração florestal e aquicultura. Abrange máquinas, agrotóxicos, instalações, transporte e trabalho em campo.',
        pdf: `${BASE_VIGENTES}/nr-31-atualizada-2024-2.pdf`
    },
    {
        nr: 32,
        titulo: 'NR-32 - Segurança e Saúde no Trabalho em Serviços de Saúde',
        resumo: 'Define medidas de segurança e saúde em serviços de saúde. Trata de riscos biológicos, químicos e radiações, resíduos, vacinação, EPI e prevenção de acidentes com materiais perfurocortantes.',
        pdf: `${BASE_VIGENTES}/nr-32-atualizada-2023-1.pdf`
    },
    {
        nr: 33,
        titulo: 'NR-33 - Segurança e Saúde nos Trabalhos em Espaços Confinados',
        resumo: 'Regulamenta os trabalhos em espaços confinados. Define avaliação de riscos, monitoramento, controle de entrada, equipes, equipamentos e procedimentos de emergência e resgate.',
        pdf: `${BASE_ARQUIVOS}/nr-33-atualizada-2022-_retificada.pdf`
    },
    {
        nr: 34,
        titulo: 'NR-34 - Condições e Meio Ambiente de Trabalho na Indústria da Construção, Reparação e Desmonte Naval',
        resumo: 'Estabelece condições e meio ambiente de trabalho na indústria da construção, reparação e desmonte naval. Abrange plataformas, andaimes, içamento, trabalhos a quente e espaços confinados.',
        pdf: `${BASE_VIGENTES}/nr-34-atualizada-2023-2.pdf`
    },
    {
        nr: 35,
        titulo: 'NR-35 - Trabalho em Altura',
        resumo: 'Regulamenta o trabalho em altura acima de dois metros. Define análise de risco, medidas de proteção, sistemas de ancoragem, acesso por cordas, capacitação e emergência.',
        pdf: `${BASE_VIGENTES}/nr-35-atualizada-2025-1.pdf`
    },
    {
        nr: 36,
        titulo: 'NR-36 - Segurança e Saúde no Trabalho em Empresas de Abate e Processamento de Carnes e Derivados',
        resumo: 'Define requisitos de segurança e saúde em empresas de abate e processamento de carnes e derivados. Abrange ergonomia, frio, umidade, ruído, instrumentos cortantes e organização do trabalho.',
        pdf: `${BASE_VIGENTES}/nr-36-atualizada-2024-1.pdf`
    },
    {
        nr: 37,
        titulo: 'NR-37 - Segurança e Saúde em Plataformas de Petróleo',
        resumo: 'Estabelece segurança e saúde em plataformas de petróleo. Abrange instalações marítimas, operações, emergências, embarcações, mergulho e controle de riscos.',
        pdf: `${BASE_CTPP}/nr-37-atualizada-2023.pdf`
    },
    {
        nr: 38,
        titulo: 'NR-38 - Segurança e Saúde no Trabalho nas Atividades de Limpeza Urbana e Manejo de Resíduos Sólidos',
        resumo: 'Regulamenta a segurança e a saúde nas atividades de limpeza urbana e manejo de resíduos sólidos. Abrange coleta, transporte, varrição, poda, capina, riscos biológicos e equipamentos.',
        pdf: `${BASE_VIGENTES}/NR38atualizada2026.pdf`
    }
]

const CABECALHOS = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`
}

async function requisicao(url, opcoes = {}) {
    return fetch(url, {
        ...opcoes,
        headers: {
            ...CABECALHOS,
            ...(opcoes.headers || {})
        },
        signal: opcoes.signal || AbortSignal.timeout(60000)
    })
}

async function lerJson(resposta) {
    const texto = await resposta.text()
    if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status}: ${texto.slice(0, 300)}`)
    }
    return texto ? JSON.parse(texto) : null
}

async function garantirBucket() {
    let resposta = await requisicao(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`)
    let detalhe = await resposta.text()

    if (resposta.ok) {
        const info = detalhe ? JSON.parse(detalhe) : {}
        if (!info.public) {
            const atualizacao = await requisicao(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ public: true })
            })
            if (!atualizacao.ok) {
                throw new Error(`Falha ao tornar o bucket público: ${(await atualizacao.text()).slice(0, 300)}`)
            }
            console.log(`Bucket "${BUCKET}" existia privado e foi tornado público.`)
        }
        return
    }

    const ausente = resposta.status === 404 || /NoSuchBucket|Bucket not found/i.test(detalhe)

    if (!ausente) {
        throw new Error(`Falha ao consultar o bucket: ${detalhe.slice(0, 300)}`)
    }

    resposta = await requisicao(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
    })
    detalhe = await resposta.text()

    if (!resposta.ok) {
        if (/already exists/i.test(detalhe)) return
        throw new Error(`Falha ao criar o bucket: ${detalhe.slice(0, 300)}`)
    }

    console.log(`Bucket "${BUCKET}" criado como público.`)
}

async function baixarPdf(url) {
    let ultimoErro

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
        try {
            const resposta = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SulSafeEstudos/1.0)'
                },
                signal: AbortSignal.timeout(120000)
            })

            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)

            const buffer = Buffer.from(await resposta.arrayBuffer())
            const inicio = buffer.subarray(0, 1024).toString('latin1')

            if (!inicio.includes('%PDF-')) throw new Error('o arquivo baixado não é um PDF')
            if (buffer.length < 10000) throw new Error(`PDF muito pequeno (${buffer.length} bytes)`)

            return buffer
        } catch (erro) {
            ultimoErro = erro
            if (tentativa < 3) await sleep(1500 * tentativa)
        }
    }

    throw ultimoErro
}

async function subirPdf(caminho, buffer) {
    const caminhoCodificado = caminho.split('/').map(encodeURIComponent).join('/')
    const resposta = await requisicao(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminhoCodificado}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/pdf',
                'cache-control': '3600',
                'x-upsert': 'true'
            },
            body: buffer,
            signal: AbortSignal.timeout(180000)
        }
    )

    if (!resposta.ok) {
        throw new Error(`upload HTTP ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`)
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${caminhoCodificado}`
}

async function buscarMateriais(nrId) {
    const resposta = await requisicao(
        `${SUPABASE_URL}/rest/v1/materiais?select=id,url,titulo&nr_id=eq.${nrId}&tipo=eq.PDF`,
        { headers: { Accept: 'application/json' } }
    )
    return (await lerJson(resposta)) || []
}

async function enviarMaterial(metodo, url, dados) {
    const cabecalhos = {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
    }

    let resposta = await requisicao(url, {
        method: metodo,
        headers: cabecalhos,
        body: JSON.stringify({ ...dados, publico: true })
    })

    if (!resposta.ok) {
        const detalhe = await resposta.text()
        if (/publico/i.test(detalhe)) {
            resposta = await requisicao(url, {
                method: metodo,
                headers: cabecalhos,
                body: JSON.stringify(dados)
            })
            if (resposta.ok) return await resposta.json()
            throw new Error(`HTTP ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`)
        }
        throw new Error(`HTTP ${resposta.status}: ${detalhe.slice(0, 300)}`)
    }

    return await resposta.json()
}

async function gravarMaterial(nr, urlPublica) {
    const dados = {
        nr_id: nr.nr,
        titulo: nr.titulo,
        descricao: nr.resumo,
        url: urlPublica,
        tipo: 'PDF'
    }

    const existentes = await buscarMateriais(nr.nr)

    if (existentes.length > 0) {
        await enviarMaterial(
            'PATCH',
            `${SUPABASE_URL}/rest/v1/materiais?id=eq.${existentes[0].id}`,
            dados
        )
        return { acao: 'atualizado', extras: existentes.length - 1 }
    }

    await enviarMaterial('POST', `${SUPABASE_URL}/rest/v1/materiais`, dados)
    return { acao: 'inserido', extras: 0 }
}

async function main() {
    console.log('SulSafe Estudos - Popular materiais de apoio das NRs')
    console.log(`Supabase: ${SUPABASE_URL}`)
    console.log(`Bucket: ${BUCKET}`)
    console.log(`Total de NRs no catálogo: ${CATALOGO.length}\n`)

    await garantirBucket()

    const resultado = {
        inseridos: [],
        atualizados: [],
        falhas: []
    }

    for (const nr of CATALOGO) {
        const etiqueta = `NR-${String(nr.nr).padStart(2, '0')}`

        try {
            console.log(`[${etiqueta}] Baixando PDF oficial...`)
            const buffer = await baixarPdf(nr.pdf)
            const tamanhoMb = (buffer.length / 1024 / 1024).toFixed(1)
            console.log(`[${etiqueta}] Download OK (${tamanhoMb} MB). Enviando ao Storage...`)

            const nomeArquivo = decodeURIComponent(new URL(nr.pdf).pathname.split('/').pop())
            const caminho = `nr-${String(nr.nr).padStart(2, '0')}/${nomeArquivo}`
            const urlPublica = await subirPdf(caminho, buffer)

            const gravacao = await gravarMaterial(nr, urlPublica)
            console.log(`[${etiqueta}] ${gravacao.acao === 'inserido' ? 'Inserido' : 'Atualizado'} na tabela materiais.`)

            if (gravacao.extras > 0) {
                console.log(`[${etiqueta}] Aviso: ${gravacao.extras} registro(s) extra(s) de PDF já existiam para esta NR.`)
            }

            if (gravacao.acao === 'inserido') {
                resultado.inseridos.push(etiqueta)
            } else {
                resultado.atualizados.push(etiqueta)
            }
        } catch (erro) {
            console.error(`[${etiqueta}] Falhou: ${erro.message}`)
            resultado.falhas.push({ etiqueta, erro: erro.message })
        } finally {
            await sleep(INTERVALO_MS)
        }
    }

    console.log('\n==================================================')
    console.log('RESUMO')
    console.log(`Inseridos: ${resultado.inseridos.length}`)
    console.log(`Atualizados: ${resultado.atualizados.length}`)
    console.log(`Falhas: ${resultado.falhas.length}`)

    if (resultado.falhas.length > 0) {
        console.log('NRs com falha:')
        for (const falha of resultado.falhas) {
            console.log(`- ${falha.etiqueta}: ${falha.erro}`)
        }
        process.exitCode = 1
    }

    console.log('==================================================')
}

main().catch((erro) => {
    console.error('[ERRO FATAL]', erro.message)
    process.exit(1)
})
