import React, { useEffect, useState, useCallback } from "react";
import { Store, Plus, Pencil, Trash2, Check, X, Hourglass, Coins, Power, Star, ChevronDown, ChevronUp } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import ImageUploader from "../components/ImageUploader";
import ConfirmDialog from "../components/ConfirmDialog";

const TABS = [
  { id: "merchants", label: "Merchants" },
  { id: "items",     label: "Items" },
  { id: "requests",  label: "Requests" },
];

const EMPTY_MERCHANT = {
  name: "", title: "", description: "", greeting: "",
  portrait_url: "", background_url: "", counter_url: "", closed_art_url: "",
  accent_color: "#FBBF24", is_open: true, sort_order: 0,
};

const EMPTY_ITEM = {
  merchant_id: "", name: "", description: "", category: "gear",
  rarity: "common", price_gp: 0, image_url: "", featured: false,
  stock: null, sort_order: 0,
};

export default function AdminShop() {
  const { user } = useAuth();
  const [tab, setTab] = useState("merchants");
  const [merchants, setMerchants] = useState([]);
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [filterMerchant, setFilterMerchant] = useState("");

  const load = useCallback(async () => {
    try {
      const [m, i, r] = await Promise.all([
        api.get("/shop/merchants"),
        api.get("/shop/items"),
        api.get("/shop/requests"),
      ]);
      setMerchants(m.data); setItems(i.data); setRequests(r.data);
    } catch (e) { toast.error(formatApiError(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user) return <div className="text-center py-24 text-muted-bone">Sign in to manage the shop.</div>;
  if (user.role !== "admin") {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <Store className="w-10 h-10 text-lantern mx-auto mb-3 opacity-60" />
        <h1 className="font-serif-display text-2xl text-bone">DM Only</h1>
        <p className="text-muted-bone mt-2">You need the keeper&rsquo;s seal to manage shops.</p>
      </div>
    );
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-10" data-testid="admin-shop">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="block w-10 h-px bg-[#FBBF24]/60" />
            <span className="text-xs tracking-[0.35em] uppercase text-lantern">Lanternkeeper&rsquo;s Ledger</span>
          </div>
          <h1 className="font-serif-display text-4xl text-bone ember-glow">Shop Management</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-rust mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={`px-4 py-2 text-sm tracking-[0.2em] uppercase border-b-2 -mb-px ${
              tab === t.id ? "border-[#FBBF24] text-bone" : "border-transparent text-muted-bone hover:text-bone"
            }`}
          >
            {t.label}
            {t.id === "requests" && pendingCount > 0 && (
              <span data-testid="pending-badge" className="ml-2 inline-flex items-center justify-center text-[10px] tracking-normal bg-[#FBBF24] text-[#0B0E0C] w-5 h-5 font-semibold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "merchants" && (
        <MerchantsTab merchants={merchants} reload={load} />
      )}
      {tab === "items" && (
        <ItemsTab
          items={items} merchants={merchants}
          filterMerchant={filterMerchant} setFilterMerchant={setFilterMerchant}
          reload={load}
        />
      )}
      {tab === "requests" && (
        <RequestsTab requests={requests} reload={load} />
      )}
    </div>
  );
}

// ============================================================================
// MERCHANTS TAB
// ============================================================================
function MerchantsTab({ merchants, reload }) {
  const [editing, setEditing] = useState(null); // merchant id or "new"
  const [form, setForm] = useState(EMPTY_MERCHANT);
  const [confirm, setConfirm] = useState(null);

  const startNew = () => { setForm(EMPTY_MERCHANT); setEditing("new"); };
  const startEdit = (m) => { setForm({ ...EMPTY_MERCHANT, ...m }); setEditing(m.id); };
  const cancel = () => { setEditing(null); setForm(EMPTY_MERCHANT); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    try {
      if (editing === "new") {
        await api.post("/shop/merchants", form);
        toast.success("Merchant created");
      } else {
        await api.put(`/shop/merchants/${editing}`, form);
        toast.success("Merchant saved");
      }
      cancel(); reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleOpen = async (m) => {
    try {
      await api.post(`/shop/merchants/${m.id}/toggle-open`);
      toast.success(m.is_open ? "Shuttered for the night" : "Lanterns lit");
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const confirmDelete = (m) => setConfirm({
    title: `Shutter ${m.name} for good?`,
    body: `This will remove the merchant AND every item on their counter. Pending purchase requests for those items will still be visible in your records.`,
    confirmLabel: "Delete merchant",
    onConfirm: async () => {
      setConfirm(null);
      try {
        await api.delete(`/shop/merchants/${m.id}`);
        toast.success("Merchant removed");
        reload();
      } catch (e) { toast.error(formatApiError(e)); }
    },
  });

  return (
    <div data-testid="merchants-tab">
      <div className="flex justify-end mb-4">
        <button onClick={startNew} data-testid="new-merchant" className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold hover:bg-[#F59E0B]">
          <Plus className="w-4 h-4" /> New merchant
        </button>
      </div>

      {editing && (
        <MerchantForm form={form} setForm={setForm} onSave={save} onCancel={cancel} isNew={editing === "new"} />
      )}

      <ul className="space-y-3">
        {merchants.map((m) => (
          <li key={m.id} data-testid={`row-merchant-${m.id}`} className="lantern-card p-4 flex items-center gap-4">
            {m.portrait_url ? (
              <img src={m.portrait_url} alt="" className="shrink-0 w-12 h-12 object-cover border border-rust" />
            ) : (
              <div className="shrink-0 w-12 h-12 border border-rust flex items-center justify-center text-muted-bone">
                <Store className="w-5 h-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-serif-display text-bone text-lg leading-tight">{m.name}</div>
              <div className="text-xs text-muted-bone">{m.title} · accent {m.accent_color}</div>
            </div>
            <button onClick={() => toggleOpen(m)} data-testid={`toggle-open-${m.id}`}
              className={`px-3 py-1.5 text-[10px] tracking-widest uppercase border ${
                m.is_open ? "border-[#4A7C59] text-[#9BBE9F]" : "border-red-500/50 text-red-300"
              }`}>
              <Power className="w-3 h-3 inline-block mr-1" /> {m.is_open ? "Open" : "Closed"}
            </button>
            <button onClick={() => startEdit(m)} data-testid={`edit-merchant-${m.id}`} className="p-2 text-muted-bone hover:text-lantern" title="Edit">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => confirmDelete(m)} data-testid={`delete-merchant-${m.id}`} className="p-2 text-muted-bone hover:text-red-400" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={Boolean(confirm)} {...(confirm || {})} onCancel={() => setConfirm(null)} testid="confirm-merchant-delete" />
    </div>
  );
}

function MerchantForm({ form, setForm, onSave, onCancel, isNew }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="lantern-card p-5 mb-6" data-testid="merchant-form">
      <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-4">
        {isNew ? "New merchant" : "Edit merchant"}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <FormField label="Name" testid="m-name">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="m-name-input" className="form-input" />
        </FormField>
        <FormField label="Title (subtitle)" testid="m-title">
          <input value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="m-title-input" className="form-input" />
        </FormField>
        <FormField label="Accent color" testid="m-accent">
          <div className="flex gap-2">
            <input type="color" value={form.accent_color || "#FBBF24"} onChange={(e) => set("accent_color", e.target.value)} className="h-9 w-12 bg-transparent border border-rust" />
            <input value={form.accent_color || ""} onChange={(e) => set("accent_color", e.target.value)} className="form-input flex-1" />
          </div>
        </FormField>
        <FormField label="Open?" testid="m-isopen">
          <label className="inline-flex items-center gap-2 px-3 py-2 border border-rust">
            <input type="checkbox" checked={form.is_open} onChange={(e) => set("is_open", e.target.checked)} />
            <span className="text-sm text-bone">{form.is_open ? "Lanterns lit" : "Shuttered"}</span>
          </label>
        </FormField>
      </div>
      <FormField label="Greeting (shown in speech bubble)" testid="m-greeting">
        <textarea value={form.greeting} onChange={(e) => set("greeting", e.target.value)} rows={2} data-testid="m-greeting-input" className="form-input" />
      </FormField>
      <FormField label="Description (shown below the scene)" testid="m-desc">
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} data-testid="m-desc-input" className="form-input" />
      </FormField>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <ImagePickField label="Portrait" url={form.portrait_url} onChange={(v) => set("portrait_url", v)} testid="m-portrait" />
        <ImagePickField label="Background scene" url={form.background_url} onChange={(v) => set("background_url", v)} testid="m-background" />
        <ImagePickField label="Counter overlay (optional)" url={form.counter_url} onChange={(v) => set("counter_url", v)} testid="m-counter" />
        <ImagePickField label="Closed-shop art" url={form.closed_art_url} onChange={(v) => set("closed_art_url", v)} testid="m-closed" />
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onCancel} data-testid="m-cancel" className="px-4 py-2 border border-rust text-muted-bone hover:text-bone">Cancel</button>
        <button onClick={onSave} data-testid="m-save" className="px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold hover:bg-[#F59E0B]">Save</button>
      </div>
      <style>{`.form-input{width:100%;padding:0.5rem 0.75rem;background:#0B0E0C;border:1px solid #4A3328;color:#E6D9C4;font-size:0.875rem}.form-input:focus{outline:none;border-color:#FBBF24}`}</style>
    </div>
  );
}

function ImagePickField({ label, url, onChange, testid }) {
  return (
    <div data-testid={testid}>
      <div className="text-[10px] tracking-widest uppercase text-muted-bone mb-1">{label}</div>
      <div className="flex gap-2 items-start">
        <input value={url || ""} onChange={(e) => onChange(e.target.value)} placeholder="URL or upload →" className="form-input flex-1" />
        <ImageUploader value="" onUploaded={onChange} compact testid={`${testid}-upload`} />
      </div>
      {url && (
        <div className="mt-1">
          <img src={url} alt="" className="w-24 h-24 object-cover border border-rust" />
        </div>
      )}
    </div>
  );
}

function FormField({ label, testid, children }) {
  return (
    <div data-testid={testid}>
      <div className="text-[10px] tracking-widest uppercase text-muted-bone mb-1">{label}</div>
      {children}
    </div>
  );
}

// ============================================================================
// ITEMS TAB
// ============================================================================
function ItemsTab({ items, merchants, filterMerchant, setFilterMerchant, reload }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [confirm, setConfirm] = useState(null);
  const visibleItems = filterMerchant ? items.filter((i) => i.merchant_id === filterMerchant) : items;
  const merchantsById = Object.fromEntries(merchants.map((m) => [m.id, m]));

  const startNew = () => {
    if (merchants.length === 0) { toast.error("Create a merchant first"); return; }
    setForm({ ...EMPTY_ITEM, merchant_id: filterMerchant || merchants[0].id });
    setEditing("new");
  };
  const startEdit = (it) => { setForm({ ...EMPTY_ITEM, ...it }); setEditing(it.id); };
  const cancel = () => { setEditing(null); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.merchant_id) { toast.error("Pick a merchant"); return; }
    try {
      const payload = { ...form, stock: form.stock === "" ? null : form.stock, price_gp: Number(form.price_gp || 0) };
      if (editing === "new") {
        await api.post("/shop/items", payload);
        toast.success("Item added");
      } else {
        await api.put(`/shop/items/${editing}`, payload);
        toast.success("Item saved");
      }
      cancel(); reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const confirmDelete = (it) => setConfirm({
    title: `Take "${it.name}" off the counter?`,
    body: `Pending purchase requests for this item will keep the item snapshot, so already-approved purchases stay intact on the PC sheet.`,
    confirmLabel: "Delete item",
    onConfirm: async () => {
      setConfirm(null);
      try {
        await api.delete(`/shop/items/${it.id}`);
        toast.success("Item removed");
        reload();
      } catch (e) { toast.error(formatApiError(e)); }
    },
  });

  return (
    <div data-testid="items-tab">
      <div className="flex flex-wrap items-center gap-3 mb-4 justify-between">
        <select value={filterMerchant} onChange={(e) => setFilterMerchant(e.target.value)} data-testid="filter-merchant" className="px-3 py-2 bg-[#0B0E0C] border border-rust text-bone text-sm">
          <option value="">All merchants</option>
          {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button onClick={startNew} data-testid="new-item" className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold hover:bg-[#F59E0B]">
          <Plus className="w-4 h-4" /> New item
        </button>
      </div>

      {editing && (
        <ItemForm form={form} setForm={setForm} merchants={merchants} onSave={save} onCancel={cancel} isNew={editing === "new"} />
      )}

      <ul className="space-y-2">
        {visibleItems.map((it) => (
          <li key={it.id} data-testid={`row-item-${it.id}`} className="lantern-card p-3 flex items-center gap-3">
            <div className="shrink-0 w-10 h-10 border border-rust flex items-center justify-center text-muted-bone">
              {it.image_url ? <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <Star className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-serif-display text-bone text-base leading-tight">
                {it.featured && <Star className="w-3 h-3 inline-block mr-1 text-lantern" />}
                {it.name}
              </div>
              <div className="text-xs text-muted-bone">
                {merchantsById[it.merchant_id]?.name || "?"} · {it.category} · {it.rarity} · <span className="text-bone">{it.price_gp} gp</span>
                {it.stock !== null && it.stock !== undefined && <span> · stock {it.stock}</span>}
              </div>
            </div>
            <button onClick={() => startEdit(it)} data-testid={`edit-item-${it.id}`} className="p-2 text-muted-bone hover:text-lantern">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => confirmDelete(it)} data-testid={`delete-item-${it.id}`} className="p-2 text-muted-bone hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
        {visibleItems.length === 0 && (
          <li className="text-center py-12 text-muted-bone">No items yet. Click &ldquo;New item&rdquo; to add one.</li>
        )}
      </ul>
      <ConfirmDialog open={Boolean(confirm)} {...(confirm || {})} onCancel={() => setConfirm(null)} testid="confirm-item-delete" />
    </div>
  );
}

function ItemForm({ form, setForm, merchants, onSave, onCancel, isNew }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="lantern-card p-5 mb-6" data-testid="item-form">
      <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-4">{isNew ? "New item" : "Edit item"}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <FormField label="Name" testid="i-name">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="i-name-input" className="form-input" />
        </FormField>
        <FormField label="Merchant" testid="i-merchant">
          <select value={form.merchant_id} onChange={(e) => set("merchant_id", e.target.value)} data-testid="i-merchant-input" className="form-input">
            <option value="">— select —</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </FormField>
        <FormField label="Category" testid="i-cat">
          <select value={form.category} onChange={(e) => set("category", e.target.value)} data-testid="i-cat-input" className="form-input">
            {["weapon","armor","consumable","gear","curio","magical","service"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Rarity" testid="i-rarity">
          <select value={form.rarity} onChange={(e) => set("rarity", e.target.value)} data-testid="i-rarity-input" className="form-input">
            {["common","uncommon","rare","very-rare","legendary"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </FormField>
        <FormField label="Price (gp)" testid="i-price">
          <input type="number" min="0" value={form.price_gp} onChange={(e) => set("price_gp", e.target.value)} data-testid="i-price-input" className="form-input" />
        </FormField>
        <FormField label="Stock (blank = unlimited)" testid="i-stock">
          <input type="number" min="0" value={form.stock ?? ""} onChange={(e) => set("stock", e.target.value === "" ? null : Number(e.target.value))} data-testid="i-stock-input" className="form-input" />
        </FormField>
      </div>
      <FormField label="Description" testid="i-desc">
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} data-testid="i-desc-input" className="form-input" />
      </FormField>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <ImagePickField label="Item image (optional)" url={form.image_url} onChange={(v) => set("image_url", v)} testid="i-image" />
        <FormField label="Featured?" testid="i-featured">
          <label className="inline-flex items-center gap-2 px-3 py-2 border border-rust">
            <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} data-testid="i-featured-input" />
            <span className="text-sm text-bone">Show on the counter</span>
          </label>
        </FormField>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onCancel} data-testid="i-cancel" className="px-4 py-2 border border-rust text-muted-bone hover:text-bone">Cancel</button>
        <button onClick={onSave} data-testid="i-save" className="px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold hover:bg-[#F59E0B]">Save</button>
      </div>
    </div>
  );
}

// ============================================================================
// REQUESTS TAB
// ============================================================================
function RequestsTab({ requests, reload }) {
  const [showDecided, setShowDecided] = useState(false);
  const [denyId, setDenyId] = useState(null);
  const [denyReason, setDenyReason] = useState("");
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  const approve = async (r) => {
    try {
      await api.post(`/shop/requests/${r.id}/approve`);
      toast.success(`Granted: ${r.item_snapshot?.name} → ${r.pc_name}`);
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const deny = async () => {
    try {
      await api.post(`/shop/requests/${denyId}/deny`, { reason: denyReason });
      toast.success("Request denied");
      setDenyId(null); setDenyReason("");
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div data-testid="requests-tab">
      {pending.length === 0 ? (
        <div className="lantern-card p-10 text-center text-muted-bone" data-testid="no-pending">
          <Hourglass className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No pending requests. The lanterns are quiet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => (
            <li key={r.id} data-testid={`req-${r.id}`} className="lantern-card vine-frame p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-serif-display text-bone text-lg">
                    {r.item_snapshot?.name}
                    <span className="ml-2 text-[10px] tracking-widest uppercase text-muted-bone">· {r.merchant_name}</span>
                  </div>
                  <div className="text-sm text-muted-bone mt-1">
                    <span className="text-bone">{r.user_name}</span>
                    {r.pc_name && <span> rolling as <span className="text-bone">{r.pc_name}</span></span>}
                    {" "}— wants to spend <span className="text-bone inline-flex items-center"><Coins className="w-3 h-3 mx-1 text-lantern" />{r.price_gp} gp</span>
                  </div>
                  {r.note && <div className="text-xs italic text-muted-bone mt-2">&ldquo;{r.note}&rdquo;</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approve(r)} data-testid={`approve-${r.id}`} className="inline-flex items-center gap-1 px-3 py-2 bg-[#4A7C59] text-[#0B0E0C] font-semibold hover:bg-[#5C9170]">
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button onClick={() => { setDenyId(r.id); setDenyReason(""); }} data-testid={`deny-${r.id}`} className="inline-flex items-center gap-1 px-3 py-2 border border-red-500/40 text-red-300 hover:bg-red-500/10">
                    <X className="w-4 h-4" /> Deny
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowDecided((s) => !s)} data-testid="toggle-decided" className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-muted-bone hover:text-bone">
            {showDecided ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} {decided.length} past decision{decided.length === 1 ? "" : "s"}
          </button>
          {showDecided && (
            <ul className="space-y-1 mt-3">
              {decided.map((r) => (
                <li key={r.id} data-testid={`decided-row-${r.id}`} className="text-xs text-muted-bone flex items-center gap-3">
                  <span className={r.status === "approved" ? "text-[#9BBE9F]" : r.status === "denied" ? "text-red-300" : ""}>
                    {r.status}
                  </span>
                  <span className="text-bone">{r.item_snapshot?.name}</span>
                  <span>→ {r.pc_name || r.user_name}</span>
                  {r.reason && <span className="italic">&ldquo;{r.reason}&rdquo;</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Deny reason modal */}
      {denyId && (
        <div className="fixed inset-0 z-50 bg-[#0B0E0C]/85 flex items-center justify-center p-4" onClick={() => setDenyId(null)} data-testid="deny-modal">
          <div onClick={(e) => e.stopPropagation()} className="lantern-card max-w-sm w-full p-5">
            <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3">Deny request</div>
            <textarea value={denyReason} onChange={(e) => setDenyReason(e.target.value)} rows={3} placeholder="Optional message — &lsquo;not in stock&rsquo;, &lsquo;earn it first&rsquo;…"
              data-testid="deny-reason" className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone text-sm focus:border-[#FBBF24] focus:outline-none mb-4"/>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDenyId(null)} className="px-3 py-2 border border-rust text-muted-bone hover:text-bone text-sm">Cancel</button>
              <button onClick={deny} data-testid="confirm-deny" className="px-3 py-2 bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30 text-sm">Confirm deny</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
