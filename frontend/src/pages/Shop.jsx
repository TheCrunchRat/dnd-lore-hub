import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Coins, Lock, Store, X, Hourglass, Check, AlertCircle, Sparkles, Sword, Shield, Package, FlaskRound, Gem, Wrench } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const CATEGORY_ICONS = {
  weapon: Sword,
  armor: Shield,
  consumable: FlaskRound,
  gear: Wrench,
  curio: Sparkles,
  magical: Gem,
  service: Package,
};

const RARITY_COLOR = {
  common:     "#9CA3AF",
  uncommon:   "#7BAE7F",
  rare:       "#60A5FA",
  "very-rare":"#A78BFA",
  legendary:  "#FBBF24",
};

export default function Shop() {
  const { user } = useAuth();
  const [merchants, setMerchants] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null); // full merchant w/ items
  const [pc, setPc] = useState(null);
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null); // item to inspect
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");

  // ---------- bootstrap ----------
  const loadMerchants = useCallback(async () => {
    try {
      const { data } = await api.get("/shop/merchants");
      setMerchants(data);
      if (!activeId && data.length) setActiveId(data[0].id);
    } catch (e) { toast.error(formatApiError(e)); }
  }, [activeId]);

  const loadActive = useCallback(async () => {
    if (!activeId) return;
    try {
      const { data } = await api.get(`/shop/merchants/${activeId}`);
      setActive(data);
    } catch (e) { toast.error(formatApiError(e)); }
  }, [activeId]);

  const loadPc = useCallback(async () => {
    if (!user) { setPc(null); return; }
    try {
      const { data } = await api.get("/me/active-pc");
      setPc(data || null);
    } catch { setPc(null); }
  }, [user]);

  const loadRequests = useCallback(async () => {
    if (!user) { setRequests([]); return; }
    try {
      const { data } = await api.get("/shop/requests");
      setRequests(data);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { loadMerchants(); }, [loadMerchants]);
  useEffect(() => { loadActive(); }, [loadActive]);
  useEffect(() => { loadPc(); }, [loadPc]);
  useEffect(() => { loadRequests(); loadPc(); }, [loadRequests, loadPc]);

  // Poll requests every 8s so approvals show up live
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => { loadRequests(); loadPc(); }, 8000);
    return () => clearInterval(t);
  }, [user, loadRequests, loadPc]);

  // ---------- helpers ----------
  const gold = pc?.metadata?.gold_gp ?? 0;
  const myPending = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );
  const myDecided = useMemo(
    () => requests.filter((r) => r.status !== "pending").slice(0, 5),
    [requests]
  );

  const itemRequestStatus = (itemId) => requests.find(
    (r) => r.item_id === itemId && r.status === "pending" && (!pc || r.pc_id === pc.id)
  );

  const submitRequest = async () => {
    if (!selected || !pc) return;
    setSubmitting(true);
    try {
      await api.post(`/shop/items/${selected.id}/request`, { pc_id: pc.id, note });
      toast.success("Request sent to the Lanternkeeper");
      setSelected(null);
      setNote("");
      loadRequests();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSubmitting(false); }
  };

  const cancelRequest = async (rid) => {
    try {
      await api.post(`/shop/requests/${rid}/cancel`);
      toast.success("Request withdrawn");
      loadRequests();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  // ---------- empty state ----------
  if (merchants.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center" data-testid="shop-empty">
        <Store className="w-12 h-12 text-lantern mx-auto mb-4 opacity-50" strokeWidth={1.25} />
        <h1 className="font-serif-display text-3xl text-bone mb-2">The market is dark tonight</h1>
        <p className="text-muted-bone">No merchants have set their lanterns out yet.</p>
        {user?.role === "admin" && (
          <Link to="/admin/shop" data-testid="empty-add-merchant" className="inline-block mt-6 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B]">
            Open a new shop
          </Link>
        )}
      </div>
    );
  }

  if (!active) {
    return <div className="text-center py-24 text-muted-bone">Lighting the lanterns…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10" data-testid="shop-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="block w-10 h-px bg-[#FBBF24]/60" />
            <span className="text-xs tracking-[0.35em] uppercase text-lantern">The Lanternkeeper&rsquo;s Market</span>
          </div>
          <h1 className="font-serif-display text-4xl sm:text-5xl text-bone leading-none ember-glow">
            Wares by Lantern-light
          </h1>
        </div>
        {user && (
          <div className="flex items-center gap-3 flex-wrap" data-testid="shop-status-strip">
            {pc ? (
              <div className="flex items-center gap-3 px-3 py-2 border border-rust bg-stone-light/40">
                <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">Spending as</div>
                <div className="text-sm text-bone font-serif-display">{pc.title}</div>
                <div className="flex items-center gap-1 text-bone border-l border-rust pl-3 ml-1" data-testid="my-gold">
                  <Coins className="w-3.5 h-3.5 text-lantern" />
                  <span className="font-serif-display text-lg">{gold}</span>
                  <span className="text-[10px] tracking-widest text-muted-bone uppercase ml-1">gp</span>
                </div>
              </div>
            ) : (
              <Link to="/profile" data-testid="no-pc-cta" className="text-xs tracking-widest uppercase text-muted-bone hover:text-lantern">
                Claim a character to shop
              </Link>
            )}
            {user.role === "admin" && (
              <Link to="/admin/shop" data-testid="admin-shop-link" className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-lantern">
                Manage shop ↗
              </Link>
            )}
          </div>
        )}
      </div>

      {/* My pending requests (collapsed strip) */}
      {user && myPending.length > 0 && (
        <div className="mb-6 lantern-card p-3" data-testid="my-pending-strip">
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2 inline-flex items-center gap-2">
            <Hourglass className="w-3 h-3" /> Awaiting the Keeper&rsquo;s seal
          </div>
          <ul className="space-y-1.5">
            {myPending.map((r) => (
              <li key={r.id} data-testid={`my-pending-${r.id}`} className="flex items-center justify-between gap-3 text-sm">
                <div className="text-bone truncate">
                  <span className="font-serif-display">{r.item_snapshot?.name}</span>
                  <span className="text-muted-bone text-xs ml-2">· {r.merchant_name} · {r.price_gp} gp</span>
                  {r.pc_name && <span className="text-muted-bone text-xs ml-1">→ {r.pc_name}</span>}
                </div>
                <button onClick={() => cancelRequest(r.id)} data-testid={`cancel-${r.id}`} className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-red-400">
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* My recent decisions */}
      {user && myDecided.length > 0 && (
        <div className="mb-6 text-xs text-muted-bone flex items-center gap-3 flex-wrap" data-testid="my-recent-decisions">
          {myDecided.map((r) => (
            <span key={r.id} data-testid={`decided-${r.id}`} className={`inline-flex items-center gap-1.5 px-2 py-1 border ${
              r.status === "approved" ? "border-[#4A7C59]/50 text-[#9BBE9F]" :
              r.status === "denied" ? "border-red-500/40 text-red-300" :
              "border-[#2C362F] text-muted-bone"
            }`}>
              {r.status === "approved" ? <Check className="w-3 h-3" /> :
               r.status === "denied" ? <X className="w-3 h-3" /> :
               <AlertCircle className="w-3 h-3" />}
              {r.item_snapshot?.name} · {r.status}
              {r.reason && <span className="italic">— &ldquo;{r.reason}&rdquo;</span>}
            </span>
          ))}
        </div>
      )}

      {/* Merchant tab strip */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1" data-testid="merchant-tabs">
        {merchants.map((m) => (
          <button
            key={m.id}
            onClick={() => setActiveId(m.id)}
            data-testid={`merchant-tab-${m.id}`}
            className={`shrink-0 px-4 py-2 border flex items-center gap-2 transition-colors ${
              m.id === activeId
                ? "border-[#FBBF24] bg-[#FBBF24]/10 text-bone"
                : "border-rust text-muted-bone hover:border-[#FBBF24]/60 hover:text-bone"
            }`}
          >
            {m.portrait_url && (
              <img src={m.portrait_url} alt="" className="w-6 h-6 object-cover border border-[#FBBF24]/40" />
            )}
            <span className="font-serif-display text-sm whitespace-nowrap">{m.name}</span>
            {!m.is_open && <span className="text-[9px] tracking-widest uppercase text-red-400 ml-1">closed</span>}
          </button>
        ))}
      </div>

      {/* Scene */}
      <MerchantScene
        merchant={active}
        accent={active.accent_color || "#FBBF24"}
        onItemClick={(it) => { if (active.is_open) setSelected(it); }}
        canBuy={Boolean(user && pc && active.is_open)}
        itemRequestStatus={itemRequestStatus}
      />

      {/* Item modal */}
      {selected && (
        <ItemModal
          item={selected}
          merchant={active}
          pc={pc}
          gold={gold}
          user={user}
          note={note}
          setNote={setNote}
          onClose={() => { setSelected(null); setNote(""); }}
          onSubmit={submitRequest}
          submitting={submitting}
          alreadyRequested={Boolean(itemRequestStatus(selected.id))}
        />
      )}
    </div>
  );
}

function MerchantScene({ merchant, accent, onItemClick, canBuy, itemRequestStatus }) {
  const isOpen = merchant.is_open !== false;
  const closedArt = merchant.closed_art_url;
  const featured = merchant.featured_items || [];
  const rest = (merchant.items || []).filter((i) => !i.featured);

  return (
    <div data-testid="merchant-scene" className="relative">
      {/* Background scene */}
      <div
        className="relative overflow-hidden border vine-frame"
        style={{
          borderColor: `${accent}66`,
          minHeight: "520px",
          backgroundImage: merchant.background_url ? `linear-gradient(to bottom, rgba(11,14,12,0.4) 0%, rgba(11,14,12,0.95) 70%), url('${merchant.background_url}')` : "linear-gradient(180deg, #14181655, #0B0E0C)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Portrait + greeting */}
        <div className="relative z-10 px-6 sm:px-10 pt-10 pb-6">
          <div className="flex items-start gap-5 max-w-3xl">
            {merchant.portrait_url && (
              <div className="shrink-0">
                <div
                  className="w-24 h-24 sm:w-32 sm:h-32 border-2 overflow-hidden"
                  style={{ borderColor: `${accent}AA`, boxShadow: `0 0 24px ${accent}33` }}
                >
                  <img src={merchant.portrait_url} alt={merchant.name} className="w-full h-full object-cover" />
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.35em] uppercase mb-1" style={{ color: accent }}>
                {merchant.title || "Merchant"}
              </div>
              <h2 className="font-serif-display text-3xl sm:text-4xl text-bone leading-tight" data-testid="merchant-name">{merchant.name}</h2>
              {merchant.greeting && (
                <div
                  data-testid="merchant-greeting"
                  className="relative inline-block mt-3 px-4 py-2 max-w-xl bg-stone-light/80 border border-rust text-sm text-bone italic"
                  style={{ borderColor: `${accent}55` }}
                >
                  &ldquo;{merchant.greeting}&rdquo;
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Closed state */}
        {!isOpen ? (
          <ClosedSign accent={accent} closedArt={closedArt} />
        ) : (
          // Featured row anchored over the counter
          featured.length > 0 && (
            <div
              className="relative z-10 px-4 sm:px-8 pb-6"
              data-testid="featured-row"
              style={{
                background: `linear-gradient(180deg, transparent 0%, ${accent}11 60%, ${accent}22 100%)`,
              }}
            >
              <div className="text-[10px] tracking-[0.35em] uppercase mb-3" style={{ color: accent }}>
                On the counter
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {featured.map((it) => (
                  <FeaturedItem key={it.id} item={it} accent={accent} onClick={() => onItemClick(it)} pending={Boolean(itemRequestStatus(it.id))} canBuy={canBuy} />
                ))}
              </div>
            </div>
          )
        )}

        {/* Counter band */}
        {isOpen && (
          <div
            className="relative z-10 h-3"
            style={{ background: `linear-gradient(180deg, ${accent}66, ${accent}00)` }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Description */}
      {merchant.description && (
        <p className="text-sm text-muted-bone italic mt-4 max-w-3xl" data-testid="merchant-description">
          {merchant.description}
        </p>
      )}

      {/* Rest of wares (scroll list below the scene) */}
      {isOpen && rest.length > 0 && (
        <div className="mt-8" data-testid="rest-of-wares">
          <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3">More wares</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {rest.map((it) => (
              <ItemCard key={it.id} item={it} accent={accent} onClick={() => onItemClick(it)} pending={Boolean(itemRequestStatus(it.id))} canBuy={canBuy} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClosedSign({ accent, closedArt }) {
  return (
    <div
      data-testid="shop-closed"
      className="relative z-10 mx-6 sm:mx-10 mb-10 mt-4 py-10 text-center border-2 border-dashed flex flex-col items-center"
      style={{ borderColor: `${accent}55`, background: "rgba(11,14,12,0.65)" }}
    >
      {closedArt ? (
        <img src={closedArt} alt="" className="w-32 h-32 object-cover opacity-80 border border-[#FBBF24]/40 mb-4" />
      ) : (
        <div className="relative mb-4">
          <Lock className="w-12 h-12 text-lantern/60" strokeWidth={1.25} />
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full ember-pulse"
            style={{ background: accent, boxShadow: `0 0 16px ${accent}` }}
          />
        </div>
      )}
      <div className="text-xs tracking-[0.35em] uppercase mb-2" style={{ color: accent }}>
        Shuttered for the night
      </div>
      <h3 className="font-serif-display text-2xl text-bone">Return when the lantern flickers again</h3>
      <p className="text-sm text-muted-bone italic mt-2 max-w-md">
        The merchant has drawn the curtain — only the keeper can rouse them.
      </p>
    </div>
  );
}

function FeaturedItem({ item, accent, onClick, pending, canBuy }) {
  const Icon = CATEGORY_ICONS[item.category] || Package;
  return (
    <button
      onClick={onClick}
      data-testid={`featured-item-${item.id}`}
      disabled={!canBuy}
      className="text-left bg-stone-light/80 border-2 p-3 hover:scale-[1.02] transition-transform flex gap-3 items-start group disabled:cursor-default disabled:opacity-70"
      style={{ borderColor: `${accent}88`, boxShadow: `0 0 18px ${accent}22` }}
    >
      <div className="shrink-0 w-14 h-14 flex items-center justify-center border" style={{ borderColor: `${accent}55`, background: `${accent}11` }}>
        {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <Icon className="w-6 h-6" style={{ color: accent }} strokeWidth={1.25} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-serif-display text-bone group-hover:text-lantern transition-colors text-lg leading-tight">{item.name}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] tracking-widest uppercase" style={{ color: RARITY_COLOR[item.rarity] || "#9CA3AF" }}>{item.rarity}</span>
          <span className="text-[9px] text-muted-bone uppercase tracking-widest">· {item.category}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-bone">
          <Coins className="w-3 h-3 text-lantern" />
          <span className="font-serif-display text-lg leading-none">{item.price_gp}</span>
          <span className="text-[9px] tracking-widest text-muted-bone uppercase ml-1">gp</span>
          {pending && <span className="ml-3 text-[9px] tracking-widest text-lantern uppercase">requested</span>}
        </div>
      </div>
    </button>
  );
}

function ItemCard({ item, accent, onClick, pending, canBuy }) {
  const Icon = CATEGORY_ICONS[item.category] || Package;
  return (
    <button
      onClick={onClick}
      data-testid={`item-${item.id}`}
      disabled={!canBuy}
      className="text-left lantern-card p-3 hover:bg-stone-light transition-colors flex gap-3 items-start disabled:cursor-default disabled:opacity-80"
    >
      <div className="shrink-0 w-12 h-12 flex items-center justify-center border" style={{ borderColor: `${accent}44`, background: "#0B0E0C" }}>
        {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <Icon className="w-5 h-5" style={{ color: accent }} strokeWidth={1.25} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-serif-display text-bone truncate">{item.name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] tracking-widest uppercase" style={{ color: RARITY_COLOR[item.rarity] || "#9CA3AF" }}>{item.rarity}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-bone">
          <Coins className="w-3 h-3 text-lantern" />
          <span className="font-serif-display text-sm leading-none">{item.price_gp}</span>
          <span className="text-[9px] tracking-widest text-muted-bone uppercase ml-1">gp</span>
          {pending && <span className="ml-2 text-[9px] tracking-widest text-lantern uppercase">requested</span>}
        </div>
      </div>
    </button>
  );
}

function ItemModal({ item, merchant, pc, gold, user, note, setNote, onClose, onSubmit, submitting, alreadyRequested }) {
  const Icon = CATEGORY_ICONS[item.category] || Package;
  const accent = merchant.accent_color || "#FBBF24";
  const affords = gold >= item.price_gp;
  const blocked = !user || !pc || alreadyRequested || !affords;

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/85 flex items-center justify-center p-4" onClick={onClose} data-testid="item-modal">
      <div onClick={(e) => e.stopPropagation()} className="lantern-card vine-frame max-w-lg w-full p-6 relative" style={{ borderColor: `${accent}77` }}>
        <button onClick={onClose} data-testid="item-modal-close" className="absolute top-3 right-3 p-1 text-muted-bone hover:text-bone">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4 mb-4">
          <div className="shrink-0 w-20 h-20 flex items-center justify-center border" style={{ borderColor: `${accent}55`, background: "#0B0E0C" }}>
            {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <Icon className="w-9 h-9" style={{ color: accent }} strokeWidth={1.25} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: RARITY_COLOR[item.rarity] || "#9CA3AF" }}>{item.rarity} · {item.category}</div>
            <h3 className="font-serif-display text-2xl text-bone leading-tight">{item.name}</h3>
            <div className="flex items-center gap-1.5 mt-2">
              <Coins className="w-4 h-4 text-lantern" />
              <span className="font-serif-display text-2xl text-bone leading-none">{item.price_gp}</span>
              <span className="text-[10px] tracking-widest text-muted-bone uppercase ml-1">gp</span>
            </div>
          </div>
        </div>

        {item.description && (
          <p className="text-sm text-bone italic leading-relaxed mb-5" data-testid="item-modal-description">{item.description}</p>
        )}

        {!user ? (
          <Link to="/login" className="block w-full text-center px-4 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B]">
            Sign in to shop
          </Link>
        ) : !pc ? (
          <Link to="/profile" className="block w-full text-center px-4 py-3 border border-rust text-bone hover:bg-stone-light">
            Claim a character first ↗
          </Link>
        ) : (
          <>
            <div className="text-xs text-muted-bone mb-3 flex items-center justify-between" data-testid="modal-gold-check">
              <span>{pc.title} carries <span className="text-bone font-serif-display">{gold} gp</span></span>
              <span className={affords ? "text-[#9BBE9F]" : "text-red-300"}>
                {affords ? "✓ can afford" : `short ${item.price_gp - gold} gp`}
              </span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A short note for the Keeper (optional) — 'paying with the Mirewatch IOU'"
              data-testid="request-note"
              rows={2}
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone text-sm focus:border-[#FBBF24] focus:outline-none mb-4"
            />
            <button
              onClick={onSubmit}
              disabled={blocked || submitting}
              data-testid="request-buy-btn"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Hourglass className="w-4 h-4" />
              {alreadyRequested ? "Already requested" : submitting ? "Sending…" : `Request to buy · ${item.price_gp} gp`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
