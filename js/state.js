// ============================================================
// STATE - ESTADO GLOBAL DA APLICAÇÃO
// ============================================================

export const S = {
    user: null,
    cfg: {
        tema: 'verde',
        qual: 'auto',
        speed: '1',
        vol: 100,
        notifs: true
    },
    currentView: 'inicio',
    prevView: null,
    views: {},
    sidebar: null
}

// Lista das 38 NRs com aliases de compatibilidade (.n / .id e .nome / .nm)
const NRS_BASE = [
    { n: 1,  nome: 'Disposições Gerais e Gerenciamento de Riscos', cat: 'gerais', emoji: '📋' },
    { n: 2,  nome: 'Inspeção Prévia', cat: 'gerais', emoji: '📋' },
    { n: 3,  nome: 'Embargo ou Interdição', cat: 'gerais', emoji: '📋' },
    { n: 4,  nome: 'SESMT — Serviços Especializados', cat: 'gerais', emoji: '📋' },
    { n: 5,  nome: 'CIPA — Comissão Interna de Prevenção', cat: 'gerais', emoji: '📋' },
    { n: 6,  nome: 'EPI — Equipamento de Proteção Individual', cat: 'gerais', emoji: '🦺' },
    { n: 7,  nome: 'PCMSO — Saúde Ocupacional', cat: 'gerais', emoji: '⚕️' },
    { n: 8,  nome: 'Edificações', cat: 'gerais', emoji: '🏢' },
    { n: 9,  nome: 'Avaliação de Riscos Ambientais (PGR)', cat: 'gerais', emoji: '📋' },
    { n: 15, nome: 'Atividades e Operações Insalubres', cat: 'gerais', emoji: '⚠️' },
    { n: 16, nome: 'Atividades e Operações Perigosas', cat: 'gerais', emoji: '⚠️' },
    { n: 17, nome: 'Ergonomia', cat: 'gerais', emoji: '🎯' },
    { n: 24, nome: 'Condições Sanitárias e de Conforto', cat: 'gerais', emoji: '🚿' },
    { n: 25, nome: 'Resíduos Industriais', cat: 'gerais', emoji: '🗑️' },
    { n: 26, nome: 'Sinalização de Segurança', cat: 'gerais', emoji: '🚸' },
    { n: 28, nome: 'Fiscalização e Penalidades', cat: 'gerais', emoji: '📋' },
    { n: 10, nome: 'Segurança em Eletricidade', cat: 'especificas', emoji: '⚡' },
    { n: 11, nome: 'Movimentação e Armazenagem de Cargas', cat: 'especificas', emoji: '📦' },
    { n: 12, nome: 'Máquinas e Equipamentos', cat: 'especificas', emoji: '🏭' },
    { n: 13, nome: 'Vasos de Pressão e Caldeiras', cat: 'especificas', emoji: '🛢️' },
    { n: 14, nome: 'Fornos Industriais', cat: 'especificas', emoji: '🔥' },
    { n: 19, nome: 'Explosivos', cat: 'especificas', emoji: '💥' },
    { n: 20, nome: 'Inflamáveis e Combustíveis', cat: 'especificas', emoji: '🔥' },
    { n: 23, nome: 'Proteção Contra Incêndios', cat: 'especificas', emoji: '🧯' },
    { n: 33, nome: 'Espaços Confinados', cat: 'especificas', emoji: '🔬' },
    { n: 35, nome: 'Trabalho em Altura', cat: 'especificas', emoji: '🪜' },
    { n: 18, nome: 'Indústria da Construção Civil', cat: 'setoriais', emoji: '🏗️' },
    { n: 21, nome: 'Trabalho a Céu Aberto', cat: 'setoriais', emoji: '☀️' },
    { n: 22, nome: 'Mineração', cat: 'setoriais', emoji: '⛏️' },
    { n: 27, nome: 'Registro Profissional (Histórico)', cat: 'setoriais', emoji: '📜' },
    { n: 29, nome: 'Segurança e Saúde nos Portos', cat: 'setoriais', emoji: '🚢' },
    { n: 30, nome: 'Trabalho Aquaviário', cat: 'setoriais', emoji: '🚤' },
    { n: 31, nome: 'Agricultura, Pecuária e Florestal', cat: 'setoriais', emoji: '🌾' },
    { n: 32, nome: 'Serviços de Saúde', cat: 'setoriais', emoji: '⚕️' },
    { n: 34, nome: 'Construção, Reparação e Desmontagem', cat: 'setoriais', emoji: '🏗️' },
    { n: 36, nome: 'Abate e Processamento de Carnes', cat: 'setoriais', emoji: '🥩' },
    { n: 37, nome: 'Plataformas de Petróleo', cat: 'setoriais', emoji: '🛢️' },
    { n: 38, nome: 'Limpeza Urbana e Resíduos Sólidos', cat: 'setoriais', emoji: '🚛' }
]

export const NRS = NRS_BASE.map(item => ({
    ...item,
    id: item.n,
    nm: item.nome
}))

// Exportar NRS como NRS para compatibilidade
export { NRS as NRS_LIST }

// Helper do UID do usuário atual
export function uid() {
    return S.user?.id || null
}

// Role helpers
export function role() {
    return S.user?.role || 'aluno'
}

export function isAdmin() {
    const r = role()
    return r === 'admin' || r === 'super_admin'
}

export function isProf() {
    return role() === 'professor'
}

export function canManage() {
    const r = role()
    return r === 'admin' || r === 'super_admin' || r === 'professor'
}

// Formatador de cards de estatística
export function stC(v, l, ic) {
    return `<div class="st"><div class="st-v">${v}</div><div class="st-l"><i class="fas ${ic}" style="margin-right:6px"></i>${l}</div></div>`
}

// Formatador de cards de navegação rápida
export function cCard(ic, t, d, v) {
    return `<div class="card" onclick="window.nav('${v}')"><div class="card-ic"><i class="fas ${ic}"></i></div><div class="card-t">${t}</div><div class="card-d">${d}</div></div>`
}

export function registerView(name, fn) {
    S.views[name] = fn
}

export function setRenderSidebar(fn) {
    S.sidebar = fn
}

// Date format
export function fmtD(d) {
    if (!d) return ''
    const dt = new Date(d)
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Função de navegação global
export function nav(view) {
    S.prevView = S.currentView
    S.currentView = view
    if (S.sidebar) S.sidebar()
    renderView()
}

export function renderView() {
    const viewFn = S.views[S.currentView]
    if (!viewFn) return
    const content = document.getElementById('appContent')
    if (!content) return

    const irAoTopo = () => {
        try {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        } catch {
            window.scrollTo(0, 0)
        }
    }

    try {
        const res = viewFn()
        if (typeof res === 'string') {
            content.innerHTML = res
            irAoTopo()
        } else if (res && typeof res.then === 'function') {
            res.then(html => {
                if (typeof html === 'string') {
                    content.innerHTML = html
                    irAoTopo()
                }
            }).catch(err => {
                console.error('Erro na view assíncrona:', err)
            })
        }
    } catch (e) {
        console.error('Erro ao renderizar view:', e)
    }
}

// Funções de configuração
export function loadCfg() {
    const saved = localStorage.getItem('ss_cfg')
    if (!saved) return
    try {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed === 'object') {
            S.cfg = { ...S.cfg, ...parsed }
            if (S.cfg.tema && S.cfg.tema !== 'verde') {
                document.body.className = 't-' + S.cfg.tema
            }
        }
    } catch (e) {
        console.warn('Erro ao carregar configurações:', e)
    }
}

export function saveCfg() {
    localStorage.setItem('ss_cfg', JSON.stringify(S.cfg))
}

// Tornar helpers globais para facilitar eventos inline
window.nav = nav
window.uid = uid
window.role = role
window.isAdmin = isAdmin
window.isProf = isProf
window.canManage = canManage
window.stC = stC
window.cCard = cCard
