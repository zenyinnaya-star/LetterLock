alter function _defaults() set search_path = public;
alter function _answer_secs(jsonb, int, boolean) set search_path = public;
alter function _clamp(jsonb, int, int, int) set search_path = public;
