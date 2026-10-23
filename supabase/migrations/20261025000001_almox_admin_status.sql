-- ============================================================
-- ALMOXARIFADO: EXIGIR CONTA ATIVA NO ACESSO ADMINISTRATIVO
-- ============================================================
-- is_almox_admin autorizava apenas pelo e-mail master no JWT.
-- Uma conta bloqueada ou pendente continuava com acesso ao modulo.
-- A funcao passa a exigir tambem status = 'ativo' no perfil.

create or replace function public.is_almox_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        auth.uid() is not null
        and lower(coalesce(auth.jwt() ->> 'email', ''))
            = 'sulsafetreinamentos@gmail.com'
        and exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.status = 'ativo'
        );
$$;

revoke all on function public.is_almox_admin() from public, anon;
revoke all on function public.almox_assert_admin() from public, anon;
grant execute on function public.is_almox_admin() to authenticated;

comment on function public.is_almox_admin() is
    'Retorna true somente para a sessao autenticada do e-mail master com perfil ativo.';
