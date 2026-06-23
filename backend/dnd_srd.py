"""5e SRD seed data — minimal core. The DM can add/edit/remove any of these via the admin rules page."""

SKILLS = [
    {"name": "Acrobatics", "ability": "dex"},
    {"name": "Animal Handling", "ability": "wis"},
    {"name": "Arcana", "ability": "int"},
    {"name": "Athletics", "ability": "str"},
    {"name": "Deception", "ability": "cha"},
    {"name": "History", "ability": "int"},
    {"name": "Insight", "ability": "wis"},
    {"name": "Intimidation", "ability": "cha"},
    {"name": "Investigation", "ability": "int"},
    {"name": "Medicine", "ability": "wis"},
    {"name": "Nature", "ability": "int"},
    {"name": "Perception", "ability": "wis"},
    {"name": "Performance", "ability": "cha"},
    {"name": "Persuasion", "ability": "cha"},
    {"name": "Religion", "ability": "int"},
    {"name": "Sleight of Hand", "ability": "dex"},
    {"name": "Stealth", "ability": "dex"},
    {"name": "Survival", "ability": "wis"},
]

RACES = [
    {"name": "Human", "ability_bonuses": {"str": 1, "dex": 1, "con": 1, "int": 1, "wis": 1, "cha": 1}, "speed": 30, "size": "Medium", "traits": ["Versatile"], "languages": ["Common", "One extra"]},
    {"name": "Elf (High)", "ability_bonuses": {"dex": 2, "int": 1}, "speed": 30, "size": "Medium", "traits": ["Darkvision 60ft", "Keen Senses", "Fey Ancestry", "Trance", "Cantrip"], "languages": ["Common", "Elvish"]},
    {"name": "Elf (Wood)", "ability_bonuses": {"dex": 2, "wis": 1}, "speed": 35, "size": "Medium", "traits": ["Darkvision 60ft", "Keen Senses", "Fey Ancestry", "Trance", "Mask of the Wild"], "languages": ["Common", "Elvish"]},
    {"name": "Dwarf (Hill)", "ability_bonuses": {"con": 2, "wis": 1}, "speed": 25, "size": "Medium", "traits": ["Darkvision 60ft", "Dwarven Resilience", "Stonecunning", "Dwarven Toughness"], "languages": ["Common", "Dwarvish"]},
    {"name": "Dwarf (Mountain)", "ability_bonuses": {"con": 2, "str": 2}, "speed": 25, "size": "Medium", "traits": ["Darkvision 60ft", "Dwarven Resilience", "Stonecunning", "Armor Training"], "languages": ["Common", "Dwarvish"]},
    {"name": "Halfling (Lightfoot)", "ability_bonuses": {"dex": 2, "cha": 1}, "speed": 25, "size": "Small", "traits": ["Lucky", "Brave", "Halfling Nimbleness", "Naturally Stealthy"], "languages": ["Common", "Halfling"]},
    {"name": "Half-Elf", "ability_bonuses": {"cha": 2, "_choice": "+1 to two other abilities"}, "speed": 30, "size": "Medium", "traits": ["Darkvision 60ft", "Fey Ancestry", "Skill Versatility"], "languages": ["Common", "Elvish", "One extra"]},
    {"name": "Half-Orc", "ability_bonuses": {"str": 2, "con": 1}, "speed": 30, "size": "Medium", "traits": ["Darkvision 60ft", "Menacing", "Relentless Endurance", "Savage Attacks"], "languages": ["Common", "Orc"]},
    {"name": "Dragonborn", "ability_bonuses": {"str": 2, "cha": 1}, "speed": 30, "size": "Medium", "traits": ["Draconic Ancestry", "Breath Weapon", "Damage Resistance"], "languages": ["Common", "Draconic"]},
    {"name": "Gnome (Rock)", "ability_bonuses": {"int": 2, "con": 1}, "speed": 25, "size": "Small", "traits": ["Darkvision 60ft", "Gnome Cunning", "Artificer's Lore", "Tinker"], "languages": ["Common", "Gnomish"]},
    {"name": "Tiefling", "ability_bonuses": {"cha": 2, "int": 1}, "speed": 30, "size": "Medium", "traits": ["Darkvision 60ft", "Hellish Resistance", "Infernal Legacy"], "languages": ["Common", "Infernal"]},
]

CLASSES = [
    {"name": "Barbarian", "hit_die": 12, "primary_ability": "str", "saving_throws": ["str", "con"], "skill_choices": 2, "skill_options": ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"], "spellcasting": None, "features": ["Rage", "Unarmored Defense"]},
    {"name": "Bard", "hit_die": 8, "primary_ability": "cha", "saving_throws": ["dex", "cha"], "skill_choices": 3, "skill_options": "any", "spellcasting": {"ability": "cha", "type": "known"}, "features": ["Bardic Inspiration", "Spellcasting"]},
    {"name": "Cleric", "hit_die": 8, "primary_ability": "wis", "saving_throws": ["wis", "cha"], "skill_choices": 2, "skill_options": ["History", "Insight", "Medicine", "Persuasion", "Religion"], "spellcasting": {"ability": "wis", "type": "prepared"}, "features": ["Divine Domain", "Spellcasting"]},
    {"name": "Druid", "hit_die": 8, "primary_ability": "wis", "saving_throws": ["int", "wis"], "skill_choices": 2, "skill_options": ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"], "spellcasting": {"ability": "wis", "type": "prepared"}, "features": ["Druidic", "Spellcasting"]},
    {"name": "Fighter", "hit_die": 10, "primary_ability": "str", "saving_throws": ["str", "con"], "skill_choices": 2, "skill_options": ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"], "spellcasting": None, "features": ["Fighting Style", "Second Wind"]},
    {"name": "Monk", "hit_die": 8, "primary_ability": "dex", "saving_throws": ["str", "dex"], "skill_choices": 2, "skill_options": ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"], "spellcasting": None, "features": ["Unarmored Defense", "Martial Arts"]},
    {"name": "Paladin", "hit_die": 10, "primary_ability": "str", "saving_throws": ["wis", "cha"], "skill_choices": 2, "skill_options": ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"], "spellcasting": {"ability": "cha", "type": "prepared", "from_level": 2}, "features": ["Divine Sense", "Lay on Hands"]},
    {"name": "Ranger", "hit_die": 10, "primary_ability": "dex", "saving_throws": ["str", "dex"], "skill_choices": 3, "skill_options": ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"], "spellcasting": {"ability": "wis", "type": "known", "from_level": 2}, "features": ["Favored Enemy", "Natural Explorer"]},
    {"name": "Rogue", "hit_die": 8, "primary_ability": "dex", "saving_throws": ["dex", "int"], "skill_choices": 4, "skill_options": ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Performance", "Persuasion", "Sleight of Hand", "Stealth"], "spellcasting": None, "features": ["Expertise", "Sneak Attack", "Thieves' Cant"]},
    {"name": "Sorcerer", "hit_die": 6, "primary_ability": "cha", "saving_throws": ["con", "cha"], "skill_choices": 2, "skill_options": ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"], "spellcasting": {"ability": "cha", "type": "known"}, "features": ["Sorcerous Origin", "Spellcasting"]},
    {"name": "Warlock", "hit_die": 8, "primary_ability": "cha", "saving_throws": ["wis", "cha"], "skill_choices": 2, "skill_options": ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"], "spellcasting": {"ability": "cha", "type": "known", "kind": "pact"}, "features": ["Otherworldly Patron", "Pact Magic"]},
    {"name": "Wizard", "hit_die": 6, "primary_ability": "int", "saving_throws": ["int", "wis"], "skill_choices": 2, "skill_options": ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"], "spellcasting": {"ability": "int", "type": "prepared"}, "features": ["Arcane Recovery", "Spellcasting"]},
]

# Standard 5e spell slot table (full caster)
SPELL_SLOTS_FULL = {
    1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3], 7: [4, 3, 3, 1], 8: [4, 3, 3, 2], 9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2],
    11: [4, 3, 3, 3, 2, 1], 12: [4, 3, 3, 3, 2, 1], 13: [4, 3, 3, 3, 2, 1, 1], 14: [4, 3, 3, 3, 2, 1, 1], 15: [4, 3, 3, 3, 2, 1, 1, 1],
    16: [4, 3, 3, 3, 2, 1, 1, 1], 17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1], 19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
}

SPELLS = [
    # Cantrips (level 0)
    {"name": "Fire Bolt", "level": 0, "school": "Evocation", "casting_time": "1 action", "range": "120 feet", "components": "V, S", "duration": "Instantaneous", "classes": ["Sorcerer", "Wizard"], "description": "You hurl a mote of fire. Make a ranged spell attack. On hit, target takes 1d10 fire damage."},
    {"name": "Mage Hand", "level": 0, "school": "Conjuration", "casting_time": "1 action", "range": "30 feet", "components": "V, S", "duration": "1 minute", "classes": ["Bard", "Sorcerer", "Warlock", "Wizard"], "description": "A spectral hand you can use to manipulate light objects."},
    {"name": "Sacred Flame", "level": 0, "school": "Evocation", "casting_time": "1 action", "range": "60 feet", "components": "V, S", "duration": "Instantaneous", "classes": ["Cleric"], "description": "Flame-like radiance descends on a creature. DEX save or 1d8 radiant."},
    {"name": "Eldritch Blast", "level": 0, "school": "Evocation", "casting_time": "1 action", "range": "120 feet", "components": "V, S", "duration": "Instantaneous", "classes": ["Warlock"], "description": "A beam of crackling energy. Ranged spell attack, 1d10 force damage."},
    {"name": "Druidcraft", "level": 0, "school": "Transmutation", "casting_time": "1 action", "range": "30 feet", "components": "V, S", "duration": "Instantaneous", "classes": ["Druid"], "description": "Whispering to the spirits of nature, you create a small natural effect."},
    {"name": "Light", "level": 0, "school": "Evocation", "casting_time": "1 action", "range": "Touch", "components": "V, M", "duration": "1 hour", "classes": ["Bard", "Cleric", "Sorcerer", "Wizard"], "description": "An object emits bright light in a 20-foot radius."},
    # Level 1
    {"name": "Magic Missile", "level": 1, "school": "Evocation", "casting_time": "1 action", "range": "120 feet", "components": "V, S", "duration": "Instantaneous", "classes": ["Sorcerer", "Wizard"], "description": "Three darts of force, each dealing 1d4+1 damage. Always hits."},
    {"name": "Cure Wounds", "level": 1, "school": "Evocation", "casting_time": "1 action", "range": "Touch", "components": "V, S", "duration": "Instantaneous", "classes": ["Bard", "Cleric", "Druid", "Paladin", "Ranger"], "description": "A creature you touch regains 1d8 + spellcasting modifier HP."},
    {"name": "Shield", "level": 1, "school": "Abjuration", "casting_time": "1 reaction", "range": "Self", "components": "V, S", "duration": "1 round", "classes": ["Sorcerer", "Wizard"], "description": "+5 AC until your next turn, including against the triggering attack."},
    {"name": "Healing Word", "level": 1, "school": "Evocation", "casting_time": "1 bonus action", "range": "60 feet", "components": "V", "duration": "Instantaneous", "classes": ["Bard", "Cleric", "Druid"], "description": "Restore 1d4 + spellcasting modifier HP at range."},
    {"name": "Sleep", "level": 1, "school": "Enchantment", "casting_time": "1 action", "range": "90 feet", "components": "V, S, M", "duration": "1 minute", "classes": ["Bard", "Sorcerer", "Wizard"], "description": "5d8 HP of creatures, lowest first, fall unconscious."},
    {"name": "Hunter's Mark", "level": 1, "school": "Divination", "casting_time": "1 bonus action", "range": "90 feet", "components": "V", "duration": "Concentration, 1 hour", "classes": ["Ranger"], "description": "+1d6 damage to a chosen target on weapon attacks."},
    # Level 2
    {"name": "Misty Step", "level": 2, "school": "Conjuration", "casting_time": "1 bonus action", "range": "Self", "components": "V", "duration": "Instantaneous", "classes": ["Sorcerer", "Warlock", "Wizard"], "description": "Teleport up to 30 feet to an unoccupied space."},
    {"name": "Hold Person", "level": 2, "school": "Enchantment", "casting_time": "1 action", "range": "60 feet", "components": "V, S, M", "duration": "Concentration, 1 minute", "classes": ["Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"], "description": "Humanoid must succeed on WIS save or be paralyzed."},
    {"name": "Spiritual Weapon", "level": 2, "school": "Evocation", "casting_time": "1 bonus action", "range": "60 feet", "components": "V, S", "duration": "1 minute", "classes": ["Cleric"], "description": "Create a floating weapon. Bonus action to attack: 1d8 + spellcasting modifier force damage."},
    # Level 3
    {"name": "Fireball", "level": 3, "school": "Evocation", "casting_time": "1 action", "range": "150 feet", "components": "V, S, M", "duration": "Instantaneous", "classes": ["Sorcerer", "Wizard"], "description": "A 20-foot radius sphere of flame. DEX save or 8d6 fire damage."},
    {"name": "Counterspell", "level": 3, "school": "Abjuration", "casting_time": "1 reaction", "range": "60 feet", "components": "S", "duration": "Instantaneous", "classes": ["Sorcerer", "Warlock", "Wizard"], "description": "Interrupt a spell of 3rd level or lower; higher levels require an ability check."},
    {"name": "Revivify", "level": 3, "school": "Necromancy", "casting_time": "1 action", "range": "Touch", "components": "V, S, M", "duration": "Instantaneous", "classes": ["Cleric", "Paladin"], "description": "Return a creature that died within the last minute to life with 1 HP."},
]
