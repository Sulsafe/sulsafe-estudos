// ============================================================
// AUTH - LOGIN, CADASTRO, LOGOUT, RECUPERACAO
// ============================================================

import { sb, sbGetUser } from './supabase-client.js'
import {
    loadCfg,
    enterDash,
    toast,
    handleError,
    sanitizar,
    showT
} from './utils.js'
import { S } from './state.js'

export async function handleLogin(email, password) {
    try {
        const normalizedEmail = email.trim().toLowerCase()

        const { data: authData, error: authError } =
            await sb.auth.signInWithPassword({
                email: normalizedEmail,
                password
            })

        if (authError || !authData?.user?.id) {
            throw new Error('Email ou senha incorretos')
        }

        const { data: profile, error: profileError } =
            await sbGetUser(authData.user.id)

        if (profileError || !profile) {
            throw new Error(
                'Perfil não encontrado. Entre em contato com o administrador.'
            )
        }

        if (profile.status === 'pendente' && profile.role === 'aluno') {
            await sb.auth.signOut()
            throw new Error('Aguardando aprovação do administrador')
        }

        if (profile.status === 'bloqueado') {
            await sb.auth.signOut()
            throw new Error('Usuário bloqueado')
        }

        if (profile.status !== 'ativo') {
            await sb.auth.signOut()
            throw new Error('Conta ainda não está ativa')
        }

        S.user = profile

        loadCfg()
        enterDash()

        toast(
            'Bem-vindo(a), ' + sanitizar(profile.nome_completo || 'usuário') + '!',
            'success'
        )
    } catch (error) {
        handleError(error)
    }
}

export async function handleCadastro(
    nome,
    email,
    password,
    confirmPassword,
    termos
) {
    if (!termos) {
        toast('Você precisa aceitar os termos de uso', 'err')
        return
    }

    if (password !== confirmPassword) {
        toast('As senhas não coincidem', 'err')
        return
    }

    if (password.length < 6) {
        toast('Senha deve ter no mínimo 6 caracteres', 'err')
        return
    }

    const normalizedName = nome.trim()
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedName) {
        toast('Nome é obrigatório', 'err')
        return
    }

    try {
        const { data: authData, error: authError } =
            await sb.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    data: {
                        nome_completo: normalizedName
                    }
                }
            })

        if (authError) throw authError

        if (!authData.user) {
            throw new Error('Não foi possível criar a conta')
        }

        toast('Cadastro realizado! Aguarde aprovação.', 'info')
        showT('tLogin')

        if (authData.user.identities?.length === 0) {
            return
        }

        toast(
            'Confira o email de confirmação enviado para ' +
                sanitizar(normalizedEmail),
            'info'
        )
    } catch (error) {
        handleError(error)
    }
}

export async function logout() {
    try {
        const { error } = await sb.auth.signOut()

        if (error) throw error
    } catch (error) {
        handleError(error)
        return
    }

    S.user = null

    localStorage.removeItem('ss_session')
    localStorage.removeItem('ss_user')

    if (window.destroyCharts) {
        window.destroyCharts()
    }

    window.location.href = 'index.html'
}

export async function recuperarSenha() {
    const email = prompt('Digite seu email para recuperar a senha:')

    if (!email) return

    try {
        const { error } = await sb.auth.resetPasswordForEmail(
            email.trim().toLowerCase(),
            {
                redirectTo:
                    window.location.origin + '/reset-password.html'
            }
        )

        if (error) throw error

        toast(
            'Email de recuperação enviado! Verifique sua caixa de entrada.',
            'success'
        )
    } catch (error) {
        handleError(error)
    }
}