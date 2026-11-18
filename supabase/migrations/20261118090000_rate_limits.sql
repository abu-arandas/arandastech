-- Rate limits (blueprint 10.1, "rate limits and retry controls"). The public lead form, the checkout and failed
-- sign-ins are counted per caller and per time window. The caller is a hash of the address, never the address itself.

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, window_start)
);
create index rate_limits_window_start on public.rate_limits (window_start);
comment on table public.rate_limits is 'Hits per caller and time window, for the public forms, the checkout and failed sign-ins. Old windows are deleted as new ones are counted.';

select app.secure_all_tables();
