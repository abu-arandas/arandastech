-- A/B tests of the sales emails. While both versions of an email are approved, Sales sends them in turn; once each
-- version has gone to enough people, the one with more replies is kept here and sent from then on.

create table public.template_tests (
  template text primary key,
  winner text not null,
  a_sends integer not null,
  a_replies integer not null,
  b_sends integer not null,
  b_replies integer not null,
  decided_at timestamptz not null default now()
);
comment on table public.template_tests is 'The decided A/B tests of sales emails: which version won, on how many sends and replies.';

select app.secure_all_tables();
