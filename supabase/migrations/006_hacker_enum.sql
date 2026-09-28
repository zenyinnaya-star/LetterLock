-- New class. Kept in its own migration: an enum value must be committed before it is used.
alter type player_class add value if not exists 'hacker';
