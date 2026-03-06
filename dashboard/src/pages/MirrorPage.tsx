import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  ArrowLeft, Wifi, WifiOff, Circle, Square, MousePointer, Type,
  ArrowUp, ArrowDown, Home, CornerDownLeft, Save, X, Image,
  RotateCw, ChevronLeft, ChevronRight, Keyboard, ExternalLink,
  Globe, Layers,
} from 'lucide-react';

export default function MirrorPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<any>(null);
  const [status, setStatus] = useState<string>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [frame, setFrame] = useState<string>('');
  const [frameCount, setFrameCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedEvents, setRecordedEvents] = useState<any[]>([]);
  const [eventCount, setEventCount] = useState(0);

  const [navUrl, setNavUrl] = useState('');
  const [typeText, setTypeText] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveTags, setSaveTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [mirrorFocused, setMirrorFocused] = useState(false);

  // Page/popup tabs
  const [pages, setPages] = useState<{ id: string; title: string; url: string; isPopup?: boolean }[]>([]);
  const [activePageId, setActivePageId] = useState<string>('main');

  const imgRef = useRef<HTMLImageElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const platform = session?.platform || 'web';

  // --- WebSocket connection ---
  useEffect(() => {
    if (!sessionId) return;
    api.getDeviceSession(sessionId).then(setSession).catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:4000/ws/device`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setWsConnected(true); ws.send(JSON.stringify({ event: 'join', data: { sessionId } })); };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.event || msg.type;
        switch (type) {
          case 'frame': setFrame(msg.data); setFrameCount(c => c + 1); break;
          case 'status': setStatus(msg.data); break;
          case 'recorded_events': setRecordedEvents(msg.data || []); setEventCount(msg.data?.length || 0); setIsRecording(false); break;
          case 'event_count': setEventCount(msg.data || 0); break;
          case 'pages':
            setPages(msg.data || []);
            break;
        }
      } catch {}
    };
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    return () => { ws.close(); };
  }, [sessionId]);

  const sendWs = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: msg.type, data: msg.data }));
    }
  }, []);

  const sendAction = useCallback((action: any) => {
    sendWs({ type: 'action', data: action });
  }, [sendWs]);

  // --- Switch page/popup ---
  const switchPage = useCallback((pageId: string) => {
    setActivePageId(pageId);
    sendWs({ type: 'switch_page', data: { pageId } });
  }, [sendWs]);

  // --- Image coordinate helper (accounts for object-fit: contain letterboxing) ---
  const getImageCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const rect = img.getBoundingClientRect();

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const elemAspect = rect.width / rect.height;

    let renderedW: number, renderedH: number, offsetX: number, offsetY: number;
    if (imgAspect > elemAspect) {
      // image wider than element → letterbox top/bottom
      renderedW = rect.width;
      renderedH = rect.width / imgAspect;
      offsetX = 0;
      offsetY = (rect.height - renderedH) / 2;
    } else {
      // image taller than element → letterbox left/right
      renderedH = rect.height;
      renderedW = rect.height * imgAspect;
      offsetX = (rect.width - renderedW) / 2;
      offsetY = 0;
    }

    const relX = e.clientX - rect.left - offsetX;
    const relY = e.clientY - rect.top - offsetY;

    // ignore clicks outside the rendered image area
    if (relX < 0 || relX > renderedW || relY < 0 || relY > renderedH) return null;

    return {
      x: Math.round((relX / renderedW) * img.naturalWidth),
      y: Math.round((relY / renderedH) * img.naturalHeight),
    };
  }, []);

  // --- Mouse handlers: click/tap + drag-to-swipe + long press ---
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    const coords = getImageCoords(e);
    if (!coords) return;
    dragRef.current = { ...coords, time: Date.now() };

    if (platform !== 'web') {
      longPressTimerRef.current = setTimeout(() => {
        if (dragRef.current) {
          sendAction({ type: 'longPress', x: dragRef.current.x, y: dragRef.current.y, duration: 1500 });
          dragRef.current = null;
        }
      }, 600);
    }
  }, [getImageCoords, platform, sendAction]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    const start = dragRef.current;
    if (!start) return;
    dragRef.current = null;

    const coords = getImageCoords(e);
    if (!coords) return;

    const dist = Math.sqrt((coords.x - start.x) ** 2 + (coords.y - start.y) ** 2);

    if (platform !== 'web' && dist > 20) {
      sendAction({ type: 'swipe', x: start.x, y: start.y, endX: coords.x, endY: coords.y, duration: 300 });
    } else {
      sendAction({ type: platform === 'web' ? 'click' : 'tap', x: coords.x, y: coords.y });
    }
  }, [getImageCoords, platform, sendAction]);

  const handleMouseLeave = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    dragRef.current = null;
  }, []);

  // --- Keyboard capture ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    e.stopPropagation();

    const key = e.key;
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return;

    if (platform === 'web') {
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Control');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey && (parts.length > 0 || key.length > 1)) parts.push('Shift');
      const mapped = key === ' ' ? 'Space' : key;
      parts.push(mapped);
      sendAction({ type: 'keyboard', key: parts.length > 1 ? parts.join('+') : mapped });
    } else {
      if (key.length === 1 && !e.ctrlKey && !e.metaKey) {
        sendAction({ type: 'type', text: key });
      } else if (key === 'Backspace') {
        sendAction({ type: 'key', key: 'backspace' });
      } else if (key === 'Enter') {
        sendAction({ type: 'key', key: 'enter' });
      }
    }
  }, [platform, sendAction]);

  // --- Wheel → scroll ---
  useEffect(() => {
    const el = mirrorRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      sendAction({ type: 'scroll', deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY) });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [sendAction]);

  // --- Text input & navigation ---
  const handleNavigate = () => { if (navUrl) sendAction({ type: 'navigate', url: navUrl }); };
  const handleType = () => {
    if (!typeText) return;
    sendAction({ type: 'type', text: typeText });
    setTypeText('');
  };
  const handleKeyPress = (key: string) => sendAction({ type: 'keyboard', key });

  // --- Recording ---
  const handleStartRecording = () => { setIsRecording(true); setRecordedEvents([]); setEventCount(0); sendWs({ type: 'record_start' }); };
  const handleStopRecording = () => sendWs({ type: 'record_stop' });

  const handleSave = async () => {
    if (!sessionId || !saveName) return;
    setSaving(true);
    try {
      const tags = saveTags.split(',').map(t => t.trim()).filter(Boolean);
      await api.saveRecording(sessionId, { events: recordedEvents, name: saveName, tags });
      setShowSave(false); setSaveName(''); setSaveTags('');
      alert('Recording saved as scenario.');
    } catch (err: any) { alert(err.message); } finally { setSaving(false); }
  };

  const handleCloseSession = async () => {
    if (!sessionId || !confirm('Close this device session?')) return;
    try { await api.closeDeviceSession(sessionId); navigate('/devices'); } catch (err: any) { alert(err.message); }
  };

  // --- Styles ---
  const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';
  const btnClass = 'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors';
  const actionBtnClass = `${btnClass} w-full bg-card2 border border-border text-muted hover:text-white hover:border-border/80`;
  const keyBtnClass = 'px-2 py-1.5 bg-card2 border border-border rounded text-xs text-muted hover:text-white hover:border-border/80 transition-colors font-mono cursor-pointer';

  const platformLabel = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web';
  const platformColor = platform === 'ios' ? 'text-green-400' : platform === 'android' ? 'text-yellow-400' : 'text-blue-400';

  const activePage = pages.find(p => p.id === activePageId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/devices')} className="flex items-center gap-1 text-muted hover:text-white text-sm transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
          <span className="text-border">|</span>
          <span className={`text-sm font-medium ${platformColor}`}>{platformLabel}</span>
          <span className="text-sm text-muted font-mono">{sessionId?.slice(0, 12)}...</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>Status: <span className={status === 'active' || status === 'recording' ? 'text-green-400' : status === 'creating' ? 'text-yellow-400' : 'text-muted'}>{status}</span></span>
            <span><Image size={10} className="inline mr-1" />Frames: {frameCount}</span>
            {isRecording && <span className="text-red-400 font-medium animate-pulse">REC</span>}
            {mirrorFocused && <span className="text-accent"><Keyboard size={10} className="inline mr-1" />Keyboard Active</span>}
          </div>
          {wsConnected ? (
            <span className="flex items-center gap-1 text-green-400 text-xs"><Wifi size={12} /> Connected</span>
          ) : (
            <span className="flex items-center gap-1 text-red-400 text-xs"><WifiOff size={12} /> Disconnected</span>
          )}
        </div>
      </div>

      {/* Main: Screen + Right Panel (fill remaining height) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Live Screen */}
        <div className="flex-1 min-w-0 flex flex-col p-4 overflow-hidden">
          {/* Browser toolbar (web only) */}
          {platform === 'web' && (
            <div className="flex items-center gap-1.5 mb-2 bg-card rounded-lg border border-border px-2 py-1.5 flex-shrink-0">
              <button onClick={() => sendAction({ type: 'back' })} className="p-1.5 rounded hover:bg-card2 text-muted hover:text-white transition-colors" title="Back"><ChevronLeft size={14} /></button>
              <button onClick={() => sendAction({ type: 'forward' })} className="p-1.5 rounded hover:bg-card2 text-muted hover:text-white transition-colors" title="Forward"><ChevronRight size={14} /></button>
              <button onClick={() => sendAction({ type: 'refresh' })} className="p-1.5 rounded hover:bg-card2 text-muted hover:text-white transition-colors" title="Refresh"><RotateCw size={13} /></button>
              <div className="flex-1 flex gap-1.5">
                <input type="url" value={navUrl} onChange={(e) => setNavUrl(e.target.value)} placeholder="https://..." className="flex-1 px-2.5 py-1 bg-card2 border border-border rounded text-white text-xs focus:ring-1 focus:ring-accent outline-none" onKeyDown={(e) => e.key === 'Enter' && handleNavigate()} />
                <button onClick={handleNavigate} className="px-2.5 py-1 bg-accent text-white rounded text-xs hover:bg-accent-hover transition-colors">Go</button>
              </div>
            </div>
          )}

          {/* Page/Popup Tab Bar */}
          {pages.length > 1 && (
            <div className="flex items-center gap-1 mb-2 flex-shrink-0 overflow-x-auto">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => switchPage(page.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs border transition-colors flex-shrink-0 max-w-[200px] ${
                    activePageId === page.id
                      ? 'bg-card border-border border-b-card text-white'
                      : 'bg-card2 border-transparent text-muted hover:text-white hover:bg-card'
                  }`}
                  title={page.url}
                >
                  {page.isPopup ? <ExternalLink size={10} className="flex-shrink-0 text-yellow-400" /> : <Globe size={10} className="flex-shrink-0" />}
                  <span className="truncate">{page.title || (page.isPopup ? 'Popup' : 'Main Page')}</span>
                </button>
              ))}
            </div>
          )}

          {/* Popup notification banner (when popups exist but no tab bar) */}
          {pages.length <= 1 && pages.some(p => p.isPopup) && (
            <div className="flex items-center gap-2 mb-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 flex-shrink-0">
              <ExternalLink size={12} className="text-yellow-400 flex-shrink-0" />
              <span className="text-xs text-yellow-400">Popup detected — switching automatically</span>
            </div>
          )}

          {/* Mirror container */}
          <div
            ref={mirrorRef}
            tabIndex={0}
            className={`bg-card rounded-xl border overflow-hidden outline-none transition-colors flex-1 min-h-0 flex items-start justify-center ${mirrorFocused ? 'border-accent ring-1 ring-accent/30' : 'border-border'}`}
            onKeyDown={handleKeyDown}
            onFocus={() => setMirrorFocused(true)}
            onBlur={() => setMirrorFocused(false)}
          >
            {frame ? (
              <img
                ref={imgRef}
                src={`data:image/jpeg;base64,${frame}`}
                alt="Live screen"
                className="w-full h-full object-contain cursor-crosshair select-none"
                draggable={false}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <div className="flex items-center justify-center h-full w-full text-muted text-sm">
                <div className="text-center">
                  <MousePointer size={32} className="mx-auto mb-3 opacity-40" />
                  <p>{wsConnected ? 'Waiting for frames...' : 'Connecting to device...'}</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted mt-1.5 flex-shrink-0">
            {platform === 'web'
              ? 'Click to interact. Scroll with mouse wheel. Click the screen area and use keyboard for key input.'
              : 'Tap to interact. Drag to swipe. Hold 600ms for long press. Scroll with mouse wheel.'}
          </p>
        </div>

        {/* Right Panel: Actions + Recording */}
        <div className="w-72 flex-shrink-0 border-l border-border flex flex-col overflow-y-auto">
          {/* Actions Section */}
          <div className="p-4 border-b border-border">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              {platformLabel} Actions
            </h4>

            {/* Type Text */}
            <div className="mb-4">
              <label className="flex items-center gap-1 text-xs text-muted mb-1.5"><Type size={10} /> Type Text</label>
              <div className="flex gap-1.5">
                <input type="text" value={typeText} onChange={(e) => setTypeText(e.target.value)} placeholder="Enter text..." className={`${inputClass} text-xs`} onKeyDown={(e) => e.key === 'Enter' && handleType()} />
                <button onClick={handleType} className="px-2.5 py-2 bg-accent text-white rounded-lg text-xs hover:bg-accent-hover transition-colors flex-shrink-0">Send</button>
              </div>
            </div>

            {/* Quick Keyboard Shortcuts (Web) */}
            {platform === 'web' && (
              <div className="mb-4">
                <label className="flex items-center gap-1 text-xs text-muted mb-2"><Keyboard size={10} /> Quick Keys</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {[
                    ['Enter', 'Enter'], ['Tab', 'Tab'], ['Escape', 'Esc'],
                    ['Backspace', '\u232b'], ['Space', '\u2423'], ['Delete', 'Del'],
                  ].map(([key, label]) => (
                    <button key={key} onClick={() => handleKeyPress(key)} className={keyBtnClass}>{label}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {[
                    ['ArrowUp', '\u2191'], ['ArrowDown', '\u2193'], ['ArrowLeft', '\u2190'], ['ArrowRight', '\u2192'],
                  ].map(([key, label]) => (
                    <button key={key} onClick={() => handleKeyPress(key)} className={keyBtnClass}>{label}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    ['Control+a', 'Ctrl+A'], ['Control+c', 'Ctrl+C'],
                    ['Control+v', 'Ctrl+V'], ['Control+z', 'Ctrl+Z'],
                  ].map(([key, label]) => (
                    <button key={key} onClick={() => handleKeyPress(key)} className={keyBtnClass}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile: device buttons */}
            {(platform === 'ios' || platform === 'android') && (
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => sendAction({ type: 'back' })} className={actionBtnClass}><CornerDownLeft size={12} /> Back</button>
                <button onClick={() => sendAction({ type: 'home' })} className={actionBtnClass}><Home size={12} /> Home</button>
                <button onClick={() => sendAction({ type: 'scroll', deltaY: -300 })} className={actionBtnClass}><ArrowUp size={12} /> Scroll Up</button>
                <button onClick={() => sendAction({ type: 'scroll', deltaY: 300 })} className={actionBtnClass}><ArrowDown size={12} /> Scroll Dn</button>
              </div>
            )}

            {/* Web: scroll buttons */}
            {platform === 'web' && (
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => sendAction({ type: 'scroll', deltaY: -300 })} className={actionBtnClass}><ArrowUp size={12} /> Scroll Up</button>
                <button onClick={() => sendAction({ type: 'scroll', deltaY: 300 })} className={actionBtnClass}><ArrowDown size={12} /> Scroll Dn</button>
              </div>
            )}
          </div>

          {/* Pages/Popups Section */}
          <div className="p-4 border-b border-border">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Layers size={10} /> Pages
            </h4>
            {pages.length === 0 ? (
              <p className="text-[11px] text-muted">No page info available. Pages and popups will appear here when detected.</p>
            ) : (
              <div className="space-y-1">
                {pages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => switchPage(page.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors border ${
                      activePageId === page.id
                        ? 'bg-accent/15 border-accent/30 text-white'
                        : 'bg-card2 border-border text-muted hover:text-white hover:border-border/80'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {page.isPopup ? <ExternalLink size={10} className="text-yellow-400 flex-shrink-0" /> : <Globe size={10} className="flex-shrink-0" />}
                      <span className="truncate font-medium">{page.title || (page.isPopup ? 'Popup' : 'Main Page')}</span>
                    </div>
                    {page.url && <p className="text-[10px] text-muted/70 truncate mt-0.5 pl-4">{page.url}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recording Section */}
          <div className="p-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Recording</h4>
              <span className="text-[10px] text-muted">Events: {eventCount}</span>
            </div>

            {isRecording && (
              <div className="flex items-center gap-1.5 mb-3 text-red-400 text-xs font-medium animate-pulse">
                <Circle size={8} fill="currentColor" /> Recording...
              </div>
            )}

            <div className="mb-3">
              {!isRecording ? (
                <button onClick={handleStartRecording} disabled={!wsConnected} className={`${btnClass} w-full bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50`}>
                  <Circle size={12} fill="currentColor" /> Start Recording
                </button>
              ) : (
                <button onClick={handleStopRecording} className={`${btnClass} w-full bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25`}>
                  <Square size={12} /> Stop
                </button>
              )}
            </div>

            {recordedEvents.length > 0 && (
              <div className="flex-1 min-h-0 flex flex-col mb-3">
                <span className="text-[10px] text-muted mb-1 flex-shrink-0">Recorded ({recordedEvents.length})</span>
                <pre className="bg-card2 rounded-lg border border-border p-2 text-[10px] text-white font-mono overflow-auto flex-1 min-h-0">
                  {JSON.stringify(recordedEvents, null, 2)}
                </pre>
              </div>
            )}

            {/* Bottom actions */}
            <div className="mt-auto space-y-2 flex-shrink-0">
              {recordedEvents.length > 0 && (
                <button onClick={() => setShowSave(true)} className={`${btnClass} w-full bg-accent text-white hover:bg-accent-hover`}>
                  <Save size={14} /> Save as Scenario
                </button>
              )}
              <button onClick={handleCloseSession} className={`${btnClass} w-full border border-red-500/30 text-red-400 hover:bg-red-500/15`}>
                <X size={14} /> Close Session
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {showSave && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSave(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">Save Recording as Scenario</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Scenario Name</label>
                <input value={saveName} onChange={(e) => setSaveName(e.target.value)} className={inputClass} placeholder="e.g. Login Flow Recording" required />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Tags (comma-separated)</label>
                <input value={saveTags} onChange={(e) => setSaveTags(e.target.value)} className={inputClass} placeholder={`e.g. login, smoke, ${platform}`} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Preview</label>
                <div className="bg-card2 rounded-lg border border-border p-3 text-[11px] text-muted">
                  {recordedEvents.length} event(s) recorded on {platformLabel}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowSave(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving || !saveName} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Scenario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
