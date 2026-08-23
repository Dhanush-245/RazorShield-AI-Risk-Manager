import { useState } from 'react';
import {
  Hammer,
  Layers,
  Hexagon,
  Ruler,
  Box,
  ArrowUpRight,
  Plus,
  Minus,
  CircleDot,
} from 'lucide-react';

const SPEC_CATEGORIES = [
  { id: 'construction', label: 'CONSTRUCTION', icon: Hammer },
  { id: 'materials', label: 'MATERIALS', icon: Layers },
  { id: 'provenance', label: 'PROVENANCE', icon: Hexagon },
  { id: 'dimensions', label: 'DIMENSIONS', icon: Ruler },
  { id: 'edition', label: 'EDITION', icon: Box },
];

const ARTIFACTS = {
  left: {
    code: 'WRK-014',
    name: 'FOUNDRY RUNNER',
    series: 'CAST IRON SERIES',
    img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&h=1100&fit=crop',
    price: '2.40 ETH',
    minted: 87,
    total: 120,
    accent: '#E84B1C',
    specs: {
      construction: [
        ['UPPER BUILD', 'Hand-stitched welt, 312 passes'],
        ['SOLE UNIT', 'Poured rubber, single mold'],
        ['LACING SYSTEM', 'Forged D-ring, 8-point'],
        ['ASSEMBLY TIME', '14.5 hours'],
      ],
      materials: [
        ['PRIMARY', 'Full-grain steerhide, 2.2mm'],
        ['LINING', 'Vegetable-tanned calfskin'],
        ['HARDWARE', 'Blackened brass, sand-cast'],
        ['THREAD', 'Waxed linen No. 4'],
      ],
      provenance: [
        ['CHAIN', 'Ethereum Mainnet'],
        ['CONTRACT', '0x4a2f...9e1c'],
        ['ARTIST', 'M. Okonkwo, Detroit Atelier'],
        ['SCAN FIDELITY', '0.02mm photogrammetry'],
      ],
      dimensions: [
        ['POLY COUNT', '4.2M triangles'],
        ['TEXTURE RES', '8K PBR, 6 maps'],
        ['FILE WEIGHT', '1.84 GB uncompressed'],
        ['AR READY', 'USDZ + GLB included'],
      ],
      edition: [
        ['EDITION SIZE', '120 numbered'],
        ['ARTIST PROOFS', '6 retained'],
        ['PHYSICAL CLAIM', 'Yes — 1:1 redeemable'],
        ['ROYALTY', '7.5% in perpetuity'],
      ],
    },
  },
  right: {
    code: 'WRK-019',
    name: 'GANTRY HIGH',
    series: 'STRUCTURAL STEEL SERIES',
    img: 'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=900&h=1100&fit=crop',
    price: '3.15 ETH',
    minted: 42,
    total: 80,
    accent: '#D9A441',
    specs: {
      construction: [
        ['UPPER BUILD', 'Cemented panel, 9-piece pattern'],
        ['SOLE UNIT', 'Stacked crepe, hand-buffed'],
        ['LACING SYSTEM', 'Riveted speed-hooks, 12-point'],
        ['ASSEMBLY TIME', '21 hours'],
      ],
      materials: [
        ['PRIMARY', 'Roughout suede, 1.8mm'],
        ['LINING', 'Unlined — raw interior'],
        ['HARDWARE', 'Stainless rivet, milled'],
        ['THREAD', 'Bonded nylon No. 6'],
      ],
      provenance: [
        ['CHAIN', 'Ethereum Mainnet'],
        ['CONTRACT', '0x7c91...b440'],
        ['ARTIST', 'R. Lindqvist, Malmö Works'],
        ['SCAN FIDELITY', '0.05mm structured light'],
      ],
      dimensions: [
        ['POLY COUNT', '2.8M triangles'],
        ['TEXTURE RES', '8K PBR, 5 maps'],
        ['FILE WEIGHT', '1.21 GB uncompressed'],
        ['AR READY', 'USDZ + GLB included'],
      ],
      edition: [
        ['EDITION SIZE', '80 numbered'],
        ['ARTIST PROOFS', '4 retained'],
        ['PHYSICAL CLAIM', 'Yes — 1:1 redeemable'],
        ['ROYALTY', '10% in perpetuity'],
      ],
    },
  },
};

function ArtifactPanel({ data, side, activeSpec }) {
  const [hovered, setHovered] = useState(false);
  const specs = data.specs[activeSpec];

  return (
    <div className="flex flex-col h-full">
      {/* Image block */}
      <div
        className="relative overflow-hidden bg-[#1c1b19] border border-[#33312d] group cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="absolute top-0 left-0 z-20 flex items-center gap-2 px-4 py-3">
          <span
            className="font-mono text-[10px] tracking-[0.25em] px-2 py-1 border"
            style={{ color: data.accent, borderColor: data.accent }}
          >
            {data.code}
          </span>
        </div>
        <div className="absolute top-0 right-0 z-20 px-4 py-3">
          <ArrowUpRight
            size={20}
            className="transition-all duration-300"
            style={{
              color: hovered ? data.accent : '#6b675f',
              transform: hovered ? 'translate(2px,-2px)' : 'none',
            }}
          />
        </div>
        <div className="aspect-[4/5] overflow-hidden">
          <img
            src={data.img}
            alt={data.name}
            className="w-full h-full object-cover transition-transform duration-700 ease-out grayscale-[35%] group-hover:grayscale-0 group-hover:scale-[1.04]"
          />
        </div>
        {/* bottom plate */}
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-[#141312] border-t border-[#33312d] px-4 py-3 flex items-end justify-between">
          <div>
            <p className="font-mono text-[9px] tracking-[0.3em] text-[#7a756b] mb-1">
              {data.series}
            </p>
            <h3
              className="text-xl leading-none tracking-tight text-[#e8e4dc]"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              {data.name}
            </h3>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] tracking-[0.2em] text-[#7a756b]">RESERVE</p>
            <p
              className="font-mono text-sm font-bold transition-colors duration-300"
              style={{ color: hovered ? data.accent : '#e8e4dc' }}
            >
              {data.price}
            </p>
          </div>
        </div>
      </div>

      {/* Spec rows */}
      <div className="mt-px flex-1 flex flex-col">
        {specs.map(([k, v], i) => (
          <div
            key={k}
            className="spec-row flex items-baseline justify-between gap-4 px-4 py-[13px] bg-[#181715] border border-[#2b2925] -mt-px transition-colors duration-200"
            style={{ '--accent': data.accent }}
          >
            <span className="font-mono text-[10px] tracking-[0.18em] text-[#6e6a61] shrink-0">
              {String(i + 1).padStart(2, '0')} / {k}
            </span>
            <span className="font-mono text-[12px] text-[#d6d1c7] text-right">{v}</span>
          </div>
        ))}
      </div>

      {/* Mint progress */}
      <div className="mt-4 bg-[#141312] border border-[#2b2925] px-4 py-4">
        <div className="flex justify-between items-baseline mb-3">
          <span className="font-mono text-[10px] tracking-[0.25em] text-[#7a756b]">
            EDITIONS CLAIMED
          </span>
          <span className="font-mono text-xs text-[#e8e4dc]">
            {data.minted} <span className="text-[#5b574f]">/ {data.total}</span>
          </span>
        </div>
        <div className="h-[6px] bg-[#26241f] relative overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${(data.minted / data.total) * 100}%`,
              background: `repeating-linear-gradient(45deg, ${data.accent}, ${data.accent} 4px, #141312 4px, #141312 6px)`,
            }}
          />
        </div>
        <button
          className="mt-4 w-full py-3 font-mono text-[11px] tracking-[0.3em] border transition-all duration-200 hover:tracking-[0.4em]"
          style={{
            borderColor: data.accent,
            color: hovered ? '#0f0e0d' : data.accent,
            background: hovered ? data.accent : 'transparent',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          ACQUIRE {data.code}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [activeSpec, setActiveSpec] = useState('construction');
  const [hoverNav, setHoverNav] = useState(null);

  return (
    <div className="min-h-screen bg-[#0f0e0d] text-[#e8e4dc] relative">
      <link
        href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
        body { background: #0f0e0d; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .noise::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 50;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 250 250' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
        }
        .grid-lines {
          background-image:
            linear-gradient(to right, #1d1c19 1px, transparent 1px),
            linear-gradient(to bottom, #1d1c19 1px, transparent 1px);
          background-size: 64px 64px;
        }
        .spec-row:hover {
          background: #1f1d1a;
          border-color: var(--accent);
        }
        .vertical-text {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
        }
        ::selection { background: #E84B1C; color: #0f0e0d; }
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: #141312; }
        ::-webkit-scrollbar-thumb { background: #33312d; border: 2px solid #141312; }
        ::-webkit-scrollbar-thumb:hover { background: #E84B1C; }
      `,
        }}
      />

      <div className="noise grid-lines min-h-screen">
        {/* Top bar */}
        <header className="border-b border-[#2b2925] bg-[#0f0e0d]">
          <div className="flex items-stretch">
            <div className="px-6 py-4 border-r border-[#2b2925] flex items-center gap-3">
              <div className="w-8 h-8 bg-[#E84B1C] flex items-center justify-center">
                <Hammer size={16} className="text-[#0f0e0d]" />
              </div>
              <span
                className="text-lg tracking-tight"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                WRKBENCH
              </span>
            </div>
            <div className="hidden md:flex items-center px-6 font-mono text-[10px] tracking-[0.3em] text-[#7a756b] gap-8">
              <span className="hover:text-[#E84B1C] transition-colors cursor-pointer">FOUNDRY</span>
              <span className="hover:text-[#E84B1C] transition-colors cursor-pointer">ARCHIVE</span>
              <span className="text-[#e8e4dc] border-b border-[#E84B1C] pb-px cursor-pointer">
                COMPARISON BENCH
              </span>
            </div>
            <div className="ml-auto px-6 flex items-center border-l border-[#2b2925]">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#7a756b]">
                BLOCK 19,442,107 · GAS 14 GWEI
              </span>
            </div>
          </div>
        </header>

        {/* Main asymmetric layout */}
        <main className="grid grid-cols-1 lg:grid-cols-3 min-h-[calc(100vh-65px)]">
          {/* LEFT — ⅓ control column */}
          <aside className="lg:col-span-1 border-r border-[#2b2925] bg-[#121110] flex">
            {/* vertical label rail */}
            <div className="hidden lg:flex w-14 border-r border-[#2b2925] items-center justify-center py-8">
              <span className="vertical-text font-mono text-[10px] tracking-[0.5em] text-[#5b574f]">
                SIDE-BY-SIDE INSPECTION · DIGITAL TWIN ARTIFACTS · DROP 04
              </span>
            </div>

            <div className="flex-1 p-8 lg:p-10 flex flex-col">
              <p className="font-mono text-[10px] tracking-[0.35em] text-[#E84B1C] mb-6">
                THE COMPARISON BENCH
              </p>
              <h1
                className="text-5xl lg:text-[56px] leading-[0.95] tracking-tight mb-6"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                TWO
                <br />
                BUILDS.
                <br />
                <span className="text-[#5b574f]">ONE</span>
                <br />
                <span className="text-[#5b574f]">VERDICT.</span>
              </h1>
              <p className="font-mono text-[12px] leading-relaxed text-[#9a948a] max-w-[34ch] mb-10">
                Every artifact in our foundry is scanned from a hand-built original. Lay two on the
                bench. Inspect every stitch, rivet and pour before you claim.
              </p>

              {/* spec selector */}
              <div className="border-t border-[#2b2925]">
                {SPEC_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const active = activeSpec === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveSpec(cat.id)}
                      onMouseEnter={() => setHoverNav(cat.id)}
                      onMouseLeave={() => setHoverNav(null)}
                      className="w-full flex items-center justify-between py-4 border-b border-[#2b2925] transition-colors duration-200 group"
                    >
                      <span className="flex items-center gap-4">
                        <Icon
                          size={15}
                          className="transition-colors duration-200"
                          style={{
                            color: active ? '#E84B1C' : hoverNav === cat.id ? '#d6d1c7' : '#5b574f',
                          }}
                        />
                        <span
                          className="font-mono text-[12px] tracking-[0.25em] transition-colors duration-200"
                          style={{
                            color: active ? '#e8e4dc' : hoverNav === cat.id ? '#bcb6aa' : '#7a756b',
                          }}
                        >
                          {cat.label}
                        </span>
                      </span>
                      {active ? (
                        <Minus size={14} className="text-[#E84B1C]" />
                      ) : (
                        <Plus
                          size={14}
                          className="text-[#5b574f] group-hover:text-[#bcb6aa] transition-colors"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* footer plate */}
              <div className="mt-auto pt-10">
                <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.2em] text-[#5b574f]">
                  <CircleDot size={12} className="text-[#E84B1C]" />
                  INSPECTING:{' '}
                  <span className="text-[#e8e4dc]">
                    {SPEC_CATEGORIES.find((c) => c.id === activeSpec).label}
                  </span>
                </div>
                <div className="mt-4 h-px bg-[#2b2925]" />
                <p className="mt-4 font-mono text-[9px] tracking-[0.2em] text-[#45423c] leading-relaxed">
                  WRKBENCH FOUNDRY LLC · DETROIT / MALMÖ
                  <br />
                  ALL ARTIFACTS REDEEMABLE FOR PHYSICAL PAIRS
                </p>
              </div>
            </div>
          </aside>

          {/* RIGHT — ⅔ comparison */}
          <section className="lg:col-span-2 p-6 lg:p-10 relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10 relative">
              <ArtifactPanel data={ARTIFACTS.left} side="left" activeSpec={activeSpec} />

              {/* VS divider */}
              <div className="hidden md:flex absolute left-1/2 top-0 bottom-0 -translate-x-1/2 flex-col items-center pointer-events-none z-30">
                <div className="flex-1 w-px bg-[#2b2925]" />
                <div className="my-3 w-12 h-12 bg-[#0f0e0d] border border-[#E84B1C] flex items-center justify-center rotate-45">
                  <span
                    className="-rotate-45 text-[13px] text-[#E84B1C]"
                    style={{ fontFamily: "'Archivo Black', sans-serif" }}
                  >
                    VS
                  </span>
                </div>
                <div className="flex-1 w-px bg-[#2b2925]" />
              </div>

              <ArtifactPanel data={ARTIFACTS.right} side="right" activeSpec={activeSpec} />
            </div>

            {/* verdict strip */}
            <div className="mt-10 border border-[#2b2925] bg-[#141312] grid grid-cols-1 md:grid-cols-3">
              <div className="p-5 border-b md:border-b-0 md:border-r border-[#2b2925]">
                <p className="font-mono text-[9px] tracking-[0.3em] text-[#7a756b] mb-2">
                  CRAFT HOURS DELTA
                </p>
                <p
                  className="text-2xl text-[#e8e4dc]"
                  style={{ fontFamily: "'Archivo Black', sans-serif" }}
                >
                  +6.5 HRS{' '}
                  <span className="text-sm text-[#D9A441] font-mono tracking-normal">
                    GANTRY HIGH
                  </span>
                </p>
              </div>
              <div className="p-5 border-b md:border-b-0 md:border-r border-[#2b2925]">
                <p className="font-mono text-[9px] tracking-[0.3em] text-[#7a756b] mb-2">
                  SCAN FIDELITY EDGE
                </p>
                <p
                  className="text-2xl text-[#e8e4dc]"
                  style={{ fontFamily: "'Archivo Black', sans-serif" }}
                >
                  0.02 MM{' '}
                  <span className="text-sm text-[#E84B1C] font-mono tracking-normal">
                    FOUNDRY RUNNER
                  </span>
                </p>
              </div>
              <div className="p-5">
                <p className="font-mono text-[9px] tracking-[0.3em] text-[#7a756b] mb-2">
                  SCARCITY RATIO
                </p>
                <p
                  className="text-2xl text-[#e8e4dc]"
                  style={{ fontFamily: "'Archivo Black', sans-serif" }}
                >
                  80 : 120{' '}
                  <span className="text-sm text-[#9a948a] font-mono tracking-normal">EDITIONS</span>
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}