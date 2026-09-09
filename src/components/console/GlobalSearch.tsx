'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Bookmark, CornerDownLeft, Search, Settings2, Sword, Users, X } from 'lucide-react';
import { searchGlobal, type SearchDestination } from './search';

export function GlobalSearch({ weapon, isAdmin, onSelect }: {
  weapon: string;
  isAdmin: boolean;
  onSelect: (destination: SearchDestination) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [shortcut, setShortcut] = useState('Ctrl K');
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const { results, total } = useMemo(() => searchGlobal(query, { weapon, isAdmin }), [query, weapon, isAdmin]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  useLayoutEffect(() => {
    if (!open) return;
    const fitPanel = () => {
      if (!panel.current) return;
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      panel.current.style.maxHeight = `${Math.max(0, bottom - panel.current.getBoundingClientRect().top - 12)}px`;
    };
    fitPanel();
    window.addEventListener('resize', fitPanel);
    window.visualViewport?.addEventListener('resize', fitPanel);
    window.visualViewport?.addEventListener('scroll', fitPanel);
    return () => {
      window.removeEventListener('resize', fitPanel);
      window.visualViewport?.removeEventListener('resize', fitPanel);
      window.visualViewport?.removeEventListener('scroll', fitPanel);
    };
  }, [open]);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘ K');
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey &&
        !(event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"]'))) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  useEffect(() => {
    if (open) list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, query]);

  const choose = (destination: SearchDestination) => {
    setOpen(false);
    setQuery('');
    setActive(0);
    onSelect(destination);
  };

  return <div className="global-search" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className={`global-search-field${open ? ' is-open' : ''}`}>
      <Search size={15} aria-hidden="true" />
      <input ref={input} role="combobox" aria-label="Global search" placeholder="Search everywhere…"
        aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-results` : undefined}
        aria-activedescendant={open && results.length ? `${id}-${activeIndex}` : undefined}
        aria-describedby={open ? `${id}-hint` : undefined} autoComplete="off" spellCheck={false}
        value={query} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            if (results.length) setActive(open ? (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0);
          }
          if (event.key === 'Enter' && open && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); }
        }} />
      {query ? <button className="global-search-clear" aria-label="Clear search" onClick={() => {
        setQuery(''); setActive(0); input.current?.focus();
      }}><X size={13} /></button> : <kbd className="global-search-shortcut" aria-hidden="true">{shortcut}</kbd>}
    </div>
    {open && <div className="global-search-panel" ref={panel}>
      <div className="global-search-heading"><strong>{query.trim() ? 'Search results' : 'Go to…'}</strong><span>Entire workspace</span></div>
      <div className="global-search-results" role="listbox" aria-label="Search results" id={`${id}-results`} ref={list}>
        {results.map((result, index) => {
          const Icon = result.tab === 'weapons' ? Sword : result.tab === 'presets' ? Bookmark : result.tab === 'users' ? Users : Settings2;
          return <div role="option" id={`${id}-${index}`} key={result.id} aria-selected={activeIndex === index}
            className="global-search-result" onPointerMove={() => setActive(index)}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(result)}>
            <Icon size={16} aria-hidden="true" /><div><span className={result.configKey ? 'mono' : ''}>{result.label}</span><small>{result.path}</small></div><ArrowUpRight size={14} aria-hidden="true" />
          </div>;
        })}
      </div>
      {!results.length && <div className="global-search-empty"><Search size={22} aria-hidden="true" /><strong>No matches for “{query}”</strong><p>Try a weapon, group, or config key.</p></div>}
      <div className="global-search-status" role="status">{query.trim() ? total > results.length ? `Showing ${results.length} of ${total} matches. Add a weapon or attack type to narrow your search.` : `${total} result${total === 1 ? '' : 's'}` : 'Search character settings, weapons, config keys, and pages.'}</div>
      <div className="global-search-help" id={`${id}-hint`}><span><ArrowUp size={11} /><ArrowDown size={11} /> Navigate</span><span><CornerDownLeft size={12} /> Open</span><span><kbd>Esc</kbd> Close</span></div>
    </div>}
  </div>;
}
