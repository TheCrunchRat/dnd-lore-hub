import React from "react";

const SCHOOLS = ["", "Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];

/**
 * Optional spell-publishing block for a magic-tree node. When the
 * "Also publish as a spell" checkbox is on, the node is rendered in the
 * unified spell library (`/api/spells/library`) and shown in the
 * Compendium.
 */
export default function SpellFields({ node, onChange }) {
  const enabled = node.spell_level !== null && node.spell_level !== undefined;
  return (
    <div className="border border-rust p-3 mb-4" data-testid="node-spell-fields">
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked
            ? { spell_level: 0, casting_time: node.casting_time || "1 action" }
            : { spell_level: null }
          )}
          data-testid="toggle-as-spell"
          className="accent-[#FBBF24]"
        />
        <span className="text-[11px] tracking-[0.25em] uppercase text-lantern">Also publish as a spell</span>
      </label>
      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widest uppercase text-muted-bone">Spell Level</span>
              <select value={node.spell_level ?? 0} onChange={(e) => onChange({ spell_level: parseInt(e.target.value, 10) })}
                data-testid="node-spell-level"
                className="px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm">
                {[0,1,2,3,4,5,6,7,8,9].map((l) => <option key={l} value={l}>{l === 0 ? "Cantrip" : `Lv ${l}`}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widest uppercase text-muted-bone">School</span>
              <select value={node.school || ""} onChange={(e) => onChange({ school: e.target.value })}
                data-testid="node-school"
                className="px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm">
                {SCHOOLS.map((s) => <option key={s} value={s}>{s || "—"}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <TinyInput label="Casting Time" v={node.casting_time} on={(v) => onChange({ casting_time: v })} placeholder="1 action" />
            <TinyInput label="Range" v={node.spell_range} on={(v) => onChange({ spell_range: v })} placeholder="60 feet" />
            <TinyInput label="Components" v={node.components} on={(v) => onChange({ components: v })} placeholder="V, S" />
            <TinyInput label="Duration" v={node.duration} on={(v) => onChange({ duration: v })} placeholder="Instantaneous" />
          </div>
          <TinyInput
            label="Available to classes (comma sep)"
            v={(node.spell_classes || []).join(", ")}
            on={(v) => onChange({ spell_classes: v.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="Wizard, Sorcerer"
          />
          <div className="grid grid-cols-3 gap-2 mt-2">
            <TinyInput
              label="Dice Count"
              v={node.dice_count ?? ""}
              on={(v) => onChange({ dice_count: v === "" ? null : parseInt(v, 10) })}
              placeholder="3"
            />
            <TinyInput
              label="Dice Size"
              v={node.dice_size ?? ""}
              on={(v) => onChange({ dice_size: v === "" ? null : parseInt(v, 10) })}
              placeholder="6"
            />
            <TinyInput
              label="Bonus"
              v={node.bonus ?? 0}
              on={(v) => onChange({ bonus: v === "" ? 0 : parseInt(v, 10) })}
              placeholder="2"
            />
          </div>
        </>
      )}
    </div>
  );
}

function TinyInput({ label, v, on, placeholder }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-widest uppercase text-muted-bone">{label}</span>
      <input value={v || ""} onChange={(e) => on(e.target.value)} placeholder={placeholder}
        className="px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm" />
    </label>
  );
}
