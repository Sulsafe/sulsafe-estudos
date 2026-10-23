// ============================================================
// VIEW: INÍCIO
// ============================================================
import { S, role, isAdmin, isProf, uid, nav, NRS } from '../state.js'
import { sbGetDashboardMetrics, sbGetProgressoUsuario, sbGetSalasAtivas } from '../supabase-client.js'
import { toast, $, $$ } from '../utils.js'

export function vInicio() {
    const r = role()
    let h = `<div class="btn-back" onclick="window.nav('${S.prevView || 'inicio'}')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<h2 class="wc">Olá, ${S.user?.nome_completo || 'Usuário'} 👋</h2>`
    h += `<p class="wcs">Painel ${r === 'admin' ? 'Administrativo (Modo Deus)' : r === 'professor' ? 'do Professor' : 'do Aluno'} — ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`
    
    h += `<div class="stats" id="statsInicio">`
    h += `<div class="st"><div class="st-v">...</div><div class="st-l"><i class="fas fa-spinner fa-spin"></i> Carregando...</div></div>`
    h += `</div>`
    h += `<h3 style="font-size:16px;font-weight:700;margin-bottom:16px">Acesso Rápido</h3><div class="cards">`
    h += cCard('fa-play-circle', 'Videoaulas', '38 NRs em videoaulas HD', 'videoaulas')
    h += cCard('fa-file-alt', 'Materiais', 'Arquivos e recursos', 'materiais')
    h += cCard('fa-tower-broadcast', 'Salas ao Vivo', 'Participe ao vivo', 'salas')
    h += cCard('fa-book', 'Catálogo de NRs', 'Consulte as 38 Normas', 'nrs')
    h += cCard('fa-robot', 'Assistente IA', 'Dúvidas sobre NRs 24/7', 'ia')
    h += cCard('fa-comments', 'Fórum de Dúvidas', 'Comunidade & Instrutores', 'forum')
    if (r === 'aluno') {
        h += cCard('fa-route', 'Meus Cursos/Trilhas', 'Conteúdos direcionados para você', 'trilhas')
        h += cCard('fa-id-card', 'Meu Dossiê', 'Dados e documentos para o SISTEC', 'dossie')
        h += cCard('fa-file-lines', 'Meu Boletim', 'Acompanhe suas notas', 'boletim')
        h += cCard('fa-file-pdf', 'Minhas Provas', 'Envie sua prova', 'provas')
        h += cCard('fa-certificate', 'Certificados', 'Certificados emitidos', 'certificados')
    }
    if (isProf()) {
        h += cCard('fa-file-pen', 'Lançar Notas', 'Notas dos alunos', 'boletim')
        h += cCard('fa-file-pdf', 'Corrigir Provas', 'Provas para corrigir', 'provas')
        h += cCard('fa-certificate', 'Certificados', 'Emitir certificados', 'certificados')
    }
    if (isAdmin()) {
        h += cCard('fa-user-clock', 'Pendentes', 'Aprovar alunos', 'pendentes')
        h += cCard('fa-folder-open', 'Auditoria de Dossiês', 'Conferir dados e documentos', 'auditoria-dossies')
        h += cCard('fa-file-pen', 'Notas', 'Gerenciar notas', 'boletim')
        h += cCard('fa-file-pdf', 'Corrigir Provas', 'Provas para corrigir', 'provas')
        h += cCard('fa-certificate', 'Certificados', 'Emitir certificados', 'certificados')
        h += cCard('fa-gauge-high', 'Central Administrativa', 'Visão consolidada', 'central')
        h += cCard('fa-boxes-stacked', 'Almoxarifado', 'Estoque & movimentações', 'almoxarifado')
        h += cCard('fa-shield-halved', 'Modo Deus', 'Controle total', 'admin')
    }
    h += `</div>`
    
    setTimeout(async () => {
        try {
            const { data: metrics } = await sbGetDashboardMetrics()
            const statsDiv = document.getElementById('statsInicio')
            if (!statsDiv) return
            
            if (r === 'aluno') {
                const { data: progressos } = await sbGetProgressoUsuario(uid())
                const concluidas = progressos?.filter(p => p.concluído === true).length || 0
                const total = NRS.length
                const pct = total ? Math.round(concluidas / total * 100) : 0
                const pendentes = total - concluidas
                statsDiv.innerHTML = `
                    ${stC(pct + '%', 'Progresso', 'fa-chart-line')}
                    ${stC(concluidas, 'Vídeos Vistos', 'fa-check-circle')}
                    ${stC(pendentes, 'Vídeos Pendentes', 'fa-clock')}
                `
                const progDiv = document.createElement('div')
                progDiv.className = 'prog-w'
                progDiv.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                        <span style="font-weight:600;font-size:13px">Progresso Geral — Vídeos</span>
                        <span style="font-weight:800;color:var(--p);font-size:18px">${pct}%</span>
                    </div>
                    <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
                    <p style="font-size:11px;color:var(--tx3);margin-top:6px">${concluidas} de ${total} NRs concluídas — ${pendentes} pendentes</p>
                `
                statsDiv.parentNode.insertBefore(progDiv, statsDiv.nextSibling)
            } else {
                const alunos = metrics?.total_alunos || 0
                const pendentes = metrics?.pendentes || 0
                const provasPendentes = metrics?.provas_pendentes || 0
                const { data: salas } = await sbGetSalasAtivas()
                statsDiv.innerHTML = `
                    ${stC(alunos, 'Alunos', 'fa-users')}
                    ${stC(pendentes, 'Pendentes', 'fa-user-clock')}
                    ${stC(salas?.length || 0, 'Salas Ativas', 'fa-tower-broadcast')}
                    ${stC(provasPendentes, 'Provas Pendentes', 'fa-file-pdf')}
                    ${stC(NRS.length, 'NRs', 'fa-book')}
                `
            }
        } catch (e) { console.error('Erro ao carregar dashboard:', e) }
    }, 100)
    
    return h
}

function stC(v, l, ic) { return `<div class="st"><div class="st-v">${v}</div><div class="st-l"><i class="fas ${ic}" style="margin-right:4px"></i>${l}</div></div>` }
function cCard(ic, t, d, v) { return `<div class="card" onclick="window.nav('${v}')"><div class="card-ic"><i class="fas ${ic}"></i></div><div class="card-t">${t}</div><div class="card-d">${d}</div></div>` }
