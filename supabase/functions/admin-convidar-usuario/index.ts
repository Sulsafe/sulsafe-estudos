// ============================================================
// SUPABASE EDGE FUNCTION — ADMIN-CONVIDAR-USUARIO (OPÇÃO A)
// ============================================================
// D-TUTOR-11: o ADMIN cadastra a empresa e convida o usuário. Esta function
// usa service_role para chamar a Admin API do Auth, mas a autorização vem do
// JWT do ADMIN, validada por RPC com a chave anon ANTES de qualquer escrita.
//
// O claim é injetado no createUser: app_metadata: { empresa_id }. Ele não é
// aceito do navegador, não vai para user_metadata e nunca aparece em logs ou
// na resposta HTTP. O e-mail de convite é enviado logo em seguida.
//
// Fluxo:
//   1. valida payload e o JWT do chamador (ADMIN + empresa ativa)
//   2. auth.admin.createUser({ app_metadata: { empresa_id } })
//   3. auth.admin.inviteUserByEmail() — envia o link de convite
//   4. ajusta o perfil (role/status) criado pelo handle_new_user()
//   5. em caso de falha no envio, remove o usuário criado (rollback)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0'

const JSON_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES = new Set(['professor', 'aluno'])

function resposta(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function erro(codigo: string, message: string, status: number): Response {
    return resposta({ error: { code: codigo, message } }, status)
}

function texto(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return resposta({ ok: true })

    if (req.method !== 'POST') {
        return erro('METODO_INVALIDO', 'Use POST.', 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !serviceKey || !anonKey) {
        return erro('CONFIGURACAO_AUSENTE', 'Edge Function sem credenciais do Supabase.', 500)
    }

    try {
        const payload = await req.json()
        const email = texto(payload?.email).toLowerCase()
        const nome = texto(payload?.nome)
        const empresaId = texto(payload?.empresa_id)
        const role = texto(payload?.role) || 'professor'

        if (!EMAIL.test(email) || !nome || nome.length > 120) {
            return erro('PAYLOAD_INVALIDO', 'Informe um e-mail válido e o nome do usuário.', 400)
        }
        if (!UUID.test(empresaId)) {
            return erro('PAYLOAD_INVALIDO', 'Informe uma empresa válida.', 400)
        }
        if (!ROLES.has(role)) {
            return erro('PAYLOAD_INVALIDO', 'Perfil inválido. Use professor ou aluno.', 400)
        }

        // Quem autoriza é o JWT do ADMIN. A RPC roda com a chave anon, antes
        // de qualquer ação com service_role.
        const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
        if (!token) {
            return erro('NAO_AUTENTICADO', 'Faça login para convidar usuários.', 401)
        }

        const supabaseUsuario = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false }
        })

        const { data: podeConvidar, error: erroAuth } = await supabaseUsuario.rpc(
            'sulsafe_pode_convidar_empresa',
            { p_empresa_id: empresaId }
        )

        if (erroAuth || podeConvidar !== true) {
            return erro('SEM_PERMISSAO', 'Você não pode convidar usuários para esta empresa.', 403)
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        })

        // O claim nasce com o usuário: não é lido do payload do navegador.
        const { data: criado, error: erroCriacao } = await supabase.auth.admin.createUser({
            email,
            email_confirm: false,
            app_metadata: { empresa_id: empresaId },
            user_metadata: { nome_completo: nome, nome }
        })

        if (erroCriacao || !criado?.user) {
            const jaExiste = /already|existe|duplicate|registered/i.test(erroCriacao?.message || '')
            return erro(
                'CONVITE_RECUSADO',
                jaExiste
                    ? 'Já existe uma conta com este e-mail.'
                    : 'Não foi possível criar o usuário convidado.',
                400
            )
        }

        const usuarioId = criado.user.id
        const { error: erroConvite } = await supabase.auth.admin.inviteUserByEmail(email, {
            data: { nome_completo: nome }
        })

        if (erroConvite) {
            await supabase.auth.admin.deleteUser(usuarioId)
            return erro('CONVITE_NAO_ENVIADO', 'Não foi possível enviar o convite. Tente novamente.', 502)
        }

        // handle_new_user() cria o perfil como aluno/pendente; o convite do
        // ADMIN já define o perfil e o status ativo.
        const { error: erroPerfil } = await supabase
            .from('profiles')
            .update({ role, status: 'ativo', nome_completo: nome })
            .eq('id', usuarioId)

        if (erroPerfil) {
            await supabase.auth.admin.deleteUser(usuarioId)
            return erro('PERFIL_INVALIDO', 'Não foi possível configurar o perfil do convidado.', 500)
        }

        return resposta({
            ok: true,
            message: 'Convite enviado com sucesso.',
            email,
            role,
            empresa_id: empresaId
        })
    } catch {
        return erro('ERRO_INTERNO', 'Não foi possível processar o convite.', 500)
    }
})
