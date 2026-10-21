// ============================================================
// VIEW: ADMIN (MODO DEUS)
// ============================================================
import { S, nav, fmtD } from '../state.js'
import { sbGetDashboardMetrics, sbGetAllUsers, sbGetRankingAlunos, sbUpdateUser, sbLiberarUsuario, sbBloquearUsuario } from '../supabase-client.js'
import { role, isAdmin, uid, toast, handleError, openMdl, closeMdl, $, $$ } from '../utils.js'

export function vAdmin() {
    if (!isAdmin()) return window.nav('inicio')
    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<div class="god-hd"><h2><i class="fas fa-shield-halved"></i> Modo Deus</h2><p>Controle total — ${S.user.email}</p></div>`
    h += `<div id="adminStats"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando dados...</p></div></div>`
    h += `<div class="ch-g"><div class="ch-b"><h3><i class="fas fa-chart-bar"></i> Alunos por Progresso</h3><canvas id="chartAdmProg" height="200"></canvas></div><div class="ch-b"><h3><i class="fas fa-chart-pie"></i> Distribuição de Roles</h3><canvas id="chartAdmRoles" height="200"></canvas></div></div>`
    h += `<div id="adminUsers"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando usuários...</p></div></div>`
    h += `<div class="pnl" style="border:2px solid #D32F2F"><div class="pnl-h"><div class="pnl-t" style="color:#D32F2F"><i class="fas fa-skull-crossbones"></i> Zona de Perigo</div></div><p style="font-size:13px;color:var(--tx2);margin-bottom:14px">Apaga <strong>TODOS</strong> os dados da plataforma.</p><button class="btn btn-d" style="width: auto; onclick="modalApagarTudo()"><i class="fas fa-bomb"></i> APAGAR TUDO</button></div>`
    
    setTimeout(carregarAdminData, 200)
    return h
}

async function carregarAdminData() {
    const { data: metrics } = await sbGetDashboardMetrics()
    const { data: users } = await sbGetAllUsers()
    const { data: ranking } = await sbGetRankingAlunos()
    const statsDiv = document.getElementById('adminStats')
    if (statsDiv && metrics) {
        statsDiv.innerHTML = `
            <div class="stats">
                ${stC(metrics.total_usuarios || 0, 'Usuários', 'fa-users')}
                ${stC(metrics.total_alunos || 0, 'Alunos', 'fa-user-graduate')}
                ${stC(metrics.total_professores || 0, 'Professores', 'fa-chalkboard-user')}
                ${stC(metrics.pendentes || 0, 'Pendentes', 'fa-user-clock')}
                ${stC(metrics.provas_pendentes || 0, 'Provas Pendentes', 'fa-file-pdf')}
                ${stC(metrics.total_concluidas || 0, 'Aulas Concluídas', 'fa-check-circle')}
            </div>
        `
    }
    
    const usersDiv = document.getElementById('adminUsers')
    if (usersDiv && users) {
        let h = `<div class="pnl"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-users-gear"></i> Gerenciar Usuários (${users.length})</div></div><input class="search" placeholder="Buscar usuário..." oninput="filterU(this.value)"><div class="tw" style="margin-top:14px"><table><thead><tr><th>Nome</th><th>Email</th><th>Role</th><th>Status</th><th>Ações</th></tr></thead><tbody id="uTB">`
        users.forEach(u => {
            const rc = u.role === 'admin' ? 'bg-warn' : u.role === 'professor' ? 'bg-ok' : 'bg-info'
            const st = u.status === 'ativo' ? 'bg-ok' : u.status === 'pendente' ? 'bg-pendente' : 'bg-err'
            h += `<tr data-un="${u.nome_completo.toLowerCase()} ${u.email.toLowerCase()}">
                <td><strong>${u.nome_completo}</strong></td>
                <td>${u.email}</td>
                <td><span class="badge ${rc}">${u.role}</span></td>
                <td><span class="badge ${st}">${u.status || 'pendente'}</span></td>
                <td>
                    ${u.email !== 'sulsafetreinamentos@gmail.com' ? `
                        <select onchange="changeRole('${u.id}',this.value)" style="background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:4px 8px;font-size:12px;color:var(--tx)">
                            <option value="aluno" ${u.role === 'aluno' ? 'selected' : ''}>Aluno</option>
                            <option value="professor" ${u.role === 'professor' ? 'selected' : ''}>Professor</option>
                        </select>
                        ${u.status === 'pendente' ? `<button class="btn btn-sm btn-p" onclick="window.liberarUsuario('${u.id}')" style="margin-left:4px;"><i class="fas fa-check"></i> Aprovar</button>` : ''}
                        ${u.status === 'ativo' ? `<button class="btn btn-sm btn-warning" style="width: auto; onclick="window.bloquearUsuario('${u.id}')" style="margin-left:4px;background:#f59e0b;color:white;"><i class="fas fa-ban"></i> Bloquear</button>` : ''}
                    ` : '<span style="font-size:11px;color:var(--tx3)">Protegido</span>'}
                </td>
            </tr>`
        })
        h += `</tbody></table></div></div>`
        usersDiv.innerHTML = h
    }
    
    setTimeout(drawChartAdmin, 100)
}

function filterU(q) { q = q.toLowerCase(); $$('#uTB tr').forEach(r => { r.style.display = r.dataset.un.includes(q) ? '' : 'none' }) }

async function changeRole(id, role) {
    await sbUpdateUser(id, { role: role })
    toast('Role alterado para ' + role, 'success')
    carregarAdminData()
}

function modalApagarTudo() {
    openMdl(`<button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button><div style="text-align:center;padding:10px 0"><i class="fas fa-skull-crossbones" style="font-size:48px;color:#D32F2F;margin-bottom:12px;display:block"></i><h2 style="font-size:20px;font-weight:800;color:#D32F2F;margin-bottom:8px">Confirmar Apagamento Total</h2><p style="font-size:13px;color:var(--tx2);margin-bottom:6px">Apagará: salas, notas, provas, certificados, aulas e materiais.</p><p style="font-size:12px;color:#D32F2F;font-weight:700;margin-bottom:16px">DIGITE "APAGAR" PARA CONFIRMAR</p><input type="text" id="cfmApagar" placeholder='Digite "APAGAR"' style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:12px;color:var(--tx);font-size:14px;text-align:center;margin-bottom:12px"><button class="btn btn-d btn-block" onclick="execApagar()"><i class="fas fa-bomb"></i> EXECUTAR</button></div>`)
}

async function execApagar() {
    if ($('#cfmApagar')?.value?.trim() !== 'APAGAR') { toast('Digite "APAGAR" para confirmar', 'err'); return }
    await sb.from('salas').delete().neq('id', '')
    await sb.from('notas').delete().neq('id', '')
    await sb.from('provas').delete().neq('id', '')
    await sb.from('certificados').delete().neq('id', '')
    await sb.from('progresso_aulas').delete().neq('id', '')
    await sb.from('videoaulas').delete().neq('id', '')
    await sb.from('materiais').delete().neq('id', '')
    window.closeMdl()
    toast('TODOS os dados foram apagados!', 'warn')
    carregarAdminData()
}

async function drawChartAdmin() {
    const cv1 = document.getElementById('chartAdmProg'), cv2 = document.getElementById('chartAdmRoles')
    const { data: ranking } = await sbGetRankingAlunos()
    const { data: users } = await sbGetAllUsers()
    
    if (cv1 && ranking) {
        let p0 = 0, p1 = 0, p2 = 0, p3 = 0
        ranking.forEach(a => {
            const pct = a.progresso || 0
            if (pct === 0) p0++
            else if (pct <= 50) p1++
            else if (pct <= 80) p2++
            else p3++
        })
        if (window.charts && window.charts.admProg) try { window.charts.admProg.destroy() } catch (e) {}
        window.charts = window.charts || {}
        window.charts.admProg = new Chart(cv1, { type: 'bar', data: { labels: ['0%', '1-50%', '51-80%', '81-100%'], datasets: [{ label: 'Alunos', data: [p0, p1, p2, p3], backgroundColor: ['rgba(211,47,47,.7)', 'rgba(255,152,0,.7)', 'rgba(21,101,192,.7)', 'rgba(46,125,50,.7)'], borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } } } })
    }
    if (cv2 && users) {
        const rc = { admin: 0, professor: 0, aluno: 0 }
        users.forEach(u => { rc[u.role] = (rc[u.role] || 0) + 1 })
        if (window.charts && window.charts.admRoles) try { window.charts.admRoles.destroy() } catch (e) {}
        window.charts = window.charts || {}
        window.charts.admRoles = new Chart(cv2, { type: 'doughnut', data: { labels: ['Admin', 'Professor', 'Aluno'], datasets: [{ data: [rc.admin, rc.professor, rc.aluno], backgroundColor: ['rgba(201,176,55,.8)', 'rgba(46,125,50,.8)', 'rgba(21,101,192,.8)'] }] }, options: { responsive: true, plugins: { legend: { position: 'bottom' } } } })
    }
}

function stC(v, l, ic) { return `<div class="st"><div class="st-v">${v}</div><div class="st-l"><i class="fas ${ic}" style="margin-right:4px"></i>${l}</div></div>` }

window.changeRole = changeRole
window.liberarUsuario = async function(id) {
    const { data, error } = await sbLiberarUsuario(id)
    if (error) { handleError(error); return }
    toast('Usuário liberado com sucesso!', 'success')
    carregarAdminData()
}
window.bloquearUsuario = async function(id) {
    if (!confirm('Tem certeza que deseja bloquear o acesso deste usuário?')) return;
    const { error } = await sbBloquearUsuario(id);
    if (error) {
        handleError(error);
        return;
    }
    toast('Usuário bloqueado com sucesso!', 'warn');
    carregarAdminData();
}
window.modalApagarTudo = modalApagarTudo
window.execApagar = execApagar