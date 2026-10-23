// ============================================================
// VIEW: ADMIN (MODO DEUS)
// ============================================================
import { S, nav, fmtD } from '../state.js'
import { sb, sbGetDashboardMetrics, sbGetAllUsers, sbGetRankingAlunos, sbUpdateUser, sbLiberarUsuario, sbBloquearUsuario } from '../supabase-client.js'
import { role, isAdmin, uid, toast, handleError, openMdl, closeMdl, sanitizar, $, $$ } from '../utils.js'
import { drawAdminProgress, drawAdminRoles } from '../charts-admin.js'

export function vAdmin() {
    if (!isAdmin()) return window.nav('inicio')
    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<div class="god-hd"><h2><i class="fas fa-shield-halved"></i> Modo Deus</h2><p>Controle total — ${S.user.email}</p></div>`
    h += `<div id="adminStats"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando dados...</p></div></div>`
    h += `<div class="ch-g"><div class="ch-b"><h3><i class="fas fa-chart-bar"></i> Alunos por Progresso</h3><div class="chart-canvas"><canvas id="chartAdmProg" role="img" aria-label="Alunos por faixa de progresso"></canvas></div></div><div class="ch-b"><h3><i class="fas fa-chart-bar"></i> Distribuição de Roles</h3><div class="chart-canvas"><canvas id="chartAdmRoles" role="img" aria-label="Distribuição de usuários por perfil"></canvas></div></div></div>`
    h += `<div id="adminUsers"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando usuários...</p></div></div>`
    h += `<div class="pnl" style="border:2px solid #D32F2F"><div class="pnl-h"><div class="pnl-t" style="color:#D32F2F"><i class="fas fa-skull-crossbones"></i> Zona de Perigo</div></div><p style="font-size:13px;color:var(--tx2);margin-bottom:14px">Apaga <strong>TODOS</strong> os dados da plataforma.</p><button class="btn btn-d" style="width: auto;" onclick="modalApagarTudo()"><i class="fas fa-bomb"></i> APAGAR TUDO</button></div>`
    
    setTimeout(carregarAdminData, 200)
    return h
}

async function carregarAdminData() {
    const { data: metrics } = await sbGetDashboardMetrics()
    const { data: users } = await sbGetAllUsers(0, 1000)
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
            const rc = (u.role === 'admin' || u.role === 'super_admin') ? 'bg-warn' : u.role === 'professor' ? 'bg-ok' : 'bg-info'
            const st = u.status === 'ativo' ? 'bg-ok' : u.status === 'pendente' ? 'bg-pendente' : 'bg-err'
            const nome = sanitizar(u.nome_completo || '')
            const email = sanitizar(u.email || '')
            h += `<tr data-un="${nome.toLowerCase()} ${email.toLowerCase()}">
                <td><strong>${nome}</strong></td>
                <td>${email}</td>
                <td><span class="badge ${rc}">${sanitizar(u.role)}</span></td>
                <td><span class="badge ${st}">${sanitizar(u.status || 'pendente')}</span></td>
                <td>
                    ${u.email !== 'sulsafetreinamentos@gmail.com' ? `
                        <select onchange="changeRole('${u.id}',this.value)" style="background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:4px 8px;font-size:12px;color:var(--tx)">
                            <option value="aluno" ${u.role === 'aluno' ? 'selected' : ''}>Aluno</option>
                            <option value="professor" ${u.role === 'professor' ? 'selected' : ''}>Professor</option>
                        </select>
                        ${u.status === 'pendente' ? `<button class="btn btn-sm btn-p" onclick="window.liberarUsuario('${u.id}')" style="margin-left:4px;"><i class="fas fa-check"></i> Aprovar</button>` : ''}
                        ${u.status === 'ativo' ? `<button class="btn btn-sm btn-warning" style="width:auto;flex:none;margin-left:4px;background:#f59e0b;color:white;" onclick="window.bloquearUsuario('${u.id}')"><i class="fas fa-ban"></i> Bloquear</button>` : ''}
                    ` : '<span style="font-size:11px;color:var(--tx3)">Protegido</span>'}
                </td>
            </tr>`
        })
        h += `</tbody></table></div></div>`
        usersDiv.innerHTML = h
    }
    
    drawAdminProgress('chartAdmProg', ranking || [])
    drawAdminRoles('chartAdmRoles', users || [])
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


function stC(v, l, ic) {
    return `<div class="st-mod">
        <div class="st-mod-ic"><i class="fas ${ic}"></i></div>
        <div class="st-mod-info">
            <div class="st-mod-v">${v}</div>
            <div class="st-mod-l">${l}</div>
        </div>
    </div>`
}

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