-- ============================================================
-- CERTIFICADOS: CPF DO ALUNO E STATUS DE REVOGAÇÃO
-- ============================================================
-- Adiciona a coluna cpf em profiles para emissão automática
-- do certificado e a coluna revogado em certificados para
-- que o front-end use uma coluna real do banco.
--
-- Migration idempotente. Não remove dados existentes.
-- ============================================================

begin;

alter table public.profiles
    add column if not exists cpf text;

alter table public.certificados
    add column if not exists revogado boolean not null default false;

create index if not exists certificados_revogado_idx
    on public.certificados (revogado)
    where revogado = true;

comment on column public.profiles.cpf is
    'CPF do usuário, usado na emissão de certificados.';

comment on column public.certificados.revogado is
    'Indica se o certificado foi revogado.';

commit;
