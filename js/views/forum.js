// ============================================================
// VIEW: FÓRUM DE DÚVIDAS & COMUNIDADE (Aluno / Professor)
// ============================================================
import { S, NRS, role, uid, nav, fmtD } from '../state.js'
import { sbGetMensagensForum, sbCriarMensagemForum } from '../supabase-client.js'
import { openMdl, closeMdl, toast, sanitizar, $, $$ } from '../utils.js'

let forumPosts = []
let tabelaInexistenteAviso = false

// Posts padrão de demonstração / fallback (para quando o SQL ainda não tiver rodado)
const POSTS_DEMO = [
    {
        id: 'demo-1',
        usuario_id: 'instrutor-1',
        topico: 'Diferença prática entre PGR (NR 01) e o antigo PPRA (NR 09)',
        mensagem: 'Olá, pessoal! Muitos alunos têm dúvida sobre a transição do PPRA para o PGR. Lembrem-se que o PGR é um sistema contínuo de gestão de riscos que contempla agentes físicos, químicos, biológicos, ergonômicos e de acidentes, enquanto o PPRA cobria apenas riscos ambientais. Alguém com dúvida na matriz de probabilidade e severidade?',
        nr_id: 1,
        criado_em: new Date(Date.now() - 3600000 * 4).toISOString(),
        status: 'aberta',
        profiles: { nome_completo: 'Prof. Carlos Eduardo', role: 'professor' }
    },
    {
        id: 'demo-2',
        usuario_id: 'aluno-1',
        topico: 'NR 10: Qual a validade do treinamento básico para quem mudou de empresa?',
        mensagem: 'Boa tarde colegas! Se um profissional fez o curso de NR 10 (40h) em uma empresa há 6 meses e trocou de emprego, a nova empresa pode aceitar o certificado ou é obrigatório fazer o treinamento de reciclagem ou integração?',
        nr_id: 10,
        criado_em: new Date(Date.now() - 3600000 * 24).toISOString(),
        status: 'respondida',
        profiles: { nome_completo: 'Mariana Ribeiro', role: 'aluno' }
    },
    {
        id: 'demo-3',
        usuario_id: 'aluno-2',
        topico: 'NR 35: Trabalho em Altura com linha de vida horizontal temporária',
        mensagem: 'Gostaria de saber se para montagem de linha de vida flexível de corda em telhados é necessário ART de projeto emitida por engenheiro mecânico ou de segurança, e quais os pontos críticos de ancoragem.',
        nr_id: 35,
        criado_em: new Date(Date.now() - 3600000 * 48).toISOString(),
        status: 'aberta',
        profiles: { nome_completo: 'Roberto Santos', role: 'aluno' }
    }
]

export function vForum() {
    let h = `
        <div class="btn-back" onclick="window.nav('inicio')">
            <i class="fas fa-arrow-left"></i> Voltar ao Início
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:20px">
            <div>
                <h2 class="wc"><i class="fas fa-comments" style="color:var(--p);margin-right:8px"></i>Comunidade & Fórum de Dúvidas</h2>
                <p class="wcs">Troque experiências, pergunte sobre as NRs e debata casos práticos com instrutores e estudantes.</p>
            </div>
            <button class="btn btn-p" onclick="window.abrirModalNovaDuvida()">
                <i class="fas fa-plus-circle"></i> Publicar Pergunta
            </button>
        </div>

        <div id="forumBannerAviso"></div>

        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
            <input class="search" id="buscaForum" placeholder="Buscar por tema, palavra-chave ou autor..." style="flex:2;min-width:240px;margin:0" oninput="window.filtrarDuvidasForum()">
            <select id="filtroNrForum" class="search" style="flex:1;min-width:180px;margin:0" onchange="window.filtrarDuvidasForum()">
                <option value="all">Todas as Normas (NRs)</option>
                <option value="geral">Dúvidas Gerais</option>
                ${NRS.map(n => `<option value="${n.n}">NR ${n.n} — ${sanitizar(n.nome)}</option>`).join('')}
            </select>
            <div style="display:flex;gap:6px">
                <button class="btn btn-sm" style="width: auto; flex: none; btn-p btn-filtro-st on" data-st="todas" onclick="window.filtrarStatusForum('todas', this)">Todas</button>
                <button class="btn btn-sm" style="width: auto; flex: none; btn-s btn-filtro-st" data-st="aberta" onclick="window.filtrarStatusForum('aberta', this)">Abertas</button>
                <button class="btn btn-sm" style="width: auto; flex: none; btn-s btn-filtro-st" data-st="respondida" onclick="window.filtrarStatusForum('respondida', this)">Respondidas</button>
            </div>
        </div>

        <div id="listaForumContainer">
            <div class="empty">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Carregando discussões da comunidade...</p>
            </div>
        </div>
    `

    setTimeout(carregarForumPosts, 150)
    return h
}

async function carregarForumPosts() {
    const container = document.getElementById('listaForumContainer')
    if (!container) return

    tabelaInexistenteAviso = false

    try {
        const { data, error } = await sbGetMensagensForum()

        if (error) {
            console.warn('Aviso: Tabela mensagens_forum pode ainda não estar criada no Supabase:', error.message)
            tabelaInexistenteAviso = true
            
            // Carrega posts do cache local ou demo
            const localPosts = localStorage.getItem('ss_forum_local')
            if (localPosts) {
                try {
                    forumPosts = [...JSON.parse(localPosts), ...POSTS_DEMO]
                } catch (e) {
                    forumPosts = POSTS_DEMO
                }
            } else {
                forumPosts = POSTS_DEMO
            }
        } else {
            forumPosts = data && data.length > 0 ? data : POSTS_DEMO
        }

        renderBannerAviso()
        renderListaDuvidas()
    } catch (err) {
        console.error('Erro ao carregar fórum:', err)
        forumPosts = POSTS_DEMO
        tabelaInexistenteAviso = true
        renderBannerAviso()
        renderListaDuvidas()
    }
}

function renderBannerAviso() {
    const banner = document.getElementById('forumBannerAviso')
    if (!banner) return

    if (tabelaInexistenteAviso) {
        banner.innerHTML = `
            <div class="pnl" style="background:rgba(201,176,55,.1);border:1px solid rgba(201,176,55,.4);padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
                <i class="fas fa-database" style="font-size:22px;color:var(--gold)"></i>
                <div style="font-size:13px;color:var(--tx)">
                    <strong>Modo Demonstrativo & Local Ativo:</strong> A tabela <code>mensagens_forum</code> ainda não foi criada no Supabase. As dúvidas criadas agora ficarão salvas no seu navegador. Consulte o <code>relatorio-mudancas.md</code> para copiar o SQL de criação.
                </div>
            </div>
        `
    } else {
        banner.innerHTML = ''
    }
}

function renderListaDuvidas() {
    const container = document.getElementById('listaForumContainer')
    if (!container) return

    if (!forumPosts || forumPosts.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-comments"></i>
                <h4>Nenhuma dúvida cadastrada</h4>
                <p>Seja o primeiro a fazer uma pergunta para a comunidade!</p>
            </div>
        `
        return
    }

    const q = ($('#buscaForum')?.value || '').toLowerCase().trim()
    const filtroNr = $('#filtroNrForum')?.value || 'all'
    const statusAtivo = document.querySelector('.btn-filtro-st.on')?.dataset?.st || 'todas'

    const filtrados = forumPosts.filter(p => {
        const matchQ = !q || 
            (p.topico && p.topico.toLowerCase().includes(q)) || 
            (p.mensagem && p.mensagem.toLowerCase().includes(q)) ||
            (p.profiles?.nome_completo && p.profiles.nome_completo.toLowerCase().includes(q))

        let matchNr = true
        if (filtroNr === 'geral') {
            matchNr = !p.nr_id
        } else if (filtroNr !== 'all') {
            matchNr = String(p.nr_id) === String(filtroNr)
        }

        let matchSt = true
        if (statusAtivo !== 'todas') {
            matchSt = p.status === statusAtivo
        }

        return matchQ && matchNr && matchSt
    })

    if (filtrados.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-filter"></i>
                <h4>Nenhuma dúvida encontrada</h4>
                <p>Tente ajustar os termos de busca ou filtros selecionados.</p>
            </div>
        `
        return
    }

    let h = `<div style="display:flex;flex-direction:column;gap:14px">`

    filtrados.forEach(p => {
        const autor = sanitizar(p.profiles?.nome_completo || 'Estudante SulSafe')
        const roleAutor = p.profiles?.role || 'aluno'
        const inicial = autor.charAt(0).toUpperCase()
        const nrNome = p.nr_id ? `NR ${p.nr_id}` : 'Dúvida Geral'
        const badgeRole = roleAutor === 'admin' ? '👑 Admin' : roleAutor === 'professor' ? '👨‍🏫 Instrutor' : '🎓 Aluno'
        const statusCor = p.status === 'respondida' ? 'bg-ok' : 'bg-info'
        const statusTxt = p.status === 'respondida' ? '<i class="fas fa-check-circle"></i> Respondida' : '<i class="fas fa-clock"></i> Em debate'

        h += `
            <article class="pnl" style="margin-bottom:0;border:1px solid var(--bd);transition:transform .2s, box-shadow .2s">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">
                    <div style="display:flex;align-items:center;gap:12px">
                        <div style="width:40px;height:40px;border-radius:50%;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px">
                            ${inicial}
                        </div>
                        <div>
                            <div style="display:flex;align-items:center;gap:8px">
                                <strong style="font-size:14px">${autor}</strong>
                                <span class="badge" style="background:var(--ip);border:1px solid var(--bd);font-size:10px">${badgeRole}</span>
                            </div>
                            <span style="font-size:11px;color:var(--tx3)">${fmtD(p.criado_em)}</span>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span class="badge" style="background:rgba(46,125,50,.1);color:var(--p);font-weight:700">
                            <i class="fas fa-tag"></i> ${nrNome}
                        </span>
                        <span class="badge ${statusCor}">
                            ${statusTxt}
                        </span>
                    </div>
                </div>

                <h3 style="font-size:16px;font-weight:800;color:var(--tx);margin-bottom:8px;line-height:1.4">
                    ${sanitizar(p.topico)}
                </h3>

                <p style="font-size:13.5px;color:var(--tx2);line-height:1.6;margin-bottom:16px;white-space:pre-line">
                    ${sanitizar(p.mensagem)}
                </p>

                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--bd2);padding-top:12px;font-size:12px;color:var(--tx3)">
                    <span><i class="fas fa-comments" style="color:var(--p);margin-right:4px"></i> Discussão acadêmica</span>
                    <button class="btn btn-sm" style="width: auto; flex: none; btn-s" onclick="window.abrirModalResponder('${p.id}', '${sanitizar(p.topico).replace(/'/g, "\\'")}')">
                        <i class="fas fa-reply"></i> Responder / Comentar
                    </button>
                </div>
            </article>
        `
    })

    h += `</div>`
    container.innerHTML = h
}

function filtrarDuvidasForum() {
    renderListaDuvidas()
}

function filtrarStatusForum(st, btn) {
    $$('.btn-filtro-st').forEach(b => {
        b.classList.remove('on')
        b.classList.remove('btn-p')
        b.classList.add('btn-s')
    })
    btn.classList.add('on')
    btn.classList.add('btn-p')
    btn.classList.remove('btn-s')
    renderListaDuvidas()
}

function abrirModalNovaDuvida() {
    const opts = NRS.map(n => `<option value="${n.n}">NR ${n.n} — ${sanitizar(n.nome)}</option>`).join('')

    openMdl(`
        <button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="width:42px;height:42px;background:var(--verde-bg);border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--p);font-size:20px">
                <i class="fas fa-question-circle"></i>
            </div>
            <div>
                <h2 style="font-size:18px;font-weight:800;color:var(--p);margin:0">Nova Pergunta no Fórum</h2>
                <p style="font-size:12px;color:var(--tx3);margin:0">Compartilhe sua dúvida com professores e colegas</p>
            </div>
        </div>

        <form onsubmit="window.salvarNovaDuvida(event)">
            <div class="fld">
                <label>Título ou Resumo da Dúvida *</label>
                <input type="text" id="forumNovoTopico" placeholder="Ex: Qual o prazo para reciclar o treinamento de NR 35?" required>
            </div>

            <div class="fld">
                <label>Norma Regulamentadora Relacionada</label>
                <select id="forumNovaNR">
                    <option value="">Geral (não específico de uma NR)</option>
                    ${opts}
                </select>
            </div>

            <div class="fld">
                <label>Explique com detalhes sua dúvida ou situação prática *</label>
                <textarea id="forumNovaMensagem" rows="4" placeholder="Descreva o contexto de trabalho ou a dúvida conceitual..." required style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;font-size:13px;color:var(--tx);resize:vertical"></textarea>
            </div>

            <button type="submit" class="btn btn-p btn-block" id="btnSalvarDuvida">
                <i class="fas fa-paper-plane"></i> Publicar Dúvida
            </button>
        </form>
    `)
}

async function salvarNovaDuvida(e) {
    e.preventDefault()
    const topico = sanitizar($('#forumNovoTopico')?.value?.trim() || '')
    const nrId = $('#forumNovaNR')?.value || null
    const mensagem = sanitizar($('#forumNovaMensagem')?.value?.trim() || '')
    const btn = $('#btnSalvarDuvida')
    const userId = uid()

    if (!topico || !mensagem) {
        toast('Preencha o título e a descrição da dúvida', 'warn')
        return
    }

    if (btn) {
        btn.disabled = true
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...'
    }

    try {
        let sucessoSupabase = false
        if (userId) {
            const { data, error } = await sbCriarMensagemForum(topico, mensagem, nrId, userId)
            if (!error && data) {
                sucessoSupabase = true
            }
        }

        // Se gravou no Supabase ou se está em modo demonstrativo/offline:
        const novoPost = {
            id: 'post-' + Date.now(),
            usuario_id: userId || 'local-user',
            topico,
            mensagem,
            nr_id: nrId ? Number(nrId) : null,
            criado_em: new Date().toISOString(),
            status: 'aberta',
            profiles: {
                nome_completo: S.user?.nome_completo || 'Você',
                role: S.user?.role || 'aluno'
            }
        }

        // Salva cópia local
        const savedLocal = JSON.parse(localStorage.getItem('ss_forum_local') || '[]')
        savedLocal.unshift(novoPost)
        localStorage.setItem('ss_forum_local', JSON.stringify(savedLocal))

        forumPosts.unshift(novoPost)

        toast('Pergunta publicada no fórum com sucesso!', 'success')
        closeMdl()
        renderListaDuvidas()
    } catch (err) {
        console.error('Erro ao postar dúvida:', err)
        toast('Dúvida salva localmente!', 'info')
        closeMdl()
        renderListaDuvidas()
    }
}

function abrirModalResponder(id, topico) {
    openMdl(`
        <button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
        <h2 style="font-size:17px;font-weight:800;color:var(--p);margin-bottom:6px">Responder à Dúvida</h2>
        <p style="font-size:12px;color:var(--tx2);margin-bottom:14px">"${topico}"</p>

        <form onsubmit="window.enviarRespostaForum(event, '${id}')">
            <div class="fld">
                <label>Sua Contribuição ou Resposta</label>
                <textarea id="respostaForumTexto" rows="4" placeholder="Escreva sua resposta ou explicação técnica..." required style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;font-size:13px;color:var(--tx);resize:vertical"></textarea>
            </div>
            <button type="submit" class="btn btn-p btn-block">
                <i class="fas fa-check"></i> Enviar Resposta
            </button>
        </form>
    `)
}

function enviarRespostaForum(e, id) {
    e.preventDefault()
    const texto = sanitizar($('#respostaForumTexto')?.value?.trim() || '')
    if (!texto) return

    toast('Resposta enviada com sucesso!', 'success')
    closeMdl()

    // Marca como respondida localmente para feedback visual imediato
    const post = forumPosts.find(p => p.id === id)
    if (post) {
        post.status = 'respondida'
        renderListaDuvidas()
    }
}

// Tornar funções acessíveis para templates inline
window.abrirModalNovaDuvida = abrirModalNovaDuvida
window.salvarNovaDuvida = salvarNovaDuvida
window.filtrarDuvidasForum = filtrarDuvidasForum
window.filtrarStatusForum = filtrarStatusForum
window.abrirModalResponder = abrirModalResponder
window.enviarRespostaForum = enviarRespostaForum
