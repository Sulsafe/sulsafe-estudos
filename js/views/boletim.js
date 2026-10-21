// ============================================================
// VIEW: BOLETIM (Aluno / Professor)
// ============================================================
import { S, role, uid, nav, fmtD, stC, NRS } from '../state.js'
import { sbGetNotasAluno, sbLancarNota, sbGetAlunos, sb, sbCriarNotificacao } from '../supabase-client.js'
import { toast, handleError, sanitizar, openMdl, closeMdl, $, $$ } from '../utils.js'

export function vBoletim() {
    const r = role()
    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<h2 class="wc">${r === 'aluno' ? 'Meu Boletim' : 'Gerenciar Notas'}</h2>`
    h += `<p class="wcs">${r === 'aluno' ? 'Acompanhe suas notas e progresso nas Normas Regulamentadoras.' : 'Lance e gerencie as avaliações dos estudantes.'}</p>`
    
    if (r === 'aluno') {
        h += `<div id="boletimAluno"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando notas...</p></div></div>`
        setTimeout(carregarBoletimAluno, 150)
    } else {
        h += `<div id="boletimProfessor"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando alunos...</p></div></div>`
        setTimeout(carregarBoletimProfessor, 150)
    }
    return h
}

async function carregarBoletimAluno() {
    const container = document.getElementById('boletimAluno')
    if (!container) return
    const { data: notas } = await sbGetNotasAluno(uid())
    
    if (!notas || notas.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-file-lines"></i>
                <h4>Nenhuma nota lançada ainda</h4>
                <p>À medida que suas atividades e provas forem corrigidas, suas notas aparecerão aqui.</p>
            </div>
        `
        return
    }
    
    const media = notas.reduce((a, n) => a + Number(n.nota || 0), 0) / notas.length
    let h = `<div class="stats">${stC(media.toFixed(1), 'Média Geral', 'fa-chart-line')}${stC(notas.length, 'NRs Avaliadas', 'fa-list')}</div>`
    h += `<div class="tw"><table><thead><tr><th>NR</th><th>Nota</th><th>Observação</th><th>Data</th></tr></thead><tbody>`
    notas.forEach(n => {
        const numNota = Number(n.nota)
        const cor = numNota >= 7 ? 'bg-ok' : numNota >= 5 ? 'bg-warn' : 'bg-err'
        h += `<tr><td><strong>NR ${n.nr_id}</strong></td><td><span class="badge ${cor}">${n.nota ?? '—'}</span></td><td>${sanitizar(n.obs) || '—'}</td><td>${fmtD(n.criado_em)}</td></tr>`
    })
    h += `</tbody></table></div>`
    h += `<div class="ch-b" style="margin-top:20px"><h3><i class="fas fa-chart-bar"></i> Desempenho por NR</h3><canvas id="chartBoletimAluno" height="180"></canvas></div>`
    container.innerHTML = h
    setTimeout(() => drawChartAluno(notas), 100)
}

function drawChartAluno(notas) {
    const cv = document.getElementById('chartBoletimAluno')
    if (!cv || typeof Chart === 'undefined') return
    try {
        const labels = notas.map(n => `NR ${n.nr_id}`)
        const data = notas.map(n => Number(n.nota || 0))
        new Chart(cv, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Nota',
                    data,
                    backgroundColor: data.map(d => d >= 7 ? 'rgba(46,125,50,.7)' : d >= 5 ? 'rgba(230,81,0,.7)' : 'rgba(198,40,40,.7)'),
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { min: 0, max: 10 }
                }
            }
        })
    } catch (e) {
        console.warn('Erro ao desenhar gráfico aluno:', e)
    }
}

async function carregarBoletimProfessor() {
    const container = document.getElementById('boletimProfessor')
    if (!container) return
    const { data: alunos } = await sbGetAlunos()
    
    let h = `<div class="pnl"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-filter"></i> Selecionar Aluno</div><button class="btn btn-p btn-sm" onclick="modalNota()"><i class="fas fa-plus"></i> Lançar Nota</button></div><select id="selAlunoN" class="search" style="margin:0;border-radius:var(--r)" onchange="renderNotasAl()"><option value="">Selecione um aluno...</option>${(alunos || []).map(a => `<option value="${a.id}">${sanitizar(a.nome_completo)} (${sanitizar(a.email)})</option>`).join('')}</select></div><div id="notasAlC"></div>`
    container.innerHTML = h
}

async function renderNotasAl() {
    const aid = $('#selAlunoN')?.value
    const c = $('#notasAlC')
    if (!aid || !c) return
    const { data: notas } = await sbGetNotasAluno(aid)
    const { data: alunos } = await sbGetAlunos()
    const al = (alunos || []).find(u => u.id === aid)
    
    let h = `<div class="pnl"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-user-graduate"></i> ${sanitizar(al?.nome_completo || 'Aluno')}</div><button class="btn btn-p btn-sm" onclick="modalNota('${aid}')"><i class="fas fa-plus"></i> Lançar</button></div>`
    if (!notas || notas.length === 0) {
        h += `<div class="empty" style="padding:30px"><p>Nenhuma nota lançada para este aluno.</p></div>`
    } else {
        h += `<div class="tw"><table><thead><tr><th>NR</th><th>Nota</th><th>Obs</th><th>Data</th><th>Ações</th></tr></thead><tbody>`
        notas.forEach(n => {
            const cor = Number(n.nota) >= 7 ? 'bg-ok' : Number(n.nota) >= 5 ? 'bg-warn' : 'bg-err'
            h += `<tr><td>NR ${n.nr_id}</td><td><span class="badge ${cor}">${n.nota}</span></td><td>${sanitizar(n.obs) || '—'}</td><td>${fmtD(n.criado_em)}</td><td><button class="btn btn-sm btn-s" onclick="modalNota('${aid}','${n.id}')"><i class="fas fa-pen"></i></button> <button class="btn btn-sm btn-d" onclick="delNota('${n.id}','${aid}')"><i class="fas fa-trash"></i></button></td></tr>`
        })
        h += `</tbody></table></div>`
    }
    h += `</div>`
    c.innerHTML = h
}

async function delNota(id, aid) {
    if (!confirm('Deseja excluir esta nota?')) return
    const { error } = await sb.from('notas').delete().eq('id', id)
    if (error) {
        toast('Erro ao excluir: ' + error.message, 'err')
        return
    }
    toast('Nota excluída com sucesso!', 'success')
    renderNotasAl()
}

async function modalNota(aid, notaIdEdit) {
    const alunos = (await sbGetAlunos()).data || []
    const opts = NRS.map(n => `<option value="${n.n}">NR ${n.n} — ${sanitizar(n.nome)}</option>`).join('')
    let nota = null
    if (notaIdEdit) {
        const { data: notas } = await sbGetNotasAluno(aid)
        nota = notas?.find(n => n.id === notaIdEdit)
    }
    
    openMdl(`<button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
        <h2 style="font-size:18px;font-weight:700;color:var(--p);margin-bottom:16px">${nota ? 'Editar' : 'Lançar'} Nota</h2>
        <form onsubmit="saveNota(event, '${aid || ''}', '${notaIdEdit || ''}')">
            <div class="fld"><label>Aluno</label>
                <select id="nAluno" required>${alunos.map(a => `<option value="${a.id}" ${a.id === aid ? 'selected' : ''}>${sanitizar(a.nome_completo)}</option>`).join('')}</select>
            </div>
            <div class="fld"><label>NR</label><select id="nNR" required>${opts}</select></div>
            <div class="fld"><label>Nota (0 a 10)</label><input type="number" id="nVal" min="0" max="10" step="0.1" value="${nota?.nota || ''}" required></div>
            <div class="fld"><label>Observação</label><textarea id="nObs" rows="3" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx);font-size:13px;resize:vertical">${nota?.obs || ''}</textarea></div>
            <button type="submit" class="btn btn-p btn-block"><i class="fas fa-save"></i> Salvar Nota</button>
        </form>`)
}

async function saveNota(e, aid, notaIdEdit) {
    e.preventDefault()
    const alunoId = $('#nAluno')?.value
    const nrid = $('#nNR')?.value
    const nota = parseFloat($('#nVal')?.value)
    const obs = sanitizar($('#nObs')?.value?.trim() || '')
    
    if (isNaN(nota) || nota < 0 || nota > 10) {
        toast('Nota deve ser entre 0 e 10', 'err')
        return
    }
    
    if (notaIdEdit) {
        await sb.from('notas').update({ nota, obs }).eq('id', notaIdEdit)
        toast('Nota atualizada!', 'success')
    } else {
        await sbLancarNota(alunoId, nrid, nota, obs, uid())
        toast('Nota lançada!', 'success')
        await sbCriarNotificacao(alunoId, 'Nota Lançada', `Nova nota lançada para NR ${nrid}: ${nota}/10`, 'boletim')
    }
    closeMdl()
    if ($('#selAlunoN')) {
        $('#selAlunoN').value = alunoId
    }
    renderNotasAl()
}

window.renderNotasAl = renderNotasAl
window.modalNota = modalNota
window.saveNota = saveNota
window.delNota = delNota
