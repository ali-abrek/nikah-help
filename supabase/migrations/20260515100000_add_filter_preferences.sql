alter table profiles
  add column if not exists filter_preferences jsonb default null;
