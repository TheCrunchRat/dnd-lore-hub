import React from "react";
import { ShoppingBag } from "lucide-react";

export default function Shop() {
  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16" data-testid="shop-page">
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="block w-10 h-px bg-[#FBBF24]/60" />
          <span className="text-xs tracking-[0.35em] uppercase text-lantern">The Trader&rsquo;s Stall</span>
        </div>
        <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-bone leading-none ember-glow mb-3">
          The Shop
        </h1>
        <p className="text-muted-bone max-w-2xl leading-relaxed">
          Wares, relics, and curiosities — coming soon.
        </p>
      </div>

      <div className="lantern-card vine-frame p-16 text-center" data-testid="shop-empty">
        <ShoppingBag className="w-14 h-14 text-lantern/40 mx-auto mb-5 ember-pulse" strokeWidth={1} />
        <h2 className="font-serif-display text-3xl text-bone mb-2">The stall is still being set up</h2>
        <p className="text-sm text-muted-bone max-w-md mx-auto">
          The merchant hasn&rsquo;t arrived yet. Check back when the lantern is brighter.
        </p>
      </div>
    </div>
  );
}
