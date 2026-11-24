// ============================================================
// BASE DE CONHECIMENTO DA SECRETÁRIA SULSAFE
// ============================================================
// IA 1 — SECRETÁRIA: 100% LOCAL, GRÁTIS, SEM API E SEM INTERNET.
// Fonte dos dados: popular-nrs.mjs (catálogo oficial já usado no projeto)
// + js/state.js (título/categoria/emoji dos cards das 38 NRs).
// Este módulo não toca DOM, não faz fetch e não lê secrets.
// Pode ser importado diretamente nos testes do Node.

import { NRS } from './state.js'

const BASE_VIGENTES =
    'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes'
const BASE_ARQUIVOS =
    'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras'
const BASE_CTPP =
    'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/ctpp-nrs'

// Título, descrição (resumo), objetivos e PDF de cada NR — dados reais do catálogo.
const DETALHES_NR = {
    1: {
        titulo: 'NR-01 — Disposições Gerais e Gerenciamento de Riscos Ocupacionais',
        descricao: 'Estabelece as disposições gerais e o Gerenciamento de Riscos Ocupacionais (GRO), incluindo o Programa de Gerenciamento de Riscos (PGR). Define responsabilidades, identificação de perigos, avaliação de riscos e medidas de prevenção. É a norma estruturante do sistema de segurança e saúde no trabalho.',
        objetivos: ['Entender as responsabilidades de empregador e trabalhador', 'Identificar perigos e avaliar riscos', 'Conhecer a estrutura do PGR e do GRO'],
        pdf: `${BASE_VIGENTES}/nr-01-atualizada-2025-i-3.pdf`
    },
    2: {
        titulo: 'NR-02 — Inspeção Prévia (Revogada)',
        descricao: 'Tratava da inspeção prévia em estabelecimentos e da comunicação de instalação e operação ao órgão fiscalizador. Foi revogada e seu conteúdo é mantido apenas como referência histórica.',
        objetivos: ['Saber que a NR-02 está revogada', 'Entender o contexto histórico da inspeção prévia'],
        pdf: `${BASE_ARQUIVOS}/nr-02_atualizada_2019.pdf`
    },
    3: {
        titulo: 'NR-03 — Embargo e Interdição',
        descricao: 'Define os procedimentos para embargo e interdição de estabelecimentos, setores, máquinas ou equipamentos com risco grave e iminente. É aplicada pela fiscalização do trabalho para paralisar atividades até a correção das irregularidades.',
        objetivos: ['Entender quando cabe embargo ou interdição', 'Conhecer o papel da fiscalização do trabalho', 'Saber como é feita a paralisação de atividades'],
        pdf: `${BASE_ARQUIVOS}/nr-03_atualizada_2019.pdf`
    },
    4: {
        titulo: 'NR-04 — Serviços Especializados em Segurança e em Medicina do Trabalho',
        descricao: 'Regulamenta os Serviços Especializados em Segurança e Medicina do Trabalho (SESMT), incluindo dimensionamento, atribuições e registro. Define os profissionais que compõem o serviço e as obrigações das empresas conforme o grau de risco e o número de empregados.',
        objetivos: ['Conhecer a composição do SESMT', 'Entender o dimensionamento por grau de risco', 'Identificar atribuições dos profissionais'],
        pdf: `${BASE_VIGENTES}/nr-04-atualizada-2023.pdf`
    },
    5: {
        titulo: 'NR-05 — Comissão Interna de Prevenção de Acidentes e de Assédio (CIPA)',
        descricao: 'Institui a Comissão Interna de Prevenção de Acidentes e de Assédio (CIPA) e define suas atribuições. Abrange composição, processo eleitoral, treinamento, reuniões e funcionamento da comissão.',
        objetivos: ['Entender como é eleita a CIPA', 'Conhecer as atribuições da comissão', 'Saber como funcionam as reuniões e o treinamento'],
        pdf: `${BASE_VIGENTES}/NR05atualizada2023.pdf`
    },
    6: {
        titulo: 'NR-06 — Equipamento de Proteção Individual (EPI)',
        descricao: 'Regulamenta a seleção, aquisição, fornecimento, uso, guarda e conservação de Equipamentos de Proteção Individual. Define responsabilidades de empregadores, trabalhadores e fabricantes, além do Certificado de Aprovação (CA).',
        objetivos: ['Saber como escolher o EPI correto', 'Entender a responsabilidade de cada parte', 'Conhecer a importância do Certificado de Aprovação'],
        pdf: `${BASE_VIGENTES}/nr-06-atualizada-2025-ii.pdf`
    },
    7: {
        titulo: 'NR-07 — Programa de Controle Médico de Saúde Ocupacional',
        descricao: 'Estabelece o Programa de Controle Médico de Saúde Ocupacional (PCMSO), com exames ocupacionais e vigilância da saúde dos trabalhadores. Define responsabilidades do empregador e do médico coordenador, incluindo o ASO e o relatório analítico.',
        objetivos: ['Conhecer os exames ocupacionais', 'Entender o papel do médico coordenador', 'Saber o que é o ASO e o relatório analítico'],
        pdf: `${BASE_VIGENTES}/nr-07-atualizada-2022-1.pdf`
    },
    8: {
        titulo: 'NR-08 — Edificações',
        descricao: 'Define requisitos técnicos de segurança e saúde para edificações, incluindo circulação, proteção contra quedas, instalações e manutenção. Aplica-se às construções onde são desenvolvidas atividades laborais.',
        objetivos: ['Conhecer os requisitos de circulação', 'Entender as proteções contra quedas', 'Saber sobre instalações e manutenção'],
        pdf: `${BASE_ARQUIVOS}/nr-08-atualizada-2022.pdf`
    },
    9: {
        titulo: 'NR-09 — Avaliação e Controle das Exposições Ocupacionais',
        descricao: 'Trata da avaliação e do controle das exposições ocupacionais a agentes físicos, químicos e biológicos. Integra o Gerenciamento de Riscos Ocupacionais e define etapas de identificação, avaliação, controle e monitoramento.',
        objetivos: ['Identificar agentes físicos, químicos e biológicos', 'Entender as etapas de avaliação e controle', 'Compreender a integração com o GRO'],
        pdf: `${BASE_VIGENTES}/nr-09-atualizada-2026.pdf`
    },
    10: {
        titulo: 'NR-10 — Segurança em Instalações e Serviços em Eletricidade',
        descricao: 'Estabelece os requisitos de segurança em instalações e serviços com eletricidade. Abrange desenergização, equipamentos de proteção, autorização, treinamento e procedimentos de trabalho.',
        objetivos: ['Aplicar o procedimento de desenergização', 'Conhecer os EPIs e autorizações necessários', 'Entender os requisitos de capacitação'],
        pdf: `${BASE_VIGENTES}/nr-10-atualizada-2026-1.pdf`
    },
    11: {
        titulo: 'NR-11 — Transporte, Movimentação, Armazenagem e Manuseio de Materiais',
        descricao: 'Regulamenta o transporte, a movimentação, a armazenagem e o manuseio de materiais. Define requisitos para equipamentos, operadores, sinalização, empilhamento e segurança das áreas de circulação.',
        objetivos: ['Conhecer os requisitos dos equipamentos', 'Entender a sinalização das áreas', 'Aplicar regras de empilhamento e circulação'],
        pdf: `${BASE_VIGENTES}/nr-11-atualizada-2016.pdf`
    },
    12: {
        titulo: 'NR-12 — Segurança no Trabalho em Máquinas e Equipamentos',
        descricao: 'Define requisitos de segurança para máquinas e equipamentos em todas as fases de sua vida útil. Trata de proteções, dispositivos de segurança, manutenção, capacitação e adequação dos equipamentos.',
        objetivos: ['Identificar proteções e dispositivos de segurança', 'Entender a manutenção segura', 'Conhecer os requisitos de capacitação'],
        pdf: `${BASE_VIGENTES}/nr-12-atualizada-2025.pdf`
    },
    13: {
        titulo: 'NR-13 — Caldeiras, Vasos de Pressão e Tubulações',
        descricao: 'Estabelece requisitos para caldeiras, vasos de pressão, tubulações e tanques metálicos de armazenamento. Abrange projeto, instalação, inspeção, operação, manutenção e certificação desses equipamentos.',
        objetivos: ['Conhecer os requisitos de projeto e instalação', 'Entender inspeção e certificação', 'Aplicar regras de operação e manutenção'],
        pdf: `${BASE_VIGENTES}/nr-13-atualizada-2023-b.pdf`
    },
    14: {
        titulo: 'NR-14 — Fornos',
        descricao: 'Define requisitos de segurança para fornos em geral, incluindo construção, instalação, operação e manutenção. Objetiva prevenir incêndios, explosões e exposições a calor e gases.',
        objetivos: ['Conhecer requisitos de construção e instalação', 'Prevenir incêndios e explosões', 'Controlar exposição a calor e gases'],
        pdf: `${BASE_ARQUIVOS}/nr-14-atualizada-2022.pdf`
    },
    15: {
        titulo: 'NR-15 — Atividades e Operações Insalubres',
        descricao: 'Regulamenta as atividades e operações insalubres, com limites de tolerância e critérios de caracterização. Trata de agentes físicos, químicos e biológicos e das medidas de controle correspondentes.',
        objetivos: ['Entender limites de tolerância', 'Caracterizar a insalubridade', 'Conhecer as medidas de controle'],
        pdf: `${BASE_VIGENTES}/nr-15-atualizada-2025.pdf`
    },
    16: {
        titulo: 'NR-16 — Atividades e Operações Perigosas',
        descricao: 'Regulamenta as atividades e operações perigosas, como explosivos, inflamáveis e energia elétrica. Define critérios de caracterização e requisitos de segurança para essas atividades.',
        objetivos: ['Caracterizar atividades perigosas', 'Conhecer os requisitos de segurança', 'Entender a diferença em relação à insalubridade'],
        pdf: `${BASE_VIGENTES}/nr-16-atualizada-2025-ii.pdf`
    },
    17: {
        titulo: 'NR-17 — Ergonomia',
        descricao: 'Estabelece parâmetros de ergonomia para adaptar as condições de trabalho às características dos trabalhadores. Abrange avaliação ergonômica, mobiliário, iluminação, levantamento de cargas e pausas.',
        objetivos: ['Realizar avaliação ergonômica', 'Adequar mobiliário e iluminação', 'Aplicar regras de levantamento de cargas e pausas'],
        pdf: `${BASE_VIGENTES}/nr-17-atualizada-2023.pdf`
    },
    18: {
        titulo: 'NR-18 — Segurança e Saúde no Trabalho na Indústria da Construção',
        descricao: 'Define requisitos de segurança e saúde na indústria da construção. Trata de canteiros, escavações, demolições, andaimes, instalações elétricas, máquinas e proteções coletivas.',
        objetivos: ['Organizar o canteiro de obras com segurança', 'Conhecer requisitos de andaimes e escavações', 'Aplicar proteções coletivas'],
        pdf: `${BASE_VIGENTES}/NR18atualizada2026I.pdf`
    },
    19: {
        titulo: 'NR-19 — Explosivos',
        descricao: 'Regulamenta o manuseio, o armazenamento e o transporte de explosivos e acessórios. Define requisitos para depósitos, operações, sinalização, capacitação e controle de riscos.',
        objetivos: ['Conhecer requisitos de depósitos', 'Aplicar regras de manuseio e transporte', 'Entender sinalização e capacitação'],
        pdf: `${BASE_VIGENTES}/nr-19-atualizada-2023.pdf`
    },
    20: {
        titulo: 'NR-20 — Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis',
        descricao: 'Estabelece requisitos para atividades com inflamáveis e combustíveis. Abrange projeto e operação de instalações, classificação de áreas, prevenção de incêndios e planos de emergência.',
        objetivos: ['Classificar áreas de risco', 'Conhecer requisitos de projeto e operação', 'Elaborar plano de emergência'],
        pdf: `${BASE_VIGENTES}/nr-20-atualizada-2025.pdf`
    },
    21: {
        titulo: 'NR-21 — Trabalhos a Céu Aberto',
        descricao: 'Define medidas de proteção para trabalhos realizados a céu aberto. Trata de abrigos, exposição a intempéries, insolação, calor, frio, umidade e condições sanitárias.',
        objetivos: ['Instalar abrigos adequados', 'Proteger contra insolação, calor e frio', 'Garantir condições sanitárias'],
        pdf: `${BASE_ARQUIVOS}/nr-21.pdf`
    },
    22: {
        titulo: 'NR-22 — Segurança e Saúde Ocupacional na Mineração',
        descricao: 'Regulamenta a segurança e a saúde ocupacional na mineração. Abrange lavra, beneficiamento, ventilação, explosivos, estabilidade de taludes, poeiras e emergências.',
        objetivos: ['Conhecer riscos da lavra e do beneficiamento', 'Entender ventilação e controle de poeiras', 'Aplicar regras de estabilidade e emergência'],
        pdf: `${BASE_VIGENTES}/nr-22-atualizada-2026.pdf`
    },
    23: {
        titulo: 'NR-23 — Proteção Contra Incêndios',
        descricao: 'Estabelece requisitos de proteção contra incêndios, incluindo prevenção, detecção, combate e saídas de emergência. Define medidas aplicáveis a edificações e locais de trabalho.',
        objetivos: ['Aplicar medidas de prevenção', 'Conhecer sistemas de detecção e combate', 'Dimensionar saídas de emergência'],
        pdf: `${BASE_ARQUIVOS}/nr-23-atualizada-2022.pdf`
    },
    24: {
        titulo: 'NR-24 — Condições Sanitárias e de Conforto nos Locais de Trabalho',
        descricao: 'Define condições sanitárias e de conforto nos locais de trabalho. Abrange instalações sanitárias, vestiários, refeitórios, água potável e condições de higiene.',
        objetivos: 'Instalar sanitários e vestiários adequados; garantir água potável; manter higiene e conforto'.split('; '),
        pdf: `${BASE_ARQUIVOS}/nr-24-atualizada-2022.pdf`
    },
    25: {
        titulo: 'NR-25 — Resíduos Industriais',
        descricao: 'Trata dos resíduos industriais e das medidas de segurança para seu manejo. Define requisitos de identificação, armazenamento, transporte e destinação, com proteção dos trabalhadores.',
        objetivos: ['Identificar e classificar resíduos', 'Aplicar regras de armazenamento e transporte', 'Conhecer a destinação correta'],
        pdf: `${BASE_ARQUIVOS}/nr-25-atualizada-2022-1.pdf`
    },
    26: {
        titulo: 'NR-26 — Sinalização de Segurança',
        descricao: 'Estabelece cores e sinalização de segurança para prevenção de acidentes e identificação de riscos. Define uso de cores, sinais, rotulagem e comunicação de perigos químicos.',
        objetivos: ['Aplicar cores e sinais de segurança', 'Rotular produtos e áreas corretamente', 'Comunicar perigos químicos'],
        pdf: `${BASE_ARQUIVOS}/nr-26-atualizada-2022.pdf`
    },
    27: {
        titulo: 'NR-27 — Registro Profissional do Técnico de Segurança do Trabalho (Revogada)',
        descricao: 'Tratava do registro profissional do Técnico de Segurança do Trabalho no Ministério do Trabalho. Foi revogada e seu conteúdo permanece apenas como referência histórica.',
        objetivos: ['Saber que a NR-27 está revogada', 'Entender o contexto histórico do registro profissional'],
        pdf: `${BASE_ARQUIVOS}/nr_27_revogada_2008.pdf`
    },
    28: {
        titulo: 'NR-28 — Fiscalização e Penalidades',
        descricao: 'Regulamenta a fiscalização do trabalho e as penalidades por descumprimento das normas de segurança e saúde no trabalho. Define infrações, critérios de multa e procedimentos de autuação.',
        objetivos: ['Conhecer infrações e penalidades', 'Entender critérios de multa', 'Compreender o procedimento de autuação'],
        pdf: `${BASE_VIGENTES}/nr-28-atualizada-2026.pdf`
    },
    29: {
        titulo: 'NR-29 — Segurança e Saúde no Trabalho Portuário',
        descricao: 'Estabelece segurança e saúde no trabalho portuário, em operações realizadas em portos organizados e instalações portuárias. Abrange movimentação de cargas, equipamentos, áreas de risco e treinamento.',
        objetivos: ['Conhecer riscos das operações portuárias', 'Aplicar regras de movimentação de cargas', 'Entender requisitos de treinamento'],
        pdf: `${BASE_VIGENTES}/nr-29-atualizada-2023.pdf`
    },
    30: {
        titulo: 'NR-30 — Segurança e Saúde no Trabalho Aquaviário',
        descricao: 'Regulamenta a segurança e a saúde no trabalho aquaviário, a bordo de embarcações e em atividades correlatas. Define requisitos de condições de trabalho, proteção, emergências e capacitação.',
        objetivos: ['Conhecer condições de trabalho a bordo', 'Aplicar medidas de proteção', 'Entender procedimentos de emergência'],
        pdf: `${BASE_VIGENTES}/nr-30-atualizada-2023.pdf`
    },
    31: {
        titulo: 'NR-31 — Segurança e Saúde no Trabalho na Agricultura e Pecuária',
        descricao: 'Estabelece requisitos de segurança e saúde na agricultura, pecuária, silvicultura, exploração florestal e aquicultura. Abrange máquinas, agrotóxicos, instalações, transporte e trabalho em campo.',
        objetivos: ['Aplicar regras para máquinas agrícolas', 'Controlar exposição a agrotóxicos', 'Garantir segurança no trabalho em campo'],
        pdf: `${BASE_VIGENTES}/nr-31-atualizada-2024-2.pdf`
    },
    32: {
        titulo: 'NR-32 — Segurança e Saúde no Trabalho em Serviços de Saúde',
        descricao: 'Define medidas de segurança e saúde em serviços de saúde. Trata de riscos biológicos, químicos e radiações, resíduos, vacinação, EPI e prevenção de acidentes com materiais perfurocortantes.',
        objetivos: ['Controlar riscos biológicos e químicos', 'Aplicar regras de vacinação e EPI', 'Prevenir acidentes perfurocortantes'],
        pdf: `${BASE_VIGENTES}/nr-32-atualizada-2023-1.pdf`
    },
    33: {
        titulo: 'NR-33 — Segurança e Saúde nos Trabalhos em Espaços Confinados',
        descricao: 'Regulamenta os trabalhos em espaços confinados. Define avaliação de riscos, monitoramento, controle de entrada, equipes, equipamentos e procedimentos de emergência e resgate.',
        objetivos: ['Avaliar riscos do espaço confinado', 'Controlar entrada e monitoramento', 'Planejar emergência e resgate'],
        pdf: `${BASE_ARQUIVOS}/nr-33-atualizada-2022-_retificada.pdf`
    },
    34: {
        titulo: 'NR-34 — Condições e Meio Ambiente de Trabalho na Construção Naval',
        descricao: 'Estabelece condições e meio ambiente de trabalho na indústria da construção, reparação e desmonte naval. Abrange plataformas, andaimes, içamento, trabalhos a quente e espaços confinados.',
        objetivos: ['Conhecer riscos da construção naval', 'Aplicar regras de andaimes e içamento', 'Controlar trabalhos a quente e espaços confinados'],
        pdf: `${BASE_VIGENTES}/nr-34-atualizada-2023-2.pdf`
    },
    35: {
        titulo: 'NR-35 — Trabalho em Altura',
        descricao: 'Regulamenta o trabalho em altura acima de dois metros. Define análise de risco, medidas de proteção, sistemas de ancoragem, acesso por cordas, capacitação e emergência.',
        objetivos: ['Fazer análise de risco antes de subir', 'Usar sistemas de ancoragem e proteção', 'Ser capacitado e ter plano de emergência'],
        pdf: `${BASE_VIGENTES}/nr-35-atualizada-2025-1.pdf`
    },
    36: {
        titulo: 'NR-36 — Segurança e Saúde no Trabalho em Empresas de Abate e Processamento de Carnes',
        descricao: 'Define requisitos de segurança e saúde em empresas de abate e processamento de carnes e derivados. Abrange ergonomia, frio, umidade, ruído, instrumentos cortantes e organização do trabalho.',
        objetivos: ['Controlar riscos de instrumentos cortantes', 'Adequar-se ao frio, umidade e ruído', 'Aplicar ergonomia na linha de abate'],
        pdf: `${BASE_VIGENTES}/nr-36-atualizada-2024-1.pdf`
    },
    37: {
        titulo: 'NR-37 — Segurança e Saúde em Plataformas de Petróleo',
        descricao: 'Estabelece segurança e saúde em plataformas de petróleo. Abrange instalações marítimas, operações, emergências, embarcações, mergulho e controle de riscos.',
        objetivos: ['Conhecer riscos de plataformas marítimas', 'Aplicar procedimentos de emergência', 'Controlar operações de mergulho e embarcações'],
        pdf: `${BASE_CTPP}/nr-37-atualizada-2023.pdf`
    },
    38: {
        titulo: 'NR-38 — Segurança e Saúde no Trabalho nas Atividades de Limpeza Urbana',
        descricao: 'Regulamenta a segurança e a saúde nas atividades de limpeza urbana e manejo de resíduos sólidos. Abrange coleta, transporte, varrição, poda, capina, riscos biológicos e equipamentos.',
        objetivos: ['Proteger trabalhadores de coleta e varrição', 'Controlar riscos biológicos', 'Usar equipamentos adequados'],
        pdf: `${BASE_VIGENTES}/NR38atualizada2026.pdf`
    }
}

// Catálogo imutável das 38 NRs: cruza os dados reais com o state.js da aplicação.
export const NRS_CONHECIMENTO = NRS.slice().sort((a, b) => a.n - b.n).map((nr) => {
    const detalhe = DETALHES_NR[nr.n] || {}
    return Object.freeze({
        numero: nr.n,
        titulo: detalhe.titulo || `NR-${nr.n} — ${nr.nome}`,
        nome: nr.nome,
        categoria: nr.cat,
        emoji: nr.emoji,
        descricao: detalhe.descricao || `Norma Regulamentadora número ${nr.n}.`,
        objetivos: Object.freeze(detalhe.objetivos || []),
        link: 'nrs',
        pdf: detalhe.pdf || null
    })
})

// Mapa de páginas da aplicação. `view` é a chave usada por nav() no main.js.
export const MAPA_PAGINAS = Object.freeze([
    Object.freeze({
        chaves: ['certificado', 'certificados', 'certificado pdf', 'emitir certificado', 'gerar certificado'],
        view: 'certificados',
        titulo: 'Certificados',
        descricao: 'Fica em Certificados. Lá você consulta, gera e baixa o PDF com QR Code de verificação.'
    }),
    Object.freeze({
        chaves: ['trabalho', 'trabalhos', 'atividade', 'atividades', 'entrega', 'entregar', 'envio de trabalho', 'avaliacao pratica'],
        view: 'provas',
        titulo: 'Trabalhos e avaliações',
        descricao: 'Fica em Provas/Avaliações. Lá você envia o trabalho prático em PDF e acompanha a correção.'
    }),
    Object.freeze({
        chaves: ['boletim', 'nota', 'notas', 'desempenho', 'media', 'média'],
        view: 'boletim',
        titulo: 'Boletim',
        descricao: 'Fica no Boletim. Lá você vê suas notas, médias e o desempenho por NR.'
    }),
    Object.freeze({
        chaves: ['nr', 'nrs', 'norma', 'normas', 'catalogo', 'catálogo', 'curso', 'cursos'],
        view: 'nrs',
        titulo: 'Catálogo de NRs',
        descricao: 'Fica no Catálogo de NRs. Lá estão as 38 Normas Regulamentadoras com busca e filtros.'
    }),
    Object.freeze({
        chaves: ['videoaula', 'videoaulas', 'aula', 'aulas', 'video', 'vídeo', 'trilha', 'trilhas'],
        view: 'videoaulas',
        titulo: 'Videoaulas',
        descricao: 'Fica em Videoaulas. Lá estão as aulas em HD organizadas por NR.'
    }),
    Object.freeze({
        chaves: ['material', 'materiais', 'pdf', 'apostila', 'arquivo', 'download'],
        view: 'materiais',
        titulo: 'Materiais',
        descricao: 'Fica em Materiais. Lá você baixa apostilas e arquivos de apoio das NRs.'
    }),
    Object.freeze({
        chaves: ['salas', 'sala', 'ao vivo', 'aula ao vivo', 'webinar'],
        view: 'salas',
        titulo: 'Salas ao vivo',
        descricao: 'Fica em Salas. Lá você participa das aulas ao vivo com os instrutores.'
    }),
    Object.freeze({
        chaves: ['forum', 'fórum', 'duvida', 'dúvida', 'pergunta', 'comunidade'],
        view: 'forum',
        titulo: 'Fórum',
        descricao: 'Fica no Fórum. Lá você posta dúvidas e conversa com instrutores e colegas.'
    }),
    Object.freeze({
        chaves: ['prova', 'provas', 'teste', 'avaliacao', 'avaliação', 'questionario', 'questionário'],
        view: 'provas',
        titulo: 'Provas e avaliações',
        descricao: 'Fica em Provas/Avaliações. Lá você faz e envia suas avaliações.'
    }),
    Object.freeze({
        chaves: ['config', 'configuracao', 'configuração', 'tema', 'senha', 'perfil', 'dados'],
        view: 'config',
        titulo: 'Configurações',
        descricao: 'Fica em Configurações. Lá você ajusta tema, vídeo, áudio e seus dados.'
    }),
    Object.freeze({
        chaves: ['dossie', 'dossiê', 'sistec', 'documento', 'documentos'],
        view: 'dossie',
        titulo: 'Dossiê',
        descricao: 'Fica no Dossiê. Lá você consulta a ficha e os documentos obrigatórios.'
    }),
    Object.freeze({
        chaves: ['painel admin', 'admin', 'modo deus', 'administracao', 'administração', 'usuarios', 'usuários'],
        view: 'admin',
        titulo: 'Painel Admin',
        descricao: 'Fica no Modo Deus, disponível somente para administradores.'
    })
])

// Fatos da plataforma: regras de negócio, perfis, certificação e cobrança.
// Tudo aqui vem do próprio repositório (README, telas e migrations), sem internet.
export const FATOS_PLATAFORMA = Object.freeze([
    Object.freeze({
        chaves: ['como funciona o certificado', 'validade do certificado', 'qr code', 'comprovante', 'certificado reconhecido'],
        resposta: 'O certificado é gerado em PDF ao concluir a NR, com dados do aluno, carga horária, nota e QR Code de verificação. A validade varia conforme a NR: a NR-10 e a NR-35 exigem reciclagem a cada 2 anos. Fica em Certificados.'
    }),
    Object.freeze({
        chaves: ['quantas nr', 'quantas normas', '38 nr', 'numeros das nr', 'categorias das nr'],
        resposta: 'O catálogo tem 38 Normas Regulamentadoras, divididas em gerais, específicas e setoriais. Posso explicar qualquer uma delas: é só citar o número, por exemplo "o que faz a NR 35?".'
    }),
    Object.freeze({
        chaves: ['quem pode fazer', 'perfil admin', 'perfil professor', 'perfil aluno', 'perfis', 'papéis', 'papeis', 'modo deus'],
        resposta: 'A SulSafe tem três papéis: ADMIN vê tudo e gerencia usuários; PROFESSOR sobe materiais, cria avaliações, dá notas e emite certificados; ALUNO estuda, faz trabalhos e acompanha o boletim. O perfil é definido pelo administrador no Modo Deus.'
    }),
    Object.freeze({
        chaves: ['como funciona a cobranca', 'como funciona o pagamento', 'quanto custa', 'preco', 'preço', 'plano mensal', 'plano anual', 'mercado pago', 'boleto', 'reembolso'],
        resposta: 'A cobrança é manual, por orçamento: o administrador registra o pagamento em transacoes com o motivo da operação. Não há preço fixo publicado nem processamento online de pagamento; valores são negociados diretamente com a SulSafe.'
    }),
    Object.freeze({
        chaves: ['professor ia', 'professor i a', 'maic', 'criar curso com ia', 'api propria', 'api plugavel', 'byoa', 'provedor'],
        resposta: 'O Professor I.A é a automação que cria cursos e avaliações, cobrada à parte e sob consulta. Cada empresa pode usar a API da SulSafe ou a própria API (OpenAI, Gemini, Anthropic ou custom), configurada só pelo ADMIN. Enquanto estiver desativado, o botão "Criar com I.A" não aparece. Essa geração ainda está sendo preparada.'
    }),
    Object.freeze({
        chaves: ['voce usa internet', 'usa gemini', 'usa api', 'tem api', 'internet', 'gratis', 'grátis', 'custo da secretaria', 'sua funcao', 'sua função'],
        resposta: 'Eu sou a Secretária da SulSafe: funciono 100% local, sem API externa e sem internet. Estou inclusa na plataforma e não tenho custo adicional. Respondo sobre as 38 NRs e sobre onde fica cada recurso daqui.'
    }),
    Object.freeze({
        chaves: ['esqueci a senha', 'redefinir senha', 'nao consigo entrar', 'nao consigo logar', 'login'],
        resposta: 'Use a tela de redefinição de senha (reset-password.html). Se a conta estiver como pendente, aguarde a aprovação do administrador na tela de Pendentes.'
    }),
    Object.freeze({
        chaves: ['pendente', 'aprovacao', 'aprovação', 'liberar usuario', 'conta bloqueada'],
        resposta: 'Contas novas ficam como pendentes até o ADMIN aprovar em Pendentes ou no Modo Deus. Se foi bloqueada, o ADMIN pode liberar o acesso novamente.'
    }),
    Object.freeze({
        chaves: ['dossie sistec', 'documentos obrigatorios', 'cpf', 'almoxarifado', 'forum duvidas'],
        resposta: 'O dossiê reúne a ficha e os documentos obrigatórios validados por CPF. O Fórum é para dúvidas com instrutores e colegas, e o Almoxarifado controla EPIs e estoque com movimentações registradas.'
    })
])

const PAGINAS_PERMITIDAS = new Set(MAPA_PAGINAS.map(p => p.view))

// Normaliza a pergunta: minúsculas, sem acentos e sem pontuação de tag.
export function normalizarPergunta(texto) {
    return String(texto ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

// Encontra a NR citada. Aceita "NR 35", "nr35", "nr-35", "NR 035".
export function buscarNR(texto) {
    const normalizado = normalizarPergunta(texto)
    const encontrado = /\bnr\s*0*(\d{1,2})\b/.exec(normalizado)
    if (!encontrado) return null
    return NRS_CONHECIMENTO.find(nr => nr.numero === Number(encontrado[1])) || null
}

// Encontra a página citada. A palavra "nr" sozinha não é navegação: cai no catálogo.
export function buscarPagina(texto) {
    const normalizado = normalizarPergunta(texto)
    let melhor = null
    let maior = 0

    for (const pagina of MAPA_PAGINAS) {
        for (const chave of pagina.chaves) {
            const alvo = normalizarPergunta(chave)
            if (normalizado.includes(alvo) && alvo.length > maior) {
                melhor = pagina
                maior = alvo.length
            }
        }
    }

    return melhor
}

// Busca um fato da plataforma pela chave mais específica encontrada.
export function buscarFato(texto) {
    const normalizado = normalizarPergunta(texto)
    let melhor = null
    let maior = 0

    for (const fato of FATOS_PLATAFORMA) {
        for (const chave of fato.chaves) {
            const alvo = normalizarPergunta(chave)
            if (normalizado.includes(alvo) && alvo.length > maior) {
                melhor = fato
                maior = alvo.length
            }
        }
    }

    return melhor
}

export function paginaEhValida(view) {
    return PAGINAS_PERMITIDAS.has(view)
}

// Perguntas de prova/gabarito são recusadas antes de qualquer outra intenção.
function ehPedidoDeGabarito(normalizado) {
    if (/\b(gabarito|chave de respostas|responder por mim|fazer a prova por mim|colar resposta)\b/.test(normalizado)) return true

    const pedeResposta = /\b(resposta|respostas|responder|responde|solucao|solucoes)\b/.test(normalizado)
    const contextoProva = /\b(prova|avaliacao|teste|questionario|quiz)\b/.test(normalizado)
    return pedeResposta && contextoProva
}

function ehSaudacao(normalizado) {
    return /^(oi|ola|bom dia|boa tarde|boa noite|e ai|salve)\b/.test(normalizado)
}

function formatarNR(nr) {
    const objetivos = nr.objetivos.map(item => `- ${item}`).join('\n')
    return [
        `**NR ${String(nr.numero).padStart(2, '0')} — ${nr.titulo.replace(/^NR-\d+\s+—\s+/, '')}**`,
        '',
        nr.descricao,
        '',
        '**Objetivos:**',
        objetivos,
        '',
        `O card dessa NR fica no Catálogo de NRs. PDF oficial: ${nr.pdf || 'indisponível no catálogo'}`
    ].join('\n')
}

// Resposta da Secretária. Sempre retorna texto puro (Markdown leve),
// que a view faz passar por renderizarMensagemIA() antes de exibir.
export function responderSecretaria(pergunta) {
    const normalizado = normalizarPergunta(pergunta)

    if (!normalizado) {
        return 'Digite sua pergunta. Posso ajudar com NRs, certificados, trabalhos, boletim e navegação da plataforma.'
    }

    if (ehPedidoDeGabarito(normalizado)) {
        return 'Não posso ajudar com prova, estude o material.'
    }

    if (ehSaudacao(normalizado)) {
        return 'Olá! Sou a Secretária da SulSafe, inclusa na sua conta e sem custo. Posso indicar onde fica cada página e explicar o conteúdo dos cards das 38 NRs. Sobre o que você precisa?'
    }

    const nr = buscarNR(normalizado)
    if (nr) return formatarNR(nr)

    const fato = buscarFato(normalizado)
    if (fato) return fato.resposta

    const pagina = buscarPagina(normalizado)
    if (pagina) {
        return `**${pagina.titulo}**\n\n${pagina.descricao}\n\nPara abrir, use o menu lateral ou o atalho **${pagina.titulo}**.`
    }

    return 'Eu só ajudo com coisas da SulSafe.'
}
