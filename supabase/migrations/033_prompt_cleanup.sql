-- Keep only pack prompts with concrete, well-defined answer sets; retire the vague ones.
update prompts set active = false where lang = 'en' and key in (
  'pack-meme-1', 'pack-meme-3', 'pack-meme-4', 'pack-meme-5', 'pack-meme-7', 'pack-meme-8',
  'pack-meme-9', 'pack-meme-10', 'pack-meme-13', 'pack-meme-14', 'pack-meme-15', 'pack-meme-17',
  'pack-meme-20', 'pack-meme-21', 'pack-meme-22', 'pack-meme-23', 'pack-meme-24', 'pack-meme-25',
  'pack-meme-26', 'pack-fantasy-13', 'pack-fantasy-17', 'pack-fantasy-22', 'pack-fantasy-23', 'pack-fantasy-24',
  'pack-fantasy-25', 'pack-cyber-3', 'pack-cyber-4', 'pack-cyber-9', 'pack-cyber-11', 'pack-cyber-12',
  'pack-cyber-17', 'pack-cyber-19', 'pack-cyber-20', 'pack-cyber-23', 'pack-cyber-24', 'pack-cyber-25',
  'pack-comedy-4', 'pack-comedy-5', 'pack-comedy-6', 'pack-comedy-7', 'pack-comedy-8', 'pack-comedy-9',
  'pack-comedy-11', 'pack-comedy-12', 'pack-comedy-13', 'pack-comedy-14', 'pack-comedy-15', 'pack-comedy-17',
  'pack-comedy-18', 'pack-comedy-19', 'pack-comedy-21', 'pack-comedy-22', 'pack-comedy-23', 'pack-comedy-24');
update prompts set active = true where lang = 'en' and key in ('pack-meme-2', 'pack-meme-6', 'pack-meme-11', 'pack-meme-12', 'pack-meme-16', 'pack-meme-18', 'pack-meme-19', 'pack-fantasy-1', 'pack-fantasy-2', 'pack-fantasy-3', 'pack-fantasy-4', 'pack-fantasy-5', 'pack-fantasy-6', 'pack-fantasy-7', 'pack-fantasy-8', 'pack-fantasy-9', 'pack-fantasy-10', 'pack-fantasy-11', 'pack-fantasy-12', 'pack-fantasy-14', 'pack-fantasy-15', 'pack-fantasy-16', 'pack-fantasy-18', 'pack-fantasy-19', 'pack-fantasy-20', 'pack-fantasy-21', 'pack-cyber-1', 'pack-cyber-2', 'pack-cyber-5', 'pack-cyber-6', 'pack-cyber-7', 'pack-cyber-8', 'pack-cyber-10', 'pack-cyber-13', 'pack-cyber-14', 'pack-cyber-15', 'pack-cyber-16', 'pack-cyber-18', 'pack-cyber-21', 'pack-cyber-22', 'pack-comedy-1', 'pack-comedy-2', 'pack-comedy-3', 'pack-comedy-10', 'pack-comedy-16', 'pack-comedy-20', 'pack-comedy-25');
