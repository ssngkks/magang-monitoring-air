import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Node } from '../lib/api';
import { getNodeCode, getNodeLocation, isNodeOnline } from '../lib/nodes';

interface NodeSelectorProps {
  nodes: Node[];
  value: string | null;
  onChange: (id: string) => void;
  id?: string;
  className?: string;
}

export function NodeSelector({ nodes, value, onChange, id = 'node-selector', className = '' }: NodeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = nodes.find((n) => String(n.id) === value) ?? null;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? nodes.filter((n) =>
        [n.kode_node, (n as any).device_name, n.nama_lokasi]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      )
    : nodes;

  const dotClass = (online: boolean) => (online ? 'bg-green-500' : 'bg-gray-400');

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <span className="sr-only">
        <label htmlFor={id}>Pilih node</label>
      </span>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full sm:w-64 items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-mono hover:border-blue-400 transition"
      >
        <span className="flex items-center gap-2 truncate">
          {selected ? (
            <>
              <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotClass(isNodeOnline(selected))}`} />
              <span className="truncate">{getNodeCode(selected)}</span>
              <span className="hidden md:inline text-[10px] font-sans font-normal text-gray-400 truncate">
                {(selected as any).device_name ? `${(selected as any).device_name} • ` : ''}{getNodeLocation(selected)}
              </span>
            </>
          ) : (
            <span className="text-gray-400">Pilih node…</span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full sm:w-72 max-h-72 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode / nama / lokasi…"
              className="w-full bg-transparent text-xs text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-[11px] text-gray-400">Tidak ada node cocok.</li>
            )}
            {filtered.map((n) => {
              const online = isNodeOnline(n);
              const active = String(n.id) === value;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(String(n.id));
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-950/40 transition ${
                      active ? 'bg-blue-50/60 dark:bg-blue-950/40' : ''
                    }`}
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotClass(online)}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold font-mono text-gray-900 dark:text-white truncate">
                        {getNodeCode(n)}
                      </span>
                      <span className="block text-[10px] text-gray-400 truncate">
                        {(n as any).device_name ? `${(n as any).device_name} — ` : ''}{getNodeLocation(n)} —{' '}
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </span>
                    {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
